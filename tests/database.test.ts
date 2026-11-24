import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { NotebookDatabase } from '../src/main/database';
import type { AttachmentRecord, NotebookData } from '../src/shared/types';

const tempDirs: string[] = [];
const databases: NotebookDatabase[] = [];

function makeDb(): { db: NotebookDatabase; filePath: string; dir: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'freenotes-db-'));
  tempDirs.push(dir);
  const filePath = path.join(dir, 'notes.db');
  const db = new NotebookDatabase(filePath);
  databases.push(db);
  return { db, filePath, dir };
}

afterEach(() => {
  for (const db of databases.splice(0)) db.close();
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function sampleData(): NotebookData {
  return {
    version: 1,
    folders: [
      { id: 'folder-1', name: '备忘录', createdAt: 1 },
      { id: 'folder-2', name: '工作', createdAt: 2 },
    ],
    notes: [
      {
        id: 'note-1',
        folderId: 'folder-1',
        title: '第一篇',
        content: '<p>正文 <strong>一</strong></p><img src="data:image/png;base64,AAAA" />',
        text: '正文 一',
        pinned: true,
        createdAt: 10,
        updatedAt: 20,
        deletedAt: null,
      },
      {
        id: 'note-2',
        folderId: 'folder-2',
        title: '第二篇',
        content: '<p>正文二</p>',
        text: '正文二',
        pinned: false,
        createdAt: 11,
        updatedAt: 21,
        deletedAt: 30,
      },
    ],
    settings: { theme: 'dark', sortBy: 'createdAt', sortDir: 'asc', fontFamily: 'serif', fontSize: 16 },
  };
}

describe('NotebookDatabase', () => {
  it('returns null before the first write', () => {
    const { db } = makeDb();
    expect(db.load()).toBeNull();
  });

  it('persists a complete NotebookData snapshot and reopens it', () => {
    const { db, filePath } = makeDb();
    const data = sampleData();
    expect(db.save(data).ok).toBe(true);
    expect(db.load()).toEqual(data);

    db.close();
    const reopened = new NotebookDatabase(filePath);
    databases.push(reopened);
    expect(reopened.load()).toEqual(data);
    expect(reopened.snapshot()).toEqual(data);
  });

  it('applies incremental updates, pin changes, moves, and deletions', () => {
    const { db } = makeDb();
    const initial = sampleData();
    db.save(initial);

    const changed: NotebookData = {
      ...initial,
      folders: [initial.folders[0]],
      notes: [
        {
          ...initial.notes[0],
          folderId: 'folder-1',
          title: '修改后的标题',
          updatedAt: 99,
          pinned: false,
        },
      ],
      settings: { theme: 'light', sortBy: 'title', sortDir: 'desc', fontFamily: 'mono', fontSize: 13 },
    };

    const result = db.save(changed);
    expect(result.ok).toBe(true);
    expect(db.load()).toEqual(changed);
  });

  it('replaces the complete database in one operation', () => {
    const { db } = makeDb();
    db.save(sampleData());

    const replacement: NotebookData = {
      version: 1,
      folders: [{ id: 'restored-folder', name: '恢复文件夹', createdAt: 100 }],
      notes: [
        {
          id: 'restored-note',
          folderId: 'restored-folder',
          title: '恢复后的备忘录',
          content: '<p>来自备份</p>',
          text: '来自备份',
          pinned: false,
          createdAt: 100,
          updatedAt: 101,
          deletedAt: null,
        },
      ],
      settings: { theme: 'system', sortBy: 'updatedAt', sortDir: 'desc', fontFamily: 'system', fontSize: 14 },
    };

    expect(db.replace(replacement).ok).toBe(true);
    expect(db.load()).toEqual(replacement);
  });

  it('preserves large embedded image payloads exactly', () => {
    const { db } = makeDb();
    const payload = 'A'.repeat(1024 * 1024);
    const data = sampleData();
    data.notes[0].content = `<p>图片</p><img src="data:image/png;base64,${payload}" />`;
    expect(db.save(data).ok).toBe(true);
    expect(db.load()?.notes[0].content).toBe(data.notes[0].content);
  });

  it('stores and replaces attachment indexes', () => {
    const { db } = makeDb();
    const attachment: AttachmentRecord = {
      id: 'hash-1',
      relativePath: 'attachments/ha/hash-1.png',
      fileName: '图片.png',
      mimeType: 'image/png',
      byteSize: 123,
      sha256: 'hash-1',
      createdAt: 5,
    };
    db.saveAttachments([attachment]);
    expect(db.getAllAttachments()).toEqual([attachment]);

    const data = sampleData();
    expect(db.replace(data, [attachment]).ok).toBe(true);
    expect(db.getAllAttachments()).toEqual([attachment]);

    expect(db.replace(data).ok).toBe(true);
    expect(db.getAllAttachments()).toEqual([]);
  });

  it('creates a consistent SQLite snapshot', () => {
    const { db, dir } = makeDb();
    db.save(sampleData());
    const snapshotPath = path.join(dir, 'snapshot.db');
    db.createSnapshot(snapshotPath);
    const snapshot = new DatabaseSync(snapshotPath, { readOnly: true });
    const notes = snapshot.prepare('SELECT COUNT(*) AS count FROM notes').get() as { count: number };
    const version = snapshot.prepare('PRAGMA user_version').get() as { user_version: number };
    snapshot.close();
    expect(notes.count).toBe(2);
    expect(version.user_version).toBe(3);
  });

  it('migrates a schema v2 database and adds typography defaults', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'freenotes-v2-db-'));
    tempDirs.push(dir);
    const filePath = path.join(dir, 'notes.db');
    const legacy = new DatabaseSync(filePath);
    legacy.exec(`
      CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;
      CREATE TABLE folders (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at INTEGER NOT NULL) STRICT;
      CREATE TABLE notes (
        id TEXT PRIMARY KEY,
        folder_id TEXT NOT NULL REFERENCES folders(id) ON DELETE RESTRICT,
        title TEXT NOT NULL, content TEXT NOT NULL, text TEXT NOT NULL,
        pinned INTEGER NOT NULL DEFAULT 0 CHECK (pinned IN (0, 1)),
        created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER
      ) STRICT;
      CREATE TABLE settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        theme TEXT NOT NULL, sort_by TEXT NOT NULL, sort_dir TEXT NOT NULL
      ) STRICT;
      CREATE TABLE attachments (
        id TEXT PRIMARY KEY, relative_path TEXT NOT NULL UNIQUE,
        file_name TEXT NOT NULL, mime_type TEXT NOT NULL, byte_size INTEGER NOT NULL,
        sha256 TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL
      ) STRICT;
      PRAGMA user_version = 2;
      INSERT INTO meta(key, value) VALUES('initialized', '1');
      INSERT INTO meta(key, value) VALUES('attachments_migrated', '1');
      INSERT INTO folders(id, name, created_at) VALUES('f1', '旧数据库', 1);
      INSERT INTO settings(id, theme, sort_by, sort_dir) VALUES(1, 'light', 'title', 'asc');
    `);
    legacy.close();

    const upgraded = new NotebookDatabase(filePath);
    databases.push(upgraded);
    const loaded = upgraded.load();
    expect(loaded?.settings).toEqual({
      theme: 'light',
      sortBy: 'title',
      sortDir: 'asc',
      fontFamily: 'system',
      fontSize: 14,
    });
  });

  it('migrates a schema v1 database and marks attachments for extraction', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'freenotes-v1-db-'));
    tempDirs.push(dir);
    const filePath = path.join(dir, 'notes.db');
    const legacy = new DatabaseSync(filePath);
    legacy.exec(`
      CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;
      CREATE TABLE folders (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at INTEGER NOT NULL) STRICT;
      CREATE TABLE notes (
        id TEXT PRIMARY KEY,
        folder_id TEXT NOT NULL REFERENCES folders(id) ON DELETE RESTRICT,
        title TEXT NOT NULL, content TEXT NOT NULL, text TEXT NOT NULL,
        pinned INTEGER NOT NULL DEFAULT 0 CHECK (pinned IN (0, 1)),
        created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER
      ) STRICT;
      CREATE TABLE settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        theme TEXT NOT NULL, sort_by TEXT NOT NULL, sort_dir TEXT NOT NULL
      ) STRICT;
      PRAGMA user_version = 1;
      INSERT INTO meta(key, value) VALUES('initialized', '1');
      INSERT INTO folders(id, name, created_at) VALUES('f1', '旧数据库', 1);
      INSERT INTO settings(id, theme, sort_by, sort_dir) VALUES(1, 'system', 'updatedAt', 'desc');
    `);
    legacy.close();

    const upgraded = new NotebookDatabase(filePath);
    databases.push(upgraded);
    expect(upgraded.needsAttachmentMigration()).toBe(true);
    const connection = new DatabaseSync(filePath, { readOnly: true });
    const version = connection.prepare('PRAGMA user_version').get() as { user_version: number };
    const hasAttachments = connection
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'attachments'")
      .get();
    connection.close();
    expect(version.user_version).toBe(3);
    expect(hasAttachments).toBeTruthy();
  });
});
