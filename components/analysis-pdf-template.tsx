"use client";

import { forwardRef, type ReactNode } from "react";
import type { AnalysisRecord } from "@/lib/types";
import {
  PDF_SITE_URL,
  buildPdfContent,
  type PdfContent,
} from "@/lib/pdf-content";

/** 仅 hex/rgb，供 html2canvas 使用 */
const C = {
  page: "#f4f0ea",
  surface: "#ffffff",
  text: "#141414",
  muted: "#4a4540",
  faint: "#8a837a",
  faint2: "#b0a89e",
  orange: "#ff5722",
  orangeDeep: "#e64a19",
  orangeTint: "#ffe8dc",
  ink: "#1a1a1a",
  rule: "#d8d2c8",
} as const;

const mono = 'ui-monospace, "Consolas", "Menlo", monospace';
const sans = '"PingFang SC", "Microsoft YaHei", system-ui, sans-serif';

type Props = {
  record: AnalysisRecord;
  videoIndex?: number | null;
};

function PdfSectionHeading({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        marginBottom: 8,
      }}
    >
      <span
        style={{
          width: 4,
          height: 18,
          flexShrink: 0,
          backgroundColor: C.orange,
        }}
      />
      <h2
        style={{
          margin: 0,
          fontSize: 16,
          fontWeight: 900,
          letterSpacing: "0.12em",
          color: C.orangeDeep,
        }}
      >
        {children}
      </h2>
      <span
        style={{
          flex: 1,
          height: 2,
          backgroundColor: C.ink,
          opacity: 0.12,
        }}
      />
    </div>
  );
}

/** 单页 A4 PDF（html2canvas） */
export const AnalysisPdfTemplate = forwardRef<HTMLDivElement, Props>(
  function AnalysisPdfTemplate({ record, videoIndex = null }, ref) {
    const data: PdfContent = buildPdfContent(record, videoIndex);

    const metaParts = [data.videoLabel, data.timeLabel];
    if (data.gradeLine) metaParts.push(data.gradeLine);

    return (
      <div
        ref={ref}
        data-pdf-root
        data-pdf-safe-colors
        aria-hidden
        style={{
          pointerEvents: "none",
          position: "fixed",
          left: 0,
          top: 0,
          zIndex: -1,
          width: "210mm",
          height: "297mm",
          opacity: 0,
          overflow: "hidden",
          backgroundColor: C.page,
          color: C.text,
          fontFamily: sans,
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <header
          style={{
            flexShrink: 0,
            borderBottom: `2px solid ${C.ink}`,
            backgroundColor: C.orange,
            padding: "18px 28px 16px",
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: 8,
              fontWeight: 700,
              letterSpacing: "0.34em",
              color: C.ink,
              opacity: 0.55,
              fontFamily: mono,
            }}
          >
            BOULDERING · AI
          </p>
          <p
            style={{
              margin: "6px 0 0",
              fontSize: 34,
              fontWeight: 900,
              lineHeight: 1,
              letterSpacing: "-0.04em",
              color: C.ink,
            }}
          >
            CRUX<span style={{ marginLeft: 10, fontSize: 20 }}>抱石</span>
          </p>
          <p
            style={{
              margin: "2px 0 0",
              fontSize: 16,
              fontWeight: 900,
              letterSpacing: "0.18em",
              color: C.ink,
            }}
          >
            动作解析
          </p>

          <div
            style={{
              marginTop: 12,
              paddingTop: 10,
              borderTop: `1px solid ${C.ink}`,
              borderTopColor: "rgba(26,26,26,0.22)",
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: "6px 14px",
              fontFamily: mono,
              fontSize: 11,
              fontWeight: 700,
              color: C.ink,
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 900 }}>
              {metaParts.join(" · ")}
            </span>
            {data.score != null && (
              <span style={{ marginLeft: "auto", fontSize: 13, fontWeight: 900 }}>
                评分 {data.score}
                <span style={{ fontSize: 10, fontWeight: 700, opacity: 0.65 }}>
                  /100
                </span>
              </span>
            )}
          </div>
        </header>

        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            padding: "14px 28px 12px",
            minHeight: 0,
          }}
        >
          <div style={{ flex: 1, minHeight: 0 }}>
            {data.highlight && (
              <div
                style={{
                  borderLeft: `4px solid ${C.orange}`,
                  backgroundColor: C.orangeTint,
                  padding: "10px 12px 10px 14px",
                }}
              >
                <p
                  style={{
                    margin: 0,
                    fontSize: 9,
                    fontWeight: 900,
                    letterSpacing: "0.1em",
                    color: C.orangeDeep,
                  }}
                >
                  教练金句
                </p>
                <p
                  style={{
                    margin: "5px 0 0",
                    fontSize: 12,
                    fontWeight: 800,
                    lineHeight: 1.32,
                    color: C.text,
                  }}
                >
                  {data.highlight}
                </p>
              </div>
            )}

            {data.dimensions.length > 0 && (
              <section style={{ marginTop: 12 }}>
                <PdfSectionHeading>核心维度</PdfSectionHeading>
                <ul
                  style={{
                    margin: 0,
                    padding: "10px 12px",
                    listStyle: "none",
                    border: `1.5px solid ${C.ink}`,
                    backgroundColor: C.surface,
                  }}
                >
                  {data.dimensions.map((d, i) => (
                    <li
                      key={i}
                      style={{
                        display: "flex",
                        gap: 6,
                        fontSize: 11,
                        lineHeight: 1.32,
                        color: C.text,
                        marginTop: i > 0 ? 6 : 0,
                      }}
                    >
                      <span
                        style={{
                          flexShrink: 0,
                          fontWeight: 900,
                          color: C.orange,
                        }}
                      >
                        ▸
                      </span>
                      <span>
                        {d.label ? (
                          <>
                            <span style={{ fontWeight: 800 }}>{d.label}</span>
                            <span style={{ color: C.muted }}> — {d.text}</span>
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

            {data.improvements.length > 0 && (
              <section style={{ marginTop: 12 }}>
                <PdfSectionHeading>改进要点</PdfSectionHeading>
                <div>
                  {data.improvements.map((item, i) => (
                    <div
                      key={i}
                      style={{
                        marginTop: i > 0 ? 6 : 0,
                        border: `1.5px solid ${C.ink}`,
                        borderLeft: `5px solid ${C.orange}`,
                        backgroundColor: C.surface,
                        padding: "8px 10px",
                      }}
                    >
                      <p
                        style={{
                          margin: 0,
                          fontSize: 11,
                          fontWeight: 900,
                          color: C.text,
                        }}
                      >
                        {item.title}
                      </p>
                      <p
                        style={{
                          margin: "3px 0 0",
                          fontSize: 10,
                          lineHeight: 1.32,
                          color: C.muted,
                        }}
                      >
                        {item.text}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>

          <div style={{ flexShrink: 0, paddingTop: 10 }}>
            <p
              style={{
                margin: 0,
                textAlign: "center",
                fontSize: 8,
                letterSpacing: "0.06em",
                color: C.faint,
              }}
            >
              {PDF_SITE_URL.replace(/^https?:\/\//, "")}
            </p>
            <p
              style={{
                margin: "2px 0 0",
                textAlign: "center",
                fontSize: 7,
                color: C.faint2,
              }}
            >
              仅供训练参考 · CRUX 抱石 AI 教练
            </p>
          </div>
        </div>
      </div>
    );
  }
);
