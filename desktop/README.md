# CRUX 抱石 · 桌面客户端（Electron + React + TypeScript）

把原来的 Next.js 网页应用改造成 Windows 桌面客户端。核心分析能力（Gemini 视频理解、进度提示、结构化报告解析、PDF/Markdown 导出）与网页版保持一致，并直接复用仓库根目录 `lib/` 下的同一份实现，避免两套逻辑漂移。

## 与网页版的关键差异

| 能力 | 网页版 | 桌面版 |
|------|--------|--------|
| 运行形态 | Next.js Serverless（Vercel） | Electron 主进程 + React 渲染进程 |
| Gemini 调用位置 | 服务端 API Route | 主进程直连（无中转、无 10s 函数超时） |
| API Key | `GEMINI_API_KEY` 环境变量 | 应用内「设置」页填写，存于本机 `userData/settings.json`；环境变量仍可覆盖 |
| 上传体积限制 | 受 Vercel 请求体限制（≤3.5MB） | 沿用同一压缩策略，保留一致体验 |
| 注册登录 | Vercel Postgres + JWT Cookie | 本地账户（scrypt 哈希）存于 `userData/accounts.json` |
| 分析历史 | 浏览器 IndexedDB | 同一套 IndexedDB（渲染进程），随应用数据目录持久化 |
| 导出 | 浏览器下载 | 系统原生「另存为」对话框 |
| 页面加载 | Next.js 路由 | 生产环境用自定义 `app://` 协议托管 Vite 产物（保证稳定 origin，IndexedDB 才能持久化） |

## 目录结构

```
desktop/
├─ electron/            主进程（Node 侧）
│  ├─ main.ts           窗口 / 生命周期 / app:// 协议 / CSP
│  ├─ preload.ts        contextBridge 暴露 window.crux
│  ├─ ipc.ts            IPC 处理器注册（设置 / 分析 / 账户 / 文件）
│  ├─ job-manager.ts    分析任务状态机：重试、限流退避、取消
│  ├─ gemini-runner.ts  阶段一上传 → 阶段二轮询 → generateContent
│  ├─ error-policy.ts   Gemini 错误 → 可重试 / 等待时长 / 用户文案
│  ├─ settings-store.ts API Key 与模型设置
│  ├─ auth-store.ts     本地账户（scrypt）
│  └─ file-io.ts        原生另存为 / 打开目录
├─ shared/              主进程与渲染进程共享的类型与文案
├─ src/                 React 渲染进程
│  ├─ pages/            首页 / 分析 / 结果 / 进步 / 收藏 / 设置 / 登录注册
│  ├─ components/       与网页版同源移植的 UI 组件
│  └─ lib/              useAuth、useTheme、analyze-client（IPC 封装）
├─ tests/
│  ├─ unit/             Vitest 单元 + 组件 + 流程集成测试
│  └─ e2e/              Playwright 驱动真实 Electron 的冒烟测试
└─ scripts/             dev / build 脚本（Vite + esbuild）
```

主进程通过 `@lib/*` 别名直接引用仓库根目录的分析逻辑：`analyze-prompt`、`gemini-analyze`、`gemini-phases`、`gemini-retry`、`gemini-response-text`、`parse-analysis`、`parse-structured-report` 等。渲染进程复用 `analysis-db`、`climbing-stats`、`bookmarks`、`compress-video`、`pdf-content`、`generate-analysis-pdf`、`strings`。

## 快速开始

```bash
cd desktop
npm install          # 首次会下载 Electron 二进制
npm run dev          # Vite dev server + esbuild watch + Electron
```

首次使用请在应用内「设置」页填入 Gemini API Key（[Google AI Studio](https://aistudio.google.com/apikey) 免费申请）。Key 只保存在本机，不会上传到任何服务器。

## 常用命令

| 命令 | 作用 |
|------|------|
| `npm run dev` | 开发模式（热更新渲染层，主进程改动自动重启） |
| `npm run build` | 构建渲染层（Vite）+ 主进程/preload（esbuild） |
| `npm start` | 以生产构建启动 Electron |
| `npm run typecheck` | TypeScript 全量类型检查 |
| `npm test` | Vitest 单元/组件/集成测试 |
| `npm run test:e2e` | 构建后跑 Playwright Electron 端到端测试 |
| `npm run dist` | 构建并打包 Windows 安装包（`release/`） |

打包产物：

- `release/win-unpacked/CRUX Boulder.exe`：免安装目录版
- `release/CRUX Boulder Setup 0.1.0.exe`：NSIS 安装包
- `release/CRUX Boulder 0.1.0.exe`：单文件便携版

若在国内网络打包，建议设置镜像后执行：

```bash
# PowerShell
$env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
$env:ELECTRON_BUILDER_BINARIES_MIRROR="https://npmmirror.com/mirrors/electron-builder-binaries/"
npm run dist
```

## 测试策略

「确保核心功能正常运转」按四层验证：

1. **单元测试**（`tests/unit`）：解析层（时间轴 / 评分 / 难度 / 结构化报告）、PDF 内容摘要、限流与配额分类、错误策略、Markdown 导出、设置与账户存储。
2. **组件测试**：历史列表空态与列表态、结构化报告三种板块、按钮加载态。
3. **流程集成测试**（`analysis-pipeline.test.ts`）：真实 `JobManager` + 真实 `GeminiRunner`（仅桩掉网络层），覆盖成功链路、429 排队后自动重试成功且**不重复上传**、日配额耗尽明确失败、中途取消立即生效。
4. **端到端测试**（Playwright 驱动真实 Electron）：
   - `smoke.spec.ts`：首页/导航/分析表单/深浅色主题/设置页保存与清除 Key/未配置提示。
   - `packaged.spec.ts`：对**已打包**应用验证 `app://` 协议 + asar 资源加载 + SPA 深链刷新（未打包时自动跳过）。

```bash
npm test             # 108 个单元/组件/集成用例
npm run test:e2e     # 9 个 Electron 端到端用例（含打包冒烟）
```

## 数据与隐私

所有数据都在本机应用数据目录（设置页可直接打开）：

- `settings.json`：Gemini API Key、模型名
- `accounts.json`：本地账户与会话（密码仅存 scrypt 哈希）
- IndexedDB：分析记录、时间轴收藏与视频片段

## 已知限制

- 桌面版仍沿用网页版的 3.5MB / 90 秒压缩策略，以保证两端体验一致；如需放宽，改 `lib/upload-limits.ts` 与压缩参数即可。
- 账户目前是本机账户，不含跨设备云同步（网页版的 Postgres 方案未移植）。
- 部分终端（如 VS Code 集成终端）会注入 `ELECTRON_RUN_AS_NODE=1`，会让 Electron 退化成 Node。`scripts/dev.mjs` 与端到端测试已显式剔除该变量；若手动执行 `electron .`，请先 `Remove-Item Env:ELECTRON_RUN_AS_NODE`。
