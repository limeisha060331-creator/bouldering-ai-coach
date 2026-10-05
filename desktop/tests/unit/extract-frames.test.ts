import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_FRAME_COUNT,
  MAX_FRAME_COUNT,
  MAX_FRAME_WIDTH,
  captureFrameDataUrl,
  extractFrames,
  formatFrameTimestamp,
  planFrameTimestamps,
} from "@/lib/extract-frames";

describe("planFrameTimestamps", () => {
  it("默认在视频中段均匀取帧，避开首尾黑帧", () => {
    const times = planFrameTimestamps(30);
    expect(times).toHaveLength(DEFAULT_FRAME_COUNT);
    expect(times[0]).toBeGreaterThan(0);
    expect(times.at(-1)).toBeLessThan(30);
    expect(times[0]).toBeLessThan(times[1]);
  });

  it("时间点单调递增且落在时长范围内", () => {
    const times = planFrameTimestamps(12.5, 8);
    for (let i = 1; i < times.length; i++) {
      expect(times[i]).toBeGreaterThan(times[i - 1]);
    }
    expect(times.at(-1)).toBeLessThanOrEqual(12.5);
  });

  it("支持单帧与自定义数量，并有上限", () => {
    expect(planFrameTimestamps(10, 1)).toHaveLength(1);
    expect(planFrameTimestamps(10, 999)).toHaveLength(MAX_FRAME_COUNT);
  });

  it("时长无效时返回空数组", () => {
    expect(planFrameTimestamps(0)).toEqual([]);
    expect(planFrameTimestamps(Number.NaN)).toEqual([]);
    expect(planFrameTimestamps(-3)).toEqual([]);
  });

  it("极短片段也能取到帧", () => {
    const times = planFrameTimestamps(1.2, 3);
    expect(times).toHaveLength(3);
    expect(times.at(-1)).toBeLessThanOrEqual(1.2);
  });
});

describe("formatFrameTimestamp", () => {
  it("输出 MM:SS", () => {
    expect(formatFrameTimestamp(0)).toBe("00:00");
    expect(formatFrameTimestamp(9.8)).toBe("00:09");
    expect(formatFrameTimestamp(75)).toBe("01:15");
    expect(formatFrameTimestamp(-4)).toBe("00:00");
  });
});

type FakeCanvas = HTMLCanvasElement & { drawn: number };

function fakeCanvas(): FakeCanvas {
  const canvas = {
    width: 0,
    height: 0,
    drawn: 0,
    getContext: () => ({
      drawImage: () => {
        canvas.drawn += 1;
      },
    }),
    toDataURL: () => "data:image/jpeg;base64,FRAME",
  };
  return canvas as unknown as FakeCanvas;
}

function fakeVideo(videoWidth = 1920, videoHeight = 1080): HTMLVideoElement {
  const listeners = new Map<string, Set<() => void>>();
  const video = {
    readyState: 1,
    duration: 10,
    videoWidth,
    videoHeight,
    preload: "",
    muted: false,
    playsInline: false,
    src: "",
    _time: 0,
    get currentTime() {
      return this._time;
    },
    set currentTime(value: number) {
      this._time = value;
      queueMicrotask(() => {
        listeners.get("seeked")?.forEach((cb) => cb());
      });
    },
    addEventListener: (type: string, cb: () => void) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(cb);
    },
    removeEventListener: (type: string, cb: () => void) => {
      listeners.get(type)?.delete(cb);
    },
  };
  return video as unknown as HTMLVideoElement;
}

describe("captureFrameDataUrl", () => {
  it("按 maxWidth 等比缩放后绘制并编码为 JPEG", () => {
    const video = fakeVideo(1920, 1080);
    const canvas = fakeCanvas();

    const dataUrl = captureFrameDataUrl(video, canvas, 768);

    expect(canvas.width).toBe(768);
    expect(canvas.height).toBe(432);
    expect(canvas.drawn).toBe(1);
    expect(dataUrl).toBe("data:image/jpeg;base64,FRAME");
  });

  it("小图不会被放大", () => {
    const canvas = fakeCanvas();
    captureFrameDataUrl(fakeVideo(640, 360), canvas, MAX_FRAME_WIDTH);
    expect(canvas.width).toBe(640);
    expect(canvas.height).toBe(360);
  });
});

describe("extractFrames", () => {
  function setup(duration = 10) {
    const video = fakeVideo() as unknown as { duration: number };
    video.duration = duration;
    const createObjectUrl = vi.fn(() => "blob:crux");
    const revokeObjectUrl = vi.fn();

    return {
      video,
      createObjectUrl,
      revokeObjectUrl,
      deps: {
        createVideo: () => video as unknown as HTMLVideoElement,
        createCanvas: fakeCanvas,
        createObjectUrl,
        revokeObjectUrl,
      },
    };
  }

  it("抽取指定数量的关键帧，带时间戳并释放 objectURL", async () => {
    const { deps, revokeObjectUrl } = setup(20);
    const onProgress = vi.fn();

    const result = await extractFrames(new Blob(["video"]), {
      ...deps,
      count: 4,
      onProgress,
    });

    expect(result).toHaveLength(4);
    expect(result[0]).toMatchObject({ timestamp: "00:00" });
    expect(result[0].dataUrl).toBe("data:image/jpeg;base64,FRAME");
    expect(result[0].seconds).toBeCloseTo(0.4, 1);
    expect(result.at(-1)!.seconds).toBeCloseTo(19.6, 1);
    expect(onProgress).toHaveBeenCalledTimes(4);
    expect(onProgress).toHaveBeenLastCalledWith(4, 4);
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:crux");
  });

  it("无法获取时长时报错并释放资源", async () => {
    const { deps, revokeObjectUrl } = setup(0);

    await expect(extractFrames(new Blob(["video"]), deps)).rejects.toThrow(
      "无法获取视频时长"
    );
    expect(revokeObjectUrl).toHaveBeenCalled();
  });
});
