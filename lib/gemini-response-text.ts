import {
  BlockReason,
  FinishReason,
  type GenerateContentResponse,
} from "@google/generative-ai";

export class GeminiEmptyAnalysisError extends Error {
  readonly userHint: string;
  readonly retryable: boolean;

  constructor(userHint: string, retryable = true) {
    super(userHint);
    this.name = "GeminiEmptyAnalysisError";
    this.userHint = userHint;
    this.retryable = retryable;
  }
}

const BLOCKED_FINISH: FinishReason[] = [
  FinishReason.SAFETY,
  FinishReason.RECITATION,
  FinishReason.BLOCKLIST,
  FinishReason.PROHIBITED_CONTENT,
  FinishReason.SPII,
  FinishReason.LANGUAGE,
];

function finishReasonMessage(reason?: FinishReason, finishMessage?: string): string {
  if (finishMessage?.trim()) return finishMessage.trim();
  switch (reason) {
    case FinishReason.SAFETY:
      return "输出被安全策略拦截";
    case FinishReason.PROHIBITED_CONTENT:
      return "内容被判定为不适宜";
    case FinishReason.RECITATION:
      return "因版权/复述限制未生成";
    case FinishReason.MAX_TOKENS:
      return "输出长度达到上限后中断（可尝试「轻量」模式或更短视频）";
    case FinishReason.BLOCKLIST:
      return "命中屏蔽词表";
    default:
      return reason ? `结束原因：${reason}` : "未知原因";
  }
}

/** 从 candidates 拼接文本（比 response.text() 更能拿到部分结果与诊断信息） */
export function extractAnalysisTextFromResponse(
  response: GenerateContentResponse
): string {
  const promptBlock = response.promptFeedback?.blockReason;
  if (promptBlock) {
    const reason =
      promptBlock === BlockReason.SAFETY
        ? "输入（视频或提示）被安全策略拦截"
        : `输入被拦截（${promptBlock}）`;
    throw new GeminiEmptyAnalysisError(
      `${reason}。请换更短、画面清晰的攀爬片段后重试。`,
      true
    );
  }

  const candidates = response.candidates ?? [];
  if (candidates.length === 0) {
    throw new GeminiEmptyAnalysisError(
      "模型未返回任何候选结果。请稍后重试，或改用「轻量」分析、缩短视频。",
      true
    );
  }

  const chunks: string[] = [];
  for (const c of candidates) {
    const parts = c.content?.parts ?? [];
    for (const p of parts) {
      if (typeof p.text === "string" && p.text.trim()) {
        chunks.push(p.text);
      }
    }
  }

  const text = chunks.join("\n").trim();
  if (text) return text;

  const first = candidates[0];
  const reason = first.finishReason;
  const detail = finishReasonMessage(reason, first.finishMessage);

  if (reason && BLOCKED_FINISH.includes(reason)) {
    throw new GeminiEmptyAnalysisError(
      `分析未生成：${detail}。若视频正常，可换更短片段、改用「轻量」深度后重试。`,
      true
    );
  }

  throw new GeminiEmptyAnalysisError(
    `模型未返回分析文本（${detail}）。请保持视频在 4MB、90 秒内，或切换「轻量」深度后重试。`,
    true
  );
}

export function isGeminiEmptyAnalysisError(
  err: unknown
): err is GeminiEmptyAnalysisError {
  return err instanceof GeminiEmptyAnalysisError;
}
