import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { app, BrowserWindow, dialog } from 'electron';
import * as yauzl from 'yauzl';
import { ZipFile } from 'yazl';
import type { AttachmentRecord, FileExportResult, FreeNotesBackupV2, NotebookData } from '../shared/types';
import { isNotebookData } from '../shared/backup';
import { AttachmentStore, referencedAttachmentPaths } from './attachments';

const MANIFEST_NAME = 'backup.json';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isAttachmentRecord(value: unknown): value is AttachmentRecord {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.relativePath === 'string' &&
    typeof value.fileName === 'string' &&
    typeof value.mimeType === 'string' &&
    typeof value.byteSize === 'number' &&
    typeof value.sha256 === 'string' &&
    typeof value.createdAt === 'number'
  );
}

function dateStamp(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
}

function withExtension(filePath: string, extension: string): string {
  return filePath.toLowerCase().endsWith(extension) ? filePath : `${filePath}${extension}`;
}

async function showSaveDialog(defaultFileName: string): Promise<string | null> {
  const options: Electron.SaveDialogOptions = {
    title: '导出完整备份',
    defaultPath: path.join(app.getPath('documents'), defaultFileName),
    filters: [{ name: 'FreeNotes 备份', extensions: ['zip'] }],
  };
  const window = BrowserWindow.getFocusedWindow();
  const result = window
    ? await dialog.showSaveDialog(window, options)
    : await dialog.showSaveDialog(options);
  return result.canceled || !result.filePath ? null : result.filePath;
}

async function writeZip(outputPath: string, backup: FreeNotesBackupV2, attachments: AttachmentRecord[], store: AttachmentStore): Promise<void> {
  const tempPath = `${outputPath}.${process.pid}.${Date.now()}.tmp`;
  const zip = new ZipFile();
  try {
    zip.addBuffer(Buffer.from(JSON.stringify(backup)), MANIFEST_NAME, {
      mtime: new Date(),
      mode: 0o600,
    });
    for (const attachment of attachments) {
      const attachmentPath = store.resolveRelativePath(attachment.relativePath);
      if (!fs.existsSync(attachmentPath)) throw new Error(`备份附件缺失：${attachment.relativePath}`);
      zip.addFile(attachmentPath, attachment.relativePath, {
        mtime: new Date(attachment.createdAt),
        mode: 0o600,
      });
    }
    zip.end();
    await pipeline(zip.outputStream as unknown as Readable, fs.createWriteStream(tempPath, { mode: 0o600 }));
    try {
      await fsp.rename(tempPath, outputPath);
    } catch (error) {
      if (!fs.existsSync(outputPath)) throw error;
      await fsp.rm(outputPath, { force: true });
      await fsp.rename(tempPath, outputPath);
    }
  } catch (error) {
    await fsp.rm(tempPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

export async function exportBackupBundle(data: NotebookData, store: AttachmentStore): Promise<FileExportResult> {
  try {
    const defaultFileName = `FreeNotes-backup-${dateStamp()}.freenotes.zip`;
    const pickedPath = await showSaveDialog(defaultFileName);
    if (!pickedPath) return { ok: false, canceled: true };
    const outputPath = withExtension(pickedPath, '.zip');

    const available = new Map(store.listAttachments().map((attachment) => [attachment.relativePath, attachment]));
    const referenced = new Set<string>();
    for (const note of data.notes) {
      for (const relativePath of referencedAttachmentPaths(note.content)) referenced.add(relativePath);
    }

    const attachments: AttachmentRecord[] = [];
    for (const relativePath of [...referenced].sort()) {
      attachments.push(available.get(relativePath) ?? (await store.ensureAttachmentRecord(relativePath)));
    }

    const backup: FreeNotesBackupV2 = {
      format: 'freenotes-backup',
      formatVersion: 2,
      appVersion: app.getVersion(),
      exportedAt: Date.now(),
      data,
      attachments,
    };
    await writeZip(outputPath, backup, attachments, store);
    return { ok: true, filePath: outputPath };
  } catch (error) {
    console.error('[freenotes] Backup bundle export failed:', error);
    return { ok: false, error: '导出完整备份失败，请检查附件文件和目标文件夹权限。' };
  }
}

function openReadStream(zip: yauzl.ZipFile, entry: yauzl.Entry): Promise<Readable> {
  return new Promise((resolve, reject) => {
    zip.openReadStream(entry, (error, stream) => {
      if (error) reject(error);
      else resolve(stream);
    });
  });
}

function safeEntryName(fileName: string): string {
  const normalized = fileName.replaceAll('\\', '/');
  if (normalized.includes('\0') || normalized.startsWith('/') || normalized.split('/').includes('..')) {
    throw new Error('备份包含不安全的文件路径。');
  }
  if (normalized !== MANIFEST_NAME && !normalized.startsWith('attachments/')) {
    throw new Error('备份包含不支持的文件。');
  }
  return normalized;
}

async function extractZip(zipPath: string, targetDir: string): Promise<void> {
  const zip = await yauzl.openPromise(zipPath, {
    lazyEntries: true,
    autoClose: true,
    validateEntrySizes: true,
    strictFileNames: true,
  });

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      zip.close();
      reject(error instanceof Error ? error : new Error('解压备份失败。'));
    };

    zip.on('entry', (entry: yauzl.Entry) => {
      void (async () => {
        try {
          const name = safeEntryName(entry.fileName);
          if (name.endsWith('/')) {
            await fsp.mkdir(path.join(targetDir, name), { recursive: true });
            zip.readEntry();
            return;
          }
          const destination = path.resolve(targetDir, name);
          const root = path.resolve(targetDir);
          if (destination !== root && !destination.startsWith(`${root}${path.sep}`)) {
            throw new Error('备份包含不安全的文件路径。');
          }
          await fsp.mkdir(path.dirname(destination), { recursive: true });
          const stream = await openReadStream(zip, entry);
          await pipeline(stream, fs.createWriteStream(destination, { mode: 0o600 }));
          zip.readEntry();
        } catch (error) {
          fail(error);
        }
      })();
    });
    zip.on('end', () => {
      if (settled) return;
      settled = true;
      resolve();
    });
    zip.on('error', fail);
    zip.readEntry();
  });
}

