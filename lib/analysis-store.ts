import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getBrowserSupabaseConfig,
  getSupabaseBrowser,
} from "./supabase/browser";
import type { AnalysisRecord } from "./types";

/**
 * 网页端数据层：Supabase 是唯一事实来源。
 *
 * - 记录读写走 PostgREST，RLS 按 auth.uid() 隔离；
 * - 缩略图和视频存在私有 Storage bucket `media`，路径 {userId}/{analysisId}/...；
 * - 只保留 30 秒内存缓存，换账号或退出登录立即失效，不再使用 IndexedDB。
 *
 * 桌面端仍然使用 `lib/analysis-db.ts` 的本地 IndexedDB 实现。
 */

const BUCKET = "media";
const SIGNED_URL_TTL_SEC = 60 * 60;
const CACHE_TTL_MS = 30_000;

/** Supabase 免费层单文件上限 50MB；更大的原片只保存分析报告和缩略图 */
export const MAX_CLOUD_VIDEO_BYTES = 50 * 1024 * 1024;

export type SaveAnalysisMedia = {
  video?: File | Blob | null;
  thumbnailDataUrl?: string | null;
};

export type SaveAnalysisResult = {
  videoStored: boolean;
  thumbnailStored: boolean;
};

type AnalysisRow = {
  id: string;
  user_id: string;
  created_at: string;
  updated_at: string;
  file_name: string;
  thumbnail_path: string | null;
  video_path: string | null;
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

const ANALYSIS_COLUMNS = [
  "id",
  "user_id",
  "created_at",
  "updated_at",
  "file_name",
  "thumbnail_path",
  "video_path",
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

let cache: AnalysisRecord[] | null = null;
let cacheAt = 0;
let cacheUserId: string | null = null;

export function invalidateAnalysisCache(): void {
  cache = null;
  cacheAt = 0;
  cacheUserId = null;
}

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

function rowToRecord(row: AnalysisRow, thumbnailUrl: string): AnalysisRecord {
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
    thumbnail: thumbnailUrl || "",
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
    userId: row.user_id,
    videoUrl: null,
  };
}

/** 不把会过期的签名 URL 和 base64 缩略图写进 record JSON */
function sanitizeRecord(record: AnalysisRecord): Omit<
  AnalysisRecord,
  "thumbnail" | "videoUrl" | "userId"
> {
  const copy: Partial<AnalysisRecord> = { ...record };
  delete copy.thumbnail;
  delete copy.videoUrl;
  delete copy.userId;
  return copy as Omit<AnalysisRecord, "thumbnail" | "videoUrl" | "userId">;
}

function recordToRow(
  userId: string,
  record: AnalysisRecord,
  paths: { thumbnailPath: string | null; videoPath: string | null }
) {
  return {
    id: record.id,
    user_id: userId,
    created_at: record.createdAt,
    file_name: record.fileName ?? "",
    thumbnail_path: paths.thumbnailPath,
    video_path: paths.videoPath,
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
    record: sanitizeRecord(record),
  };
}

async function currentUserId(
  supabase: SupabaseClient
): Promise<string | null> {
  // 读本地会话即可拿到 uid；真正的权限仍由数据库和 Storage 的 RLS 校验
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.user) return null;
  return data.session.user.id;
}

async function signedUrl(
  supabase: SupabaseClient,
  path: string
): Promise<string> {
  const { data } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SEC);
  return data?.signedUrl ?? "";
}

