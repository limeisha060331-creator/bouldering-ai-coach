/** html2canvas 无法解析 oklab/oklch，导出前剥离 class 并尽量写成 rgb */

const COLOR_PROPS = [
  "color",
  "backgroundColor",
  "borderColor",
  "borderTopColor",
  "borderRightColor",
  "borderBottomColor",
  "borderLeftColor",
  "outlineColor",
] as const;

function usesUnsupportedColor(value: string): boolean {
  return /oklab|oklch|lab\(|lch\(|color-mix/i.test(value);
}

function rgbFromComputed(value: string): string | null {
  if (!value || value === "transparent" || value === "none") return null;
  if (usesUnsupportedColor(value)) return null;
  if (/^rgba?\(/i.test(value)) return value;
  return null;
}

/** 在 html2canvas onclone 里对 PDF 根节点调用 */
export function sanitizePdfClone(root: HTMLElement, doc: Document): void {
  const win = doc.defaultView;
  if (!win) return;

  /* 克隆文档仍带 Tailwind 全局表，内含 oklab，会导致 html2canvas 抛错 */
  doc.querySelectorAll('link[rel="stylesheet"]').forEach((n) => n.remove());
  doc.querySelectorAll("style").forEach((n) => n.remove());

  root.querySelectorAll<HTMLElement>("*").forEach((el) => {
    el.removeAttribute("class");
    el.style.boxShadow = "none";
    el.style.textShadow = "none";
  });
  root.removeAttribute("class");

  const all = [root, ...root.querySelectorAll<HTMLElement>("*")];
  for (const el of all) {
    const computed = win.getComputedStyle(el);
    for (const prop of COLOR_PROPS) {
      const raw = computed[prop];
      const safe = rgbFromComputed(raw);
      if (safe) {
        el.style[prop] = safe;
      } else if (raw && usesUnsupportedColor(raw)) {
        if (prop === "color") el.style.color = "#0a0a0a";
        else if (prop === "backgroundColor") {
          el.style.backgroundColor =
            el === root ? "#f5f3ef" : "transparent";
        }
      }
    }
    const bw = computed.borderTopWidth;
    if (bw && bw !== "0px" && !el.style.borderWidth) {
      el.style.borderStyle = computed.borderTopStyle || "solid";
      el.style.borderWidth = bw;
      const bc = rgbFromComputed(computed.borderTopColor);
      el.style.borderColor = bc ?? "#1a1917";
    }
  }
}
