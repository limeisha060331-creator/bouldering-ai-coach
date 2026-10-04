/** 需要稍后重试（而非立即失败）的分析错误 */
export class RetryLaterError extends Error {
  readonly waitSeconds: number;
  readonly retryable = true;

  constructor(message: string, waitSeconds = 5) {
    super(message);
    this.name = "RetryLaterError";
    this.waitSeconds = waitSeconds;
  }
}

export function isRetryLaterError(err: unknown): err is RetryLaterError {
  return err instanceof RetryLaterError;
}
