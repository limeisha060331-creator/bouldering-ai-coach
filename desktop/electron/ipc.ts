import { app, BrowserWindow, ipcMain } from "electron";
import type {
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
import { openContainingPath, saveBinaryFile, saveTextFile } from "./file-io";

export type IpcOptions = {
  settings: SettingsStore;
  auth: AuthStore;
  broadcast: (channel: string, payload: unknown) => void;
};

export function registerIpc(options: IpcOptions): JobManager {
  const { settings, auth } = options;

  const jobManager = new JobManager({
    run: createGeminiRunner({ apiKey: () => settings.apiKey() }),
    onProgress: (event: AnalyzeProgressEvent) =>
      options.broadcast("analyze:progress", event),
  });

  ipcMain.handle("settings:get", (): SettingsSnapshot => settings.snapshot());

  ipcMain.handle(
    "settings:setApiKey",
    async (_event, apiKey: string): Promise<SettingsSnapshot> => {
      const snapshot = await settings.setApiKey(String(apiKey ?? ""));
      settings.applyToEnv();
      return snapshot;
    }
  );

  ipcMain.handle(
    "settings:setModel",
    async (_event, model: string): Promise<SettingsSnapshot> => {
      const snapshot = await settings.setModel(String(model ?? ""));
      settings.applyToEnv();
      return snapshot;
    }
  );

  ipcMain.handle("analyze:start", (_event, payload: AnalyzeStartPayload) => {
    if (!payload || !payload.data || payload.data.length === 0) {
      throw new Error("未收到视频数据，请重新选择文件。");
    }
    if (!settings.apiKey()) {
      throw new Error(
        "尚未配置 Gemini API Key，请先在「设置」中填写后再开始分析。"
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

  return jobManager;
}
