import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { PulseButton } from "@ui/pulse-button";
import { VideoThumbnail } from "@ui/video-thumbnail";
import { HistoryList } from "@/components/history-list";
import { CruxHeader } from "@/components/crux-header";
import {
  IconInfo,
  IconLoader,
  IconSparkles,
  IconUpload,
  IconX,
} from "@ui/icons";
import {
  captureVideoThumbnail,
  listAnalysisRecords,
  saveAnalysisRecord,
} from "@lib/analysis-db";
import {
  HISTORY_VIDEO_MAX_BYTES,
  MAX_SOURCE_BYTES,
} from "@lib/upload-limits";
import { parseAnalysis } from "@lib/parse-analysis";
import { BOULDER_GRADES } from "@lib/bouldering-grade";
import { gradeTapeColor } from "@lib/grade-tape";
import type {
  AnalysisDepth,
  AnalysisLocale,
  AnalysisRecord,
  BoulderGrade,
} from "@lib/types";
import { FRAME_PROMPT_VERSION } from "@lib/version";
import { STRINGS, formatStr } from "@lib/strings";
import { useAuth } from "@/lib/use-auth";
import { useUiLocale } from "@lib/use-ui-locale";
import { AnalysisCanceledError, analyzeVideo } from "@/lib/analyze-client";
import { extractFramesWithMeta } from "@/lib/extract-frames";
import type { AnalyzeFrame } from "@shared/ipc";

function pipelineStep(
  preparing: boolean,
  loading: boolean,
  pollStatus: string | null
): number {
  if (preparing) return 0;
  if (!loading) return -1;
  if (!pollStatus || pollStatus === "uploaded") return 1;
  return pollStatus === "analyzing" || pollStatus === "rate_limited" ? 2 : 3;
}

function isCanceledMessage(message: string): boolean {
  return message === "Canceled" || message.includes("取消");
}

