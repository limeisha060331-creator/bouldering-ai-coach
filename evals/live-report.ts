import { failureMeta, type FailureCode } from "../lib/failure-taxonomy";
import type { LiveRun } from "./live";

const pf = (value: number): string => `${(value * 100).toFixed(1)}%`;

function ms(value: number | null): string {
  if (value == null) return "—";
  return value >= 1000
    ? `${(value / 1000).toFixed(1)}s`
    : `${Math.round(value)}ms`;
}

function usd(value: number | null | undefined): string {
  if (value == null) return "—";
  return `$${value.toFixed(5)}`;
}

function verdict(pass: boolean): string {
  return pass ? "通过" : "未通过";
}

export function renderLiveReport(run: LiveRun): string {
  const a = run.aggregate;
  const lines: string[] = [];

  const redLines = [
    {
      name: "可解析率",
      actual: a.parseableRate,
      threshold: 0.98,
      pass: a.parseableRate >= 0.98,
    },
    {
      name: "契约完整率",
      actual: a.formatValidRate,
      threshold: 0.98,
      pass: a.formatValidRate >= 0.98,
    },
    {
      name: "时间戳可定位率",
      actual: a.timestampInRangeRate,
      threshold: 0.95,
      pass: a.timestampInRangeRate >= 0.95,
    },
    {
      name: "P0 失败案例数",
      actual: a.p0Cases,
      threshold: 0,
      pass: a.p0Cases === 0,
    },
    {
      name: "5 维分覆盖率",
      actual: a.dimensionScoresPresentRate,
      threshold: 0.9,
      pass: a.dimensionScoresPresentRate >= 0.9,
    },
    {
      name: "空话率",
      actual: a.genericAdviceRate,
      threshold: 0.3,
      pass: a.genericAdviceRate <= 0.3,
    },
    {
      name: "重复片段率",
      actual: a.duplicateSegmentRate,
      threshold: 0.2,
      pass: a.duplicateSegmentRate <= 0.2,
    },
  ];

  const failed = redLines.filter((item) => !item.pass);
  const sampleOk = run.cases >= 20;

  lines.push(`# 真实视频基线 · ${run.runId}`);
  lines.push("");
  lines.push(
    failed.length === 0
      ? `**结构层结论：** ${run.cases} 条真实视频全部通过结构红线。这不等于教练质量达标——5 维人工评分还没做。`
      : `**结构层结论：** ${run.cases} 条真实视频里有 ${failed.length} 项结构红线未通过：${failed
          .map((item) => item.name)
          .join("、")}。`
  );
  lines.push("");
  lines.push(
    sampleOk
      ? "样本量已达到 20 条，可以进入版本对比。"
      : `样本量 ${run.cases} 条 < 20 条，只能支撑「技术链路可用」的结论，不能支撑「质量已达标」或「可以上线」。`
  );
  lines.push("");

  lines.push("## 1. 运行参数");
  lines.push("");
  lines.push("| 项 | 值 |");
  lines.push("| --- | --- |");
  lines.push(`| 模式 | live（真实视频 + 真实 API） |`);
  lines.push(`| 模型 | ${run.model} |`);
  lines.push(`| Prompt 版本 | ${run.promptVersion} |`);
  lines.push(`| 深度 / 语言 | ${run.depth} / ${run.locale} |`);
  lines.push(`| 语料 | ${run.corpusCollection}，${run.dataSource} |`);
  lines.push(`| 案例数 | ${run.cases} |`);
  lines.push(`| 生成时间 | ${run.createdAt} |`);
  lines.push("");

  lines.push("## 2. 红线判定");
  lines.push("");
  lines.push("| 指标 | 实测 | 红线 | 结论 |");
  lines.push("| --- | --- | --- | --- |");
  for (const item of redLines) {
    const actual =
      item.name === "P0 失败案例数"
        ? `${item.actual}`
        : pf(item.actual as number);
    const threshold =
      item.name === "P0 失败案例数"
        ? "= 0"
        : item.name === "空话率" || item.name === "重复片段率"
          ? `≤ ${pf(item.threshold)}`
          : `≥ ${pf(item.threshold)}`;
    lines.push(`| ${item.name} | ${actual} | ${threshold} | ${verdict(item.pass)} |`);
  }
  lines.push("");
  lines.push(
    "口径说明：**可解析率**指输出里至少有一条合法时间戳片段，代表程序能不能读；**契约完整率**指可解析且给出了总分，代表输出符不符合产品契约。两者差距反映的是 Prompt 与下游消费方之间的约定问题，不是模型看不懂视频。"
  );
  lines.push("");

  lines.push("## 3. 逐案例");
  lines.push("");
  lines.push(
    "| 案例 | 场景 | 时长 | 段数 | 格式 | 时间戳 | 空话 | 重复 | 均字数 | 难度(外部) | 模型难度 | 生成耗时 | prompt tok | 实际成本 |"
  );
  lines.push(
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |"
  );
  for (const result of run.results) {
    const m = result.metrics;
    if (!m) {
      lines.push(
        `| ${result.caseId} | ${result.venue} | ${result.durationSec}s | — | 失败 | — | — | — | — | ${
          result.gradeExpected ?? "—"
        } | — | — | — | — |`
      );
      continue;
    }
    lines.push(
      `| ${m.caseId} | ${result.venue} | ${m.durationSec}s | ${m.segmentCount} | ${
        m.formatValid ? "合法" : "非法"
      } | ${pf(m.timestampInRangeRate)} | ${pf(m.genericAdviceRate)} | ${pf(
        m.duplicateSegmentRate
      )} | ${m.avgSegmentChars.toFixed(1)} | ${m.gradeExpected ?? "—"} | ${
        m.gradePredicted ?? "—"
      } | ${ms(result.generateMs)} | ${result.usage?.totalTokens ?? "—"} | ${usd(
        result.cost.actualUsd
      )} |`
    );
  }
  lines.push("");

  const errors = run.results.filter((item) => item.error);
  if (errors.length > 0) {
    lines.push("### 执行失败的案例");
    lines.push("");
    lines.push("| 案例 | 错误 |");
    lines.push("| --- | --- |");
    for (const item of errors) {
      lines.push(`| ${item.caseId} | ${item.error} |`);
    }
    lines.push("");
    lines.push(
      "失败案例保留在结果里而不是丢弃：分母减少会让通过率虚高，这里按「未通过」计入总案例数。"
    );
    lines.push("");
  }

  lines.push("## 4. 失败码分布");
  lines.push("");
  const codes = Object.entries(a.failureCounts).sort(
    (x, y) => (y[1] ?? 0) - (x[1] ?? 0)
  ) as [FailureCode, number][];
  if (codes.length === 0) {
    lines.push("本轮没有触发任何失败码。");
  } else {
    lines.push("| 失败码 | 级别 | 责任方 | 命中案例 | 修复方向 |");
    lines.push("| --- | --- | --- | --- | --- |");
    for (const [code, count] of codes) {
      const meta = failureMeta(code);
      lines.push(
        `| ${code} | ${meta.severity} | ${meta.owner} | ${count}/${run.cases} | ${meta.fix} |`
      );
    }
  }
  lines.push("");

  lines.push("## 5. 成本：实际 vs 估算");
  lines.push("");
  lines.push("| 项 | 值 |");
  lines.push("| --- | --- |");
  lines.push(`| 成本口径 | ${run.cost.model} |`);
  lines.push(`| 实际总成本 | ${usd(run.cost.totalActualUsd)} |`);
  lines.push(`| 估算总成本 | ${usd(run.cost.totalEstimatedUsd)} |`);
  lines.push(`| 单条实际成本 | ${usd(run.cost.avgActualUsd)} |`);
  lines.push(`| 单条估算成本 | ${usd(run.cost.avgEstimatedUsd)} |`);
  const drift =
    run.cost.avgActualUsd != null && run.cost.avgActualUsd > 0
      ? (run.cost.avgEstimatedUsd - run.cost.avgActualUsd) / run.cost.avgActualUsd
      : null;
  lines.push(
    `| 估算偏差 | ${drift == null ? "—" : `${(drift * 100).toFixed(1)}%（正数=高估）`} |`
  );
  lines.push("");
  lines.push(run.cost.pricingNote);
  lines.push("");
  if (run.cost.avgActualUsd != null) {
    lines.push("月度成本外推（只按视频次数线性放大，不含重试与存储）：");
    lines.push("");
    lines.push("| 每天分析次数 | 月成本（USD） | 月成本（CNY, 7.1） |");
    lines.push("| --- | --- | --- |");
    for (const perDay of [100, 1000, 10000]) {
      const monthly = run.cost.avgActualUsd * perDay * 30;
      lines.push(
        `| ${perDay} | $${monthly.toFixed(2)} | ¥${(monthly * 7.1).toFixed(2)} |`
      );
    }
    lines.push("");
  }

  lines.push("## 6. 耗时");
  lines.push("");
  lines.push("| 阶段 | 平均 |");
  lines.push("| --- | --- |");
  lines.push(`| 上传 | ${ms(run.timings.avgUploadMs)} |`);
  lines.push(`| 等待 ACTIVE | ${ms(
    run.results
      .map((item) => item.readyWaitMs)
      .filter((value): value is number => value != null)
      .reduce((sum, value, _, arr) => sum + value / arr.length, 0)
  )} |`);
  lines.push(`| 生成 | ${ms(run.timings.avgGenerateMs)} |`);
  lines.push(`| 单条端到端 | ${ms(
    run.results.length === 0 ? null : run.timings.totalMs / run.results.length
  )} |`);
  lines.push("");

  lines.push("## 7. 这轮结论不能说明什么");
  lines.push("");
  for (const note of run.notes) {
    lines.push(`- ${note}`);
  }
  lines.push(
    "- 没有人工金标，所以没有综合质量分、没有 5 维 MAE，不能拿这份报告证明「点评变准了」。"
  );
  lines.push(
    "- 样本是公开授权的赛事与户外视频，机位、光线、选手水平都优于普通用户手机拍摄，结论不能直接外推到 C 端。"
  );
  lines.push("");

  return lines.join("\n");
}
