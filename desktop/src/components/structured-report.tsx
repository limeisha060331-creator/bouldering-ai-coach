import type { StructuredReport, ImprovementBlock } from "@lib/types";
import type { UiLocale } from "@lib/strings";

type Props = {
  structured: StructuredReport;
  uiLocale: UiLocale;
};

function Block({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="panel-flat">
      <div className="panel-head">
        <span className="t">{title}</span>
      </div>
      <div className="panel-body space-y-3 text-sm leading-relaxed text-[var(--crux-text-secondary)]">
        {children}
      </div>
    </section>
  );
}

function ImprovementItem({ block }: { block: ImprovementBlock }) {
  return (
    <div className="border-2 border-[var(--crux-border-subtle)] bg-[var(--crux-bg)] p-4">
      <p className="font-extrabold text-[var(--crux-text)]">{block.title}</p>
      {block.practice && (
        <div className="mt-2.5">
          <p className="mono">练习</p>
          <p className="mt-1 whitespace-pre-wrap">{block.practice}</p>
        </div>
      )}
      {block.strength && (
        <div className="mt-2.5">
          <p className="mono">力量训练</p>
          <p className="mt-1 whitespace-pre-wrap">{block.strength}</p>
        </div>
      )}
      {block.lines.length > 0 && (
        <ul className="mt-2.5 space-y-1.5">
          {block.lines.map((line, i) => (
            <li key={i} className="flex gap-2">
              <span
                className="mt-[0.55rem] h-[3px] w-2 shrink-0 bg-[var(--crux-accent)]"
                aria-hidden
              />
              <span>{line}</span>
            </li>
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
        <Block title={labels.dimension}>
          {structured.dimensionBullets.length > 0 ? (
            <ul className="space-y-2.5">
              {structured.dimensionBullets.map((item, i) => (
                <li key={i} className="flex gap-2.5">
                  <span
                    className="mt-[0.55rem] h-[3px] w-2 shrink-0 bg-[var(--crux-border-subtle)]"
                    aria-hidden
                  />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="whitespace-pre-wrap">{structured.dimensionSummary}</p>
          )}
        </Block>
      )}

      {(structured.improvementIntro ||
        structured.improvementBlocks.length > 0) && (
        <Block title={labels.improvement}>
          {structured.improvementIntro && (
            <p className="whitespace-pre-wrap text-[var(--crux-text-muted)]">
              {structured.improvementIntro}
            </p>
          )}
          <div className="space-y-3">
            {structured.improvementBlocks.map((block, i) => (
              <ImprovementItem key={`${block.title}-${i}`} block={block} />
            ))}
          </div>
        </Block>
      )}

      {structured.overallAdvice && (
        <Block title={labels.overall}>
          <p className="whitespace-pre-wrap">{structured.overallAdvice}</p>
        </Block>
      )}
    </div>
  );
}
