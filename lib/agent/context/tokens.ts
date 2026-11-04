const CJK = /[\u3400-\u9fff\uf900-\ufaff]/;

/**
 * 不引入分词依赖，用可复现的估算：
 * 中日韩字符按 1 token，其余字符按 4 个 1 token。
 * 它只用来做预算裁剪，不用来算钱。
 */
export function estimateTokens(text: string): number {
  let cjk = 0;
  let rest = 0;
  for (const char of text) {
    if (CJK.test(char)) cjk += 1;
    else rest += 1;
  }
  return Math.ceil(cjk + rest / 4);
}

export type TruncateResult = {
  text: string;
  truncated: boolean;
};

/**
 * 按行裁剪，优先保留完整句子。
 * keep=head 保留开头，keep=tail 保留结尾（工具结果和事实用 tail）。
 */
export function truncateText(
  text: string,
  maxTokens: number,
  keep: "head" | "tail" = "head"
): TruncateResult {
  if (estimateTokens(text) <= maxTokens) {
    return { text, truncated: false };
  }

  const marker = keep === "head" ? "\n…（已截断）" : "（已截断）…\n";
  const budget = Math.max(1, maxTokens - estimateTokens(marker));
  const lines = text.split("\n");
  const ordered = keep === "head" ? lines : [...lines].reverse();
  const kept: string[] = [];
  let used = 0;

  for (const line of ordered) {
    const cost = estimateTokens(line) + 1;
    if (used + cost > budget) break;
    kept.push(line);
    used += cost;
  }

  let body = (keep === "head" ? kept : [...kept].reverse()).join("\n");
  if (!body) {
    body =
      keep === "head" ? text.slice(0, budget) : text.slice(-budget);
  }

  return {
    text: keep === "head" ? body + marker : marker + body,
    truncated: true,
  };
}
