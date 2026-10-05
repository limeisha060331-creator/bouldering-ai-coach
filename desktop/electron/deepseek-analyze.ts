import type { AnalysisDepth, AnalysisLocale, AnalyzeFrame } from "@shared/ipc";
import {
  DEEPSEEK_BASE_URL,
  DEFAULT_DEEPSEEK_MODEL,
} from "@shared/providers";

export const DEEPSEEK_CHAT_PATH = "/chat/completions";
/** 关键帧数量上限（官方限制单请求 600 张，这里只取精华） */
export const DEEPSEEK_MAX_FRAMES = 24;

const ZH_DEEP = [
  "你是极其专业的精英抱石教练。我上传的是一段攀爬视频按时间顺序抽取的关键帧，每张图前标注了该帧在视频中的时间。",
  "分析要求：",
  "逐帧细节：结合画面与时间标注，指出技术失误或体能浪费点，尽量覆盖起手、中段与收顶。",
  "核心维度评估：",
  "重心与身体位置：髋部与墙面的关系、重心转换的流畅度。",
  "发力与动作技术：惯性的利用，折膝、侧拉、挂旗等技术是否到位。",
  "抓握与踩脚：踩点精准度、脚尖受力、无效微调。",
  "最终改进方案：给出针对性的专项练习动作或力量训练建议。",
  "风格约束：",
  "语言专业、简洁、犀利、一针见血；严厉但不过分毒舌。",
  "禁止使用任何双引号。",
  "每条带时间的点评单独一行，时间格式严格为 [MM:SS] 开头，时间应取自给出的关键帧时间。",
  "必须输出完整分析正文，不得返回空白或仅写无法分析。",
  "若能从画面判断线路难度，请在正文开头单独一行写：难度：V数字（例如 难度：V6，仅 V0–V10）。",
  "请在正文开头另起一行写：评分：数字/100；再起一行写：教练金句：一句话。",
  "重要：输入是离散关键帧而非连续视频，帧之间的动作细节你无法看到。凡是画面无法支撑的判断，请明确说明依据不足，不要编造。",
].join("\n");

const ZH_LIGHT_SUFFIX = [
  "【轻量模式】全文控制在约 900 字以内；[MM:SS] 时间戳行 3～5 条即可；总结不超过 4 句。",
].join("\n");

const EN_DEEP = [
  "You are an elite professional bouldering coach. You are given key frames sampled in chronological order from a climbing video; each frame is preceded by its timestamp in the clip.",
  "Requirements:",
  "Frame-by-frame detail: use the picture and its timestamp to point out technical errors or wasted energy, covering the start, the middle and the top-out where possible.",
  "Core dimensions:",
  "Hips and body position: relationship of the hips to the wall, quality of weight shifts.",
  "Power and technique: use of momentum; drop-knee, side-pull, flagging.",
  "Feet and hands: foot placement precision, toe loading, pointless micro-adjustments.",
  "Action plan: specific drills or strength work.",
  "Style:",
  "Professional, concise, sharp. Strict but not cruel.",
  "Do not use double quotation marks anywhere.",
  "Each timestamped comment must be its own line starting strictly with [MM:SS], using the timestamps provided.",
  "Always return a full written analysis; never return blank output or a bare refusal.",
  "If the route difficulty is discernible, add a standalone first line: 难度：Vn (V0-V10).",
  "Add standalone lines 评分：NN/100 and 教练金句：one sentence near the top.",
  "Important: the input is a set of discrete key frames, not a continuous video. Never invent motion you cannot see; state explicitly when the evidence is insufficient.",
].join("\n");

const EN_LIGHT_SUFFIX =
  "[Light mode] Keep the answer under ~700 English words; 3-5 [MM:SS] lines only; summary in at most 4 short sentences.";

export function getFrameAnalysisPrompt(
  depth: AnalysisDepth,
  locale: AnalysisLocale,
  frameCount: number
): string {
  const base = locale === "en" ? EN_DEEP : ZH_DEEP;
  const suffix =
    depth === "light"
      ? locale === "en"
        ? EN_LIGHT_SUFFIX
        : ZH_LIGHT_SUFFIX
      : "";
  const total =
    locale === "en"
      ? `Total frames: ${frameCount}.`
      : `本次共 ${frameCount} 张关键帧。`;
  return `${base}\n${total}\n${suffix}`.trim();
}

export function getDeepSeekMaxTokens(depth: AnalysisDepth): number {
  return depth === "light" ? 4096 : 16_384;
}

export type DeepSeekContentBlock =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export type DeepSeekMessage = {
  role: "system" | "user";
  content: string | DeepSeekContentBlock[];
};

export type DeepSeekRequest = {
  url: string;
  headers: Record<string, string>;
  body: {
    model: string;
    messages: DeepSeekMessage[];
    max_tokens: number;
    stream: false;
    thinking?: { type: "enabled" | "disabled" };
  };
};

export type BuildDeepSeekRequestOptions = {
  apiKey: string;
  model?: string;
  depth: AnalysisDepth;
  locale: AnalysisLocale;
  frames: AnalyzeFrame[];
  baseUrl?: string;
};

/**
 * 构造 OpenAI 兼容的 Chat Completions 请求。
 * 每张关键帧前插入一行时间标注，模型才能给出 [MM:SS] 级别的点评。
 */
