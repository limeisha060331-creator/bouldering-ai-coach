import type { EvalRunResult } from "../lib/eval-run";
import type {
  ComparisonReport,
  Decision,
  MetricComparison,
} from "../lib/eval-compare";
import { formatUsd } from "../lib/ai-cost";
import { FAILURE_LIBRARY } from "../lib/failure-taxonomy";

const DECISION_LABEL: Record<Decision, string> = {
  ship: "上线",
  iterate: "继续迭代",
  rollback: "回滚",
  need_more_data: "补样本",
};

function pct(value: number | null): string {
  return value == null ? "—" : `${(value * 100).toFixed(1)}%`;
}

function score(value: number | null): string {
  return value == null ? "—" : (value * 100).toFixed(1);
}

function decimal(value: number | null, digits = 2): string {
  return value == null ? "—" : value.toFixed(digits);
}

function signed(value: number | null, digits = 3): string {
  if (value == null) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}`;
}

function formatMetric(key: string, value: number | null): string {
  if (value == null) return "—";
  if (key === "avgCostUsd") return formatUsd(value);
  if (key === "qualityScore") return score(value);
  if (key === "dimensionMae") return value.toFixed(3);
  if (key === "timestampInRangeRate" || key === "formatValidRate" ||
      key === "mustMentionCoverage" || key === "genericAdviceRate" ||
      key === "duplicateSegmentRate" || key === "gradeMatchRate" ||
      key === "dimensionMaeCoverage") {
    return pct(value);
  }
  return value.toFixed(3);
}

function formatDelta(item: MetricComparison): string {
  if (item.delta == null) return "—";
  if (item.key === "avgCostUsd") return signed(item.delta, 4);
  if (item.key === "dimensionMae") return signed(item.delta, 3);
  if (item.key === "qualityScore") return `${signed(item.delta * 100, 1)}pt`;
  return `${signed(item.delta * 100, 1)}pt`;
}

export function renderRunReport(run: EvalRunResult): string {
  const p0Failures = run.results
    .flatMap((result) => result.failures)
    .filter((failure) => failure.severity === "P0");

  const lines: string[] = [];
  lines.push(`# AI 质量评测报告 · ${run.runId}`);
  lines.push("");
  lines.push(`- 生成时间：${run.createdAt}`);
  lines.push(`- 模式：${run.mode}`);
  lines.push(`- 数据源：${run.dataSource}`);
  lines.push(`- Prompt 版本：${run.promptVersion}`);
  lines.push(`- 模型：${run.model}`);
  lines.push(`- 样本数：${run.cases}`);
  lines.push("");

  if (run.notes && run.notes.length > 0) {
    lines.push("> " + run.notes.join("  \n> "));
    lines.push("");
  }

  lines.push("## 汇总指标");
  lines.push("");
  lines.push("| 指标 | 值 | 口径 |");
  lines.push("| --- | ---: | --- |");
  lines.push(`| 综合质量分 | ${score(run.metrics.qualityScore)} | 0-100，内部加权，不是行业基准 |`);
  lines.push(`| 格式合法率 | ${pct(run.metrics.formatValidRate)} | 有可解析片段且给出总分 |`);
  lines.push(`| 时间戳可定位率 | ${pct(run.metrics.timestampInRangeRate)} | 时间戳落在 0-时长+2s |`);
  lines.push(`| 关键线索覆盖率 | ${pct(run.metrics.mustMentionCoverage)} | 命中案例标签中的关键动作词 |`);
  lines.push(`| 空话率 | ${pct(run.metrics.genericAdviceRate)} | 含「注意重心/多练习」类句式的片段占比 |`);
  lines.push(`| 重复片段率 | ${pct(run.metrics.duplicateSegmentRate)} | 归一化文本完全相同 |`);
  lines.push(`| 难度判断一致率 | ${pct(run.metrics.gradeMatchRate)} | 模型 V 级与案例标注一致 |`);
  lines.push(
    `| 维度分覆盖率 | ${pct(run.metrics.dimensionMaeCoverage)}（${run.metrics.dimensionMaeCases}/${run.metrics.cases}） | 显式给出 5 维分的样本占比 |`
  );
  lines.push(
    `| 维度分 MAE | ${decimal(run.metrics.dimensionMae, 3)} | 与人工 5 维评分平均绝对误差，越低越好；只统计有维度分的样本 |`
  );
  lines.push(`| 平均片段数 | ${decimal(run.metrics.avgSegmentCount, 1)} | 每条视频产出的时间轴条目数 |`);
  lines.push(`| 平均单次成本 | ${formatUsd(run.cost.avgUsd)} | 按 token 估算，不是账单 |`);
  lines.push("");

  lines.push("## 逐案例结果");
  lines.push("");
  lines.push("| 案例 | 标签 | 质量分 | 片段 | 格式 | 时间戳 | 覆盖率 | 空话率 | 难度 | 维度 MAE | 失败码 |");
  lines.push("| --- | --- | ---: | ---: | --- | ---: | ---: | ---: | --- | ---: | --- |");
  for (const result of run.results) {
    lines.push(
      `| ${result.caseId} | ${result.label} | ${score(result.qualityScore)} | ${result.segmentCount} | ${result.formatValid ? "通过" : "失败"} | ${pct(result.timestampInRangeRate)} | ${pct(result.mustMentionCoverage)} | ${pct(result.genericAdviceRate)} | ${result.gradePredicted ?? "—"} / ${result.gradeExpected} | ${decimal(result.dimensionMae, 2)} | ${result.failureCodes.join(", ") || "—"} |`
    );
  }
  lines.push("");

  lines.push("## 失败分布");
  lines.push("");
  const failureEntries = Object.entries(run.metrics.failureCounts).sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0])
  );
  if (failureEntries.length === 0) {
    lines.push("本期没有触发失败码。");
  } else {
    lines.push("| 失败码 | 级别 | 次数 | 责任方 | 修复方向 |");
    lines.push("| --- | --- | ---: | --- | --- |");
    for (const [code, count] of failureEntries) {
      const meta = FAILURE_LIBRARY[code as keyof typeof FAILURE_LIBRARY];
      lines.push(
        `| ${code} | ${meta.severity} | ${count} | ${meta.owner} | ${meta.fix} |`
      );
    }
  }
  lines.push("");

  lines.push("## 红线检查");
  lines.push("");
  if (p0Failures.length === 0) {
    lines.push("本期没有 P0 失败。");
  } else {
    lines.push(`本期有 ${p0Failures.length} 条 P0 失败，发布前必须清零或明确豁免：`);
    lines.push("");
    for (const failure of p0Failures) {
      lines.push(`- ${failure.code}：${failure.evidence}`);
    }
  }
  lines.push("");

  lines.push("## 成本");
  lines.push("");
  lines.push(`- 本次样本总成本估算：${formatUsd(run.cost.totalUsd)}（¥${run.cost.totalCny.toFixed(4)}）`);
  lines.push(`- 平均单次：${formatUsd(run.cost.avgUsd)}（¥${run.cost.avgCny.toFixed(4)}）`);
  lines.push("");

  if (run.mode === "replay" && run.dataSource.includes("synthetic")) {
    lines.push("> 注意：本报告使用合成夹具验证评测链路，数字不代表真实模型质量。换成真实视频与真实输出后，才能用于发布决策。");
    lines.push("");
  }

  return lines.join("\n");
}

