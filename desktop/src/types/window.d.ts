import type { CruxApi } from "@shared/ipc";

declare global {
  interface Window {
    /** preload 通过 contextBridge 注入 */
    crux: CruxApi;
  }
}

export {};
