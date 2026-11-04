import { z } from "zod";
import type { AnalysisLocale } from "../../types";
import type { PoseEvidence, PoseFrame, PoseLandmark } from "../../pose-types";
import { defineTool } from "../sandbox/types";

/**
 * MediaPipe Pose 的 33 个关节点里，抱石分析最常用的几个。
 * 索引来自 MediaPipe BlazePose。
 */
const L = {
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
  leftHeel: 29,
  rightHeel: 30,
  leftFoot: 31,
  rightFoot: 32,
} as const;

type Point = { x: number; y: number; z?: number };

export type PoseObservation = {
  atSec: number;
  bodyPart: string;
  detail: string;
  confidence: number;
  code: string;
};

const LABELS = {
  zh: {
    leftKnee: "左膝",
    rightKnee: "右膝",
    leftElbow: "左肘",
    rightElbow: "右肘",
    hips: "髋部",
    leftAnkle: "左脚踝",
    rightAnkle: "右脚踝",
    shoulderLine: "肩线",
  },
  en: {
    leftKnee: "left knee",
    rightKnee: "right knee",
    leftElbow: "left elbow",
    rightElbow: "right elbow",
    hips: "hips",
    leftAnkle: "left ankle",
    rightAnkle: "right ankle",
    shoulderLine: "shoulder line",
  },
} as const;

function visibility(point: PoseLandmark | undefined): number {
  return typeof point?.visibility === "number" ? point.visibility : 1;
}

function hasPoint(point: PoseLandmark | undefined): point is PoseLandmark {
  return Boolean(point && Number.isFinite(point.x) && Number.isFinite(point.y));
}

function angleDeg(a: Point, b: Point, c: Point): number | null {
  const ab = { x: a.x - b.x, y: a.y - b.y, z: (a.z ?? 0) - (b.z ?? 0) };
  const cb = { x: c.x - b.x, y: c.y - b.y, z: (c.z ?? 0) - (b.z ?? 0) };
  const dot = ab.x * cb.x + ab.y * cb.y + ab.z * cb.z;
  const magAB = Math.hypot(ab.x, ab.y, ab.z);
  const magCB = Math.hypot(cb.x, cb.y, cb.z);
  if (magAB < 1e-6 || magCB < 1e-6) return null;
  const cosine = Math.max(-1, Math.min(1, dot / (magAB * magCB)));
  return (Math.acos(cosine) * 180) / Math.PI;
}

function midpoint(a: PoseLandmark, b: PoseLandmark): Point {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    z: ((a.z ?? 0) + (b.z ?? 0)) / 2,
  };
}

function horizontalGap(a: Point, b: Point): number {
  return Math.abs(a.x - b.x);
}

function pickFramePoints(frame: PoseFrame): {
  normalized: PoseLandmark[] | null;
  world: PoseLandmark[] | null;
} {
  const normalized =
    frame.landmarks && frame.landmarks.length >= 33 ? frame.landmarks : null;
  const world =
    frame.worldLandmarks && frame.worldLandmarks.length >= 33
      ? frame.worldLandmarks
      : null;
  return { normalized, world };
}

function confidence(points: Array<PoseLandmark | undefined>): number {
  const values = points.map(visibility);
  if (values.some((value) => value < 0.45)) return 0;
  return Math.min(0.95, Math.min(...values) * 0.95);
}

function addObservation(
  out: PoseObservation[],
  observation: PoseObservation
): void {
  if (observation.confidence < 0.5) return;
  out.push(observation);
}

