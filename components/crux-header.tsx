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
          className="text-sm font-black tracking-tight text-[var(--crux-text)] sm:text-base"
        >
          抱石 AI 教练
        </Link>

        <nav className="hidden items-center gap-5 sm:flex">
          <Link
            href="/"
            className="text-xs font-semibold text-[var(--crux-text-muted)] transition hover:text-[var(--crux-text)]"
          >
            首页
          </Link>
          <Link
            href="/analyze"
            className="text-xs font-semibold text-[var(--crux-text-muted)] transition hover:text-[var(--crux-text)]"
          >
            分析
          </Link>
          <Link
            href="/progress"
            className="text-xs font-semibold text-[var(--crux-text-muted)] transition hover:text-[var(--crux-text)]"
          >
            进步
          </Link>
          <Link
            href="/favorites"
            className="text-xs font-semibold text-[var(--crux-text-muted)] transition hover:text-[var(--crux-text)]"
          >
            收藏
          </Link>
        </nav>

        <button
          type="button"
          className="flex h-9 w-9 items-center justify-center border-2 border-[var(--crux-border)] sm:hidden"
          aria-label="菜单"
          onClick={() => setOpen((o) => !o)}
        >
          {open ? <IconX className="h-4 w-4" /> : <IconMenu className="h-4 w-4" />}
        </button>
      </div>

      {open && (
        <nav className="border-t-2 border-[var(--crux-border)] bg-[var(--crux-surface)] px-4 py-3 sm:hidden">
          <Link
            href="/"
            className="block py-2 text-xs font-semibold"
            onClick={() => setOpen(false)}
          >
            首页
          </Link>
          <Link
            href="/analyze"
            className="block py-2 text-xs font-semibold"
            onClick={() => setOpen(false)}
          >
            分析
          </Link>
          <Link
            href="/progress"
            className="block py-2 text-xs font-semibold"
            onClick={() => setOpen(false)}
          >
            进步
          </Link>
          <Link
            href="/favorites"
            className="block py-2 text-xs font-semibold"
            onClick={() => setOpen(false)}
          >
            收藏
          </Link>
          {variant === "landing" && (
            <Link
              href="/analyze"
              className="mt-3 block bg-[var(--crux-orange-panel)] px-4 py-3 text-center text-sm font-bold text-[var(--crux-text)]"
              onClick={() => setOpen(false)}
            >
              上传视频分析
            </Link>
          )}
        </nav>
      )}
    </header>
  );
}
