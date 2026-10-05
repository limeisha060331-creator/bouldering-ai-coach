import type { AnalysisRecord } from "../types";
import { getSupabaseAdmin } from "./admin";

/**
 * analyses 表：record 列保存完整 AnalysisRecord（前向兼容），
 * 其余列是从 record 拆出的关键字段，便于筛选、排序与统计。
 */
export type AnalysisRow = {
  id: string;
  user_id: string | null;
  created_at: string;
  updated_at: string;
  file_name: string;
  thumbnail: string | null;
  analysis: string;
  score: number | null;
  highlight: string | null;
  segments: AnalysisRecord["segments"] | null;
  prompt_version: string | null;
  depth: string | null;
  locale: string | null;
  bookmarked_segment_indices: number[] | null;
  ascent_meters: number | null;
  grade: string | null;
  session_note: string | null;
  record: Partial<AnalysisRecord> | null;
};

export const ANALYSIS_COLUMNS = [
  "id",
  "user_id",
  "created_at",
  "updated_at",
  "file_name",
  "thumbnail",
  "analysis",
  "score",
  "highlight",
  "segments",
  "prompt_version",
  "depth",
  "locale",
  "bookmarked_segment_indices",
  "ascent_meters",
  "grade",
  "session_note",
  "record",
].join(",");

function asDepth(value: unknown): AnalysisRecord["depth"] {
  return value === "light" || value === "deep" ? value : undefined;
}

function asLocale(value: unknown): AnalysisRecord["locale"] {
  return value === "zh" || value === "en" ? value : undefined;
}

function asGrade(value: unknown): AnalysisRecord["grade"] {
  return typeof value === "string" && /^V(10|[0-9])$/.test(value)
    ? (value as AnalysisRecord["grade"])
    : undefined;
}

/** 数据库行 → AnalysisRecord（列优先，record 兜底） */
export function rowToAnalysisRecord(row: AnalysisRow): AnalysisRecord {
  const base = (row.record ?? {}) as Partial<AnalysisRecord>;
  const segments =
    Array.isArray(row.segments) && row.segments.length > 0
      ? row.segments
      : base.segments ?? [];
  const bookmarks =
    Array.isArray(row.bookmarked_segment_indices) &&
    row.bookmarked_segment_indices.length > 0
      ? row.bookmarked_segment_indices
      : base.bookmarkedSegmentIndices ?? [];

  return {
    ...base,
    id: row.id,
    createdAt: row.created_at || base.createdAt || new Date().toISOString(),
    fileName: row.file_name || base.fileName || "",
    thumbnail: row.thumbnail || base.thumbnail || "",
    analysis: row.analysis || base.analysis || "",
    score: row.score ?? base.score ?? null,
    highlight: row.highlight ?? base.highlight ?? null,
    segments,
    bookmarkedSegmentIndices: bookmarks,
    promptVersion: row.prompt_version ?? base.promptVersion,
    depth: asDepth(row.depth) ?? base.depth,
    locale: asLocale(row.locale) ?? base.locale,
    grade: asGrade(row.grade) ?? base.grade,
    ascentMeters: row.ascent_meters ?? base.ascentMeters,
    sessionNote: row.session_note ?? base.sessionNote,
    userId: row.user_id ?? base.userId,
  };
}

/** AnalysisRecord → 数据库列 */
export function analysisRecordToRow(userId: string, record: AnalysisRecord) {
  return {
    id: record.id,
    user_id: userId,
    created_at: record.createdAt,
    file_name: record.fileName ?? "",
    thumbnail: record.thumbnail ?? "",
    analysis: record.analysis ?? "",
    score: record.score ?? null,
    highlight: record.highlight ?? null,
    segments: record.segments ?? [],
    prompt_version: record.promptVersion ?? null,
    depth: record.depth ?? null,
    locale: record.locale ?? null,
    bookmarked_segment_indices: record.bookmarkedSegmentIndices ?? [],
    ascent_meters: record.ascentMeters ?? null,
    grade: record.grade ?? null,
    session_note: record.sessionNote ?? null,
    record,
  };
}

/** 同 id 的记录属于别人时拒绝覆盖（service_role 绕过 RLS，需自行校验归属） */
async function assertOwnership(userId: string, id: string): Promise<void> {
  const { data, error } = await getSupabaseAdmin()
    .from("analyses")
    .select("user_id")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  const owner = (data as { user_id: string | null } | null)?.user_id ?? null;
  if (owner && owner !== userId) {
    throw new Error("该分析记录属于其他用户，拒绝写入");
  }
}

export async function listCloudAnalyses(
  userId: string
): Promise<AnalysisRecord[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("analyses")
    .select(ANALYSIS_COLUMNS)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as AnalysisRow[]).map(rowToAnalysisRecord);
}

export async function getCloudAnalysis(
  userId: string,
  id: string
): Promise<AnalysisRecord | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("analyses")
    .select(ANALYSIS_COLUMNS)
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ? rowToAnalysisRecord(data as unknown as AnalysisRow) : null;
}

export async function upsertCloudAnalysis(
  userId: string,
  record: AnalysisRecord
): Promise<void> {
  await assertOwnership(userId, record.id);
  const { error } = await getSupabaseAdmin()
    .from("analyses")
    .upsert(analysisRecordToRow(userId, record), { onConflict: "id" });

  if (error) throw new Error(error.message);
}

export async function patchCloudAnalysis(
  userId: string,
  id: string,
  patch: Partial<AnalysisRecord>
): Promise<AnalysisRecord | null> {
  const existing = await getCloudAnalysis(userId, id);
  if (!existing) return null;

  const next: AnalysisRecord = { ...existing, ...patch, id, userId };
  await upsertCloudAnalysis(userId, next);
  return next;
}

export async function deleteCloudAnalysis(
  userId: string,
  id: string
): Promise<boolean> {
  const { error, count } = await getSupabaseAdmin()
    .from("analyses")
    .delete({ count: "exact" })
    .eq("id", id)
    .eq("user_id", userId);

  if (error) throw new Error(error.message);
  return (count ?? 0) > 0;
}
