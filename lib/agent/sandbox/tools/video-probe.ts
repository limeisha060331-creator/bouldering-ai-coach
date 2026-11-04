import path from "node:path";
import { z } from "zod";
import { defineTool } from "../types";

const relativeVideoPath = z
  .string()
  .min(1)
  .refine((value) => {
    if (path.isAbsolute(value)) return false;
    return !value.split(/[\\/]+/).includes("..");
  }, "路径必须是 workspace 内的相对路径");

/**
 * 只读探测：时长、分辨率、编码。
 * 不生成文件，所以不会触发副作用审计。
 */
export const videoProbeTool = defineTool({
  kind: "command",
  name: "video.probe",
  description: "读取视频时长、分辨率和编码信息；只读，不修改文件",
  input: z.object({ path: relativeVideoPath }),
  timeoutMs: 15_000,
  maxCallsPerRun: 4,
  command: ({ path: videoPath }) => ({
    file: process.env.FFPROBE_PATH ?? "ffprobe",
    args: [
      "-v",
      "error",
      "-print_format",
      "json",
      "-show_format",
      "-show_streams",
      videoPath,
    ],
  }),
  parse: (stdout) => JSON.parse(stdout) as unknown,
});
