# 技术设计 · AI 应用向说明


---

## 1. 问题定义

**输入**：用户拍摄的抱石攀爬视频（最长 10 分钟）。视频不上传，浏览器在本地抽成 16 张关键帧（768px、JPEG），只把这 16 张图发给模型。

**输出**：

- 带 `[MM:SS]` 时间戳的逐段点评  
- 可选「难度：Vx」  
- 评分 / 金句（若模型按提示输出）  
- 维度总结与改进要点（经 `parse-structured-report` 二次结构化）  

**约束**：

- Serverless 单次请求 ~60s，不能直接长时间阻塞 `POST`  
- `deepseek-flash` 只接受图片，单请求最多 600 张；本项目控制在 24 张以内  
- 模型可能返回空正文或 429，需要产品级重试与提示  

---

## 2. AI 流水线（异步 Job）

### 2.1 同步路径（开发 / 无 Blob）

无 Blob 存储时，`POST /api/analyze` 内联调用 `runDeepSeekAnalysis`，适合本地调试。

### 2.2 异步路径（生产）

1. `POST` 接收关键帧 JSON → 帧数组写入 Vercel Blob → 创建 `AnalysisJob`（JSON 元数据）  
2. `waitUntil` 触发 `process-analysis-job` 后台推进  
3. 阶段状态（节选）：
   - `uploaded` → `analyzing` → `completed` / `failed` / `rate_limited`  
4. 客户端 `pollUntilComplete` 轮询 `GET /api/analyze/status/:jobId`  
5. 完成后前端 `parseAnalysis` → 写入 IndexedDB → 跳转详情页  

**设计要点**：把「一次视觉推理」拆成**可轮询的状态机**，避免 HTTP 连接超时，并在状态里附带 `retryAfter` 供 UI 倒计时。任务里保存真实 token usage，便于核对成本。

---

## 3. Prompt 工程

文件：`lib/deepseek-analysis.ts`（抽帧提示词）、`lib/analyze-prompt.ts`（评测用输出契约）

| 维度 | 设计 |
|------|------|
| 人设 | 精英抱石教练；专业、简洁；禁止双引号（减少解析干扰） |
| 格式契约 | 每行 `[MM:SS]` + 一句点评；要求禁止空白敷衍回复 |
| 难度 | 可选行 `难度：Vn`（解析见 `parse-analysis` / `bouldering-grade`） |
| 深度 | `light`：字数/条数上限；`deep`：完整生物力学向分析 |
| 语言 | `locale`：`zh` / `en` 两套 base prompt |
| 版本 | `FRAME_PROMPT_VERSION = "2026-11-1"` 写入任务与分析记录，便于 A/B 与回归 |
| 输出上限 | `getDeepSeekMaxTokens(depth)`：light 4096 / deep 16384 |
| 输入声明 | 明确告诉模型「这是离散关键帧」，画面无法支撑的结论必须说明依据不足 |


---

## 4. 从 LLM 原文到产品数据

```
DeepSeek 纯文本
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

文件：`lib/deepseek-analysis.ts`、`lib/process-analysis-job.ts`

| 错误类型 | 策略 |
|----------|------|
| 429 / 5xx | 按官方建议冷却，Job 标记 `rate_limited` 并带 `retryAfter` |
| 402 余额不足 / 401 Key 失效 | 不可重试，直接给可操作提示 |
| 空分析正文 | `DeepSeekEmptyAnalysisError`，避免存空白记录 |
| 后台卡死 | `STALE_*` 超时检测，跨轮询重新 `waitUntil` 推进 |
| 管道并发 | `PIPELINE_LOCK_MS` 避免同一 job 重复推进 |


---

## 6. 与 Serverless / 前端的协同

- **抽帧**：`lib/frame-extraction.ts` 在浏览器侧均匀取帧并编码 JPEG，前后端共用同一套时间点算法  
- **取消**：`AbortController` 中断 fetch + 轮询  
- **进度**：`pipelineStep` 四段 UI（本地抽帧 → 提交分析 → DeepSeek 处理 → 生成点评）  
- **PDF**：`lib/pdf-html2canvas-fix.ts` 去掉 oklab 样式，避免 html2canvas 崩溃  

---

## 7. 可扩展：多模型 Provider

当前实现耦合 DeepSeek Chat Completions 的视觉输入格式。

建议抽象：

```ts
interface AnalyzeProvider {
  analyzeFrames(input: { frames: AnalyzeFrame[]; prompt: string }): Promise<string>;
}
```

实现 `DeepSeekProvider`、`QwenVLProvider` 等，用 `ANALYZE_PROVIDER` 环境变量切换——**先抽象接口即可，不必全部实现**。切换供应商时抽帧层不变，只替换请求构造与错误映射。

---

