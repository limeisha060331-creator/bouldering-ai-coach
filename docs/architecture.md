# 代码结构

仓库同时产出网页版（Next.js）和桌面客户端（Electron + Vite）。两端共用领域逻辑、展示组件和设计系统，只在路由、文件读写和任务调度上分叉。

## 目录职责

| 目录 | 使用方 | 放什么 | 约束 |
| --- | --- | --- | --- |
| `app/` | 网页 | App Router 页面、Route Handler | 服务端密钥只在这里读取 |
| `components/` | 网页 + 桌面 | 两端共用的展示组件，以及网页专用组件 | 共享组件不做平台 I/O，用相对路径引用 `../lib` |
| `styles/crux.css` | 网页 + 桌面 | 设计 token、基础样式、组件类 | 唯一来源；两端 `globals.css` 只保留字体接入 |
| `lib/` | 网页 + 桌面 + 评测 | 领域逻辑：抽帧、DeepSeek、解析、统计、评测；另有仅网页服务端使用的文件 | 被桌面复用的文件不 import `next/*`、`electron` |
| `desktop/electron/` | 桌面主进程 | 任务状态机、DeepSeek 调用、设置与本地账户 | 通过 `@lib` 复用核心逻辑 |
| `desktop/src/` | 桌面渲染进程 | 页面、路由、平台文件读写 | 通过 `@ui` 复用展示组件 |
| `desktop/shared/` | 主进程 + 渲染进程 | IPC 类型与状态文案 | 只放类型和纯数据 |
| `evals/` | 质量链路 | 夹具、指标、成本模型、报告 | 只读 `lib`，不反向依赖网页或桌面 |
| `tests/`、`desktop/tests/` | 两端 | 单元、组件、集成、E2E | 与源码同层验证 |

## 导入别名

| 环境 | 别名 | 指向 |
| --- | --- | --- |
| 网页 | `@/*` | 仓库根 |
| 桌面 | `@/*` | `desktop/src` |
| 桌面 | `@ui/*` | `components` |
| 桌面 | `@lib/*` | `lib` |
| 桌面 | `@shared/*` | `desktop/shared` |

## 共享边界

1. 新展示组件先放进根 `components/`。两端差异用 props 或回调表达，不复制文件。
2. 平台能力留在边界上：网页的下载、桌面的 IPC 与文件系统，放在页面或 `desktop/src/lib`，不要进共享组件。
3. 共享组件内部一律用相对路径引用 `lib`，这样两端的别名配置不会影响它。
4. 改视觉先改 `styles/crux.css`。两端 `globals.css` 只负责字体：网页接 `next/font` 变量，桌面声明本地 `@font-face`。
5. 桌面端共享组件依赖 `desktop/node_modules` 的 React 单实例，`vite.config.ts` 与 `vitest.config.ts` 里已固定 `react`、`react-dom`、`lucide-react` 的解析路径，新增共享 UI 依赖时需要同步这里。

## 有意的分叉

下面这些文件两端各有一份，因为差异在路由或传输层，强行合并会引入适配层：

| 文件 | 分叉原因 |
| --- | --- |
| `components/auth-nav.tsx` / `desktop/src/components/auth-nav.tsx` | Next `Link` 与 react-router `Link` |
| `components/auth-form.tsx` / `desktop/src/components/auth-form.tsx` | 表单跳转与登录通知来源不同 |
| `components/crux-header.tsx` / `desktop/src/components/crux-header.tsx` | 导航项与路由 API 不同 |
| `components/analysis-view.tsx` / `desktop/src/components/analysis-view.tsx` | 网页用浏览器下载，桌面用 IPC 保存文件 |
| `components/landing-home.tsx` / `desktop/src/pages/LandingPage.tsx` | 首页路由跳转与图片组件不同 |
| `app/analyze/page.tsx` / `desktop/src/pages/AnalyzePage.tsx` | 网页走 HTTP 轮询，桌面走 IPC 事件 |
| `app/analysis/[id]/page.tsx` / `desktop/src/pages/AnalysisPage.tsx` | 路由参数 API 与 Suspense 边界不同 |

改动其中一份时，对照另一份确认视觉与文案是否也要同步。

仅网页服务端使用的 `lib` 文件包括 `auth-server.ts`、`db.ts`、`db-types.ts`、`supabase/`、`analysis-jobs.ts`、`job-memory-store.ts`、`process-analysis-job.ts`，它们不会进入桌面构建。

## 部分接入与预留接口

以下代码有测试或接口，但当前没有产品调用方。删除或接入需要单独决策：

- `lib/analysis-cloud.ts` 的 `deleteAnalysisInCloud` 与 `DELETE /api/analyses/[id]`：接口存在，网页没有删除入口。

`lib/agent/` 已接入网页端分析流程（`AGENT_RUNTIME=on` 时启用，失败默认回退单次 DeepSeek）；桌面端仍未接入。

## 验证

```bash
# 网页
npm run check:unused && npm test && npm run build

# 桌面
cd desktop
npm run check:unused && npm test && node scripts/build.mjs
```
