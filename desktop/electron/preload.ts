import { contextBridge, ipcRenderer } from "electron";
import type {
  AnalyzeProgressEvent,
  AnalyzeStartPayload,
  CruxApi,
} from "@shared/ipc";

const api: CruxApi = {
  settings: {
    get: () => ipcRenderer.invoke("settings:get"),
    setApiKey: (apiKey: string) => ipcRenderer.invoke("settings:setApiKey", apiKey),
    setModel: (model: string) => ipcRenderer.invoke("settings:setModel", model),
  },
  analyze: {
    start: (payload: AnalyzeStartPayload) =>
      ipcRenderer.invoke("analyze:start", payload),
    cancel: (jobId: string) => ipcRenderer.invoke("analyze:cancel", jobId),
    onProgress: (listener: (event: AnalyzeProgressEvent) => void) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        payload: AnalyzeProgressEvent
      ) => listener(payload);
      ipcRenderer.on("analyze:progress", handler);
      return () => {
        ipcRenderer.removeListener("analyze:progress", handler);
      };
    },
  },
  auth: {
    me: () => ipcRenderer.invoke("auth:me"),
    register: (input) => ipcRenderer.invoke("auth:register", input),
    login: (input) => ipcRenderer.invoke("auth:login", input),
    logout: () => ipcRenderer.invoke("auth:logout"),
  },
  files: {
    saveText: (payload) => ipcRenderer.invoke("files:saveText", payload),
    saveBinary: (payload) => ipcRenderer.invoke("files:saveBinary", payload),
    openPath: (filePath: string) => ipcRenderer.invoke("files:openPath", filePath),
  },
  app: {
    info: () => ipcRenderer.invoke("app:info"),
  },
};

contextBridge.exposeInMainWorld("crux", api);
