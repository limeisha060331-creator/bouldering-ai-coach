import { app, BrowserWindow, ipcMain, shell } from "electron";
import type {
  AnalysisProvider,
  AnalyzeProgressEvent,
  AnalyzeStartPayload,
  AppInfo,
  AuthResult,
  PublicUser,
  SaveBinaryFilePayload,
  SaveTextFilePayload,
  SettingsSnapshot,
} from "@shared/ipc";
import type { AuthStore } from "./auth-store";
import type { SettingsStore } from "./settings-store";
import { JobManager } from "./job-manager";
import { createGeminiRunner } from "./gemini-runner";
import { createDeepSeekRunner } from "./deepseek-runner";
import { openContainingPath, saveBinaryFile, saveTextFile } from "./file-io";
import {
  PROVIDER_CAPABILITIES,
  isAnalysisProvider,
} from "@shared/providers";

export type IpcOptions = {
  settings: SettingsStore;
  auth: AuthStore;
  broadcast: (channel: string, payload: unknown) => void;
};

export function registerIpc(options: IpcOptions): JobManager {
  const { settings, auth } = options;

  const geminiRunner = createGeminiRunner({
    apiKey: () => settings.apiKey("gemini"),
  });
  const deepseekRunner = createDeepSeekRunner({
    apiKey: () => settings.apiKey("deepseek"),
    model: () => settings.model("deepseek"),
  });

  const jobManager = new JobManager({
    run: (job, hooks) =>
      job.provider === "gemini"
        ? geminiRunner(job, hooks)
        : deepseekRunner(job, hooks),
    onProgress: (event: AnalyzeProgressEvent) =>
      options.broadcast("analyze:progress", event),
  });

  ipcMain.handle("settings:get", (): SettingsSnapshot => settings.snapshot());

  ipcMain.handle(
    "settings:setProvider",
    async (_event, provider: AnalysisProvider): Promise<SettingsSnapshot> => {
      const next = isAnalysisProvider(provider) ? provider : settings.provider();
      const snapshot = await settings.setProvider(next);
      settings.applyToEnv();
      return snapshot;
    }
  );

  ipcMain.handle(
    "settings:setApiKey",
    async (
      _event,
      provider: AnalysisProvider,
      apiKey: string
    ): Promise<SettingsSnapshot> => {
      const target = isAnalysisProvider(provider) ? provider : settings.provider();
      const snapshot = await settings.setApiKey(target, String(apiKey ?? ""));
      settings.applyToEnv();
      return snapshot;
    }
  );

  ipcMain.handle(
    "settings:setModel",
    async (
      _event,
      provider: AnalysisProvider,
      model: string
    ): Promise<SettingsSnapshot> => {
      const target = isAnalysisProvider(provider) ? provider : settings.provider();
      const snapshot = await settings.setModel(target, String(model ?? ""));
      settings.applyToEnv();
      return snapshot;
    }
  );

  ipcMain.handle("analyze:start", (_event, payload: AnalyzeStartPayload) => {
    if (!payload || !isAnalysisProvider(payload.provider)) {
      throw new Error("分析请求缺少有效的后端标识，请重新选择文件。");
    }
    const capability = PROVIDER_CAPABILITIES[payload.provider];
    if (capability.needsFrames && !payload.frames?.length) {
      throw new Error("未收到关键帧数据，请重新选择视频。");
    }
    if (!capability.needsFrames && (!payload.data || payload.data.length === 0)) {
      throw new Error("未收到视频数据，请重新选择文件。");
    }
    if (!settings.apiKey(payload.provider)) {
      const label = capability.label;
      throw new Error(
        `尚未配置 ${label} API Key，请先在「设置」中填写后再开始分析。`
      );
    }
    return jobManager.start(payload);
  });

  ipcMain.handle("analyze:cancel", (_event, jobId: string) => {
    jobManager.cancel(String(jobId));
  });

  ipcMain.handle(
    "auth:me",
    (): { user: PublicUser | null; configured: boolean } => ({
      user: auth.current(),
      configured: true,
    })
  );

  ipcMain.handle(
    "auth:register",
    (
      _event,
      input: { email: string; password: string; displayName?: string }
    ): Promise<AuthResult<PublicUser>> =>
      auth.register({
        email: String(input?.email ?? ""),
        password: String(input?.password ?? ""),
        displayName: input?.displayName,
      })
  );

  ipcMain.handle(
    "auth:login",
    (
      _event,
      input: { email: string; password: string }
    ): Promise<AuthResult<PublicUser>> =>
      auth.login({
        email: String(input?.email ?? ""),
        password: String(input?.password ?? ""),
      })
  );

  ipcMain.handle("auth:logout", () => auth.logout());

  ipcMain.handle(
    "files:saveText",
    (event, payload: SaveTextFilePayload) =>
      saveTextFile(BrowserWindow.fromWebContents(event.sender), payload)
  );

  ipcMain.handle(
    "files:saveBinary",
    (event, payload: SaveBinaryFilePayload) =>
      saveBinaryFile(BrowserWindow.fromWebContents(event.sender), payload)
  );

  ipcMain.handle("files:openPath", (_event, filePath: string) =>
    openContainingPath(String(filePath ?? ""))
  );

  ipcMain.handle(
    "app:info",
    (): AppInfo => ({
      name: "CRUX 抱石",
      version: app.getVersion(),
      platform: process.platform,
      electron: process.versions.electron ?? "",
      chrome: process.versions.chrome ?? "",
      node: process.versions.node ?? "",
      userDataPath: app.getPath("userData"),
    })
  );

  ipcMain.handle("app:openExternal", async (_event, url: string) => {
    const target = String(url ?? "");
    if (/^https?:\/\//.test(target)) {
      await shell.openExternal(target);
    }
  });

  return jobManager;
}
