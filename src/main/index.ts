import { app, BrowserWindow, clipboard, ipcMain, Menu, nativeTheme, shell } from 'electron';
import type { IpcMainEvent, IpcMainInvokeEvent } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import type { NotebookData, SaveResult } from '../shared/types';

app.setName('MacNotes');

// Allow scripts and portable installs to keep their data in an isolated directory.
if (process.env.MACNOTES_DATA_DIR) {
  const customDataDir = path.resolve(process.env.MACNOTES_DATA_DIR);
  fs.mkdirSync(customDataDir, { recursive: true });
  app.setPath('userData', customDataDir);
}

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
let mainWindow: BrowserWindow | null = null;
let dataPath = '';
let backupDir = '';
let backupDay: string | null = null;
let writeGeneration = 0;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

function todayKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function setupPaths() {
  const userData = app.getPath('userData');
  dataPath = path.join(userData, 'notes-data.json');
  backupDir = path.join(userData, 'backups');
  fs.mkdirSync(userData, { recursive: true });
  fs.mkdirSync(backupDir, { recursive: true });
}

function isValidNotebookData(value: unknown): value is NotebookData {
  if (!value || typeof value !== 'object') return false;
  const data = value as Partial<NotebookData>;
  if (data.version !== 1) return false;
  if (!Array.isArray(data.folders) || !Array.isArray(data.notes)) return false;
  if (!data.settings || typeof data.settings !== 'object') return false;
  const foldersOk = data.folders.every(
    (f) => f && typeof f.id === 'string' && typeof f.name === 'string' && typeof f.createdAt === 'number',
  );
  const notesOk = data.notes.every(
    (n) =>
      n &&
      typeof n.id === 'string' &&
      typeof n.folderId === 'string' &&
      typeof n.title === 'string' &&
      typeof n.content === 'string' &&
      typeof n.text === 'string' &&
      typeof n.createdAt === 'number' &&
      typeof n.updatedAt === 'number' &&
      (n.deletedAt === null || typeof n.deletedAt === 'number'),
  );
  return foldersOk && notesOk;
}

