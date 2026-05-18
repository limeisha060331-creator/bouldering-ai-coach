"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PulseButton } from "@/components/pulse-button";
import { VideoThumbnail } from "@/components/video-thumbnail";
import { HistoryList } from "@/components/history-list";
import {
  captureVideoThumbnail,
  listAnalysisRecords,
  saveAnalysisRecord,
} from "@/lib/analysis-db";
import {
  MAX_ANALYZE_BYTES,
  MAX_SOURCE_BYTES,
  prepareVideoForUpload,
} from "@/lib/compress-video";
import { parseAnalysis } from "@/lib/parse-analysis";
import {
  AnalysisPollError,
  pollUntilComplete,
} from "@/lib/poll-analysis";
import type { AnalysisRecord } from "@/lib/types";

export default function Home() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [originalFile, setOriginalFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [compressing, setCompressing] = useState(false);
  const [compressHint, setCompressHint] = useState<string | null>(null);
  const [compressInfo, setCompressInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [progressHint, setProgressHint] = useState<string | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [retryable, setRetryable] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [history, setHistory] = useState<AnalysisRecord[]>([]);

  const loadHistory = useCallback(async () => {
    try {
      const list = await listAnalysisRecords();
      setHistory(list);
    } catch {
      /* indexedDB unavailable */
    }
  }, []);

  useEffect(() => {
    loadHistory();
    return () => {
      if (preview) URL.revokeObjectURL(preview);
      abortRef.current?.abort();
    };
  }, [preview, loadHistory]);

  async function processSelectedFile(selected: File) {
    setError(null);
    setRetryable(false);
    setCompressInfo(null);

    if (!selected.type.startsWith("video/")) {
      setError("请选择视频文件（如 mp4、webm、mov）");
      return;
    }

    if (selected.size > MAX_SOURCE_BYTES) {
      setError(
        `视频超过 ${MAX_SOURCE_BYTES / 1024 / 1024}MB，请先裁剪后再上传`
      );
      return;
    }

    setOriginalFile(selected);
    setCompressing(true);
    setCompressHint("正在检查视频大小…");

    try {
      const result = await prepareVideoForUpload(selected, (msg, pct) => {
        setCompressHint(msg);
        if (pct != null) setCompressHint(`${msg} (${Math.round(pct)}%)`);
      });

      setFile(result.file);
      if (preview) URL.revokeObjectURL(preview);
      setPreview(URL.createObjectURL(result.file));

      if (result.compressed) {
        setCompressInfo(
          `已智能压缩：${(result.originalSize / 1024 / 1024).toFixed(1)}MB → ${(result.finalSize / 1024 / 1024).toFixed(1)}MB`
        );
      } else {
        setCompressInfo(
          `原始大小 ${(result.finalSize / 1024 / 1024).toFixed(1)}MB，无需压缩`
        );
      }
    } catch (e) {
      setFile(null);
      setOriginalFile(null);
      if (preview) URL.revokeObjectURL(preview);
      setPreview(null);
      setError(e instanceof Error ? e.message : "压缩失败");
    } finally {
      setCompressing(false);
      setCompressHint(null);
    }
  }

  function selectFile(selected: File | undefined) {
    if (!selected) {
      setFile(null);
      setOriginalFile(null);
      if (preview) URL.revokeObjectURL(preview);
      setPreview(null);
      setCompressInfo(null);
      return;
    }
    void processSelectedFile(selected);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    selectFile(e.target.files?.[0]);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    selectFile(e.dataTransfer.files?.[0]);
  }

  async function runAnalysis() {
    if (!file) {
      setError("请先选择视频");
      return;
    }

    if (file.size > MAX_ANALYZE_BYTES) {
      setError("视频仍超过 10MB，请重新选择或等待压缩完成");
      return;
    }

    setLoading(true);
    setError(null);
    setRetryable(false);
    setProgressHint("正在上传视频…");
    setElapsedSec(0);

    abortRef.current?.abort();
    abortRef.current = new AbortController();

    const formData = new FormData();
    formData.append("video", file);
    formData.append("compressed", String(file !== originalFile));
    formData.append(
      "originalSize",
      String(originalFile?.size ?? file.size)
    );

    try {
      const [res, thumbnail] = await Promise.all([
        fetch("/api/analyze", {
          method: "POST",
          body: formData,
          signal: abortRef.current.signal,
        }),
        captureVideoThumbnail(file).catch(() => ""),
      ]);

      let data = await res.json();

      if (!res.ok) {
        throw new AnalysisPollError(
          data.error || "分析失败",
          Boolean(data.retryable),
          0
        );
      }

      if (data.async && data.jobId) {
        const est = data.estimatedSeconds ?? 60;
        setProgressHint(
          data.message ??
            `已启动两阶段分析（预计 ${est} 秒内完成），请保持页面打开…`
        );

        data = await pollUntilComplete(data.jobId, {
          signal: abortRef.current.signal,
          onProgress: (status, hint, sec) => {
            setElapsedSec(sec);
            setProgressHint(`${hint}（${sec}s）`);
          },
        });
      }

      const parsed = parseAnalysis(data.analysis!);
      const record: AnalysisRecord = {
        id: data.id ?? data.jobId!,
        createdAt: new Date().toISOString(),
        fileName: originalFile?.name ?? file.name,
        thumbnail: thumbnail || preview || "",
        analysis: data.analysis!,
        score: parsed.score,
        highlight: parsed.highlight,
        segments: parsed.segments,
      };

      await saveAnalysisRecord(record, file);
      await loadHistory();
      router.push(`/analysis/${record.id}`);
    } catch (e) {
      if (e instanceof AnalysisPollError) {
        setError(e.message);
        setRetryable(e.retryable);
      } else if (e instanceof Error && e.name === "AbortError") {
        setError("已取消");
      } else {
        setError(e instanceof Error ? e.message : "请求失败");
        setRetryable(true);
      }
    } finally {
      setLoading(false);
      setProgressHint(null);
    }
  }

  return (
    <main className="gym-bg min-h-screen text-zinc-100">
      <div className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
        <header className="mb-8 text-center">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-orange-500/30 bg-orange-500/10 px-4 py-1 text-xs font-medium uppercase tracking-[0.2em] text-orange-400">
            <span className="h-1.5 w-1.5 rounded-full bg-orange-400 animate-pulse" />
            Boulder Gym · AI
          </div>
          <h1 className="text-3xl font-black tracking-tight sm:text-4xl">
            AI 抱石分析教练
          </h1>
          <p className="mt-2 text-sm text-zinc-500">
            支持大视频自动压缩 · Gemini 两阶段分析 · 云端轮询
          </p>
        </header>

        <section className="gym-panel rounded-2xl p-6">
          <label
            htmlFor="video-upload"
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            className={`flex min-h-[160px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-6 transition ${
              dragOver
                ? "border-orange-400 bg-orange-500/10"
                : "border-zinc-600/80 bg-zinc-900/50 hover:border-orange-500/50"
            } ${compressing ? "pointer-events-none opacity-60" : ""}`}
          >
            <span className="text-3xl" aria-hidden>
              🧗
            </span>
            <span className="mt-2 font-semibold text-zinc-200">
              {compressing ? "正在压缩视频…" : "点击或拖拽上传视频"}
            </span>
            <span className="mt-1 text-xs text-zinc-500">
              最大 {MAX_SOURCE_BYTES / 1024 / 1024}MB · 自动压缩至 10MB 以内
            </span>
          </label>
          <input
            id="video-upload"
            ref={inputRef}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={handleFileChange}
            disabled={compressing || loading}
          />

          {compressHint && (
            <p className="mt-3 text-center text-xs text-orange-300/90 animate-pulse">
              {compressHint}
            </p>
          )}

          {compressInfo && (
            <p className="mt-2 text-center text-xs text-zinc-500">
              {compressInfo}
            </p>
          )}

          <p className="mt-4 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2.5 text-xs leading-relaxed text-amber-200/80">
            <span className="font-semibold text-amber-400">教练提醒：</span>
            抱石视频建议只剪辑关键的「那一挂、那一蹿」，短视频分析更精准且不易出错哦（建议
            10MB 以内，最长 90 秒）。
          </p>

          {preview && file && (
            <div className="mt-4 flex justify-center">
              <VideoThumbnail src={preview} fileName={file.name} />
            </div>
          )}

          <div className="mt-6">
            <PulseButton
              onClick={runAnalysis}
              disabled={!file || compressing}
              loading={loading}
            >
              上传并分析
            </PulseButton>
          </div>

          {progressHint && loading && (
            <div className="mt-4 space-y-1 text-center">
              <p className="text-sm text-orange-300/90 animate-pulse">
                {progressHint}
              </p>
              {elapsedSec > 10 && (
                <p className="text-xs text-zinc-500">
                  Vercel 单次请求限 10 秒，已自动切换轮询模式，请耐心等待
                </p>
              )}
            </div>
          )}

          {error && (
            <div className="mt-4 space-y-2">
              <p
                role="alert"
                className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300"
              >
                {error}
              </p>
              {retryable && file && (
                <button
                  type="button"
                  onClick={runAnalysis}
                  className="w-full rounded-lg border border-orange-500/40 py-2 text-sm font-medium text-orange-300 transition hover:bg-orange-500/10"
                >
                  重新分析
                </button>
              )}
            </div>
          )}
        </section>

        <section className="mt-10">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-zinc-200">
            <span className="h-5 w-1 rounded-full bg-orange-500" />
            我的分析历史
          </h2>
          <HistoryList records={history} />
        </section>
      </div>
    </main>
  );
}
