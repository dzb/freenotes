import { contextBridge, ipcRenderer } from 'electron';
import type { MacNotesApi, NotebookData, SaveResult } from '../shared/types';

const api: MacNotesApi = {
  load: () => ipcRenderer.invoke('data:load'),
  save: (data: NotebookData) => ipcRenderer.invoke('data:save', data),
  flush: (data: NotebookData) => ipcRenderer.sendSync('data:flush', data) as SaveResult,
  getInfo: () => ipcRenderer.invoke('app:info'),
  showDataFolder: () => ipcRenderer.invoke('app:show-data-folder'),
  openExternal: (url: string) => ipcRenderer.invoke('shell:open-external', url),
  minimize: () => ipcRenderer.send('window:minimize'),
  toggleMaximize: () => ipcRenderer.send('window:toggle-maximize'),
  close: () => ipcRenderer.send('window:close'),
};

contextBridge.exposeInMainWorld('macnotes', api);
