import type { DeepSeekUsage } from "../../deepseek-analysis";
import type {
  AgentModel,
  AgentModelRequest,
  AgentModelTurn,
} from "./types";

export type ScriptedTurn =
  | AgentModelTurn
  | ((request: AgentModelRequest, index: number) => AgentModelTurn);

const EMPTY_USAGE: DeepSeekUsage = {
  promptTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
  cachedTokens: 0,
};

/** 测试用：按脚本返回动作，并记录每次请求。 */
export function createScriptedModel(turns: ScriptedTurn[]): AgentModel & {
  requests: AgentModelRequest[];
} {
  const requests: AgentModelRequest[] = [];
  let index = 0;

  return {
    requests,
    async next(request) {
      requests.push(request);
      const turn = turns[Math.min(index, turns.length - 1)];
      index += 1;
      if (!turn) {
        throw new Error("scripted model 没有可用回合");
      }
      if (typeof turn === "function") {
        return turn(request, index - 1);
      }
      return {
        ...turn,
        usage: turn.usage ?? EMPTY_USAGE,
      };
    },
  };
}

export function toolTurn(
  tool: string,
  args: Record<string, unknown> = {},
  raw?: string
): AgentModelTurn {
  return {
    actions: [{ type: "tool", tool, args }],
    raw: raw ?? JSON.stringify({ action: "tool", tool, args }),
    usage: EMPTY_USAGE,
    latencyMs: 1,
  };
}

export function finalTurn(report: unknown, raw?: string): AgentModelTurn {
  return {
    actions: [
      {
        type: "final",
        report,
        raw: raw ?? JSON.stringify(report),
      },
    ],
    raw: raw ?? JSON.stringify(report),
    usage: EMPTY_USAGE,
    latencyMs: 1,
  };
}
