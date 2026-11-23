import { useState, type DragEvent, type MouseEvent } from 'react';
import {
  FolderClosed,
  HardDrive,
  Moon,
  MoreHorizontal,
  NotebookText,
  Plus,
  Sun,
  Trash2,
  FolderPlus,
  Pencil,
  Trash,
} from 'lucide-react';
import type { Folder, NotebookData } from '../../shared/types';
import { api } from '../lib/api';
import type { View } from '../lib/view';
import { NOTE_DRAG_MIME } from '../lib/view';
import { Menu, MenuItem, MenuSeparator } from './Menu';
import type { ResolvedTheme } from '../hooks/useTheme';

interface SidebarProps {
  data: NotebookData;
  view: View;
  counts: { all: number; trash: number; byFolder: Record<string, number> };
  onSelectView: (view: View) => void;
  onCreateFolder: () => void;
  onRenameFolder: (folder: Folder) => void;
  onDeleteFolder: (folder: Folder) => void;
  onDropNote: (noteId: string, folderId: string) => void;
  onDropNoteInTrash: (noteId: string) => void;
  onOpenPreferences: () => void;
  resolvedTheme: ResolvedTheme;
  onToggleTheme: () => void;
}

export function Sidebar({
  data,
  view,
  counts,
  onSelectView,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onDropNote,
  onDropNoteInTrash,
  onOpenPreferences,
  resolvedTheme,
  onToggleTheme,
}: SidebarProps) {
  const [folderMenu, setFolderMenu] = useState<{ folder: Folder; rect: DOMRect } | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const isTrashActive = view.type === 'trash';
  const isAllActive = view.type === 'all';

  const handleMenuClick = (event: MouseEvent<HTMLButtonElement>, folder: Folder) => {
    event.stopPropagation();
    setFolderMenu({ folder, rect: event.currentTarget.getBoundingClientRect() });
  };

  const handleFolderContextMenu = (event: MouseEvent<HTMLDivElement>, folder: Folder) => {
    event.preventDefault();
    setFolderMenu({ folder, rect: new DOMRect(event.clientX, event.clientY, 1, 1) });
  };

  const acceptDrop = (event: DragEvent<HTMLElement>) => {
    if (event.dataTransfer.types.includes(NOTE_DRAG_MIME)) {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
    }
  };

  const leaveDrop = (event: DragEvent<HTMLElement>, id: string) => {
    if (dragOverId !== id) return;
    const related = event.relatedTarget as Node | null;
    if (!related || !event.currentTarget.contains(related)) setDragOverId(null);
  };

  const dropOnFolder = (event: DragEvent<HTMLDivElement>, folder: Folder) => {
    event.preventDefault();
    event.stopPropagation();
    setDragOverId(null);
    const noteId = event.dataTransfer.getData(NOTE_DRAG_MIME);
    if (noteId) onDropNote(noteId, folder.id);
  };

  const dropOnTrash = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDragOverId(null);
    const noteId = event.dataTransfer.getData(NOTE_DRAG_MIME);
    if (noteId) onDropNoteInTrash(noteId);
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-scroll">
        <nav aria-label="备忘录导航">
          <button
            type="button"
            className={`sidebar-row${isAllActive ? ' is-active' : ''}`}
            onClick={() => onSelectView({ type: 'all' })}
          >
            <NotebookText size={16} strokeWidth={1.9} className="sidebar-icon smart-icon" />
            <span className="sidebar-row-label">所有备忘录</span>
            <span className="sidebar-row-count">{counts.all}</span>
          </button>

          <div className="sidebar-section-header">
            <span>文件夹</span>
            <button
              type="button"
              className="sidebar-add-button"
              onClick={onCreateFolder}
              aria-label="新建文件夹"
              title={api.platform === 'darwin' ? '新建文件夹 (⌘⇧N)' : '新建文件夹 (Ctrl+Shift+N)'}
            >
              <Plus size={14} strokeWidth={2.4} />
            </button>
          </div>

          <div className="folder-list">
            {data.folders.map((folder) => {
              const active = view.type === 'folder' && view.folderId === folder.id;
              const dragOver = dragOverId === folder.id;
              return (
                <div
                  key={folder.id}
                  className={`sidebar-folder${active ? ' is-active' : ''}${dragOver ? ' is-drop-target' : ''}`}
                  onContextMenu={(event) => handleFolderContextMenu(event, folder)}
                  onDragOver={acceptDrop}
                  onDragEnter={() => setDragOverId(folder.id)}
                  onDragLeave={(event) => leaveDrop(event, folder.id)}
                  onDrop={(event) => dropOnFolder(event, folder)}
                >
                  <button
                    type="button"
                    className="sidebar-row folder-select"
                    onClick={() => onSelectView({ type: 'folder', folderId: folder.id })}
                  >
                    <FolderClosed
                      size={16}
                      strokeWidth={1.8}
                      className="sidebar-icon folder-icon"
                      fill="currentColor"
                      fillOpacity={active ? 0.2 : 0.08}
                    />
                    <span className="sidebar-row-label">{folder.name}</span>
                    <span className="sidebar-row-count">{counts.byFolder[folder.id] ?? 0}</span>
                  </button>
                  <button
                    type="button"
                    className="folder-more"
                    aria-label={`管理文件夹 ${folder.name}`}
                    onClick={(event) => handleMenuClick(event, folder)}
                  >
                    <MoreHorizontal size={15} />
                  </button>
                </div>
              );
            })}
          </div>
        </nav>
      </div>

      <div className="sidebar-lower">
        <div
          className={`sidebar-trash${isTrashActive ? ' is-active' : ''}${dragOverId === 'trash' ? ' is-drop-target' : ''}`}
          onDragOver={acceptDrop}
          onDragEnter={() => setDragOverId('trash')}
          onDragLeave={(event) => leaveDrop(event, 'trash')}
          onDrop={dropOnTrash}
        >
          <button
            type="button"
            className="sidebar-row"
            onClick={() => onSelectView({ type: 'trash' })}
          >
            <Trash2 size={16} strokeWidth={1.8} className="sidebar-icon" />
            <span className="sidebar-row-label">最近删除</span>
            <span className="sidebar-row-count">{counts.trash}</span>
          </button>
        </div>

        <div className="sidebar-footer">
          <button
            type="button"
            className="sidebar-footer-button storage-label"
            onClick={onOpenPreferences}
            title="查看存储位置与快捷键"
          >
            <HardDrive size={13} strokeWidth={1.9} />
            <span>仅存储在本机</span>
          </button>
          <button
            type="button"
            className="sidebar-footer-button theme-toggle"
            onClick={onToggleTheme}
            aria-label={resolvedTheme === 'dark' ? '切换到浅色外观' : '切换到深色外观'}
            title={resolvedTheme === 'dark' ? '浅色外观' : '深色外观'}
          >
            {resolvedTheme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
          </button>
        </div>
      </div>

      <Menu
        open={Boolean(folderMenu)}
        anchor={folderMenu?.rect ?? null}
        onClose={() => setFolderMenu(null)}
        label="文件夹操作"
      >
        <MenuItem
          icon={<Pencil size={14} />}
          label="重命名文件夹"
          onSelect={() => {
            if (folderMenu) onRenameFolder(folderMenu.folder);
            setFolderMenu(null);
          }}
        />
        <MenuItem
          icon={<FolderPlus size={14} />}
          label="新建文件夹"
          onSelect={() => {
            setFolderMenu(null);
            onCreateFolder();
          }}
        />
        <MenuSeparator />
        <MenuItem
          icon={<Trash size={14} />}
          label="删除文件夹"
          destructive
          onSelect={() => {
            if (folderMenu) onDeleteFolder(folderMenu.folder);
            setFolderMenu(null);
          }}
          disabled={data.folders.length <= 1}
        />
      </Menu>
    </aside>
  );
}
