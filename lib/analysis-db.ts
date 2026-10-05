import {
  fetchAnalysisFromCloud,
  patchAnalysisInCloud,
  pullAnalysesFromCloud,
  pushAnalysisToCloud,
} from "./analysis-cloud";
import type { AnalysisRecord } from "./types";

/**
 * 本地优先：IndexedDB 仍是主存储（含视频 Blob，离线可用）。
 * 已登录时把记录镜像到 Supabase，并在本地缺失时回源，实现跨设备同步。
 */

const DB_NAME = "bouldering-ai-coach";
const DB_VERSION = 3;
const STORE = "analyses";

type StoredRecord = AnalysisRecord & { videoBlob?: Blob };

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("createdAt", "createdAt", { unique: false });
      }
    };
  });
}

function stripVideoBlob<T extends { videoBlob?: Blob }>(
  row: T
): Omit<T, "videoBlob"> {
  const { videoBlob: _b, ...rest } = row;
  return rest;
}

function byNewestFirst(a: AnalysisRecord, b: AnalysisRecord): number {
  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
}

async function saveLocalAnalysisRecord(
  record: AnalysisRecord,
  videoBlob: Blob
): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    store.put({ ...record, videoBlob });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** 合并更新元数据（书签、备注字段等），不替换 videoBlob 除非传入；本地没有则跳过 */
async function patchLocalAnalysisRecord(
  id: string,
  patch: Partial<AnalysisRecord>
): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const req = store.get(id);
    req.onsuccess = () => {
      const prev = req.result as StoredRecord | undefined;
      if (!prev) return;
      const { videoBlob, ...meta } = prev;
      const next = { ...meta, ...patch, id, videoBlob };
      store.put(next);
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getLocalAnalysisRecord(
  id: string
): Promise<StoredRecord | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => resolve((req.result as StoredRecord) ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function listLocalAnalysisRecords(): Promise<AnalysisRecord[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => {
      const items = (req.result as StoredRecord[]) ?? [];
      items.sort(byNewestFirst);
      resolve(items.map((row) => stripVideoBlob(row) as AnalysisRecord));
    };
    req.onerror = () => reject(req.error);
  });
}

/** 把云端记录写入本地缓存：只补本地没有的 id，不覆盖本地版本，也不带视频 Blob */
async function cacheCloudRecords(records: AnalysisRecord[]): Promise<void> {
  if (records.length === 0) return;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    for (const record of records) {
      const req = store.get(record.id);
      req.onsuccess = () => {
        if (req.result === undefined) store.put({ ...record });
      };
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function saveAnalysisRecord(
  record: AnalysisRecord,
  videoBlob: Blob
): Promise<void> {
  await saveLocalAnalysisRecord(record, videoBlob);
  await pushAnalysisToCloud(record);
}

export async function patchAnalysisRecord(
  id: string,
  patch: Partial<AnalysisRecord>
): Promise<void> {
  await patchLocalAnalysisRecord(id, patch);
  await patchAnalysisInCloud(id, patch);
}

export async function getAnalysisRecord(
  id: string
): Promise<StoredRecord | null> {
  const local = await getLocalAnalysisRecord(id);
  if (local) return local;

  const remote = await fetchAnalysisFromCloud(id);
  if (!remote) return null;
  try {
    await cacheCloudRecords([remote]);
  } catch {
    /* 缓存失败仍返回云端数据 */
  }
  return remote;
}

export async function listAnalysisRecords(): Promise<AnalysisRecord[]> {
  const local = await listLocalAnalysisRecords();
  const cloud = await pullAnalysesFromCloud();
  if (cloud.length === 0) return local;

  const known = new Set(local.map((r) => r.id));
  const remoteOnly = cloud.filter((r) => !known.has(r.id));
  if (remoteOnly.length > 0) {
    try {
      await cacheCloudRecords(remoteOnly);
    } catch {
      /* 忽略缓存写入失败 */
    }
  }
  return [...local, ...remoteOnly].sort(byNewestFirst);
}

export async function captureVideoThumbnail(
  file: File,
  seekTo = 0.5
): Promise<string> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    const url = URL.createObjectURL(file);

    video.onloadeddata = () => {
      video.currentTime = Math.min(seekTo, video.duration || seekTo);
    };

    video.onseeked = () => {
      const canvas = document.createElement("canvas");
      const w = 320;
      const h = Math.round((video.videoHeight / video.videoWidth) * w) || 180;
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error("无法生成缩略图"));
        return;
      }
      ctx.drawImage(video, 0, 0, w, h);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
      URL.revokeObjectURL(url);
      resolve(dataUrl);
    };

    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("无法读取视频"));
    };

    video.src = url;
  });
}
