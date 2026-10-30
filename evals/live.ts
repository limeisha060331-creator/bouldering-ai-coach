import fs from "node:fs";
import path from "node:path";
import {
  ACTIVE_CONTRACT,
  CONTRACT_VERSIONS,
  getAnalysisPrompt,
  getMaxOutputTokens,
  getGeminiModelId,
  getPromptVersion,
  type ContractVersion,
} from "../lib/analyze-prompt";
import {
  computeCost,
  estimateGeminiVideoUsage,
  type ModelId,
  type TokenUsage,
} from "../lib/ai-cost";
import {
  aggregateStructural,
  evaluateStructural,
  type StructuralAggregate,
  type StructuralCaseMetrics,
} from "../lib/eval-structural";
import {
  geminiPhase1Upload,
  geminiPhase2CheckReady,
  runGeminiAnalysisDetailed,
} from "../lib/gemini-analyze";
import { parseAnalysis } from "../lib/parse-analysis";
import type { AnalysisDepth, AnalysisLocale } from "../lib/types";
import { parseCorpusManifest, type CorpusManifestEntry } from "./corpus/schema";
import { renderLiveReport } from "./live-report";

/**
 * 真实视频 live 评测。
 *
 * 跑的是生产同一条链路：uploadFile → 轮询 ACTIVE → generateContent。
 * 产出三类真数据：结构指标（不需要人工标注）、provider 真实 token、各阶段耗时。
 * 质量分（5 维 MAE）不在这里算，必须等人工金标，报告里会写明这一点。
 */

export type LiveCaseResult = {
  caseId: string;
  venue: string;
  durationSec: number;
  gradeExpected: string | null;
  fileSha256: string;
  outputChars: number;
  raw: string;
  uploadMs: number | null;
  readyWaitMs: number | null;
  generateMs: number | null;
  totalMs: number | null;
  attempts: number | null;
  usage: {
    promptTokens: number;
    cachedTokens: number;
    outputTokens: number;
    totalTokens: number;
  } | null;
  cost: {
    actualUsd: number | null;
    estimatedUsd: number;
    estimateVsActual: number | null;
  };
  metrics: StructuralCaseMetrics | null;
  error: string | null;
};

export type LiveRun = {
  runId: string;
  createdAt: string;
  mode: "live";
  model: string;
  promptVersion: string;
  /** 老运行没有这个字段，按 v1 理解 */
  contract?: ContractVersion;
  depth: AnalysisDepth;
  locale: AnalysisLocale;
  dataSource: string;
  corpusCollection: string;
  cases: number;
  aggregate: StructuralAggregate;
  cost: {
    model: "actual-provider-tokens" | "estimate-only";
    totalActualUsd: number;
    totalEstimatedUsd: number;
    avgActualUsd: number | null;
    avgEstimatedUsd: number;
    pricingNote: string;
  };
  timings: {
    totalMs: number;
    avgUploadMs: number | null;
    avgGenerateMs: number | null;
  };
  results: LiveCaseResult[];
  notes: string[];
};

type Options = {
  runId: string;
  only: Set<string> | null;
  limit: number | null;
  gapSec: number;
  depth: AnalysisDepth;
  locale: AnalysisLocale;
  dryRun: boolean;
  /** 只从已有 results.json 重算聚合与报告，不再调用 API */
  replay: string | null;
  contract: ContractVersion;
};

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

function parseArgs(argv: string[]): Options {
  const value = (flag: string): string | undefined => {
    const index = argv.indexOf(flag);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const onlyRaw = value("--only");
  const limitRaw = value("--limit");
  const gapRaw = value("--gap");
  const depthRaw = value("--depth");
  const localeRaw = value("--locale");
  const stamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-")
    .replace("T", "_")
    .slice(0, 19);

  return {
    runId: value("--run-id") ?? `live-${stamp}`,
    only: onlyRaw
      ? new Set(
          onlyRaw
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean)
        )
      : null,
    limit: limitRaw ? Number(limitRaw) : null,
    gapSec: gapRaw ? Number(gapRaw) : 8,
    depth: depthRaw === "light" ? "light" : "deep",
    locale: localeRaw === "en" ? "en" : "zh",
    dryRun: argv.includes("--dry-run"),
    replay: value("--replay") ?? null,
    contract: CONTRACT_VERSIONS.includes(
      (value("--contract") ?? "") as ContractVersion
    )
      ? ((value("--contract") ?? "") as ContractVersion)
      : ACTIVE_CONTRACT,
  };
}

function loadEnvLocal(root: string): void {
  const file = path.join(root, ".env.local");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    const [, key, raw] = match;
    if (process.env[key] != null) continue;
    process.env[key] = raw.trim().replace(/^["']|["']$/g, "");
  }
}

async function waitUntilActive(
  apiKey: string,
  fileName: string,
  timeoutMs = 240_000
): Promise<{ waitedMs: number; state: string }> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const check = await geminiPhase2CheckReady(apiKey, fileName);
    if (check.ready) return { waitedMs: Date.now() - startedAt, state: check.state };
    if (check.state === "FAILED") throw new Error("Gemini 视频处理失败（state=FAILED）");
    await sleep(2000);
  }
  throw new Error(`等待视频 ACTIVE 超时（${timeoutMs / 1000}s）`);
}

