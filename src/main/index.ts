import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  Menu,
  nativeTheme,
  shell,
} from 'electron';
import type { IpcMainEvent, IpcMainInvokeEvent } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import type { NotebookData, RestoreResult, SaveResult } from '../shared/types';
import { isNotebookData, parseBackupContent } from '../shared/backup';
import { migrateLegacyData } from './migrateData';
import { installApplicationMenu } from './menu';
import { exportBackupFile, exportNoteHtmlFile, exportNotePdfFile } from './files';

app.setName('FreeNotes');

const MAX_BACKUP_BYTES = 120 * 1024 * 1024;
const MAX_RESTORE_POINTS = 5;

// Allow scripts and portable installs to keep their data in an isolated directory.
const customNewDataDir = process.env.FREENOTES_DATA_DIR;
const customLegacyDataDir = process.env.MACNOTES_DATA_DIR;
const customDataDir = customNewDataDir ?? customLegacyDataDir;
if (customDataDir) {
  const resolvedDataDir = path.resolve(customDataDir);
  fs.mkdirSync(resolvedDataDir, { recursive: true });
  app.setPath('userData', resolvedDataDir);
}

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
let mainWindow: BrowserWindow | null = null;
let dataPath = '';
let backupDir = '';
let backupDay: string | null = null;
let writeGeneration = 0;
let startupError: Error | null = null;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

function todayKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function restoreStamp(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${todayKey()}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

function setupPaths() {
  const userData = app.getPath('userData');
  const legacyUserData =
    customLegacyDataDir !== undefined
      ? path.resolve(customLegacyDataDir)
      : path.join(app.getPath('appData'), 'MacNotes');

  try {
    const migration = migrateLegacyData(userData, legacyUserData);
    if (migration.migrated) {
      console.info('[freenotes] Migrated legacy MacNotes data from', migration.source);
    }
  } catch (error) {
    console.error('[freenotes] Failed to migrate legacy MacNotes data:', error);
    throw new Error('旧版 MacNotes 数据迁移失败，请检查数据目录权限。');
  }

  dataPath = path.join(userData, 'notes-data.json');
  backupDir = path.join(userData, 'backups');
  fs.mkdirSync(userData, { recursive: true });
  fs.mkdirSync(backupDir, { recursive: true });
}

async function readData(): Promise<NotebookData | null> {
  try {
    const raw = await fsp.readFile(dataPath, 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (!isNotebookData(parsed)) {
      throw new Error('数据格式不正确');
    }
    return parsed;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return null;
    console.error('[freenotes] Failed to read data file:', error);
    try {
      const corruptPath = path.join(app.getPath('userData'), `notes-data.corrupt-${Date.now()}.json`);
      await fsp.copyFile(dataPath, corruptPath);
      console.error('[freenotes] Preserved unreadable data at', corruptPath);
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
    console.error('[freenotes] Backup failed:', error);
  }
}

async function writeData(data: unknown): Promise<SaveResult> {
  if (!isNotebookData(data)) {
    return { ok: false, error: '数据格式无效，已取消保存。' };
  }
  const generation = ++writeGeneration;
  const json = JSON.stringify(data);
  if (json.length > MAX_BACKUP_BYTES) {
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
    console.error('[freenotes] Failed to save data:', error);
    return { ok: false, error: '写入本地文件失败。' };
  }
}

function writeDataSync(data: unknown): SaveResult {
  if (!isNotebookData(data)) {
    return { ok: false, error: '数据格式无效，已取消保存。' };
  }
  const generation = ++writeGeneration;
  const json = JSON.stringify(data);
  if (json.length > MAX_BACKUP_BYTES) {
    return { ok: false, error: '数据文件超过 120MB，保存已取消。' };
  }
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
    console.error('[freenotes] Failed to flush data:', error);
    return { ok: false, error: '写入本地文件失败。' };
  }
}

async function createRestoreSnapshot(data: NotebookData): Promise<void> {
  const snapshotPath = path.join(backupDir, `pre-restore-${restoreStamp()}.json`);
  const tmpPath = `${snapshotPath}.${process.pid}.tmp`;
  try {
    await fsp.writeFile(tmpPath, JSON.stringify(data), { mode: 0o600 });
    await fsp.rename(tmpPath, snapshotPath);
  } catch (error) {
    await fsp.rm(tmpPath, { force: true }).catch(() => undefined);
    throw error;
  }

  const entries = (await fsp.readdir(backupDir))
    .filter((name) => /^pre-restore-\d{4}-\d{2}-\d{2}-\d{6}\.json$/.test(name))
    .sort()
    .reverse();
  await Promise.all(entries.slice(MAX_RESTORE_POINTS).map((name) => fsp.rm(path.join(backupDir, name), { force: true })));
}

async function restoreBackup(currentData: NotebookData): Promise<RestoreResult> {
  try {
    const window = BrowserWindow.getFocusedWindow();
    const options: Electron.OpenDialogOptions = {
      title: '从 FreeNotes 备份恢复',
      properties: ['openFile'],
      filters: [{ name: 'FreeNotes 备份', extensions: ['json'] }],
    };
    const picked = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options);
    if (picked.canceled || picked.filePaths.length === 0) {
      return { ok: false, canceled: true };
    }

    const filePath = picked.filePaths[0];
    const stat = await fsp.stat(filePath);
    if (!stat.isFile() || stat.size > MAX_BACKUP_BYTES) {
      return { ok: false, error: '备份文件无效或超过 120MB 限制。' };
    }

    const raw = await fsp.readFile(filePath, 'utf8');
    const imported = parseBackupContent(raw);
    const folderCount = imported.folders.length;
    const trashCount = imported.notes.filter((note) => note.deletedAt !== null).length;
    const noteCount = imported.notes.length - trashCount;

    const confirmation = window
      ? await dialog.showMessageBox(window, {
          type: 'warning',
          buttons: ['取消', '恢复备份'],
          defaultId: 0,
          cancelId: 0,
          message: '恢复备份会覆盖当前全部备忘录。',
          detail: `备份包含 ${folderCount} 个文件夹、${noteCount} 条备忘录和 ${trashCount} 条最近删除。\n\n恢复前会自动保存当前数据快照。`,
        })
      : await dialog.showMessageBox({
          type: 'warning',
          buttons: ['取消', '恢复备份'],
          defaultId: 0,
          cancelId: 0,
          message: '恢复备份会覆盖当前全部备忘录。',
          detail: `备份包含 ${folderCount} 个文件夹、${noteCount} 条备忘录和 ${trashCount} 条最近删除。\n\n恢复前会自动保存当前数据快照。`,
        });
    if (confirmation.response !== 1) return { ok: false, canceled: true };

    await createRestoreSnapshot(currentData);
    const saved = await writeData(imported);
    if (!saved.ok) return { ok: false, error: saved.error ?? '恢复备份失败。' };
    return { ok: true, data: imported };
  } catch (error) {
    console.error('[freenotes] Backup restore failed:', error);
    const message = error instanceof Error ? error.message : '';
    return {
      ok: false,
      error: message.includes('备份') || message.includes('JSON') ? message : '恢复备份失败，请检查备份文件和数据目录权限。',
    };
  }
}

function createWindow() {
  const isMac = process.platform === 'darwin';
  mainWindow = new BrowserWindow({
    width: 1380,
    height: 880,
    minWidth: 980,
    minHeight: 640,
    show: false,
    title: 'FreeNotes',
    ...(isMac
      ? {
          titleBarStyle: 'hiddenInset' as const,
          trafficLightPosition: { x: 18, y: 20 },
        }
      : { frame: false }),
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#242320' : '#f6f3ed',
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
    if (startupError) throw startupError;
    const data = await readData();
    return { data, dataPath, version: app.getVersion() };
  });

  ipcMain.handle('data:save', async (_event: IpcMainInvokeEvent, data: unknown) => {
    if (startupError) return { ok: false, error: startupError.message };
    return writeData(data);
  });

  ipcMain.on('data:flush', (event: IpcMainEvent, data: unknown) => {
    event.returnValue = startupError
      ? { ok: false, error: startupError.message }
      : writeDataSync(data);
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

  ipcMain.handle('backup:export', async (_event, data: unknown) => {
    if (!isNotebookData(data)) return { ok: false, error: '当前数据格式无效，无法导出。' };
    return exportBackupFile(data);
  });

  ipcMain.handle('backup:restore', async (_event, currentData: unknown) => {
    if (startupError) return { ok: false, error: startupError.message };
    if (!isNotebookData(currentData)) return { ok: false, error: '当前数据格式无效，无法恢复。' };
    return restoreBackup(currentData);
  });

  ipcMain.handle('note:export-html', async (_event, html: unknown, suggestedName: unknown) => {
    if (typeof html !== 'string' || typeof suggestedName !== 'string') {
      return { ok: false, error: '导出参数无效。' };
    }
    return exportNoteHtmlFile(html, suggestedName);
  });

  ipcMain.handle('note:export-pdf', async (_event, html: unknown, suggestedName: unknown) => {
    if (typeof html !== 'string' || typeof suggestedName !== 'string') {
      return { ok: false, error: '导出参数无效。' };
    }
    return exportNotePdfFile(html, suggestedName);
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
    try {
      setupPaths();
    } catch (error) {
      startupError = error instanceof Error ? error : new Error('无法初始化数据目录。');
    }
    registerIpc();
    app.setAboutPanelOptions({
      applicationName: 'FreeNotes',
      applicationVersion: app.getVersion(),
      copyright: '本地优先的笔记应用',
    });
    installApplicationMenu(isDev);
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
