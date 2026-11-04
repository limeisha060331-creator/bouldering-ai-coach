import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { computeConfigMetrics } from "./aggregate";
import { evaluateGate } from "./gate";
import type {
  AgentEvalCase,
  AgentEvalReport,
  AgentRunRecord,
  ConfigMetrics,
  GateThresholds,
} from "./types";

export type RunCaseFn = (input: {
  testCase: AgentEvalCase;
  config: string;
  k: number;
}) => Promise<AgentRunRecord>;

export type RunAgentEvalOptions = {
  cases: AgentEvalCase[];
  configs: string[];
  k: number;
  runCase: RunCaseFn;
  outDir: string;
  concurrency?: number;
  resume?: boolean;
  gateThresholds?: GateThresholds;
  now?: () => Date;
};

function keyOf(record: Pick<AgentRunRecord, "caseId" | "config" | "k">): string {
  return `${record.caseId}|${record.config}|${record.k}`;
}

/**
 * 批量跑 cases × k × configs。
 * 每条记录一行 JSONL，断了能续；报告是这些记录的纯函数。
 */
export async function runAgentEval(
  options: RunAgentEvalOptions
): Promise<AgentEvalReport> {
  const now = options.now ?? (() => new Date());
  const k = Math.max(1, Math.floor(options.k));
  const configs = [...options.configs].sort();
  const cases = [...options.cases].sort((a, b) => a.id.localeCompare(b.id));
  const concurrency = Math.max(1, options.concurrency ?? 2);
  const runsFile = path.join(options.outDir, "runs.jsonl");
  const reportFile = path.join(options.outDir, "report.json");

  await mkdir(options.outDir, { recursive: true });

  const existing = options.resume ? await readRuns(runsFile) : [];
  const records = new Map<string, AgentRunRecord>();
  for (const record of existing) {
    records.set(keyOf(record), record);
  }

  const tasks: Array<{ testCase: AgentEvalCase; config: string; k: number }> = [];
  for (const testCase of cases) {
    for (const config of configs) {
      for (let index = 1; index <= k; index += 1) {
        const key = keyOf({ caseId: testCase.id, config, k: index });
        if (!records.has(key)) {
          tasks.push({ testCase, config, k: index });
        }
      }
    }
  }

  let cursor = 0;
  let writeChain: Promise<void> = Promise.resolve();

  async function worker(): Promise<void> {
    while (cursor < tasks.length) {
      const task = tasks[cursor];
      cursor += 1;
      const record = await options.runCase(task);
      records.set(keyOf(record), record);
      writeChain = writeChain.then(async () => {
        await appendFile(runsFile, `${JSON.stringify(record)}\n`, "utf8");
      });
      await writeChain;
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker())
  );

  const allRuns = [...records.values()].sort((a, b) => {
    if (a.caseId !== b.caseId) return a.caseId.localeCompare(b.caseId);
    if (a.config !== b.config) return a.config.localeCompare(b.config);
    return a.k - b.k;
  });

  const overall = computeConfigMetrics(cases, allRuns, k);
  const byConfig: Record<string, ConfigMetrics> = {};
  for (const config of configs) {
    byConfig[config] = computeConfigMetrics(
      cases,
      allRuns.filter((run) => run.config === config),
      k
    );
  }

  const report: AgentEvalReport = {
    version: 1,
    createdAt: now().toISOString(),
    cases: cases.length,
    configs,
    k,
    overall,
    byConfig,
    runs: allRuns,
    gate: { passed: false, reasons: [] },
  };
  report.gate = evaluateGate(report, options.gateThresholds);

  await writeFile(reportFile, JSON.stringify(report, null, 2), "utf8");
  return report;
}

async function readRuns(filePath: string): Promise<AgentRunRecord[]> {
  try {
    const raw = await readFile(filePath, "utf8");
    return raw
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as AgentRunRecord);
  } catch {
    return [];
  }
}
