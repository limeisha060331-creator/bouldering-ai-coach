"use client";

import { useRef, useState } from "react";
import { IconDownload, IconLoader } from "@/components/icons";

type Props = {
  score: number | null;
  highlight: string | null;
  fileName?: string;
  grade?: string | null;
};

const PAPER = "#ede8df";
const INK = "#17130f";
const MUTED = "#6f665a";
const ORANGE = "#f04a12";

export function ShareCardButton({ score, highlight, fileName, grade }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [sharing, setSharing] = useState(false);

  async function generateShareImage(): Promise<Blob> {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const w = 750;
    const h = 1200;
    canvas.width = w;
    canvas.height = h;

    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, w, h);

    // 2px 墨线边框，和页面同一套结构
    ctx.strokeStyle = INK;
    ctx.lineWidth = 4;
    ctx.strokeRect(32, 32, w - 64, h - 64);

    // 左上角胶带
    ctx.fillStyle = ORANGE;
    ctx.fillRect(62, 32, 14, 120);

    ctx.fillStyle = INK;
    ctx.font = "800 30px system-ui, sans-serif";
    ctx.fillText("CRUX 抱石", 100, 108);
    ctx.fillStyle = MUTED;
    ctx.font = "400 20px system-ui, sans-serif";
    ctx.fillText(fileName || "攀爬片段", 100, 146);

    if (grade) {
      ctx.fillStyle = INK;
      ctx.font = "900 120px system-ui, sans-serif";
      ctx.fillText(grade, 100, 316);
    }

    if (score != null) {
      ctx.fillStyle = INK;
      ctx.font = "900 96px system-ui, sans-serif";
      const baseY = grade ? 470 : 320;
      ctx.fillText(String(score), 100, baseY);
      const scoreWidth = ctx.measureText(String(score)).width;
      ctx.fillStyle = MUTED;
      ctx.font = "400 24px ui-monospace, monospace";
      ctx.fillText("/ 100", 100 + scoreWidth + 12, baseY);
    }

    ctx.strokeStyle = INK;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(100, 560);
    ctx.lineTo(w - 100, 560);
    ctx.stroke();

    const quote = highlight || "每一次发力，都是向顶点的致敬。";
    ctx.fillStyle = INK;
    ctx.font = "500 30px system-ui, sans-serif";
    wrapText(ctx, quote, 100, 630, w - 200, 48);

    ctx.fillStyle = MUTED;
    ctx.font = "400 20px ui-monospace, monospace";
    ctx.fillText("bouldering-ai-coach.vercel.app", 100, h - 88);

    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("生成失败"))),
        "image/png",
        0.92
      );
    });
  }

  function wrapText(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    maxWidth: number,
    lineHeight: number
  ) {
    const chars = text.split("");
    let line = "";
    let cy = y;
    for (const ch of chars) {
      const test = line + ch;
      if (ctx.measureText(test).width > maxWidth && line) {
        ctx.fillText(line, x, cy);
        line = ch;
        cy += lineHeight;
      } else {
        line = test;
      }
    }
    if (line) ctx.fillText(line, x, cy);
  }

  async function handleShare() {
    setSharing(true);
    try {
      const blob = await generateShareImage();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `抱石分析-${Date.now()}.png`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("生成分享图失败，请重试");
    } finally {
      setSharing(false);
    }
  }

  return (
    <>
      <canvas ref={canvasRef} className="hidden" aria-hidden />
      <button type="button" onClick={handleShare} disabled={sharing} className="btn">
        {sharing ? (
          <>
            <IconLoader className="h-4 w-4" />
            生成中
          </>
        ) : (
          <>
            <IconDownload className="h-4 w-4" />
            保存分享图
          </>
        )}
      </button>
    </>
  );
}
