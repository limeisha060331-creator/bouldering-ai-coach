import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import fs from "node:fs";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { CorpusManifestEntry, CorpusSourceItem } from "./schema";
import {
  parseCorpusManifest,
  parseCorpusSourceFile,
  summarizeCoverage,
} from "./schema";

/**
 * 把 sources/ 下的授权清单拉成本地视频，并写一份带 sha256 的 manifest。
 *
 * 用法：
 *   npm run corpus:fetch -- --dry-run        只看计划，不联网下载
 *   npm run corpus:fetch                      下载缺失项，已存在且大小一致的跳过
 *   npm run corpus:fetch -- --only id1,id2    只处理指定条目
 *   npm run corpus:fetch -- --force           忽略本地文件强制重下
 *
 * 视频落在 evals/private/corpus/，该目录被 .gitignore 排除。
 */

const USER_AGENT =
  "bouldering-ai-eval/0.1 (licensed video corpus for local evaluation)";

type Options = {
  dryRun: boolean;
  force: boolean;
  only: Set<string> | null;
};

function parseArgs(argv: string[]): Options {
  const onlyIndex = argv.indexOf("--only");
  const onlyRaw = onlyIndex >= 0 ? argv[onlyIndex + 1] : undefined;
  return {
    dryRun: argv.includes("--dry-run"),
    force: argv.includes("--force"),
    only: onlyRaw
      ? new Set(
          onlyRaw
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean)
        )
      : null,
  };
}

function loadSources(root: string): CorpusSourceItem[] {
  const dir = path.join(root, "evals", "corpus", "sources");
  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith(".json"))
    .sort()
    .flatMap((file) => {
      const raw = fs.readFileSync(path.join(dir, file), "utf8");
      return parseCorpusSourceFile(JSON.parse(raw) as unknown).items;
    });
}

function extensionFor(item: CorpusSourceItem): string {
  const ext = path.extname(item.title).replace(".", "").toLowerCase();
  return ext || "bin";
}

function humanBytes(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

function relativePath(root: string, absolute: string): string {
  return path.relative(root, absolute).split(path.sep).join("/");
}

async function sha256OfFile(file: string): Promise<string> {
  const hash = createHash("sha256");
  await pipeline(fs.createReadStream(file), async function* (source) {
    for await (const chunk of source) {
      hash.update(chunk as Buffer);
    }
  });
  return hash.digest("hex");
}

async function download(
  item: CorpusSourceItem,
  dest: string
): Promise<{ sha256: string; bytes: number }> {
  const response = await fetch(item.downloadUrl, {
    headers: { "User-Agent": USER_AGENT },
  });
  if (!response.ok || !response.body) {
    throw new Error(`下载失败 HTTP ${response.status}：${item.id}`);
  }

  const hash = createHash("sha256");
  let bytes = 0;
  const hasher = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      hash.update(chunk);
      bytes += chunk.length;
      callback(null, chunk);
    },
  });

  const partial = `${dest}.part`;
  await pipeline(
    Readable.fromWeb(response.body as never),
    hasher,
    createWriteStream(partial)
  );
  fs.renameSync(partial, dest);

  return { sha256: hash.digest("hex"), bytes };
}

/**
 * 共享资源站会按 IP 限速，单次 429 不该让整批下载失败。
 * 退避重试两次，仍然失败就记下来继续下一条，最后统一报。
 */
async function downloadWithRetry(
  item: CorpusSourceItem,
  dest: string,
  backoffSec: number[] = [15, 45]
): Promise<{ sha256: string; bytes: number }> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= backoffSec.length; attempt++) {
    try {
      return await download(item, dest);
    } catch (err) {
      lastError = err;
      if (attempt >= backoffSec.length) break;
      const wait = backoffSec[attempt];
      console.log(
        `  ${item.id} 第 ${attempt + 1} 次失败，${wait}s 后重试：${
          err instanceof Error ? err.message : err
        }`
      );
      await new Promise((resolve) => setTimeout(resolve, wait * 1000));
    }
  }
  throw lastError;
}

