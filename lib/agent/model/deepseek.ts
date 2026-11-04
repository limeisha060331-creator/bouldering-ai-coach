import {
  DEEPSEEK_BASE_URL,
  DEEPSEEK_CHAT_PATH,
  DeepSeekApiError,
  DeepSeekEmptyAnalysisError,
  describeDeepSeekStatus,
  getDeepSeekMaxTokens,
  type DeepSeekContentBlock,
  type DeepSeekUsage,
} from "../../deepseek-analysis";
import type { AnalysisDepth } from "../../types";
import { extractJsonCandidate } from "../../analysis-schema";
import type {
  AgentModel,
  AgentModelAction,
  AgentModelRequest,
  AgentModelTurn,
  ToolCatalogEntry,
} from "./types";

type ChatMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string | DeepSeekContentBlock[] }
  | { role: "assistant"; content: string };

type DeepSeekChatResponse = {
  choices?: {
    message?: { content?: string | null };
    finish_reason?: string | null;
  }[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    prompt_cache_hit_tokens?: number;
  };
  error?: { message?: string; code?: string | number; type?: string };
};

export type DeepSeekAgentModelOptions = {
  apiKey: string;
  model?: string;
  depth: AnalysisDepth;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

const ACTION_PROTOCOL = `
## 输出协议
你每一轮只能输出一个 JSON 对象，不能输出解释文字或 Markdown。

需要工具时：
{"action":"tool","tool":"工具名","args":{...},"reason":"为什么需要这个工具"}

准备交付时：
{"action":"final","report":{...按系统提示中的报告契约...}}

规则：
- 每条带时间戳的结论都必须能对应到某个工具事实；没有事实就先用工具拿证据。
- 工具结果会以 user 消息回传，里面可能有新的图片附件。
- 最多只会给你有限的工具步数；证据足够就尽快 final。
`.trim();

function catalogText(tools: ToolCatalogEntry[]): string {
  return tools
    .map(
      (tool) =>
        `- ${tool.name}: ${tool.description}\n  input: ${JSON.stringify(
          tool.inputSchema
        )}`
    )
    .join("\n");
}

function readUsage(raw: DeepSeekChatResponse["usage"]): DeepSeekUsage | null {
  if (!raw) return null;
  const num = (value: unknown): number =>
    typeof value === "number" && Number.isFinite(value) ? value : 0;
  return {
    promptTokens: num(raw.prompt_tokens),
    outputTokens: num(raw.completion_tokens),
    totalTokens: num(raw.total_tokens),
    cachedTokens: num(raw.prompt_cache_hit_tokens),
  };
}

function actionsFromValue(value: unknown, raw: string): AgentModelAction[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => actionsFromValue(item, raw));
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;

    if (Array.isArray(record.actions)) {
      return record.actions.flatMap((item) => actionsFromValue(item, raw));
    }

    if (record.action === "tool" && typeof record.tool === "string") {
      const args =
        record.args && typeof record.args === "object" && !Array.isArray(record.args)
          ? (record.args as Record<string, unknown>)
          : {};
      return [
        {
          type: "tool",
          tool: record.tool,
          args,
          reason: typeof record.reason === "string" ? record.reason : undefined,
        },
      ];
    }

    if (record.action === "final") {
      const report =
        record.report && typeof record.report === "object"
          ? record.report
          : record;
      return [
        {
          type: "final",
          report,
          raw: JSON.stringify(report),
        },
      ];
    }

    // 模型偶尔会直接输出报告对象，不包 action。
    if ("segments" in record || "score" in record) {
      return [{ type: "final", report: record, raw }];
    }
  }

  return [];
}

/**
 * 解析模型输出。解析失败时不抛错，而是当作 final 原文交给校验器，
 * 由 E1 修复提示要求模型重写成 JSON。
 */
export function parseAgentActions(content: string): AgentModelAction[] {
  const candidate = extractJsonCandidate(content);
  if (!candidate) {
    return [{ type: "final", report: content, raw: content }];
  }

  let value: unknown;
  try {
    value = JSON.parse(candidate);
  } catch {
    return [{ type: "final", report: content, raw: content }];
  }

  const actions = actionsFromValue(value, candidate);
  if (actions.length > 0) return actions;
  return [{ type: "final", report: value, raw: candidate }];
}

