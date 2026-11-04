import { useCallback, useEffect, useState } from "react";
import { CruxHeader } from "@/components/crux-header";
import { IconInfo, IconLoader } from "@ui/icons";
import { useUiLocale } from "@lib/use-ui-locale";
import type { AppInfo, ProviderSettings, SettingsSnapshot } from "@shared/ipc";
import { PROVIDERS, type AnalysisProvider } from "@shared/providers";

export function SettingsPage() {
  const [uiLocale] = useUiLocale();
  const zh = uiLocale === "zh";
  const t = (zhText: string, enText: string) => (zh ? zhText : enText);

  const [snapshot, setSnapshot] = useState<SettingsSnapshot | null>(null);
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [modelInput, setModelInput] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState<"key" | "model" | "provider" | null>(null);

  const provider: AnalysisProvider = snapshot?.provider ?? "deepseek";
  const active: ProviderSettings | undefined = snapshot?.providers[provider];

  const applySnapshot = useCallback((next: SettingsSnapshot) => {
    setSnapshot(next);
    setModelInput(next.providers[next.provider].model);
  }, []);

  useEffect(() => {
    void (async () => {
      applySnapshot(await window.crux.settings.get());
      setInfo(await window.crux.app.info());
    })();
  }, [applySnapshot]);

  async function switchProvider(next: AnalysisProvider) {
    if (next === provider) return;
    setSaving("provider");
    setStatus(null);
    setApiKeyInput("");
    try {
      applySnapshot(await window.crux.settings.setProvider(next));
    } finally {
      setSaving(null);
    }
  }

  async function saveApiKey() {
    setSaving("key");
    setStatus(null);
    try {
      const next = await window.crux.settings.setApiKey(provider, apiKeyInput);
      applySnapshot(next);
      setApiKeyInput("");
      setStatus(
        next.providers[provider].hasApiKey
          ? t("API Key 已保存。", "API key saved.")
          : t("API Key 已清空。", "API key cleared.")
      );
    } catch (err) {
      setStatus(err instanceof Error ? err.message : t("保存失败", "Save failed"));
    } finally {
      setSaving(null);
    }
  }

  async function clearApiKey() {
    setSaving("key");
    setStatus(null);
    setApiKeyInput("");
    try {
      applySnapshot(await window.crux.settings.setApiKey(provider, ""));
      setStatus(t("API Key 已清空。", "API key cleared."));
    } finally {
      setSaving(null);
    }
  }

  async function saveModel() {
    setSaving("model");
    setStatus(null);
    try {
      applySnapshot(await window.crux.settings.setModel(provider, modelInput));
      setStatus(t("模型已保存。", "Model saved."));
    } catch (err) {
      setStatus(err instanceof Error ? err.message : t("保存失败", "Save failed"));
    } finally {
      setSaving(null);
    }
  }

  const masked = active?.maskedApiKey ?? "";

  return (
    <main className="crux-page">
      <CruxHeader />

      <div className="shell-narrow">
        <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3 border-b-2 border-[var(--crux-border)] pb-6">
          <div>
            <h1 className="h1">{t("设置", "Settings")}</h1>
            <p className="lede">
              {t(
                "填写 DeepSeek 密钥，密钥只保存在本机。",
                "Store your DeepSeek key locally; it never leaves this machine."
              )}
            </p>
          </div>
          {info && (
            <span className="mono border-2 border-[var(--crux-border-subtle)] px-2 py-1">
              v{info.version}
            </span>
          )}
        </header>

        {!snapshot || !active ? (
          <p className="mono mt-8 flex items-center gap-2">
            <IconLoader className="h-4 w-4" />
            {t("加载中…", "Loading…")}
          </p>
        ) : (
          <div className="mt-8 flex flex-col gap-7">
            <section>
              <h2 className="h2 mb-3">{t("分析引擎", "Engine")}</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {PROVIDERS.map((candidate) => {
                  const item = snapshot.providers[candidate];
                  const selected = candidate === provider;
                  return (
                    <button
                      key={candidate}
                      type="button"
                      onClick={() => void switchProvider(candidate)}
                      disabled={saving === "provider"}
                      data-testid={`provider-${candidate}`}
                      aria-pressed={selected}
                      className={`relative flex flex-col border-2 border-[var(--crux-border)] p-4 pr-4 text-left transition ${
                        selected
                          ? "bg-[var(--crux-surface)] shadow-[4px_4px_0_var(--crux-border)]"
                          : "border-[var(--crux-border-subtle)] bg-transparent hover:border-[var(--crux-border)]"
                      }`}
                    >
                      <span
                        className="absolute left-0 top-0 h-full w-1.5"
                        style={{
                          background: item.hasApiKey
                            ? "var(--tape-green)"
                            : "var(--crux-border-subtle)",
                        }}
                        aria-hidden
                      />
                      <span className="flex items-center justify-between gap-2 pl-2">
                        <span className="text-sm font-black text-[var(--crux-text)]">
                          {item.label}
                        </span>
                        <span className="mono">
                          {item.hasApiKey
                            ? t("已配置", "Ready")
                            : t("未配置", "No key")}
                        </span>
                      </span>
                      <span className="mt-2 block pl-2 text-[11px] leading-snug text-[var(--crux-text-muted)]">
                        {t(
                          "官方 API 仅支持图像，客户端会先抽取 16 张关键帧",
                          "Image-only API; the app samples 16 key frames first"
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="panel-flat">
              <div className="panel-head">
                <span className="t">
                  {active.label} · {t("API Key", "API key")}
                </span>
                <span
                  className="mono"
                  data-testid="api-key-status"
                >
                  {active.hasApiKey
                    ? t("已配置 Key", "Key configured")
                    : t("未配置 Key", "No key configured")}
                </span>
              </div>
              <div className="panel-body">
                <p className="text-xs leading-relaxed text-[var(--crux-text-muted)]">
                  {active.fromEnv
                    ? t(
                        "当前使用环境变量中的 Key（优先级高于此处设置）。",
                        "Currently using an environment variable key (takes precedence)."
                      )
                    : t(
                        "只有保存在本机 userData 目录里的这一个 Key，不会上传到任何服务器。",
                        "Stored only in this machine's userData folder; never uploaded anywhere."
                      )}
                </p>

                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                  <input
                    type="password"
                    value={apiKeyInput}
                    onChange={(e) => setApiKeyInput(e.target.value)}
                    placeholder={
                      masked ? t(`当前：${masked}`, `Current: ${masked}`) : "sk-..."
                    }
                    className="input flex-1 font-normal"
                    data-testid="api-key-input"
                  />
                  <button
                    type="button"
                    onClick={() => void saveApiKey()}
                    disabled={saving === "key" || apiKeyInput.trim().length === 0}
                    className="btn btn--primary"
                    data-testid="save-api-key"
                  >
                    {saving === "key"
                      ? t("保存中…", "Saving…")
                      : t("保存", "Save")}
                  </button>
                  <button
                    type="button"
                    onClick={() => void clearApiKey()}
                    disabled={saving === "key" || !active.hasApiKey}
                    className="btn"
                    data-testid="clear-api-key"
                  >
                    {t("清除", "Clear")}
                  </button>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-4">
                  <button
                    type="button"
                    onClick={() => void window.crux.app.openExternal(active.homepage)}
                    className="text-xs font-bold underline decoration-[var(--crux-accent)] decoration-2 underline-offset-4"
                  >
                    {t(
                      `前往 ${active.label} 获取 Key`,
                      `Get a key from ${active.label}`
                    )}
                  </button>
                </div>
              </div>
            </section>

            <section className="panel-flat">
              <div className="panel-head">
                <span className="t">{t("分析模型", "Model")}</span>
                <span className="s">{active.defaultModel}</span>
              </div>
              <div className="panel-body">
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    type="text"
                    value={modelInput}
                    onChange={(e) => setModelInput(e.target.value)}
                    placeholder={active.defaultModel}
                    className="input flex-1 font-normal"
                    data-testid="model-input"
                  />
                  <button
                    type="button"
                    onClick={() => void saveModel()}
                    disabled={saving === "model"}
                    className="btn"
                  >
                    {saving === "model"
                      ? t("保存中…", "Saving…")
                      : t("保存", "Save")}
                  </button>
                </div>
                <p className="field-hint">
                  {t(
                    `默认 ${active.defaultModel}，接口地址 https://api.deepseek.com（OpenAI 兼容）。`,
                    `Default ${active.defaultModel}, endpoint https://api.deepseek.com (OpenAI-compatible).`
                  )}
                </p>
              </div>
            </section>

            {status && (
              <p role="status" className="note-box">
                {status}
              </p>
            )}

            {info && (
              <section className="panel-flat">
                <div className="panel-head">
                  <span className="t">
                    {t("关于本机", "About")}
                  </span>
                  <span className="s">
                    <IconInfo className="h-3.5 w-3.5" />
                  </span>
                </div>
                <div className="panel-body">
                  <dl className="m-0 grid gap-x-8 gap-y-2 text-xs sm:grid-cols-2">
                    <div>
                      <dt className="mono">{t("版本", "Version")}</dt>
                      <dd className="m-0 font-bold num">{info.version}</dd>
                    </div>
                    <div>
                      <dt className="mono">Electron / Chromium</dt>
                      <dd className="m-0 font-bold num">
                        {info.electron} / {info.chrome}
                      </dd>
                    </div>
                    <div>
                      <dt className="mono">Node</dt>
                      <dd className="m-0 font-bold num">{info.node}</dd>
                    </div>
                    <div className="min-w-0 sm:col-span-2">
                      <dt className="mono">{t("数据目录", "Data folder")}</dt>
                      <dd className="m-0 break-all font-bold">
                        {info.userDataPath}
                      </dd>
                    </div>
                  </dl>
                  <button
                    type="button"
                    onClick={() =>
                      void window.crux.files.openPath(info.userDataPath)
                    }
                    className="btn btn--sm mt-4"
                  >
                    {t("在文件管理器中打开", "Open in file manager")}
                  </button>
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
