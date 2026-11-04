/**
 * 关键帧姿态证据。
 *
 * 浏览器端用 MediaPipe Pose Landmarker 产出 landmarks，服务端只消费这份
 * 结构化数据。landmarks 是归一化坐标（0-1），worldLandmarks 是米制坐标，
 * 两者都由 MediaPipe 提供；缺失时对应字段为 null。
 */

export type PoseLandmark = {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
};

export type PoseFrame = {
  /** 距视频起点的秒数 */
  atSec: number;
  /** MM:SS */
  timestamp: string;
  landmarks: PoseLandmark[] | null;
  worldLandmarks?: PoseLandmark[] | null;
};

export type PoseEvidence = {
  /** 产生证据的模型标识，便于回放时判断是否同一版本 */
  model: string;
  frames: PoseFrame[];
};

export const MAX_POSE_FRAMES = 24;
export const MAX_POSE_LANDMARKS = 33;

export type ParsePoseResult =
  | { ok: true; value: PoseEvidence | null }
  | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseLandmark(value: unknown): PoseLandmark | null {
  if (!isRecord(value)) return null;
  const x = Number(value.x);
  const y = Number(value.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

  const z = Number(value.z);
  const visibility = Number(value.visibility);

  return {
    x,
    y,
    ...(Number.isFinite(z) ? { z } : {}),
    ...(Number.isFinite(visibility) ? { visibility } : {}),
  };
}

function parseLandmarkList(value: unknown): PoseLandmark[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  if (value.length > MAX_POSE_LANDMARKS) return null;
  const parsed: PoseLandmark[] = [];
  for (const item of value) {
    const landmark = parseLandmark(item);
    if (!landmark) return null;
    parsed.push(landmark);
  }
  return parsed;
}

/**
 * 请求体里的姿态证据是可选的。格式不对时整份丢弃，而不是让分析失败：
 * 姿态只是增强证据，不应该阻断一次正常的关键帧分析。
 */
export function parsePoseEvidence(input: unknown): ParsePoseResult {
  if (input === undefined || input === null) {
    return { ok: true, value: null };
  }
  if (!isRecord(input)) {
    return { ok: false, error: "姿态证据必须是 JSON 对象" };
  }
  if (!Array.isArray(input.frames) || input.frames.length === 0) {
    return { ok: false, error: "姿态证据缺少 frames" };
  }
  if (input.frames.length > MAX_POSE_FRAMES) {
    return {
      ok: false,
      error: `姿态证据帧数过多（${input.frames.length}），最多 ${MAX_POSE_FRAMES}`,
    };
  }

  const frames: PoseFrame[] = [];
  for (let index = 0; index < input.frames.length; index += 1) {
    const raw = input.frames[index];
    if (!isRecord(raw)) {
      return { ok: false, error: `姿态第 ${index + 1} 帧格式不正确` };
    }
    const atSec = Number(raw.atSec);
    if (!Number.isFinite(atSec) || atSec < 0) {
      return { ok: false, error: `姿态第 ${index + 1} 帧时间无效` };
    }
    const timestamp =
      typeof raw.timestamp === "string" && /^\d{2}:\d{2}$/.test(raw.timestamp)
        ? raw.timestamp
        : "";
    if (!timestamp) {
      return {
        ok: false,
        error: `姿态第 ${index + 1} 帧时间戳格式应为 MM:SS`,
      };
    }

    const landmarks = parseLandmarkList(raw.landmarks);
    const worldLandmarks =
      raw.worldLandmarks === undefined || raw.worldLandmarks === null
        ? null
        : parseLandmarkList(raw.worldLandmarks);

    frames.push({
      atSec,
      timestamp,
      landmarks,
      worldLandmarks,
    });
  }

  const model =
    typeof input.model === "string" && input.model.trim()
      ? input.model.trim().slice(0, 80)
      : "pose-landmarker";

  return { ok: true, value: { model, frames } };
}
