"use client";

import Link from "next/link";
import { IconChevronRight, IconClock } from "@/components/icons";

type Props = {
  records: Array<{
    id: string;
    createdAt: string;
    fileName: string;
    thumbnail: string;
    score?: number | null;
    highlight?: string | null;
  }>;
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
                {new Date(r.createdAt).toLocaleString(
                  undefined,
                  {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  }
                )}
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
