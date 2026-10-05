import { test, expect, _electron as electron } from "@playwright/test";
import type { ElectronApplication, Page } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const appDir = process.env.CRUX_APP_DIR ?? process.cwd();

let app: ElectronApplication;
let page: Page;
let userDataDir: string;

/**
 * 终端 / IDE 可能注入 ELECTRON_RUN_AS_NODE=1，使 electron 退化成 node 而无法启动窗口，
 * 因此测试启动时显式剔除。
 */
function electronEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (key === "ELECTRON_RUN_AS_NODE") continue;
    if (typeof value === "string") env[key] = value;
  }
  return env;
}

test.beforeAll(async () => {
  userDataDir = await mkdtemp(path.join(tmpdir(), "crux-e2e-"));
  app = await electron.launch({
    args: [appDir, `--user-data-dir=${userDataDir}`],
    env: electronEnv(),
  });
  page = await app.firstWindow();
  await page.waitForLoadState("domcontentloaded");
});

test.afterAll(async () => {
  await app?.close();
  await rm(userDataDir, { recursive: true, force: true });
});

test("启动后加载首页品牌与主行动按钮", async () => {
  await expect(page.getByText("CRUX 抱石").first()).toBeVisible();
  await expect(page.getByRole("link", { name: "上传视频分析" })).toBeVisible();
  await expect(page.getByText("累计爬升")).toBeVisible();
});

test("顶部导航可切换到进步页与收藏页", async () => {
  await page.getByRole("link", { name: "进步" }).first().click();
  await expect(page.getByRole("heading", { name: "训练趋势" })).toBeVisible();

  await page.getByRole("link", { name: "收藏" }).first().click();
  await expect(page.getByRole("heading", { name: "收藏夹" })).toBeVisible();
});

test("分析页展示完整表单；未配置 Key 时给出提示", async () => {
  await page.getByRole("link", { name: "分析" }).first().click();

  await expect(page.getByRole("heading", { name: "动作解析" })).toBeVisible();
  await expect(page.getByTestId("upload-dropzone")).toBeVisible();
  await expect(page.getByTestId("grade-select")).toHaveValue("V4");
  await expect(page.getByTestId("ascent-input")).toHaveValue("4");
  await expect(page.getByTestId("start-analysis")).toBeDisabled();
  await expect(page.getByTestId("api-key-banner")).toBeVisible();
});

test("深色模式切换写入 html[data-theme]", async () => {
  const toggle = page.getByRole("button", { name: "切换到黑夜模式" }).first();
  await toggle.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  await page.getByRole("button", { name: "切换到白天模式" }).first().click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});

test("设置页可保存 API Key，随后分析页提示消失", async () => {
  await page.getByRole("link", { name: "设置" }).first().click();
  await expect(page.getByRole("heading", { name: "设置" })).toBeVisible();
  await expect(page.getByTestId("api-key-status")).toHaveText("未配置 Key");

  await page.getByTestId("api-key-input").fill("AIza-e2e-test-key-123456");
  await page.getByTestId("save-api-key").click();

  await expect(page.getByTestId("api-key-status")).toHaveText("已配置 Key");
  await expect(page.getByRole("status")).toContainText("已保存");

  await page.getByRole("link", { name: "分析" }).first().click();
  await expect(page.getByTestId("api-key-banner")).toHaveCount(0);
});

test("设置页展示模型与运行环境信息", async () => {
  await page.getByRole("link", { name: "设置" }).first().click();
  await expect(page.getByTestId("model-input")).toHaveValue(
    "gemini-2.5-flash"
  );
  await expect(page.getByText("Electron / Chromium")).toBeVisible();
});

test("可以清除已保存的 API Key 并恢复未配置提示", async () => {
  await page.getByRole("link", { name: "设置" }).first().click();
  await page.getByTestId("clear-api-key").click();

  await expect(page.getByTestId("api-key-status")).toHaveText("未配置 Key");

  await page.getByRole("link", { name: "分析" }).first().click();
  await expect(page.getByTestId("api-key-banner")).toBeVisible();
});
