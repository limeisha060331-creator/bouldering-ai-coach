/** 主进程 ⇄ 渲染进程的共享类型契约（不依赖 electron，可被单测直接引用） */

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
  fileName: string;
  mimeType: string;
  depth: AnalysisDepth;
  locale: AnalysisLocale;
  originalSize: number;
  compressedSize: number;
  /** 压缩/转码后的视频字节 */
  data: Uint8Array;
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

export type SettingsSnapshot = {
  /** 是否已配置可用 API Key */
  hasApiKey: boolean;
  /** 掩码后的 Key，便于用户确认当前值 */
  maskedApiKey: string;
  model: string;
  defaultModel: string;
  /** 是否来自环境变量（只读，用户改不了） */
  fromEnv: boolean;
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
    setApiKey(apiKey: string): Promise<SettingsSnapshot>;
    setModel(model: string): Promise<SettingsSnapshot>;
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
  };
};
