import { describe, expect, it } from 'vitest';
import { extractNotebookData, isNotebookData, parseBackupContent } from '../src/shared/backup';
import { sanitizeExportName } from '../src/shared/filename';
import type { NotebookData } from '../src/shared/types';

const data: NotebookData = {
  version: 1,
  folders: [{ id: 'folder-1', name: '备忘录', createdAt: 1 }],
  notes: [
    {
      id: 'note-1',
      folderId: 'folder-1',
      title: '标题',
      content: '<p>正文</p>',
      text: '正文',
      pinned: false,
      createdAt: 1,
      updatedAt: 2,
      deletedAt: null,
    },
  ],
  settings: { theme: 'system', sortBy: 'updatedAt', sortDir: 'desc' },
};

describe('backup validation', () => {
  it('parses a FreeNotes backup envelope', () => {
    const raw = JSON.stringify({
      format: 'freenotes-backup',
      formatVersion: 1,
      appVersion: '1.0.2',
      exportedAt: 123,
      data,
    });
    expect(parseBackupContent(raw)).toEqual(data);
  });

  it('accepts a bare notes-data.json file', () => {
    expect(extractNotebookData(data)).toEqual(data);
  });

  it('rejects unsupported envelope versions', () => {
    expect(() =>
      extractNotebookData({
        format: 'freenotes-backup',
        formatVersion: 2,
        appVersion: '2.0.0',
        exportedAt: 1,
        data,
      }),
    ).toThrow('备份格式版本不受支持');
  });

  it('rejects incomplete note data', () => {
    expect(isNotebookData({ ...data, notes: [{ id: 'broken' }] })).toBe(false);
    expect(() => parseBackupContent('{broken')).toThrow('有效的 JSON');
  });
});

describe('export file names', () => {
  it('removes characters that are invalid on Windows', () => {
    expect(sanitizeExportName('a/b\\c:d*e?f"g<h>i|j', 'fallback')).toBe('a_b_c_d_e_f_g_h_i_j');
  });

  it('falls back for empty titles and protects reserved names', () => {
    expect(sanitizeExportName('   ', '未命名备忘录')).toBe('未命名备忘录');
    expect(sanitizeExportName('CON', 'fallback')).toBe('_CON');
  });
});