async function sha256File(filePath: string): Promise<string> {
  const hash = createHash('sha256');
  const stream = fs.createReadStream(filePath);
  for await (const chunk of stream) hash.update(chunk);
  return hash.digest('hex');
}

export interface BackupInspection {
  data: NotebookData;
  attachments: AttachmentRecord[];
  tempDir: string;
}

export async function readBackupBundle(zipPath: string): Promise<BackupInspection> {
  const tempDir = await fsp.mkdtemp(path.join(app.getPath('temp'), 'freenotes-restore-'));
  try {
    await extractZip(zipPath, tempDir);
    const manifestPath = path.join(tempDir, MANIFEST_NAME);
    const raw: unknown = JSON.parse(await fsp.readFile(manifestPath, 'utf8'));
    if (!isRecord(raw) || raw.format !== 'freenotes-backup' || raw.formatVersion !== 2) {
      throw new Error('这不是受支持的 FreeNotes 备份包。');
    }
    if (!isNotebookData(raw.data) || !Array.isArray(raw.attachments) || !raw.attachments.every(isAttachmentRecord)) {
      throw new Error('备份索引不完整或格式不正确。');
    }

    const available = new Set(raw.attachments.map((attachment) => attachment.relativePath));
    for (const note of raw.data.notes) {
      for (const relativePath of referencedAttachmentPaths(note.content)) {
        if (!available.has(relativePath)) throw new Error('备份缺少笔记引用的图片附件。');
      }
    }

    for (const record of raw.attachments) {
      if (record.id !== record.sha256) throw new Error('备份附件索引无效。');
      const extractedPath = path.resolve(tempDir, record.relativePath);
      const root = path.resolve(tempDir);
      if (!extractedPath.startsWith(`${root}${path.sep}`)) throw new Error('备份附件路径无效。');
      const stat = await fsp.stat(extractedPath);
      if (!stat.isFile() || stat.size !== record.byteSize) throw new Error('备份附件大小校验失败。');
      const digest = await sha256File(extractedPath);
      if (digest !== record.sha256) throw new Error('备份附件校验失败。');
    }

    return { data: raw.data, attachments: raw.attachments, tempDir };
  } catch (error) {
    await fsp.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
}

export async function importBackupAttachments(
  inspection: BackupInspection,
  store: AttachmentStore,
): Promise<AttachmentRecord[]> {
  const attachments: AttachmentRecord[] = [];
  for (const record of inspection.attachments) {
    const extractedPath = path.join(inspection.tempDir, record.relativePath);
    const data = await fsp.readFile(extractedPath);
    const saved = await store.saveBuffer(data, record.fileName, record.mimeType);
    if (saved.relativePath !== record.relativePath) throw new Error('备份附件索引与文件不匹配。');
    attachments.push(saved);
  }
  return attachments;
}

export async function cleanupBackupInspection(inspection: BackupInspection): Promise<void> {
  await fsp.rm(inspection.tempDir, { recursive: true, force: true }).catch(() => undefined);
}
