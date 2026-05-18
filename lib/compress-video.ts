/** 允许用户选择的原始视频上限（前端会先压缩再上传） */
export const MAX_SOURCE_BYTES = 200 * 1024 * 1024;

/** 提交给后端的分析上限 */
export const MAX_ANALYZE_BYTES = 10 * 1024 * 1024;

/** 分析用视频最长秒数（过长易超时） */
export const MAX_DURATION_SEC = 90;

export type CompressProgress = (message: string, percent?: number) => void;

function pickMimeType(): string {
  const candidates = [
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
    "video/mp4",
  ];
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) ?? "video/webm";
}

function loadVideoElement(file: File): Promise<{
  video: HTMLVideoElement;
  cleanup: () => void;
}> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    const url = URL.createObjectURL(file);
    const cleanup = () => URL.revokeObjectURL(url);
    video.onloadeddata = () => resolve({ video, cleanup });
    video.onerror = () => {
      cleanup();
      reject(new Error("无法读取视频，请换一个文件"));
    };
    video.src = url;
  });
}

async function recordWithBitrate(
  file: File,
  videoBitsPerSecond: number,
  maxDurationSec: number,
  onProgress?: CompressProgress
): Promise<Blob> {
  const { video, cleanup } = await loadVideoElement(file);
  const duration = Math.min(video.duration || maxDurationSec, maxDurationSec);
  const mimeType = pickMimeType();

  onProgress?.(
    `压缩中（码率 ${(videoBitsPerSecond / 1e6).toFixed(1)} Mbps）…`,
    30
  );

  const stream =
    "captureStream" in video
      ? (video as HTMLVideoElement & { captureStream(): MediaStream }).captureStream()
      : null;

  if (!stream) {
    cleanup();
    throw new Error("当前浏览器不支持视频压缩，请手动剪辑到 10MB 以内");
  }

  try {
    return await new Promise((resolve, reject) => {
      const chunks: BlobPart[] = [];
      let recorder: MediaRecorder;

      try {
        recorder = new MediaRecorder(stream, {
          mimeType,
          videoBitsPerSecond,
          audioBitsPerSecond: 64_000,
        });
      } catch {
        reject(new Error("无法启动视频编码器"));
        return;
      }

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onerror = () => reject(new Error("压缩过程出错"));

      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        video.pause();
        cleanup();
        resolve(new Blob(chunks, { type: mimeType.split(";")[0] }));
      };

      video.currentTime = 0;
      recorder.start(500);

      const playPromise = video.play();
      if (playPromise) playPromise.catch(() => {});

      const tick = window.setInterval(() => {
        const pct = Math.min(95, 30 + (video.currentTime / duration) * 65);
        onProgress?.(`压缩中 ${Math.round(pct)}%…`, pct);
      }, 400);

      window.setTimeout(() => {
        window.clearInterval(tick);
        if (recorder.state !== "inactive") recorder.stop();
      }, duration * 1000 + 300);
    });
  } catch (e) {
    cleanup();
    throw e;
  }
}

/**
 * 将过大视频压缩到 maxBytes 以内（浏览器端 MediaRecorder）
 */
export async function compressVideo(
  file: File,
  maxBytes: number = MAX_ANALYZE_BYTES,
  onProgress?: CompressProgress
): Promise<File> {
  const { video, cleanup } = await loadVideoElement(file);
  const duration = Math.min(video.duration || 60, MAX_DURATION_SEC);
  cleanup();
  const targetBits = maxBytes * 8 * 0.82;
  let videoBitsPerSecond = Math.floor(targetBits / duration);
  videoBitsPerSecond = Math.max(250_000, Math.min(videoBitsPerSecond, 2_500_000));

  let lastBlob: Blob | null = null;

  for (let attempt = 0; attempt < 4; attempt++) {
    onProgress?.(
      attempt === 0
        ? "正在智能压缩视频…"
        : `压缩结果仍偏大，降低画质重试（${attempt + 1}/4）…`,
      10 + attempt * 5
    );

    lastBlob = await recordWithBitrate(
      file,
      videoBitsPerSecond,
      MAX_DURATION_SEC,
      onProgress
    );

    if (lastBlob.size <= maxBytes) break;
    videoBitsPerSecond = Math.floor(videoBitsPerSecond * 0.65);
  }

  if (!lastBlob || lastBlob.size > maxBytes) {
    throw new Error(
      `压缩后仍为 ${((lastBlob?.size ?? 0) / 1024 / 1024).toFixed(1)}MB，请手动剪辑更短的「关键一挂」片段（建议 ≤30 秒）`
    );
  }

  const ext = lastBlob.type.includes("mp4") ? "mp4" : "webm";
  const baseName = file.name.replace(/\.[^.]+$/, "") || "boulder-clip";
  onProgress?.("压缩完成", 100);

  return new File([lastBlob], `${baseName}-compressed.${ext}`, {
    type: lastBlob.type,
    lastModified: Date.now(),
  });
}

export async function prepareVideoForUpload(
  file: File,
  onProgress?: CompressProgress
): Promise<{
  file: File;
  compressed: boolean;
  originalSize: number;
  finalSize: number;
}> {
  if (file.size > MAX_SOURCE_BYTES) {
    throw new Error(
      `视频超过 ${MAX_SOURCE_BYTES / 1024 / 1024}MB，请先裁剪后再上传`
    );
  }

  if (file.size <= MAX_ANALYZE_BYTES) {
    return {
      file,
      compressed: false,
      originalSize: file.size,
      finalSize: file.size,
    };
  }

  const compressed = await compressVideo(file, MAX_ANALYZE_BYTES, onProgress);
  return {
    file: compressed,
    compressed: true,
    originalSize: file.size,
    finalSize: compressed.size,
  };
}
