export const ANALYSIS_PROMPT = `
你是一位专业的抱石（Bouldering）教练。请根据这段攀爬视频，用中文输出分析。

【输出格式要求 — 必须严格遵守】
1. 第一行写：动作评分：XX/100（XX 为 0-100 整数）
2. 第二行写：教练金句：（一句鼓舞或点醒的关键话，不超过 40 字）
3. 空一行后写「逐帧分析」，之后每条分析必须带时间戳，格式严格为：
   [MM:SS] 具体分析内容
   至少 3 条、最多 8 条，时间戳按视频真实节奏递增。
4. 空一行后写「总结」，2-3 句整体评价。

语气鼓励、具体、适合初学者。若看不清或不是攀爬视频，请如实说明，仍保持上述格式。
`.trim();

/** 默认模型（1.5-flash 已对许多新 Key 停用，改用 2.0） */
const DEFAULT_MODEL = "gemini-2.0-flash";

/** 可在 .env.local / Vercel 设置 GEMINI_MODEL 覆盖 */
export function getGeminiModelId(): string {
  return process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;
}
