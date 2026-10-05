# CRUX 抱石 · 桌面客户端（Electron + React + TypeScript）

把原来的 Next.js 网页应用改造成 Windows 桌面客户端。**默认使用 DeepSeek**（国内直连、无需代理），同时保留 Gemini 作为可切换后端。核心分析能力（进度提示、结构化报告解析、时间轴收藏、PDF/Markdown 导出）与网页版保持一致，并直接复用仓库根目录 `lib/` 下的同一份实现，避免两套逻辑漂移。

## 分析后端

| 后端 | 模型 | 输入 | 说明 |
|------|------|------|------|
| **DeepSeek（默认）** | `deepseek-flash` | 本地抽取的**关键帧** | 官方 API 支持图像理解但**不接受视频**，客户端在本地抽帧并给每帧打上 `[MM:SS]` 时间戳后提交，因此仍能产出时间轴级别的点评 |
| Google Gemini（可选） | `gemini-2.5-flash` | 完整视频 | 直接把视频交给模型做连续动作理解，需要可访问 Google 的网络环境 |

两者在「设置」页一键切换，API Key 与模型分别保存、互不影响。DeepSeek 使用 OpenAI 兼容接口 `https://api.deepseek.com/chat/completions`。

## 与网页版的关键差异

| 能力 | 网页版 | 桌面版 |
|------|--------|--------|
| 运行形态 | Next.js Serverless（Vercel） | Electron 主进程 + React 渲染进程 |
| 模型调用位置 | 服务端 API Route | 主进程直连（无中转、无 10s 函数超时） |
| 默认模型 | Gemini | DeepSeek `deepseek-flash`（可切回 Gemini） |
| API Key | `GEMINI_API_KEY` 环境变量 | 应用内「设置」页填写，存于本机 `userData/settings.json`；环境变量（`DEEPSEEK_API_KEY` / `GEMINI_API_KEY`）仍可覆盖 |
| 视频处理 | 上传压缩至 ≤3.5MB 后交 Gemini | DeepSeek 走本地抽帧（不压缩视频）；Gemini 仍沿用原压缩策略 |
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
│  ├─ deepseek-runner.ts 关键帧 → DeepSeek 图像理解
│  ├─ deepseek-analyze.ts DeepSeek 请求构造 / 响应解析 / 错误映射
│  ├─ error-policy.ts   模型错误 → 可重试 / 等待时长 / 用户文案
│  ├─ settings-store.ts 后端选择、API Key 与模型设置
│  ├─ auth-store.ts     本地账户（scrypt）
│  └─ file-io.ts        原生另存为 / 打开目录
├─ shared/              主进程与渲染进程共享的类型、后端能力与文案
├─ src/                 React 渲染进程
│  ├─ pages/            首页 / 分析 / 结果 / 进步 / 收藏 / 设置 / 登录注册
│  ├─ components/       与网页版同源移植的 UI 组件
│  └─ lib/              useAuth、useTheme、analyze-client（IPC 封装）、extract-frames（本地抽帧）
├─ tests/
│  ├─ unit/             Vitest 单元 + 组件 + 流程集成测试
│  └─ e2e/              Playwright 驱动真实 Electron 的冒烟测试
└─ scripts/             dev / build 脚本（Vite + esbuild）
```

主进程通过 `@lib/*` 别名直接引用仓库根目录的分析逻辑：`analyze-prompt`、`gemini-analyze`、`gemini-phases`、`gemini-retry`、`gemini-response-text`、`parse-analysis`、`parse-structured-report` 等。渲染进程复用 `analysis-db`、`climbing-stats`、`bookmarks`、`compress-video`、`pdf-content`、`generate-analysis-pdf`、`strings`。

DeepSeek 与 Gemini 共用同一套任务状态机、进度事件、错误策略与解析层，因此两种后端产出的报告格式、时间轴与导出结果完全一致。

## 快速开始

```bash
cd desktop
npm install          # 首次会下载 Electron 二进制
npm run dev          # Vite dev server + esbuild watch + Electron
```

首次使用请在应用内「设置」页填入 API Key：

- **DeepSeek**：[platform.deepseek.com/api_keys](https://platform.deepseek.com/api_keys) 创建，按量计费
- **Google Gemini**（可选）：[Google AI Studio](https://aistudio.google.com/apikey) 免费申请

Key 只保存在本机，不会上传到任何服务器。

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

1. **单元测试**（`tests/unit`）：解析层（时间轴 / 评分 / 难度 / 结构化报告）、PDF 内容摘要、限流与配额分类、错误策略、Markdown 导出、设置与账户存储、**DeepSeek 请求构造与错误映射**、**抽帧时间点规划**。
2. **组件测试**：历史列表空态与列表态、结构化报告三种板块、按钮加载态。
3. **流程集成测试**（`analysis-pipeline.test.ts`）：真实 `JobManager` + 真实 Runner（仅桩掉网络层）。Gemini 侧覆盖成功链路、429 排队后自动重试且**不重复上传**、日配额耗尽明确失败、中途取消立即生效；DeepSeek 侧覆盖关键帧提交、402 余额不足不重试、503 排队重试成功、缺帧拦截。
4. **端到端测试**（Playwright 驱动真实 Electron）：
   - `smoke.spec.ts`：首页/导航/分析表单/深浅色主题/设置页保存与清除 Key/DeepSeek↔Gemini 切换互不影响/未配置提示。
   - `frame-extraction.spec.ts`：在真实渲染进程里录制视频 → 走完「选文件 → 解码 → canvas 截图 → 时间戳」链路，验证抽帧真能产出关键帧。
   - `packaged.spec.ts`：对**已打包**应用验证 `app://` 协议 + asar 资源加载 + SPA 深链刷新（未打包时自动跳过）。

```bash
npm test             # 144 个单元/组件/集成用例
npm run test:e2e     # 11 个 Electron 端到端用例（含抽帧与打包冒烟）
```

## 数据与隐私

所有数据都在本机应用数据目录（设置页可直接打开）：

- `settings.json`：当前后端、两家的 API Key 与模型名
- `accounts.json`：本地账户与会话（密码仅存 scrypt 哈希）
- IndexedDB：分析记录、时间轴收藏与视频片段

一次 DeepSeek 分析会把你选择的那段视频抽出的 16 张关键帧（约 1MB）发送到 `api.deepseek.com`；Gemini 后端则发送压缩后的视频片段。

## 已知限制

- **DeepSeek 官方 API 不支持视频**，只能读图。客户端默认在本地按时间均匀抽取 16 张关键帧（可覆盖起手、中段与收顶），**帧与帧之间的连续动作无法被看到**，提示词里已明确要求模型在依据不足时不得编造。若需要真正的连续动作理解，请在设置里切换到 Gemini。
- 关键帧数量在 `src/lib/extract-frames.ts` 的 `DEFAULT_FRAME_COUNT` 调整；DeepSeek 单请求上限 600 张、总计 64MiB，当前用量远低于上限。
- Gemini 后端仍沿用网页版的 3.5MB / 90 秒压缩策略；如需放宽，改 `lib/upload-limits.ts` 与压缩参数即可。
- 账户目前是本机账户，不含跨设备云同步（网页版的 Postgres 方案未移植）。
- 部分终端（如 VS Code 集成终端）会注入 `ELECTRON_RUN_AS_NODE=1`，会让 Electron 退化成 Node。`scripts/dev.mjs` 与端到端测试已显式剔除该变量；若手动执行 `electron .`，请先 `Remove-Item Env:ELECTRON_RUN_AS_NODE`。
