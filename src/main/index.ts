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
import { normalizeSettings } from '../shared/settings';
import { migrateLegacyData } from './migrateData';
import { installApplicationMenu } from './menu';
import { exportNoteHtmlFile, exportNotePdfFile } from './files';
import { NotebookDatabase } from './database';
import {
  AttachmentStore,
  assetUrlFor,
  migrateNotebookInlineImages,
  registerAttachmentProtocol,
  registerAttachmentScheme,
} from './attachments';
import {
  cleanupBackupInspection,
  exportBackupBundle,
  importBackupAttachments,
  readBackupBundle,
  type BackupInspection,
} from './backupBundle';

app.setName('FreeNotes');
registerAttachmentScheme();

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
let database: NotebookDatabase | null = null;
let attachmentStore: AttachmentStore | null = null;
let dataPath = '';
let legacyJsonPath = '';
let backupDir = '';
let backupDay: string | null = null;
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

async function setupPaths() {
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

  dataPath = path.join(userData, 'notes.db');
  legacyJsonPath = path.join(userData, 'notes-data.json');
  backupDir = path.join(userData, 'backups');
  fs.mkdirSync(userData, { recursive: true });
  fs.mkdirSync(backupDir, { recursive: true });
  database = new NotebookDatabase(dataPath);
  attachmentStore = new AttachmentStore(userData, database);

  if (database.isInitialized() && database.needsAttachmentMigration()) {
    const current = database.load();
    if (current) {
      const migrated = await migrateNotebookInlineImages(current, attachmentStore);
      const saved = database.save(migrated.data);
      if (!saved.ok) throw new Error(saved.error ?? '旧图片迁移到附件目录失败。');
      database.saveAttachments(migrated.attachments);
    }
    database.markAttachmentMigrationComplete();
  }

  if (!database.isInitialized() && fs.existsSync(legacyJsonPath)) {
    const raw = await fsp.readFile(legacyJsonPath, 'utf8');
    let imported: NotebookData;
    try {
      imported = parseBackupContent(raw);
    } catch (error) {
      console.error('[freenotes] Failed to parse legacy JSON data:', error);
      throw new Error('旧版 notes-data.json 无法解析，已保留原文件。');
    }
    const migrated = await migrateNotebookInlineImages(imported, attachmentStore);
    const result = database.replace(migrated.data, migrated.attachments);
    if (!result.ok) throw new Error(result.error ?? '旧版数据导入 SQLite 失败。');
    console.info('[freenotes] Imported legacy notes-data.json into notes.db');
  }
}

async function readData(): Promise<NotebookData | null> {
  if (!database) throw new Error('本地数据库尚未初始化。');
  return database.load();
}

function maybeBackupExistingFile(): void {
  const day = todayKey();
  if (backupDay === day) return;
  backupDay = day;
  if (!database?.isInitialized()) return;
  try {
    const backupPath = path.join(backupDir, `notes-${day}.db`);
    database.createSnapshot(backupPath);
    const entries = fs
      .readdirSync(backupDir)
      .filter((name) => /^notes-\d{4}-\d{2}-\d{2}\.db$/.test(name))
      .sort()
      .reverse();
    for (const name of entries.slice(10)) fs.rmSync(path.join(backupDir, name), { force: true });
  } catch (error) {
    console.error('[freenotes] Database backup failed:', error);
  }
}

async function writeData(data: unknown): Promise<SaveResult> {
  if (!database) return { ok: false, error: '本地数据库尚未初始化。' };
  if (!isNotebookData(data)) {
    return { ok: false, error: '数据格式无效，已取消保存。' };
  }
  maybeBackupExistingFile();
  return database.save(data);
}

function writeDataSync(data: unknown): SaveResult {
  if (!database) return { ok: false, error: '本地数据库尚未初始化。' };
  if (!isNotebookData(data)) {
    return { ok: false, error: '数据格式无效，已取消保存。' };
  }
  return database.save(data);
}

function createRestoreSnapshot(): void {
  if (!database) throw new Error('本地数据库尚未初始化。');
  const snapshotPath = path.join(backupDir, `pre-restore-${restoreStamp()}.db`);
  database.createSnapshot(snapshotPath);
  const entries = fs
    .readdirSync(backupDir)
    .filter((name) => /^pre-restore-\d{4}-\d{2}-\d{2}-\d{6}\.db$/.test(name))
    .sort()
    .reverse();
  for (const name of entries.slice(MAX_RESTORE_POINTS)) fs.rmSync(path.join(backupDir, name), { force: true });
}

