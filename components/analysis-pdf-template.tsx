"use client";

import { forwardRef, type ReactNode } from "react";
import type { AnalysisRecord } from "@/lib/types";
import { buildPdfSummaryLines } from "@/lib/generate-analysis-pdf";
import { parseAnalysis } from "@/lib/parse-analysis";

type Props = {
  record: AnalysisRecord;
};

function PdfSectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2
      className="border-b-2 border-[#1a1917] pb-2 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[#6b6560]"
      style={{ fontFamily: 'ui-monospace, "Menlo", "Consolas", monospace' }}
    >
      {children}
    </h2>
  );
}

function PdfPanel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`border-2 border-[#1a1917] bg-white p-4 ${className}`}
      style={{ boxShadow: "4px 4px 0 #1a1917" }}
    >
      {children}
    </div>
  );
}

/** 离屏 PDF 排版（html2canvas 渲染，CRUX 工业风与网站一致） */
export const AnalysisPdfTemplate = forwardRef<HTMLDivElement, Props>(
  function AnalysisPdfTemplate({ record }, ref) {
    const parsed = parseAnalysis(record.analysis);
    const structured = parsed.structured;
    const data = buildPdfSummaryLines(record, structured);
    const date = new Date(record.createdAt).toLocaleString("zh-CN", {
      dateStyle: "medium",
      timeStyle: "short",
    });

    const meta: string[] = [];
    if (record.grade) meta.push(`难度 ${record.grade}`);
    if (record.ascentMeters != null && record.ascentMeters > 0) {
      meta.push(`爬升 ${record.ascentMeters}m`);
    }
    if (record.depth === "light") meta.push("轻量分析");
    if (record.depth === "deep") meta.push("深度分析");
    if (record.sessionNote) meta.push(record.sessionNote);

    return (
      <div
        ref={ref}
        data-pdf-root
        className="pointer-events-none fixed left-0 top-0 z-[-1] w-[210mm] opacity-0 bg-[#f5f3ef] text-[#0a0a0a]"
        style={{
          fontFamily: '"PingFang SC", "Microsoft YaHei", system-ui, sans-serif',
        }}
        aria-hidden
      >
        {/* 品牌顶栏 — 与首页橙区一致 */}
        <header className="border-b-2 border-[#1a1917] bg-[#ff5c1a] px-10 py-8">
          <p
            className="font-mono text-[10px] font-bold tracking-[0.28em] text-[#3d3a36]"
            style={{ fontFamily: 'ui-monospace, "Menlo", "Consolas", monospace' }}
          >
            BOULDERING · AI
          </p>
          <div className="mt-4 flex items-end justify-between gap-6">
            <div className="border-l-4 border-[#0a0a0a] pl-4">
              <p className="text-[2.75rem] font-black leading-[0.85] tracking-[-0.04em]">
                CRUX
              </p>
              <p className="text-xl font-black leading-tight tracking-tight">
                抱石 · 动作解析
              </p>
            </div>
            <p
              className="shrink-0 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#3d3a36]"
              style={{ fontFamily: 'ui-monospace, "Menlo", "Consolas", monospace' }}
            >
              教练报告
            </p>
          </div>
        </header>

        <div className="space-y-8 px-10 py-8">
          {/* 线路信息 */}
          <PdfPanel>
            <p
              className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#6b6560]"
              style={{ fontFamily: 'ui-monospace, "Menlo", "Consolas", monospace' }}
            >
              分析对象
            </p>
            <h1 className="mt-2 text-lg font-black leading-snug tracking-tight">
              {data.title}
            </h1>
            <p className="mt-2 font-mono text-[11px] text-[#6b6560]">{date}</p>
            {meta.length > 0 && (
              <p className="mt-3 text-sm font-medium leading-relaxed text-[#3d3a36]">
                {meta.join(" · ")}
              </p>
            )}
          </PdfPanel>

          {/* 评分 + 金句 */}
          {(data.score || data.highlight) && (
            <div className="flex flex-wrap items-stretch gap-4">
              {data.score && (
                <div
                  className="flex h-[4.5rem] w-[4.5rem] shrink-0 flex-col items-center justify-center border-2 border-[#1a1917] bg-[#ff5c1a]"
                  style={{ boxShadow: "3px 3px 0 #1a1917" }}
                >
                  <span className="text-2xl font-black tabular-nums leading-none">
                    {data.score.split("/")[0]?.trim()}
                  </span>
                  <span
                    className="mt-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-[#3d3a36]"
                    style={{
                      fontFamily: 'ui-monospace, "Menlo", "Consolas", monospace',
                    }}
                  >
                    / 100
                  </span>
                </div>
              )}
              {data.highlight && (
                <div
                  className="min-w-[12rem] flex-1 border-2 border-[#1a1917] bg-white px-5 py-4"
                  style={{ boxShadow: "4px 4px 0 #1a1917" }}
                >
                  <p
                    className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#6b6560]"
                    style={{
                      fontFamily: 'ui-monospace, "Menlo", "Consolas", monospace',
                    }}
                  >
                    教练金句
                  </p>
                  <p className="mt-2 text-sm font-bold leading-relaxed text-[#0a0a0a]">
                    {data.highlight}
                  </p>
                </div>
              )}
            </div>
          )}

          {data.dimensionPoints.length > 0 && (
            <section>
              <PdfSectionTitle>核心维度</PdfSectionTitle>
              <ul className="mt-4 space-y-2.5">
                {data.dimensionPoints.map((p, i) => (
                  <li
                    key={i}
                    className="flex gap-3 border-l-2 border-[#ff5c1a] bg-white py-1 pl-3 text-sm leading-relaxed"
                  >
                    <span className="font-black text-[#ff5c1a]">/</span>
                    <span>{p.length > 200 ? `${p.slice(0, 200)}…` : p}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {structured.improvementBlocks.length > 0 && (
            <section>
              <PdfSectionTitle>改进要点</PdfSectionTitle>
              <div className="mt-4 space-y-3">
                {structured.improvementBlocks.slice(0, 3).map((b, i) => (
                  <PdfPanel key={i} className="!p-3">
                    <p className="text-sm font-black uppercase tracking-tight">
                      {b.title}
                    </p>
                    {b.practice && (
                      <p className="mt-2 text-sm leading-relaxed text-[#3d3a36]">
                        <span className="font-bold text-[#0a0a0a]">练习 · </span>
                        {b.practice.slice(0, 160)}
                        {b.practice.length > 160 ? "…" : ""}
                      </p>
                    )}
                    {b.strength && (
                      <p className="mt-1.5 text-sm leading-relaxed text-[#3d3a36]">
                        <span className="font-bold text-[#0a0a0a]">力量 · </span>
                        {b.strength.slice(0, 120)}
                        {b.strength.length > 120 ? "…" : ""}
                      </p>
                    )}
                  </PdfPanel>
                ))}
              </div>
            </section>
          )}

          {data.overall && (
            <section>
              <PdfSectionTitle>整体建议</PdfSectionTitle>
              <PdfPanel className="mt-4">
                <p className="text-sm leading-relaxed">{data.overall}</p>
              </PdfPanel>
            </section>
          )}

          {data.timelineTop.length > 0 && (
            <section>
              <PdfSectionTitle>关键时间点</PdfSectionTitle>
              <ul className="mt-4 divide-y-2 divide-[#1a1917] border-2 border-[#1a1917] bg-white">
                {data.timelineTop.map((t, i) => (
                  <li key={i} className="flex gap-4 px-4 py-3 text-sm">
                    <span
                      className="shrink-0 font-mono text-xs font-bold text-[#ff5c1a]"
                      style={{
                        fontFamily: "var(--font-mono), ui-monospace, monospace",
                      }}
                    >
                      [{t.time}]
                    </span>
                    <span className="leading-relaxed">{t.text}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <footer className="border-t-2 border-[#1a1917] bg-[#0a0a0a] px-10 py-4">
          <p
            className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-[#cccccc]"
            style={{ fontFamily: 'ui-monospace, "Menlo", "Consolas", monospace' }}
          >
            仅供训练参考 · 非医疗或现场安全建议 · CRUX 抱石 AI 教练
          </p>
        </footer>
      </div>
    );
  }
);
