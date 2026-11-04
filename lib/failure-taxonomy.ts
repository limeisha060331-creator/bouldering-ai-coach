export type FailureSeverity = "P0" | "P1" | "P2";

export type FailureOwner =
  | "prompt"
  | "parser"
  | "model"
  | "pipeline"
  | "product";

export type FailureCode =
  | "EMPTY_OUTPUT"
  | "NO_TIMESTAMPED_SEGMENTS"
  | "SCORE_MISSING"
  | "GRADE_MISSING"
  | "GRADE_MISMATCH"
  | "TIMESTAMP_OUT_OF_RANGE"
  | "TIMESTAMP_NOT_MONOTONIC"
  | "MUST_MENTION_MISSED"
  | "GENERIC_ADVICE"
  | "DUPLICATE_SEGMENT"
  | "SEGMENT_TOO_SHORT"
  | "DIMENSION_SCORES_MISSING"
  | "DIMENSION_MAE_HIGH";

export type FailureMeta = {
  code: FailureCode;
  label: string;
  severity: FailureSeverity;
  owner: FailureOwner;
  fix: string;
  regression: string;
};

export type FailureFinding = {
  code: FailureCode;
  severity: FailureSeverity;
  owner: FailureOwner;
  evidence: string;
  fix: string;
};

/**
 * 每个失败码都必须能对应到一个可复现的回归用例。
 * 只写“模型不稳定”不算失败分类，写清“哪一步、谁负责、怎么回归”才算。
 */
export const FAILURE_LIBRARY: Record<FailureCode, FailureMeta> = {
  EMPTY_OUTPUT: {
    code: "EMPTY_OUTPUT",
    label: "模型返回空正文",
    severity: "P0",
    owner: "pipeline",
    fix: "保留 DeepSeekEmptyAnalysisError，后台重试；仍为空则改用轻量深度或更短片段并提示用户。",
    regression: "fixture: empty-output",
  },
  NO_TIMESTAMPED_SEGMENTS: {
    code: "NO_TIMESTAMPED_SEGMENTS",
    label: "没有任何可解析的时间戳片段",
    severity: "P0",
    owner: "parser",
    fix: "结构化输出为主路径，正则仅做兜底；失败时返回可读错误而不是空白页。",
    regression: "fixture: malformed-timestamps",
  },
  SCORE_MISSING: {
    code: "SCORE_MISSING",
    label: "缺少总分",
    severity: "P0",
    owner: "prompt",
    fix: "把 score 纳入 schema 必填字段；模型未给出时由维度分加权计算并标注来源。",
    regression: "fixture: missing-score",
  },
  GRADE_MISSING: {
    code: "GRADE_MISSING",
    label: "缺少难度判断",
    severity: "P2",
    owner: "prompt",
    fix: "难度允许为空，但要在 UI 标注“AI 未能判定”，不能静默留空。",
    regression: "fixture: missing-grade",
  },
  GRADE_MISMATCH: {
    code: "GRADE_MISMATCH",
    label: "难度判断与标注不一致",
    severity: "P1",
    owner: "model",
    fix: "把用户填写的难度作为上下文传入，要求模型只做区间修正；记录偏差用于校准。",
    regression: "fixture: grade-mismatch",
  },
  TIMESTAMP_OUT_OF_RANGE: {
    code: "TIMESTAMP_OUT_OF_RANGE",
    label: "时间戳超出视频时长",
    severity: "P0",
    owner: "parser",
    fix: "解析后校验 0 <= t <= duration + 2s；越界条目丢弃或标记为不可定位。",
    regression: "fixture: timestamp-out-of-range",
  },
  TIMESTAMP_NOT_MONOTONIC: {
    code: "TIMESTAMP_NOT_MONOTONIC",
    label: "时间戳倒序",
    severity: "P0",
    owner: "parser",
    fix: "按秒数稳定排序后再渲染；排序会改变叙事顺序时提示人工复核。",
    regression: "fixture: timestamp-non-monotonic",
  },
  MUST_MENTION_MISSED: {
    code: "MUST_MENTION_MISSED",
    label: "漏掉关键动作线索",
    severity: "P1",
    owner: "prompt",
    fix: "把关键线索写进案例标签，Prompt 要求逐条覆盖；漏检进入 badcase 池。",
    regression: "fixture: must-mention-missed",
  },
  GENERIC_ADVICE: {
    code: "GENERIC_ADVICE",
    label: "点评是正确但不可执行的空话",
    severity: "P1",
    owner: "prompt",
    fix: "禁用“注意重心/多练习”类句式，要求动作 + 身体部位 + 下一次怎么做。",
    regression: "fixture: generic-advice",
  },
  DUPLICATE_SEGMENT: {
    code: "DUPLICATE_SEGMENT",
    label: "时间轴片段重复",
    severity: "P1",
    owner: "model",
    fix: "按归一化文本去重，保留最早时间戳；重复率进入回归指标。",
    regression: "fixture: duplicate-segment",
  },
  SEGMENT_TOO_SHORT: {
    code: "SEGMENT_TOO_SHORT",
    label: "单条点评过短，缺少信息量",
    severity: "P2",
    owner: "prompt",
    fix: "要求每条至少包含“看到了什么 + 为什么错 + 下一次怎么做”。",
    regression: "fixture: segment-too-short",
  },
  DIMENSION_SCORES_MISSING: {
    code: "DIMENSION_SCORES_MISSING",
    label: "没有维度分，无法算 MAE",
    severity: "P1",
    owner: "prompt",
    fix: "结构化输出加入 5 个维度的 1-5 分；这是 v2 schema 的核心验收项。",
    regression: "fixture: dimension-scores-missing",
  },
  DIMENSION_MAE_HIGH: {
    code: "DIMENSION_MAE_HIGH",
    label: "维度分与人工评分偏差过大",
    severity: "P2",
    owner: "model",
    fix: "按难度分档校准；MAE > 1.0 的动作进入人工复核池。",
    regression: "fixture: dimension-mae-high",
  },
};

export function failureMeta(code: FailureCode): FailureMeta {
  return FAILURE_LIBRARY[code];
}
