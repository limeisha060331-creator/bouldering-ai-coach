# CRUX 抱石 · AI 攀爬动作分析

上传一段抱石攀爬视频，得到带时间戳的 AI 动作点评、评分与专项改进方案，并记录难度、爬升和训练历史。

项目有两种形态，核心分析逻辑共用同一份代码：

| 形态 | 技术栈 | 说明 |
| --- | --- | --- |
| **桌面客户端**（推荐） | Electron + React + TypeScript | 免部署，默认接入 DeepSeek，国内直连可用 |
| 网页版 | Next.js 16 + React 19 + TypeScript | 部署在 Vercel，需要配置服务端环境变量 |

## API Key 由谁配置

网页版的分析请求全部走服务端：DeepSeek Key 只存在于 Vercel 环境变量里，浏览器端拿不到，
**线上访客打开就能用，不需要填写任何 Key**。只有部署这个站点的人（或本地跑源码的开发者）
需要配置一次环境变量。

| 场景 | Key 配在哪 | 使用者要不要自己填 |
| --- | --- | --- |
| 线上网页版 | 部署者在 Vercel 环境变量里配置 `DEEPSEEK_API_KEY` | 不需要 |
| 本地跑网页版源码 | 开发者自己的 `.env.local` | 不需要 |
| 桌面客户端 | 应用内「设置」页，只存在本机 | 需要（桌面端本机直连 DeepSeek，没有中转服务） |

---

## 功能

- **视频动作分析**：输出带 `[MM:SS]` 时间戳的逐条点评，附评分、教练金句、核心维度评估与专项改进方案
- **端侧抽帧 + DeepSeek 视觉理解**：视频在本机抽成关键帧，再交给 `deepseek-flash` 逐帧点评
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
2. 填入 DeepSeek API Key（在 https://platform.deepseek.com/api_keys 创建，按量计费）
3. 回到「分析」页，选择视频 → 点「开始分析」

> 这一步只针对桌面客户端：它是本地直连 DeepSeek 的，所以 Key 由使用者自己准备并保存在本机。
> 网页版不需要这一步，站点已经在服务端配好了 Key。

> 关于抽帧：DeepSeek 官方 API 支持图像理解但**不接受视频**。客户端会在本地把视频均匀抽取成 16 张关键帧（768px、JPEG），给每帧标上 `[MM:SS]` 时间戳后提交，因此仍能给出时间轴级别的点评。原视频不上传，帧与帧之间的连续动作看不到，提示词里已明确要求模型不要编造看不清的细节。

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

下面这些变量给「部署站点的人」和「本地跑源码的人」用。只有 `NEXT_PUBLIC_SUPABASE_*`
会进入浏览器（受 RLS 约束），其余密钥只在服务端读取：

```env
DEEPSEEK_API_KEY=你的密钥
# 可选：异步任务（生产环境建议）
BLOB_READ_WRITE_TOKEN=...
# 注册登录 + 云端分析记录 + 媒体存储（Supabase）
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
# 可选：网页端 Agent（默认开启，失败回退单次分析）
AGENT_RUNTIME=on
AGENT_FALLBACK=on
```

`DEEPSEEK_API_KEY` 不要加 `NEXT_PUBLIC_` 前缀；`service_role` 同理。浏览器端只拿
`NEXT_PUBLIC_SUPABASE_URL` 与 `NEXT_PUBLIC_SUPABASE_ANON_KEY`，权限由 RLS 控制。

## 数据库（Supabase）

网页版以 Supabase 为唯一事实来源：

| 表 | 用途 |
| --- | --- |
| `auth.users` | 账号（邮箱、密码哈希、邮箱验证状态，由 Supabase Auth 管理） |
| `analyses` | 每次视频分析记录（时间轴、评分、难度、收藏下标等） |
| `agent_memory` | 每个用户的 Agent 长期记忆（档案、训练事件、术语偏好） |
| Storage `media` | 私有视频与缩略图，按 `{userId}/{analysisId}/...` 隔离 |

接入（详见 **[supabase/README.md](./supabase/README.md)**）：

1. 在 <https://supabase.com/dashboard> 新建项目。
2. 打开 **Authentication → Providers → Email**，确认 Email 登录已启用。
3. 打开 **SQL Editor**，执行 `supabase/migrations/0003_supabase_auth.sql`。
4. 在 **Project Settings → API** 复制 `Project URL`、publishable/anon key、`service_role`，
   填入 `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY`。

