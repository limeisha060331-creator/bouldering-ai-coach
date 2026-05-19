"use client";

import type { StructuredReport, ImprovementBlock } from "@/lib/types";
import type { UiLocale } from "@/lib/strings";

type Props = {
  structured: StructuredReport;
  uiLocale: UiLocale;
};

function BlockCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-[var(--spa-border)] bg-[var(--spa-surface)] p-5 shadow-[var(--spa-shadow)]">
      <h3 className="text-sm font-medium text-[var(--spa-text)]">{title}</h3>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-[var(--spa-text-secondary)]">
        {children}
      </div>
    </div>
  );
}

function ImprovementItem({ block }: { block: ImprovementBlock }) {
  return (
    <div className="rounded-lg border border-[var(--spa-border-subtle)] bg-[var(--spa-elevated)] p-4">
      <p className="font-medium text-[var(--spa-text)]">{block.title}</p>
      {block.practice && (
        <div className="mt-2">
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--spa-text-muted)]">
            练习
          </p>
          <p className="mt-1 whitespace-pre-wrap">{block.practice}</p>
        </div>
      )}
      {block.strength && (
        <div className="mt-2">
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--spa-text-muted)]">
            力量训练
          </p>
          <p className="mt-1 whitespace-pre-wrap">{block.strength}</p>
        </div>
      )}
      {block.lines.length > 0 && (
        <ul className="mt-2 list-inside list-disc space-y-1">
          {block.lines.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function StructuredReportView({ structured, uiLocale }: Props) {
  const zh = uiLocale === "zh";
  const labels = {
    dimension: zh ? "核心维度评估" : "Core assessment",
    improvement: zh ? "改进方案" : "Improvement plan",
    overall: zh ? "整体建议" : "Overall advice",
  };

  if (!structured.hasStructuredContent) return null;

  return (
    <div className="flex flex-col gap-5">
      {(structured.dimensionBullets.length > 0 ||
        structured.dimensionSummary) && (
        <BlockCard title={labels.dimension}>
          {structured.dimensionBullets.length > 0 ? (
            <ul className="space-y-2.5">
              {structured.dimensionBullets.map((item, i) => (
                <li key={i} className="flex gap-2">
                  <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[var(--spa-text-muted)]" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="whitespace-pre-wrap">{structured.dimensionSummary}</p>
          )}
        </BlockCard>
      )}

      {(structured.improvementIntro ||
        structured.improvementBlocks.length > 0) && (
        <BlockCard title={labels.improvement}>
          {structured.improvementIntro && (
            <p className="mb-3 whitespace-pre-wrap text-[var(--spa-text-muted)]">
              {structured.improvementIntro}
            </p>
          )}
          <div className="space-y-3">
            {structured.improvementBlocks.map((block, i) => (
              <ImprovementItem key={`${block.title}-${i}`} block={block} />
            ))}
          </div>
        </BlockCard>
      )}

      {structured.overallAdvice && (
        <BlockCard title={labels.overall}>
          <p className="whitespace-pre-wrap">{structured.overallAdvice}</p>
        </BlockCard>
      )}
    </div>
  );
}
