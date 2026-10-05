import type { AnalysisRecord } from "./types";

const REQUEST_TIMEOUT_MS = 8000;

/** 服务端明确返回「未配置 Supabase」后不再重试，避免每次渲染都打一次无用请求 */
let cloudUnavailable = false;

type CloudResponse = {
  analyses?: unknown;
  analysis?: unknown;
  authenticated?: boolean;
  configured?: boolean;
  error?: string;
};

function isAnalysisRecord(value: unknown): value is AnalysisRecord {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<AnalysisRecord>;
  return (
    typeof v.id === "string" &&
    typeof v.fileName === "string" &&
    typeof v.analysis === "string"
  );
}

async function requestJson(
  url: string,
  init?: RequestInit
): Promise<CloudResponse | null> {
  const res = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) return null;
  return (await res.json()) as CloudResponse;
}

function rememberAvailability(data: CloudResponse | null) {
  if (data && data.configured === false) cloudUnavailable = true;
}

function cloudDisabled(): boolean {
  return cloudUnavailable || typeof window === "undefined";
}

/** 把一条分析记录镜像到云端（未登录 / 离线时静默跳过） */
export async function pushAnalysisToCloud(
  record: AnalysisRecord
): Promise<void> {
  if (cloudDisabled()) return;
  try {
    const data = await requestJson("/api/analyses", {
      method: "POST",
      body: JSON.stringify({ record }),
    });
    rememberAvailability(data);
  } catch {
    /* 本地记录已保存，云端同步失败不影响使用 */
  }
}

/** 更新云端分析记录的部分字段（如收藏下标） */
export async function patchAnalysisInCloud(
  id: string,
  patch: Partial<AnalysisRecord>
): Promise<void> {
  if (cloudDisabled()) return;
  try {
    const data = await requestJson(
      `/api/analyses/${encodeURIComponent(id)}`,
      { method: "PATCH", body: JSON.stringify({ patch }) }
    );
    rememberAvailability(data);
  } catch {
    /* ignore */
  }
}

/** 拉取当前登录用户的全部分析记录；未登录 / 失败时返回空数组 */
export async function pullAnalysesFromCloud(): Promise<AnalysisRecord[]> {
  if (cloudDisabled()) return [];
  try {
    const data = await requestJson("/api/analyses");
    rememberAvailability(data);
    const list = data?.analyses;
    if (!Array.isArray(list)) return [];
    return list.filter(isAnalysisRecord);
  } catch {
    return [];
  }
}

/** 单条回源：本地缓存没有时从云端取 */
export async function fetchAnalysisFromCloud(
  id: string
): Promise<AnalysisRecord | null> {
  if (cloudDisabled()) return null;
  try {
    const data = await requestJson(
      `/api/analyses/${encodeURIComponent(id)}`
    );
    rememberAvailability(data);
    return isAnalysisRecord(data?.analysis) ? data.analysis : null;
  } catch {
    return null;
  }
}

/** 删除云端分析记录 */
export async function deleteAnalysisInCloud(id: string): Promise<void> {
  if (cloudDisabled()) return;
  try {
    const data = await requestJson(
      `/api/analyses/${encodeURIComponent(id)}`,
      { method: "DELETE" }
    );
    rememberAvailability(data);
  } catch {
    /* ignore */
  }
}
