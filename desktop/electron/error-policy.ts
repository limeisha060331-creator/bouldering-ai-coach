import {
  isDeepSeekApiError,
  isDeepSeekEmptyAnalysisError,
} from "@lib/deepseek-analysis";
import { isRetryLaterError } from "./errors";

export type ErrorDecision = {
  message: string;
  retryable: boolean;
  waitSeconds: number;
};

/**
 * 把 DeepSeek / 网络错误翻译成任务状态机可执行的动作：
 * 是否重试、等多久、给用户看什么文案。
 */
export function classifyAnalysisError(err: unknown): ErrorDecision {
  if (isRetryLaterError(err)) {
    return {
      message: err.message,
      retryable: true,
      waitSeconds: err.waitSeconds,
    };
  }

  if (isDeepSeekApiError(err)) {
    return {
      message: err.message,
      retryable: err.retryable,
      waitSeconds: err.waitSeconds,
    };
  }

  if (isDeepSeekEmptyAnalysisError(err)) {
    return {
      message: err.message,
      retryable: true,
      waitSeconds: 8,
    };
  }

  return {
    message: err instanceof Error ? err.message : String(err),
    retryable: false,
    waitSeconds: 0,
  };
}
