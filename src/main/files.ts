import { app, BrowserWindow, dialog } from 'electron';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import type { FileExportResult, FreeNotesBackup, NotebookData } from '../shared/types';
import { sanitizeExportName } from '../shared/filename';

const MAX_EXPORT_BYTES = 120 * 1024 * 1024;

function dateStamp(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
}

function withExtension(name: string, extension: string): string {
  return name.toLowerCase().endsWith(extension) ? name : `${name}${extension}`;
}

async function showSaveDialog(
  title: string,
  defaultFileName: string,
  filters: Electron.FileFilter[],
): Promise<string | null> {
  const options: Electron.SaveDialogOptions = {
    title,
    defaultPath: path.join(app.getPath('documents'), defaultFileName),
    filters,
  };
  const window = BrowserWindow.getFocusedWindow();
  const result = window
    ? await dialog.showSaveDialog(window, options)
    : await dialog.showSaveDialog(options);
  return result.canceled || !result.filePath ? null : result.filePath;
}

async function writeFileAtomically(filePath: string, contents: string | Uint8Array): Promise<void> {
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  try {
    await fsp.writeFile(tempPath, contents, { mode: 0o600 });
    await fsp.rename(tempPath, filePath);
  } catch (error) {
    await fsp.rm(tempPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

export async function exportBackupFile(data: NotebookData): Promise<FileExportResult> {
  const fileName = `FreeNotes-backup-${dateStamp()}.freenotes.json`;
  try {
    const filePath = await showSaveDialog('导出完整备份', fileName, [
      { name: 'FreeNotes 备份', extensions: ['json'] },
    ]);
    if (!filePath) return { ok: false, canceled: true };

    const backup: FreeNotesBackup = {
      format: 'freenotes-backup',
      formatVersion: 1,
      appVersion: app.getVersion(),
      exportedAt: Date.now(),
      data,
    };
    await writeFileAtomically(filePath, JSON.stringify(backup));
    return { ok: true, filePath };
  } catch (error) {
    console.error('[freenotes] Backup export failed:', error);
    return { ok: false, error: '导出备份失败，请检查目标文件夹权限。' };
  }
}

export async function exportNoteHtmlFile(html: string, suggestedName: string): Promise<FileExportResult> {
  if (typeof html !== 'string' || !html.trim() || Buffer.byteLength(html, 'utf8') > MAX_EXPORT_BYTES) {
    return { ok: false, error: '导出内容为空或超过大小限制。' };
  }
  try {
    const fileName = withExtension(sanitizeExportName(suggestedName, '未命名备忘录'), '.html');
    const filePath = await showSaveDialog('导出备忘录为 HTML', fileName, [
      { name: 'HTML 文档', extensions: ['html'] },
    ]);
    if (!filePath) return { ok: false, canceled: true };
    const outputPath = withExtension(filePath, '.html');
    await writeFileAtomically(outputPath, html);
    return { ok: true, filePath: outputPath };
  } catch (error) {
    console.error('[freenotes] HTML export failed:', error);
    return { ok: false, error: '导出 HTML 失败，请检查目标文件夹权限。' };
  }
}

export async function exportNotePdfFile(html: string, suggestedName: string): Promise<FileExportResult> {
  if (typeof html !== 'string' || !html.trim() || Buffer.byteLength(html, 'utf8') > MAX_EXPORT_BYTES) {
    return { ok: false, error: '导出内容为空或超过大小限制。' };
  }

  try {
    const fileName = withExtension(sanitizeExportName(suggestedName, '未命名备忘录'), '.pdf');
    const filePath = await showSaveDialog('导出备忘录为 PDF', fileName, [
      { name: 'PDF 文档', extensions: ['pdf'] },
    ]);
    if (!filePath) return { ok: false, canceled: true };
    const outputPath = withExtension(filePath, '.pdf');
    const tempDir = await fsp.mkdtemp(path.join(app.getPath('temp'), 'freenotes-export-'));
    const tempHtmlPath = path.join(tempDir, 'note.html');
    const printWindow = new BrowserWindow({
      show: false,
      width: 900,
      height: 1200,
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        javascript: false,
        backgroundThrottling: false,
      },
    });

    try {
      await fsp.writeFile(tempHtmlPath, html, 'utf8');
      printWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      printWindow.webContents.on('will-navigate', (event) => event.preventDefault());
      await printWindow.loadFile(tempHtmlPath);
      await new Promise((resolve) => setTimeout(resolve, 150));
      const pdf = await printWindow.webContents.printToPDF({
        printBackground: true,
        pageSize: 'A4',
        preferCSSPageSize: true,
      });
      await writeFileAtomically(outputPath, pdf);
      return { ok: true, filePath: outputPath };
    } finally {
      if (!printWindow.isDestroyed()) printWindow.destroy();
      await fsp.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
    }
  } catch (error) {
    console.error('[freenotes] PDF export failed:', error);
    return { ok: false, error: '导出 PDF 失败，请检查目标文件夹权限。' };
  }
}
