import { beforeEach, describe, expect, it } from "vitest";
import {
  getAnalysisRecord,
  listAnalysisRecords,
  patchAnalysisRecord,
  saveAnalysisRecord,
} from "@lib/analysis-db";
import { loadProgressByDay, sumAscentMeters } from "@lib/climbing-stats";
import { listAllSegmentBookmarks } from "@lib/bookmarks";
import type { AnalysisRecord } from "@lib/types";

const DB_NAME = "bouldering-ai-coach";
const STORE = "analyses";

function makeRecord(patch: Partial<AnalysisRecord> = {}): AnalysisRecord {
  return {
    id: `rec-${Math.random().toString(16).slice(2)}`,
    createdAt: "2026-02-14T10:00:00.000Z",
    fileName: "crux-session.mp4",
    thumbnail: "data:image/jpeg;base64,AAAA",
    analysis: "难度：V4\n00:03 起步重心偏后",
    score: 80,
    highlight: "起步重心偏后",
    segments: [
      { timestamp: "00:03", seconds: 3, content: "起步重心偏后" },
      { timestamp: "00:18", seconds: 18, content: "折膝不到位" },
    ],
    grade: "V4",
    ascentMeters: 4,
    ...patch,
  };
}

function videoBlob(): Blob {
  return new Blob(["fake-video-bytes"], { type: "video/mp4" });
}

/** 复用同一个 IndexedDB，仅清空对象仓库（删库会因连接未关闭而阻塞） */
function wipeStore(): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 3);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).clear();
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    };
  });
}

beforeEach(async () => {
  await wipeStore();
});

describe("analysis-db（IndexedDB 本地历史）", () => {
  it("保存并读取记录，视频数据一并落库", async () => {
    await saveAnalysisRecord(makeRecord({ id: "rec-1" }), videoBlob());

    const loaded = await getAnalysisRecord("rec-1");
    expect(loaded?.fileName).toBe("crux-session.mp4");
    // fake-indexeddb 的结构化克隆不保留 Blob 内部字段，这里只验证字段存在
    expect(loaded).toHaveProperty("videoBlob");
    expect(loaded?.segments).toHaveLength(2);
    expect(loaded?.grade).toBe("V4");
  });

  it("列表按时间倒序且不返回视频 Blob", async () => {
    await saveAnalysisRecord(
      makeRecord({ id: "old", createdAt: "2026-02-01T09:00:00.000Z" }),
      videoBlob()
    );
    await saveAnalysisRecord(
      makeRecord({ id: "new", createdAt: "2026-02-20T09:00:00.000Z" }),
      videoBlob()
    );

    const list = await listAnalysisRecords();
    expect(list.map((r) => r.id)).toEqual(["new", "old"]);
    expect("videoBlob" in list[0]).toBe(false);
  });

  it("patch 合并元数据且不影响其他字段", async () => {
    await saveAnalysisRecord(makeRecord({ id: "rec-2" }), videoBlob());
    await patchAnalysisRecord("rec-2", { bookmarkedSegmentIndices: [1] });

    const loaded = await getAnalysisRecord("rec-2");
    expect(loaded?.bookmarkedSegmentIndices).toEqual([1]);
    expect(loaded?.score).toBe(80);
    expect(loaded?.fileName).toBe("crux-session.mp4");
  });

  it("patch 不存在的记录会抛错", async () => {
    await expect(patchAnalysisRecord("missing", { score: 70 })).rejects.toThrow();
  });
});

describe("climbing-stats", () => {
  it("按天汇总爬升与最高 V 级", async () => {
    await saveAnalysisRecord(
      makeRecord({
        id: "d1a",
        createdAt: "2026-02-10T10:00:00.000Z",
        ascentMeters: 4,
        grade: "V4",
      }),
      videoBlob()
    );
    await saveAnalysisRecord(
      makeRecord({
        id: "d1b",
        createdAt: "2026-02-10T18:00:00.000Z",
        ascentMeters: 6,
        grade: "V6",
      }),
      videoBlob()
    );
    await saveAnalysisRecord(
      makeRecord({
        id: "d2",
        createdAt: "2026-02-12T10:00:00.000Z",
        ascentMeters: 3,
        grade: "V3",
      }),
      videoBlob()
    );

    const records = await listAnalysisRecords();
    expect(sumAscentMeters(records)).toBe(13);

    const days = await loadProgressByDay();
    expect(days.map((d) => d.date)).toEqual(["2026-02-10", "2026-02-12"]);
    expect(days[0]).toMatchObject({
      ascentM: 10,
      sessions: 2,
      maxGrade: 6,
      avgGrade: 5,
    });
    expect(days[0].label).toBe("2/10");
  });
});

describe("bookmarks", () => {
  it("汇总所有记录中的时间轴收藏", async () => {
    await saveAnalysisRecord(
      makeRecord({
        id: "b1",
        createdAt: "2026-02-11T10:00:00.000Z",
        bookmarkedSegmentIndices: [1],
      }),
      videoBlob()
    );
    await saveAnalysisRecord(
      makeRecord({ id: "b2", bookmarkedSegmentIndices: [] }),
      videoBlob()
    );

    const items = await listAllSegmentBookmarks();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      analysisId: "b1",
      segmentIndex: 1,
      timestamp: "00:18",
      content: "折膝不到位",
    });
  });
});
