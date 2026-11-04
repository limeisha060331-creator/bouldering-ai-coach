import { z } from "zod";
import type { AnalyzeFrame } from "../../frame-extraction";
import type { AnalysisLocale } from "../../types";
import { defineTool, type ToolAttachment } from "../sandbox/types";

function toSeconds(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

/**
 * 网页端没有原视频，只有上传时抽好的关键帧。
 * 这个工具从这批帧里按时间点重新取画面，让模型可以“再看一眼”某个瞬间。
 */
export function createFrameExtractTool(
  frames: AnalyzeFrame[],
  options: { locale?: AnalysisLocale } = {}
) {
  const locale = options.locale ?? "zh";

  return defineTool({
    kind: "handler",
    name: "frame.extract",
    description:
      "从本次上传的关键帧中按时间点或时间窗口取出画面。返回帧元数据和图片附件；用于复核某个时间点的动作细节。",
    input: z.object({
      timestamps: z.array(z.string()).max(6).optional(),
      fromSec: z.number().min(0).optional(),
      toSec: z.number().min(0).optional(),
      limit: z.number().int().min(1).max(4).optional(),
    }),
    timeoutMs: 3_000,
    maxCallsPerRun: 2,
    handler: (input) => {
      const limit = input.limit ?? 3;
      const requested = (input.timestamps ?? [])
        .map(toSeconds)
        .filter((value): value is number => value != null);

      let picked: AnalyzeFrame[];
      if (requested.length > 0) {
        const found: AnalyzeFrame[] = [];
        for (const target of requested) {
          let best: AnalyzeFrame | null = null;
          let bestGap = Number.POSITIVE_INFINITY;
          for (const frame of frames) {
            const gap = Math.abs(frame.seconds - target);
            if (gap < bestGap) {
              best = frame;
              bestGap = gap;
            }
          }
          if (best && bestGap <= 3) found.push(best);
        }
        picked = found;
      } else {
        const from = input.fromSec ?? 0;
        const to = input.toSec ?? Number.POSITIVE_INFINITY;
        picked = frames.filter(
          (frame) => frame.seconds >= from && frame.seconds <= to
        );
      }

      picked = [...new Map(picked.map((frame) => [frame.timestamp, frame])).values()]
        .sort((a, b) => a.seconds - b.seconds)
        .slice(0, limit);

      const attachments: ToolAttachment[] = picked.map((frame) => ({
        type: "image",
        atSec: frame.seconds,
        dataUrl: frame.dataUrl,
      }));

      return {
        frames: picked.map((frame) => ({
          atSec: frame.seconds,
          timestamp: frame.timestamp,
        })),
        attachments,
        note:
          picked.length > 0
            ? locale === "zh"
              ? `已取出 ${picked.length} 张关键帧`
              : `Extracted ${picked.length} key frames`
            : locale === "zh"
              ? "没有匹配到时间点附近的关键帧"
              : "No key frame matched the requested time",
      };
    },
  });
}
