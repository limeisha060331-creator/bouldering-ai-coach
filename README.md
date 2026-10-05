# CRUX 抱石 · AI 攀爬动作分析

上传一段抱石攀爬视频，得到带时间戳的 AI 动作点评、评分与专项改进方案，并记录难度、爬升和训练历史。

项目有两种形态，核心分析逻辑共用同一份代码：

| 形态 | 技术栈 | 说明 |
| --- | --- | --- |
| **桌面客户端**（推荐） | Electron + React + TypeScript | 免部署，默认接入 DeepSeek，国内直连可用 |
| 网页版 | Next.js 16 + React 19 + TypeScript | 部署在 Vercel，需要配置服务端环境变量 |

---

## 功能

- **视频动作分析**：输出带 `[MM:SS]` 时间戳的逐条点评，附评分、教练金句、核心维度评估与专项改进方案
- **两种 AI 后端**：DeepSeek（默认，本地抽帧）与 Google Gemini（直接理解视频），设置里一键切换
- **训练历史**：本地保存每次分析的视频、报告与难度，支持按日期、分数筛选
- **时间轴收藏**：给关键片段打星标，收藏夹里一键跳回原视频对应秒数
- **进步统计**：按天汇总爬升距离与最高 V 级，生成趋势曲线
- **报告导出**：单页 A4 PDF 报告 / Markdown 全文
- **其他**：中文 / 英文界面、黑夜模式、本地账户（可选）

## 快速开始

### 桌面客户端（推荐）

安装包在 `desktop/release/`：

```text
CRUX Boulder Setup 0.2.0.exe   # 安装包，双击安装
CRUX Boulder 0.2.0.exe         # 免安装便携版，双击直接运行
```

首次使用：

1. 打开应用，点顶部「设置」
2. 选择分析后端并填入 API Key
   - **DeepSeek**（默认）：在 https://platform.deepseek.com/api_keys 创建，按量计费
   - **Gemini**（可选）：在 https://aistudio.google.com/apikey 免费申请
3. 回到「分析」页，选择视频 → 点「开始分析」

> 关于 DeepSeek：官方 API 支持图像理解但**不接受视频**。客户端会在本地把视频均匀抽取成 16 张关键帧，并给每帧标上 `[MM:SS]` 时间戳后提交，因此仍能给出时间轴级别的点评；帧与帧之间的连续动作看不到，需要真正的视频理解时请在设置里切换到 Gemini。

从源码运行：

```bash
cd desktop
npm install
npm run dev      # 开发模式
npm test         # 单元 / 组件 / 集成测试
npm run test:e2e # 真实 Electron 端到端测试
npm run dist     # 打包 Windows 安装包
```

### 网页版

```bash
npm install
cp .env.example .env.local
npm run dev
# 打开 http://localhost:3000
```

`.env.local` 至少需要：

```env
GEMINI_API_KEY=你的密钥
# 可选：异步任务（生产环境建议）
BLOB_READ_WRITE_TOKEN=...
# 可选：注册登录
POSTGRES_URL=...
AUTH_SECRET=...
```

## 技术栈

| 层 | 桌面客户端 | 网页版 |
| --- | --- | --- |
| 界面 | React 19 + TypeScript + Tailwind 4 + Vite | React 19 + TypeScript + Tailwind 4 |
| 运行时 | Electron 主进程（Node） | Next.js 16 App Router |
| AI | DeepSeek `deepseek-flash` / Gemini `gemini-2.5-flash` | Gemini `gemini-2.5-flash` |
| 本地存储 | IndexedDB + 应用数据目录配置 | IndexedDB + Vercel Postgres（可选账户） |
| 测试 | Vitest + Playwright（Electron） | — |

## 项目结构

```text
├─ app/             网页版路由与 API（Next.js）
├─ components/      网页版 UI 组件
├─ lib/             两端共用的核心逻辑（Prompt、Gemini 调用、解析、统计、PDF）
├─ docs/            产品需求、设计说明、简历材料
└─ desktop/         桌面客户端
   ├─ electron/     主进程：任务状态机、DeepSeek/Gemini 调用、设置与本地账户
   ├─ shared/       主进程与渲染进程共享的类型契约
   ├─ src/          React 界面与本地抽帧
   └─ tests/        单元、组件、集成与 Electron 端到端测试
```

## 测试

```bash
cd desktop
npm test         # 144 个单元 / 组件 / 集成用例
npm run test:e2e # 11 个 Electron 端到端用例（含真实抽帧与打包产物冒烟）
```

## 更多文档

- 桌面客户端详细说明：**[desktop/README.md](./desktop/README.md)**
- 产品需求：**[docs/PRD.md](./docs/PRD.md)**
- 设计说明：**[docs/DESIGN.md](./docs/DESIGN.md)**
- 简历 / 面试材料：**[docs/RESUME-AI.md](./docs/RESUME-AI.md)**

## 免责声明

本服务仅供训练参考，不构成医疗、康复或现场保护建议；请在安全环境下攀爬并自行承担风险。

For training reference only; not medical, rehab, or on-the-spot safety advice. Climb responsibly and at your own risk.

## License

MIT
