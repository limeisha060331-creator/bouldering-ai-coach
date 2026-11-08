import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import {
  hasBlobStorage,
  saveJob,
  uploadFramesBlob,
  type AnalysisJob,
} from "@/lib/analysis-jobs";
import { schedulePipelineAdvance } from "@/lib/process-analysis-job";
import {
  isMemoryJobStoreEnabled,
  saveMemoryJob,
} from "@/lib/job-memory-store";
import {
  FRAME_PROMPT_VERSION,
  describeDeepSeekStatus,
  getDeepSeekModelId,
  isDeepSeekApiError,
  isDeepSeekEmptyAnalysisError,
  runDeepSeekAnalysis,
} from "@/lib/deepseek-analysis";
import { parseAnalyzeRequest } from "@/lib/analyze-request";
import { logError, logInfo } from "@/lib/log";
import { getUserFromRequest } from "@/lib/supabase/auth-server";
import {
  agentFallbackEnabled,
  getAgentRuntimeMode,
} from "@/lib/agent/runtime-flag";
import {
  AgentAnalysisError,
  runWebAgentAnalysis,
} from "@/lib/agent/web-runtime";

export const runtime = "nodejs";
export const maxDuration = 60;

function shouldUseAsyncPipeline(): boolean {
  return hasBlobStorage() || isMemoryJobStoreEnabled();
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  logInfo("POST", "收到分析请求", {
    vercel: process.env.VERCEL === "1",
    blob: hasBlobStorage(),
    memoryJobs: isMemoryJobStoreEnabled(),
    async: shouldUseAsyncPipeline(),
  });

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "未配置 DEEPSEEK_API_KEY。请在 .env.local / Vercel 环境变量中设置",
      },
      { status: 500 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "无法解析请求数据，请重新选择视频" },
      { status: 400 }
    );
  }

  const parsed = parseAnalyzeRequest(body);
  if (!parsed.ok) {
    return NextResponse.json(
      { error: parsed.error, retryable: false },
      { status: 400 }
    );
  }

  const { fileName, durationSec, frames, depth, locale } = parsed.value;
  const jobId = randomUUID();
  const now = new Date().toISOString();
  const model = getDeepSeekModelId();
  const runtimeMode = getAgentRuntimeMode();
  const user = await getUserFromRequest(request);
  if (!user) {
    return NextResponse.json(
      { error: "请先登录后再分析", code: "UNAUTHENTICATED" },
      { status: 401 }
    );
  }

  logInfo("POST", "关键帧已校验", {
    fileName,
    durationSec: Math.round(durationSec),
    frames: frames.length,
    depth,
    locale,
  });

  if (shouldUseAsyncPipeline()) {
    const job: AnalysisJob = {
      id: jobId,
      status: "uploaded",
      createdAt: now,
      updatedAt: now,
      statusSince: now,
      fileName,
      mimeType: "image/jpeg",
      frameCount: frames.length,
      durationSec,
      promptVersion: FRAME_PROMPT_VERSION,
      depth,
      locale,
      model,
      userId: user.id,
      pose: parsed.value.pose ?? undefined,
      grade: parsed.value.grade,
    };

    try {
      if (hasBlobStorage()) {
        job.framesBlobPath = await uploadFramesBlob(jobId, frames);
        await saveJob(job);
        logInfo("POST", `异步任务 ${jobId} → Vercel Blob`);
      } else {
        saveMemoryJob({ ...job, frames });
        logInfo("POST", `异步任务 ${jobId} → 内存任务表 (dev)`);
      }

      schedulePipelineAdvance(jobId);

      return NextResponse.json({
        id: jobId,
        jobId,
        async: true,
        status: "processing",
        phase: "frames_received",
        message:
          runtimeMode === "on"
            ? `已抽取 ${frames.length} 张关键帧，正在提交 Agent 分析…`
            : `已抽取 ${frames.length} 张关键帧，正在提交 DeepSeek 分析…`,
        runtime: runtimeMode === "on" ? "agent" : "legacy",
        estimatedSeconds: Math.min(180, 15 + frames.length * 3),
      });
    } catch (err) {
      logError("POST/async", err);
      return NextResponse.json(
        {
          error: `任务创建失败：${err instanceof Error ? err.message : "未知错误"}`,
        },
        { status: 500 }
      );
    }
  }

  logInfo(
    "POST",
    `无异步存储，同步调用${runtimeMode === "on" ? " Agent" : " DeepSeek"}（仅建议本地调试）`
  );

  try {
    let agentRecord: Awaited<
      ReturnType<typeof runWebAgentAnalysis>
    >["outcome"]["record"] | undefined;
    let agentError: string | undefined;

    if (runtimeMode === "on") {
      try {
        const result = await runWebAgentAnalysis({
          runId: jobId,
          userId: user.id,
          grade: parsed.value.grade,
          frames,
          pose: parsed.value.pose,
          durationSec,
          depth,
          locale,
          apiKey,
          model,
        });

        logInfo("POST", `同步 Agent 分析完成 ${Date.now() - startedAt}ms`, {
          steps: result.outcome.record.steps,
          attempts: result.outcome.record.attempts,
        });

        return NextResponse.json({
          id: jobId,
          jobId,
          async: false,
          status: "completed",
          analysis: result.analysis,
          model: result.outcome.record.model,
          usage: result.outcome.record.usage,
          agent: result.outcome.record,
          runtime: "agent",
        });
      } catch (err) {
        agentRecord =
          err instanceof AgentAnalysisError ? err.outcome.record : undefined;
        agentError = err instanceof Error ? err.message : String(err);
        logError("POST/sync/agent", err);

        const safetyBlocked =
          err instanceof AgentAnalysisError &&
          err.outcome.record.validation.codes.includes("E_SAFETY_BLOCKED");
        if (!agentFallbackEnabled() || safetyBlocked) {
          return NextResponse.json(
            {
              error: `Agent 分析失败：${agentError}`,
              agent: agentRecord,
              agentError,
              runtime: "agent",
              retryable: !safetyBlocked,
            },
            { status: safetyBlocked ? 422 : 500 }
          );
        }
        logInfo("POST", "同步 Agent 失败，回退单次 DeepSeek");
      }
    }

    const detail = await runDeepSeekAnalysis({
      apiKey,
      model,
      depth,
      locale,
      frames,
      maxAttempts: 1,
    });

    logInfo("POST", `同步分析完成 ${Date.now() - startedAt}ms`, {
      tokens: detail.usage?.totalTokens,
    });

    return NextResponse.json({
      id: jobId,
      jobId,
      async: false,
      status: "completed",
      analysis: detail.text,
      model: detail.modelId,
      usage: detail.usage,
      agent: agentRecord,
      agentError,
      runtime: "legacy",
    });
  } catch (err) {
    logError("POST/sync", err);
    if (isDeepSeekApiError(err)) {
      const { message, retryable } = describeDeepSeekStatus(
        err.status,
        err.message
      );
      return NextResponse.json(
        { error: err.status === 0 ? err.message : message, retryable },
        { status: err.status === 0 ? 503 : err.status }
      );
    }
    if (isDeepSeekEmptyAnalysisError(err)) {
      return NextResponse.json(
        { error: err.message, retryable: true },
        { status: 422 }
      );
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "分析失败" },
      { status: 500 }
    );
  }
}
