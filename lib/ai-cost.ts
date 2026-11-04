import type { AnalysisLocale } from "./types";

/**
 * 成本模型只负责“把 token 换算成钱”，不负责判断模型好坏。
 *
 * 价格会变。这里的单价是 2026-10 的公开挂牌价，用于做方案估算与月度预算；
 * 真实账单请以 provider 的 usage 字段为准，接入时把 mode 标成 actual。
 */

export const MODEL_IDS = ["gemini-2.5-flash", "deepseek-flash"] as const;
export type ModelId = (typeof MODEL_IDS)[number];

export type TokenUsage = {
  /** 未命中缓存的文本输入 token */
  inputTextTokens?: number;
  inputImageTokens?: number;
  inputVideoTokens?: number;
  inputAudioTokens?: number;
  /** 命中缓存的输入 token，单独计价；不要与 inputTextTokens 重复 */
  cachedInputTokens?: number;
  outputTokens: number;
};

export type ModelPricing = {
  id: ModelId;
  label: string;
  provider: string;
  asOf: string;
  source: string;
  currency: "USD";
  inputPerMillion: {
    text: number;
    image: number;
    video: number;
    audio: number;
  };
  cachedInputPerMillion?: number;
  outputPerMillion: number;
  notes?: string;
};

export const MODEL_PRICING: Record<ModelId, ModelPricing> = {
  /**
   * 仅用于历史成本对比：运行时已不再调用 Gemini，
   * 保留这一行是为了让 cost-report 能回答「当初为什么换 DeepSeek」。
   */
  "gemini-2.5-flash": {
    id: "gemini-2.5-flash",
    label: "Gemini 2.5 Flash",
    provider: "Google",
    asOf: "2026-10-20",
    source: "https://ai.google.dev/gemini-api/docs/pricing",
    currency: "USD",
    inputPerMillion: { text: 0.3, image: 0.3, video: 0.3, audio: 1.0 },
    cachedInputPerMillion: 0.03,
    outputPerMillion: 2.5,
  },
  "deepseek-flash": {
    id: "deepseek-flash",
    label: "DeepSeek V4.1 Flash",
    provider: "DeepSeek",
    asOf: "2026-10-25",
    source: "https://api-docs.deepseek.com/quick_start/pricing/",
    currency: "USD",
    inputPerMillion: { text: 0.15, image: 0.15, video: 0, audio: 0 },
    outputPerMillion: 0.6,
    notes: "图片按文本输入同价估算；不支持视频/音频输入。",
  },
};

/**
 * Token 估算假设。官方没有给出“中文每字多少 token”的固定值，
 * 这里用字符数折算，只用于预算，不用于对账。
 */
export const TOKEN_ASSUMPTIONS = {
  /** Gemini 官方：视频 263 tokens/秒（静态处理） */
  geminiVideoTokensPerSecond: 263,
  /** Gemini 官方：音频 32 tokens/秒 */
  geminiAudioTokensPerSecond: 32,
  /** Gemini 小图 258 tokens/张；DeepSeek 抽帧按同量级保守估算 */
  visionImageTokens: 258,
  /** 中文按 1.6 字符/token，英文按 4 字符/token */
  chineseCharsPerToken: 1.6,
  englishCharsPerToken: 4,
  /** 桌面端默认抽帧数 */
  deepseekFrameCount: 16,
} as const;

export const FX_ASSUMPTIONS = {
  usdToCny: 7.1,
  asOf: "2026-10-25",
} as const;

export type CostBreakdown = {
  model: ModelId;
  currency: "USD";
  inputCostUsd: number;
  outputCostUsd: number;
  totalCostUsd: number;
  totalCostCny: number;
  usage: TokenUsage;
};

export function estimateTextTokens(
  text: string,
  locale: AnalysisLocale
): number {
  const normalized = text.trim();
  if (!normalized) return 0;
  const charsPerToken =
    locale === "zh"
      ? TOKEN_ASSUMPTIONS.chineseCharsPerToken
      : TOKEN_ASSUMPTIONS.englishCharsPerToken;
  return Math.ceil(normalized.length / charsPerToken);
}

export function estimateGeminiVideoUsage(input: {
  durationSec: number;
  promptText: string;
  outputText: string;
  locale: AnalysisLocale;
}): TokenUsage {
  return {
    inputTextTokens: estimateTextTokens(input.promptText, input.locale),
    inputVideoTokens: Math.ceil(
      input.durationSec * TOKEN_ASSUMPTIONS.geminiVideoTokensPerSecond
    ),
    outputTokens: estimateTextTokens(input.outputText, input.locale),
  };
}

export function estimateDeepSeekFrameUsage(input: {
  frameCount?: number;
  promptText: string;
  outputText: string;
  locale: AnalysisLocale;
}): TokenUsage {
  const frameCount =
    input.frameCount ?? TOKEN_ASSUMPTIONS.deepseekFrameCount;
  return {
    inputTextTokens: estimateTextTokens(input.promptText, input.locale),
    inputImageTokens: frameCount * TOKEN_ASSUMPTIONS.visionImageTokens,
    outputTokens: estimateTextTokens(input.outputText, input.locale),
  };
}

export function computeCost(
  model: ModelId,
  usage: TokenUsage
): CostBreakdown {
  const pricing = MODEL_PRICING[model];
  const perMillion = 1_000_000;

  const inputCostUsd =
    ((usage.inputTextTokens ?? 0) / perMillion) *
      pricing.inputPerMillion.text +
    ((usage.inputImageTokens ?? 0) / perMillion) *
      pricing.inputPerMillion.image +
    ((usage.inputVideoTokens ?? 0) / perMillion) *
      pricing.inputPerMillion.video +
    ((usage.inputAudioTokens ?? 0) / perMillion) *
      pricing.inputPerMillion.audio +
    ((usage.cachedInputTokens ?? 0) / perMillion) *
      (pricing.cachedInputPerMillion ?? pricing.inputPerMillion.text);

  const outputCostUsd =
    (usage.outputTokens / perMillion) * pricing.outputPerMillion;

  const totalCostUsd = inputCostUsd + outputCostUsd;

  return {
    model,
    currency: "USD",
    inputCostUsd,
    outputCostUsd,
    totalCostUsd,
    totalCostCny: totalCostUsd * FX_ASSUMPTIONS.usdToCny,
    usage,
  };
}

export function formatUsd(amount: number): string {
  if (!Number.isFinite(amount)) return "$0";
  const digits = amount > 0 && amount < 0.01 ? 4 : amount < 1 ? 3 : 2;
  return `$${amount.toFixed(digits)}`;
}

export function formatCny(amount: number): string {
  if (!Number.isFinite(amount)) return "¥0";
  const digits = amount > 0 && amount < 0.01 ? 4 : amount < 1 ? 3 : 2;
  return `¥${amount.toFixed(digits)}`;
}
