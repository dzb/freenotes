import type { Folder, Note, NotebookData } from '../../shared/types';
import { DEFAULT_SETTINGS, normalizeSettings } from '../../shared/settings';

export { DEFAULT_SETTINGS };

export function createFolder(name: string): Folder {
  return {
    id: crypto.randomUUID(),
    name: name.trim() || '新建文件夹',
    createdAt: Date.now(),
  };
}

export function createEmptyData(): NotebookData {
  const folder: Folder = {
    id: crypto.randomUUID(),
    name: '备忘录',
    createdAt: Date.now(),
  };
  return {
    version: 1,
    folders: [folder],
    notes: [],
    settings: { ...DEFAULT_SETTINGS },
  };
}

function normalizeNote(raw: Partial<Note>, fallbackFolderId: string): Note {
  const createdAt = typeof raw.createdAt === 'number' ? raw.createdAt : Date.now();
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : crypto.randomUUID(),
    folderId: typeof raw.folderId === 'string' && raw.folderId ? raw.folderId : fallbackFolderId,
    title: typeof raw.title === 'string' ? raw.title : '',
    content: typeof raw.content === 'string' ? raw.content : '',
    text: typeof raw.text === 'string' ? raw.text : '',
    pinned: Boolean(raw.pinned),
    createdAt,
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : createdAt,
    deletedAt: typeof raw.deletedAt === 'number' ? raw.deletedAt : null,
  };
}

/** Make data loaded from disk safe to use, even if it was edited by hand. */
export function normalizeData(raw: NotebookData): NotebookData {
  const folders: Folder[] = Array.isArray(raw.folders)
    ? raw.folders
        .filter((folder): folder is Folder => Boolean(folder && typeof folder.id === 'string' && typeof folder.name === 'string'))
        .map((folder) => ({
          ...folder,
          name: folder.name.trim() || '未命名文件夹',
          createdAt: typeof folder.createdAt === 'number' ? folder.createdAt : Date.now(),
        }))
    : [];

  if (folders.length === 0) {
    folders.push({ id: crypto.randomUUID(), name: '备忘录', createdAt: Date.now() });
  }

  const folderIds = new Set(folders.map((folder) => folder.id));
  const fallbackFolderId = folders[0].id;
  const notes = Array.isArray(raw.notes)
    ? raw.notes
        .filter((note): note is Note => Boolean(note && typeof note.id === 'string'))
        .map((note) => {
          const normalized = normalizeNote(note, fallbackFolderId);
          if (!folderIds.has(normalized.folderId)) normalized.folderId = fallbackFolderId;
          return normalized;
        })
    : [];

  const settings = normalizeSettings(raw.settings);

  return { version: 1, folders, notes, settings };
}
