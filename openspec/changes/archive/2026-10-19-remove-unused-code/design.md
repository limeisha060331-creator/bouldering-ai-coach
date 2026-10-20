## 决策一：以 `tsc --noUnusedLocals` 为准，不用 slop-cleaner 的清单

同一份代码，两个工具给出的数字差两个数量级：slop-cleaner 报 285 条未使用 import，
`tsc` 报 1 条。原因是类型引用在 JS 语法树里是独立的节点类型（`type_identifier`），
slop-cleaner 只统计 `identifier`，于是 `import type { X }` 全部落进「未使用」。
它还不会跳过 `.next/` 这类生成目录，Next.js 的路由类型文件因此贡献了大量噪音。

`tsc` 是这条代码的编译器，类型语义由它自己定义，没有重新解释的余地。

## 决策二：只删名字，不动导入结构

`BoulderGrade` 与仍然在用的 `AnalysisSegment`、`ParsedAnalysis` 在同一个 `import type` 里。
删掉名字即可，保留 `import type { ... } from "./types"` 的形状——否则 `parseAnalysis` 的返回类型
就要改成内联类型，diff 会从一行扩散到整个函数签名。

## 决策三：不把 `lint` 接进验证链

根目录 `npm run lint` 现在是 15 error / 3 warning（`react-hooks/set-state-in-effect` 之类），
是既有问题。如果把它当成清理任务的验收标准，这次 change 就会变成「顺手修 15 个 React 规则」，
既超范围又缺少视觉回归手段。所以本次只加 `check:unused` 这一个窄检查，lint 的历史债单独立项。

## 风险

`--noUnusedParameters` 对每个未使用参数报错。桌面端有若干 IPC 处理函数需要保持参数位置，
将来若触发，统一用 `_` 前缀处理（与 `ai-news-langgraph` 的 `_deps` 同一约定）。
