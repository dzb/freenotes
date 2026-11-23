export type ThemePreference = 'system' | 'light' | 'dark';
export type SortKey = 'updatedAt' | 'createdAt' | 'title';
export type SortDirection = 'asc' | 'desc';

export interface Folder {
  id: string;
  name: string;
  createdAt: number;
}

export interface Note {
  id: string;
  folderId: string;
  title: string;
  /** Rich-text HTML produced by TipTap. */
  content: string;
  /** Plain text used for snippets and full-text search. */
  text: string;
  pinned: boolean;
  createdAt: number;
  updatedAt: number;
  /** null means the note is not in the trash. */
  deletedAt: number | null;
}

export interface NotebookSettings {
  theme: ThemePreference;
  sortBy: SortKey;
  sortDir: SortDirection;
}

export interface NotebookData {
  version: 1;
  folders: Folder[];
  notes: Note[];
  settings: NotebookSettings;
}

export interface LoadResult {
  data: NotebookData | null;
  dataPath: string;
  version: string;
}

export interface SaveResult {
  ok: boolean;
  savedAt?: number;
  error?: string;
}

export interface AppInfo {
  version: string;
  dataPath: string;
  electron: boolean;
}

export interface MacNotesApi {
  load: () => Promise<LoadResult>;
  save: (data: NotebookData) => Promise<SaveResult>;
  /** Synchronous last-chance write used while the window is closing. */
  flush: (data: NotebookData) => SaveResult;
  getInfo: () => Promise<AppInfo>;
  showDataFolder: () => Promise<void>;
  openExternal: (url: string) => Promise<void>;
  minimize: () => void;
  toggleMaximize: () => void;
  close: () => void;
}
