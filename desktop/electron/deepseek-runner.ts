import type { AnalyzeFrame } from "@shared/ipc";
import { DEFAULT_DEEPSEEK_MODEL } from "@shared/providers";
import { runDeepSeekAnalysis } from "./deepseek-analyze";
import type { JobHooks, JobRunner } from "./job-manager";

export type DeepSeekRunnerOptions = {
  /** 延迟读取，保证设置里刚填的 Key 立即生效 */
  apiKey: () => string;
  model?: () => string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  runAnalysis?: typeof runDeepSeekAnalysis;
};

/**
 * DeepSeek 分析流水线。
 * DeepSeek 官方 API 不支持视频，因此渲染进程会先本地抽帧，
 * 这里把「带时间戳的关键帧」一次性提交给 deepseek-flash 做图像理解。
 */
export function createDeepSeekRunner(options: DeepSeekRunnerOptions): JobRunner {
  const analyze = options.runAnalysis ?? runDeepSeekAnalysis;

  return async function runDeepSeekJob(job, hooks: JobHooks): Promise<string> {
    const apiKey = options.apiKey();
    if (!apiKey) {
      throw new Error("未配置 DeepSeek API Key，请在「设置」中填写后再分析。");
    }

    const frames: AnalyzeFrame[] = job.frames ?? [];
    if (frames.length === 0) {
      throw new Error("没有可用的关键帧，请重新选择视频后再试。");
    }

    const model = options.model?.() || DEFAULT_DEEPSEEK_MODEL;
    hooks.log(`[DeepSeek] 提交 ${frames.length} 张关键帧 model=${model}`);
    hooks.setStatus("analyzing");

    const analysis = await analyze({
      apiKey,
      model,
      baseUrl: options.baseUrl,
      fetchImpl: options.fetchImpl,
      depth: job.depth ?? "deep",
      locale: job.locale ?? "zh",
      frames,
    });

    hooks.log("[DeepSeek] 分析完成");
    return analysis;
  };
}
