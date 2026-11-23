import type { AppInfo, LoadResult, MacNotesApi, NotebookData, SaveResult } from '../../shared/types';

const STORAGE_KEY = 'macnotes.data.v1';

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
    console.error('[macnotes] localStorage save failed', error);
    return { ok: false, error: '浏览器本地存储空间不足。' };
  }
}

/** Browser fallback used for visual development and tests outside Electron. */
const browserApi: MacNotesApi = {
  load: async (): Promise<LoadResult> => ({
    data: readBrowserData(),
    dataPath: '浏览器预览模式（localStorage）',
    version: '1.0.1-preview',
  }),
  save: async (data: NotebookData): Promise<SaveResult> => {
    await new Promise((resolve) => setTimeout(resolve, 90));
    return writeBrowserData(data);
  },
  flush: (data: NotebookData): SaveResult => writeBrowserData(data),
  getInfo: async (): Promise<AppInfo> => ({
    version: '1.0.1-preview',
    dataPath: '浏览器预览模式（localStorage）',
    electron: false,
  }),
  showDataFolder: async () => undefined,
  openExternal: async (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  },
  minimize: () => undefined,
  toggleMaximize: () => undefined,
  close: () => undefined,
};

export const api: MacNotesApi = window.macnotes ?? browserApi;
export const isElectron = Boolean(window.macnotes);
