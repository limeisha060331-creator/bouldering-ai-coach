"use client";

import { useRef, useState } from "react";

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

    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, "#0c0d10");
    grad.addColorStop(0.4, "#1a1510");
    grad.addColorStop(1, "#0a0a0c");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = "rgba(249, 115, 22, 0.15)";
    for (let i = 0; i < 12; i++) {
      ctx.beginPath();
      ctx.moveTo(0, i * 100);
      ctx.lineTo(w, i * 100 + 40);
      ctx.stroke();
    }

    ctx.fillStyle = "#f97316";
    ctx.font = "bold 28px system-ui, sans-serif";
    ctx.fillText("🧗 AI 抱石分析教练", 48, 80);

    ctx.fillStyle = "#a1a1aa";
    ctx.font = "20px system-ui, sans-serif";
    ctx.fillText(fileName || "我的攀爬片段", 48, 120);

    if (score != null) {
      ctx.fillStyle = "rgba(249, 115, 22, 0.2)";
      ctx.beginPath();
      ctx.arc(w / 2, 320, 100, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fb923c";
      ctx.font = "bold 72px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(String(score), w / 2, 340);
      ctx.font = "24px system-ui, sans-serif";
      ctx.fillStyle = "#71717a";
      ctx.fillText("/ 100", w / 2, 380);
      ctx.textAlign = "left";
    }

    ctx.fillStyle = "#e4e4e7";
    ctx.font = "bold 26px system-ui, sans-serif";
    ctx.fillText("教练金句", 48, 480);

    const quote = highlight || "每一次发力，都是向顶点的致敬。";
    ctx.fillStyle = "#d4d4d8";
    ctx.font = "italic 32px system-ui, sans-serif";
    wrapText(ctx, `「${quote}」`, 48, 530, w - 96, 44);

    ctx.fillStyle = "#52525b";
    ctx.font = "20px system-ui, sans-serif";
    ctx.fillText("扫码或搜索 · AI 抱石分析教练", 48, h - 60);

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
        className="rounded-xl border border-orange-500/40 bg-orange-500/10 px-5 py-2.5 text-sm font-semibold text-orange-300 transition hover:bg-orange-500/20 disabled:opacity-50"
      >
        {sharing ? "生成中…" : "分享给岩友"}
      </button>
    </>
  );
}
