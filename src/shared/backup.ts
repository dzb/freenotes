import type { FreeNotesBackup, NotebookData } from './types';

const MAX_COUNT = 1_000_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function isNotebookData(value: unknown): value is NotebookData {
  if (!isRecord(value)) return false;
  if (value.version !== 1) return false;
  if (!Array.isArray(value.folders) || !Array.isArray(value.notes)) return false;
  if (value.folders.length > MAX_COUNT || value.notes.length > MAX_COUNT) return false;
  if (!isRecord(value.settings)) return false;

  const foldersOk = value.folders.every(
    (folder) =>
      isRecord(folder) &&
      typeof folder.id === 'string' &&
      Boolean(folder.id) &&
      typeof folder.name === 'string' &&
      isFiniteNumber(folder.createdAt),
  );
  if (!foldersOk) return false;

  const notesOk = value.notes.every(
    (note) =>
      isRecord(note) &&
      typeof note.id === 'string' &&
      Boolean(note.id) &&
      typeof note.folderId === 'string' &&
      typeof note.title === 'string' &&
      typeof note.content === 'string' &&
      typeof note.text === 'string' &&
      typeof note.pinned === 'boolean' &&
      isFiniteNumber(note.createdAt) &&
      isFiniteNumber(note.updatedAt) &&
      (note.deletedAt === null || isFiniteNumber(note.deletedAt)),
  );
  if (!notesOk) return false;

  return (
    typeof value.settings.theme === 'string' &&
    typeof value.settings.sortBy === 'string' &&
    typeof value.settings.sortDir === 'string'
  );
}

export function isFreeNotesBackup(value: unknown): value is FreeNotesBackup {
  if (!isRecord(value)) return false;
  return (
    value.format === 'freenotes-backup' &&
    value.formatVersion === 1 &&
    typeof value.appVersion === 'string' &&
    isFiniteNumber(value.exportedAt) &&
    isNotebookData(value.data)
  );
}

/**
 * Import either a FreeNotes backup envelope or a bare notes-data.json file.
 * Unknown formats and unsupported future versions are rejected explicitly.
 */
export function extractNotebookData(value: unknown): NotebookData {
  if (isRecord(value) && 'format' in value) {
    if (value.format !== 'freenotes-backup') {
      throw new Error('这不是 FreeNotes 备份文件。');
    }
    if (value.formatVersion !== 1) {
      if (value.formatVersion === 2) {
        throw new Error('这是备份包内的索引文件，请选择 .freenotes.zip 完整备份。');
      }
      throw new Error('备份格式版本不受支持，请升级 FreeNotes 后再试。');
    }
    if (!isNotebookData(value.data)) {
      throw new Error('备份内容不完整或格式不正确。');
    }
    return value.data;
  }

  if (!isNotebookData(value)) {
    throw new Error('备份内容不完整或格式不正确。');
  }
  return value;
}

export function parseBackupContent(raw: string): NotebookData {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('备份文件不是有效的 JSON。');
  }
  return extractNotebookData(parsed);
}
