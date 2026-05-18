/** 将 Gemini / 网络错误的原始信息完整打印到服务端日志（Vercel Logs） */
export function logGeminiError(context: string, err: unknown): void {
  const tag = `[analyze/${context}]`;
  console.error(`${tag} ========== 原始错误开始 ==========`);

  if (err instanceof Error) {
    console.error(`${tag} name:`, err.name);
    console.error(`${tag} message:`, err.message);
    console.error(`${tag} stack:`, err.stack);
  } else {
    console.error(`${tag} non-Error value:`, err);
  }

  const record = err as Record<string, unknown>;

  const keys = [
    "status",
    "statusText",
    "code",
    "cause",
    "response",
    "errorDetails",
    "details",
    "errors",
  ] as const;

  for (const key of keys) {
    if (record[key] !== undefined) {
      try {
        console.error(
          `${tag} ${key}:`,
          typeof record[key] === "string"
            ? record[key]
            : JSON.stringify(record[key], null, 2)
        );
      } catch {
        console.error(`${tag} ${key}:`, record[key]);
      }
    }
  }

  try {
    const serialized =
      err instanceof Error
        ? {
            ...err,
            name: err.name,
            message: err.message,
            stack: err.stack,
            ...(err as unknown as Record<string, unknown>),
          }
        : err;
    console.error(`${tag} JSON:`, JSON.stringify(serialized, null, 2));
  } catch {
    console.error(`${tag} 无法 JSON 序列化该错误`);
  }

  console.error(`${tag} ========== 原始错误结束 ==========`);
}

export function logInfo(context: string, message: string, data?: unknown): void {
  const tag = `[analyze/${context}]`;
  if (data !== undefined) {
    console.log(`${tag} ${message}`, data);
  } else {
    console.log(`${tag} ${message}`);
  }
}
