"use client";

import { forwardRef } from "react";
import type { AnalysisRecord } from "@/lib/types";
import { buildPdfSummaryLines } from "@/lib/generate-analysis-pdf";
import { parseAnalysis } from "@/lib/parse-analysis";

type Props = {
  record: AnalysisRecord;
};

/** 离屏 PDF 排版（html2canvas 渲染，支持中文系统字体） */
export const AnalysisPdfTemplate = forwardRef<HTMLDivElement, Props>(
  function AnalysisPdfTemplate({ record }, ref) {
    const parsed = parseAnalysis(record.analysis);
    const structured = parsed.structured;
    const data = buildPdfSummaryLines(record, structured);
    const date = new Date(record.createdAt).toLocaleDateString("zh-CN");

    return (
      <div
        ref={ref}
        className="pointer-events-none fixed left-[-9999px] top-0 z-[-1] w-[210mm] bg-[#f6f4f0] p-10 text-[#1a1917]"
        aria-hidden
      >
        <div className="border-b border-[#e8e4dc] pb-4">
          <p className="text-[10px] uppercase tracking-[0.2em] text-[#8a857c]">
            CRUX 抱石 · 动作解析
          </p>
          <h1 className="mt-2 text-xl font-semibold leading-tight">
            {data.title}
          </h1>
          <p className="mt-1 text-xs text-[#8a857c]">{date}</p>
        </div>

        {(data.score || data.highlight) && (
          <div className="mt-6 flex flex-wrap items-start gap-6">
            {data.score && (
              <div className="flex h-16 w-16 flex-col items-center justify-center rounded-full border-2 border-[#e8e4dc] bg-white">
                <span className="text-2xl font-light">{data.score.split("/")[0]?.trim()}</span>
                <span className="text-[9px] text-[#8a857c]">/ 100</span>
              </div>
            )}
            {data.highlight && (
              <p className="max-w-md flex-1 text-sm leading-relaxed text-[#5c5852]">
                {data.highlight}
              </p>
            )}
          </div>
        )}

        {data.dimensionPoints.length > 0 && (
          <section className="mt-8">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-[#8a857c]">
              核心维度
            </h2>
            <ul className="mt-3 space-y-2 text-sm leading-relaxed text-[#1a1917]">
              {data.dimensionPoints.map((p, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-[#8a857c]">·</span>
                  <span>{p.length > 200 ? `${p.slice(0, 200)}…` : p}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {structured.improvementBlocks.length > 0 && (
          <section className="mt-8">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-[#8a857c]">
              改进要点
            </h2>
            <div className="mt-3 space-y-3">
              {structured.improvementBlocks.slice(0, 3).map((b, i) => (
                <div
                  key={i}
                  className="rounded-lg border border-[#e8e4dc] bg-white p-3 text-sm"
                >
                  <p className="font-medium">{b.title}</p>
                  {b.practice && (
                    <p className="mt-1 text-[#5c5852]">
                      练习：{b.practice.slice(0, 160)}
                      {b.practice.length > 160 ? "…" : ""}
                    </p>
                  )}
                  {b.strength && (
                    <p className="mt-1 text-[#5c5852]">
                      力量：{b.strength.slice(0, 120)}
                      {b.strength.length > 120 ? "…" : ""}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {data.overall && (
          <section className="mt-8">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-[#8a857c]">
              整体建议
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-[#1a1917]">
              {data.overall}
            </p>
          </section>
        )}

        {data.timelineTop.length > 0 && (
          <section className="mt-8">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-[#8a857c]">
              关键时间点
            </h2>
            <ul className="mt-3 space-y-2 text-sm">
              {data.timelineTop.map((t, i) => (
                <li key={i}>
                  <span className="font-mono text-[#5c5852]">[{t.time}]</span>{" "}
                  {t.text}
                </li>
              ))}
            </ul>
          </section>
        )}

        <p className="mt-10 border-t border-[#e8e4dc] pt-4 text-[10px] text-[#8a857c]">
          仅供训练参考 · bouldering-ai-coach
        </p>
      </div>
    );
  }
);