function meanOrNull(values: number[]): number | null {
  return values.length === 0
    ? null
    : values.reduce((sum, value) => sum + value, 0) / values.length;
}

async function runOne(
  apiKey: string,
  item: CorpusManifestEntry,
  options: Options,
  promptText: string,
  modelId: string
): Promise<LiveCaseResult> {
  const absPath = path.resolve(process.cwd(), item.localPath);
  const buffer = fs.readFileSync(absPath);
  const startedAt = Date.now();

  let uploadMs: number | null = null;
  let readyWaitMs: number | null = null;
  let generateMs: number | null = null;
  let attempts: number | null = null;
  let usage: LiveCaseResult["usage"] = null;
  let raw = "";
  let error: string | null = null;

  try {
    const uploadStart = Date.now();
    const uploaded = await geminiPhase1Upload(
      apiKey,
      buffer,
      item.mimeType,
      `eval-${item.id}`
    );
    uploadMs = Date.now() - uploadStart;

    const ready = await waitUntilActive(apiKey, uploaded.fileName);
    readyWaitMs = ready.waitedMs;

    const detail = await runGeminiAnalysisDetailed(
      apiKey,
      uploaded.fileUri,
      item.mimeType,
      {
        prompt: promptText,
        maxOutputTokens: getMaxOutputTokens(options.depth),
        depth: options.depth,
        locale: options.locale,
        maxAttempts: 3,
      }
    );
    raw = detail.text;
    generateMs = detail.latencyMs;
    attempts = detail.attempts;
    usage = detail.usage;
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  const totalMs = Date.now() - startedAt;
  const estimatedUsage: TokenUsage = estimateGeminiVideoUsage({
    durationSec: item.durationSec,
    promptText,
    outputText: raw,
    locale: options.locale,
  });
  const estimatedUsd = computeCost(modelId as ModelId, estimatedUsage).totalCostUsd;
  const actualUsd = usage
    ? computeCost(modelId as ModelId, {
        inputVideoTokens: usage.promptTokens,
        outputTokens: usage.outputTokens,
      }).totalCostUsd
    : null;

  const metrics =
    error === null
      ? evaluateStructural(
          {
            caseId: item.id,
            model: modelId,
            durationSec: item.durationSec,
            expectedGrade: item.grade,
          },
          raw,
          parseAnalysis(raw)
        )
      : null;

  return {
    caseId: item.id,
    venue: item.venue,
    durationSec: item.durationSec,
    gradeExpected: item.grade,
    fileSha256: item.sha256,
    outputChars: raw.length,
    raw,
    uploadMs,
    readyWaitMs,
    generateMs,
    totalMs,
    attempts,
    usage,
    cost: {
      actualUsd,
      estimatedUsd,
      estimateVsActual:
        actualUsd == null || actualUsd === 0
          ? null
          : (actualUsd - estimatedUsd) / actualUsd,
    },
    metrics,
    error,
  };
}

async function main(): Promise<void> {
  const root = process.cwd();
  loadEnvLocal(root);

  const options = parseArgs(process.argv.slice(2));

  if (options.replay) {
    const runDir = path.join(root, "evals", "runs", options.replay);
    const resultFile = path.join(runDir, "results.json");
    if (!fs.existsSync(resultFile)) {
      throw new Error(`找不到 ${path.relative(root, resultFile)}`);
    }
    const previous = JSON.parse(fs.readFileSync(resultFile, "utf8")) as LiveRun;
    const metrics = previous.results
      .map((item) => item.metrics)
      .filter((item): item is StructuralCaseMetrics => item != null);
    const rerun: LiveRun = {
      ...previous,
      aggregate: aggregateStructural(metrics),
    };
    fs.writeFileSync(resultFile, JSON.stringify(rerun, null, 2), "utf8");
    fs.writeFileSync(
      path.join(runDir, "report.md"),
      renderLiveReport(rerun),
      "utf8"
    );
    console.log(renderLiveReport(rerun));
    console.log(
      `\n已按当前指标口径重算 ${options.replay}（未调用 API，原始输出未改动）`
    );
    return;
  }

  const manifestPath = path.join(root, "evals", "private", "corpus", "manifest.json");
  if (!fs.existsSync(manifestPath)) {
    throw new Error(
      "缺少 evals/private/corpus/manifest.json，先跑 npm run corpus:fetch"
    );
  }
  const manifest = parseCorpusManifest(
    JSON.parse(fs.readFileSync(manifestPath, "utf8")) as unknown
  );
  let items = manifest.items;
  if (options.only) {
    items = items.filter((item) => options.only?.has(item.id));
  }
  if (options.limit != null && Number.isFinite(options.limit)) {
    items = items.slice(0, options.limit);
  }
  if (items.length === 0) throw new Error("筛选后没有可跑的语料");

  const modelId = getGeminiModelId();
  const promptText = getAnalysisPrompt(
    options.depth,
    options.locale,
    options.contract
  );

  if (options.dryRun) {
    console.log(
      `live 评测计划：${items.length} 条，model=${modelId} depth=${options.depth} contract=${options.contract} prompt=${getPromptVersion(options.contract)}`
    );
    for (const item of items) {
      console.log(
        `  ${item.id.padEnd(28)} ${item.durationSec}s  ${item.license}  ${item.grade ?? "难度未标注"}`
      );
    }
    console.log("\n--dry-run：未调用任何 API。");
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("缺少 GEMINI_API_KEY（.env.local 或环境变量）");

  const outDir = path.join(root, "evals", "runs", options.runId);
  const rawDir = path.join(outDir, "raw");
  fs.mkdirSync(rawDir, { recursive: true });

  const results: LiveCaseResult[] = [];
  for (const [index, item] of items.entries()) {
    console.log(
      `[${index + 1}/${items.length}] ${item.id} ${item.durationSec}s …`
    );
    const result = await runOne(apiKey, item, options, promptText, modelId);
    results.push(result);
    if (result.error) {
      console.log(`  失败：${result.error}`);
    } else {
      const m = result.metrics;
      console.log(
        `  完成 ${result.generateMs}ms · ${m?.segmentCount ?? 0} 段 · 格式${
          m?.formatValid ? "合法" : "非法"
        } · 时间戳 ${((m?.timestampInRangeRate ?? 0) * 100).toFixed(0)}% · ${
          result.usage ? `${result.usage.totalTokens}tok` : "无 usage"
        } · ${(result.cost.actualUsd ?? result.cost.estimatedUsd).toFixed(5)}USD`
      );
      fs.writeFileSync(
        path.join(rawDir, `${item.id}.md`),
        result.raw || `<!-- ${result.error ?? "无输出"} -->\n`,
        "utf8"
      );
    }
    fs.writeFileSync(
      path.join(outDir, "results.partial.json"),
      JSON.stringify(results, null, 2),
      "utf8"
    );
    if (index < items.length - 1 && options.gapSec > 0) {
      await sleep(options.gapSec * 1000);
    }
  }

  console.log("\n生成报告…");
  const okMetrics = results
    .map((item) => item.metrics)
    .filter((item): item is StructuralCaseMetrics => item != null);
  const actualCosts = results
    .map((item) => item.cost.actualUsd)
    .filter((value): value is number => value != null);

  const run: LiveRun = {
    runId: options.runId,
    createdAt: new Date().toISOString(),
    mode: "live",
    model: modelId,
    promptVersion: getPromptVersion(options.contract),
    contract: options.contract,
    depth: options.depth,
    locale: options.locale,
    dataSource: "evals/private/corpus/manifest.json",
    corpusCollection: manifest.collection,
    cases: results.length,
    aggregate: aggregateStructural(okMetrics),
    cost: {
      model: actualCosts.length > 0 ? "actual-provider-tokens" : "estimate-only",
      totalActualUsd: actualCosts.reduce((sum, value) => sum + value, 0),
      totalEstimatedUsd: results.reduce(
        (sum, item) => sum + item.cost.estimatedUsd,
        0
      ),
      avgActualUsd: meanOrNull(actualCosts),
      avgEstimatedUsd:
        results.length === 0
          ? 0
          : results.reduce((sum, item) => sum + item.cost.estimatedUsd, 0) /
            results.length,
      pricingNote:
        "provider 只给 promptTokenCount 总数，这里把整段 prompt token 按视频单价计费；" +
        "Gemini 2.5 Flash 文本/图片/视频同为 0.30 美元每百万 token，只有音轨按 1.00 计价，差额在千分位以下。",
    },
    timings: {
      totalMs: results.reduce((sum, item) => sum + (item.totalMs ?? 0), 0),
      avgUploadMs: meanOrNull(
        results
          .map((item) => item.uploadMs)
          .filter((value): value is number => value != null)
      ),
      avgGenerateMs: meanOrNull(
        results
          .map((item) => item.generateMs)
          .filter((value): value is number => value != null)
      ),
    },
    results,
    notes: [
      "本轮用真实抱石视频跑生产链路，结构指标可直接引用。",
      "未做人工 5 维标注，所以不给综合质量分、不给维度分 MAE，也不下「质量变好」的结论。",
      "语料是公开授权的赛事与户外视频，不含真实用户上传，场景分布偏专业选手。",
    ],
  };

  fs.writeFileSync(
    path.join(outDir, "results.json"),
    JSON.stringify(run, null, 2),
    "utf8"
  );
  fs.writeFileSync(
    path.join(outDir, "report.md"),
    renderLiveReport(run),
    "utf8"
  );
  fs.rmSync(path.join(outDir, "results.partial.json"), { force: true });

  console.log(renderLiveReport(run));
  console.log(`\n结果已写入 evals/runs/${options.runId}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