数据流是「云端优先」：登录后浏览器直接通过 RLS 读写 `analyses`，缩略图和 50MB 以内的
原片上传到私有 Storage；前端只保留 30 秒内存缓存。未登录用户需要先登录才能分析。
`service_role` 只留在服务端后台任务里，浏览器端不接触。

## 技术栈

| 层 | 桌面客户端 | 网页版 |
| --- | --- | --- |
| 界面 | React 19 + TypeScript + Tailwind 4 + Vite | React 19 + TypeScript + Tailwind 4 |
| 运行时 | Electron 主进程（Node） | Next.js 16 App Router |
| AI | DeepSeek `deepseek-flash`（端侧抽帧） | DeepSeek `deepseek-flash` + Agent 工具循环（浏览器抽帧与姿态取证） |
| 本地存储 | IndexedDB + 应用数据目录配置 | Supabase（Auth + Postgres + Storage），仅保留内存缓存 |
| 测试 | Vitest + Playwright（Electron） | — |

## 项目结构

```text
├─ app/             网页版路由与 API（Next.js）
├─ components/      两端共用的 UI 组件（路由/传输有差异的页面级组件在 desktop 内保留）
├─ styles/          两端共用的设计系统 styles/crux.css
├─ lib/             两端共用的核心逻辑（Prompt、抽帧、DeepSeek 调用、解析、统计、PDF）
├─ docs/            产品需求、设计说明、代码结构
├─ evals/           评测夹具、指标、成本模型与运行报告
├─ openspec/        变更提案与代码卫生规范
├─ tests/           网页与共享逻辑测试
├─ supabase/        数据库迁移脚本与接入说明
└─ desktop/         桌面客户端
   ├─ electron/     主进程：任务状态机、DeepSeek 调用、设置与本地账户
   ├─ shared/       主进程与渲染进程共享的类型契约
   ├─ src/          React 界面与本地抽帧
   └─ tests/        单元、组件、集成与 Electron 端到端测试
```

## 测试

```bash
cd desktop
npm test         # 125 个单元 / 组件 / 集成用例
npm run test:e2e # 10 个 Electron 端到端用例（含真实抽帧与打包产物冒烟）
```

## 质量与成本

仓库里有一套可跑的 AI 质量运营链路，回答“说得对不对、一次多少钱、哪里会坏、下一版该不该上”：

```bash
npm test              # 成本计算、评测指标、决策规则
npm run eval          # 用合成夹具跑评测，生成报告
npm run frames:extract # 用本机 ffmpeg 给真实视频语料抽帧（live 评测前置）
npm run cost:report   # 生成单次 / 月度 / 单位经济成本模型
```

入口说明见 **[docs/quality/README.md](./docs/quality/README.md)**，评测口径见 **[eval-rubric.md](./docs/quality/eval-rubric.md)**，失败案例见 **[failure-cases.md](./docs/quality/failure-cases.md)**。

当前评测使用合成夹具验证链路，数字不代表真实模型质量；换入真实视频后才能用于发布决策。

## 更多文档

- 代码结构与共享边界：**[docs/architecture.md](./docs/architecture.md)**
- 桌面客户端详细说明：**[desktop/README.md](./desktop/README.md)**
- Supabase 数据库接入：**[supabase/README.md](./supabase/README.md)**
- 产品需求：**[docs/PRD-bouldering-app.md](./docs/PRD-bouldering-app.md)**
- 下一版本产品需求：**[docs/PRD-v2.md](./docs/PRD-v2.md)**
- 竞品分析（Cruxie 逆向拆解）：**[docs/competitor-cruxie.md](./docs/competitor-cruxie.md)**
- 竞品分析（JTBD 视角）：**[docs/competitor-jtbd.md](./docs/competitor-jtbd.md)**
- 需求池：**[docs/backlog.md](./docs/backlog.md)**
- 低保真原型：**[docs/prototype/index.html](./docs/prototype/index.html)**
- 可复用技能（竞品分析）：**[skills/](./skills/)**
- 设计说明：**[docs/DESIGN.md](./docs/DESIGN.md)**

## 免责声明

本服务仅供训练参考，不构成医疗、康复或现场保护建议；请在安全环境下攀爬并自行承担风险。

For training reference only; not medical, rehab, or on-the-spot safety advice. Climb responsibly and at your own risk.

## License

MIT
