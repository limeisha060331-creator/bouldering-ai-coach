# 质量与成本运营

这套文档回答四个问题，每个问题都对应一个可执行入口：

| 问题 | 入口 | 产出 |
| --- | --- | --- |
| 怎么知道 AI 说得对？ | `npm run eval` | 评测报告与失败分布 |
| 一次分析多少钱？ | `npm run cost:report` | 单次、月度与单位经济 |
| 它会在哪里坏？ | `lib/failure-taxonomy.ts` + `failure-cases.md` | 失败码、责任方、回归用例 |
| 下一版该不该上？ | `npm run eval:compare` + `iteration-log.md` | 上线 / 继续迭代 / 回滚 |

## 两套基线，别混着用

### 真实基线（10 条真实视频，2026-10-26）

用 11 条公开授权的抱石视频跑生产链路（`npm run eval:live`），实际跑通 10 条，共 435 秒素材。授权与筛选规则见 [data-sources.md](./data-sources.md)。

| 指标 | 实测 | 红线 | 结论 |
| --- | ---: | ---: | --- |
| 可解析率 | 100.0% | ≥ 98% | 通过 |
| 契约完整率 | 0.0% | ≥ 98% | 未通过 |
| 时间戳可定位率 | 100.0% | ≥ 95% | 通过 |
| 5 维分覆盖率 | 0.0% | ≥ 90% | 未通过 |
| 空话率 | 0.6% | ≤ 30% | 通过 |
| 重复片段率 | 2.0% | ≤ 20% | 通过 |
| P0 失败案例 | 10 / 10 | 0 | 未通过 |
| 难度一致率 | 25%（1/4） | 只观察 | — |

真实成本为 $0.00711/条，估算 $0.00646/条，**成本模型低估 9.2%**。端到端平均 51.9 秒（上传 20.2s + 等待 ACTIVE 6.7s + 生成 25.1s）。

这轮最重要的结论不是分数，而是两件只有真数据才会暴露的事：

1. **输出契约和 Prompt 脱节。** 生产 Prompt 从未要求输出总分和 5 维分，但下游评测和 UI 按「有总分」验收。所以契约完整率 0%，而这个 0% 不是模型看不懂视频——可解析率是 100%，时间戳 100% 落在有效区间。这是规格问题，不是能力问题。
2. **难度判断向中间回归。** 4 条有外部难度标注的样本里只对 1 条（V3→V3）；V6 判成 V5，V10 判成 V6，V11 判成 V6。预测值全库只落在 V5–V7，说明模型没有区分高难度的能力，评分语境因此不可信。

完整报告：[真实基线报告](../../evals/runs/live-baseline-2026-10-26/report.md)

样本 10 条 < 20 条，因此这一轮只下「链路可用 + 发现两个规格缺陷」的结论，不下「质量达标」或「可以上线」的结论。5 维人工标注尚未开始，所以没有综合质量分，也没有维度分 MAE。

### 合成基线（用于验证评测链路本身）

仓库里还有一组合成夹具，用来验证 replay 评测与版本对比脚本能跑。它们不是真实模型输出，数字不能当作质量结论。

| 指标 | 基线 | 候选 | 变化 |
| --- | ---: | ---: | ---: |
| 综合质量分 | 65.5 | 96.2 | +30.7pt |
| 格式合法率 | 66.7% | 100.0% | +33.3pt |
| 时间戳可定位率 | 91.7% | 100.0% | +8.3pt |
| 关键线索覆盖率 | 77.8% | 100.0% | +22.2pt |
| 空话率 | 33.3% | 0.0% | -33.3pt |
| 维度分覆盖率 | 33.3% | 100.0% | +66.7pt |
| 单次成本 | $0.0034 | $0.0036 | +6.7% |
| P0 失败数 | 3 | 0 | -3 |

决策：上线。理由是指标提升超过门槛，且格式、时间戳、成本三条红线都通过。

再次强调：这组数字来自 `evals/fixtures` 和 `evals/fixtures-v2` 的合成输出。它证明的是“评测和决策能跑”，不是“模型已经达到 96 分”。

本次报告可以直接打开：

- [基线报告](../../evals/runs/baseline-fixture-2026-10-26/report.md)
- [候选报告](../../evals/runs/candidate-v2-2026-10-26/report.md)
- [版本对比与决策](../../evals/runs/candidate-v2-2026-10-26/comparison-vs-baseline-fixture-2026-10-26.md)

## 快速开始

```bash
npm run test
npm run eval -- --run-id baseline
npm run eval -- --run-id candidate --fixtures evals/fixtures-v2
npm run eval:compare -- baseline candidate
npm run cost:report
npm run corpus:fetch -- --dry-run   # 看语料计划，不联网
npm run corpus:fetch                # 下载授权视频到 evals/private/
npm run eval:live -- --dry-run      # 看会跑哪些案例，不调 API
npm run eval:live -- --run-id live-baseline   # 真实调用
npm run eval:live -- --replay live-baseline   # 只重算报告，不重复花钱
```

## 设计取舍

1. 先测能测的。当前自由文本输出没有稳定的维度分，所以 `DIMENSION_SCORES_MISSING` 被显式记录成失败，而不是用启发式猜一个分数。
2. 先做 replay，再做 live。合成夹具能保证 CI 稳定；真实调用有配额、成本和随机性，不能拿来当每次提交的门禁。
3. 决策规则前置。上线门槛写在代码里，不靠事后解释“感觉这版更好”。
4. 成本和质量一起看。模型路由不能只看单价，抽帧便宜但会丢帧间动作，必须用质量指标换。

## 下一步

- 补到 20 条真实视频，其中 8 条双人标注，补齐 5 维 MAE。
- 结构化输出 v2：把 `score`、`dimensionScores`、`timestamp`、`evidence` 做成 schema 必填，验收项是契约完整率从 0% 到 ≥ 98%。
- 难度只做区间修正：把用户填写的难度作为上下文传入，禁止模型全库输出 V5–V7。
- 把 `eval` 接进 CI，Prompt 变更必须跑固定子集。
- 做 `/quality` 看板，展示最近一次评测、失败分布与成本趋势。
- 把用户反馈（有用 / 不准 + 原因）接进评测集，形成数据飞轮。

## 相关文件

- 评测口径：[eval-rubric.md](./eval-rubric.md)
- 语料来源与授权：[data-sources.md](./data-sources.md)
- 失败案例：[failure-cases.md](./failure-cases.md)
- 成本模型：[cost-model.md](./cost-model.md)
- 迭代记录：[iteration-log.md](./iteration-log.md)
- 评测脚本：[evals/README.md](../../evals/README.md)
