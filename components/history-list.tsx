"use client";

import Link from "next/link";
import type { AnalysisRecord } from "@/lib/types";

type Props = {
  records: AnalysisRecord[];
};

export function HistoryList({ records }: Props) {
  if (records.length === 0) {
    return (
      <p className="text-center text-sm text-zinc-500">
        暂无历史记录，上传视频开始你的第一次分析吧
      </p>
    );
  }

  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {records.map((r) => (
        <li key={r.id}>
          <Link
            href={`/analysis/${r.id}`}
            className="gym-panel flex gap-3 rounded-xl p-3 transition hover:border-orange-500/30 hover:bg-white/[0.02]"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={r.thumbnail}
              alt=""
              className="h-16 w-24 shrink-0 rounded-lg object-cover"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-zinc-200">
                {r.fileName}
              </p>
              <p className="mt-0.5 text-xs text-zinc-500">
                {new Date(r.createdAt).toLocaleString("zh-CN")}
              </p>
              {r.score != null && (
                <p className="mt-1 text-xs font-semibold text-orange-400">
                  评分 {r.score}/100
                </p>
              )}
              {r.highlight && (
                <p className="mt-1 line-clamp-2 text-xs text-zinc-400">
                  {r.highlight}
                </p>
              )}
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
