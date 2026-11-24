import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { NotebookDatabase } from '../src/main/database';
import type { NotebookData } from '../src/shared/types';

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
    settings: { theme: 'dark', sortBy: 'createdAt', sortDir: 'asc' },
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
      settings: { theme: 'light', sortBy: 'title', sortDir: 'desc' },
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
      settings: { theme: 'system', sortBy: 'updatedAt', sortDir: 'desc' },
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
});
