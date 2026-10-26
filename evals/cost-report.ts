import fs from "node:fs";
import path from "node:path";
import {
  FX_ASSUMPTIONS,
  MODEL_PRICING,
  TOKEN_ASSUMPTIONS,
  computeCost,
  estimateDeepSeekFrameUsage,
  estimateGeminiVideoUsage,
  formatCny,
  formatUsd,
  type ModelId,
} from "../lib/ai-cost";
import { getAnalysisPrompt } from "../lib/analyze-prompt";

const SCENARIOS = [
  { label: "短片段", durationSec: 15, outputChars: 1200 },
  { label: "常规", durationSec: 45, outputChars: 1800 },
  { label: "长片段", durationSec: 90, outputChars: 2400 },
] as const;

const PLAN = {
  priceCny: 29,
  analysesPerMonth: 20,
};

const promptText = getAnalysisPrompt("deep", "zh");

function estimate(model: ModelId, durationSec: number, outputChars: number) {
  const outputText = "评".repeat(outputChars);
  const usage =
    model === "gemini-2.5-flash"
      ? estimateGeminiVideoUsage({
          durationSec,
          promptText,
          outputText,
          locale: "zh",
        })
      : estimateDeepSeekFrameUsage({
          promptText,
          outputText,
          locale: "zh",
        });
  const inputTokens =
    (usage.inputTextTokens ?? 0) +
    (usage.inputImageTokens ?? 0) +
    (usage.inputVideoTokens ?? 0) +
    (usage.inputAudioTokens ?? 0);
  return { usage, inputTokens, cost: computeCost(model, usage) };
}

type LiveRunFile = {
  runId: string;
  createdAt: string;
  mode: string;
  results: {
    durationSec: number;
    raw?: string;
    totalMs: number | null;
    uploadMs: number | null;
    generateMs: number | null;
    usage: { promptTokens: number; outputTokens: number } | null;
    cost: { actualUsd: number | null; estimatedUsd: number };
  }[];
};

/** 找最近一次 live 运行，用真实账单校准估算模型 */
function loadLatestLiveRun(root: string): LiveRunFile | null {
  const runsDir = path.join(root, "evals", "runs");
  if (!fs.existsSync(runsDir)) return null;

  const candidates = fs
    .readdirSync(runsDir)
    .map((dir) => path.join(runsDir, dir, "results.json"))
    .filter((file) => fs.existsSync(file))
    .map((file) => JSON.parse(fs.readFileSync(file, "utf8")) as LiveRunFile)
    .filter((run) => run.mode === "live")
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  return candidates.length === 0 ? null : candidates[candidates.length - 1];
}

