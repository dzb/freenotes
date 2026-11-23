import { describe, expect, it } from 'vitest';
import type { Note } from '../src/shared/types';
import { applyNotePatch } from '../src/renderer/lib/note';

const makeNote = (overrides: Partial<Note> = {}): Note => ({
  id: 'note-1',
  folderId: 'folder-1',
  title: '标题',
  content: '<p>正文</p>',
  text: '正文',
  pinned: false,
  createdAt: 1_000,
  updatedAt: 2_000,
  deletedAt: null,
  ...overrides,
});

describe('applyNotePatch', () => {
  it('does not advance updatedAt for a no-op content write', () => {
    const notes = [makeNote()];
    const patched = applyNotePatch(
      notes,
      'note-1',
      { content: '<p>正文</p>', text: '正文' },
      9_000,
    );
    expect(patched[0].updatedAt).toBe(2_000);
  });

  it('does not advance updatedAt when pinning or moving a note', () => {
    const notes = [makeNote()];
    expect(applyNotePatch(notes, 'note-1', { pinned: true }, 9_000)[0].updatedAt).toBe(2_000);
    expect(applyNotePatch(notes, 'note-1', { folderId: 'folder-2' }, 9_000)[0].updatedAt).toBe(2_000);
    expect(applyNotePatch(notes, 'note-1', { deletedAt: 8_000 }, 9_000)[0].updatedAt).toBe(2_000);
  });

  it('advances updatedAt only when the title or body really changes', () => {
    const notes = [makeNote()];
    expect(applyNotePatch(notes, 'note-1', { title: '新标题' }, 9_000)[0].updatedAt).toBe(9_000);
    expect(
      applyNotePatch(notes, 'note-1', { content: '<p>新正文</p>', text: '新正文' }, 9_000)[0].updatedAt,
    ).toBe(9_000);
    expect(applyNotePatch(notes, 'note-1', { title: '标题' }, 9_000)[0].updatedAt).toBe(2_000);
  });

  it('leaves all other notes untouched', () => {
    const other = makeNote({ id: 'note-2', title: '另一条', updatedAt: 3_000 });
    const patched = applyNotePatch([makeNote(), other], 'note-1', { title: '新标题' }, 9_000);
    expect(patched[1]).toBe(other);
  });
});
