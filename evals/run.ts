import fs from "node:fs";
import path from "node:path";
import { getAnalysisPrompt, PROMPT_VERSION } from "../lib/analyze-prompt";
import {
  computeCost,
  estimateDeepSeekFrameUsage,
  estimateGeminiVideoUsage,
} from "../lib/ai-cost";
import type { EvalRunResult } from "../lib/eval-run";
import {
  aggregateMetrics,
  evaluateAnalysis,
} from "../lib/eval-metrics";
import {
  parseEvalCase,
  parseEvalFixture,
  type EvalCase,
  type EvalFixture,
} from "../lib/eval-schema";
import { parseAnalysis } from "../lib/parse-analysis";
import { renderRunReport } from "./report";

function readJsonDir<T>(dir: string, parse: (input: unknown) => T): T[] {
  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith(".json"))
    .sort()
    .map((file) => {
      const raw = fs.readFileSync(path.join(dir, file), "utf8");
      return parse(JSON.parse(raw) as unknown);
    });
}

function parseArgs(): { runId: string; fixturesDir: string } {
  const args = process.argv.slice(2);
  const index = args.indexOf("--run-id");
  const fixturesIndex = args.indexOf("--fixtures");
  const fixturesDir =
    fixturesIndex >= 0 && args[fixturesIndex + 1]
      ? args[fixturesIndex + 1]
      : "evals/fixtures";
  if (index >= 0 && args[index + 1]) {
    return { runId: args[index + 1], fixturesDir };
  }
  const stamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-")
    .replace("T", "_")
    .slice(0, 19);
  return { runId: `replay-${stamp}`, fixturesDir };
}

function main(): void {
  const root = process.cwd();
  const cases = readJsonDir(path.join(root, "evals", "cases"), parseEvalCase);
  const { runId, fixturesDir } = parseArgs();
  const fixtures = readJsonDir(
    path.resolve(root, fixturesDir),
    parseEvalFixture
  );

  if (cases.length === 0) throw new Error("evals/cases 下没有案例");
  if (fixtures.length === 0) throw new Error("evals/fixtures 下没有输出");

  const caseById = new Map<string, EvalCase>(
    cases.map((item) => [item.id, item])
  );

  let totalUsd = 0;
  let totalCny = 0;

  const results = fixtures.map((fixture: EvalFixture) => {
    const evalCase = caseById.get(fixture.caseId);
    if (!evalCase) {
      throw new Error(`夹具 ${fixture.label} 指向不存在的案例 ${fixture.caseId}`);
    }

    const parsed = parseAnalysis(fixture.raw);
    const metrics = evaluateAnalysis(
      evalCase,
      fixture.raw,
      parsed,
      fixture.label
    );

    const promptText = getAnalysisPrompt(evalCase.depth, evalCase.locale);
    const usage =
      evalCase.model === "gemini-2.5-flash"
        ? estimateGeminiVideoUsage({
            durationSec: evalCase.durationSec,
            promptText,
            outputText: fixture.raw,
            locale: evalCase.locale,
          })
        : estimateDeepSeekFrameUsage({
            promptText,
            outputText: fixture.raw,
            locale: evalCase.locale,
          });
    const cost = computeCost(evalCase.model, usage);
    totalUsd += cost.totalCostUsd;
    totalCny += cost.totalCostCny;

    return metrics;
  });

  const metrics = aggregateMetrics(results);
  const run: EvalRunResult = {
    runId,
    createdAt: new Date().toISOString(),
    mode: "replay",
    dataSource: `synthetic-fixtures:${path.relative(root, path.resolve(root, fixturesDir))}`,
    promptVersion: PROMPT_VERSION,
    model: "mixed (per case)",
    cases: results.length,
    metrics,
    results,
    cost: {
      avgUsd: totalUsd / results.length,
      totalUsd,
      avgCny: totalCny / results.length,
      totalCny,
    },
    notes: [
      `本报告使用 ${path.relative(root, path.resolve(root, fixturesDir))} 下的合成夹具验证评测链路。`,
      "夹具只用于回归脚本与失败分类，不代表真实模型质量。",
      "接入真实视频后，把 mode 改为 live 并写入实际 usage。",
    ],
  };

  const outDir = path.join(root, "evals", "runs", runId);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, "results.json"),
    JSON.stringify(run, null, 2),
    "utf8"
  );
  fs.writeFileSync(
    path.join(outDir, "report.md"),
    renderRunReport(run),
    "utf8"
  );

  console.log(renderRunReport(run));
  console.log(`\n结果已写入 ${path.relative(root, outDir)}`);
}

main();
