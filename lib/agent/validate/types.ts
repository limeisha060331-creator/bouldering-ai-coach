import type { AnalysisContract } from "../../analysis-schema";
import type { SessionFact } from "../context/types";

export type ErrorClass = "E1" | "E2" | "E3" | "E4";

export type ValidationCode =
  | "E_SCHEMA"
  | "E_TIMESTAMP_OUT_OF_RANGE"
  | "E_TIMESTAMP_NOT_MONOTONIC"
  | "E_DUPLICATE_TIMESTAMP"
  | "E_CLAIM_WITHOUT_EVIDENCE"
  | "E_COVERAGE_MISS"
  | "E_TOO_FEW_SEGMENTS"
  | "E_SAFETY_BLOCKED";

export type ValidationIssue = {
  code: ValidationCode;
  class: ErrorClass;
  path: string;
  message: string;
  fixHint: string;
  severity: "P0" | "P1" | "P2";
  expected?: string;
  actual?: string;
};

export type ValidationContext = {
  durationSec: number;
  /** 工具产生的事实，是可验证证据的唯一来源 */
  facts: SessionFact[];
  /**
   * 没有姿态证据时（例如旧客户端只上传关键帧），允许跳过证据/覆盖检查。
   * 默认 true；只有明确知道本次没有工具事实时才设为 false。
   */
  requireEvidence?: boolean;
  minSegments?: number;
  coverageConfidenceFloor?: number;
  evidenceToleranceSec?: number;
};

export type ValidationResult = {
  ok: boolean;
  contract: AnalysisContract | null;
  issues: ValidationIssue[];
};
