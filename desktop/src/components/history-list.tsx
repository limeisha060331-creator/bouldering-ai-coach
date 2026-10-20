import { Link } from "react-router-dom";
import { IconChevronRight, IconClock } from "@/components/icons";
import { formatHistoryTitle, formatRecordDate } from "@lib/record-display";
import { gradeTapeColor } from "@lib/grade-tape";
import type { AnalysisRecord } from "@lib/types";

type Props = {
  records: AnalysisRecord[];
  emptyTitle: string;
  emptyHint: string;
};

export function HistoryList({ records, emptyTitle, emptyHint }: Props) {
  if (records.length === 0) {
    return (
      <div className="empty">
        <p className="t">{emptyTitle}</p>
        <p className="h">{emptyHint}</p>
      </div>
    );
  }

  return (
    <ul className="border-t-2 border-[var(--crux-border)]">
      {records.map((r, i) => (
        <li key={r.id}>
          <Link
            to={`/analysis/${r.id}`}
            className="group flex items-stretch border-b border-[var(--crux-hair)] transition hover:bg-[var(--crux-surface)]"
          >
            <span
              className="tape"
              style={{ background: gradeTapeColor(r.grade) }}
              aria-hidden
            />
            {r.thumbnail ? (
              <img
                src={r.thumbnail}
                alt=""
                className="my-3 ml-3 h-12 w-16 shrink-0 border-2 border-[var(--crux-border-subtle)] object-cover sm:h-14 sm:w-20"
              />
            ) : (
              <span className="my-3 ml-3 flex h-12 w-16 shrink-0 items-center justify-center border-2 border-[var(--crux-border-subtle)] text-[var(--crux-text-muted)] sm:h-14 sm:w-20">
                <IconClock className="h-4 w-4" />
              </span>
            )}
            <div className="min-w-0 flex-1 py-3 pl-3 pr-2">
              <p className="truncate text-sm font-extrabold text-[var(--crux-text)]">
                {formatHistoryTitle(r, records.length - i)}
              </p>
              <p className="mono mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
                <span className="inline-flex items-center gap-1">
                  <IconClock className="h-3 w-3" />
                  {formatRecordDate(r.createdAt, "full")}
                </span>
                {r.grade && (
                  <span className="badge !py-0 !text-[0.6875rem]">
                    <i
                      style={{ background: gradeTapeColor(r.grade) }}
                      aria-hidden
                    />
                    {r.grade}
                  </span>
                )}
              </p>
              {r.score != null && (
                <p className="num mt-1.5 text-xs font-bold text-[var(--crux-text)]">
                  {r.score}
                  <span className="font-normal text-[var(--crux-text-muted)]">
                    {" "}
                    / 100
                  </span>
                </p>
              )}
              {r.highlight && (
                <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-[var(--crux-text-secondary)]">
                  {r.highlight}
                </p>
              )}
            </div>
            <IconChevronRight className="mr-3 mt-4 h-4 w-4 shrink-0 text-[var(--crux-text-muted)] transition group-hover:translate-x-0.5 group-hover:text-[var(--crux-accent)]" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
