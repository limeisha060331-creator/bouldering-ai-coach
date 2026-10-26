import type { AggregateMetrics, CaseMetrics } from "./eval-metrics";

export type EvalRunResult = {
  runId: string;
  createdAt: string;
  mode: "replay" | "live";
  dataSource: string;
  promptVersion: string;
  model: string;
  cases: number;
  metrics: AggregateMetrics;
  results: CaseMetrics[];
  cost: {
    avgUsd: number;
    totalUsd: number;
    avgCny: number;
    totalCny: number;
  };
  notes?: string[];
};
