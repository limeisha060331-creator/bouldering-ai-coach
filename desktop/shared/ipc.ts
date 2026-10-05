/** 主进程 ⇄ 渲染进程的共享类型契约（不依赖 electron，可被单测直接引用） */

import type { AnalysisProvider } from "./providers";

export type { AnalysisProvider, ProviderCapability } from "./providers";

export type UiLocale = "zh" | "en";
export type AnalysisDepth = "light" | "deep";
export type AnalysisLocale = "zh" | "en";

export type JobStatus =
  | "uploaded"
  | "gemini_uploading"
  | "gemini_processing"
  | "analyzing"
  | "rate_limited"
  | "completed"
  | "failed";

export type AnalyzeStartPayload = {
  provider: AnalysisProvider;
  fileName: string;
  mimeType: string;
  depth: AnalysisDepth;
  locale: AnalysisLocale;
  originalSize: number;
  compressedSize: number;
  /** 视频字节；Gemini 直接分析视频，DeepSeek 不使用 */
  data: Uint8Array;
  /** 本地抽取的关键帧；DeepSeek 依赖它，Gemini 忽略 */
  frames: AnalyzeFrame[];
};

export type AnalyzeFrame = {
  /** 距视频起点的秒数 */
  seconds: number;
  /** MM:SS */
  timestamp: string;
  /** data:image/jpeg;base64,... */
  dataUrl: string;
};

export type AnalyzeStartResult = {
  jobId: string;
  estimatedSeconds: number;
};

export type AnalyzeProgressEvent = {
  jobId: string;
  status: JobStatus;
  phase: string;
  hint: string;
  elapsedSec: number;
  retryAfter?: string;
  error?: string;
  analysisAttempt?: number;
  analysis?: string;
};

export type ProviderSettings = {
  hasApiKey: boolean;
  maskedApiKey: string;
  model: string;
  defaultModel: string;
  /** 是否来自环境变量（只读，用户改不了） */
  fromEnv: boolean;
  needsFrames: boolean;
  supportsVideo: boolean;
  label: string;
  homepage: string;
};

export type SettingsSnapshot = {
  /** 当前生效的后端 */
  provider: AnalysisProvider;
  /** 当前后端的视图，渲染层最常用 */
  active: ProviderSettings;
  providers: Record<AnalysisProvider, ProviderSettings>;
};

export type PublicUser = {
  id: string;
  email: string;
  displayName: string | null;
  createdAt: string;
};

export type AuthResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type SaveTextFilePayload = {
  defaultFileName: string;
  content: string;
  mimeType?: string;
};

export type SaveBinaryFilePayload = {
  defaultFileName: string;
  data: Uint8Array;
  mimeType?: string;
};

export type SaveFileResult = {
  saved: boolean;
  filePath?: string;
  error?: string;
};

export type AppInfo = {
  name: string;
  version: string;
  platform: string;
  electron: string;
  chrome: string;
  node: string;
  userDataPath: string;
};

/** preload 通过 contextBridge 暴露给渲染进程的 API */
export type CruxApi = {
  settings: {
    get(): Promise<SettingsSnapshot>;
    setProvider(provider: AnalysisProvider): Promise<SettingsSnapshot>;
    setApiKey(
      provider: AnalysisProvider,
      apiKey: string
    ): Promise<SettingsSnapshot>;
    setModel(
      provider: AnalysisProvider,
      model: string
    ): Promise<SettingsSnapshot>;
  };
  analyze: {
    start(payload: AnalyzeStartPayload): Promise<AnalyzeStartResult>;
    cancel(jobId: string): Promise<void>;
    onProgress(listener: (event: AnalyzeProgressEvent) => void): () => void;
  };
  auth: {
    me(): Promise<{ user: PublicUser | null; configured: boolean }>;
    register(input: {
      email: string;
      password: string;
      displayName?: string;
    }): Promise<AuthResult<PublicUser>>;
    login(input: {
      email: string;
      password: string;
    }): Promise<AuthResult<PublicUser>>;
    logout(): Promise<void>;
  };
  files: {
    saveText(payload: SaveTextFilePayload): Promise<SaveFileResult>;
    saveBinary(payload: SaveBinaryFilePayload): Promise<SaveFileResult>;
    openPath(filePath: string): Promise<void>;
  };
  app: {
    info(): Promise<AppInfo>;
    openExternal(url: string): Promise<void>;
  };
};
