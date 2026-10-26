import fs from "node:fs";
import path from "node:path";
import { compareRuns } from "../lib/eval-compare";
import type { EvalRunResult } from "../lib/eval-run";
import { renderComparisonReport } from "./report";

function readRun(root: string, runId: string): EvalRunResult {
  const file = path.join(root, "evals", "runs", runId, "results.json");
  if (!fs.existsSync(file)) {
    throw new Error(`找不到 run：${file}`);
  }
  return JSON.parse(fs.readFileSync(file, "utf8")) as EvalRunResult;
}

function main(): void {
  const root = process.cwd();
  const args = process.argv.slice(2).filter((item) => !item.startsWith("--"));
  const [baselineId, candidateId] = args;

  if (!baselineId || !candidateId) {
    console.error("用法：npm run eval:compare -- <baselineRunId> <candidateRunId>");
    process.exit(1);
  }

  const baseline = readRun(root, baselineId);
  const candidate = readRun(root, candidateId);

  const report = compareRuns({
    baseline: { runId: baseline.runId, metrics: baseline.metrics },
    candidate: { runId: candidate.runId, metrics: candidate.metrics },
    avgCostUsd: {
      baseline: baseline.cost.avgUsd,
      candidate: candidate.cost.avgUsd,
    },
  });

  const output = renderComparisonReport(report);
  const outFile = path.join(
    root,
    "evals",
    "runs",
    candidateId,
    `comparison-vs-${baselineId}.md`
  );
  fs.writeFileSync(outFile, output, "utf8");
  console.log(output);
  console.log(`\n对比已写入 ${path.relative(root, outFile)}`);
}

main();
