import { test, expect, _electron as electron } from "@playwright/test";
import type { ElectronApplication, Page } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * DeepSeek 后端依赖「本地抽帧」。
 * 这里在真实 Electron 渲染进程里录一段视频，再走完整的选文件 → 抽帧链路，
 * 验证真正的解码 / canvas 截图 / 时间戳链路可用（而非只测纯函数）。
 */
const appDir = process.env.CRUX_APP_DIR ?? process.cwd();

let app: ElectronApplication;
let page: Page;
let userDataDir: string;

test.beforeAll(async () => {
  userDataDir = await mkdtemp(path.join(tmpdir(), "crux-frames-"));
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (key === "ELECTRON_RUN_AS_NODE") continue;
    if (typeof value === "string") env[key] = value;
  }
  app = await electron.launch({
    args: [appDir, `--user-data-dir=${userDataDir}`],
    env,
  });
  page = await app.firstWindow();
  await page.waitForLoadState("domcontentloaded");
});

test.afterAll(async () => {
  await app?.close();
  await rm(userDataDir, { recursive: true, force: true });
});

async function recordClip(): Promise<{ mimeType: string; bytes: number[] }> {
  return page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 240;
    const ctx = canvas.getContext("2d")!;
    const stream = canvas.captureStream(12);

    const candidates = [
      "video/mp4;codecs=avc1",
      "video/mp4",
      "video/webm;codecs=vp9",
      "video/webm",
    ];
    const mimeType =
      candidates.find((type) => MediaRecorder.isTypeSupported(type)) ??
      "video/webm";

    const chunks: BlobPart[] = [];
    const recorder = new MediaRecorder(stream, { mimeType });
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    const stopped = new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
    });

    recorder.start();
    const started = performance.now();
    await new Promise<void>((resolve) => {
      const draw = () => {
        const elapsed = performance.now() - started;
        ctx.fillStyle = `hsl(${(elapsed / 8) % 360}, 70%, 45%)`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#ffffff";
        ctx.font = "20px sans-serif";
        ctx.fillText(`${Math.round(elapsed)}ms`, 12, 28);
        if (elapsed < 1500) requestAnimationFrame(draw);
        else resolve();
      };
      draw();
    });
    recorder.stop();
    await stopped;

    const blob = new Blob(chunks, { type: mimeType.split(";")[0] });
    const buffer = await blob.arrayBuffer();
    return {
      mimeType: blob.type || "video/webm",
      bytes: Array.from(new Uint8Array(buffer)),
    };
  });
}

test("选择视频后本地抽取关键帧并展示数量", async () => {
  await page.getByRole("link", { name: "分析" }).first().click();
  await expect(page.getByTestId("upload-dropzone")).toBeVisible();

  const clip = await recordClip();
  expect(clip.bytes.length).toBeGreaterThan(500);

  await page.setInputFiles('[data-testid="video-input"]', {
    name: "crux-e2e.mp4",
    mimeType: clip.mimeType,
    buffer: Buffer.from(clip.bytes),
  });

  const summary = page.getByText(/已抽取 \d+ 张关键帧/);
  await expect(summary).toBeVisible({ timeout: 30_000 });

  const text = (await summary.textContent()) ?? "";
  const count = Number(text.match(/已抽取 (\d+) 张/)?.[1] ?? 0);
  expect(count).toBeGreaterThanOrEqual(8);

  await expect(page.getByTestId("start-analysis")).toBeEnabled();
});