function analyzeFrame(
  frame: PoseFrame,
  locale: AnalysisLocale,
  focus: "all" | "lower" | "upper"
): PoseObservation[] {
  const { normalized, world } = pickFramePoints(frame);
  if (!normalized) return [];

  const labels = LABELS[locale];
  const points = world ?? normalized;
  const useWorld = Boolean(world);
  const out: PoseObservation[] = [];
  const at = frame.atSec;

  const hipMid = hasPoint(points[L.leftHip]) && hasPoint(points[L.rightHip])
    ? midpoint(points[L.leftHip], points[L.rightHip])
    : null;
  const ankleMid =
    hasPoint(points[L.leftAnkle]) && hasPoint(points[L.rightAnkle])
      ? midpoint(points[L.leftAnkle], points[L.rightAnkle])
      : null;
  const shoulderWidth = hasPoint(points[L.leftShoulder]) &&
    hasPoint(points[L.rightShoulder])
    ? Math.hypot(
        points[L.leftShoulder].x - points[L.rightShoulder].x,
        points[L.leftShoulder].y - points[L.rightShoulder].y
      )
    : 0;

  if (focus !== "upper") {
    const kneeSides = [
      {
        side: "left" as const,
        hip: L.leftHip,
        knee: L.leftKnee,
        ankle: L.leftAnkle,
      },
      {
        side: "right" as const,
        hip: L.rightHip,
        knee: L.rightKnee,
        ankle: L.rightAnkle,
      },
    ];

    for (const item of kneeSides) {
      const hip = points[item.hip];
      const knee = points[item.knee];
      const ankle = points[item.ankle];
      if (!hasPoint(hip) || !hasPoint(knee) || !hasPoint(ankle)) continue;
      const angle = angleDeg(hip, knee, ankle);
      const conf = confidence([hip, knee, ankle]);
      if (angle == null || conf < 0.5) continue;
      const label =
        item.side === "left" ? labels.leftKnee : labels.rightKnee;

      if (angle >= 165) {
        addObservation(out, {
          atSec: at,
          bodyPart: label,
          detail:
            locale === "zh"
              ? `${label}角度 ${angle.toFixed(0)}°，接近伸直`
              : `${label} angle ${angle.toFixed(0)}°, nearly straight`,
          confidence: conf,
          code: "knee_extended",
        });
      } else if (angle <= 100) {
        addObservation(out, {
          atSec: at,
          bodyPart: label,
          detail:
            locale === "zh"
              ? `${label}角度 ${angle.toFixed(0)}°，深度屈膝`
              : `${label} angle ${angle.toFixed(0)}°, deep knee bend`,
          confidence: conf,
          code: "knee_deep",
        });
      }
    }

    if (useWorld && hipMid && ankleMid && shoulderWidth > 1e-6) {
      const gap = horizontalGap(hipMid, ankleMid) / shoulderWidth;
      if (gap >= 0.55) {
        addObservation(out, {
          atSec: at,
          bodyPart: labels.hips,
          detail:
            locale === "zh"
              ? `髋部中线相对踝部中点横移 ${gap.toFixed(2)} 个肩宽`
              : `hip midline is ${gap.toFixed(2)} shoulder-widths horizontally from the ankle midline`,
          confidence: confidence([
            points[L.leftHip],
            points[L.rightHip],
            points[L.leftAnkle],
            points[L.rightAnkle],
          ]),
          code: "hip_offset",
        });
      }
    }
  }

  if (focus !== "lower") {
    const elbowSides = [
      {
        side: "left" as const,
        shoulder: L.leftShoulder,
        elbow: L.leftElbow,
        wrist: L.leftWrist,
      },
      {
        side: "right" as const,
        shoulder: L.rightShoulder,
        elbow: L.rightElbow,
        wrist: L.rightWrist,
      },
    ];

    for (const item of elbowSides) {
      const shoulder = points[item.shoulder];
      const elbow = points[item.elbow];
      const wrist = points[item.wrist];
      if (!hasPoint(shoulder) || !hasPoint(elbow) || !hasPoint(wrist)) continue;
      const angle = angleDeg(shoulder, elbow, wrist);
      const conf = confidence([shoulder, elbow, wrist]);
      if (angle == null || conf < 0.5) continue;
      const label =
        item.side === "left" ? labels.leftElbow : labels.rightElbow;
      if (angle >= 165) {
        addObservation(out, {
          atSec: at,
          bodyPart: label,
          detail:
            locale === "zh"
              ? `${label}角度 ${angle.toFixed(0)}°，接近完全伸直`
              : `${label} angle ${angle.toFixed(0)}°, nearly straight`,
          confidence: conf,
          code: "elbow_extended",
        });
      } else if (angle <= 80) {
        addObservation(out, {
          atSec: at,
          bodyPart: label,
          detail:
            locale === "zh"
              ? `${label}角度 ${angle.toFixed(0)}°，明显屈肘`
              : `${label} angle ${angle.toFixed(0)}°, clearly bent`,
          confidence: conf,
          code: "elbow_bent",
        });
      }
    }

    if (
      hasPoint(points[L.leftShoulder]) &&
      hasPoint(points[L.rightShoulder])
    ) {
      const dx = points[L.rightShoulder].x - points[L.leftShoulder].x;
      const dy = points[L.rightShoulder].y - points[L.leftShoulder].y;
      const tilt = Math.abs((Math.atan2(dy, Math.abs(dx) || 1e-6) * 180) / Math.PI);
      if (tilt >= 12) {
        addObservation(out, {
          atSec: at,
          bodyPart: labels.shoulderLine,
          detail:
            locale === "zh"
              ? `肩线倾斜 ${tilt.toFixed(0)}°`
              : `shoulder line tilted ${tilt.toFixed(0)}°`,
          confidence: confidence([
            points[L.leftShoulder],
            points[L.rightShoulder],
          ]),
          code: "shoulder_tilt",
        });
      }
    }
  }

  return out;
}

