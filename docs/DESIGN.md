# 技术设计 · AI 应用向说明

本文档用于面试时讲解：**如何把「多模态大模型」嵌进可上线的 Serverless 产品**，而不是只调一次 Chat API。

---

## 1. 问题定义

**输入**：用户拍摄的抱石攀爬视频（通常 10～90 秒，需压到约 3.5MB 以内以满足 Vercel 请求体上限）。

**输出**：

- 带 `[MM:SS]` 时间戳的逐段点评  
- 可选「难度：Vx」  
- 评分 / 金句（若模型按提示输出）  
- 维度总结与改进要点（经 `parse-structured-report` 二次结构化）  

**约束**：

- Serverless 单次请求 ~60s，不能直接长时间阻塞 `POST`  
- Gemini 免费档 RPM / 日配额 / `generateContent` 单独计数  
- 模型可能返回空正文或 429，需要产品级重试与提示  

---

## 2. AI 流水线（异步 Job）

### 2.1 同步路径（开发 / 无 Blob）

小视频在 `POST /api/analyze` 内联调用 `analyzeVideoInline`，适合本地调试。

### 2.2 异步路径（生产）

1. `POST` 接收视频 → 写入 Vercel Blob → 创建 `AnalysisJob`（JSON 元数据）  
2. `waitUntil` 触发 `process-analysis-job` 后台推进  
3. 阶段状态（节选）：
   - `uploaded` → `gemini_uploading` → `gemini_processing` → `analyzing` → `completed` / `failed` / `rate_limited`  
4. 客户端 `pollUntilComplete` 轮询 `GET /api/analyze/status/:jobId`  
5. 完成后前端 `parseAnalysis` → 写入 IndexedDB → 跳转详情页  

**设计要点**：把「等 Gemini 两分钟」拆成**可轮询的状态机**，避免 HTTP 连接超时，并在状态里附带 `retryAfter` 供 UI 倒计时。

---

## 3. Prompt 工程

文件：`lib/analyze-prompt.ts`

| 维度 | 设计 |
|------|------|
| 人设 | 精英抱石教练；专业、简洁；禁止双引号（减少解析干扰） |
| 格式契约 | 每行 `[MM:SS]` + 一句点评；要求禁止空白敷衍回复 |
| 难度 | 可选行 `难度：Vn`（解析见 `parse-analysis` / `bouldering-grade`） |
| 深度 | `light`：字数/条数上限；`deep`：完整生物力学向分析 |
| 语言 | `locale`：`zh` / `en` 两套 base prompt |
| 版本 | `PROMPT_VERSION = "2026-02-1"` 写入分析记录，便于 A/B 与回归 |
| 输出上限 | `getMaxOutputTokens(depth)`：light 4096 / deep 8192 |

**面试话术**：Prompt 不是写在 UI 里的字符串，而是**独立模块 + 版本号 + 与深度/语言正交配置**，方便迭代而不改前端。

---

## 4. 从 LLM 原文到产品数据

```
Gemini 纯文本
    → parseAnalysis（时间轴行、评分、金句、难度）
    → parseStructuredReport（维度 bullet、改进块）
    → AnalysisRecord + UI / PDF
```

**为何不用 JSON Mode？**

- 早期以教练「叙述体」为主，时间轴行是自然格式；  
- 结构化块由二次解析兜底，降低模型偶发 JSON 破损导致全页失败的风险。  

**可改进**：要求模型输出固定 JSON schema，再用 zod 校验。

---

## 5. 可靠性与限流

文件：`lib/gemini-retry.ts`、`lib/process-analysis-job.ts`

| 错误类型 | 策略 |
|----------|------|
| RPM 429 | 解析 `retry in Ns`，UI 显示冷却；Job 标记 `rate_limited` |
| generateContent 日配额 | 区分硬失败 vs 短冷却；后台最多 3 次分析重试 |
| 空分析正文 | `GeminiEmptyAnalysisError`，避免存空白记录 |
| 后台卡死 | `STALE_*` 超时检测，跨轮询重新 `waitUntil` 推进 |
| 管道并发 | `PIPELINE_LOCK_MS` 避免同一 job 重复推进 |

**面试话术**：LLM 应用的核心不是「能调通 API」，而是**错误 taxonomy + 状态机 + 用户可理解的等待/重试**。

---

## 6. 与 Serverless / 前端的协同

- **压缩**：`lib/compress-video.ts` 在浏览器侧压到可上传大小  
- **取消**：`AbortController` 中断 fetch + 轮询  
- **进度**：`pipelineStep` 四段 UI（本地处理 → 上传 → Gemini 处理 → 生成）  
- **PDF**：`lib/pdf-html2canvas-fix.ts` 去掉 oklab 样式，避免 html2canvas 崩溃  

---

## 7. 可扩展：多模型 Provider

当前实现耦合 Gemini File API + `generateContent`。

建议抽象：

```ts
interface AnalyzeProvider {
  analyzeVideo(input: { buffer: Buffer; mimeType: string; prompt: string }): Promise<string>;
}
```

实现 `GeminiProvider`、`OpenAIProvider`（抽帧 + vision）、`QwenVLProvider` 等，用 `ANALYZE_PROVIDER` 环境变量切换——**先抽象接口即可，不必全部实现**。

---

## 8. 国内与合规（口述即可）

- 用户访问：Vercel 境外节点，国内不稳定  
- 模型：Gemini 需境外 API；落地国内需换国产 VL + 国内云函数  
- 内容安全：Gemini safety settings（`lib/gemini-safety.ts`）  

---

## 9. 面试 3 分钟讲解顺序（建议背诵大纲）

1. **场景**：抱石视频 → AI 教练报告  
2. **架构图**：异步 Job + 轮询 + IndexedDB  
3. **Prompt**：版本、双语、深浅、输出格式契约  
4. **难点 1**：Serverless 超时 → Blob + waitUntil  
5. **难点 2**：429 分类与状态机重试  
6. **难点 3**：非 JSON 输出 → 解析器 + 结构化报告  
7. **后续**：Provider 抽象、记录上云、国内模型  
