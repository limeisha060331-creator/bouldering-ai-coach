import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MemoryStore } from "../lib/agent/memory";
import type {
  MemoryEpisodeInput,
  MemoryPersistence,
} from "../lib/agent/memory";

let dir: string;
let file: string;
let store: MemoryStore;

const NOW = new Date("2026-11-04T10:00:00.000Z");

function episode(
  overrides: Partial<MemoryEpisodeInput> = {}
): MemoryEpisodeInput {
  return {
    userId: "u1",
    at: "2026-11-01T10:00:00.000Z",
    grade: "V4",
    angle: "side",
    lighting: "good",
    issues: [
      {
        bodyPart: "右脚",
        detail: "脚尖没有压住岩点",
        atSec: 12,
        confidence: 0.82,
      },
    ],
    sourceSessionId: "s1",
    ...overrides,
  };
}

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "memory-test-"));
  file = path.join(dir, "memory.json");
  store = new MemoryStore(file, { now: () => NOW, ttlDays: 180 });
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("memory store", () => {
  it("写入有效训练记录，id 由 session 决定", async () => {
    const decision = await store.addEpisode(episode());

    expect(decision.written).toBe(true);
    expect(decision.id).toBe("ep_s1");
    expect(store.listEpisodes("u1")).toHaveLength(1);
  });

  it("置信度不足的问题不写入，避免把猜测记成事实", async () => {
    const decision = await store.addEpisode(
      episode({
        issues: [
          {
            bodyPart: "左手",
            detail: "可能没抓稳",
            atSec: 3,
            confidence: 0.4,
          },
        ],
      })
    );

    expect(decision.written).toBe(false);
    expect(decision.code).toBe("LOW_CONFIDENCE");
    expect(store.listEpisodes("u1")).toHaveLength(0);
  });

  it("同一个 session 重复写入被拒绝", async () => {
    await store.addEpisode(episode());
    const second = await store.addEpisode(episode());

    expect(second.written).toBe(false);
    expect(second.code).toBe("DUPLICATE_SESSION");
  });

  it("档案只能由用户填写，模型推断不写入", async () => {
    const inferred = await store.upsertProfile(
      "u1",
      {
        level: "V4",
        goals: ["稳定完成 V4"],
        injuries: [],
        language: "zh",
        tone: "direct",
      },
      "inferred"
    );
    expect(inferred.written).toBe(false);
    expect(inferred.code).toBe("PROFILE_REQUIRES_USER_STATED");

    const stated = await store.upsertProfile(
      "u1",
      {
        level: "V4",
        goals: ["稳定完成 V4"],
        injuries: ["左膝旧伤"],
        language: "zh",
        tone: "direct",
      },
      "user"
    );
    expect(stated.written).toBe(true);
    expect(store.getProfile("u1")?.injuries).toEqual(["左膝旧伤"]);
  });

  it("偏好需要两次一致信号才生效", async () => {
    const first = await store.recordPreference("u1", "折膝", "膝盖往里扣");
    const second = await store.recordPreference("u1", "折膝", "膝盖往里扣");

    expect(first.written).toBe(false);
    expect(first.code).toBe("NEED_MORE_EVIDENCE");
    expect(second.written).toBe(true);
    expect(store.listPreferences("u1")[0]?.confirmed).toBe(true);
  });

  it("检索只返回同难度、同机位且在有效期内的记录", async () => {
    await store.addEpisode(episode({ sourceSessionId: "s1" }));
    await store.addEpisode(
      episode({ sourceSessionId: "s2", grade: "V6" })
    );
    await store.addEpisode(
      episode({ sourceSessionId: "s3", angle: "front" })
    );
    await store.addEpisode(
      episode({
        sourceSessionId: "s4",
        at: "2025-01-01T10:00:00.000Z",
      })
    );

    const hits = await store.retrieve("u1", {
      grade: "V4",
      angle: "side",
      lighting: "good",
    });

    expect(hits).toHaveLength(1);
    expect(hits[0]?.episode.sourceSessionId).toBe("s1");
    expect(hits[0]?.reason).toContain("同难度 V4");
    expect(hits[0]?.reason).toContain("同机位 side");
  });

  it("删除记录后不会再被检索到", async () => {
    await store.addEpisode(episode());
    const deleted = await store.deleteEpisode("ep_s1");
    const hits = await store.retrieve("u1", {
      grade: "V4",
      angle: "side",
      lighting: "good",
    });

    expect(deleted).toBe(true);
    expect(hits).toHaveLength(0);
  });

  it("用户之间互相隔离", async () => {
    await store.addEpisode(episode({ userId: "u1" }));

    const hits = await store.retrieve("u2", {
      grade: "V4",
      angle: "side",
      lighting: "good",
    });

    expect(hits).toHaveLength(0);
  });

  it("写入会落盘，新的实例能读回来", async () => {
    await store.addEpisode(episode());

    const reopened = new MemoryStore(file, {
      now: () => NOW,
      ttlDays: 180,
    });
    const hits = await reopened.retrieve("u1", {
      grade: "V4",
      angle: "side",
      lighting: "good",
    });

    expect(hits).toHaveLength(1);
  });

  it("可注入外部持久化端口（网页端 Supabase 走同一套策略）", async () => {
    let stored: unknown = null;
    const persistence: MemoryPersistence = {
      read: async () => stored as never,
      write: async (data) => {
        stored = JSON.parse(JSON.stringify(data));
      },
    };
    const remote = new MemoryStore("unused.json", {
      now: () => NOW,
      persistence,
    });

    const decision = await remote.addEpisode(episode());
    expect(decision.written).toBe(true);
    expect(stored).toBeTruthy();

    const reopened = new MemoryStore("unused.json", {
      now: () => NOW,
      persistence,
    });
    const hits = await reopened.retrieve("u1", {
      grade: "V4",
      angle: "side",
      lighting: "good",
    });
    expect(hits).toHaveLength(1);
  });
});
