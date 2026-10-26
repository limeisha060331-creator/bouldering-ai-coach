# 评测与成本基线

这套目录不是“再写一篇方法论”，而是把四件事做成可执行的东西：

| 模块 | 入口 | 产出 |
| --- | --- | --- |
| 成本模型 | `npm run cost:report` | `docs/quality/cost-model.md` |
| 评测回归 | `npm run eval` | `evals/runs/<runId>/report.md` |
| 版本对比 | `npm run eval:compare -- <baseline> <candidate>` | `comparison-vs-*.md` |
| 失败分类 | `lib/failure-taxonomy.ts` | 每个失败码的级别、责任方、修复与回归 |

## 快速开始

```bash
npm run test          # 单元测试：成本计算、指标、决策规则
npm run eval          # 用合成夹具跑一遍评测，生成报告
npm run cost:report   # 生成成本模型文档
```

跑两次评测后可以做版本对比：

```bash
npm run eval -- --run-id baseline
npm run eval -- --run-id candidate --fixtures evals/fixtures-v2
npm run eval:compare -- baseline candidate
```

`--fixtures` 不传时默认读 `evals/fixtures`，用于固定基线；候选版本放在单独目录，避免两次评测混用同一批输出。

## 目录

```text
evals/
├─ cases/       案例元数据：时长、难度、人工 5 维评分、必须提到的线索
├─ fixtures/    模型输出夹具：strong / generic / malformed
├─ runs/        每次评测的结果 JSON 与 Markdown 报告
├─ run.ts       评测入口
├─ compare.ts   两版对比与决策
├─ cost-report.ts 成本模型生成器
└─ report.ts    Markdown 渲染
```

## 两种模式

- `replay`：读 `fixtures/` 里已有的模型输出，离线跑指标。当前默认模式，不需要 API Key，适合 CI 和回归。
- `live`：以后接真实视频与真实模型调用，写入实际 usage。当前还没有实现，避免把合成数据伪装成真实基线。

## 指标口径

| 指标 | 定义 | 为什么要有 |
| --- | --- | --- |
| 格式合法率 | 有可解析时间戳片段且给出总分 | 报告能不能被产品消费 |
| 时间戳可定位率 | `0 <= t <= 时长 + 2s` | 用户能不能跳回原视频 |
| 关键线索覆盖率 | 命中案例标签里的动作词 | 有没有讲到这条线的关键动作 |
| 空话率 | 含「注意重心/多练习」类句式的片段占比 | 点评是否可执行 |
| 重复片段率 | 归一化文本完全相同的占比 | 模型是否在凑条数 |
| 难度一致率 | 模型 V 级与标注一致 | 评分语境是否可信 |
| 维度分 MAE | 5 维评分与人工评分的平均绝对误差 | 分数是否接近人类判断 |
| 综合质量分 | 上述指标的加权和，P0 失败额外惩罚 | 只用于版本间比较，不是行业基准 |

## 加一个真实案例

1. 在 `evals/cases/` 新建 JSON，填时长、难度、5 维人工评分和必须提到的线索。
2. 把真实模型输出放到 `evals/fixtures/`，`caseId` 指向新案例。
3. 跑 `npm run eval`，看报告里的失败码。
4. 如果这是线上 badcase，把失败码和证据补进 `docs/quality/failure-cases.md`。

案例视频不要进仓库。仓库只存元数据、标签和脱敏后的输出；视频留在本地或私有存储。

## 当前限制

- 夹具是合成的，报告里的数字只能证明脚本能跑，不能证明模型质量。
- 维度分依赖模型显式输出「维度分：…」这一行；当前 Prompt 不保证，所以 `DIMENSION_SCORES_MISSING` 是预期内的失败。
- 成本是估算，不是账单；接入真实 usage 后要校准一次。
- 还没有把评测接到 CI 和线上看板，这是下一步。