export function renderComparisonReport(report: ComparisonReport): string {
  const lines: string[] = [];
  lines.push(`# 版本对比 · ${report.baselineRunId} → ${report.candidateRunId}`);
  lines.push("");
  lines.push(`## 决策：${DECISION_LABEL[report.decision]}`);
  lines.push("");
  if (report.reasons.length > 0) {
    for (const reason of report.reasons) {
      lines.push(`- ${reason}`);
    }
  } else {
    lines.push("- 未触发任何决策规则。");
  }
  lines.push("");

  lines.push("## 指标对比");
  lines.push("");
  lines.push("| 指标 | 基线 | 候选 | Δ | 方向 | 判定 |");
  lines.push("| --- | ---: | ---: | ---: | --- | --- |");
  for (const item of report.metrics) {
    lines.push(
      `| ${item.label} | ${formatMetric(item.key, item.baseline)} | ${formatMetric(item.key, item.candidate)} | ${formatDelta(item)} | ${item.direction === "higher_is_better" ? "越高越好" : "越低越好"} | ${item.status} |`
    );
  }
  lines.push("");

  lines.push("## P0 失败变化");
  lines.push("");
  if (report.blockingFailures.length === 0) {
    lines.push("两版都没有 P0 失败。");
  } else {
    lines.push("| 失败码 | 说明 | 基线 | 候选 |");
    lines.push("| --- | --- | ---: | ---: |");
    for (const item of report.blockingFailures) {
      lines.push(
        `| ${item.code} | ${item.label} | ${item.baseline} | ${item.candidate} |`
      );
    }
  }
  lines.push("");

  lines.push("## 决策规则");
  lines.push("");
  lines.push("- 样本量少于 3 条：补样本，不做发布决策。");
  lines.push("- 格式合法率低于 98% 或时间戳可定位率低于 95%：回滚。");
  lines.push("- 单次成本上涨超过 20%：回滚。");
  lines.push("- 任一 P0 失败数增加：回滚。");
  lines.push("- 综合质量分提升 ≥ 2pt 且无红线：上线；下降 ≥ 2pt：回滚；其余继续迭代。");
  lines.push("");

  return lines.join("\n");
}
