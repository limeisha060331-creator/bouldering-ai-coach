import path from "node:path";
import { rm } from "node:fs/promises";
import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import { desktopDir, electronBuildOptions } from "./esbuild-helpers.mjs";

async function main() {
  await rm(path.join(desktopDir, "dist-electron"), { force: true, recursive: true });
  await rm(path.join(desktopDir, "dist"), { force: true, recursive: true });

  await esbuild(electronBuildOptions("main.ts", "main.cjs"));
  await esbuild(electronBuildOptions("preload.ts", "preload.cjs"));

  await viteBuild({ configFile: path.join(desktopDir, "vite.config.ts") });

  console.log("[build] renderer + electron 产物已生成");
}

main().catch((err) => {
  console.error("[build] 失败：", err);
  process.exit(1);
});
