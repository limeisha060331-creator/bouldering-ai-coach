import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  memoryEpisodeInputSchema,
  memoryProfileInputSchema,
  memoryProfileSchema,
  type MemoryAngle,
  type MemoryEpisode,
  type MemoryEpisodeInput,
  type MemoryHit,
  type MemoryLighting,
  type MemoryPreference,
  type MemoryProfile,
  type MemoryProfileInput,
  type MemoryQuery,
  type MemoryWriteDecision,
} from "./types";

export type MemoryFile = {
  version: 1;
  profiles: Record<string, MemoryProfile>;
  episodes: MemoryEpisode[];
  preferences: MemoryPreference[];
};

/**
 * 记忆持久化端口。
 * 桌面/测试用文件，网页生产用 Supabase；策略逻辑留在 MemoryStore。
 */
export type MemoryPersistence = {
  read(): Promise<MemoryFile | null>;
  write(data: MemoryFile): Promise<void>;
};

export type MemoryStoreOptions = {
  now?: () => Date;
  /** 超过这个天数的记录不再参与对比，但仍然保留 */
  ttlDays?: number;
  /** 不传时读写构造参数里的 JSON 文件 */
  persistence?: MemoryPersistence;
};

const MIN_ISSUE_CONFIDENCE = 0.6;
const PREFERENCE_CONFIRM_COUNT = 2;

function emptyFile(): MemoryFile {
  return { version: 1, profiles: {}, episodes: [], preferences: [] };
}

/**
 * 文件版记忆库。
 * 三层分开：档案（很少变）、事件（每次一条）、偏好（需要多次确认）。
 * 写入先过策略，不合格的不进库——错误记忆比没有记忆更糟。
 */
export class MemoryStore {
  private readonly filePath: string;
  private readonly now: () => Date;
  private readonly ttlDays: number;
  private readonly persistence?: MemoryPersistence;
  private data: MemoryFile = emptyFile();
  private loaded = false;
  private writeChain: Promise<void> = Promise.resolve();

  constructor(filePath: string, options: MemoryStoreOptions = {}) {
    this.filePath = filePath;
    this.now = options.now ?? (() => new Date());
    this.ttlDays = options.ttlDays ?? 180;
    this.persistence = options.persistence;
  }

  async load(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;

    try {
      const parsed = this.persistence
        ? await this.persistence.read()
        : (JSON.parse(await readFile(this.filePath, "utf8")) as MemoryFile);
      if (!parsed) return;
      if (parsed.version !== 1) return;
      this.data = {
        version: 1,
        profiles: parsed.profiles ?? {},
        episodes: parsed.episodes ?? [],
        preferences: parsed.preferences ?? [],
      };
    } catch {
      this.data = emptyFile();
    }
  }

  getProfile(userId: string): MemoryProfile | null {
    return this.data.profiles[userId] ?? null;
  }

  async upsertProfile(
    userId: string,
    input: MemoryProfileInput,
    source: "user" | "inferred"
  ): Promise<MemoryWriteDecision> {
    await this.load();

    if (source === "inferred") {
      return {
        written: false,
        code: "PROFILE_REQUIRES_USER_STATED",
        message: "档案只能由用户本人填写，模型推断不写入",
      };
    }

    const parsed = memoryProfileInputSchema.safeParse(input);
    if (!parsed.success) {
      return {
        written: false,
        code: "INVALID",
        message: parsed.error.issues[0]?.message ?? "档案字段不合法",
      };
    }

    const profile: MemoryProfile = {
      userId,
      ...parsed.data,
      updatedAt: this.now().toISOString(),
    };
    const checked = memoryProfileSchema.safeParse(profile);
    if (!checked.success) {
      return {
        written: false,
        code: "INVALID",
        message: checked.error.issues[0]?.message ?? "档案不合法",
      };
    }

    this.data.profiles[userId] = checked.data;
    await this.persist();
    return { written: true, code: "OK", message: "档案已更新" };
  }

  async addEpisode(input: MemoryEpisodeInput): Promise<MemoryWriteDecision> {
    await this.load();

    const parsed = memoryEpisodeInputSchema.safeParse(input);
    if (!parsed.success) {
      return {
        written: false,
        code: "INVALID",
        message: parsed.error.issues[0]?.message ?? "训练记录不合法",
      };
    }

    const value = parsed.data;
    const issues = value.issues.filter(
      (issue) =>
        issue.confidence >= MIN_ISSUE_CONFIDENCE && issue.detail.trim().length >= 4
    );

    if (issues.length === 0) {
      return {
        written: false,
        code: "LOW_CONFIDENCE",
        message: `没有置信度 >= ${MIN_ISSUE_CONFIDENCE} 的有效问题，不写入记忆`,
      };
    }

    const duplicated = this.data.episodes.some(
      (episode) =>
        episode.userId === value.userId &&
        episode.sourceSessionId === value.sourceSessionId
    );
    if (duplicated) {
      return {
        written: false,
        code: "DUPLICATE_SESSION",
        message: `session 已记录: ${value.sourceSessionId}`,
      };
    }

    const episode: MemoryEpisode = {
      ...value,
      id: `ep_${value.sourceSessionId}`,
      issues,
    };

    this.data.episodes.push(episode);
    await this.persist();
    return {
      written: true,
      code: "OK",
      message: "训练记录已写入",
      id: episode.id,
    };
  }

