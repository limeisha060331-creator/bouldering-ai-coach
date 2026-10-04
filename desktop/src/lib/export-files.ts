import type { SaveFileResult } from "@shared/ipc";

export function safeFileBase(name: string, fallback = "analysis"): string {
  const cleaned = name
    .replace(/\.[^.]+$/, "")
    .replace(/[^\w\u4e00-\u9fa5.-]+/g, "_")
    .slice(0, 60);
  return cleaned || fallback;
}

function assertSaved(result: SaveFileResult): SaveFileResult {
  if (!result.saved && result.error) {
    throw new Error(result.error);
  }
  return result;
}

/** 通过系统「另存为」对话框导出文本（Markdown 等） */
export async function saveTextDocument(
  defaultFileName: string,
  content: string,
  mimeType = "text/plain;charset=utf-8"
): Promise<SaveFileResult> {
  const result = await window.crux.files.saveText({
    defaultFileName,
    content,
    mimeType,
  });
  return assertSaved(result);
}

/** 通过系统「另存为」对话框导出二进制（PDF） */
export async function saveBinaryDocument(
  defaultFileName: string,
  data: Uint8Array,
  mimeType = "application/octet-stream"
): Promise<SaveFileResult> {
  const result = await window.crux.files.saveBinary({
    defaultFileName,
    data,
    mimeType,
  });
  return assertSaved(result);
}
