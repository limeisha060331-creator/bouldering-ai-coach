"use client";

import { forwardRef, type ReactNode } from "react";
import type { AnalysisRecord } from "@/lib/types";
import {
  PDF_SITE_URL,
  buildPdfContent,
  type PdfContent,
} from "@/lib/pdf-content";

/** A4 @ 96dpi，与 html2canvas 输出一页对齐 */
const PAGE_W = 794;
const PAGE_H = 1123;

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
        marginBottom: 10,
        flexShrink: 0,
      }}
    >
      <span
        style={{ width: 5, height: 20, flexShrink: 0, backgroundColor: C.orange }}
      />
      <h2
        style={{
          margin: 0,
          fontSize: 18,
          fontWeight: 900,
          letterSpacing: "0.14em",
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
          opacity: 0.15,
        }}
      />
    </div>
  );
}

/** 单页 A4 PDF（html2canvas） */
export const AnalysisPdfTemplate = forwardRef<HTMLDivElement, Props>(
  function AnalysisPdfTemplate({ record, videoIndex = null }, ref) {
    const data: PdfContent = buildPdfContent(record, videoIndex);

    const metaLine = [
      data.videoLabel,
      data.timeLabel,
      data.gradeLine,
      data.score != null ? `评分 ${data.score}/100` : null,
    ]
      .filter(Boolean)
      .join(" · ");

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
          width: PAGE_W,
          height: PAGE_H,
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
            padding: "22px 36px 18px",
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: 9,
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
              margin: "8px 0 0",
              fontSize: 36,
              fontWeight: 900,
              lineHeight: 1,
              letterSpacing: "-0.04em",
              color: C.ink,
            }}
          >
            CRUX<span style={{ marginLeft: 12, fontSize: 22 }}>抱石</span>
          </p>
          <p
            style={{
              margin: "4px 0 0",
              fontSize: 17,
              fontWeight: 900,
              letterSpacing: "0.2em",
              color: C.ink,
            }}
          >
            动作解析
          </p>
          {metaLine && (
            <p
              style={{
                margin: "12px 0 0",
                fontSize: 13,
                fontWeight: 800,
                color: C.ink,
                fontFamily: mono,
              }}
            >
              {metaLine}
            </p>
          )}
        </header>

        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "flex-start",
            padding: "18px 36px 14px",
            minHeight: 0,
            gap: 14,
          }}
        >
          {data.highlight && (
            <div
              style={{
                flexShrink: 0,
                borderLeft: `5px solid ${C.orange}`,
                backgroundColor: C.orangeTint,
                padding: "14px 16px 14px 18px",
              }}
            >
              <p
                style={{
                  margin: 0,
                  fontSize: 11,
                  fontWeight: 900,
                  letterSpacing: "0.12em",
                  color: C.orangeDeep,
                }}
              >
                教练金句
              </p>
              <p
                style={{
                  margin: "8px 0 0",
                  fontSize: 14,
                  fontWeight: 800,
                  lineHeight: 1.45,
                  color: C.text,
                }}
              >
                {data.highlight}
              </p>
            </div>
          )}

          {data.dimensions.length > 0 && (
            <section style={{ flexShrink: 0 }}>
              <PdfSectionHeading>核心维度</PdfSectionHeading>
              <ul
                style={{
                  margin: 0,
                  padding: "12px 14px",
                  listStyle: "none",
                  border: `2px solid ${C.ink}`,
                  backgroundColor: C.surface,
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                }}
              >
                {data.dimensions.map((d, i) => (
                  <li
                    key={i}
                    style={{
                      display: "flex",
                      gap: 8,
                      alignItems: "flex-start",
                    }}
                  >
                    <span
                      style={{
                        flexShrink: 0,
                        fontWeight: 900,
                        color: C.orange,
                        fontSize: 14,
                        lineHeight: 1.35,
                      }}
                    >
                      ▸
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {d.label ? (
                        <>
                          <p
                            style={{
                              margin: 0,
                              fontSize: 13,
                              fontWeight: 900,
                              lineHeight: 1.35,
                              color: C.text,
                            }}
                          >
                            {d.label}
                          </p>
                          <p
                            style={{
                              margin: "5px 0 0",
                              fontSize: 12,
                              fontWeight: 400,
                              lineHeight: 1.42,
                              color: C.muted,
                            }}
                          >
                            {d.text}
                          </p>
                        </>
                      ) : (
                        <p
                          style={{
                            margin: 0,
                            fontSize: 12,
                            fontWeight: 400,
                            lineHeight: 1.42,
                            color: C.text,
                          }}
                        >
                          {d.text}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {data.improvements.length > 0 && (
            <section style={{ flexShrink: 0 }}>
              <PdfSectionHeading>改进要点</PdfSectionHeading>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                }}
              >
                {data.improvements.map((item, i) => (
                  <div
                    key={i}
                    style={{
                      border: `2px solid ${C.ink}`,
                      borderLeft: `6px solid ${C.orange}`,
                      backgroundColor: C.surface,
                      padding: "12px 14px",
                    }}
                  >
                    <p
                      style={{
                        margin: 0,
                        fontSize: 13,
                        fontWeight: 900,
                        color: C.text,
                      }}
                    >
                      {item.title}
                    </p>
                    <p
                      style={{
                        margin: "6px 0 0",
                        fontSize: 12,
                        lineHeight: 1.42,
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

          {data.overall && (
            <div
              style={{
                flexShrink: 0,
                border: `2px solid ${C.ink}`,
                backgroundColor: C.surface,
                padding: "12px 14px",
              }}
            >
              <p
                style={{
                  margin: 0,
                  fontSize: 11,
                  fontWeight: 900,
                  color: C.orangeDeep,
                }}
              >
                整体建议
              </p>
              <p
                style={{
                  margin: "6px 0 0",
                  fontSize: 12,
                  lineHeight: 1.42,
                  color: C.text,
                }}
              >
                {data.overall}
              </p>
            </div>
          )}

          <div style={{ flexShrink: 0, marginTop: "auto", paddingTop: 4 }}>
            <p
              style={{
                margin: 0,
                textAlign: "center",
                fontSize: 9,
                letterSpacing: "0.08em",
                color: C.faint,
              }}
            >
              {PDF_SITE_URL.replace(/^https?:\/\//, "")}
            </p>
            <p
              style={{
                margin: "3px 0 0",
                textAlign: "center",
                fontSize: 8,
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
