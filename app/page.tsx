"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PulseButton } from "@/components/pulse-button";
import { VideoThumbnail } from "@/components/video-thumbnail";
import { HistoryList } from "@/components/history-list";
import {
  IconHistory,
  IconInfo,
  IconLoader,
  IconMountain,
  IconSparkles,
  IconUpload,
} from "@/components/icons";
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
          `已压缩：${(result.originalSize / 1024 / 1024).toFixed(1)}MB → ${(result.finalSize / 1024 / 1024).toFixed(1)}MB`
        );
      } else {
        setCompressInfo(
          `${(result.finalSize / 1024 / 1024).toFixed(1)}MB，无需压缩`
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
            `分析进行中（预计 ${est} 秒），请保持页面打开`
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
    <main className="spa-page">
      <div className="spa-container">
        <header className="mb-10 text-center sm:mb-12">
          <div className="mb-5 inline-flex items-center justify-center rounded-full border border-[var(--spa-border)] bg-[var(--spa-surface)] p-3 shadow-[var(--spa-shadow)]">
            <IconMountain className="h-6 w-6 text-[var(--spa-text-secondary)]" />
          </div>
          <p className="spa-label mb-3">Bouldering · AI Coach</p>
          <h1 className="text-2xl font-medium tracking-tight text-[var(--spa-text)] sm:text-3xl">
            抱石分析
          </h1>
          <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-[var(--spa-text-muted)]">
            上传攀爬片段，获得克制、专业的动作反馈
          </p>
        </header>

        <section className="spa-panel p-6 sm:p-8">
          <label
            htmlFor="video-upload"
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            className={`flex min-h-[11rem] cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed px-5 py-8 transition ${
              dragOver
                ? "border-[var(--spa-text-muted)] bg-[var(--spa-focus)]"
                : "border-[var(--spa-border)] bg-[var(--spa-elevated)] hover:border-[var(--spa-text-muted)]/50"
            } ${compressing ? "pointer-events-none opacity-50" : ""}`}
          >
            {compressing ? (
              <IconLoader className="mb-3 h-7 w-7 text-[var(--spa-text-muted)]" />
            ) : (
              <IconUpload className="mb-3 h-7 w-7 text-[var(--spa-text-secondary)]" />
            )}
            <span className="text-sm font-medium text-[var(--spa-text)]">
              {compressing ? "正在处理视频" : "点击或拖拽上传"}
            </span>
            <span className="mt-2 text-xs text-[var(--spa-text-muted)]">
              最大 {MAX_SOURCE_BYTES / 1024 / 1024}MB · 自动压缩至 10MB
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
            <p className="mt-4 flex items-center justify-center gap-2 text-center text-xs text-[var(--spa-text-secondary)]">
              <IconLoader className="h-3.5 w-3.5" />
              {compressHint}
            </p>
          )}

          {compressInfo && (
            <p className="mt-3 text-center text-xs text-[var(--spa-text-muted)]">
              {compressInfo}
            </p>
          )}

          <div className="mt-5 flex gap-3 rounded-xl border border-[var(--spa-border-subtle)] bg-[var(--spa-elevated)] px-4 py-3.5">
            <IconInfo className="mt-0.5 h-4 w-4 shrink-0 text-[var(--spa-text-muted)]" />
            <p className="text-xs leading-relaxed text-[var(--spa-text-secondary)]">
              建议只保留关键的一挂或一跃，10MB 以内、90 秒内的片段分析更精准。
            </p>
          </div>

          {preview && file && (
            <div className="mt-6 flex justify-center">
              <VideoThumbnail src={preview} fileName={file.name} />
            </div>
          )}

          <div className="mt-6">
            <PulseButton
              onClick={runAnalysis}
              disabled={!file || compressing}
              loading={loading}
            >
              <span className="inline-flex items-center justify-center gap-2">
                <IconSparkles className="h-4 w-4" />
                开始分析
              </span>
            </PulseButton>
          </div>

          {progressHint && loading && (
            <div className="mt-5 space-y-1.5 text-center">
              <p className="flex items-center justify-center gap-2 text-sm text-[var(--spa-text-secondary)]">
                <IconLoader className="h-4 w-4" />
                {progressHint}
              </p>
              {elapsedSec > 10 && (
                <p className="text-xs text-[var(--spa-text-muted)]">
                  分析在云端进行，请保持页面打开
                </p>
              )}
            </div>
          )}

          {error && (
            <div className="mt-5 space-y-3">
              <p
                role="alert"
                className="rounded-xl border border-[var(--spa-border)] bg-[var(--spa-elevated)] px-4 py-3 text-sm text-[var(--spa-text-secondary)]"
              >
                {error}
              </p>
              {retryable && file && (
                <button
                  type="button"
                  onClick={runAnalysis}
                  className="w-full rounded-xl border border-[var(--spa-border)] py-2.5 text-sm font-medium text-[var(--spa-text)] transition hover:bg-[var(--spa-focus)]"
                >
                  重新分析
                </button>
              )}
            </div>
          )}
        </section>

        <section className="mt-12 sm:mt-14">
          <div className="mb-5 flex items-center gap-2">
            <IconHistory className="h-4 w-4 text-[var(--spa-text-muted)]" />
            <h2 className="text-sm font-medium text-[var(--spa-text)]">
              分析历史
            </h2>
          </div>
          <HistoryList records={history} />
        </section>
      </div>
    </main>
  );
}
