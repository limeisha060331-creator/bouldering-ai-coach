import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { sanitizePdfClone } from "./pdf-html2canvas-fix";

/** 单张 canvas 最长边上限，避免浏览器/移动端内存溢出 */
const MAX_CANVAS_EDGE = 11_000;

function safeFileName(name: string): string {
  return name.replace(/[^\w\u4e00-\u9fa5.-]+/g, "_").slice(0, 48) || "analysis";
}

function pickCaptureScale(width: number, height: number): number {
  const maxEdge = Math.max(width, height);
  for (const scale of [2, 1.5, 1.25, 1]) {
    if (maxEdge * scale <= MAX_CANVAS_EDGE) return scale;
  }
  return 1;
}

/** 导出前把模板移入视口；html2canvas 对屏幕外节点常渲染失败 */
function pinElementForCapture(el: HTMLElement): () => void {
  const prev = {
    position: el.style.position,
    left: el.style.left,
    top: el.style.top,
    opacity: el.style.opacity,
    visibility: el.style.visibility,
    zIndex: el.style.zIndex,
    pointerEvents: el.style.pointerEvents,
  };

  el.style.position = "fixed";
  el.style.left = "0";
  el.style.top = "0";
  el.style.opacity = "1";
  el.style.visibility = "visible";
  el.style.zIndex = "2147483646";
  el.style.pointerEvents = "none";

  return () => {
    el.style.position = prev.position;
    el.style.left = prev.left;
    el.style.top = prev.top;
    el.style.opacity = prev.opacity;
    el.style.visibility = prev.visibility;
    el.style.zIndex = prev.zIndex;
    el.style.pointerEvents = prev.pointerEvents;
  };
}

/** 将隐藏的 PDF 模板 DOM 导出为 A4 PDF */
export async function downloadAnalysisPdf(
  element: HTMLElement,
  fileName: string
): Promise<void> {
  const restorePosition = pinElementForCapture(element);

  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });

  const width = element.scrollWidth || element.offsetWidth;
  const height = element.scrollHeight || element.offsetHeight;
  if (width < 1 || height < 1) {
    restorePosition();
    throw new Error("PDF 模板尺寸异常，请刷新页面后重试");
  }

  const scale = pickCaptureScale(width, height);

  try {
    const canvas = await html2canvas(element, {
      scale,
      useCORS: true,
      allowTaint: true,
      backgroundColor: "#f4f0ea",
      logging: false,
      foreignObjectRendering: false,
      width,
      height,
      windowWidth: width,
      windowHeight: height,
      scrollX: 0,
      scrollY: 0,
      onclone: (doc) => {
        const root =
          doc.querySelector<HTMLElement>("[data-pdf-root]") ?? doc.body;
        sanitizePdfClone(root, doc);
      },
    });

    if (canvas.width < 1 || canvas.height < 1) {
      throw new Error("页面截图失败，请换用 Chrome/Edge 桌面浏览器重试");
    }

    let imgData: string;
    let format: "PNG" | "JPEG" = "PNG";
    try {
      imgData = canvas.toDataURL("image/png");
      if (!imgData.startsWith("data:image/png")) {
        throw new Error("png-fallback");
      }
    } catch {
      imgData = canvas.toDataURL("image/jpeg", 0.9);
      format = "JPEG";
    }

    const pdf = new jsPDF({ orientation: "p", unit: "mm", format: "a4" });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();

    /* 整张模板缩放到一页 A4，禁止分页 */
    let drawW = pageWidth;
    let drawH = (canvas.height * drawW) / canvas.width;
    if (drawH > pageHeight) {
      drawH = pageHeight;
      drawW = (canvas.width * drawH) / canvas.height;
    }
    const drawX = (pageWidth - drawW) / 2;

    pdf.addImage(imgData, format, drawX, 0, drawW, drawH);

    pdf.save(`${safeFileName(fileName)}-教练报告.pdf`);
  } finally {
    restorePosition();
  }
}

