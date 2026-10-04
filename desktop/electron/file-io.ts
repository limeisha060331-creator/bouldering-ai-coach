import { promises as fs } from "node:fs";
import path from "node:path";
import { BrowserWindow, dialog, shell } from "electron";
import type {
  SaveBinaryFilePayload,
  SaveFileResult,
  SaveTextFilePayload,
} from "@shared/ipc";

function filtersFor(fileName: string): Electron.FileFilter[] {
  const ext = path.extname(fileName).slice(1).toLowerCase();
  if (ext === "md") {
    return [
      { name: "Markdown", extensions: ["md"] },
      { name: "所有文件", extensions: ["*"] },
    ];
  }
  if (ext === "pdf") {
    return [
      { name: "PDF", extensions: ["pdf"] },
      { name: "所有文件", extensions: ["*"] },
    ];
  }
  return [{ name: "所有文件", extensions: ["*"] }];
}

async function pickTarget(
  window: BrowserWindow | null,
  defaultFileName: string
): Promise<string | null> {
  const options: Electron.SaveDialogOptions = {
    title: "保存文件",
    defaultPath: defaultFileName,
    filters: filtersFor(defaultFileName),
  };
  const result = window
    ? await dialog.showSaveDialog(window, options)
    : await dialog.showSaveDialog(options);
  if (result.canceled || !result.filePath) return null;
  return result.filePath;
}

export async function saveTextFile(
  window: BrowserWindow | null,
  payload: SaveTextFilePayload
): Promise<SaveFileResult> {
  const filePath = await pickTarget(window, payload.defaultFileName);
  if (!filePath) return { saved: false };
  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, payload.content, "utf-8");
    return { saved: true, filePath };
  } catch (err) {
    return {
      saved: false,
      error: err instanceof Error ? err.message : "写入文件失败",
    };
  }
}

export async function saveBinaryFile(
  window: BrowserWindow | null,
  payload: SaveBinaryFilePayload
): Promise<SaveFileResult> {
  const filePath = await pickTarget(window, payload.defaultFileName);
  if (!filePath) return { saved: false };
  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, Buffer.from(payload.data));
    return { saved: true, filePath };
  } catch (err) {
    return {
      saved: false,
      error: err instanceof Error ? err.message : "写入文件失败",
    };
  }
}

export async function openContainingPath(filePath: string): Promise<void> {
  await shell.openPath(filePath);
}
