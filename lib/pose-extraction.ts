"use client";

import type { AnalyzeFrame } from "./frame-extraction";
import type { PoseEvidence, PoseFrame, PoseLandmark } from "./pose-types";

const MEDIAPIPE_VERSION = "1.2.0";
const WASM_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

type Landmarker = {
  detect: (image: HTMLImageElement) => {
    landmarks: Array<
      Array<{
        x: number;
        y: number;
        z: number;
        visibility?: number;
      }>
    >;
    worldLandmarks: Array<
      Array<{
        x: number;
        y: number;
        z: number;
        visibility?: number;
      }>
    >;
    close?: () => void;
  };
  close: () => void;
};

let cachedLandmarker: Landmarker | null = null;
let loading: Promise<Landmarker | null> | null = null;

function mapLandmarks(
  landmarks: Array<{
    x: number;
    y: number;
    z: number;
    visibility?: number;
  }> | undefined
): PoseLandmark[] | null {
  if (!landmarks || landmarks.length === 0) return null;
  return landmarks.map((item) => ({
    x: item.x,
    y: item.y,
    z: item.z,
    ...(typeof item.visibility === "number"
      ? { visibility: item.visibility }
      : {}),
  }));
}

async function createLandmarker(): Promise<Landmarker | null> {
  if (cachedLandmarker) return cachedLandmarker;
  if (loading) return loading;

  loading = (async () => {
    try {
      const vision = await import("@mediapipe/tasks-vision");
      const fileset = await vision.FilesetResolver.forVisionTasks(WASM_URL);

      const build = async (delegate: "GPU" | "CPU") =>
        (await vision.PoseLandmarker.createFromOptions(fileset, {
          baseOptions: {
            modelAssetPath: MODEL_URL,
            delegate,
          },
          runningMode: "IMAGE",
          numPoses: 1,
          minPoseDetectionConfidence: 0.5,
          minPosePresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        })) as unknown as Landmarker;

      try {
        cachedLandmarker = await build("GPU");
      } catch {
        cachedLandmarker = await build("CPU");
      }
      return cachedLandmarker;
    } catch {
      return null;
    } finally {
      loading = null;
    }
  })();

  return loading;
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("无法解码关键帧"));
    image.src = dataUrl;
  });
}

/**
 * 浏览器端姿态估计。失败时返回 null，分析继续走纯关键帧路径。
 * 不把图片上传到第三方：模型和 wasm 都下载到本地后运行。
 */
export async function extractPoseEvidence(
  frames: AnalyzeFrame[],
  options: {
    onProgress?: (done: number, total: number) => void;
    signal?: AbortSignal;
  } = {}
): Promise<PoseEvidence | null> {
  if (typeof window === "undefined" || frames.length === 0) return null;

  const landmarker = await createLandmarker();
  if (!landmarker) return null;

  const poseFrames: PoseFrame[] = [];
  for (let index = 0; index < frames.length; index += 1) {
    if (options.signal?.aborted) break;
    const frame = frames[index];
    try {
      const image = await loadImage(frame.dataUrl);
      const result = landmarker.detect(image);
      poseFrames.push({
        atSec: frame.seconds,
        timestamp: frame.timestamp,
        landmarks: mapLandmarks(result.landmarks[0]),
        worldLandmarks: mapLandmarks(result.worldLandmarks[0]),
      });
      result.close?.();
    } catch {
      poseFrames.push({
        atSec: frame.seconds,
        timestamp: frame.timestamp,
        landmarks: null,
        worldLandmarks: null,
      });
    }
    options.onProgress?.(index + 1, frames.length);
  }

  const withPose = poseFrames.filter((frame) => frame.landmarks).length;
  if (withPose === 0) return null;

  return {
    model: `mediapipe-pose-landmarker-lite@${MEDIAPIPE_VERSION}`,
    frames: poseFrames,
  };
}
