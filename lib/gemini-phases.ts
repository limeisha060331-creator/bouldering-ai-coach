/**
 * Gemini 两阶段处理（GoogleAIFileManager）
 * 阶段一：uploadFile → 获得 fileName / fileUri
 * 阶段二：轮询 getFile 直至 ACTIVE → generateContent 获取分析
 */

import { GoogleAIFileManager } from "@google/generative-ai/server";
import { writeFile, unlink } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { logInfo } from "./gemini-log";

export type GeminiFileState = "PROCESSING" | "ACTIVE" | "FAILED" | string;

export interface Phase1Result {
  fileName: string;
  fileUri: string;
  mimeType: string;
  state: GeminiFileState;
}

export interface Phase2CheckResult {
  state: GeminiFileState;
  ready: boolean;
}

export async function geminiPhase1Upload(
  apiKey: string,
  buffer: Buffer,
  mimeType: string,
  displayName: string
): Promise<Phase1Result> {
  const fileManager = new GoogleAIFileManager(apiKey);
  const ext = mimeType.split("/")[1]?.split(";")[0] || "mp4";
  const tmpPath = join(tmpdir(), `gemini-p1-${Date.now()}.${ext}`);

  logInfo("phase1", `GoogleAIFileManager.uploadFile 开始`, {
    size: buffer.length,
    mimeType,
    displayName,
  });

  try {
    await writeFile(tmpPath, buffer);
    const upload = await fileManager.uploadFile(tmpPath, {
      mimeType,
      displayName,
    });

    logInfo("phase1", "uploadFile 完成", {
      name: upload.file.name,
      uri: upload.file.uri,
      state: upload.file.state,
    });

    return {
      fileName: upload.file.name,
      fileUri: upload.file.uri,
      mimeType,
      state: upload.file.state,
    };
  } finally {
    await unlink(tmpPath).catch(() => {});
  }
}

/** 阶段二-A：单次检查文件是否就绪（适配 Vercel 短超时，不在此函数内长轮询） */
export async function geminiPhase2CheckReady(
  apiKey: string,
  fileName: string
): Promise<Phase2CheckResult> {
  const fileManager = new GoogleAIFileManager(apiKey);
  const file = await fileManager.getFile(fileName);

  logInfo("phase2-check", `getFile state=${file.state}`, { fileName });

  return {
    state: file.state,
    ready: file.state === "ACTIVE",
  };
}

export async function geminiPhase2DeleteFile(
  apiKey: string,
  fileName: string
): Promise<void> {
  try {
    const fileManager = new GoogleAIFileManager(apiKey);
    await fileManager.deleteFile(fileName);
    logInfo("phase2-cleanup", `已删除 Gemini 临时文件 ${fileName}`);
  } catch {
    /* 忽略清理失败 */
  }
}