export function buildDeepSeekRequest(
  options: BuildDeepSeekRequestOptions
): DeepSeekRequest {
  const {
    apiKey,
    model = DEFAULT_DEEPSEEK_MODEL,
    depth,
    locale,
    frames,
    baseUrl = DEEPSEEK_BASE_URL,
  } = options;

  const content: DeepSeekContentBlock[] = [
    {
      type: "text",
      text: `${getFrameAnalysisPrompt(depth, locale, frames.length)}\n\n${
        locale === "en"
          ? "Key frames follow in chronological order:"
          : "以下为按时间顺序排列的关键帧："
      }`,
    },
  ];

  frames.forEach((frame, index) => {
    content.push({
      type: "text",
      text:
        locale === "en"
          ? `Frame ${index + 1}/${frames.length} · timestamp ${frame.timestamp}`
          : `第 ${index + 1}/${frames.length} 帧 · 时间 ${frame.timestamp}`,
    });
    content.push({ type: "image_url", image_url: { url: frame.dataUrl } });
  });

  const body: DeepSeekRequest["body"] = {
    model,
    messages: [{ role: "user", content }],
    max_tokens: getDeepSeekMaxTokens(depth),
    stream: false,
  };

  // 轻量模式关掉思考链，更快也更省
  if (depth === "light") {
    body.thinking = { type: "disabled" };
  }

  return {
    url: `${baseUrl.replace(/\/$/, "")}${DEEPSEEK_CHAT_PATH}`,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body,
  };
}

export class DeepSeekApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly retryable: boolean,
    readonly waitSeconds: number = 0
  ) {
    super(message);
    this.name = "DeepSeekApiError";
  }
}

export class DeepSeekEmptyAnalysisError extends Error {
  readonly retryable = true;
  constructor(message: string) {
    super(message);
    this.name = "DeepSeekEmptyAnalysisError";
  }
}

export function isDeepSeekApiError(err: unknown): err is DeepSeekApiError {
  return err instanceof DeepSeekApiError;
}

export function isDeepSeekEmptyAnalysisError(
  err: unknown
): err is DeepSeekEmptyAnalysisError {
  return err instanceof DeepSeekEmptyAnalysisError;
}

const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);

/** 把 HTTP 状态与官方错误码翻译成用户可理解的文案 */
export function describeDeepSeekStatus(
  status: number,
  detail?: string
): { message: string; retryable: boolean; waitSeconds: number } {
  const extra = detail?.trim() ? `（${detail.trim().slice(0, 160)}）` : "";
  switch (status) {
    case 401:
      return {
        message: "DeepSeek API Key 无效或已失效，请在「设置」中重新填写。",
        retryable: false,
        waitSeconds: 0,
      };
    case 402:
      return {
        message:
          "DeepSeek 账户余额不足，请到 platform.deepseek.com 充值后再试。",
        retryable: false,
        waitSeconds: 0,
      };
    case 400:
    case 422:
      return {
        message: `DeepSeek 拒绝了这次请求${extra}。请尝试「轻量」深度或更换视频片段。`,
        retryable: false,
        waitSeconds: 0,
      };
    case 429:
      return {
        message: "DeepSeek 触发限流，稍后会自动重试…",
        retryable: true,
        waitSeconds: 20,
      };
    default:
      break;
  }
  if (RETRYABLE_STATUS.has(status) || status >= 500) {
    return {
      message: `DeepSeek 服务暂时不可用（${status}），稍后会自动重试…`,
      retryable: true,
      waitSeconds: 15,
    };
  }
  return {
    message: `DeepSeek 请求失败（HTTP ${status}）${extra}`,
    retryable: false,
    waitSeconds: 0,
  };
}

type DeepSeekResponseJson = {
  choices?: {
    message?: { content?: string | null };
    finish_reason?: string | null;
  }[];
  error?: { message?: string; code?: string | number; type?: string };
};

/** 从响应体中取出分析正文；空正文抛可重试错误 */
export function parseDeepSeekResponse(json: DeepSeekResponseJson): string {
  const choice = json.choices?.[0];
  const text = choice?.message?.content?.trim();
  if (text) return text;

  const finish = choice?.finish_reason;
  if (finish === "length") {
    throw new DeepSeekEmptyAnalysisError(
      "输出长度达到上限被截断，未拿到完整分析。请改用「轻量」深度或换更短的片段后重试。"
    );
  }
  if (finish === "content_filter") {
    throw new DeepSeekEmptyAnalysisError(
      "输出被内容策略拦截。请换一段画面更清晰的攀爬片段后重试。"
    );
  }
  throw new DeepSeekEmptyAnalysisError(
    `DeepSeek 未返回分析正文${finish ? `（结束原因：${finish}）` : ""}。将自动重试，或改用「轻量」深度。`
  );
}

export type RunDeepSeekOptions = BuildDeepSeekRequestOptions & {
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
};

/** 调用 DeepSeek Chat Completions（图像理解），返回分析正文 */
export async function runDeepSeekAnalysis(
  options: RunDeepSeekOptions
): Promise<string> {
  const doFetch = options.fetchImpl ?? fetch;
  const request = buildDeepSeekRequest(options);

  let response: Response;
  try {
    response = await doFetch(request.url, {
      method: "POST",
      headers: request.headers,
      body: JSON.stringify(request.body),
      signal: options.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") throw err;
    const detail = err instanceof Error ? err.message : String(err);
    throw new DeepSeekApiError(
      0,
      `无法连接 DeepSeek（${detail}）。请检查网络后重试。`,
      true,
      10
    );
  }

  let json: DeepSeekResponseJson;
  try {
    json = (await response.json()) as DeepSeekResponseJson;
  } catch {
    const status = response.status;
    const { message, retryable, waitSeconds } = describeDeepSeekStatus(status);
    throw new DeepSeekApiError(status, message, retryable, waitSeconds);
  }

  if (!response.ok) {
    const { message, retryable, waitSeconds } = describeDeepSeekStatus(
      response.status,
      json.error?.message
    );
    throw new DeepSeekApiError(response.status, message, retryable, waitSeconds);
  }

  return parseDeepSeekResponse(json);
}
