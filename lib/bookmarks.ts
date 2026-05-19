import { listAnalysisRecords } from "./analysis-db";
import type { SegmentBookmarkItem } from "./types";

/** 汇总所有分析记录中的时间轴收藏 */
export async function listAllSegmentBookmarks(): Promise<
  SegmentBookmarkItem[]
> {
  const records = await listAnalysisRecords();
  const items: SegmentBookmarkItem[] = [];

  for (const r of records) {
    const indices = r.bookmarkedSegmentIndices ?? [];
    if (!indices.length || !r.segments?.length) continue;

    for (const index of indices) {
      const seg = r.segments[index];
      if (!seg) continue;
      items.push({
        analysisId: r.id,
        fileName: r.fileName,
        createdAt: r.createdAt,
        segmentIndex: index,
        timestamp: seg.timestamp,
        seconds: seg.seconds,
        content: seg.content,
      });
    }
  }

  items.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  return items;
}
