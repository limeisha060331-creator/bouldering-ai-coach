/** 可选的分析后端。DeepSeek 走「本地抽帧 + 图像理解」，Gemini 直接吃视频。 */
export const PROVIDERS = ["deepseek", "gemini"] as const;

export type AnalysisProvider = (typeof PROVIDERS)[number];

export const DEFAULT_PROVIDER: AnalysisProvider = "deepseek";

export const DEEPSEEK_BASE_URL = "https://api.deepseek.com";
export const DEFAULT_DEEPSEEK_MODEL = "deepseek-flash";

export type ProviderCapability = {
  /** 是否需要渲染进程先抽帧（DeepSeek 官方 API 不接受视频） */
  needsFrames: boolean;
  supportsVideo: boolean;
  label: string;
  homepage: string;
};

export const PROVIDER_CAPABILITIES: Record<
  AnalysisProvider,
  ProviderCapability
> = {
  deepseek: {
    needsFrames: true,
    supportsVideo: false,
    label: "DeepSeek",
    homepage: "https://platform.deepseek.com/api_keys",
  },
  gemini: {
    needsFrames: false,
    supportsVideo: true,
    label: "Google Gemini",
    homepage: "https://aistudio.google.com/apikey",
  },
};

export function isAnalysisProvider(value: unknown): value is AnalysisProvider {
  return (
    typeof value === "string" &&
    (PROVIDERS as readonly string[]).includes(value)
  );
}
