export type ThemePreference = 'system' | 'light' | 'dark';
export type SortKey = 'updatedAt' | 'createdAt' | 'title';
export type SortDirection = 'asc' | 'desc';
export type FontFamily = 'system' | 'serif' | 'mono';
export type FontSize = 11 | 13 | 14 | 15 | 16;
export type AppPlatform = 'darwin' | 'win32' | 'linux' | 'browser';

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
  fontFamily: FontFamily;
  fontSize: FontSize;
}

export interface NotebookData {
  version: 1;
  folders: Folder[];
  notes: Note[];
  settings: NotebookSettings;
}

export interface AttachmentRecord {
  id: string;
  relativePath: string;
  fileName: string;
  mimeType: string;
  byteSize: number;
  sha256: string;
  createdAt: number;
}

export interface FreeNotesBackup {
  format: 'freenotes-backup';
  formatVersion: 1;
  appVersion: string;
  exportedAt: number;
  data: NotebookData;
}

export interface FreeNotesBackupV2 {
  format: 'freenotes-backup';
  formatVersion: 2;
  appVersion: string;
  exportedAt: number;
  data: NotebookData;
  attachments: AttachmentRecord[];
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

export interface FileExportResult {
  ok: boolean;
  canceled?: boolean;
  filePath?: string;
  error?: string;
}

export interface RestoreResult {
  ok: boolean;
  canceled?: boolean;
  data?: NotebookData;
  error?: string;
}

export interface SaveAttachmentResult {
  ok: boolean;
  attachment?: AttachmentRecord;
  url?: string;
  error?: string;
}

export interface AppInfo {
  version: string;
  dataPath: string;
  electron: boolean;
}

export type MenuCommand =
  | 'new-note'
  | 'new-folder'
  | 'focus-search'
  | 'open-preferences';

export interface MacNotesApi {
  platform: AppPlatform;
  load: () => Promise<LoadResult>;
  save: (data: NotebookData) => Promise<SaveResult>;
  /** Synchronous last-chance write used while the window is closing. */
  flush: (data: NotebookData) => SaveResult;
  getInfo: () => Promise<AppInfo>;
  showDataFolder: () => Promise<void>;
  openExternal: (url: string) => Promise<void>;
  exportBackup: (data: NotebookData) => Promise<FileExportResult>;
  restoreBackup: (currentData: NotebookData) => Promise<RestoreResult>;
  exportNoteHtml: (html: string, suggestedName: string) => Promise<FileExportResult>;
  exportNotePdf: (html: string, suggestedName: string) => Promise<FileExportResult>;
  saveAttachment: (
    fileName: string,
    mimeType: string,
    data: ArrayBuffer,
  ) => Promise<SaveAttachmentResult>;
  onMenuCommand: (handler: (command: MenuCommand) => void) => () => void;
  minimize: () => void;
  toggleMaximize: () => void;
  close: () => void;
}
