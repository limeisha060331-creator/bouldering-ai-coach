# AI 质量评测报告 · baseline-fixture-2026-10-26

- 生成时间：2026-10-26T13:03:22.531Z
- 模式：replay
- 数据源：synthetic-fixtures:evals\fixtures
- Prompt 版本：2026-02-1
- 模型：mixed (per case)
- 样本数：3

> 本报告使用 evals\fixtures 下的合成夹具验证评测链路。  
> 夹具只用于回归脚本与失败分类，不代表真实模型质量。  
> 接入真实视频后，把 mode 改为 live 并写入实际 usage。

## 汇总指标

| 指标 | 值 | 口径 |
| --- | ---: | --- |
| 综合质量分 | 65.5 | 0-100，内部加权，不是行业基准 |
| 格式合法率 | 66.7% | 有可解析片段且给出总分 |
| 时间戳可定位率 | 91.7% | 时间戳落在 0-时长+2s |
| 关键线索覆盖率 | 77.8% | 命中案例标签中的关键动作词 |
| 空话率 | 33.3% | 含「注意重心/多练习」类句式的片段占比 |
| 重复片段率 | 8.3% | 归一化文本完全相同 |
| 难度判断一致率 | 66.7% | 模型 V 级与案例标注一致 |
| 维度分覆盖率 | 33.3%（1/3） | 显式给出 5 维分的样本占比 |
| 维度分 MAE | 0.000 | 与人工 5 维评分平均绝对误差，越低越好；只统计有维度分的样本 |
| 平均片段数 | 4.7 | 每条视频产出的时间轴条目数 |
| 平均单次成本 | $0.0034 | 按 token 估算，不是账单 |

## 逐案例结果

| 案例 | 标签 | 质量分 | 片段 | 格式 | 时间戳 | 覆盖率 | 空话率 | 难度 | 维度 MAE | 失败码 |
| --- | --- | ---: | ---: | --- | ---: | ---: | ---: | --- | ---: | --- |
| case-001 | strong | 96.9 | 6 | 通过 | 100.0% | 100.0% | 0.0% | V4 / V4 | 0.00 | — |
| case-002 | generic | 56.3 | 4 | 通过 | 100.0% | 33.3% | 100.0% | V3 / V3 | — | DIMENSION_SCORES_MISSING, GENERIC_ADVICE, MUST_MENTION_MISSED |
| case-003 | malformed | 43.1 | 4 | 失败 | 75.0% | 100.0% | 0.0% | V3 / V5 | — | SCORE_MISSING, TIMESTAMP_NOT_MONOTONIC, TIMESTAMP_OUT_OF_RANGE, DIMENSION_SCORES_MISSING, DUPLICATE_SEGMENT, GRADE_MISMATCH, SEGMENT_TOO_SHORT |

## 失败分布

| 失败码 | 级别 | 次数 | 责任方 | 修复方向 |
| --- | --- | ---: | --- | --- |
| DIMENSION_SCORES_MISSING | P1 | 2 | prompt | 结构化输出加入 5 个维度的 1-5 分；这是 v2 schema 的核心验收项。 |
| DUPLICATE_SEGMENT | P1 | 1 | model | 按归一化文本去重，保留最早时间戳；重复率进入回归指标。 |
| GENERIC_ADVICE | P1 | 1 | prompt | 禁用“注意重心/多练习”类句式，要求动作 + 身体部位 + 下一次怎么做。 |
| GRADE_MISMATCH | P1 | 1 | model | 把用户填写的难度作为上下文传入，要求模型只做区间修正；记录偏差用于校准。 |
| MUST_MENTION_MISSED | P1 | 1 | prompt | 把关键线索写进案例标签，Prompt 要求逐条覆盖；漏检进入 badcase 池。 |
| SCORE_MISSING | P0 | 1 | prompt | 把 score 纳入 schema 必填字段；模型未给出时由维度分加权计算并标注来源。 |
| SEGMENT_TOO_SHORT | P2 | 1 | prompt | 要求每条至少包含“看到了什么 + 为什么错 + 下一次怎么做”。 |
| TIMESTAMP_NOT_MONOTONIC | P0 | 1 | parser | 按秒数稳定排序后再渲染；排序会改变叙事顺序时提示人工复核。 |
| TIMESTAMP_OUT_OF_RANGE | P0 | 1 | parser | 解析后校验 0 <= t <= duration + 2s；越界条目丢弃或标记为不可定位。 |

## 红线检查

本期有 3 条 P0 失败，发布前必须清零或明确豁免：

- SCORE_MISSING：未解析到「评分：xx/100」
- TIMESTAMP_NOT_MONOTONIC：存在倒序时间戳
- TIMESTAMP_OUT_OF_RANGE：1/4 条超出 0-62s

## 成本

- 本次样本总成本估算：$0.010（¥0.0724）
- 平均单次：$0.0034（¥0.0241）

> 注意：本报告使用合成夹具验证评测链路，数字不代表真实模型质量。换成真实视频与真实输出后，才能用于发布决策。