  async recordPreference(
    userId: string,
    term: string,
    replacement: string
  ): Promise<MemoryWriteDecision> {
    await this.load();

    if (term.trim().length < 2 || replacement.trim().length < 2) {
      return {
        written: false,
        code: "INVALID",
        message: "术语与替换说法都至少需要 2 个字符",
      };
    }

    const existing = this.data.preferences.find(
      (item) => item.userId === userId && item.term === term
    );

    if (!existing) {
      this.data.preferences.push({
        id: `pref_${userId}_${this.data.preferences.length + 1}`,
        userId,
        term,
        replacement,
        evidenceCount: 1,
        confirmed: false,
        updatedAt: this.now().toISOString(),
      });
      await this.persist();
      return {
        written: false,
        code: "NEED_MORE_EVIDENCE",
        message: "偏好只出现一次，先记录不生效",
      };
    }

    const changed = existing.replacement !== replacement;
    existing.replacement = replacement;
    existing.evidenceCount = changed ? 1 : existing.evidenceCount + 1;
    existing.confirmed = existing.evidenceCount >= PREFERENCE_CONFIRM_COUNT;
    existing.updatedAt = this.now().toISOString();

    await this.persist();
    return {
      written: existing.confirmed,
      code: existing.confirmed ? "OK" : "NEED_MORE_EVIDENCE",
      message: existing.confirmed
        ? "偏好已确认"
        : `偏好还需要 ${PREFERENCE_CONFIRM_COUNT - existing.evidenceCount} 次确认`,
      id: existing.id,
    };
  }

  async retrieve(userId: string, query: MemoryQuery): Promise<MemoryHit[]> {
    await this.load();

    const ttlDays = query.maxAgeDays ?? this.ttlDays;
    const limit = query.limit ?? 3;
    const nowMs = this.now().getTime();

    return this.data.episodes
      .filter(
        (episode) =>
          episode.userId === userId &&
          episode.grade === query.grade &&
          episode.angle === query.angle
      )
      .map((episode) => {
        const ageDays = (nowMs - Date.parse(episode.at)) / 86_400_000;
        return { episode, ageDays };
      })
      .filter(({ ageDays }) => ageDays >= 0 && ageDays <= ttlDays)
      .map(({ episode, ageDays }) => {
        const recency = 1 - ageDays / ttlDays;
        const lighting = query.lighting === "good" ? 1 : 0.5;
        const score = Math.round((recency * 0.7 + lighting * 0.3) * 1000) / 1000;
        const reason = [
          `同难度 ${episode.grade}`,
          `同机位 ${episode.angle}`,
          `${Math.floor(ageDays)} 天前`,
        ].join(" · ");
        return { episode, score, reason };
      })
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (a.episode.at !== b.episode.at) {
          return a.episode.at < b.episode.at ? 1 : -1;
        }
        return a.episode.id.localeCompare(b.episode.id);
      })
      .slice(0, limit);
  }

  listEpisodes(userId: string): MemoryEpisode[] {
    return this.data.episodes
      .filter((episode) => episode.userId === userId)
      .sort((a, b) => (a.at < b.at ? 1 : -1));
  }

  listPreferences(userId: string): MemoryPreference[] {
    return this.data.preferences
      .filter((item) => item.userId === userId)
      .sort((a, b) => a.term.localeCompare(b.term));
  }

  async deleteEpisode(id: string): Promise<boolean> {
    await this.load();
    const before = this.data.episodes.length;
    this.data.episodes = this.data.episodes.filter(
      (episode) => episode.id !== id
    );
    if (this.data.episodes.length === before) return false;
    await this.persist();
    return true;
  }

  async deleteUser(userId: string): Promise<number> {
    await this.load();
    const removed = this.data.episodes.filter(
      (episode) => episode.userId === userId
    ).length;
    this.data.episodes = this.data.episodes.filter(
      (episode) => episode.userId !== userId
    );
    this.data.preferences = this.data.preferences.filter(
      (item) => item.userId !== userId
    );
    delete this.data.profiles[userId];
    await this.persist();
    return removed;
  }

  private async persist(): Promise<void> {
    this.writeChain = this.writeChain.then(async () => {
      if (this.persistence) {
        await this.persistence.write(this.data);
        return;
      }
      await mkdir(path.dirname(this.filePath), { recursive: true });
      await writeFile(
        this.filePath,
        JSON.stringify(this.data, null, 2),
        "utf8"
      );
    });
    return this.writeChain;
  }
}

export type { MemoryAngle, MemoryLighting };
