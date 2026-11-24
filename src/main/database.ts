import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { Note, NotebookData, NotebookSettings, SaveResult } from '../shared/types';

const SCHEMA_VERSION = 1;
const DEFAULT_SETTINGS: NotebookSettings = {
  theme: 'system',
  sortBy: 'updatedAt',
  sortDir: 'desc',
};

interface FolderRow {
  id: string;
  name: string;
  created_at: number;
}

interface NoteRow {
  id: string;
  folder_id: string;
  title: string;
  content: string;
  text: string;
  pinned: number;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

interface SettingsRow {
  theme: string;
  sort_by: string;
  sort_dir: string;
}

interface MetaRow {
  value: string;
}

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  ) STRICT;

  CREATE TABLE IF NOT EXISTS folders (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at INTEGER NOT NULL
  ) STRICT;

  CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY,
    folder_id TEXT NOT NULL REFERENCES folders(id) ON DELETE RESTRICT,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    text TEXT NOT NULL,
    pinned INTEGER NOT NULL DEFAULT 0 CHECK (pinned IN (0, 1)),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER
  ) STRICT;

  CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    theme TEXT NOT NULL,
    sort_by TEXT NOT NULL,
    sort_dir TEXT NOT NULL
  ) STRICT;

  CREATE INDEX IF NOT EXISTS idx_notes_folder
    ON notes(folder_id);

  CREATE INDEX IF NOT EXISTS idx_notes_active_updated
    ON notes(updated_at DESC)
    WHERE deleted_at IS NULL;

  CREATE INDEX IF NOT EXISTS idx_notes_active_created
    ON notes(created_at DESC)
    WHERE deleted_at IS NULL;

  CREATE INDEX IF NOT EXISTS idx_notes_active_title
    ON notes(title)
    WHERE deleted_at IS NULL;

  CREATE INDEX IF NOT EXISTS idx_notes_deleted
    ON notes(deleted_at DESC)
    WHERE deleted_at IS NOT NULL;
