import { app, BrowserWindow, net, protocol, shell } from "electron";
import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { SettingsStore } from "./settings-store";
import { AuthStore } from "./auth-store";
import { registerIpc } from "./ipc";

const RENDERER_SCHEME = "app";
const RENDERER_HOST = "bundle";
const RENDERER_ORIGIN = `${RENDERER_SCHEME}://${RENDERER_HOST}`;

const devServerUrl = process.env.VITE_DEV_SERVER_URL?.trim();
const isDev = Boolean(devServerUrl);

/** 仅在生产构建注入严格 CSP；dev 需要 Vite 的行内脚本与 HMR websocket */
const PRODUCTION_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' blob: data:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join("; ");

protocol.registerSchemesAsPrivileged([
  {
    scheme: RENDERER_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      corsEnabled: true,
    },
  },
]);

let mainWindow: BrowserWindow | null = null;

function rendererDistDir(): string {
  return path.join(app.getAppPath(), "dist");
}

async function fileExists(target: string): Promise<boolean> {
  try {
    const stat = await fs.stat(target);
    return stat.isFile();
  } catch {
    return false;
  }
}

/**
 * 用自定义 app:// 协议加载打包后的前端：
 * 既保证 SPA 深链可用，也让渲染进程拥有稳定 origin（IndexedDB 才能持久化）。
 */
function registerRendererProtocol(): void {
  protocol.handle(RENDERER_SCHEME, async (request) => {
    const distDir = rendererDistDir();
    const url = new URL(request.url);
    let pathname = decodeURIComponent(url.pathname);
    if (!pathname || pathname === "/") pathname = "/index.html";

    const direct = path.normalize(path.join(distDir, pathname));
    const isInsideDist =
      direct === distDir || direct.startsWith(distDir + path.sep);
    if (!isInsideDist) {
      return new Response("Forbidden", { status: 403 });
    }

    // 资源缺失时回落到 index.html，交给前端路由处理
    const target = (await fileExists(direct))
      ? direct
      : path.join(distDir, "index.html");

    const response = await net.fetch(pathToFileURL(target).toString());
    if (!target.endsWith(".html")) return response;

    const headers = new Headers(response.headers);
    headers.set("Content-Security-Policy", PRODUCTION_CSP);
    return new Response(response.body, {
      status: response.status,
      headers,
    });
  });
}

function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, payload);
    }
  }
}

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    show: false,
    backgroundColor: "#e8e5df",
    title: "CRUX 抱石",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  mainWindow.once("ready-to-show", () => mainWindow?.show());

  const allowedOrigin = isDev ? devServerUrl! : RENDERER_ORIGIN;
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(allowedOrigin)) {
      event.preventDefault();
      if (/^https?:/.test(url)) void shell.openExternal(url);
    }
  });

  if (isDev) {
    await mainWindow.loadURL(devServerUrl!);
  } else {
    await mainWindow.loadURL(`${RENDERER_ORIGIN}/index.html`);
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(async () => {
    const userData = app.getPath("userData");
    const settings = new SettingsStore(path.join(userData, "settings.json"));
    const auth = new AuthStore(path.join(userData, "accounts.json"));
    await Promise.all([settings.load(), auth.load()]);
    settings.applyToEnv();

    if (!isDev) registerRendererProtocol();
    registerIpc({ settings, auth, broadcast });

    await createWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) void createWindow();
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}
