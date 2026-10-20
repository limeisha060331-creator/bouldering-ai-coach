"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PulseButton } from "@/components/pulse-button";
import { VideoThumbnail } from "@/components/video-thumbnail";
import { CruxHeader } from "@/components/crux-header";
import {
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
import { BOULDER_GRADES } from "@/lib/bouldering-grade";
import { gradeTapeColor } from "@/lib/grade-tape";
import { formatRecordDate } from "@/lib/record-display";
import type {
  AnalysisDepth,
  AnalysisLocale,
  AnalysisRecord,
  BoulderGrade,
} from "@/lib/types";
import { PROMPT_VERSION } from "@/lib/analyze-prompt";
import { STRINGS, formatStr } from "@/lib/strings";
import { useAuth } from "@/lib/use-auth";
import { useUiLocale } from "@/lib/use-ui-locale";

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
  const { user: authUser } = useAuth();
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
  const [grade, setGrade] = useState<BoulderGrade>("V4");
  const [ascentMeters, setAscentMeters] = useState("4");
  const [sessionNote, setSessionNote] = useState("");

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
        `${formatStr(t.videoTooBig, { maxMb: MAX_SOURCE_BYTES / 1024 / 1024 })} \u00b7 ${t.videoTooBigHint}`
      );
      return;
    }

    setOriginalFile(selected);
    setCompressing(true);
    setCompressHint(t.checkingVideo);

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
          t.compressedFromTo(
            (result.originalSize / 1024 / 1024).toFixed(1),
            (result.finalSize / 1024 / 1024).toFixed(1)
          )
        );
      } else {
        setCompressInfo(
          `${(result.finalSize / 1024 / 1024).toFixed(1)}MB` + t.noCompressSuffix
        );
      }
    } catch (e) {
      setFile(null);
      setOriginalFile(null);
      if (preview) URL.revokeObjectURL(preview);
      setPreview(null);
      setError(e instanceof Error ? e.message : t.compressFailed);
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
    setProgressHint(t.uploading);
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
          t.analysisFailed
        );
        throw new AnalysisPollError(message, retryable, 0);
      }

      let data = parsedRes.data;

      if (data.async && data.jobId) {
        setPollStatus("uploaded");
        const est = data.estimatedSeconds ?? 60;
        setProgressHint(
          data.message ?? t.asyncProgress(est)
        );

        data = await pollUntilComplete(data.jobId, {
          signal: abortRef.current.signal,
          locale: uiLocale,
          onProgress: (status, hint, sec, meta) => {
            setElapsedSec(sec);
            setPollStatus(status);
            setProgressHint(`${hint} \u00b7 ${sec}s`);
            if (meta?.retryAfter) {
              setRetryAfterIso(meta.retryAfter);
            } else if (status !== "rate_limited") {
              setRetryAfterIso(null);
            }
          },
        });
      }

      const parsed = parseAnalysis(data.analysis!);
      const ascent = parseFloat(ascentMeters);
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
        grade: parsed.grade ?? grade,
        ascentMeters:
          Number.isFinite(ascent) && ascent > 0 ? ascent : undefined,
        sessionNote: sessionNote.trim() || undefined,
        userId: authUser?.id,
      };

      await saveAnalysisRecord(record, file);
      await loadHistory();
      router.push(`/analysis/${record.id}`);
    } catch (e) {
      if (e instanceof AnalysisPollError) {
        if (e.message === "Canceled" || e.message.includes("\u53d6\u6d88")) {
          setError(`${t.canceled} ${t.canceledHint}`);
        } else {
          setError(e.message);
        }
        setRetryable(e.retryable);
      } else if (e instanceof Error && e.name === "AbortError") {
        setError(`${t.canceled} ${t.canceledHint}`);
      } else {
        const { message, retryable } = explainFetchError(e, uiLocale);
        if (message === "Canceled" || message.includes("\u53d6\u6d88")) {
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
      <CruxHeader />

      <div className="shell">
        <div className="analyze-grid">
          {/* ---------- 主列 ---------- */}
          <div className="col-main">
            <h1 className="h1">
              {uiLocale === "zh" ? "分析一段新的攀爬" : "Analyze a new climb"}
            </h1>
            <p className="lede">{t.subtitle}</p>

            <label
              htmlFor="video-upload"
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              className="dropzone mt-6"
              data-over={dragOver}
              data-busy={compressing}
            >
              <span className="icon" aria-hidden>
                {compressing ? (
                  <IconLoader className="h-5 w-5" />
                ) : (
                  <IconUpload className="h-5 w-5" />
                )}
              </span>
              <span className="txt">
                <span className="t">
                  {compressing ? t.uploadCompress : t.uploadIdle}
                </span>
                <span className="h">
                  {formatStr(t.uploadHint, {
                    maxMb: MAX_SOURCE_BYTES / 1024 / 1024,
                    analyzeMb: MAX_ANALYZE_MB,
                  })}
                </span>
              </span>
              <span className="spec-chips" aria-hidden>
                <span>MP4</span>
                <span>MOV</span>
                <span>≤ {MAX_SOURCE_BYTES / 1024 / 1024}MB</span>
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
              <p className="mono mt-3 flex items-center gap-2">
                <IconLoader className="h-3.5 w-3.5" />
                {compressHint}
              </p>
            )}
            {compressInfo && <p className="mono mt-2">{compressInfo}</p>}

            {preview && file && (
              <div className="mt-5">
                <VideoThumbnail src={preview} fileName={file.name} />
              </div>
            )}

            {activeStep >= 0 && (
              <div className="steps no-print mt-6" aria-label="分析流程">
                {t.steps.map((label, i) => (
                  <div
                    key={label}
                    data-state={
                      activeStep === i ? "now" : activeStep > i ? "done" : "todo"
                    }
                  >
                    <div className="n">{String(i + 1).padStart(2, "0")}</div>
                    <div className="t">{label}</div>
                    <div className="s">
                      {activeStep === i
                        ? uiLocale === "zh"
                          ? "进行中"
                          : "Running"
                        : activeStep > i
                          ? uiLocale === "zh"
                            ? "已完成"
                            : "Done"
                          : uiLocale === "zh"
                            ? "待开始"
                            : "Waiting"}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {error && (
              <div className="mt-5 space-y-3">
                <div role="alert" className="alert">
                  {error}
                </div>
                {retryable && file && (
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <button
                      type="button"
                      onClick={runAnalysis}
                      className="btn flex-1"
                    >
                      {t.retrySameVideo}
                    </button>
                    <button
                      type="button"
                      onClick={() => selectFile(undefined)}
                      className="btn flex-1"
                    >
                      {t.rechooseFile}
                    </button>
                  </div>
                )}
              </div>
            )}

            {progressHint && loading && (
              <div className="mt-5 space-y-1.5">
                <p className="mono flex items-center gap-2 text-[var(--crux-text)]">
                  <IconLoader className="h-3.5 w-3.5" />
                  {progressHint}
                </p>
                {retryDisplaySec != null && retryDisplaySec > 0 && (
                  <p key={tick} className="mono">
                    {t.rateLimitWait(retryDisplaySec)}
                  </p>
                )}
                {elapsedSec > 10 && <p className="mono">{t.cloudKeepOpen}</p>}
              </div>
            )}

            <div className="note-box mt-6">
              <IconInfo className="mt-0.5 h-4 w-4 shrink-0 text-[var(--crux-accent)]" />
              <div>
                <p className="font-extrabold text-[var(--crux-text)]">
                  {t.tipTitle}
                </p>
                <p className="mt-1">{t.tipBody}</p>
              </div>
            </div>
          </div>

          {/* ---------- 线路登记表 ---------- */}
          <div className="col-form">
            <div className="panel relative">
              <span
                className="tape-mark"
                style={{ background: gradeTapeColor(grade) }}
                aria-hidden
              />
              <div className="panel-head">
                <span className="t">
                  {uiLocale === "zh" ? "线路登记" : "Route log"}
                </span>
                <span className="s">
                  {uiLocale === "zh" ? "选填，能让反馈更贴这条线" : "Optional"}
                </span>
              </div>

              <div className="panel-body">
                <div className="mb-4">
                  <span className="field-label">{t.routeGradeLabel}</span>
                  <div className="grade-grid">
                    {BOULDER_GRADES.map((g) => (
                      <button
                        key={g}
                        type="button"
                        aria-pressed={grade === g}
                        onClick={() => setGrade(g)}
                        className="grade-cell"
                      >
                        <i
                          style={{ background: gradeTapeColor(g) }}
                          aria-hidden
                        />
                        {g}
                      </button>
                    ))}
                  </div>
                  <p className="field-hint">{t.routeGradeHint}</p>
                </div>

                <div className="mb-4">
                  <label htmlFor="ascent" className="field-label">
                    {uiLocale === "zh" ? "爬升高度" : "Ascent"}
                  </label>
                  <div className="flex">
                    <input
                      id="ascent"
                      type="number"
                      min={0}
                      step={0.5}
                      value={ascentMeters}
                      onChange={(e) => setAscentMeters(e.target.value)}
                      className="input"
                      style={{ borderRight: 0 }}
                    />
                    <span className="flex items-center border-2 border-[var(--crux-border)] px-3 text-xs font-bold text-[var(--crux-text-muted)]">
                      {uiLocale === "zh" ? "米" : "m"}
                    </span>
                  </div>
                  <p className="field-hint">{t.ascentHint}</p>
                </div>

                <div className="mb-4">
                  <span className="field-label">{t.depthLabel}</span>
                  <div className="seg" role="group">
                    <button
                      type="button"
                      aria-pressed={depth === "deep"}
                      onClick={() => setDepth("deep")}
                    >
                      {t.depthDeep}
                    </button>
                    <button
                      type="button"
                      aria-pressed={depth === "light"}
                      onClick={() => setDepth("light")}
                    >
                      {t.depthLight}
                    </button>
                  </div>
                  <p className="field-hint">
                    {depth === "deep" ? t.depthDeepDesc : t.depthLightDesc}
                  </p>
                </div>

                <div className="mb-4">
                  <span className="field-label">{t.analysisOutputLang}</span>
                  <div className="seg" role="group">
                    <button
                      type="button"
                      aria-pressed={analysisLocale === "zh"}
                      onClick={() => setAnalysisLocale("zh")}
                    >
                      {t.analysisOutputZh}
                    </button>
                    <button
                      type="button"
                      aria-pressed={analysisLocale === "en"}
                      onClick={() => setAnalysisLocale("en")}
                    >
                      {t.analysisOutputEn}
                    </button>
                  </div>
                </div>

                <div className="mb-4">
                  <label htmlFor="session-note" className="field-label">
                    {t.sessionNoteLabel}
                    <span className="note"> — 可选</span>
                  </label>
                  <input
                    id="session-note"
                    value={sessionNote}
                    onChange={(e) => setSessionNote(e.target.value)}
                    placeholder={t.sessionNotePlaceholder}
                    className="input font-normal"
                  />
                </div>

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

                {loading && (
                  <button
                    type="button"
                    onClick={cancelAnalysis}
                    className="btn btn--block mt-2"
                  >
                    <IconX className="h-4 w-4" />
                    {t.cancelAnalysis}
                  </button>
                )}

                <p className="field-hint mt-3">
                  {uiLocale === "zh"
                    ? "通常 2–4 分钟。可以离开这一页，完成后来「分析历史」里看报告。"
                    : "Usually 2–4 minutes. You can leave this page; the report lands in your history."}
                </p>
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between gap-3">
              <span className="mono">{t.uiLangLabel}</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  aria-pressed={uiLocale === "zh"}
                  onClick={() => setUiLocale("zh")}
                  className="chip !px-2 !py-1 !text-[0.6875rem]"
                >
                  {t.uiLangZh}
                </button>
                <button
                  type="button"
                  aria-pressed={uiLocale === "en"}
                  onClick={() => setUiLocale("en")}
                  className="chip !px-2 !py-1 !text-[0.6875rem]"
                >
                  {t.uiLangEn}
                </button>
              </div>
            </div>
          </div>

          {/* ---------- 历史 ---------- */}
          <section className="col-hist" aria-labelledby="history-title">
            <div className="mb-4 flex items-baseline justify-between gap-3">
              <h2 id="history-title" className="h2">
                {t.historyTitle}
              </h2>
              <span className="mono">
                {filteredHistory.length}
                {uiLocale === "zh" ? " 条" : " records"}
              </span>
            </div>

            {historyDbError && (
              <div className="mb-4">
                <p className="alert font-extrabold text-[var(--crux-text)]">
                  {t.historyDbError}
                </p>
                <p className="field-hint">{t.historyDbHint}</p>
              </div>
            )}

            {!historyDbError && history.length > 0 && (
              <div className="filter-bar mb-5">
                <div className="min-w-0 flex-1">
                  <label htmlFor="hist-q">{t.historySearch}</label>
                  <input
                    id="hist-q"
                    value={searchQ}
                    onChange={(e) => setSearchQ(e.target.value)}
                    className="input !py-1.5 !text-[0.8125rem]"
                  />
                </div>
                <div>
                  <label htmlFor="hist-date">{t.historyDateLabel}</label>
                  <select
                    id="hist-date"
                    value={datePreset}
                    onChange={(e) =>
                      setDatePreset(e.target.value as "all" | "7" | "30")
                    }
                    className="input !py-1.5 !text-[0.8125rem]"
                  >
                    <option value="all">{t.historyDateAll}</option>
                    <option value="7">{t.historyDate7}</option>
                    <option value="30">{t.historyDate30}</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="hist-min">{t.historyScoreMin}</label>
                  <input
                    id="hist-min"
                    type="number"
                    min={0}
                    max={100}
                    value={scoreMin}
                    onChange={(e) => setScoreMin(e.target.value)}
                    className="input w-20 !py-1.5 !text-[0.8125rem]"
                  />
                </div>
                <div>
                  <label htmlFor="hist-max">{t.historyScoreMax}</label>
                  <input
                    id="hist-max"
                    type="number"
                    min={0}
                    max={100}
                    value={scoreMax}
                    onChange={(e) => setScoreMax(e.target.value)}
                    className="input w-20 !py-1.5 !text-[0.8125rem]"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSearchQ("");
                    setDatePreset("all");
                    setScoreMin("");
                    setScoreMax("");
                  }}
                  className="btn btn--sm"
                >
                  {t.historyClearFilters}
                </button>
              </div>
            )}

            {filteredHistory.length === 0 ? (
              <div className="empty">
                <p className="t">{emptyHistoryTitle}</p>
                <p className="h">{emptyHistoryHint}</p>
              </div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{uiLocale === "zh" ? "日期" : "Date"}</th>
                    <th>{uiLocale === "zh" ? "难度" : "Grade"}</th>
                    <th>{uiLocale === "zh" ? "得分" : "Score"}</th>
                    <th className="hidden sm:table-cell">
                      {uiLocale === "zh" ? "爬升" : "Ascent"}
                    </th>
                    <th aria-label="打开" />
                  </tr>
                </thead>
                <tbody>
                  {filteredHistory.map((r) => (
                    <tr key={r.id}>
                      <td className="n">{formatRecordDate(r.createdAt, "full")}</td>
                      <td>
                        <span className="badge">
                          <i
                            style={{ background: gradeTapeColor(r.grade) }}
                            aria-hidden
                          />
                          {r.grade ?? "—"}
                        </span>
                      </td>
                      <td className="n">{r.score ?? "—"}</td>
                      <td className="n hidden sm:table-cell">
                        {r.ascentMeters != null && r.ascentMeters > 0
                          ? `${r.ascentMeters} ${uiLocale === "zh" ? "米" : "m"}`
                          : "—"}
                      </td>
                      <td className="text-right">
                        <Link
                          href={`/analysis/${r.id}`}
                          className="text-xs font-extrabold underline underline-offset-4"
                        >
                          {uiLocale === "zh" ? "打开" : "Open"}
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