async function readData(): Promise<NotebookData | null> {
  try {
    const raw = await fsp.readFile(dataPath, 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (!isValidNotebookData(parsed)) {
      throw new Error('数据格式不正确');
    }
    return parsed;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return null;
    console.error('[macnotes] Failed to read data file:', error);
    try {
      const corruptPath = path.join(app.getPath('userData'), `notes-data.corrupt-${Date.now()}.json`);
      await fsp.copyFile(dataPath, corruptPath);
      console.error('[macnotes] Preserved unreadable data at', corruptPath);
    } catch {
      // Keep the original file untouched if the safety copy fails.
      return null;
    }
    return null;
  }
}

async function maybeBackupExistingFile(): Promise<void> {
  const day = todayKey();
  if (backupDay === day) return;
  backupDay = day;
  try {
    await fsp.access(dataPath);
  } catch {
    return;
  }
  try {
    const backupPath = path.join(backupDir, `notes-${day}.json`);
    await fsp.copyFile(dataPath, backupPath);
    const entries = (await fsp.readdir(backupDir))
      .filter((name) => /^notes-\d{4}-\d{2}-\d{2}\.json$/.test(name))
      .sort()
      .reverse();
    await Promise.all(entries.slice(10).map((name) => fsp.rm(path.join(backupDir, name), { force: true })));
  } catch (error) {
    console.error('[macnotes] Backup failed:', error);
  }
}

async function writeData(data: unknown): Promise<SaveResult> {
  if (!isValidNotebookData(data)) {
    return { ok: false, error: '数据格式无效，已取消保存。' };
  }
  const generation = ++writeGeneration;
  const json = JSON.stringify(data);
  if (json.length > 120 * 1024 * 1024) {
    return { ok: false, error: '数据文件超过 120MB，保存已取消。' };
  }

  await maybeBackupExistingFile();
  const tmpPath = `${dataPath}.${process.pid}.${generation}.tmp`;
  try {
    const handle = await fsp.open(tmpPath, 'w', 0o600);
    try {
      await handle.writeFile(json, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
    if (generation !== writeGeneration) {
      await fsp.rm(tmpPath, { force: true });
      return { ok: true, savedAt: Date.now() };
    }
    await fsp.rename(tmpPath, dataPath);
    return { ok: true, savedAt: Date.now() };
  } catch (error) {
    await fsp.rm(tmpPath, { force: true }).catch(() => undefined);
    console.error('[macnotes] Failed to save data:', error);
    return { ok: false, error: '写入本地文件失败。' };
  }
}

function writeDataSync(data: unknown): SaveResult {
  if (!isValidNotebookData(data)) {
    return { ok: false, error: '数据格式无效，已取消保存。' };
  }
  const generation = ++writeGeneration;
  const json = JSON.stringify(data);
  const tmpPath = `${dataPath}.${process.pid}.${generation}.flush.tmp`;
  try {
    fs.writeFileSync(tmpPath, json, { encoding: 'utf8', mode: 0o600 });
    if (generation !== writeGeneration) {
      fs.rmSync(tmpPath, { force: true });
      return { ok: true, savedAt: Date.now() };
    }
    fs.renameSync(tmpPath, dataPath);
    return { ok: true, savedAt: Date.now() };
  } catch (error) {
    try {
      fs.rmSync(tmpPath, { force: true });
    } catch {
      // ignore cleanup failures
    }
    console.error('[macnotes] Failed to flush data:', error);
    return { ok: false, error: '写入本地文件失败。' };
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1380,
    height: 880,
    minWidth: 980,
    minHeight: 640,
    show: false,
    frame: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#242320' : '#f6f3ed',
    title: '备忘录',
    icon: app.isPackaged
      ? path.join(process.resourcesPath, 'icon.png')
      : path.join(__dirname, '../resources/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
    },
  });

  mainWindow.setMenuBarVisibility(false);
  const revealWindow = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (!mainWindow.isVisible()) mainWindow.show();
  };
  mainWindow.once('ready-to-show', revealWindow);
  // Fallback for environments where ready-to-show is skipped (some Linux WMs and
  // automation setups). The content is already loaded, so showing it is safe.
  mainWindow.webContents.once('did-finish-load', () => {
    setTimeout(revealWindow, 120);
  });

  if (isDev) {
    void mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL as string);
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../dist-renderer/index.html'));
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const current = mainWindow?.webContents.getURL();
    if (url !== current) {
      event.preventDefault();
      if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
    }
  });

  mainWindow.webContents.on('context-menu', (_event, params) => {
    const template: Electron.MenuItemConstructorOptions[] = [];
    if (params.misspelledWord) {
      for (const suggestion of params.dictionarySuggestions.slice(0, 5)) {
        template.push({ label: suggestion, click: () => mainWindow?.webContents.replaceMisspelling(suggestion) });
      }
      if (params.dictionarySuggestions.length === 0) {
        template.push({ label: '没有拼写建议', enabled: false });
      }
      template.push({
        label: '添加到词典',
        click: () => mainWindow?.webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord),
      });
      template.push({ type: 'separator' });
    }
    if (params.linkURL) {
      template.push(
        {
          label: '在浏览器中打开链接',
          click: () => {
            if (/^https?:/i.test(params.linkURL)) void shell.openExternal(params.linkURL);
          },
        },
        {
          label: '复制链接地址',
          click: () => clipboard.writeText(params.linkURL),
        },
        { type: 'separator' },
      );
    }
    if (params.isEditable) {
      template.push(
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '拷贝' },
        { role: 'paste', label: '粘贴' },
        { type: 'separator' },
        { role: 'selectAll', label: '全选' },
      );
    } else if (params.selectionText.trim()) {
      template.push({ role: 'copy', label: '拷贝' });
    }
    if (template.length > 0) {
      Menu.buildFromTemplate(template).popup({ window: mainWindow ?? undefined });
    }
  });

  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.control && input.shift && input.key.toLowerCase() === 'i') {
      event.preventDefault();
      mainWindow?.webContents.toggleDevTools();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function registerIpc() {
  ipcMain.handle('data:load', async () => {
    const data = await readData();
    return { data, dataPath, version: app.getVersion() };
  });

  ipcMain.handle('data:save', async (_event: IpcMainInvokeEvent, data: unknown) => writeData(data));

  ipcMain.on('data:flush', (event: IpcMainEvent, data: unknown) => {
    event.returnValue = writeDataSync(data);
  });

  ipcMain.handle('app:info', () => ({
    version: app.getVersion(),
    dataPath,
    electron: true,
  }));

  ipcMain.handle('app:show-data-folder', async () => {
    if (fs.existsSync(dataPath)) {
      shell.showItemInFolder(dataPath);
    } else {
      await shell.openPath(path.dirname(dataPath));
    }
  });

  ipcMain.handle('shell:open-external', async (_event, url: unknown) => {
    if (typeof url === 'string' && /^(https?:|mailto:)/i.test(url)) {
      await shell.openExternal(url);
    }
  });

  ipcMain.on('window:minimize', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize();
  });
  ipcMain.on('window:toggle-maximize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  });
  ipcMain.on('window:close', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close();
  });
}

if (gotLock) {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });

  app.whenReady().then(() => {
    setupPaths();
    registerIpc();
    Menu.setApplicationMenu(null);
    app.setAboutPanelOptions({
      applicationName: '备忘录',
      applicationVersion: app.getVersion(),
      copyright: '本地优先的笔记应用',
    });
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
