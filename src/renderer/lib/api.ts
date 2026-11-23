import type {
  AppInfo,
  AppPlatform,
  FreeNotesBackup,
  LoadResult,
  MacNotesApi,
  NotebookData,
  SaveResult,
} from '../../shared/types';

const STORAGE_KEY = 'macnotes.data.v1';
const PREVIEW_VERSION = '1.0.1-preview';
const browserPlatform: AppPlatform = 'browser';

function readBrowserData(): NotebookData | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as NotebookData;
  } catch {
    return null;
  }
}

function writeBrowserData(data: NotebookData): SaveResult {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return { ok: true, savedAt: Date.now() };
  } catch (error) {
    console.error('[freenotes] localStorage save failed', error);
    return { ok: false, error: '浏览器本地存储空间不足。' };
  }
}

function downloadText(fileName: string, contents: string, type: string) {
  try {
    const blob = new Blob([contents], { type });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    return { ok: true, filePath: fileName };
  } catch {
    return { ok: false, error: '浏览器下载失败。' };
  }
}

/** Browser fallback used for visual development and tests outside Electron. */
const browserApi: MacNotesApi = {
  platform: browserPlatform,
  load: async (): Promise<LoadResult> => ({
    data: readBrowserData(),
    dataPath: '浏览器预览模式（localStorage）',
    version: PREVIEW_VERSION,
  }),
  save: async (data: NotebookData): Promise<SaveResult> => {
    await new Promise((resolve) => setTimeout(resolve, 90));
    return writeBrowserData(data);
  },
  flush: (data: NotebookData): SaveResult => writeBrowserData(data),
  getInfo: async (): Promise<AppInfo> => ({
    version: PREVIEW_VERSION,
    dataPath: '浏览器预览模式（localStorage）',
    electron: false,
  }),
  showDataFolder: async () => undefined,
  openExternal: async (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  },
  exportBackup: async (data: NotebookData) => {
    const backup: FreeNotesBackup = {
      format: 'freenotes-backup',
      formatVersion: 1,
      appVersion: PREVIEW_VERSION,
      exportedAt: Date.now(),
      data,
    };
    return downloadText('FreeNotes-backup-browser.freenotes.json', JSON.stringify(backup), 'application/json');
  },
  restoreBackup: async () => ({
    ok: false,
    error: '从备份恢复仅在桌面版中可用。',
  }),
  exportNoteHtml: async (html: string, suggestedName: string) =>
    downloadText(`${suggestedName || '未命名备忘录'}.html`, html, 'text/html'),
  exportNotePdf: async () => ({
    ok: false,
    error: 'PDF 导出仅在桌面版中可用。',
  }),
  onMenuCommand: () => () => undefined,
  minimize: () => undefined,
  toggleMaximize: () => undefined,
  close: () => undefined,
};

export const api: MacNotesApi = window.macnotes ?? browserApi;
export const isElectron = Boolean(window.macnotes);
