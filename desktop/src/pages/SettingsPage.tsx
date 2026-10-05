import { useCallback, useEffect, useState } from "react";
import { SiteNav } from "@/components/site-nav";
import { IconInfo, IconLoader, IconSettings } from "@/components/icons";
import { useUiLocale } from "@/lib/use-ui-locale";
import type { AppInfo, SettingsSnapshot } from "@shared/ipc";

export function SettingsPage() {
  const [uiLocale] = useUiLocale();
  const zh = uiLocale === "zh";
  const t = (zhText: string, enText: string) => (zh ? zhText : enText);

  const [snapshot, setSnapshot] = useState<SettingsSnapshot | null>(null);
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [modelInput, setModelInput] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState<"key" | "model" | null>(null);

  const refresh = useCallback(async () => {
    const next = await window.crux.settings.get();
    setSnapshot(next);
    setModelInput(next.model);
  }, []);

  useEffect(() => {
    void (async () => {
      await refresh();
      setInfo(await window.crux.app.info());
    })();
  }, [refresh]);

  async function saveApiKey() {
    setSaving("key");
    setStatus(null);
    try {
      const next = await window.crux.settings.setApiKey(apiKeyInput);
      setSnapshot(next);
      setApiKeyInput("");
      setStatus(
        next.hasApiKey
          ? t("API Key 已保存。", "API key saved.")
          : t("API Key 已清空。", "API key cleared.")
      );
    } catch (err) {
      setStatus(err instanceof Error ? err.message : t("保存失败", "Save failed"));
    } finally {
      setSaving(null);
    }
  }

  async function saveModel() {
    setSaving("model");
    setStatus(null);
    try {
      setSnapshot(await window.crux.settings.setModel(modelInput));
      setStatus(t("模型已保存。", "Model saved."));
    } catch (err) {
      setStatus(err instanceof Error ? err.message : t("保存失败", "Save failed"));
    } finally {
      setSaving(null);
    }
  }

  const masked = snapshot?.maskedApiKey ?? "";

  return (
    <main className="crux-page">
      <div className="crux-container-narrow">
        <SiteNav uiLocale={uiLocale} />

        <header className="mb-8 flex items-center gap-3 border-2 border-[var(--crux-border)] border-l-[6px] border-l-[var(--crux-accent)] bg-[var(--crux-surface)] p-6 shadow-[4px_4px_0_var(--crux-border)]">
          <IconSettings className="h-5 w-5 text-[var(--crux-accent)]" />
          <div>
            <h1 className="text-xl font-black uppercase tracking-tight text-[var(--crux-text)] sm:text-2xl">
              {t("设置", "Settings")}
            </h1>
            <p className="mt-1 text-xs text-[var(--crux-text-muted)]">
              {t(
                "桌面端直接调用 Gemini，密钥只保存在本机。",
                "The desktop app calls Gemini directly; your key stays on this machine."
              )}
            </p>
          </div>
        </header>

        {!snapshot ? (
          <p className="flex items-center gap-2 text-sm text-[var(--crux-text-muted)]">
            <IconLoader className="h-4 w-4" />
            {t("加载中…", "Loading…")}
          </p>
        ) : (
          <div className="flex flex-col gap-6">
            <section className="spa-panel p-6">
              <h2 className="spa-label mb-3">
                {t("Gemini API Key", "Gemini API key")}
              </h2>
              <p className="text-xs leading-relaxed text-[var(--crux-text-muted)]">
                {snapshot.fromEnv
                  ? t(
                      "当前使用环境变量 GEMINI_API_KEY（优先级高于此处设置）。",
                      "Currently using the GEMINI_API_KEY environment variable (takes precedence)."
                    )
                  : t(
                      "在 Google AI Studio 免费申请后粘贴到这里，仅保存在本机 userData 目录。",
                      "Get a free key from Google AI Studio and paste it here. It is stored only in this machine's userData folder."
                    )}
              </p>

              <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                <input
                  type="password"
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  placeholder={
                    masked
                      ? t(`当前：${masked}`, `Current: ${masked}`)
                      : "AIza..."
                  }
                  className="spa-input flex-1 px-3 py-2"
                  data-testid="api-key-input"
                />
                <button
                  type="button"
                  onClick={() => void saveApiKey()}
                  disabled={saving === "key" || apiKeyInput.trim().length === 0}
                  className="border-2 border-[var(--crux-border)] bg-[var(--crux-accent)] px-5 py-2 text-sm font-bold text-[var(--crux-on-accent)] shadow-[3px_3px_0_var(--crux-border)] transition disabled:opacity-40"
                  data-testid="save-api-key"
                >
                  {saving === "key" ? t("保存中…", "Saving…") : t("保存", "Save")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setApiKeyInput("");
                    setSaving("key");
                    void window.crux.settings
                      .setApiKey("")
                      .then((next) => {
                        setSnapshot(next);
                        setStatus(t("API Key 已清空。", "API key cleared."));
                      })
                      .finally(() => setSaving(null));
                  }}
                  disabled={saving === "key" || !snapshot.hasApiKey}
                  className="border-2 border-[var(--crux-border-subtle)] bg-[var(--crux-surface)] px-5 py-2 text-sm font-bold text-[var(--crux-text)] transition hover:border-[var(--crux-accent)] disabled:opacity-40"
                  data-testid="clear-api-key"
                >
                  {t("清除", "Clear")}
                </button>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-4">
                <span
                  className={`crux-mono text-[11px] font-bold ${
                    snapshot.hasApiKey
                      ? "text-[var(--crux-accent)]"
                      : "text-[var(--crux-text-muted)]"
                  }`}
                  data-testid="api-key-status"
                >
                  {snapshot.hasApiKey
                    ? t("已配置 Key", "Key configured")
                    : t("未配置 Key", "No key configured")}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    void window.crux.app.openExternal(
                      "https://aistudio.google.com/apikey"
                    )
                  }
                  className="crux-mono text-[11px] font-bold text-[var(--crux-accent)] underline underline-offset-4"
                >
                  {t("前往 Google AI Studio 获取 Key", "Get a key from Google AI Studio")}
                </button>
              </div>
            </section>

            <section className="spa-panel p-6">
              <h2 className="spa-label mb-3">{t("分析模型", "Model")}</h2>
              <div className="flex flex-col gap-3 sm:flex-row">
                <input
                  type="text"
                  value={modelInput}
                  onChange={(e) => setModelInput(e.target.value)}
                  placeholder={snapshot.defaultModel}
                  className="spa-input flex-1 px-3 py-2"
                  data-testid="model-input"
                />
                <button
                  type="button"
                  onClick={() => void saveModel()}
                  disabled={saving === "model"}
                  className="border-2 border-[var(--crux-border)] bg-[var(--crux-surface)] px-5 py-2 text-sm font-bold text-[var(--crux-text)] shadow-[3px_3px_0_var(--crux-border)] transition disabled:opacity-40"
                >
                  {saving === "model"
                    ? t("保存中…", "Saving…")
                    : t("保存", "Save")}
                </button>
              </div>
              <p className="mt-3 text-xs text-[var(--crux-text-muted)]">
                {t(
                  `默认 ${snapshot.defaultModel}（免费额度通常只对该模型开放）。`,
                  `Default ${snapshot.defaultModel} (the free tier usually only covers this model).`
                )}
              </p>
            </section>

            {status && (
              <p
                role="status"
                className="border-2 border-[var(--crux-border-subtle)] bg-[var(--crux-elevated)] px-4 py-3 text-sm text-[var(--crux-text-secondary)]"
              >
                {status}
              </p>
            )}

            {info && (
              <section className="spa-panel p-6">
                <div className="mb-3 flex items-center gap-2">
                  <IconInfo className="h-4 w-4 text-[var(--crux-accent)]" />
                  <h2 className="spa-label">{t("关于本机", "About")}</h2>
                </div>
                <dl className="grid gap-2 text-xs text-[var(--crux-text-muted)] sm:grid-cols-2">
                  <div>
                    <dt className="font-bold">{t("版本", "Version")}</dt>
                    <dd>{info.version}</dd>
                  </div>
                  <div>
                    <dt className="font-bold">Electron / Chromium</dt>
                    <dd>
                      {info.electron} / {info.chrome}
                    </dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="font-bold">Node</dt>
                    <dd>{info.node}</dd>
                  </div>
                  <div className="sm:col-span-2 min-w-0">
                    <dt className="font-bold">
                      {t("数据目录", "Data folder")}
                    </dt>
                    <dd className="break-all">{info.userDataPath}</dd>
                  </div>
                </dl>
                <button
                  type="button"
                  onClick={() => void window.crux.files.openPath(info.userDataPath)}
                  className="mt-4 border-2 border-[var(--crux-border-subtle)] px-4 py-2 text-xs font-bold text-[var(--crux-text)] transition hover:border-[var(--crux-accent)]"
                >
                  {t("在文件管理器中打开", "Open in file manager")}
                </button>
              </section>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
