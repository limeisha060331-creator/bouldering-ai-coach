/**
 * Vercel Serverless 单次请求体约 4.5MB（含 multipart 开销）。
 * 文件本体限制在 4MB，避免网关返回纯文本 "Request Entity Too Large" 导致前端 JSON 解析失败。
 */
export const MAX_ANALYZE_BYTES = 4 * 1024 * 1024;

export const MAX_ANALYZE_MB = MAX_ANALYZE_BYTES / 1024 / 1024;
