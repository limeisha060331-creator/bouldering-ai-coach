import type { AnalysisRecord } from "./types";

const DB_NAME = "bouldering-ai-coach";
const DB_VERSION = 3;
const STORE = "analyses";

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

export async function saveAnalysisRecord(
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

/** 合并更新元数据（书签、备注字段等），不替换 videoBlob 除非传入 */
export async function patchAnalysisRecord(
  id: string,
  patch: Partial<AnalysisRecord>
): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const req = store.get(id);
    req.onsuccess = () => {
      const prev = req.result as (AnalysisRecord & { videoBlob?: Blob }) | undefined;
      if (!prev) {
        reject(new Error("记录不存在"));
        return;
      }
      const { videoBlob, ...meta } = prev;
      const next = { ...meta, ...patch, id, videoBlob };
      store.put(next);
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getAnalysisRecord(
  id: string
): Promise<(AnalysisRecord & { videoBlob?: Blob }) | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function listAnalysisRecords(): Promise<AnalysisRecord[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => {
      const items =
        (req.result as (AnalysisRecord & { videoBlob?: Blob })[]) ?? [];
      items.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      resolve(items.map((row) => stripVideoBlob(row) as AnalysisRecord));
    };
    req.onerror = () => reject(req.error);
  });
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
