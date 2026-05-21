"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PulseButton } from "@/components/pulse-button";
import { VideoThumbnail } from "@/components/video-thumbnail";
import { HistoryList } from "@/components/history-list";
import {
  IconHistory,
  IconInfo,
  IconLoader,
  IconSparkles,
  IconUpload,
  IconX,
} from "@/components/icons";
import {
  captureVideoThumbnail,
  listAnalysisRecords,
  saveAnalysisRecord,
} from "@/lib/analysis-db";
import {
  MAX_ANALYZE_BYTES,
  MAX_ANALYZE_MB,
  MAX_SOURCE_BYTES,
  prepareVideoForUpload,
} from "@/lib/compress-video";
import {
  errorFromFetchJson,
  explainFetchError,
  readFetchJson,
} from "@/lib/fetch-json";
import { parseAnalysis } from "@/lib/parse-analysis";
import { AnalysisPollError, pollUntilComplete } from "@/lib/poll-analysis";
import type { AnalysisDepth, AnalysisLocale, AnalysisRecord } from "@/lib/types";
import { PROMPT_VERSION } from "@/lib/analyze-prompt";
import { STRINGS, formatStr } from "@/lib/strings";
import { useUiLocale } from "@/lib/use-ui-locale";
import { SiteNav } from "@/components/site-nav";

function pipelineStep(
  compressing: boolean,
  loading: boolean,
  pollStatus: string | null
): number {
  if (compressing) return 0;
  if (!loading) return -1;
  if (!pollStatus || pollStatus === "uploaded") return 1;
  if (
    pollStatus === "gemini_uploading" ||
    pollStatus === "gemini_processing"
  ) {
    return 2;
  }
  return 3;
}

