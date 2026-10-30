# 评测与成本基线

这套目录不是“再写一篇方法论”，而是把四件事做成可执行的东西：

| 模块 | 入口 | 产出 |
| --- | --- | --- |
| 成本模型 | `npm run cost:report` | `docs/quality/cost-model.md` |
| 评测回归 | `npm run eval` | `evals/runs/<runId>/report.md` |
| 版本对比 | `npm run eval:compare -- <baseline> <candidate>` | `comparison-vs-*.md` |
| 真实语料 | `npm run corpus:fetch` | `evals/private/corpus/manifest.json` |
| 真实基线 | `npm run eval:live` | 结构指标、真实 token、真实耗时 |
| 版本对比 | `npm run eval:live:compare -- <base> <candidate>` | 结构层上线 / 迭代决策 |
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
├─ cases/           案例元数据：时长、难度、人工 5 维评分、必须提到的线索
├─ fixtures/        模型输出夹具：strong / generic / malformed
├─ corpus/
│  ├─ sources/      真实视频的授权清单（进仓库，可复核）
│  ├─ schema.ts     语料 schema 与覆盖度统计
│  └─ fetch.ts      下载器：sha256 固定、429 退避、断点续传
├─ private/         真实视频与 manifest（.gitignore，不进仓库）
├─ runs/            每次评测的结果 JSON 与 Markdown 报告
├─ run.ts           replay 评测入口
├─ live.ts          live 评测入口（真实视频 + 真实 API）
├─ live-report.ts   live 报告渲染
├─ live-compare.ts  两次 live 运行的结构对比与红线判定
├─ compare.ts       两版对比与决策
├─ cost-report.ts 成本模型生成器
└─ report.ts       replay 报告渲染
```

## 两种模式

- `replay`：读 `fixtures/` 里已有的模型输出，离线跑指标。不需要 API Key，适合 CI 和回归，也可以复现历史上的 badcase。
- `live`：读 `evals/private/corpus/manifest.json`，跑生产同一条链路（uploadFile → 轮询 ACTIVE → generateContent），记录 provider 真实 token、各阶段耗时和原始输出。

两种模式的指标集不同，这是故意的：

| | replay | live |
| --- | --- | --- |
| 人工标签 | 需要（fixtures 指向上面的 case） | 可以没有 |
| 能出综合质量分 | 能 | 不能，只出结构分 |
| 能出 5 维 MAE | 能 | 不能，等人标 |
| 能出真实 token / 成本 / 耗时 | 不能（估算） | 能 |

`live` 模式只跑不依赖人工标注的指标：格式合法率、时间戳可定位率、空话率、重复片段率、失败码分布。没有人工金标就不给质量分，避免把“格式对了”说成“教练质量达标”。

## 输出契约 v1 / v2

v1 是自由文本，`score` 和 5 维分靠模型自觉，真实基线 10/10 缺失。v2 改成单个 JSON 对象，schema 在 `lib/analysis-schema.ts`，解析器先试契约、失败回落 v1 正则。

```bash
npm run eval:live -- --contract v2 --run-id live-v2 --gap 8
npm run eval:live:compare -- live-baseline-2026-10-26 live-v2
```

生产默认仍是 v1（`ACTIVE_CONTRACT`），改之前先跑对比。

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

## 真实语料的授权边界

来源、筛选规则和授权矩阵写在 [docs/quality/data-sources.md](../docs/quality/data-sources.md)。一句话：只收授权明确的公开视频（CC0 / CC BY / CC BY-SA / 公有领域），视频不进仓库，只提交元数据与 sha256。

## 当前限制

- 夹具是合成的，报告里的数字只能证明脚本能跑，不能证明模型质量。
- 维度分依赖模型显式输出「维度分：…」这一行；当前 Prompt 不保证，所以 `DIMENSION_SCORES_MISSING` 是预期内的失败。
- 成本是估算，不是账单；接入真实 usage 后要校准一次。
- `live` 模式的语料是公开授权的赛事与户外视频，机位和选手水平都优于普通用户，结论不能直接外推到 C 端。
- 还没有把评测接到 CI 和线上看板，这是下一步。
