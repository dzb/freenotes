import { contextBridge, ipcRenderer } from 'electron';
import type {
  AppPlatform,
  MacNotesApi,
  MenuCommand,
  NotebookData,
  SaveResult,
} from '../shared/types';

const platform: AppPlatform =
  process.platform === 'darwin'
    ? 'darwin'
    : process.platform === 'win32'
      ? 'win32'
      : process.platform === 'linux'
        ? 'linux'
        : 'browser';

const api: MacNotesApi = {
  platform,
  load: () => ipcRenderer.invoke('data:load'),
  save: (data: NotebookData) => ipcRenderer.invoke('data:save', data),
  flush: (data: NotebookData) => ipcRenderer.sendSync('data:flush', data) as SaveResult,
  getInfo: () => ipcRenderer.invoke('app:info'),
  showDataFolder: () => ipcRenderer.invoke('app:show-data-folder'),
  openExternal: (url: string) => ipcRenderer.invoke('shell:open-external', url),
  exportBackup: (data: NotebookData) => ipcRenderer.invoke('backup:export', data),
  restoreBackup: (currentData: NotebookData) => ipcRenderer.invoke('backup:restore', currentData),
  exportNoteHtml: (html: string, suggestedName: string) =>
    ipcRenderer.invoke('note:export-html', html, suggestedName),
  exportNotePdf: (html: string, suggestedName: string) =>
    ipcRenderer.invoke('note:export-pdf', html, suggestedName),
  saveAttachment: (fileName: string, mimeType: string, data: ArrayBuffer) =>
    ipcRenderer.invoke('attachment:save', fileName, mimeType, data),
  onMenuCommand: (handler: (command: MenuCommand) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, command: unknown) => {
      if (
        command === 'new-note' ||
        command === 'new-folder' ||
        command === 'focus-search' ||
        command === 'open-preferences'
      ) {
        handler(command);
      }
    };
    ipcRenderer.on('menu:command', listener);
    return () => ipcRenderer.removeListener('menu:command', listener);
  },
  minimize: () => ipcRenderer.send('window:minimize'),
  toggleMaximize: () => ipcRenderer.send('window:toggle-maximize'),
  close: () => ipcRenderer.send('window:close'),
};

contextBridge.exposeInMainWorld('macnotes', api);
