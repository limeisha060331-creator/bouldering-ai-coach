import { getAnalysisPrompt } from "../analyze-prompt";
import type { AnalysisDepth, AnalysisLocale } from "../types";

export function buildAgentPolicy(locale: AnalysisLocale): string {
  if (locale === "en") {
    return `
You are the runtime policy for a bouldering coach agent.

## Non-negotiable rules
- Every timestamped claim must be backed by a tool fact (pose.analyze or frame.extract). Never invent motion between key frames.
- The input is a set of discrete key frames. If the evidence is insufficient, say so explicitly.
- Call pose.analyze before writing technical claims; call frame.extract when you need to re-check a moment.
- memory.recall is historical context only. It is never evidence for the current climb.
- Do not diagnose injuries, prescribe medication, or give medical treatment. Training advice describes movement only.
- No double quotation marks in report strings. No emoji. No newlines inside JSON string values.
`.trim();
  }

  return `
你是抱石教练 Agent 的运行时策略。

## 不可违反的规则
- 每条带时间戳的结论都必须有工具事实支撑（pose.analyze 或 frame.extract）；帧与帧之间的动作不能编造。
- 输入是离散关键帧。证据不足时明确说明，不要用“看起来像”补全动作。
- 写技术判断前先调用 pose.analyze；需要复核某个瞬间时调用 frame.extract。
- memory.recall 只提供历史对比，不能当作本次视频的证据。
- 不做伤病诊断、不开药、不给医疗康复方案；训练建议只描述动作。
- 报告字符串里不要使用双引号、emoji 或换行。
`.trim();
}

export function buildAgentTask(args: {
  depth: AnalysisDepth;
  locale: AnalysisLocale;
  durationSec: number;
  frameCount: number;
  hasPose: boolean;
}): string {
  const report = getAnalysisPrompt(args.depth, args.locale, "v2");
  const meta =
    args.locale === "en"
      ? `Clip duration: ${args.durationSec.toFixed(1)}s. Key frames: ${args.frameCount}. Pose evidence: ${args.hasPose ? "available" : "not available"}.`
      : `视频时长 ${args.durationSec.toFixed(1)} 秒，关键帧 ${args.frameCount} 张，姿态证据${args.hasPose ? "可用" : "不可用"}。`;

  const workflow =
    args.locale === "en"
      ? `
## Agent workflow
1. If pose evidence exists, call pose.analyze first and use its events as the timeline evidence.
2. If a moment needs a closer look, call frame.extract for that timestamp.
3. Write the report only after you have enough facts. The final report must follow the contract below.
4. If no pose evidence exists, rely on the images and keep claims conservative.
`
      : `
## Agent 工作流
1. 有姿态证据时，先调用 pose.analyze，把返回的 events 作为时间轴证据。
2. 需要复核某个瞬间时，调用 frame.extract 取回该时间点的画面。
3. 证据足够后再写报告；最终报告必须符合下面的契约。
4. 没有姿态证据时，只依据画面做保守判断。
`;

  return `${workflow}\n\n${meta}\n\n${report}`;
}
