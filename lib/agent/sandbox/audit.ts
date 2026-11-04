import { readdir, stat } from "node:fs/promises";
import path from "node:path";

export type FileStamp = {
  size: number;
  mtimeMs: number;
};

export type TreeSnapshot = Record<string, FileStamp>;

export type TreeDiff = {
  added: string[];
  modified: string[];
  deleted: string[];
};

export type AuditResult = TreeDiff & {
  violations: string[];
};

const IGNORED_DIRS = new Set([
  ".git",
  "node_modules",
  ".next",
  ".sandbox",
  ".tmp",
]);

const MAX_ENTRIES = 20_000;
const MAX_DEPTH = 8;

/**
 * 快照只记路径、大小、mtime，不读文件内容。
 * 用于回答一个问题：这次运行到底碰了哪些文件。
 */
export async function snapshotTree(root: string): Promise<TreeSnapshot> {
  const snapshot: TreeSnapshot = {};
  let count = 0;

  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > MAX_DEPTH || count >= MAX_ENTRIES) return;

    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (count >= MAX_ENTRIES) return;
      if (IGNORED_DIRS.has(entry.name)) continue;
      if (entry.isSymbolicLink()) continue;

      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath, depth + 1);
        continue;
      }
      if (!entry.isFile()) continue;

      try {
        const info = await stat(fullPath);
        const relative = path
          .relative(root, fullPath)
          .split(path.sep)
          .join("/");
        snapshot[relative] = { size: info.size, mtimeMs: info.mtimeMs };
        count += 1;
      } catch {
        // 瞬时文件消失不算异常
      }
    }
  }

  await walk(root, 0);
  return snapshot;
}

export function diffTrees(
  before: TreeSnapshot,
  after: TreeSnapshot
): TreeDiff {
  const added: string[] = [];
  const modified: string[] = [];
  const deleted: string[] = [];

  for (const [file, stamp] of Object.entries(after)) {
    const previous = before[file];
    if (!previous) {
      added.push(file);
      continue;
    }
    if (previous.size !== stamp.size || previous.mtimeMs !== stamp.mtimeMs) {
      modified.push(file);
    }
  }

  for (const file of Object.keys(before)) {
    if (!after[file]) deleted.push(file);
  }

  return {
    added: added.sort(),
    modified: modified.sort(),
    deleted: deleted.sort(),
  };
}

function isAllowed(file: string, allow: string[]): boolean {
  return allow.some((prefix) => {
    const normalized = prefix.endsWith("/") ? prefix : `${prefix}/`;
    return file === prefix || file.startsWith(normalized);
  });
}

/**
 * 允许清单之外的所有文件变化都算越界。
 * 进程级沙箱挡不住写盘，所以要有这一步事后审计。
 */
export function findViolations(diff: TreeDiff, allow: string[]): string[] {
  const changed = [...diff.added, ...diff.modified, ...diff.deleted];
  return changed.filter((file) => !isAllowed(file, allow)).sort();
}
