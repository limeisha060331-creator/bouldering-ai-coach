"use client";

import { useEffect, useRef, useState } from "react";

export default function Home() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  function selectFile(selected: File | undefined) {
    setAnalysis(null);
    setError(null);

    if (!selected) {
      setFile(null);
      if (preview) URL.revokeObjectURL(preview);
      setPreview(null);
      return;
    }

    if (!selected.type.startsWith("video/")) {
      setError("请选择视频文件（如 mp4、webm、mov）");
      setFile(null);
      if (preview) URL.revokeObjectURL(preview);
      setPreview(null);
      return;
    }

    setFile(selected);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(URL.createObjectURL(selected));
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    selectFile(e.target.files?.[0]);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    selectFile(e.dataTransfer.files?.[0]);
  }

  async function handleAnalyze() {
    if (!file) {
      setError("请先选择视频");
      return;
    }

    setLoading(true);
    setError(null);
    setAnalysis(null);

    const formData = new FormData();
    formData.append("video", file);

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "分析失败");
      }

      setAnalysis(data.analysis);
    } catch (e) {
      setError(e instanceof Error ? e.message : "请求失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-orange-950 text-slate-100">
      <div className="mx-auto max-w-3xl px-4 py-12 sm:py-16">
        <header className="mb-10 text-center">
          <p className="mb-2 text-sm font-medium uppercase tracking-widest text-orange-400">
            Bouldering · AI Coach
          </p>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            AI 抱石分析教练
          </h1>
          <p className="mt-3 text-slate-400">
            上传一段攀爬视频，获取动作分析与改进建议
          </p>
        </header>

        <section className="rounded-2xl border border-slate-700/80 bg-slate-900/60 p-6 shadow-xl backdrop-blur">
          <label
            htmlFor="video-upload"
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            className={`flex min-h-[180px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-8 transition ${
              dragOver
                ? "border-orange-400 bg-orange-500/10"
                : "border-slate-600 bg-slate-800/40 hover:border-orange-500/60 hover:bg-slate-800/70"
            }`}
          >
            <span className="text-4xl" aria-hidden>
              🎬
            </span>
            <span className="mt-3 font-medium">点击或拖拽上传视频</span>
            <span className="mt-1 text-sm text-slate-500">
              仅支持 video/*（mp4、webm、mov 等，建议 20MB 以内）
            </span>
            {file && (
              <span className="mt-2 text-sm text-orange-300">{file.name}</span>
            )}
          </label>
          <input
            id="video-upload"
            ref={inputRef}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={handleFileChange}
          />

          {preview && (
            <video
              src={preview}
              controls
              className="mt-4 w-full rounded-lg border border-slate-700"
            />
          )}

          <button
            type="button"
            onClick={handleAnalyze}
            disabled={loading || !file}
            className="mt-6 w-full rounded-xl bg-orange-500 px-4 py-3 font-semibold text-white transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "分析中，请稍候…" : "上传并分析"}
          </button>

          {error && (
            <p
              role="alert"
              className="mt-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300"
            >
              {error}
            </p>
          )}
        </section>

        {(analysis || loading) && (
          <article className="mt-8 rounded-2xl border border-orange-500/30 bg-gradient-to-br from-slate-900 to-slate-800 p-6 shadow-lg ring-1 ring-orange-500/10">
            <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-orange-300">
              <span aria-hidden>🧗</span> AI 分析结论
            </h2>
            {loading ? (
              <div className="space-y-2">
                <div className="h-4 w-3/4 animate-pulse rounded bg-slate-700" />
                <div className="h-4 w-full animate-pulse rounded bg-slate-700" />
                <div className="h-4 w-5/6 animate-pulse rounded bg-slate-700" />
                <p className="pt-2 text-sm text-slate-400">
                  教练正在观看你的视频…
                </p>
              </div>
            ) : (
              <div className="whitespace-pre-wrap leading-relaxed text-slate-200">
                {analysis}
              </div>
            )}
          </article>
        )}
      </div>
    </main>
  );
}
