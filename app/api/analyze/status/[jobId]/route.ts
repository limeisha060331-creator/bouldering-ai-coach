import { NextRequest, NextResponse } from "next/server";
import { getJob, hasBlobStorage } from "@/lib/analysis-jobs";
import { advanceAnalysisJob } from "@/lib/process-analysis-job";
import {
  getMemoryJob,
  isMemoryJobStoreEnabled,
} from "@/lib/job-memory-store";
import { logInfo } from "@/lib/gemini-log";

export const runtime = "nodejs";
export const maxDuration = 60;

const PHASE_MAP: Record<string, string> = {
  uploaded: "phase_upload",
  gemini_uploading: "phase1_gemini_upload",
  gemini_processing: "phase2_gemini_wait",
  analyzing: "phase2_gemini_analyze",
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
  _request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;

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

  if (
    job.status !== "completed" &&
    job.status !== "failed"
  ) {
    logInfo("status", `轮询推进 ${jobId} status=${job.status}`);
    try {
      await advanceAnalysisJob(jobId);
      job = (await loadJobRecord(jobId)) ?? job;
    } catch (err) {
      logInfo("status", `单步推进异常（下次轮询继续）`, err);
    }
  }

  return NextResponse.json({
    jobId: job.id,
    status: job.status,
    phase: PHASE_MAP[job.status] ?? job.status,
    analysis: job.analysis,
    error: job.error,
    updatedAt: job.updatedAt,
    retryable: job.status === "failed",
    vercelNote:
      job.status !== "completed" && job.status !== "failed"
        ? "采用短请求轮询以规避 Vercel 10 秒函数限制"
        : undefined,
  });
}