async function main(): Promise<void> {
  const root = process.cwd();
  const options = parseArgs(process.argv.slice(2));
  const sources = loadSources(root);
  const selected = options.only
    ? sources.filter((item) => options.only?.has(item.id))
    : sources;

  if (selected.length === 0) {
    throw new Error("没有匹配的语料条目，检查 --only 参数");
  }
  if (options.only) {
    const known = new Set(sources.map((item) => item.id));
    const missing = [...options.only].filter((id) => !known.has(id));
    if (missing.length > 0) {
      throw new Error(`未知条目：${missing.join(", ")}`);
    }
  }

  const corpusDir = path.join(root, "evals", "private", "corpus");
  const manifestPath = path.join(corpusDir, "manifest.json");
  const totalBytes = selected.reduce((sum, item) => sum + item.sizeBytes, 0);

  console.log(
    `${selected.length} 条语料，源文件共 ${humanBytes(totalBytes)}；目标目录 evals/private/corpus/`
  );

  if (options.dryRun) {
    for (const item of selected) {
      const dest = path.join(corpusDir, `${item.id}.${extensionFor(item)}`);
      const exists = fs.existsSync(dest);
      console.log(
        `  ${exists ? "已存在" : "待下载"}  ${item.id.padEnd(28)} ${
          item.durationSec
        }s  ${humanBytes(item.sizeBytes)}  ${item.license}`
      );
    }
    console.log("\n--dry-run：未联网、未写入任何文件。");
    return;
  }

  fs.mkdirSync(corpusDir, { recursive: true });

  const previous: CorpusManifestEntry[] = fs.existsSync(manifestPath)
    ? parseCorpusManifest(
        JSON.parse(fs.readFileSync(manifestPath, "utf8")) as unknown
      ).items
    : [];
  const byId = new Map(previous.map((entry) => [entry.id, entry]));
  const failed: { id: string; reason: string }[] = [];

  for (const item of selected) {
    const dest = path.join(corpusDir, `${item.id}.${extensionFor(item)}`);
    const localPath = relativePath(root, dest);
    const cached =
      !options.force &&
      fs.existsSync(dest) &&
      fs.statSync(dest).size === item.sizeBytes;

    let sha256: string;
    let bytes: number;
    if (cached) {
      sha256 = await sha256OfFile(dest);
      bytes = fs.statSync(dest).size;
      console.log(`  复用  ${item.id}  ${humanBytes(bytes)}`);
    } else {
      let result: { sha256: string; bytes: number };
      try {
        result = await downloadWithRetry(item, dest);
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        failed.push({ id: item.id, reason });
        console.log(`  失败  ${item.id}  ${reason}（已跳过，不影响其他条目）`);
        continue;
      }
      sha256 = result.sha256;
      bytes = result.bytes;
      const drift = bytes - item.sizeBytes;
      console.log(
        `  下载  ${item.id}  ${humanBytes(bytes)}${
          drift === 0 ? "" : `（与清单差 ${drift} 字节，已按实际落盘值记录）`
        }`
      );
    }

    byId.set(item.id, {
      ...item,
      localPath,
      sha256,
      bytesOnDisk: bytes,
      retrievedAt: new Date().toISOString(),
      durationSource: "source-metadata",
    });
  }

  const ordered = [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
  fs.writeFileSync(
    manifestPath,
    JSON.stringify(
      {
        collection: "commons-bouldering",
        generatedAt: new Date().toISOString(),
        items: ordered,
      },
      null,
      2
    ),
    "utf8"
  );

  const coverage = summarizeCoverage(ordered);
  console.log(
    `\nmanifest 已写入 ${relativePath(root, manifestPath)}：${coverage.cases} 条，${humanBytes(
      coverage.totalBytes
    )}`
  );
  console.log(
    `  场景 ${JSON.stringify(coverage.byVenue)}  画幅 ${JSON.stringify(
      coverage.byOrientation
    )}`
  );
  console.log(
    `  时长 min/median/max = ${coverage.duration.minSec}s / ${coverage.duration.medianSec}s / ${coverage.duration.maxSec}s`
  );
  console.log(
    `  带难度标注 ${coverage.gradedCases}/${coverage.cases}（只有外部可核对的值才填）`
  );

  if (failed.length > 0) {
    console.log(`\n${failed.length} 条未下载成功：`);
    for (const item of failed) {
      console.log(`  ${item.id}  ${item.reason}`);
    }
    console.log("重跑同一条命令即可续传（已下载的会按大小跳过）。");
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
