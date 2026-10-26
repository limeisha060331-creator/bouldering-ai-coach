# 真实视频语料：来源、授权与边界

评测要说真话，第一件事是把数据来源说清楚。这份文档记录三件事：为什么不用社交平台的视频、现在用的 11 条从哪来、以后想加自有拍摄要走什么流程。

## 1. 为什么不去小红书 / 抖音抓视频

抓这两类平台的抱石视频，会同时踩三条独立的线，任何一条单独成立都够否掉方案：

| 风险 | 具体问题 |
| --- | --- |
| 版权 | 视频是创作者的视听作品。下载、长期留存、送入第三方大模型、再把生成结果用于公开演示或产品训练，属于复制与改编使用，需要权利人许可。 |
| 肖像权 | 《民法典》第 1019 条规定，未经同意不得制作、使用、公开他人肖像。抱石视频的主体一定是可识别的真人。 |
| 平台条款 | 两家平台的用户协议都禁止未经许可的抓取、下载与再分发，技术上也有签名链接和风控，批量拉取本身就不稳定。 |

还有一条工程层面的理由：来源不可审计。简历上写“用真实用户视频建立质量基线”，面试官下一句必然是“这些数据哪来的、有没有授权”。答不上来，这条反而变成减分项；答得上来，它才是证据。

## 2. 现在用的语料

来自维基共享资源（Wikimedia Commons）的抱石视频。授权为 CC0、CC BY、CC BY-SA 或公有领域，允许下载、留存与处理，义务是保留署名与许可声明。

筛选规则：内容必须是抱石（排除“Boulder”地名、滚石乐队等噪音）、授权必须明确、容器必须是 Gemini File API 支持的视频格式（`.ogv` / `.ogg` 排除）、时长贴近普通用户上传的关键片段。

结果是 11 条，合计 435.9 秒，覆盖三类场景：

- 室内赛事 7 条：IFSC 欧锦赛、法国大师赛决赛，机位固定、光线好、选手水平高
- 室内商业岩馆 1 条：`204x360` 竖屏，最接近用户手机拍摄，难度 V3
- 户外 3 条：Hueco Tanks 花岗岩，难度 V6 / V10 / V11，是唯一有外部可核对难度的子集

| 案例 | 场景 | 时长 | 授权 | 署名 |
| --- | --- | ---: | --- | --- |
| `gym-rockspot-v3` | indoor-gym | 45.91s | CC BY-SA 3.0 | Cryptic C62 |
| `hueco-baby-martini-v6` | outdoor | 46.44s | CC BY 3.0 | Cameras and editing: Gabi Enos, Brandon Fox |
| `hueco-fern-roof-v10` | outdoor | 28.76s | CC BY 3.0 | Cameras and editing: Gabi Enos, Brandon Fox |
| `hueco-schwerer-gustav-v11` | outdoor | 37.04s | CC BY 3.0 | Cameras and editing: Gabi Enos, Brandon Fox |
| `ifsc-euros-2020-khazanov-b3` | indoor-competition | 19.01s | CC0 | Voltmetro |
| `jmm-2013-becan` | indoor-competition | 77.66s | CC BY-SA 3.0 | Shev123 |
| `jmm-2013-malamid` | indoor-competition | 49.26s | CC BY-SA 3.0 | Shev123 |
| `jmm-2013-markovic` | indoor-competition | 45.17s | CC BY-SA 3.0 | Shev123 |
| `jmm-2013-schubert-long` | indoor-competition | 45.55s | CC BY-SA 3.0 | Shev123 |
| `jmm-2013-schubert-short` | indoor-competition | 15.01s | CC0 | Shev123 |
| `jmm-2013-stohr` | indoor-competition | 26.05s | CC0 | Shev123 |

完整元数据（含作者主页、许可链接、原始文件地址）在 `evals/corpus/sources/commons-bouldering.json`，这份文件进仓库，可以逐条复核。

## 3. 数据纪律

1. **来源清单进仓库，视频不进仓库。** `evals/private/` 已在 `.gitignore` 里，视频只存在本地或私有存储。
2. **每个文件记 sha256。** 换文件等于换结果，指纹对不上就不该和旧报告比较。
3. **署名跟着数据走。** manifest 里保留 license 与 artist 字段，对外展示截图或片段时附上原视频作者。
4. **难度只用外部可核对的值。** 赛事的线路难度不公开，所以那 7 条 `grade` 为 `null`。编一个 V4 进去，会让“难度一致率”这个指标失去意义。
5. **不重打包分发。** 处置方式限定在本地评测，不对外提供下载，不做数据集二次发布。

## 4. 这批语料不能代表什么

- 机位、光线、构图都优于普通用户在岩馆随手拍的视频，结论不能直接外推到 C 端。
- 选手以职业或高水平爱好者为主，动作技术分布和入门用户不同。
- 没有真人出镜授权的自有素材，因此不覆盖“用户隐私处理”这个真实场景。
- 11 条不足以支撑上线决策，只能支撑技术链路可行性。

## 5. 以后加自有拍摄的视频

自有拍摄才是真正的代表性样本，但要走流程：

1. 视频只存私有存储，不入仓库、不进公开演示，除非另行获得书面同意。
2. 同意书至少包含：用途（内部质量评测）、范围（匿名引用动作片段与文字结论）、期限（90 天后删除）、撤回权（可随时撤回并删除）。
3. 每条记录 sha256、时长、难度、机位、岩馆，难度由本人或教练确认，不从视频猜。
4. 每条视频至少一人标注；其中 8 条由两人独立标注，用来算一致性。标注时看不到模型输出。
5. 目标 20 条起，覆盖 V2-V3 / V4-V5 / V6+ 三档，完攀与脱落各半，至少两家岩馆。

## 6. 相关入口

```bash
npm run corpus:fetch -- --dry-run   # 看计划，不联网
npm run corpus:fetch                # 下载到 evals/private/corpus/，写 manifest
npm run eval:live -- --dry-run      # 看会跑哪些案例，不调 API
npm run eval:live                   # 真实调用，产出结构基线报告
```