async function uploadObject(
  supabase: SupabaseClient,
  path: string,
  body: Blob,
  contentType: string
): Promise<void> {
  const { error } = await supabase.storage.from(BUCKET).upload(path, body, {
    contentType,
    upsert: true,
    cacheControl: "3600",
  });
  if (error) throw new Error(error.message);
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob | null> {
  if (!dataUrl.startsWith("data:")) return null;
  try {
    const res = await fetch(dataUrl);
    return await res.blob();
  } catch {
    return null;
  }
}

function videoExtension(mime: string): string {
  if (mime.includes("webm")) return "webm";
  if (mime.includes("quicktime")) return "mov";
  return "mp4";
}

/** 读取当前登录用户的全部记录；未登录返回空数组 */
export async function listAnalysisRecords(
  force = false
): Promise<AnalysisRecord[]> {
  if (!getBrowserSupabaseConfig().configured) return [];
  const supabase = getSupabaseBrowser();
  const userId = await currentUserId(supabase);
  if (!userId) {
    invalidateAnalysisCache();
    return [];
  }

  if (
    !force &&
    cache &&
    cacheUserId === userId &&
    Date.now() - cacheAt < CACHE_TTL_MS
  ) {
    return cache;
  }

  const { data, error } = await supabase
    .from("analyses")
    .select(ANALYSIS_COLUMNS)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as AnalysisRow[];

  const thumbPaths = [
    ...new Set(
      rows
        .map((row) => row.thumbnail_path)
        .filter((path): path is string => Boolean(path))
    ),
  ];
  const thumbMap = new Map<string, string>();
  if (thumbPaths.length > 0) {
    const { data: signed } = await supabase.storage
      .from(BUCKET)
      .createSignedUrls(thumbPaths, SIGNED_URL_TTL_SEC);
    for (const item of signed ?? []) {
      if (item.signedUrl && item.path) {
        thumbMap.set(item.path, item.signedUrl);
      }
    }
  }

  const records = rows.map((row) =>
    rowToRecord(row, thumbMap.get(row.thumbnail_path ?? "") ?? "")
  );
  cache = records;
  cacheAt = Date.now();
  cacheUserId = userId;
  return records;
}

/** 单条记录；本地没有缓存时直接从云端取，并附带视频签名 URL */
export async function getAnalysisRecord(
  id: string
): Promise<AnalysisRecord | null> {
  if (!getBrowserSupabaseConfig().configured) return null;
  const supabase = getSupabaseBrowser();
  const { data, error } = await supabase
    .from("analyses")
    .select(ANALYSIS_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  const row = data as unknown as AnalysisRow;
  const [thumbnail, videoUrl] = await Promise.all([
    row.thumbnail_path ? signedUrl(supabase, row.thumbnail_path) : "",
    row.video_path ? signedUrl(supabase, row.video_path) : null,
  ]);

  return { ...rowToRecord(row, thumbnail), videoUrl };
}

/**
 * 保存一条分析：先上传缩略图/视频，再写数据库。
 * 媒体上传失败不会阻断报告入库；返回值告诉调用方哪些媒体存成功了。
 */
export async function saveAnalysisRecord(
  record: AnalysisRecord,
  media?: SaveAnalysisMedia
): Promise<SaveAnalysisResult> {
  const supabase = getSupabaseBrowser();
  const userId = await currentUserId(supabase);
  if (!userId) throw new Error("请先登录后再保存分析");

  const folder = `${userId}/${record.id}`;
  let thumbnailPath: string | null = null;
  let videoPath: string | null = null;
  let thumbnailStored = false;
  let videoStored = false;

  if (media?.thumbnailDataUrl) {
    const blob = await dataUrlToBlob(media.thumbnailDataUrl);
    if (blob) {
      const path = `${folder}/thumb.jpg`;
      try {
        await uploadObject(supabase, path, blob, "image/jpeg");
        thumbnailPath = path;
        thumbnailStored = true;
      } catch {
        thumbnailPath = null;
      }
    }
  }

  if (
    media?.video &&
    media.video.size > 0 &&
    media.video.size <= MAX_CLOUD_VIDEO_BYTES
  ) {
    const mime = media.video.type || "video/mp4";
    const path = `${folder}/video.${videoExtension(mime)}`;
    try {
      await uploadObject(supabase, path, media.video, mime);
      videoPath = path;
      videoStored = true;
    } catch {
      videoPath = null;
    }
  }

  const { error } = await supabase
    .from("analyses")
    .upsert(recordToRow(userId, record, { thumbnailPath, videoPath }), {
      onConflict: "id",
    });

  if (error) throw new Error(error.message);
  invalidateAnalysisCache();
  return { videoStored, thumbnailStored };
}

/** 更新收藏、备注等元数据，并同步 record JSON */
export async function patchAnalysisRecord(
  id: string,
  patch: Partial<AnalysisRecord>
): Promise<void> {
  const supabase = getSupabaseBrowser();
  const userId = await currentUserId(supabase);
  if (!userId) throw new Error("请先登录后再修改记录");

  const { data: existing, error } = await supabase
    .from("analyses")
    .select(ANALYSIS_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!existing) throw new Error("记录不存在");

  const row = existing as unknown as AnalysisRow;
  const next: AnalysisRecord = {
    ...rowToRecord(row, ""),
    ...patch,
    id,
    userId,
  };
  const updates = recordToRow(userId, next, {
    thumbnailPath: row.thumbnail_path,
    videoPath: row.video_path,
  });

  const { error: updateError } = await supabase
    .from("analyses")
    .update(updates)
    .eq("id", id);

  if (updateError) throw new Error(updateError.message);
  invalidateAnalysisCache();
}

/** 删除记录及 Storage 中的媒体文件 */
export async function deleteAnalysisRecord(id: string): Promise<boolean> {
  const supabase = getSupabaseBrowser();
  const userId = await currentUserId(supabase);
  if (!userId) throw new Error("请先登录后再删除记录");

  const { data: existing, error } = await supabase
    .from("analyses")
    .select("thumbnail_path,video_path")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!existing) return false;

  const paths = [
    (existing as { thumbnail_path: string | null }).thumbnail_path,
    (existing as { video_path: string | null }).video_path,
  ].filter((path): path is string => Boolean(path));

  if (paths.length > 0) {
    await supabase.storage.from(BUCKET).remove(paths);
  }

  const { error: deleteError } = await supabase
    .from("analyses")
    .delete()
    .eq("id", id);
  if (deleteError) throw new Error(deleteError.message);

  invalidateAnalysisCache();
  return true;
}
