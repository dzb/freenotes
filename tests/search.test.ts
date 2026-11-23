import { describe, expect, it } from 'vitest';
import type { Note } from '../src/shared/types';
import { parseSearchQuery, searchNotes, displayNoteTitle, highlightTerms } from '../src/renderer/lib/search';

const makeNote = (overrides: Partial<Note>): Note => ({
  id: crypto.randomUUID(),
  folderId: 'folder',
  title: '',
  content: '',
  text: '',
  pinned: false,
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_000,
  deletedAt: null,
  ...overrides,
});

describe('parseSearchQuery', () => {
  it('splits on whitespace and removes duplicates', () => {
    expect(parseSearchQuery('  hello   WORLD hello ').displayTokens).toEqual(['hello', 'WORLD']);
  });

  it('keeps quoted phrases intact', () => {
    expect(parseSearchQuery('"local first" notes').displayTokens).toEqual(['local first', 'notes']);
  });

  it('normalizes case and accents', () => {
    expect(parseSearchQuery('Café').normalizedTokens).toEqual(['cafe']);
  });
});

describe('searchNotes', () => {
  const notes = [
    makeNote({
      id: 'body',
      title: '日常记录',
      text: '今天想到一个关于灵感整理的方法。',
      updatedAt: 200,
    }),
    makeNote({
      id: 'title',
      title: '灵感清单',
      text: '散步时想到的几件事。',
      updatedAt: 100,
    }),
    makeNote({
      id: 'deleted',
      title: '灵感回收站',
      text: '不应该出现在搜索结果里',
      deletedAt: 300,
      updatedAt: 300,
    }),
    makeNote({
      id: 'other',
      title: '旅行',
      text: '去海边住两天。',
      updatedAt: 50,
    }),
  ];

  it('searches both titles and body content in Chinese', () => {
    const results = searchNotes(notes, '灵感');
    expect(results.map((result) => result.note.id)).toEqual(['title', 'body']);
    expect(results.every((result) => result.snippet.includes('灵感') || result.note.title.includes('灵感'))).toBe(true);
    const bodySnippet = results.find((result) => result.note.id === 'body')?.snippet ?? '';
    expect(bodySnippet.indexOf('灵感')).toBeLessThan(45);
  });

  it('requires every term to match', () => {
    expect(searchNotes(notes, '灵感 散步')).toHaveLength(1);
    expect(searchNotes(notes, '灵感 海边')).toHaveLength(0);
  });

  it('supports quoted phrases and English case folding', () => {
    const english = [
      makeNote({ id: 'english', title: 'Ideas', text: 'A local-first note taking app.', updatedAt: 2 }),
      makeNote({ id: 'english-2', title: 'Other', text: 'Local note taking.', updatedAt: 1 }),
    ];
    expect(searchNotes(english, '"local-first" note').map((result) => result.note.id)).toEqual(['english']);
    expect(searchNotes(english, 'LOCAL NOTE')).toHaveLength(2);
  });

  it('excludes notes in the trash', () => {
    expect(searchNotes(notes, '回收站')).toHaveLength(0);
  });

  it('prefers title matches over body matches', () => {
    const results = searchNotes(notes, '灵感');
    expect(results[0].matchedTitle).toBe(true);
  });

  it('never returns results for an empty query', () => {
    expect(searchNotes(notes, '   ')).toHaveLength(0);
    expect(highlightTerms('   ')).toEqual([]);
  });

  it('falls back to the first line when a note has no title', () => {
    const note = makeNote({ title: '', text: '没有标题的第一行\n第二行' });
    expect(displayNoteTitle(note)).toBe('没有标题的第一行');
  });
});