export function AnalyzePage() {
  const navigate = useNavigate();
  const [uiLocale, setUiLocale] = useUiLocale();
  const { user: authUser } = useAuth();
  const t = STRINGS[uiLocale];
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [prepHint, setPrepHint] = useState<string | null>(null);
  const [prepInfo, setPrepInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [progressHint, setProgressHint] = useState<string | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [pollStatus, setPollStatus] = useState<string | null>(null);
  const [retryAfterIso, setRetryAfterIso] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [retryable, setRetryable] = useState(false);
  const [needsApiKey, setNeedsApiKey] = useState(false);
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);
  const [frames, setFrames] = useState<AnalyzeFrame[]>([]);
  const [durationSec, setDurationSec] = useState<number | null>(null);
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
      setHistory(await listAnalysisRecords());
    } catch {
      setHistoryDbError(true);
      setHistory([]);
    }
  }, []);

  useEffect(() => {
    void loadHistory();
    void window.crux.settings
      .get()
      .then((s) => setHasApiKey(s.active.hasApiKey))
      .catch(() => setHasApiKey(null));
  }, [loadHistory]);

  // 从「设置」页切回时同步最新的 Key 状态
  useEffect(() => {
    const sync = () => {
      void window.crux.settings
        .get()
        .then((s) => setHasApiKey(s.active.hasApiKey))
        .catch(() => undefined);
    };
    window.addEventListener("focus", sync);
    return () => window.removeEventListener("focus", sync);
  }, []);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!loading) return;
    const id = window.setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, [loading]);

  const retryDisplaySec =
    loading && retryAfterIso
      ? Math.max(
          0,
          Math.ceil((new Date(retryAfterIso).getTime() - Date.now()) / 1000)
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

  const activeStep = pipelineStep(preparing, loading, pollStatus);
  const stepLabels = t.steps;

  async function processSelectedFile(selected: File) {
    setError(null);
    setRetryable(false);
    setNeedsApiKey(false);
    setPrepInfo(null);
    setFrames([]);
    setDurationSec(null);

    if (!selected.type.startsWith("video/")) {
      setError(t.pickVideo);
      return;
    }

    if (selected.size > MAX_SOURCE_BYTES) {
      setError(
        `${formatStr(t.videoTooBig, { maxMb: MAX_SOURCE_BYTES / 1024 / 1024 })} · ${t.videoTooBigHint}`
      );
      return;
    }

    setFile(selected);
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(selected);
    });
    setPreparing(true);
    setPrepHint(t.checkingVideo);

    try {
      const extracted = await extractFramesWithMeta(selected, {
        onProgress: (done, total) => {
          setPrepHint(
            uiLocale === "zh"
              ? `正在抽取关键帧… ${done}/${total}`
              : `Extracting key frames… ${done}/${total}`
          );
        },
      });
      setFrames(extracted.frames);
      setDurationSec(extracted.durationSec);
      setPrepInfo(
        uiLocale === "zh"
          ? `已抽取 ${extracted.frames.length} 张关键帧 · 时长 ${Math.round(extracted.durationSec)} 秒`
          : `${extracted.frames.length} key frames · ${Math.round(extracted.durationSec)}s`
      );
    } catch (e) {
      setFile(null);
      setFrames([]);
      setDurationSec(null);
      setPreview((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      setError(
        e instanceof Error
          ? e.message
          : uiLocale === "zh"
            ? "视频处理失败"
            : t.compressFailed
      );
    } finally {
      setPreparing(false);
      setPrepHint(null);
    }
  }

  function selectFile(selected: File | undefined) {
    if (!selected) {
      setFile(null);
      setFrames([]);
      setDurationSec(null);
      setPreview((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      setPrepInfo(null);
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
    if (!file || frames.length === 0 || !durationSec) {
      setError(t.needVideo);
      return;
    }

    setLoading(true);
    setError(null);
    setRetryable(false);
    setNeedsApiKey(false);
    setProgressHint(t.uploading);
    setElapsedSec(0);
    setPollStatus(null);
    setRetryAfterIso(null);

    abortRef.current?.abort();
    abortRef.current = new AbortController();

    try {
      const [result, thumbnail] = await Promise.all([
        analyzeVideo(
          {
            provider: "deepseek",
            fileName: file.name,
            mimeType: file.type || "video/mp4",
            depth,
            locale: analysisLocale,
            originalSize: file.size,
            compressedSize: file.size,
            frames,
          },
          {
            signal: abortRef.current.signal,
            onProgress: (event) => {
              setElapsedSec(event.elapsedSec);
              setPollStatus(event.status);
              setProgressHint(`${event.hint} · ${event.elapsedSec}s`);
              setRetryAfterIso(event.retryAfter ?? null);
            },
          }
        ),
        captureVideoThumbnail(file).catch(() => ""),
      ]);

      const parsed = parseAnalysis(result.analysis);
      const ascent = parseFloat(ascentMeters);
      const record: AnalysisRecord = {
        id: result.jobId,
        createdAt: new Date().toISOString(),
        fileName: file.name,
        thumbnail: thumbnail || preview || "",
        analysis: result.analysis,
        score: parsed.score,
        highlight: parsed.highlight,
        segments: parsed.segments,
        promptVersion: FRAME_PROMPT_VERSION,
        depth,
        locale: analysisLocale,
        bookmarkedSegmentIndices: [],
        grade: parsed.grade ?? grade,
        ascentMeters:
          Number.isFinite(ascent) && ascent > 0 ? ascent : undefined,
        sessionNote: sessionNote.trim() || undefined,
        userId: authUser?.id,
      };

      // 原片只在不太大时留作本地回放；大文件只保留缩略图，避免撑爆 IndexedDB
      const videoForHistory =
        file.size <= HISTORY_VIDEO_MAX_BYTES ? file : new Blob();
      await saveAnalysisRecord(record, videoForHistory);
      await loadHistory();
      navigate(`/analysis/${record.id}`);
    } catch (e) {
      if (e instanceof AnalysisCanceledError) {
        setError(`${t.canceled} ${t.canceledHint}`);
        setRetryable(true);
      } else {
        const message = e instanceof Error ? e.message : String(e);
        if (isCanceledMessage(message)) {
          setError(`${t.canceled} ${t.canceledHint}`);
          setRetryable(true);
        } else {
          setError(message);
          setRetryable(true);
          if (message.includes("API Key")) {
            setNeedsApiKey(true);
            setHasApiKey(false);
          }
        }
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

            {hasApiKey === false && (
              <div
                className="alert mb-4 mt-4 flex flex-wrap items-center justify-between gap-3"
                data-testid="api-key-banner"
              >
                <p className="font-extrabold text-[var(--crux-text)]">
                  {uiLocale === "zh"
                    ? "尚未配置 DeepSeek API Key，配置后才能开始分析。"
                    : "No DeepSeek API key configured yet."}
                </p>
                <Link to="/settings" className="btn btn--sm">
                  {uiLocale === "zh" ? "去设置" : "Open settings"}
                </Link>
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
              className="dropzone mt-6"
              data-over={dragOver}
              data-busy={preparing}
              data-testid="upload-dropzone"
            >
              <span className="icon" aria-hidden>
                {preparing ? (
                  <IconLoader className="h-5 w-5" />
                ) : (
                  <IconUpload className="h-5 w-5" />
                )}
              </span>
              <span className="txt">
                <span className="t">
                  {preparing ? t.uploadCompress : t.uploadIdle}
                </span>
                <span className="h">
                  {uiLocale === "zh"
                    ? `最大 ${MAX_SOURCE_BYTES / 1024 / 1024}MB · 本地抽取关键帧后提交`
                    : `Up to ${MAX_SOURCE_BYTES / 1024 / 1024}MB · sampled into key frames locally`}
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
              disabled={preparing || loading}
              data-testid="video-input"
            />

            {prepHint && (
              <p className="mono mt-3 flex items-center gap-2">
                <IconLoader className="h-3.5 w-3.5" />
                {prepHint}
              </p>
            )}
            {prepInfo && <p className="mono mt-2">{prepInfo}</p>}

            {preview && file && (
              <div className="mt-5">
                <VideoThumbnail src={preview} fileName={file.name} />
              </div>
            )}

            {activeStep >= 0 && (
              <div className="steps no-print mt-6" aria-label="分析流程">
                {stepLabels.map((label, i) => (
                  <div
                    key={label}
                    data-state={
                      activeStep === i ? "now" : activeStep > i ? "done" : "todo"
                    }
                    data-testid={`pipeline-step-${i}`}
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
                <div role="alert" className="alert" data-testid="analysis-error">
                  {error}
                </div>
                {needsApiKey && (
                  <Link to="/settings" className="btn btn--sm">
                    {uiLocale === "zh" ? "去设置填写 Key" : "Open settings"}
                  </Link>
                )}
                {retryable && file && (
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <button
                      type="button"
                      onClick={() => void runAnalysis()}
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
              <div className="mt-5 space-y-1.5" data-testid="progress">
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
                  <label htmlFor="grade" className="field-label">
                    {t.routeGradeLabel}
                  </label>
                  <select
                    id="grade"
                    value={grade}
                    onChange={(e) => setGrade(e.target.value as BoulderGrade)}
                    className="input"
                    data-testid="grade-select"
                  >
                    {BOULDER_GRADES.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
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
                      data-testid="ascent-input"
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
                  onClick={() => void runAnalysis()}
                  disabled={!file || frames.length === 0 || preparing}
                  loading={loading}
                  data-testid="start-analysis"
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
              <span className="mono">
                {uiLocale === "zh" ? "界面语言" : "UI language"}
              </span>
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

            <p className="mono mt-3 leading-relaxed">
              {uiLocale === "zh" ? "分析后端" : "Backend"}：DeepSeek ·{" "}
              <Link to="/settings" className="underline underline-offset-4">
                {uiLocale === "zh" ? "在设置里切换" : "change in settings"}
              </Link>
            </p>
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

            <HistoryList
              records={filteredHistory}
              emptyTitle={emptyHistoryTitle}
              emptyHint={emptyHistoryHint}
            />
          </section>
        </div>
      </div>
    </main>
  );
}
