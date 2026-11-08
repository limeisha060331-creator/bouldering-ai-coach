import { NextRequest, NextResponse } from "next/server";
import { getJob, hasBlobStorage } from "@/lib/analysis-jobs";
import {
  recoverStaleJob,
  schedulePipelineAdvance,
} from "@/lib/process-analysis-job";
import {
  getMemoryJob,
  isMemoryJobStoreEnabled,
} from "@/lib/job-memory-store";
import { logInfo } from "@/lib/log";
import { getUserFromRequest } from "@/lib/supabase/auth-server";

export const runtime = "nodejs";
export const maxDuration = 60;

const PHASE_MAP: Record<string, string> = {
  uploaded: "phase_received",
  analyzing: "phase_analyze",
  rate_limited: "rate_limited",
  completed: "done",
  failed: "failed",
};

async function loadJobRecord(jobId: string) {
  if (isMemoryJobStoreEnabled()) {
    return getMemoryJob(jobId);
  }
  if (hasBlobStorage()) {
    return getJob(jobId);
  }
  return null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;

  const user = await getUserFromRequest(request);
  if (!user) {
    return NextResponse.json(
      { error: "请先登录后再查询分析状态" },
      { status: 401 }
    );
  }

  if (!hasBlobStorage() && !isMemoryJobStoreEnabled()) {
    return NextResponse.json(
      {
        error:
          "异步轮询需要 BLOB_READ_WRITE_TOKEN（Vercel Blob）。部署请在 Vercel Storage 中创建 Blob。",
      },
      { status: 503 }
    );
  }

  let job = await loadJobRecord(jobId);
  if (!job) {
    return NextResponse.json({ error: "任务不存在或已过期" }, { status: 404 });
  }
  if (job.userId !== user.id) {
    return NextResponse.json({ error: "任务不存在或已过期" }, { status: 404 });
  }

  if (job.status !== "completed" && job.status !== "failed") {
    try {
      if (await recoverStaleJob(jobId)) {
        job = (await loadJobRecord(jobId)) ?? job;
      }
    } catch (err) {
      logInfo("status", `卡死恢复异常 ${jobId}`, err);
    }

    logInfo("status", `轮询触发后台推进 ${jobId} status=${job.status}`);
    schedulePipelineAdvance(jobId);
  }

  const elapsedSinceCreate = Date.now() - new Date(job.createdAt).getTime();

  return NextResponse.json({
    jobId: job.id,
    status: job.status,
    phase: PHASE_MAP[job.status] ?? job.status,
    analysis: job.analysis,
    error: job.error,
    updatedAt: job.updatedAt,
    statusSince: job.statusSince,
    analysisStarted: job.analysisStarted ?? false,
    analysisAttempt: job.analysisAttempt,
    agentPhase: job.agentPhase,
    agent: job.agent,
    agentError: job.agentError,
    retryAfter: job.retryAfter,
    elapsedMs: elapsedSinceCreate,
    retryable:
      job.status === "rate_limited" ||
      job.status === "failed",
    vercelNote:
      job.status !== "completed" && job.status !== "failed"
        ? "采用短请求轮询以规避 Vercel 10 秒函数限制"
        : undefined,
  });
}
