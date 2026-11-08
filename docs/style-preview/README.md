# 首页风格方向预览

四版均为 1440 × 1100 的真实渲染稿，内容取自现有产品能力与示例训练数据，用于确定视觉方向。方案 B 已落地，其余三版保留作后续参考。

| 方案 | 文件 | 关键词 | 适合的气质 |
| --- | --- | --- | --- |
| A 瑞士大字报 | `a-swiss-editorial.html` / `.png` | 纸感、钴蓝、红色批注、112px 标题 | 独立训练日志、编辑感、专业但不冷 |
| B 暗夜竞技 | `b-neon-athletic.html` / `.png` | 黑底、酸性绿、全屏照片、138px 标题 | 最有记忆点，像运动品牌 / 攀岩馆海报 |
| C 暖色产品 | `c-warm-premium.html` / `.png` | 奶油底、橙色渐变、圆角卡片、82px 标题 | 面向大众消费者，亲和、像成熟 App |
| D 训练记分板 | `d-scoreboard.html` / `.png` | 黑白、橙色、超大数据、78px 标题 | 硬核训练工具，强调分数与可执行建议 |

## 重新渲染

```powershell
& "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" `
  --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 `
  --window-size=1440,1100 --virtual-time-budget=9000 `
  --screenshot="docs\style-preview\a-swiss-editorial.png" `
  "file:///D:/my-bouldering-ai/docs/style-preview/a-swiss-editorial.html"
```

其余三版替换文件名即可。字体通过 Google Fonts 加载，截图时需要保持网络可用。

## 最终落地

选定方案 B「暗夜竞技」，已接入 `components/landing-home.tsx` 与 `styles/landing-neon.css`。首页固定为品牌深色，分析、进步、收藏等内页继续跟随白天 / 黑夜设置。

- 桌面最终稿：`landing-final-desktop.png`
- 手机最终稿：`landing-final-mobile.png`
