import fs from "node:fs";
import path from "node:path";
import { formatUsd } from "../lib/ai-cost";
import type { LiveRun } from "./live";

/**
 * 两次 live 运行的对比与决策。
 *
 * 和 eval:compare 的分工：
 * - eval:compare 比的是带人工标签的 replay 结果，能出综合质量分。
 * - live-compare 比的是真实视频的结构指标与真实成本，不出质量分。
 *
 * 决策门槛沿用 docs/quality/eval-rubric.md，改门槛要同步改文档。
 */

const COST_INCREASE_LIMIT = 0.2;
const STRUCTURAL_DROP_LIMIT = 0.02;

type Polarity = "higher-is-better" | "lower-is-better";

type Row = {
  label: string;
  base: number;
  candidate: number;
  format: (value: number) => string;
  polarity: Polarity;
};

const pf = (value: number): string => `${(value * 100).toFixed(1)}%`;
const pt = (value: number): string => `${(value * 100).toFixed(1)}pt`;

function readRun(root: string, runId: string): LiveRun {
  const file = path.join(root, "evals", "runs", runId, "results.json");
  if (!fs.existsSync(file)) throw new Error(`找不到 ${path.relative(root, file)}`);
  const run = JSON.parse(fs.readFileSync(file, "utf8")) as LiveRun;
  if (run.mode !== "live") throw new Error(`${runId} 不是 live 运行`);
  return run;
}

function renderDelta(row: Row): { text: string; mark: string } {
  const diff = row.candidate - row.base;
  if (Math.abs(diff) < 1e-9) return { text: "持平", mark: "→" };

  const improved =
    row.polarity === "higher-is-better" ? diff > 0 : diff < 0;
  return {
    text: `${diff > 0 ? "+" : "−"}${row.format(Math.abs(diff))}`,
    mark: improved ? "改善" : "变差",
  };
}

function avgLatency(run: LiveRun): number | null {
  return run.results.length === 0 ? null : run.timings.totalMs / run.results.length;
}

function seconds(value: number | null): string {
  return value == null ? "—" : `${(value / 1000).toFixed(1)}s`;
}

