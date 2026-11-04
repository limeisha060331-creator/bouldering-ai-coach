/** 用户可选择的原始视频上限；抽帧在浏览器本地完成，不再上传整段视频 */
export const MAX_SOURCE_BYTES = 200 * 1024 * 1024;
/**
 * 本地历史最多缓存多大的原始视频。
 * 抽帧不再需要视频副本，超过此大小只保留缩略图，避免撑爆 IndexedDB 配额。
 */
export const HISTORY_VIDEO_MAX_BYTES = 80 * 1024 * 1024;
