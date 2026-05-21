"use client";

import Link from "next/link";
import { IconChevronRight, IconClock } from "@/components/icons";
import {
  formatHistoryTitle,
  formatRecordDate,
} from "@/lib/record-display";
import type { AnalysisRecord } from "@/lib/types";

type Props = {
  records: AnalysisRecord[];
  emptyTitle: string;
  emptyHint: string;
};

export function HistoryList({ records, emptyTitle, emptyHint }: Props) {
  if (records.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--spa-border)] bg-[var(--spa-elevated)] px-6 py-12 text-center">
        <p className="text-sm font-medium text-[var(--spa-text-secondary)]">
          {emptyTitle}
        </p>
        <p className="mt-2 text-xs leading-relaxed text-[var(--spa-text-muted)]">
          {emptyHint}
        </p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {records.map((r, i) => (
        <li key={r.id}>
          <Link
            href={`/analysis/${r.id}`}
            className="spa-panel group flex items-center gap-4 p-4 transition hover:border-[var(--crux-accent)] hover:shadow-[6px_6px_0_var(--crux-border)]"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={r.thumbnail}
              alt=""
              className="h-14 w-20 shrink-0 border-2 border-[var(--crux-border-subtle)] object-cover sm:h-16 sm:w-24"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-black text-[var(--crux-text)]">
                {formatHistoryTitle(r, records.length - i)}
              </p>
              <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[var(--spa-text-muted)]">
                <span className="inline-flex items-center gap-1">
                  <IconClock className="h-3.5 w-3.5 text-[var(--crux-accent)]" />
                  {formatRecordDate(r.createdAt, "full")}
                </span>
                {r.grade && (
                  <span className="font-bold text-[var(--crux-accent)]">
                    {r.grade}
                  </span>
                )}
              </p>
              {r.score != null && (
                <p className="mt-2 text-xs font-bold tabular-nums text-[var(--crux-text)]">
                  {r.score}
                  <span className="font-normal text-[var(--spa-text-muted)]">
                    {" "}
                    / 100
                  </span>
                </p>
              )}
              {r.highlight && (
                <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-[var(--spa-text-secondary)]">
                  {r.highlight}
                </p>
              )}
            </div>
            <IconChevronRight className="h-4 w-4 text-[var(--crux-accent)] transition group-hover:translate-x-0.5" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
