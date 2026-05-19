"use client";

import { useRef, useState } from "react";
import { IconDownload, IconLoader } from "@/components/icons";

type Props = {
  score: number | null;
  highlight: string | null;
  fileName?: string;
};

export function ShareCardButton({ score, highlight, fileName }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [sharing, setSharing] = useState(false);

  async function generateShareImage(): Promise<Blob> {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const w = 750;
    const h = 1200;
    canvas.width = w;
    canvas.height = h;

    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, "#f6f4f0");
    grad.addColorStop(1, "#efede8");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = "rgba(26, 25, 23, 0.06)";
    ctx.lineWidth = 1;
    for (let y = 0; y < h; y += 48) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    ctx.fillStyle = "#1a1917";
    ctx.font = "500 26px system-ui, sans-serif";
    ctx.fillText("抱石分析 · AI Coach", 48, 88);

    ctx.fillStyle = "#8a857c";
    ctx.font = "20px system-ui, sans-serif";
    ctx.fillText(fileName || "攀爬片段", 48, 128);

    if (score != null) {
      ctx.strokeStyle = "#e8e4dc";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(w / 2, 320, 96, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "#1a1917";
      ctx.font = "300 72px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(String(score), w / 2, 340);
      ctx.font = "18px system-ui, sans-serif";
      ctx.fillStyle = "#8a857c";
      ctx.fillText("/ 100", w / 2, 378);
      ctx.textAlign = "left";
    }

    ctx.fillStyle = "#5c5852";
    ctx.font = "500 22px system-ui, sans-serif";
    ctx.fillText("教练金句", 48, 480);

    const quote = highlight || "每一次发力，都是向顶点的致敬。";
    ctx.fillStyle = "#1a1917";
    ctx.font = "28px system-ui, sans-serif";
    wrapText(ctx, quote, 48, 530, w - 96, 42);

    ctx.fillStyle = "#9c9890";
    ctx.font = "18px system-ui, sans-serif";
    ctx.fillText("bouldering-ai-coach.vercel.app", 48, h - 56);

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
      <button
        type="button"
        onClick={handleShare}
        disabled={sharing}
        className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-[var(--spa-border)] bg-[var(--spa-surface)] px-4 py-2.5 text-sm font-medium text-[var(--spa-text)] shadow-[var(--spa-shadow)] transition hover:bg-[var(--spa-elevated)] disabled:opacity-50"
      >
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
