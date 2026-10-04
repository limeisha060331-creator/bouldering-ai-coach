import { mapGeminiError } from "@lib/gemini-analyze";
import { isGeminiEmptyAnalysisError } from "@lib/gemini-response-text";
import {
  formatGeminiDailyQuotaMessage,
  formatGeminiGenerateContentCooldownMessage,
  formatGeminiRpmRateLimitMessage,
  isGeminiDailyQuotaExceeded,
  isGeminiDailyQuotaHardStop,
  isGeminiRateLimitError,
  isGeminiRpmRateLimit,
  isGeminiTransientError,
  parseGeminiRetrySeconds,
} from "@lib/gemini-retry";
import { isRetryLaterError } from "./errors";

export type ErrorDecision = {
  message: string;
  retryable: boolean;
  waitSeconds: number;
  dailyQuotaExhausted: boolean;
};

/**
 * 把 Gemini / 网络错误翻译成任务状态机可执行的动作：
 * 是否重试、等多久、给用户看什么文案。
 */
export function classifyAnalysisError(err: unknown): ErrorDecision {
  if (isRetryLaterError(err)) {
    return {
      message: err.message,
      retryable: true,
      waitSeconds: err.waitSeconds,
      dailyQuotaExhausted: false,
    };
  }

  if (isGeminiDailyQuotaExceeded(err)) {
    if (isGeminiDailyQuotaHardStop(err)) {
      return {
        message: formatGeminiDailyQuotaMessage(err),
        retryable: false,
        waitSeconds: 0,
        dailyQuotaExhausted: true,
      };
    }
    return {
      message: formatGeminiGenerateContentCooldownMessage(err),
      retryable: true,
      waitSeconds: parseGeminiRetrySeconds(err),
      dailyQuotaExhausted: false,
    };
  }

  if (isGeminiEmptyAnalysisError(err)) {
    return {
      message: err.userHint,
      retryable: true,
      waitSeconds: 8,
      dailyQuotaExhausted: false,
    };
  }

  if (isGeminiTransientError(err)) {
    const waitSeconds = parseGeminiRetrySeconds(err);
    return {
      message: `Gemini 服务繁忙（503），约 ${waitSeconds} 秒后自动重试…`,
      retryable: true,
      waitSeconds,
      dailyQuotaExhausted: false,
    };
  }

  if (isGeminiRateLimitError(err)) {
    const waitSeconds = parseGeminiRetrySeconds(err);
    return {
      message: isGeminiRpmRateLimit(err)
        ? formatGeminiRpmRateLimitMessage(err)
        : `Gemini 短时限流，约 ${waitSeconds} 秒后自动重试…`,
      retryable: true,
      waitSeconds,
      dailyQuotaExhausted: false,
    };
  }

  return {
    message: mapGeminiError(err).message,
    retryable: false,
    waitSeconds: 0,
    dailyQuotaExhausted: false,
  };
}
