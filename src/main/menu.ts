import { app, BrowserWindow, Menu, shell } from 'electron';
import type { MenuItemConstructorOptions } from 'electron';
import type { MenuCommand } from '../shared/types';

const REPOSITORY_URL = 'https://github.com/dzb/freenotes';

function send(command: MenuCommand) {
  const window = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
  window?.webContents.send('menu:command', command);
}

export function installApplicationMenu(isDev: boolean): void {
  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(null);
    return;
  }

  const viewItems: MenuItemConstructorOptions[] = [
    { role: 'togglefullscreen', label: '进入全屏幕' },
  ];
  if (isDev) {
    viewItems.push(
      { type: 'separator' },
      { role: 'reload', label: '重新载入' },
      { role: 'toggleDevTools', label: '切换开发者工具' },
    );
  }

  const template: MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [
        { role: 'about', label: `关于 ${app.name}` },
        { type: 'separator' },
        {
          label: '设置…',
          accelerator: 'Cmd+,',
          click: () => send('open-preferences'),
        },
        { type: 'separator' },
        { role: 'services', label: '服务', submenu: [] },
        { type: 'separator' },
        { role: 'hide', label: `隐藏 ${app.name}` },
        { role: 'hideOthers', label: '隐藏其他' },
        { role: 'unhide', label: '全部显示' },
        { type: 'separator' },
        { role: 'quit', label: `退出 ${app.name}` },
      ],
    },
    {
      label: '文件',
      submenu: [
        {
          label: '新建备忘录',
          accelerator: 'Cmd+N',
          click: () => send('new-note'),
        },
        {
          label: '新建文件夹',
          accelerator: 'Cmd+Shift+N',
          click: () => send('new-folder'),
        },
        { type: 'separator' },
        { role: 'close', label: '关闭窗口' },
      ],
    },
    {
      label: '编辑',
      submenu: [
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '拷贝' },
        { role: 'paste', label: '粘贴' },
        { role: 'selectAll', label: '全选' },
        { type: 'separator' },
        {
          label: '搜索备忘录',
          accelerator: 'Cmd+F',
          click: () => send('focus-search'),
        },
      ],
    },
    {
      label: '显示',
      submenu: viewItems,
    },
    {
      label: '窗口',
      submenu: [
        { role: 'minimize', label: '最小化' },
        { role: 'zoom', label: '缩放' },
        { type: 'separator' },
        { role: 'front', label: '全部置于顶层' },
      ],
    },
    {
      role: 'help',
      label: '帮助',
      submenu: [
        {
          label: 'FreeNotes 项目主页',
          click: () => void shell.openExternal(REPOSITORY_URL),
        },
        {
          label: '报告问题',
          click: () => void shell.openExternal(`${REPOSITORY_URL}/issues`),
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