async function restoreBackup(_currentData: NotebookData): Promise<RestoreResult> {
  let inspection: BackupInspection | null = null;
  try {
    const window = BrowserWindow.getFocusedWindow();
    const options: Electron.OpenDialogOptions = {
      title: '从 FreeNotes 备份恢复',
      properties: ['openFile'],
      filters: [
        { name: 'FreeNotes 备份', extensions: ['zip', 'json'] },
        { name: 'JSON 备份（旧版）', extensions: ['json'] },
      ],
    };
    const picked = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options);
    if (picked.canceled || picked.filePaths.length === 0) {
      return { ok: false, canceled: true };
    }

    if (!database || !attachmentStore) return { ok: false, error: '本地数据库尚未初始化。' };
    const filePath = picked.filePaths[0];
    const isZip = filePath.toLowerCase().endsWith('.zip');
    let imported: NotebookData;
    if (isZip) {
      inspection = await readBackupBundle(filePath);
      imported = inspection.data;
    } else {
      imported = parseBackupContent(await fsp.readFile(filePath, 'utf8'));
    }
    imported = { ...imported, settings: normalizeSettings(imported.settings) };

    const folderCount = imported.folders.length;
    const trashCount = imported.notes.filter((note) => note.deletedAt !== null).length;
    const noteCount = imported.notes.length - trashCount;
    const detail = `备份包含 ${folderCount} 个文件夹、${noteCount} 条备忘录和 ${trashCount} 条最近删除。\n\n恢复前会自动保存当前数据库快照。`;
    const confirmation = window
      ? await dialog.showMessageBox(window, {
          type: 'warning',
          buttons: ['取消', '恢复备份'],
          defaultId: 0,
          cancelId: 0,
          message: '恢复备份会覆盖当前全部备忘录。',
          detail,
        })
      : await dialog.showMessageBox({
          type: 'warning',
          buttons: ['取消', '恢复备份'],
          defaultId: 0,
          cancelId: 0,
          message: '恢复备份会覆盖当前全部备忘录。',
          detail,
        });
    if (confirmation.response !== 1) return { ok: false, canceled: true };

    createRestoreSnapshot();
    const manifestAttachments = inspection ? await importBackupAttachments(inspection, attachmentStore) : [];
    const inlineMigrated = await migrateNotebookInlineImages(imported, attachmentStore);
    const restored = inlineMigrated.data;
    const attachmentMap = new Map(
      [...manifestAttachments, ...inlineMigrated.attachments].map((attachment) => [
        attachment.relativePath,
        attachment,
      ]),
    );
    const saved = database.replace(restored, [...attachmentMap.values()]);
    if (!saved.ok) return { ok: false, error: saved.error ?? '恢复备份失败。' };
    return { ok: true, data: restored };
  } catch (error) {
    console.error('[freenotes] Backup restore failed:', error);
    const message = error instanceof Error ? error.message : '';
    return {
      ok: false,
      error: message.includes('备份') || message.includes('JSON') ? message : '恢复备份失败，请检查备份文件和数据目录权限。',
    };
  } finally {
    if (inspection) await cleanupBackupInspection(inspection);
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
    if (!attachmentStore) return { ok: false, error: '附件存储尚未初始化。' };
    return exportBackupBundle(data, attachmentStore);
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
    if (!attachmentStore) return { ok: false, error: '附件存储尚未初始化。' };
    try {
      return exportNoteHtmlFile(await attachmentStore.inlineAssets(html), suggestedName);
    } catch (error) {
      console.error('[freenotes] Failed to inline attachments for HTML export:', error);
      return { ok: false, error: '导出 HTML 失败，部分图片附件缺失。' };
    }
  });

  ipcMain.handle('note:export-pdf', async (_event, html: unknown, suggestedName: unknown) => {
    if (typeof html !== 'string' || typeof suggestedName !== 'string') {
      return { ok: false, error: '导出参数无效。' };
    }
    if (!attachmentStore) return { ok: false, error: '附件存储尚未初始化。' };
    try {
      return exportNotePdfFile(await attachmentStore.inlineAssets(html), suggestedName);
    } catch (error) {
      console.error('[freenotes] Failed to inline attachments for PDF export:', error);
      return { ok: false, error: '导出 PDF 失败，部分图片附件缺失。' };
    }
  });

  ipcMain.handle('attachment:save', async (_event, fileName: unknown, mimeType: unknown, data: unknown) => {
    if (typeof fileName !== 'string' || typeof mimeType !== 'string') {
      return { ok: false, error: '附件参数无效。' };
    }
    if (!attachmentStore) return { ok: false, error: '附件存储尚未初始化。' };
    try {
      const bytes =
        data instanceof Uint8Array
          ? data
          : data instanceof ArrayBuffer
            ? new Uint8Array(data)
            : null;
      if (!bytes) return { ok: false, error: '附件内容无效。' };
      const attachment = await attachmentStore.saveBuffer(bytes, fileName, mimeType);
      return { ok: true, attachment, url: assetUrlFor(attachment.relativePath) };
    } catch (error) {
      console.error('[freenotes] Failed to save attachment:', error);
      return { ok: false, error: error instanceof Error ? error.message : '保存图片附件失败。' };
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

  app.whenReady().then(async () => {
    try {
      await setupPaths();
    } catch (error) {
      startupError = error instanceof Error ? error : new Error('无法初始化数据目录。');
    }
    if (attachmentStore) registerAttachmentProtocol(attachmentStore);
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

  app.on('will-quit', () => {
    database?.close();
    database = null;
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
