export type SafetyCode =
  | "MEDICAL_ADVICE"
  | "SELF_HARM"
  | "PII"
  | "PROMPT_INJECTION"
  | "CREDENTIAL";

export type SafetyVerdict =
  | { allowed: true }
  | {
      allowed: false;
      code: SafetyCode;
      reason: string;
      /** 已脱敏的命中片段，避免把密钥或个人信息写进日志 */
      match: string;
    };

export type EscalationRecord = {
  at: string;
  tool: string;
  code: SafetyCode;
  reason: string;
  match: string;
};

type Rule = {
  code: SafetyCode;
  pattern: RegExp;
  reason: string;
};

const RULES: Rule[] = [
  {
    code: "PROMPT_INJECTION",
    pattern: /ignore\s+(all\s+)?(previous|prior|above)\s+instructions?/i,
    reason: "输入里出现覆盖系统指令的内容",
  },
  {
    code: "PROMPT_INJECTION",
    pattern: /忽略(之前|以上|前面|上述)的?(所有)?(指令|提示|要求)/,
    reason: "输入里出现忽略既有指令的内容",
  },
  {
    code: "PROMPT_INJECTION",
    pattern: /(system\s*prompt|developer\s*mode|jailbreak|<\s*system\s*>)/i,
    reason: "输入试图读取或改写系统提示",
  },
  {
    code: "SELF_HARM",
    pattern: /(自杀|自残|不想活|结束生命|轻生)/,
    reason: "涉及自伤风险，必须转人工",
  },
  {
    code: "SELF_HARM",
    pattern: /\b(suicide|self[- ]harm|kill myself)\b/i,
    reason: "涉及自伤风险，必须转人工",
  },
  {
    code: "MEDICAL_ADVICE",
    pattern:
      /(诊断|确诊|处方|用药|吃药|剂量|手术|治疗方案|康复方案|物理治疗|消炎药|止痛药|打封闭)/,
    reason: "涉及医疗诊断或用药建议，超出教练能力边界",
  },
  {
    code: "MEDICAL_ADVICE",
    pattern:
      /\b(diagnos\w*|prescrib\w*|dosage|medication|surgery|treatment plan|physiotherapy)\b/i,
    reason: "涉及医疗诊断或用药建议，超出教练能力边界",
  },
  {
    code: "CREDENTIAL",
    pattern: /\bsk-[A-Za-z0-9_-]{16,}\b/,
    reason: "参数里疑似包含 API 密钥",
  },
  {
    code: "CREDENTIAL",
    pattern:
      /(api[_-]?key|access[_-]?token|secret[_-]?key)\s*[:=]\s*["']?[A-Za-z0-9_-]{12,}/i,
    reason: "参数里疑似包含访问凭据",
  },
  {
    code: "PII",
    pattern: /(?<!\d)1[3-9]\d{9}(?!\d)/,
    reason: "输入里包含手机号",
  },
  {
    code: "PII",
    pattern: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/,
    reason: "输入里包含邮箱",
  },
  {
    code: "PII",
    pattern: /(?<!\d)\d{17}[\dXx](?!\d)/,
    reason: "输入里包含身份证号",
  },
];

function redact(code: SafetyCode, matched: string): string {
  if (code === "CREDENTIAL" || code === "PII") {
    return `${matched.slice(0, 4)}***`;
  }
  return matched.length > 40 ? `${matched.slice(0, 40)}…` : matched;
}

/**
 * 纯规则、可单测的安全闸门。
 * 只拦红线，不评价内容好坏——内容质量归评测层。
 */
export function checkSafety(text: string): SafetyVerdict {
  for (const rule of RULES) {
    const matched = text.match(rule.pattern);
    if (matched) {
      return {
        allowed: false,
        code: rule.code,
        reason: rule.reason,
        match: redact(rule.code, matched[0]),
      };
    }
  }

  return { allowed: true };
}
