import type { Note, NotebookData, SortDirection, SortKey } from '../../shared/types';
import { cleanTitle } from './format';
import { collapseSearchText } from './text';

export function sortNotes(notes: Note[], sortBy: SortKey, direction: SortDirection): Note[] {
  const factor = direction === 'asc' ? 1 : -1;
  return [...notes].sort((a, b) => {
    if (sortBy === 'title') {
      const aTitle = cleanTitle(a.title) || a.text.trim().split('\n')[0] || '';
      const bTitle = cleanTitle(b.title) || b.text.trim().split('\n')[0] || '';
      return aTitle.localeCompare(bTitle, 'zh-CN', { numeric: true, sensitivity: 'base' }) * factor;
    }
    const aTime = sortBy === 'createdAt' ? a.createdAt : a.updatedAt;
    const bTime = sortBy === 'createdAt' ? b.createdAt : b.updatedAt;
    return (aTime - bTime) * factor;
  });
}

export function getNotePreview(note: Note, maxLength = 130): string {
  const text = collapseSearchText(note.text);
  if (!text) return '空白备忘录';
  return text.length > maxLength ? `${text.slice(0, maxLength).trimEnd()}…` : text;
}

export function activeNotes(data: NotebookData): Note[] {
  return data.notes.filter((note) => note.deletedAt === null);
}

export function trashedNotes(data: NotebookData): Note[] {
  return data.notes.filter((note) => note.deletedAt !== null);
}

export function notesInFolder(data: NotebookData, folderId: string): Note[] {
  return activeNotes(data).filter((note) => note.folderId === folderId);
}

export function firstLine(text: string): string {
  return text.split('\n').map((line) => line.trim()).find(Boolean) ?? '';
}

export function createNote(folderId: string): Note {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    folderId,
    title: '',
    content: '',
    text: '',
    pinned: false,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
}


/**
 * Apply an edit to one note. `updatedAt` only advances when the title or rich
 * text actually changes; selecting, pinning, moving or any no-op write must not
 * reorder the note list.
 */
export function applyNotePatch(
  notes: Note[],
  noteId: string,
  patch: Partial<Note>,
  now = Date.now(),
): Note[] {
  return notes.map((note) => {
    if (note.id !== noteId) return note;
    const touchesContent =
      (patch.title !== undefined && patch.title !== note.title) ||
      (patch.content !== undefined && patch.content !== note.content) ||
      (patch.text !== undefined && patch.text !== note.text);
    return {
      ...note,
      ...patch,
      id: note.id,
      updatedAt: touchesContent ? now : note.updatedAt,
    };
  });
}
