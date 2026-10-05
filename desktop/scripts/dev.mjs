import path from "node:path";
import { spawn } from "node:child_process";
import { createServer } from "vite";
import { context as esbuildContext } from "esbuild";
import electronPath from "electron";
import { desktopDir, electronBuildOptions } from "./esbuild-helpers.mjs";

async function main() {
  const server = await createServer({
    configFile: path.join(desktopDir, "vite.config.ts"),
  });
  await server.listen();
  const info = server.resolvedUrls?.local?.[0];
  if (!info) throw new Error("Vite dev server 未能启动");
  const devUrl = info.replace(/\/$/, "");
  console.log(`[dev] renderer: ${devUrl}`);

  const mainCtx = await esbuildContext(electronBuildOptions("main.ts", "main.cjs"));
  const preloadCtx = await esbuildContext(
    electronBuildOptions("preload.ts", "preload.cjs")
  );
  await mainCtx.watch();
  await preloadCtx.watch();

  /* 某些 IDE/终端会注入 ELECTRON_RUN_AS_NODE，会让 electron 退化成 node，必须剔除 */
  const electronEnv = { ...process.env };
  delete electronEnv.ELECTRON_RUN_AS_NODE;

  const child = spawn(electronPath, [desktopDir], {
    stdio: "inherit",
    env: {
      ...electronEnv,
      NODE_ENV: "development",
      VITE_DEV_SERVER_URL: devUrl,
    },
  });

  const shutdown = async (code = 0) => {
    await mainCtx.dispose();
    await preloadCtx.dispose();
    await server.close();
    child.kill();
    process.exit(code);
  };

  child.on("close", (code) => void shutdown(code ?? 0));
  process.on("SIGINT", () => void shutdown(0));
  process.on("SIGTERM", () => void shutdown(0));
}

main().catch((err) => {
  console.error("[dev] 失败：", err);
  process.exit(1);
});