export class DeepSeekAgentModel implements AgentModel {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly depth: AnalysisDepth;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: DeepSeekAgentModelOptions) {
    this.apiKey = options.apiKey;
    this.model = options.model ?? "deepseek-flash";
    this.depth = options.depth;
    this.baseUrl = options.baseUrl ?? DEEPSEEK_BASE_URL;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 30_000;
  }

  async next(request: AgentModelRequest): Promise<AgentModelTurn> {
    const startedAt = Date.now();
    const system = [
      request.system,
      ACTION_PROTOCOL,
      "## 可用工具",
      catalogText(request.tools),
    ].join("\n\n");

    const content: DeepSeekContentBlock[] = [
      {
        type: "text",
        text: [
          request.contextText,
          `## 当前任务\n${request.task}`,
          request.feedbackText
            ? `## 上一轮校验反馈\n${request.feedbackText}`
            : "",
        ]
          .filter(Boolean)
          .join("\n\n"),
      },
    ];

    request.frames.forEach((frame, index) => {
      content.push({
        type: "text",
        text: `第 ${index + 1}/${request.frames.length} 帧 · 时间 ${frame.timestamp}`,
      });
      content.push({ type: "image_url", image_url: { url: frame.dataUrl } });
    });

    const messages: ChatMessage[] = [
      { role: "system", content: system },
      { role: "user", content },
    ];

    for (const entry of request.transcript) {
      if (entry.role === "assistant") {
        messages.push({ role: "assistant", content: entry.text });
        continue;
      }

      const parts: DeepSeekContentBlock[] = [
        { type: "text", text: entry.text },
      ];
      for (const attachment of entry.attachments ?? []) {
        parts.push({
          type: "text",
          text: `附件 · 时间 ${attachment.atSec.toFixed(1)}s`,
        });
        parts.push({
          type: "image_url",
          image_url: { url: attachment.dataUrl },
        });
      }
      messages.push({ role: "user", content: parts });
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const onAbort = () => controller.abort();
    request.signal?.addEventListener("abort", onAbort, { once: true });

    try {
      const response = await this.fetchImpl(
        `${this.baseUrl.replace(/\/$/, "")}${DEEPSEEK_CHAT_PATH}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({
            model: this.model,
            messages,
            max_tokens: getDeepSeekMaxTokens(this.depth),
            stream: false,
            temperature: 0.2,
            ...(this.depth === "light"
              ? { thinking: { type: "disabled" } }
              : {}),
          }),
          signal: controller.signal,
        }
      );

      let json: DeepSeekChatResponse;
      try {
        json = (await response.json()) as DeepSeekChatResponse;
      } catch {
        const described = describeDeepSeekStatus(response.status);
        throw new DeepSeekApiError(
          response.status,
          described.message,
          described.retryable,
          described.waitSeconds
        );
      }

      if (!response.ok) {
        const described = describeDeepSeekStatus(
          response.status,
          json.error?.message
        );
        throw new DeepSeekApiError(
          response.status,
          described.message,
          described.retryable,
          described.waitSeconds
        );
      }

      const choice = json.choices?.[0];
      const text = choice?.message?.content?.trim();
      if (!text) {
        throw new DeepSeekEmptyAnalysisError(
          `模型未返回内容${choice?.finish_reason ? `（${choice.finish_reason}）` : ""}`
        );
      }

      return {
        actions: parseAgentActions(text),
        raw: text,
        usage: readUsage(json.usage),
        latencyMs: Date.now() - startedAt,
      };
    } catch (err) {
      if (
        err instanceof Error &&
        err.name === "AbortError" &&
        !request.signal?.aborted
      ) {
        throw new DeepSeekApiError(
          0,
          `模型调用超时（>${this.timeoutMs}ms）`,
          true,
          5
        );
      }
      throw err;
    } finally {
      clearTimeout(timer);
      request.signal?.removeEventListener("abort", onAbort);
    }
  }
}
