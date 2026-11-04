export type AgentRuntimeMode = "off" | "on";

/**
 * 网页端 Agent 开关。
 * 默认生产/开发都开启；测试环境默认关闭，避免旧用例被真实模型路径影响。
 * 显式设置 AGENT_RUNTIME=off 可回退到单次 DeepSeek。
 */
export function getAgentRuntimeMode(
  env: NodeJS.ProcessEnv = process.env
): AgentRuntimeMode {
  const raw = env.AGENT_RUNTIME?.trim().toLowerCase();
  if (raw === "off" || raw === "false" || raw === "0") return "off";
  if (raw === "on" || raw === "true" || raw === "1") return "on";
  return env.NODE_ENV === "test" ? "off" : "on";
}

/** Agent 失败后是否回退单次分析；默认回退，保证用户始终拿到报告。 */
export function agentFallbackEnabled(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return env.AGENT_FALLBACK?.trim().toLowerCase() !== "off";
}
