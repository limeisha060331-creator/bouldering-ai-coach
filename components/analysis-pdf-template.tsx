"use client";

import { forwardRef, type ReactNode } from "react";
import type { AnalysisRecord } from "@/lib/types";
import {
  PDF_SITE_URL,
  buildPdfContent,
  type PdfContent,
} from "@/lib/pdf-content";

/** html2canvas 不支持 Tailwind v4 的 oklab，PDF 仅用 hex 内联样式 */
const C = {
  bg: "#f5f3ef",
  surface: "#ffffff",
  text: "#0a0a0a",
  muted: "#3d3a36",
  faint: "#9a948c",
  faint2: "#b5afa6",
  orange: "#ff5c1a",
  orangeBg: "#fff0e8",
  black: "#0a0a0a",
  white: "#ffffff",
  whiteSoft: "#e8e8e8",
} as const;

const mono = 'ui-monospace, "Consolas", "Menlo", monospace';
const sans = '"PingFang SC", "Microsoft YaHei", system-ui, sans-serif';

type Props = {
  record: AnalysisRecord;
  videoIndex?: number | null;
};

function PdfSectionHeading({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "stretch" }}>
      <div style={{ width: 6, flexShrink: 0, backgroundColor: C.orange }} />
      <h2
        style={{
          margin: 0,
          padding: "8px 16px",
          backgroundColor: C.black,
          color: C.orange,
          fontSize: 15,
          fontWeight: 900,
          letterSpacing: "0.06em",
        }}
      >
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
        data-pdf-safe-colors
        aria-hidden
        style={{
          pointerEvents: "none",
          position: "fixed",
          left: 0,
          top: 0,
          zIndex: -1,
          width: "210mm",
          opacity: 0,
          maxHeight: "297mm",
          backgroundColor: C.bg,
          color: C.text,
          fontFamily: sans,
          boxSizing: "border-box",
        }}
      >
        <header
          style={{
            borderBottom: `2px solid ${C.black}`,
            backgroundColor: C.orange,
            padding: "24px 32px",
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: "0.32em",
              color: C.text,
              fontFamily: mono,
            }}
          >
            BOULDERING · AI
          </p>
          <div
            style={{
              marginTop: 12,
              display: "flex",
              alignItems: "flex-end",
              justifyContent: "space-between",
              gap: 16,
            }}
          >
            <div>
              <p
                style={{
                  margin: 0,
                  fontSize: 38,
                  fontWeight: 900,
                  lineHeight: 1,
                  letterSpacing: "-0.05em",
                  color: C.text,
                }}
              >
                CRUX
                <span style={{ marginLeft: 12, fontSize: 22 }}>抱石</span>
              </p>
              <p
                style={{
                  margin: "4px 0 0",
                  fontSize: 18,
                  fontWeight: 900,
                  letterSpacing: "0.2em",
                  color: C.text,
                }}
              >
                动作解析
              </p>
            </div>
            <p
              style={{
                margin: 0,
                flexShrink: 0,
                border: `2px solid ${C.black}`,
                backgroundColor: C.black,
                color: C.orange,
                padding: "4px 12px",
                fontSize: 10,
                fontWeight: 900,
                fontFamily: mono,
              }}
            >
              教练报告
            </p>
          </div>
        </header>

        <div style={{ padding: "20px 32px" }}>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: "8px 16px",
              border: `2px solid ${C.black}`,
              backgroundColor: C.black,
              padding: "10px 16px",
              color: C.white,
            }}
          >
            <span
              style={{ fontSize: 14, fontWeight: 900, color: C.orange }}
            >
              {data.videoLabel}
            </span>
            <span style={{ fontSize: 11, fontWeight: 500, color: C.whiteSoft }}>
              {data.timeLabel}
            </span>
            {data.gradeLine && (
              <span style={{ fontSize: 11, fontWeight: 700, color: C.white }}>
                {data.gradeLine}
              </span>
            )}
            {data.score != null && (
              <span
                style={{
                  marginLeft: "auto",
                  fontSize: 14,
                  fontWeight: 900,
                  color: C.orange,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {data.score}
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: C.whiteSoft,
                  }}
                >
                  {" "}
                  / 100
                </span>
              </span>
            )}
          </div>

          {data.highlight && (
            <div
              style={{
                marginTop: 20,
                borderLeft: `4px solid ${C.orange}`,
                backgroundColor: C.orangeBg,
                padding: "12px 12px 12px 16px",
              }}
            >
              <p
                style={{
                  margin: 0,
                  fontSize: 10,
                  fontWeight: 900,
                  letterSpacing: "0.08em",
                  color: C.orange,
                }}
              >
                教练金句
              </p>
              <p
                style={{
                  margin: "6px 0 0",
                  fontSize: 13,
                  fontWeight: 900,
                  lineHeight: 1.35,
                  color: C.text,
                }}
              >
                {data.highlight}
              </p>
            </div>
          )}

          {data.dimensions.length > 0 && (
            <section style={{ marginTop: 20 }}>
              <PdfSectionHeading>核心维度</PdfSectionHeading>
              <ul
                style={{
                  margin: "12px 0 0",
                  padding: 12,
                  listStyle: "none",
                  border: `2px solid ${C.black}`,
                  backgroundColor: C.surface,
                }}
              >
                {data.dimensions.map((d, i) => (
                  <li
                    key={i}
                    style={{
                      display: "flex",
                      gap: 8,
                      fontSize: 12,
                      lineHeight: 1.35,
                      color: C.text,
                      marginTop: i > 0 ? 8 : 0,
                    }}
                  >
                    <span
                      style={{ flexShrink: 0, fontWeight: 900, color: C.orange }}
                    >
                      ▸
                    </span>
                    <span>
                      {d.label ? (
                        <>
                          <span style={{ fontWeight: 900 }}>{d.label}</span>
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
            <section style={{ marginTop: 20 }}>
              <PdfSectionHeading>改进要点</PdfSectionHeading>
              <div style={{ marginTop: 12 }}>
                {data.improvements.map((item, i) => (
                  <div
                    key={i}
                    style={{
                      marginTop: i > 0 ? 8 : 0,
                      border: `2px solid ${C.black}`,
                      borderLeft: `6px solid ${C.orange}`,
                      backgroundColor: C.surface,
                      padding: "10px 12px",
                    }}
                  >
                    <p
                      style={{
                        margin: 0,
                        fontSize: 12,
                        fontWeight: 900,
                        color: C.text,
                      }}
                    >
                      {item.title}
                    </p>
                    <p
                      style={{
                        margin: "4px 0 0",
                        fontSize: 11,
                        lineHeight: 1.35,
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

          <p
            style={{
              margin: "24px 0 0",
              textAlign: "center",
              fontSize: 9,
              letterSpacing: "0.04em",
              color: C.faint,
            }}
          >
            {PDF_SITE_URL.replace(/^https?:\/\//, "")}
          </p>
          <p
            style={{
              margin: "2px 0 0",
              textAlign: "center",
              fontSize: 8,
              color: C.faint2,
            }}
          >
            仅供训练参考 · CRUX 抱石 AI 教练
          </p>
        </div>
      </div>
    );
  }
);
