"use client";

import Link from "next/link";
import { IconChevronRight, IconClock } from "@/components/icons";
import type { AnalysisRecord } from "@/lib/types";

type Props = {
  records: AnalysisRecord[];
};

export function HistoryList({ records }: Props) {
  if (records.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-[var(--spa-text-muted)]">
        暂无记录。上传一段攀爬视频，开始你的第一次分析。
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {records.map((r) => (
        <li key={r.id}>
          <Link
            href={`/analysis/${r.id}`}
            className="spa-panel group flex items-center gap-4 rounded-xl p-4 transition hover:border-[var(--spa-text-muted)]/40 hover:shadow-[var(--spa-shadow-lg)]"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={r.thumbnail}
              alt=""
              className="h-14 w-20 shrink-0 rounded-lg border border-[var(--spa-border-subtle)] object-cover sm:h-16 sm:w-24"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-[var(--spa-text)]">
                {r.fileName}
              </p>
              <p className="mt-1 flex items-center gap-1.5 text-xs text-[var(--spa-text-muted)]">
                <IconClock className="h-3.5 w-3.5" />
                {new Date(r.createdAt).toLocaleString("zh-CN", {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
              {r.score != null && (
                <p className="mt-2 text-xs font-medium tabular-nums text-[var(--spa-text-secondary)]">
                  {r.score}
                  <span className="font-normal text-[var(--spa-text-muted)]">
                    {" "}
                    / 100
                  </span>
                </p>
              )}
              {r.highlight && (
                <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-[var(--spa-text-muted)]">
                  {r.highlight}
                </p>
              )}
            </div>
            <IconChevronRight className="h-4 w-4 text-[var(--spa-text-muted)] transition group-hover:translate-x-0.5 group-hover:text-[var(--spa-text-secondary)]" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