function mean(values: number[]): number | null {
  return values.length === 0
    ? null
    : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function drift(estimated: number | null, actual: number | null): string {
  if (estimated == null || actual == null || actual === 0) return "—";
  return `${(((estimated - actual) / actual) * 100).toFixed(1)}%`;
}

function main(): void {
  const root = process.cwd();
  const rows = SCENARIOS.flatMap((scenario) =>
    (["gemini-2.5-flash", "deepseek-flash"] as const).map((model) => ({
      scenario,
      model,
      ...estimate(model, scenario.durationSec, scenario.outputChars),
    }))
  );

  const lines: string[] = [];
  lines.push("# AI 成本模型");
  lines.push("");
  lines.push("> 由 `npm run cost:report` 生成。价格或假设变化后重跑，不要手改数字。");
  lines.push("");
  lines.push("## 1. 口径");
  lines.push("");
  lines.push("- 币种：美元挂牌价，按固定汇率折算人民币。");
  lines.push(`- 汇率假设：1 USD = ${FX_ASSUMPTIONS.usdToCny} CNY（${FX_ASSUMPTIONS.asOf}）。`);
  lines.push("- 成本是预算估算，不是 provider 账单。真实成本以 API 返回的 usage 为准。");
  lines.push("- 视频按 Gemini 官方 263 tokens/秒估算；抽帧按每帧 258 tokens 估算。");
  lines.push("");
  lines.push("## 2. 单价");
  lines.push("");
  lines.push("| 模型 | 文本/图片/视频输入 | 音频输入 | 输出 | 缓存输入 | 价格日期 | 来源 |");
  lines.push("| --- | ---: | ---: | ---: | ---: | --- | --- |");
  for (const pricing of Object.values(MODEL_PRICING)) {
    lines.push(
      `| ${pricing.label} | ${formatUsd(pricing.inputPerMillion.text)}/1M | ${pricing.inputPerMillion.audio > 0 ? formatUsd(pricing.inputPerMillion.audio) + "/1M" : "不支持"} | ${formatUsd(pricing.outputPerMillion)}/1M | ${pricing.cachedInputPerMillion ? formatUsd(pricing.cachedInputPerMillion) + "/1M" : "未配置"} | ${pricing.asOf} | [${pricing.provider}](${pricing.source}) |`
    );
  }
  lines.push("");
  lines.push("- DeepSeek 只接受文本与图片，不接受视频；表中视频按 0 计价表示不支持。");
  lines.push("");
  lines.push("## 3. Token 假设");
  lines.push("");
  lines.push(`- Gemini 视频：${TOKEN_ASSUMPTIONS.geminiVideoTokensPerSecond} tokens/秒。`);
  lines.push(`- Gemini 音频：${TOKEN_ASSUMPTIONS.geminiAudioTokensPerSecond} tokens/秒。`);
  lines.push(`- 抽帧：桌面端默认 ${TOKEN_ASSUMPTIONS.deepseekFrameCount} 帧，每帧按 ${TOKEN_ASSUMPTIONS.visionImageTokens} tokens 估算。`);
  lines.push(`- 中文文本：${TOKEN_ASSUMPTIONS.chineseCharsPerToken} 字符/token；英文：${TOKEN_ASSUMPTIONS.englishCharsPerToken} 字符/token。`);
  lines.push("");
  lines.push("## 4. 单次成本");
  lines.push("");
  lines.push("| 场景 | 时长 | 模型 | 输入 tokens | 输出 tokens | 单次 USD | 单次 CNY |");
  lines.push("| --- | ---: | --- | ---: | ---: | ---: | ---: |");
  for (const row of rows) {
    lines.push(
      `| ${row.scenario.label} | ${row.scenario.durationSec}s | ${MODEL_PRICING[row.model].label} | ${row.inputTokens.toLocaleString("en-US")} | ${row.usage.outputTokens.toLocaleString("en-US")} | ${formatUsd(row.cost.totalCostUsd)} | ${formatCny(row.cost.totalCostCny)} |`
    );
  }
  lines.push("");
  lines.push("## 5. 月度成本");
  lines.push("");
  lines.push("| 场景 | 模型 | 100 次/月 | 1,000 次/月 | 10,000 次/月 |");
  lines.push("| --- | --- | ---: | ---: | ---: |");
  for (const row of rows) {
    lines.push(
      `| ${row.scenario.label} | ${MODEL_PRICING[row.model].label} | ${formatUsd(row.cost.totalCostUsd * 100)} | ${formatUsd(row.cost.totalCostUsd * 1000)} | ${formatUsd(row.cost.totalCostUsd * 10000)} |`
    );
  }
  lines.push("");
  lines.push("## 6. 单位经济");
  lines.push("");
  lines.push(`假设订阅价 ¥${PLAN.priceCny}/月，包含 ${PLAN.analysesPerMonth} 次分析：`);
  lines.push("");
  lines.push("| 场景 | 模型 | 单用户月成本 | 毛利率 |");
  lines.push("| --- | --- | ---: | ---: |");
  for (const row of rows) {
    const userCost = row.cost.totalCostCny * PLAN.analysesPerMonth;
    const margin = ((PLAN.priceCny - userCost) / PLAN.priceCny) * 100;
    lines.push(
      `| ${row.scenario.label} | ${MODEL_PRICING[row.model].label} | ${formatCny(userCost)} | ${margin.toFixed(1)}% |`
    );
  }
  lines.push("");
  lines.push("## 7. 解读");
  lines.push("");
  const typical = rows.filter((row) => row.scenario.label === "常规");
  const gemini = typical.find((row) => row.model === "gemini-2.5-flash");
  const deepseek = typical.find((row) => row.model === "deepseek-flash");
  if (gemini && deepseek) {
    lines.push(
      `- 常规 45 秒片段：Gemini 直传 ${formatUsd(gemini.cost.totalCostUsd)}/次，DeepSeek 抽 16 帧 ${formatUsd(deepseek.cost.totalCostUsd)}/次，后者约为前者的 1/${(gemini.cost.totalCostUsd / deepseek.cost.totalCostUsd).toFixed(1)}。`
    );
  }
  lines.push("- 抽帧更便宜，但丢失帧间连续动作，时间轴点评的连续性会下降。成本差异必须用质量差异来换。");
  lines.push("- 在当前单价下，模型调用不是主要成本；视频存储、带宽、失败重试和人工支持更值得盯。");
  lines.push("");

  const liveRun = loadLatestLiveRun(root);
  if (liveRun) {
    const usable = liveRun.results.filter((item) => item.usage != null);
    const actualCosts = liveRun.results
      .map((item) => item.cost.actualUsd)
      .filter((value): value is number => value != null);
    const estimatedCosts = liveRun.results.map((item) => item.cost.estimatedUsd);
    const actualInput = usable.map((item) => item.usage?.promptTokens ?? 0);
    const actualOutput = usable.map((item) => item.usage?.outputTokens ?? 0);

    const estimates = liveRun.results.map((item) =>
      estimateGeminiVideoUsage({
        durationSec: item.durationSec,
        promptText,
        outputText: item.raw ?? "",
        locale: "zh",
      })
    );
    const estimatedInput = estimates.map(
      (usage) =>
        (usage.inputTextTokens ?? 0) + (usage.inputVideoTokens ?? 0)
    );
    const estimatedOutput = estimates.map((usage) => usage.outputTokens);

    lines.push("## 8. 真实调用校准");
    lines.push("");
    lines.push(
      `来源：\`evals/runs/${liveRun.runId}\`，${liveRun.results.length} 条真实视频，Gemini 直传，成本取自 provider 返回的 usageMetadata。`
    );
    lines.push("");
    lines.push("| 项 | 估算 | 实测 | 估算偏差（正数=高估） |");
    lines.push("| --- | ---: | ---: | ---: |");
    const avgActualCost = mean(actualCosts);
    const avgEstCost = mean(estimatedCosts);
    lines.push(
      `| 单条成本 | ${formatUsd(avgEstCost ?? 0)} | ${formatUsd(avgActualCost ?? 0)} | ${drift(avgEstCost, avgActualCost)} |`
    );
    lines.push(
      `| 单条输入 tokens | ${Math.round(mean(estimatedInput) ?? 0).toLocaleString("en-US")} | ${Math.round(mean(actualInput) ?? 0).toLocaleString("en-US")} | ${drift(mean(estimatedInput), mean(actualInput))} |`
    );
    lines.push(
      `| 单条输出 tokens | ${Math.round(mean(estimatedOutput) ?? 0).toLocaleString("en-US")} | ${Math.round(mean(actualOutput) ?? 0).toLocaleString("en-US")} | ${drift(mean(estimatedOutput), mean(actualOutput))} |`
    );
    lines.push("");

    const avgUpload = mean(
      liveRun.results
        .map((item) => item.uploadMs)
        .filter((value): value is number => value != null)
    );
    const avgGenerate = mean(
      liveRun.results
        .map((item) => item.generateMs)
        .filter((value): value is number => value != null)
    );
    const avgTotal = mean(
      liveRun.results
        .map((item) => item.totalMs)
        .filter((value): value is number => value != null)
    );
    lines.push(
      `端到端耗时：平均 ${
        avgTotal == null ? "—" : `${(avgTotal / 1000).toFixed(1)}s`
      }，其中上传 ${
        avgUpload == null ? "—" : `${(avgUpload / 1000).toFixed(1)}s`
      }，生成 ${
        avgGenerate == null ? "—" : `${(avgGenerate / 1000).toFixed(1)}s`
      }。`
    );
    lines.push("");
    lines.push(
      "- 估算偏差主要来自输出长度：同一条 46 秒视频两次运行分别产出 16 段和 29 段，输出 token 相差近一倍，这部分模型不保证。"
    );
    lines.push(
      "- 因此月度预算要在这个实测值上留 10% 余量，而不是直接用理论估算值。"
    );
    lines.push("");
  }

  lines.push("## 9. 更新方法");
  lines.push("");
  lines.push("1. 改 `lib/ai-cost.ts` 里的 `MODEL_PRICING` 或 `TOKEN_ASSUMPTIONS`。");
  lines.push("2. 跑 `npm run cost:report` 重新生成本文档。");
  lines.push("3. 每次跑完 `eval:live` 后重跑本脚本，第 8 节会自动换成最新一次真实调用。");
  lines.push("");

  const output = lines.join("\n");
  const outFile = path.join(root, "docs", "quality", "cost-model.md");
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, output, "utf8");
  console.log(output);
  console.log(`\n成本模型已写入 ${path.relative(root, outFile)}`);
}

main();
