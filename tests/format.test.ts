import { describe, expect, it } from 'vitest';
import { countWords, formatFullDate, formatListDate, stripHtml } from '../src/renderer/lib/format';
import { normalizeData } from '../src/renderer/lib/data';
import type { NotebookData } from '../src/shared/types';

describe('Chinese date labels', () => {
  const now = new Date(2026, 10, 22, 17, 30).getTime();

  it('shows a clock for today', () => {
    expect(formatListDate(new Date(2026, 10, 22, 8, 5).getTime(), now)).toBe('08:05');
  });

  it('shows yesterday and weekday labels', () => {
    expect(formatListDate(new Date(2026, 10, 21, 12, 0).getTime(), now)).toBe('昨天');
    expect(formatListDate(new Date(2026, 10, 19, 12, 0).getTime(), now)).toBe('周四');
  });

  it('shows a month/day label in the same year', () => {
    expect(formatListDate(new Date(2026, 1, 3, 12, 0).getTime(), now)).toBe('2月3日');
  });

  it('includes the year for older items', () => {
    expect(formatListDate(new Date(2024, 1, 3, 12, 0).getTime(), now)).toBe('2024/2/3');
  });

  it('formats the full date used in the editor', () => {
    expect(formatFullDate(new Date(2026, 0, 9, 7, 4).getTime())).toBe('2026年1月9日 07:04');
  });
});

describe('text helpers', () => {
  it('counts CJK characters and latin words', () => {
    expect(countWords('你好，world!')).toBe(3);
    expect(countWords('   ')).toBe(0);
  });

  it('strips rich text down to readable plain text', () => {
    const html = '<p>第一条</p><ul><li>项目 A</li><li>项目 B</li></ul><p><strong>结尾</strong></p>';
    expect(stripHtml(html)).toContain('第一条');
    expect(stripHtml(html)).toContain('项目 A');
    expect(stripHtml(html)).toContain('结尾');
    expect(stripHtml(html)).not.toContain('<');
  });
});

describe('data normalization', () => {
  it('restores missing folders and settings safely', () => {
    const raw = {
      version: 1,
      folders: [],
      notes: [
        {
          id: 'note-1',
          folderId: 'missing',
          title: '标题',
          content: '',
          text: '',
          pinned: false,
          createdAt: 1,
          updatedAt: 1,
          deletedAt: null,
        },
      ],
      settings: {},
    } as unknown as NotebookData;

    const normalized = normalizeData(raw);
    expect(normalized.folders).toHaveLength(1);
    expect(normalized.notes[0].folderId).toBe(normalized.folders[0].id);
    expect(normalized.settings.theme).toBe('system');
    expect(normalized.settings.sortBy).toBe('updatedAt');
  });
});
