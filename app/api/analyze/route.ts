import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { randomUUID } from "crypto";
import {
  hasBlobStorage,
  saveJob,
  uploadVideoBlob,
  type AnalysisJob,
} from "@/lib/analysis-jobs";
import { advanceAnalysisJob } from "@/lib/process-analysis-job";
import {
  isMemoryJobStoreEnabled,
  saveMemoryJob,
} from "@/lib/job-memory-store";
import {
  analyzeVideoInline,
  logGeminiError,
  logInfo,
  mapGeminiError,
} from "@/lib/gemini-analyze";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 10 * 1024 * 1024;

function useAsyncPipeline(): boolean {
  return hasBlobStorage() || isMemoryJobStoreEnabled();
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  logInfo("POST", "收到分析请求", {
    vercel: process.env.VERCEL === "1",
    region: process.env.VERCEL_REGION,
    blob: hasBlobStorage(),
    memoryJobs: isMemoryJobStoreEnabled(),
    async: useAsyncPipeline(),
  });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "未配置 GEMINI_API_KEY。请在 .env.local / Vercel 环境变量中设置",
      },
      { status: 500 }
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch (err) {
    logGeminiError("POST/formData", err);
    return NextResponse.json(
      { error: "无法解析上传数据，请确认视频已压缩到 10MB 以内。" },
      { status: 400 }
    );
  }

  const file = formData.get("video");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "请上传视频文件" }, { status: 400 });
  }

  if (!file.type.startsWith("video/")) {
    return NextResponse.json({ error: "仅支持视频格式" }, { status: 400 });
  }

  const originalSize = Number(formData.get("originalSize")) || file.size;
  const compressed = formData.get("compressed") === "true";

  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      {
        error: `视频仍为 ${(file.size / 1024 / 1024).toFixed(1)}MB，超过 10MB 上限。请等待前端压缩完成或手动剪辑。`,
      },
      { status: 413 }
    );
  }

  let buffer: Buffer;
  try {
    buffer = Buffer.from(await file.arrayBuffer());
    logInfo("POST", `视频已读取`, {
      size: buffer.length,
      type: file.type,
      compressed,
      originalSize,
    });
  } catch (err) {
    logGeminiError("POST/readBuffer", err);
    return NextResponse.json(
      { error: "读取视频失败，请换一个文件试试。" },
      { status: 400 }
    );
  }

  const jobId = randomUUID();
  const mimeType = file.type || "video/mp4";

  if (useAsyncPipeline()) {
    try {
      const job: AnalysisJob = {
        id: jobId,
        status: "uploaded",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        fileName: file.name,
        mimeType,
        originalSize,
        compressedSize: file.size,
      };

      if (hasBlobStorage()) {
        logInfo("POST", `异步模式 jobId=${jobId} → Vercel Blob`);
        job.videoBlobUrl = await uploadVideoBlob(jobId, buffer, mimeType);
        await saveJob(job);
      } else {
        logInfo("POST", `异步模式 jobId=${jobId} → 内存任务表 (dev)`);
        saveMemoryJob(job, buffer);
      }

      waitUntil(
        advanceAnalysisJob(jobId).catch((err) => {
          logGeminiError(`waitUntil/${jobId}`, err);
        })
      );

      logInfo("POST", `任务已创建，耗时 ${Date.now() - startedAt}ms`);

      return NextResponse.json({
        id: jobId,
        jobId,
        async: true,
        status: "processing",
        phase: "phase_upload",
        message:
          "视频已接收。将分两阶段处理：① 上传 Gemini ② 获取分析结论。请保持页面打开。",
        estimatedSeconds: Math.min(120, 30 + Math.ceil(file.size / (512 * 1024))),
      });
    } catch (err) {
      logGeminiError("POST/async", err);
      return NextResponse.json(
        {
          error: `任务创建失败：${err instanceof Error ? err.message : "未知错误"}`,
        },
        { status: 500 }
      );
    }
  }

  logInfo("POST", "无异步存储，同步两阶段（仅建议本地调试）");

  try {
    const analysis = await analyzeVideoInline(
      apiKey,
      buffer,
      mimeType,
      file.name
    );

    return NextResponse.json({
      id: jobId,
      jobId,
      async: false,
      status: "completed",
      analysis,
    });
  } catch (err) {
    logGeminiError("POST/sync", err);
    const { message, status } = mapGeminiError(err);
    return NextResponse.json(
      {
        error: message,
        retryable: status === 504 || status === 429,
      },
      { status }
    );
  }
}
