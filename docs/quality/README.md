# 质量与成本运营

这套文档回答四个问题，每个问题都对应一个可执行入口：

| 问题 | 入口 | 产出 |
| --- | --- | --- |
| 怎么知道 AI 说得对？ | `npm run eval` | 评测报告与失败分布 |
| 一次分析多少钱？ | `npm run cost:report` | 单次、月度与单位经济 |
| 它会在哪里坏？ | `lib/failure-taxonomy.ts` + `failure-cases.md` | 失败码、责任方、回归用例 |
| 下一版该不该上？ | `npm run eval:compare` + `iteration-log.md` | 上线 / 继续迭代 / 回滚 |

## 当前基线

仓库里有一组合成夹具，用来验证评测链路本身。它们不是真实模型输出，数字不能当作质量结论。

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

再次强调：这组数字来自 `evals/fixtures` 和 `evals/fixtures-v2` 的合成输出。它证明的是“评测和决策能跑”，不是“模型已经达到 96 分”。换成 20 条真实视频后，报告才具备发布参考价值。

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
```

## 设计取舍

1. 先测能测的。当前自由文本输出没有稳定的维度分，所以 `DIMENSION_SCORES_MISSING` 被显式记录成失败，而不是用启发式猜一个分数。
2. 先做 replay，再做 live。合成夹具能保证 CI 稳定；真实调用有配额、成本和随机性，不能拿来当每次提交的门禁。
3. 决策规则前置。上线门槛写在代码里，不靠事后解释“感觉这版更好”。
4. 成本和质量一起看。模型路由不能只看单价，抽帧便宜但会丢帧间动作，必须用质量指标换。

## 下一步

- 收集 20 条真实抱石视频，完成双人标注，跑第一版 live 基线。
- 把 `eval` 接进 CI，Prompt 变更必须跑固定子集。
- 做 `/quality` 看板，展示最近一次评测、失败分布与成本趋势。
- 把用户反馈（有用 / 不准 + 原因）接进评测集，形成数据飞轮。

## 相关文件

- 评测口径：[eval-rubric.md](./eval-rubric.md)
- 失败案例：[failure-cases.md](./failure-cases.md)
- 成本模型：[cost-model.md](./cost-model.md)
- 迭代记录：[iteration-log.md](./iteration-log.md)
- 评测脚本：[evals/README.md](../../evals/README.md)
