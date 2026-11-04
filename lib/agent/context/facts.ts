import type { ToolResult } from "../sandbox/types";
import type { SessionFact } from "./types";

type RawEvent = {
  atSec?: unknown;
  bodyPart?: unknown;
  detail?: unknown;
  confidence?: unknown;
};

/**
 * 工具结果 -> 会话事实。
 * 只做结构映射，不调模型：能进上下文的每条事实都要能追到 callId。
 */
export function factsFromToolResults(results: ToolResult[]): SessionFact[] {
  const facts: SessionFact[] = [];

  for (const result of results) {
    if (!result.ok) continue;

    const data = result.data;
    if (data && typeof data === "object") {
      const record = data as Record<string, unknown>;
      const events = record.events;

      if (Array.isArray(events)) {
        events.forEach((raw, index) => {
          const event = raw as RawEvent;
          if (typeof event.atSec !== "number") return;
          if (typeof event.detail !== "string" || !event.detail.trim()) return;

          facts.push({
            id: `f_${result.callId}_${index}`,
            kind: "kinematic",
            atSec: event.atSec,
            bodyPart:
              typeof event.bodyPart === "string" ? event.bodyPart : undefined,
            detail: event.detail,
            confidence:
              typeof event.confidence === "number" ? event.confidence : 0.5,
            sourceCallId: result.callId,
          });
        });
      }

      if (result.tool === "video.probe") {
        const duration = readDuration(record);
        if (duration != null) {
          facts.push({
            id: `f_${result.callId}_duration`,
            kind: "constraint",
            atSec: duration,
            detail: `视频时长 ${duration.toFixed(1)} 秒`,
            confidence: 1,
            sourceCallId: result.callId,
          });
        }
      }
    }
  }

  return facts.sort(
    (a, b) => a.atSec - b.atSec || a.id.localeCompare(b.id)
  );
}

function readDuration(data: Record<string, unknown>): number | null {
  const format = data.format;
  if (!format || typeof format !== "object") return null;
  const raw = (format as Record<string, unknown>).duration;
  const value = typeof raw === "string" ? Number.parseFloat(raw) : raw;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