`;

function folderChanged(previous: NotebookData['folders'][number] | undefined, next: NotebookData['folders'][number]): boolean {
  return !previous || previous.name !== next.name || previous.createdAt !== next.createdAt;
}

function noteChanged(previous: Note | undefined, next: Note): boolean {
  return (
    !previous ||
    previous.folderId !== next.folderId ||
    previous.title !== next.title ||
    previous.content !== next.content ||
    previous.text !== next.text ||
    previous.pinned !== next.pinned ||
    previous.createdAt !== next.createdAt ||
    previous.updatedAt !== next.updatedAt ||
    previous.deletedAt !== next.deletedAt
  );
}

function settingsChanged(previous: NotebookSettings | undefined, next: NotebookSettings): boolean {
  return (
    !previous ||
    previous.theme !== next.theme ||
    previous.sortBy !== next.sortBy ||
    previous.sortDir !== next.sortDir
  );
}

export class NotebookDatabase {
  private readonly db: DatabaseSync;
  private lastSaved: NotebookData | null = null;
  private closed = false;

  constructor(readonly filePath: string) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    this.db = new DatabaseSync(filePath);
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA synchronous = FULL;');
    this.db.exec('PRAGMA foreign_keys = ON;');
    this.db.exec('PRAGMA busy_timeout = 5000;');
    this.ensureSchema();
    this.assertIntegrity();
    this.lastSaved = this.readNotebook();
  }

  private ensureSchema(): void {
    const row = this.db.prepare('PRAGMA user_version').get() as { user_version: number } | undefined;
    const version = Number(row?.user_version ?? 0);
    if (version > SCHEMA_VERSION) {
      throw new Error('数据库版本高于当前 FreeNotes 支持的版本。');
    }
    if (version === 0) {
      this.db.exec('BEGIN IMMEDIATE;');
      try {
        this.db.exec(SCHEMA_SQL);
        this.db.exec(`PRAGMA user_version = ${SCHEMA_VERSION};`);
        this.db.exec('COMMIT;');
      } catch (error) {
        this.db.exec('ROLLBACK;');
        throw error;
      }
    }
  }

  private assertIntegrity(): void {
    const row = this.db.prepare('PRAGMA quick_check(1)').get() as { quick_check: string } | undefined;
    if (row?.quick_check !== 'ok') {
      throw new Error('数据库完整性检查失败，已停止加载以避免覆盖现有数据。');
    }
  }

  private getMeta(key: string): string | null {
    const row = this.db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as MetaRow | undefined;
    return row?.value ?? null;
  }

  private setMeta(key: string, value: string): void {
    this.db
      .prepare('INSERT INTO meta(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
      .run(key, value);
  }

  isInitialized(): boolean {
    return this.getMeta('initialized') === '1';
  }

  private readNotebook(): NotebookData | null {
    if (!this.isInitialized()) return null;

    const folderRows = this.db
      .prepare('SELECT id, name, created_at FROM folders ORDER BY created_at ASC, id ASC')
      .all() as unknown as FolderRow[];
    const noteRows = this.db
      .prepare(
        'SELECT id, folder_id, title, content, text, pinned, created_at, updated_at, deleted_at FROM notes ORDER BY created_at ASC, id ASC',
      )
      .all() as unknown as NoteRow[];
    const settingsRow = this.db
      .prepare('SELECT theme, sort_by, sort_dir FROM settings WHERE id = 1')
      .get() as SettingsRow | undefined;

    const settings: NotebookSettings = settingsRow
      ? {
          theme: ['system', 'light', 'dark'].includes(settingsRow.theme)
            ? (settingsRow.theme as NotebookSettings['theme'])
            : DEFAULT_SETTINGS.theme,
          sortBy: ['updatedAt', 'createdAt', 'title'].includes(settingsRow.sort_by)
            ? (settingsRow.sort_by as NotebookSettings['sortBy'])
            : DEFAULT_SETTINGS.sortBy,
          sortDir: ['asc', 'desc'].includes(settingsRow.sort_dir)
            ? (settingsRow.sort_dir as NotebookSettings['sortDir'])
            : DEFAULT_SETTINGS.sortDir,
        }
      : { ...DEFAULT_SETTINGS };

    return {
      version: 1,
      folders: folderRows.map((row) => ({
        id: row.id,
        name: row.name,
        createdAt: Number(row.created_at),
      })),
      notes: noteRows.map((row) => ({
        id: row.id,
        folderId: row.folder_id,
        title: row.title,
        content: row.content,
        text: row.text,
        pinned: Boolean(row.pinned),
        createdAt: Number(row.created_at),
        updatedAt: Number(row.updated_at),
        deletedAt: row.deleted_at === null ? null : Number(row.deleted_at),
      })),
      settings,
    };
  }

  load(): NotebookData | null {
    return this.readNotebook();
  }

  snapshot(): NotebookData | null {
    return this.readNotebook();
  }

  save(data: NotebookData): SaveResult {
    if (this.closed) return { ok: false, error: '数据库已经关闭。' };
    const savedAt = Date.now();
    const previousFolders = new Map((this.lastSaved?.folders ?? []).map((folder) => [folder.id, folder]));
    const previousNotes = new Map((this.lastSaved?.notes ?? []).map((note) => [note.id, note]));
    const incomingFolderIds = new Set(data.folders.map((folder) => folder.id));
    const incomingNoteIds = new Set(data.notes.map((note) => note.id));

    const upsertFolder = this.db.prepare(`
      INSERT INTO folders(id, name, created_at) VALUES(?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET name = excluded.name, created_at = excluded.created_at
    `);
    const upsertNote = this.db.prepare(`
      INSERT INTO notes(id, folder_id, title, content, text, pinned, created_at, updated_at, deleted_at)
      VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        folder_id = excluded.folder_id,
        title = excluded.title,
        content = excluded.content,
        text = excluded.text,
        pinned = excluded.pinned,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at,
        deleted_at = excluded.deleted_at
    `);
    const deleteNote = this.db.prepare('DELETE FROM notes WHERE id = ?');
    const deleteFolder = this.db.prepare('DELETE FROM folders WHERE id = ?');
    const upsertSettings = this.db.prepare(`
      INSERT INTO settings(id, theme, sort_by, sort_dir) VALUES(1, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        theme = excluded.theme,
        sort_by = excluded.sort_by,
        sort_dir = excluded.sort_dir
    `);

    this.db.exec('BEGIN IMMEDIATE;');
    try {
      for (const folder of data.folders) {
        if (folderChanged(previousFolders.get(folder.id), folder)) {
          upsertFolder.run(folder.id, folder.name, folder.createdAt);
        }
      }
      for (const note of data.notes) {
        if (noteChanged(previousNotes.get(note.id), note)) {
          upsertNote.run(
            note.id,
            note.folderId,
            note.title,
            note.content,
            note.text,
            note.pinned ? 1 : 0,
            note.createdAt,
            note.updatedAt,
            note.deletedAt,
          );
        }
      }
      for (const id of previousNotes.keys()) {
        if (!incomingNoteIds.has(id)) deleteNote.run(id);
      }
      for (const id of previousFolders.keys()) {
        if (!incomingFolderIds.has(id)) deleteFolder.run(id);
      }
      if (settingsChanged(this.lastSaved?.settings, data.settings)) {
        upsertSettings.run(data.settings.theme, data.settings.sortBy, data.settings.sortDir);
      }
      this.setMeta('notebook_version', '1');
      this.setMeta('initialized', '1');
      this.setMeta('last_saved_at', String(savedAt));
      this.db.exec('COMMIT;');
      this.lastSaved = data;
      return { ok: true, savedAt };
    } catch (error) {
      this.db.exec('ROLLBACK;');
      console.error('[freenotes] SQLite save failed:', error);
      return { ok: false, error: '写入本地数据库失败。' };
    }
  }

  replace(data: NotebookData): SaveResult {
    if (this.closed) return { ok: false, error: '数据库已经关闭。' };
    const savedAt = Date.now();
    const insertFolder = this.db.prepare('INSERT INTO folders(id, name, created_at) VALUES(?, ?, ?)');
    const insertNote = this.db.prepare(`
      INSERT INTO notes(id, folder_id, title, content, text, pinned, created_at, updated_at, deleted_at)
      VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const upsertSettings = this.db.prepare(`
      INSERT INTO settings(id, theme, sort_by, sort_dir) VALUES(1, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        theme = excluded.theme,
        sort_by = excluded.sort_by,
        sort_dir = excluded.sort_dir
    `);

    this.db.exec('BEGIN IMMEDIATE;');
    try {
      this.db.exec('DELETE FROM notes;');
      this.db.exec('DELETE FROM folders;');
      for (const folder of data.folders) {
        insertFolder.run(folder.id, folder.name, folder.createdAt);
      }
      for (const note of data.notes) {
        insertNote.run(
          note.id,
          note.folderId,
          note.title,
          note.content,
          note.text,
          note.pinned ? 1 : 0,
          note.createdAt,
          note.updatedAt,
          note.deletedAt,
        );
      }
      upsertSettings.run(data.settings.theme, data.settings.sortBy, data.settings.sortDir);
      this.setMeta('notebook_version', '1');
      this.setMeta('initialized', '1');
      this.setMeta('last_saved_at', String(savedAt));
      this.db.exec('COMMIT;');
      this.lastSaved = data;
      return { ok: true, savedAt };
    } catch (error) {
      this.db.exec('ROLLBACK;');
      console.error('[freenotes] SQLite replace failed:', error);
      return { ok: false, error: '恢复数据到本地数据库失败。' };
    }
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    try {
      this.db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
    } catch {
      // The main connection can still be closed even if checkpointing fails.
    }
    this.db.close();
  }
}
