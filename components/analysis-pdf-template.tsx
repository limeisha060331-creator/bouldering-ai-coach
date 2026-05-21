"use client";

import { forwardRef, type ReactNode } from "react";
import type { AnalysisRecord } from "@/lib/types";
import {
  PDF_SITE_URL,
  buildPdfContent,
  type PdfContent,
} from "@/lib/pdf-content";

type Props = {
  record: AnalysisRecord;
  videoIndex?: number | null;
};

function PdfSectionHeading({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-stretch gap-0">
      <div className="w-1.5 shrink-0 bg-[#ff5c1a]" />
      <h2 className="bg-[#0a0a0a] px-4 py-2 text-[15px] font-black tracking-wide text-[#ff5c1a]">
        {children}
      </h2>
    </div>
  );
}

/** 单页 A4 PDF（html2canvas），CRUX 橙黑工业风 */
export const AnalysisPdfTemplate = forwardRef<HTMLDivElement, Props>(
  function AnalysisPdfTemplate({ record, videoIndex = null }, ref) {
    const data: PdfContent = buildPdfContent(record, videoIndex);

    return (
      <div
        ref={ref}
        data-pdf-root
        className="pointer-events-none fixed left-0 top-0 z-[-1] w-[210mm] opacity-0 bg-[#f5f3ef] text-[#0a0a0a]"
        style={{
          fontFamily: '"PingFang SC", "Microsoft YaHei", system-ui, sans-serif',
          maxHeight: "297mm",
        }}
        aria-hidden
      >
        {/* 顶栏标题 */}
        <header className="border-b-2 border-[#0a0a0a] bg-[#ff5c1a] px-8 py-6">
          <p
            className="text-[9px] font-bold tracking-[0.32em] text-[#0a0a0a]"
            style={{ fontFamily: 'ui-monospace, "Consolas", monospace' }}
          >
            BOULDERING · AI
          </p>
          <div className="mt-3 flex items-end justify-between gap-4">
            <div>
              <p className="text-[2.4rem] font-black leading-none tracking-[-0.05em] text-[#0a0a0a]">
                CRUX<span className="ml-3 text-[1.35rem] tracking-tight">抱石</span>
              </p>
              <p className="mt-1 text-[1.15rem] font-black tracking-[0.2em] text-[#0a0a0a]">
                动作解析
              </p>
            </div>
            <p
              className="shrink-0 border-2 border-[#0a0a0a] bg-[#0a0a0a] px-3 py-1 text-[10px] font-black text-[#ff5c1a]"
              style={{ fontFamily: 'ui-monospace, "Consolas", monospace' }}
            >
              教练报告
            </p>
          </div>
        </header>

        <div className="px-8 py-5">
          {/* 视频序号 + 时间 */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-2 border-[#0a0a0a] bg-[#0a0a0a] px-4 py-2.5 text-white">
            <span className="text-sm font-black text-[#ff5c1a]">
              {data.videoLabel}
            </span>
            <span className="text-[11px] font-medium text-white/90">
              {data.timeLabel}
            </span>
            {data.gradeLine && (
              <span className="text-[11px] font-bold text-white">{data.gradeLine}</span>
            )}
            {data.score != null && (
              <span className="ml-auto text-sm font-black tabular-nums text-[#ff5c1a]">
                {data.score}
                <span className="text-[10px] font-bold text-white/80"> / 100</span>
              </span>
            )}
          </div>

          {/* 教练金句：无框，左侧橙条强调 */}
          {data.highlight && (
            <div className="mt-5 border-l-4 border-[#ff5c1a] bg-[#fff0e8] py-3 pl-4 pr-2">
              <p className="text-[10px] font-black tracking-wider text-[#ff5c1a]">
                教练金句
              </p>
              <p className="mt-1.5 text-[13px] font-black leading-snug text-[#0a0a0a]">
                {data.highlight}
              </p>
            </div>
          )}

          {/* 核心维度 */}
          {data.dimensions.length > 0 && (
            <section className="mt-5">
              <PdfSectionHeading>核心维度</PdfSectionHeading>
              <ul className="mt-3 space-y-2 border-2 border-[#0a0a0a] bg-white p-3">
                {data.dimensions.map((d, i) => (
                  <li
                    key={i}
                    className="flex gap-2 text-[12px] leading-snug text-[#0a0a0a]"
                  >
                    <span className="shrink-0 font-black text-[#ff5c1a]">▸</span>
                    <span>
                      {d.label ? (
                        <>
                          <span className="font-black">{d.label}</span>
                          <span className="text-[#3d3a36]"> — {d.text}</span>
                        </>
                      ) : (
                        d.text
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* 改进要点 */}
          {data.improvements.length > 0 && (
            <section className="mt-5">
              <PdfSectionHeading>改进要点</PdfSectionHeading>
              <div className="mt-3 space-y-2">
                {data.improvements.map((item, i) => (
                  <div
                    key={i}
                    className="border-2 border-[#0a0a0a] border-l-[6px] border-l-[#ff5c1a] bg-white px-3 py-2.5"
                  >
                    <p className="text-[12px] font-black text-[#0a0a0a]">
                      {item.title}
                    </p>
                    <p className="mt-1 text-[11px] leading-snug text-[#3d3a36]">
                      {item.text}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}

          <p className="mt-6 text-center text-[9px] tracking-wide text-[#9a948c]">
            {PDF_SITE_URL.replace(/^https?:\/\//, "")}
          </p>
          <p className="mt-0.5 text-center text-[8px] text-[#b5afa6]">
            仅供训练参考 · CRUX 抱石 AI 教练
          </p>
        </div>
      </div>
    );
  }
);
