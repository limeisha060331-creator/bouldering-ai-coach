"use client";

import Link from "next/link";
import { useState } from "react";
import { IconMenu, IconX } from "@/components/icons";

type Props = {
  variant?: "landing" | "app";
};

export function CruxHeader({ variant = "app" }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <header className="no-print border-b-2 border-[var(--crux-border)] bg-[var(--crux-surface)]">
      <div className="crux-container flex h-12 items-center justify-between sm:h-14">
        <Link
          href="/"
          className="crux-mono text-[10px] font-bold tracking-[0.2em] text-[var(--crux-text)] sm:text-xs"
        >
          CRUX // ANALYSIS.V04
        </Link>

        <div className="hidden items-center gap-6 sm:flex">
          <span className="crux-mono text-[10px] text-[var(--crux-text-muted)]">
            52.001 MM
          </span>
          <span className="h-3 w-px bg-[var(--crux-border-subtle)]" aria-hidden />
          <nav className="flex gap-4">
            <Link
              href="/"
              className="crux-mono text-[10px] font-semibold uppercase tracking-wider text-[var(--crux-text-muted)] transition hover:text-[var(--crux-text)]"
            >
              Home
            </Link>
            <Link
              href="/analyze"
              className="crux-mono text-[10px] font-semibold uppercase tracking-wider text-[var(--crux-text-muted)] transition hover:text-[var(--crux-text)]"
            >
              Analyze
            </Link>
            <Link
              href="/progress"
              className="crux-mono text-[10px] font-semibold uppercase tracking-wider text-[var(--crux-text-muted)] transition hover:text-[var(--crux-text)]"
            >
              Progress
            </Link>
            <Link
              href="/favorites"
              className="crux-mono text-[10px] font-semibold uppercase tracking-wider text-[var(--crux-text-muted)] transition hover:text-[var(--crux-text)]"
            >
              Saved
            </Link>
          </nav>
        </div>

        <button
          type="button"
          className="flex h-9 w-9 items-center justify-center border-2 border-[var(--crux-border)] sm:hidden"
          aria-label="Menu"
          onClick={() => setOpen((o) => !o)}
        >
          {open ? <IconX className="h-4 w-4" /> : <IconMenu className="h-4 w-4" />}
        </button>
      </div>

      {open && (
        <nav className="border-t-2 border-[var(--crux-border)] bg-[var(--crux-surface)] px-4 py-3 sm:hidden">
          <Link
            href="/"
            className="block py-2 crux-mono text-xs font-semibold uppercase"
            onClick={() => setOpen(false)}
          >
            Home
          </Link>
          <Link
            href="/analyze"
            className="block py-2 crux-mono text-xs font-semibold uppercase"
            onClick={() => setOpen(false)}
          >
            Analyze
          </Link>
          <Link
            href="/progress"
            className="block py-2 crux-mono text-xs font-semibold uppercase"
            onClick={() => setOpen(false)}
          >
            Progress
          </Link>
          <Link
            href="/favorites"
            className="block py-2 crux-mono text-xs font-semibold uppercase"
            onClick={() => setOpen(false)}
          >
            Saved
          </Link>
          {variant === "landing" && (
            <Link
              href="/analyze"
              className="mt-3 block bg-[var(--crux-orange-panel)] px-4 py-3 text-center text-sm font-bold uppercase tracking-wide text-[var(--crux-text)]"
              onClick={() => setOpen(false)}
            >
              Upload video
            </Link>
          )}
        </nav>
      )}
    </header>
  );
}