function main(): void {
  const root = process.cwd();
  const args = process.argv.slice(2).filter((item) => !item.startsWith("--"));
  const [baseId, candidateId] = args;
  if (!baseId || !candidateId) {
    throw new Error(
      "用法：npm run eval:live:compare -- <baselineRunId> <candidateRunId>"
    );
  }

  const base = readRun(root, baseId);
  const candidate = readRun(root, candidateId);
  const b = base.aggregate;
  const c = candidate.aggregate;

  const rows: Row[] = [
    {
      label: "可解析率",
      base: b.parseableRate,
      candidate: c.parseableRate,
      format: pf,
      polarity: "higher-is-better",
    },
    {
      label: "契约完整率",
      base: b.formatValidRate,
      candidate: c.formatValidRate,
      format: pf,
      polarity: "higher-is-better",
    },
    {
      label: "时间戳可定位率",
      base: b.timestampInRangeRate,
      candidate: c.timestampInRangeRate,
      format: pf,
      polarity: "higher-is-better",
    },
    {
      label: "5 维分覆盖率",
      base: b.dimensionScoresPresentRate,
      candidate: c.dimensionScoresPresentRate,
      format: pf,
      polarity: "higher-is-better",
    },
    {
      label: "空话率",
      base: b.genericAdviceRate,
      candidate: c.genericAdviceRate,
      format: pf,
      polarity: "lower-is-better",
    },
    {
      label: "重复片段率",
      base: b.duplicateSegmentRate,
      candidate: c.duplicateSegmentRate,
      format: pf,
      polarity: "lower-is-better",
    },
    {
      label: "结构分",
      base: b.structuralScore,
      candidate: c.structuralScore,
      format: pt,
      polarity: "higher-is-better",
    },
    {
      label: "P0 失败案例数",
      base: b.p0Cases,
      candidate: c.p0Cases,
      format: (value) => `${value}`,
      polarity: "lower-is-better",
    },
  ];

  const costDelta =
    base.cost.avgActualUsd && candidate.cost.avgActualUsd
      ? (candidate.cost.avgActualUsd - base.cost.avgActualUsd) /
        base.cost.avgActualUsd
      : null;

  const guardrails = [
    {
      name: "契约完整率",
      limit: "≥ 98%",
      value: pf(c.formatValidRate),
      pass: c.formatValidRate >= 0.98,
    },
    {
      name: "时间戳可定位率",
      limit: "≥ 95%",
      value: pf(c.timestampInRangeRate),
      pass: c.timestampInRangeRate >= 0.95,
    },
    {
      name: "单条成本涨幅",
      limit: "≤ 20%",
      value: costDelta == null ? "无数据" : `${(costDelta * 100).toFixed(1)}%`,
      pass: costDelta != null && costDelta <= COST_INCREASE_LIMIT,
    },
    {
      name: "P0 失败不增加",
      limit: "候选 ≤ 基线",
      value: `${b.p0Cases} → ${c.p0Cases}`,
      pass: c.p0Cases <= b.p0Cases,
    },
    {
      name: "结构分不下降",
      limit: "下降 ≤ 2pt",
      value: `${pf(b.structuralScore)} → ${pf(c.structuralScore)}`,
      pass: c.structuralScore >= b.structuralScore - STRUCTURAL_DROP_LIMIT,
    },
  ];

  const failed = guardrails.filter((item) => !item.pass);
  const decision =
    failed.length === 0 && c.formatValidRate >= 0.98
      ? "可上线（结构层）"
      : "继续迭代";

  const lines: string[] = [];
  lines.push(`# live 版本对比：${baseId} → ${candidateId}`);
  lines.push("");
  lines.push(`**决策：${decision}**`);
  lines.push("");
  lines.push(
    failed.length === 0
      ? "所有结构红线通过。注意这仍不是质量结论：人工 5 维标注没做，综合质量分与维度分 MAE 不在这份报告里。"
      : `未通过项：${failed.map((item) => item.name).join("、")}。`
  );
  lines.push("");

  lines.push("## 运行参数");
  lines.push("");
  lines.push("| 项 | 基线 | 候选 |");
  lines.push("| --- | --- | --- |");
  lines.push(`| runId | ${base.runId} | ${candidate.runId} |`);
  lines.push(
    `| 输出契约 | ${base.contract ?? "v1"} | ${candidate.contract ?? "v1"} |`
  );
  lines.push(
    `| Prompt 版本 | ${base.promptVersion} | ${candidate.promptVersion} |`
  );
  lines.push(`| 模型 | ${base.model} | ${candidate.model} |`);
  lines.push(`| 案例数 | ${base.cases} | ${candidate.cases} |`);
  lines.push("");

  lines.push("## 指标对比");
  lines.push("");
  lines.push("| 指标 | 基线 | 候选 | 变化 | 判定 |");
  lines.push("| --- | ---: | ---: | ---: | --- |");
  for (const row of rows) {
    const delta = renderDelta(row);
    lines.push(
      `| ${row.label} | ${row.format(row.base)} | ${row.format(
        row.candidate
      )} | ${delta.text} | ${delta.mark} |`
    );
  }
  lines.push("");

  lines.push("## 成本与耗时");
  lines.push("");
  lines.push("| 项 | 基线 | 候选 | 变化 |");
  lines.push("| --- | ---: | ---: | ---: |");
  lines.push(
    `| 单条成本 | ${formatUsd(base.cost.avgActualUsd ?? 0)} | ${formatUsd(
      candidate.cost.avgActualUsd ?? 0
    )} | ${costDelta == null ? "—" : `${(costDelta * 100).toFixed(1)}%`} |`
  );
  const baseLatency = avgLatency(base);
  const candLatency = avgLatency(candidate);
  lines.push(
    `| 端到端耗时 | ${seconds(baseLatency)} | ${seconds(candLatency)} | ${
      baseLatency && candLatency
        ? `${(((candLatency - baseLatency) / baseLatency) * 100).toFixed(1)}%`
        : "—"
    } |`
  );
  lines.push("");

  lines.push("## 红线判定");
  lines.push("");
  lines.push("| 红线 | 门槛 | 实测 | 结论 |");
  lines.push("| --- | --- | --- | --- |");
  for (const item of guardrails) {
    lines.push(
      `| ${item.name} | ${item.limit} | ${item.value} | ${
        item.pass ? "通过" : "未通过"
      } |`
    );
  }
  lines.push("");

  const outDir = path.join(root, "evals", "runs", candidateId);
  const outFile = path.join(outDir, `comparison-vs-${baseId}.md`);
  fs.writeFileSync(outFile, lines.join("\n"), "utf8");

  console.log(lines.join("\n"));
  console.log(`\n对比已写入 ${path.relative(root, outFile)}`);
}

main();
