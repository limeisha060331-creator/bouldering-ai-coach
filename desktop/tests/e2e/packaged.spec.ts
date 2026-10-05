import { test, expect, _electron as electron } from "@playwright/test";
import type { ElectronApplication, Page } from "@playwright/test";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * 打包产物冒烟测试：验证生产环境的 app:// 自定义协议 + asar 资源加载，
 * 以及 SPA 深链回落是否正常。未打包时自动跳过（npm run dist 后可用）。
 */
const packagedExe = path.join(
  process.cwd(),
  "release",
  "win-unpacked",
  "CRUX Boulder.exe"
);

test.skip(
  !existsSync(packagedExe),
  "未找到打包产物，先运行 npm run dist"
);

let app: ElectronApplication;
let page: Page;
let userDataDir: string;

test.beforeAll(async () => {
  userDataDir = await mkdtemp(path.join(tmpdir(), "crux-packaged-"));
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (key === "ELECTRON_RUN_AS_NODE") continue;
    if (typeof value === "string") env[key] = value;
  }

  app = await electron.launch({
    executablePath: packagedExe,
    args: [`--user-data-dir=${userDataDir}`],
    env,
  });
  page = await app.firstWindow();
  await page.waitForLoadState("domcontentloaded");
});

test.afterAll(async () => {
  await app?.close();
  await rm(userDataDir, { recursive: true, force: true });
});

test("打包应用从 app:// 协议加载本地资源并渲染首页", async () => {
  expect(page.url().startsWith("app://")).toBe(true);
  await expect(page.getByText("CRUX 抱石").first()).toBeVisible();
  await expect(page.getByRole("link", { name: "上传视频分析" })).toBeVisible();
});

test("打包应用内路由与深链回落可用", async () => {
  await page.getByRole("link", { name: "分析" }).first().click();
  await expect(page.getByTestId("upload-dropzone")).toBeVisible();
  expect(page.url()).toContain("/analyze");

  await page.getByRole("link", { name: "设置" }).first().click();
  await expect(page.getByTestId("api-key-input")).toBeVisible();

  // 直接深链刷新（模拟 app:// 路径回落 index.html）
  await page.reload();
  await expect(page.getByTestId("api-key-input")).toBeVisible();
});
