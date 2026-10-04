import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const desktopDir = fileURLToPath(new URL("..", import.meta.url));
export const repoRoot = path.resolve(desktopDir, "..");

const CANDIDATE_SUFFIXES = [
  ".ts",
  ".tsx",
  ".mts",
  ".js",
  ".jsx",
  "/index.ts",
  "/index.tsx",
];

/** 解析带省略扩展名的 TS 路径（esbuild 的 onResolve 不会自动补扩展名） */
function resolveTs(base) {
  for (const suffix of CANDIDATE_SUFFIXES) {
    const candidate = `${base}${suffix}`;
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }
  return base;
}

/**
 * 让主进程 bundle 能复用仓库根目录 lib/ 与 desktop/shared/ 下的代码，
 * 与 Vite / tsc 中的 `@lib` `@shared` 别名保持一致。
 */
export function aliasPlugin() {
  return {
    name: "crux-alias",
    setup(build) {
      build.onResolve({ filter: /^@lib$/ }, () => ({
        path: resolveTs(path.join(repoRoot, "lib", "index")),
      }));
      build.onResolve({ filter: /^@lib\// }, (args) => ({
        path: resolveTs(path.join(repoRoot, "lib", args.path.slice("@lib/".length))),
      }));
      build.onResolve({ filter: /^@shared\// }, (args) => ({
        path: resolveTs(
          path.join(desktopDir, "shared", args.path.slice("@shared/".length))
        ),
      }));
    },
  };
}

/** 构建 electron 主进程 / preload 的公共配置 */
export function electronBuildOptions(entry, outfile) {
  return {
    entryPoints: [path.join(desktopDir, "electron", entry)],
    outfile: path.join(desktopDir, "dist-electron", outfile),
    bundle: true,
    platform: "node",
    target: "node20",
    format: "cjs",
    packages: "external",
    sourcemap: false,
    logLevel: "info",
    plugins: [aliasPlugin()],
    define: {
      "process.env.NODE_ENV": JSON.stringify(
        process.env.NODE_ENV ?? "production"
      ),
    },
  };
}