export default function AnalyzePage() {
  const router = useRouter();
  const [uiLocale, setUiLocale] = useUiLocale();
  const t = STRINGS[uiLocale];
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
  const [pollStatus, setPollStatus] = useState<string | null>(null);
  const [retryAfterIso, setRetryAfterIso] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [retryable, setRetryable] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [history, setHistory] = useState<AnalysisRecord[]>([]);
  const [historyDbError, setHistoryDbError] = useState(false);
  const [depth, setDepth] = useState<AnalysisDepth>("deep");
  const [analysisLocale, setAnalysisLocale] = useState<AnalysisLocale>("zh");

  const [searchQ, setSearchQ] = useState("");
  const [datePreset, setDatePreset] = useState<"all" | "7" | "30">("all");
  const [scoreMin, setScoreMin] = useState("");
  const [scoreMax, setScoreMax] = useState("");

  const loadHistory = useCallback(async () => {
    try {
      setHistoryDbError(false);
      const list = await listAnalysisRecords();
      setHistory(list);
    } catch {
      setHistoryDbError(true);
      setHistory([]);
    }
  }, []);

  useEffect(() => {
    loadHistory();
    return () => {
      if (preview) URL.revokeObjectURL(preview);
      abortRef.current?.abort();
    };
  }, [preview, loadHistory]);

  useEffect(() => {
    if (!loading) return;
    const id = window.setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, [loading]);

  const retryDisplaySec =
    loading && retryAfterIso
      ? Math.max(
          0,
          Math.ceil(
            (new Date(retryAfterIso).getTime() - Date.now()) / 1000
          )
        )
      : null;

  const filteredHistory = useMemo(() => {
    const now = Date.now();
    const q = searchQ.trim().toLowerCase();
    const minN = scoreMin.trim() === "" ? null : Number(scoreMin);
    const maxN = scoreMax.trim() === "" ? null : Number(scoreMax);
    let from = 0;
    if (datePreset === "7") from = now - 7 * 86400000;
    if (datePreset === "30") from = now - 30 * 86400000;

    return history.filter((r) => {
      if (q && !r.fileName.toLowerCase().includes(q)) return false;
      if (datePreset !== "all") {
        if (new Date(r.createdAt).getTime() < from) return false;
      }
      if (minN != null && !Number.isNaN(minN)) {
        if (r.score == null || r.score < minN) return false;
      }
      if (maxN != null && !Number.isNaN(maxN)) {
        if (r.score == null || r.score > maxN) return false;
      }
      return true;
    });
  }, [history, searchQ, datePreset, scoreMin, scoreMax]);

  const activeStep = pipelineStep(compressing, loading, pollStatus);

  async function processSelectedFile(selected: File) {
    setError(null);
    setRetryable(false);
    setCompressInfo(null);

    if (!selected.type.startsWith("video/")) {
      setError(t.pickVideo);
      return;
    }

    if (selected.size > MAX_SOURCE_BYTES) {
      setError(
        `${formatStr(t.videoTooBig, { maxMb: MAX_SOURCE_BYTES / 1024 / 1024 })}?${t.videoTooBigHint}`
      );
      return;
    }

    setOriginalFile(selected);
    setCompressing(true);
    setCompressHint(uiLocale === "zh" ? "?????????" : "Checking video?");

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
          uiLocale === "zh"
            ? `????${(result.originalSize / 1024 / 1024).toFixed(1)}MB ? ${(result.finalSize / 1024 / 1024).toFixed(1)}MB`
            : `Compressed: ${(result.originalSize / 1024 / 1024).toFixed(1)}MB ? ${(result.finalSize / 1024 / 1024).toFixed(1)}MB`
        );
      } else {
        setCompressInfo(
          `${(result.finalSize / 1024 / 1024).toFixed(1)}MB` +
            (uiLocale === "zh" ? "?????" : ", no compression needed")
        );
      }
    } catch (e) {
      setFile(null);
      setOriginalFile(null);
      if (preview) URL.revokeObjectURL(preview);
      setPreview(null);
      setError(e instanceof Error ? e.message : uiLocale === "zh" ? "????" : "Compression failed");
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
      if (inputRef.current) inputRef.current.value = "";
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

  function cancelAnalysis() {
    abortRef.current?.abort();
  }

  async function runAnalysis() {
    if (!file) {
      setError(t.needVideo);
      return;
    }

    if (file.size > MAX_ANALYZE_BYTES) {
      setError(formatStr(t.stillLarge, { analyzeMb: MAX_ANALYZE_MB }));
      return;
    }

    setLoading(true);
    setError(null);
    setRetryable(false);
    setProgressHint(uiLocale === "zh" ? "???????" : "Uploading?");
    setElapsedSec(0);
    setPollStatus(null);
    setRetryAfterIso(null);

    abortRef.current?.abort();
    abortRef.current = new AbortController();

    const formData = new FormData();
    formData.append("video", file);
    formData.append("compressed", String(file !== originalFile));
    formData.append(
      "originalSize",
      String(originalFile?.size ?? file.size)
    );
    formData.append("depth", depth);
    formData.append("locale", analysisLocale);

    try {
      const [res, thumbnail] = await Promise.all([
        fetch("/api/analyze", {
          method: "POST",
          body: formData,
          signal: abortRef.current.signal,
        }),
        captureVideoThumbnail(file).catch(() => ""),
      ]);

      type AnalyzePostJson = {
        error?: string;
        retryable?: boolean;
        async?: boolean;
        jobId?: string;
        id?: string;
        estimatedSeconds?: number;
        message?: string;
        analysis?: string;
      };

      const parsedRes = await readFetchJson<AnalyzePostJson>(res);
      if (parsedRes.parseError || !parsedRes.ok || !parsedRes.data) {
        const { message, retryable } = errorFromFetchJson(
          parsedRes,
          uiLocale === "zh" ? "????" : "Analysis failed"
        );
        throw new AnalysisPollError(message, retryable, 0);
      }

      let data = parsedRes.data;

      if (data.async && data.jobId) {
        setPollStatus("uploaded");
        const est = data.estimatedSeconds ?? 60;
        setProgressHint(
          data.message ??
            (uiLocale === "zh"
              ? `???????? ${est} ??????????`
              : `In progress (~${est}s). Keep this tab open.`)
        );

        data = await pollUntilComplete(data.jobId, {
          signal: abortRef.current.signal,
          locale: uiLocale,
          onProgress: (status, hint, sec, meta) => {
            setElapsedSec(sec);
            setPollStatus(status);
            setProgressHint(`${hint}?${sec}s?`);
            if (meta?.retryAfter) {
              setRetryAfterIso(meta.retryAfter);
            } else if (status !== "rate_limited") {
              setRetryAfterIso(null);
            }
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
        promptVersion: PROMPT_VERSION,
        depth,
        locale: analysisLocale,
        bookmarkedSegmentIndices: [],
      };

      await saveAnalysisRecord(record, file);
      await loadHistory();
      router.push(`/analysis/${record.id}`);
    } catch (e) {
      if (e instanceof AnalysisPollError) {
        if (e.message === "???") {
          setError(`${t.canceled} ${t.canceledHint}`);
        } else {
          setError(e.message);
        }
        setRetryable(e.retryable);
      } else if (e instanceof Error && e.name === "AbortError") {
        setError(`${t.canceled} ${t.canceledHint}`);
      } else {
        const { message, retryable } = explainFetchError(e, uiLocale);
        if (message === (uiLocale === "zh" ? "???" : "Canceled")) {
          setError(`${t.canceled} ${t.canceledHint}`);
        } else {
          setError(message);
        }
        setRetryable(retryable);
      }
    } finally {
      setLoading(false);
      setProgressHint(null);
      setPollStatus(null);
      setRetryAfterIso(null);
    }
  }

  const emptyHistoryTitle =
    history.length === 0 ? t.historyEmpty : t.historyNoMatch;
  const emptyHistoryHint =
    history.length === 0 ? t.historyEmptyHint : t.historyNoMatchHint;

  return (
    <main className="crux-page">
      <div className="crux-container-narrow">
        <SiteNav uiLocale={uiLocale} />
        <header className="mb-8 border-2 border-[var(--crux-border)] bg-[var(--crux-surface)] p-6 shadow-[4px_4px_0_var(--crux-border)]">
          <p className="spa-label mb-2">{t.brand}</p>
          <h1 className="text-2xl font-black uppercase tracking-tight text-[var(--crux-text)] sm:text-3xl">
            {t.title}
          </h1>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-[var(--crux-text-muted)]">
            {t.subtitle}
          </p>
          <div className="mt-5 border-2 border-[var(--crux-border-subtle)] bg-[var(--crux-elevated)] px-4 py-3">
            <p className="text-xs font-bold uppercase text-[var(--crux-text)]">
              {t.expectTitle}
            </p>
            <p className="mt-2 text-xs leading-relaxed text-[var(--crux-text-muted)]">
              {t.expectBody}
            </p>
          </div>
        </header>

        <section className="spa-panel p-6 sm:p-8">
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
            <div>
              <p className="spa-label mb-2">{t.uiLangLabel}</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setUiLocale("zh")}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                    uiLocale === "zh"
                      ? "border-[var(--spa-text)] bg-[var(--spa-focus)] text-[var(--spa-text)]"
                      : "border-[var(--spa-border)] text-[var(--spa-text-secondary)] hover:bg-[var(--spa-elevated)]"
                  }`}
                >
                  {t.uiLangZh}
                </button>
                <button
                  type="button"
                  onClick={() => setUiLocale("en")}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                    uiLocale === "en"
                      ? "border-[var(--spa-text)] bg-[var(--spa-focus)] text-[var(--spa-text)]"
                      : "border-[var(--spa-border)] text-[var(--spa-text-secondary)] hover:bg-[var(--spa-elevated)]"
                  }`}
                >
                  {t.uiLangEn}
                </button>
              </div>
            </div>
            <div>
              <p className="spa-label mb-2">{t.depthLabel}</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setDepth("light")}
                  className={`rounded-lg border px-3 py-1.5 text-left text-xs transition ${
                    depth === "light"
                      ? "border-[var(--spa-text)] bg-[var(--spa-focus)]"
                      : "border-[var(--spa-border)] hover:bg-[var(--spa-elevated)]"
                  }`}
                >
                  <span className="font-medium text-[var(--spa-text)]">
                    {t.depthLight}
                  </span>
                  <span className="ml-1 text-[var(--spa-text-muted)]">
                    ? {t.depthLightDesc}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setDepth("deep")}
                  className={`rounded-lg border px-3 py-1.5 text-left text-xs transition ${
                    depth === "deep"
                      ? "border-[var(--spa-text)] bg-[var(--spa-focus)]"
                      : "border-[var(--spa-border)] hover:bg-[var(--spa-elevated)]"
                  }`}
                >
                  <span className="font-medium text-[var(--spa-text)]">
                    {t.depthDeep}
                  </span>
                  <span className="ml-1 text-[var(--spa-text-muted)]">
                    ? {t.depthDeepDesc}
                  </span>
                </button>
              </div>
            </div>
            <div>
              <p className="spa-label mb-2">{t.analysisOutputLang}</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setAnalysisLocale("zh")}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                    analysisLocale === "zh"
                      ? "border-[var(--spa-text)] bg-[var(--spa-focus)] text-[var(--spa-text)]"
                      : "border-[var(--spa-border)] text-[var(--spa-text-secondary)] hover:bg-[var(--spa-elevated)]"
                  }`}
                >
                  {t.analysisOutputZh}
                </button>
                <button
                  type="button"
                  onClick={() => setAnalysisLocale("en")}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                    analysisLocale === "en"
                      ? "border-[var(--spa-text)] bg-[var(--spa-focus)] text-[var(--spa-text)]"
                      : "border-[var(--spa-border)] text-[var(--spa-text-secondary)] hover:bg-[var(--spa-elevated)]"
                  }`}
                >
                  {t.analysisOutputEn}
                </button>
              </div>
            </div>
          </div>

          {activeStep >= 0 && (
            <div className="mb-6 no-print">
              <ol className="grid grid-cols-4 gap-2 text-center">
                {t.steps.map((label, i) => (
                  <li key={label}>
                    <div
                      className={`mx-auto mb-1.5 flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium ${
                        activeStep === i
                          ? "bg-[var(--spa-text)] text-white"
                          : activeStep > i
                            ? "border border-[var(--spa-border)] bg-[var(--spa-elevated)] text-[var(--spa-text-muted)]"
                            : "border border-[var(--spa-border-subtle)] text-[var(--spa-text-muted)]"
                      }`}
                    >
                      {i + 1}
                    </div>
                    <span className="text-[10px] leading-tight text-[var(--spa-text-muted)] sm:text-xs">
                      {label}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          )}

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
              {compressing ? t.uploadCompress : t.uploadIdle}
            </span>
            <span className="mt-2 text-xs text-[var(--spa-text-muted)]">
              {formatStr(t.uploadHint, {
                maxMb: MAX_SOURCE_BYTES / 1024 / 1024,
                analyzeMb: MAX_ANALYZE_MB,
              })}
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
            <div>
              <p className="text-xs font-medium text-[var(--spa-text)]">
                {t.tipTitle}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-[var(--spa-text-secondary)]">
                {t.tipBody}
              </p>
            </div>
          </div>

          {preview && file && (
            <div className="mt-6 flex justify-center">
              <VideoThumbnail src={preview} fileName={file.name} />
            </div>
          )}

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <div className="flex-1">
              <PulseButton
                onClick={runAnalysis}
                disabled={!file || compressing}
                loading={loading}
              >
                <span className="inline-flex items-center justify-center gap-2">
                  <IconSparkles className="h-4 w-4" />
                  {t.startAnalysis}
                </span>
              </PulseButton>
            </div>
            {loading && (
              <button
                type="button"
                onClick={cancelAnalysis}
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-[var(--spa-border)] px-4 py-3 text-sm font-medium text-[var(--spa-text-secondary)] transition hover:bg-[var(--spa-elevated)]"
              >
                <IconX className="h-4 w-4" />
                {t.cancelAnalysis}
              </button>
            )}
          </div>

          {progressHint && loading && (
            <div className="mt-5 space-y-1.5 text-center">
              <p className="flex items-center justify-center gap-2 text-sm text-[var(--spa-text-secondary)]">
                <IconLoader className="h-4 w-4" />
                {progressHint}
              </p>
              {retryDisplaySec != null && retryDisplaySec > 0 && (
                <p
                  key={tick}
                  className="text-xs text-[var(--spa-text-muted)]"
                >
                  {t.rateLimitWait(retryDisplaySec)}
                </p>
              )}
              {elapsedSec > 10 && (
                <p className="text-xs text-[var(--spa-text-muted)]">
                  {uiLocale === "zh"
                    ? "???????????????"
                    : "Analysis runs in the cloud?keep this tab open."}
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
                <div className="flex flex-col gap-2 sm:flex-row">
                  <button
                    type="button"
                    onClick={runAnalysis}
                    className="flex-1 rounded-xl border border-[var(--spa-border)] py-2.5 text-sm font-medium text-[var(--spa-text)] transition hover:bg-[var(--spa-focus)]"
                  >
                    {t.retrySameVideo}
                  </button>
                  <button
                    type="button"
                    onClick={() => selectFile(undefined)}
                    className="flex-1 rounded-xl border border-[var(--spa-border)] py-2.5 text-sm font-medium text-[var(--spa-text-secondary)] transition hover:bg-[var(--spa-elevated)]"
                  >
                    {t.rechooseFile}
                  </button>
                </div>
              )}
            </div>
          )}
        </section>

        <section className="mt-12 sm:mt-14">
          <div className="mb-5 flex items-center gap-2">
            <IconHistory className="h-4 w-4 text-[var(--spa-text-muted)]" />
            <h2 className="text-sm font-medium text-[var(--spa-text)]">
              {t.historyTitle}
            </h2>
          </div>

          {historyDbError && (
            <div className="mb-4 rounded-xl border border-[var(--spa-border)] bg-[var(--spa-elevated)] px-4 py-3 text-xs leading-relaxed text-[var(--spa-text-secondary)]">
              <p className="font-medium text-[var(--spa-text)]">
                {t.historyDbError}
              </p>
              <p className="mt-1 text-[var(--spa-text-muted)]">{t.historyDbHint}</p>
            </div>
          )}

          {!historyDbError && history.length > 0 && (
            <div className="mb-4 flex flex-col gap-3 rounded-xl border border-[var(--spa-border-subtle)] bg-[var(--spa-elevated)] p-4 sm:flex-row sm:flex-wrap sm:items-end">
              <div className="min-w-0 flex-1">
                <label className="spa-label mb-1 block">{t.historySearch}</label>
                <input
                  value={searchQ}
                  onChange={(e) => setSearchQ(e.target.value)}
                  className="w-full rounded-lg border border-[var(--spa-border)] bg-[var(--spa-surface)] px-3 py-2 text-sm text-[var(--spa-text)] outline-none focus:border-[var(--spa-text-muted)]"
                />
              </div>
              <div>
                <label className="spa-label mb-1 block">
                  {uiLocale === "zh" ? "??" : "Date"}
                </label>
                <select
                  value={datePreset}
                  onChange={(e) =>
                    setDatePreset(e.target.value as "all" | "7" | "30")
                  }
                  className="rounded-lg border border-[var(--spa-border)] bg-[var(--spa-surface)] px-3 py-2 text-sm text-[var(--spa-text)]"
                >
                  <option value="all">{t.historyDateAll}</option>
                  <option value="7">{t.historyDate7}</option>
                  <option value="30">{t.historyDate30}</option>
                </select>
              </div>
              <div className="flex gap-2">
                <div>
                  <label className="spa-label mb-1 block">{t.historyScoreMin}</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    placeholder="?"
                    value={scoreMin}
                    onChange={(e) => setScoreMin(e.target.value)}
                    className="w-20 rounded-lg border border-[var(--spa-border)] bg-[var(--spa-surface)] px-2 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="spa-label mb-1 block">{t.historyScoreMax}</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    placeholder="?"
                    value={scoreMax}
                    onChange={(e) => setScoreMax(e.target.value)}
                    className="w-20 rounded-lg border border-[var(--spa-border)] bg-[var(--spa-surface)] px-2 py-2 text-sm"
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSearchQ("");
                  setDatePreset("all");
                  setScoreMin("");
                  setScoreMax("");
                }}
                className="rounded-lg border border-[var(--spa-border)] px-3 py-2 text-xs font-medium text-[var(--spa-text-secondary)] hover:bg-[var(--spa-surface)]"
              >
                {t.historyClearFilters}
              </button>
            </div>
          )}

          <HistoryList
            records={filteredHistory}
            emptyTitle={emptyHistoryTitle}
            emptyHint={emptyHistoryHint}
          />
        </section>
      </div>
    </main>
  );
}
