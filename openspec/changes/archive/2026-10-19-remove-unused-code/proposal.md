## Why

`lib/parse-analysis.ts` 从 `./types` 导入的 `BoulderGrade` 没有被使用。它不影响编译（`tsc` 默认不检查未使用符号），
也不影响运行，但读代码的人会以为这个文件在处理难度等级——实际它只解析段落与时间戳。

用 slop-cleaner 扫全仓报出 285 条「未使用的 import」，用 `tsc --noUnusedLocals` 对照只有 1 条。
前者把 `import type { AnalysisRecord }` 这类类型导入全判成未使用，还会把 `.next/` 下的生成文件算进去，
所以这次不采信它的清单。

## What Changes

- 从 `lib/parse-analysis.ts` 的 `./types` 导入里去掉未使用的 `BoulderGrade`
- 根目录与 `desktop/` 各加一个 `check:unused` 脚本（`tsc --noEmit --noUnusedLocals --noUnusedParameters`），
  让这类残留变成可失败检查

## Capabilities

### New Capabilities

- `code-hygiene`：仓库不保留未使用的导入与类型引用；新增残留由 `npm run check:unused` 报出。

### Modified Capabilities

无。

## Impact

- 代码：`lib/parse-analysis.ts` 一行导入；根 `package.json` 与 `desktop/package.json` 各加一个脚本
- 验证：根与 desktop 的 `check:unused` 均无输出；`desktop` 的 vitest 结果与清理前一致（143 通过 / 1 既有失败）
- 运行时无变化：被删的名字没有引用点
- 不在本次范围：根目录 `npm run lint` 现有 15 个 error / 3 个 warning（react-hooks 规则），与本次清理无关