function footStability(
  frames: PoseFrame[],
  locale: AnalysisLocale
): PoseObservation[] {
  const labels = LABELS[locale];
  const out: PoseObservation[] = [];
  const sides = [
    { side: "left" as const, index: L.leftAnkle, label: labels.leftAnkle },
    { side: "right" as const, index: L.rightAnkle, label: labels.rightAnkle },
  ];

  for (const item of sides) {
    for (let i = 1; i < frames.length; i += 1) {
      const prev = frames[i - 1];
      const next = frames[i];
      const prevPoints = prev.landmarks;
      const nextPoints = next.landmarks;
      if (!prevPoints || !nextPoints) continue;
      const a = prevPoints[item.index];
      const b = nextPoints[item.index];
      if (!hasPoint(a) || !hasPoint(b)) continue;
      const conf = confidence([a, b]);
      if (conf < 0.5) continue;
      const gap = Math.hypot(b.x - a.x, b.y - a.y);
      if (gap < 0.04) continue;
      out.push({
        atSec: next.atSec,
        bodyPart: item.label,
        detail:
          locale === "zh"
            ? `${item.label}在 ${(next.atSec - prev.atSec).toFixed(1)} 秒内位移 ${gap.toFixed(3)}（归一化画面宽度）`
            : `${item.label} moved ${gap.toFixed(3)} normalized image width in ${(next.atSec - prev.atSec).toFixed(1)}s`,
        confidence: conf,
        code: `foot_move_${item.side}`,
      });
    }
  }

  return out;
}

/**
 * 把关键帧姿态转成可追溯的观察事实。
 * 只报可量化的角度/位移，不在这里下“技术好坏”的结论——结论交给教练模型，
 * 但结论必须引用这些事实。
 */
export function analyzePose(
  evidence: PoseEvidence,
  options: {
    locale?: AnalysisLocale;
    fromSec?: number;
    toSec?: number;
    focus?: "all" | "lower" | "upper";
    maxEvents?: number;
  } = {}
): {
  events: PoseObservation[];
  summary: {
    frames: number;
    withPose: number;
    emitted: number;
    source: string;
  };
} {
  const locale = options.locale ?? "zh";
  const from = options.fromSec ?? 0;
  const to = options.toSec ?? Number.POSITIVE_INFINITY;
  const focus = options.focus ?? "all";
  const maxEvents = Math.max(1, Math.min(options.maxEvents ?? 5, 10));

  const frames = evidence.frames.filter(
    (frame) => frame.atSec >= from && frame.atSec <= to
  );
  const withPose = frames.filter((frame) => frame.landmarks).length;

  const all: PoseObservation[] = [];
  for (const frame of frames) {
    all.push(...analyzeFrame(frame, locale, focus));
  }
  all.push(...footStability(frames, locale));

  // 同一身体部位同一类观察只保留置信度最高的一条，避免 16 帧刷屏。
  const best = new Map<string, PoseObservation>();
  for (const observation of all) {
    const key = `${observation.bodyPart}:${observation.code}`;
    const previous = best.get(key);
    if (!previous || observation.confidence > previous.confidence) {
      best.set(key, observation);
    }
  }

  const events = [...best.values()]
    .sort(
      (a, b) =>
        b.confidence - a.confidence || a.atSec - b.atSec
    )
    .slice(0, maxEvents);

  return {
    events,
    summary: {
      frames: frames.length,
      withPose,
      emitted: events.length,
      source: evidence.model,
    },
  };
}

export function createPoseAnalyzeTool(
  evidence: PoseEvidence | null,
  options: { locale?: AnalysisLocale } = {}
) {
  const locale = options.locale ?? "zh";

  return defineTool({
    kind: "handler",
    name: "pose.analyze",
    description:
      "读取本次视频关键帧的姿态估计结果，输出可量化的关节角度、髋部相对踝部横移、脚踝位移和肩线倾斜。只返回观察事实，不判断技术好坏。",
    input: z.object({
      fromSec: z.number().min(0).optional(),
      toSec: z.number().min(0).optional(),
      focus: z.enum(["all", "lower", "upper"]).optional(),
      maxEvents: z.number().int().min(1).max(10).optional(),
    }),
    timeoutMs: 5_000,
    maxCallsPerRun: 3,
    handler: (input) => {
      if (!evidence) {
        return {
          events: [],
          summary: {
            frames: 0,
            withPose: 0,
            emitted: 0,
            source: "unavailable",
          },
          note:
            locale === "zh"
              ? "本次请求没有可用的姿态证据，请只依据画面做保守判断。"
              : "No pose evidence was supplied; rely on the images conservatively.",
        };
      }
      return analyzePose(evidence, {
        locale,
        fromSec: input.fromSec,
        toSec: input.toSec,
        focus: input.focus,
        maxEvents: input.maxEvents,
      });
    },
  });
}
