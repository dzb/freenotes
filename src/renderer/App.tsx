import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import {
  AlertTriangle,
  Check,
  Download,
  FolderClosed,
  HardDrive,
  Keyboard,
  Laptop,
  Moon,
  NotebookPen,
  Sun,
  Upload,
} from 'lucide-react';
import type { Folder, Note, NotebookSettings, ThemePreference } from '../shared/types';
import { useNotebook } from './hooks/useNotebook';
import { useTheme } from './hooks/useTheme';
import { api } from './lib/api';
import { createFolder } from './lib/data';
import { applyNotePatch, createNote, sortNotes } from './lib/note';
import { buildSearchIndex, displayNoteTitle, searchNotesFromIndex, type SearchIndexEntry } from './lib/search';
import type { View } from './lib/view';
import { TitleBar } from './components/TitleBar';
import { Sidebar } from './components/Sidebar';
import { NoteList } from './components/NoteList';
import { EditorPane } from './components/EditorPane';
import { Modal } from './components/Modal';

interface FolderDialogState {
  mode: 'create' | 'rename';
  folder?: Folder;
}

type ConfirmState =
  | { kind: 'delete-folder'; folder: Folder }
  | { kind: 'empty-trash' }
  | { kind: 'delete-note'; noteId: string }
  | null;

interface ToastState {
  id: number;
  message: string;
}

const FONT_FAMILY_OPTIONS = [
  { value: 'system', label: '系统' },
  { value: 'serif', label: '衬线' },
  { value: 'mono', label: '等宽' },
] as const;

const FONT_SIZE_OPTIONS = [11, 13, 14, 15, 16] as const;

export default function App() {
  const notebook = useNotebook();
  const { data, ready, loadError, mutate, replaceData } = notebook;
  const [view, setView] = useState<View>({ type: 'all' });
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [folderDialog, setFolderDialog] = useState<FolderDialogState | null>(null);
  const [folderDraft, setFolderDraft] = useState('');
  const [folderError, setFolderError] = useState('');
  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchEntryCache = useRef<WeakMap<Note, SearchIndexEntry>>(new WeakMap());
  const toastSequence = useRef(0);

  const themePreference = data?.settings.theme ?? 'system';
  const resolvedTheme = useTheme(themePreference);
  const isMac = api.platform === 'darwin';
  const primaryModifier = isMac ? '⌘' : 'Ctrl';
  const shiftModifier = isMac ? '⇧' : 'Shift';
  const searchActive = searchQuery.trim().length > 0;
  const modalOpen = Boolean(folderDialog || confirm || preferencesOpen);

  const notify = useCallback((message: string) => {
    toastSequence.current += 1;
    setToast({ id: toastSequence.current, message });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const folders = data?.folders ?? [];
  const folderNames = useMemo(() => {
    const names: Record<string, string> = {};
    for (const folder of folders) names[folder.id] = folder.name;
    return names;
  }, [folders]);

  const counts = useMemo(() => {
    const byFolder: Record<string, number> = {};
    let all = 0;
    let trash = 0;
    for (const note of data?.notes ?? []) {
      if (note.deletedAt !== null) {
        trash += 1;
        continue;
      }
      all += 1;
      byFolder[note.folderId] = (byFolder[note.folderId] ?? 0) + 1;
    }
    return { all, trash, byFolder };
  }, [data?.notes]);

  const sortedActiveNotes = useMemo(() => {
    if (!data) return [];
    const active = data.notes.filter((note) => note.deletedAt === null);
    return sortNotes(active, data.settings.sortBy, data.settings.sortDir);
  }, [data]);

  const searchIndex = useMemo(() => {
    if (!searchActive) return null;
    return buildSearchIndex(data?.notes ?? [], searchEntryCache.current);
  }, [data?.notes, searchActive]);

  const searchedResults = useMemo(() => {
    if (!data || !searchActive || !searchIndex) return null;
    return searchNotesFromIndex(searchIndex, searchQuery);
  }, [data, searchActive, searchQuery, searchIndex]);

  const notesForView = useMemo(() => {
    if (!data) return [];
    if (view.type === 'trash') {
      return [...data.notes]
        .filter((note) => note.deletedAt !== null)
        .sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0));
    }
    if (view.type === 'folder') {
      return sortedActiveNotes.filter((note) => note.folderId === view.folderId);
    }
    return sortedActiveNotes;
  }, [data, view, sortedActiveNotes]);

  const visibleNotes = useMemo<Note[]>(() => {
    if (searchedResults) return searchedResults.map((result) => result.note);
    return notesForView;
  }, [searchedResults, notesForView]);

  const visibleKey = visibleNotes.map((note) => note.id).join('|');

  useEffect(() => {
    if (!ready) return;
    const ids = visibleKey ? visibleKey.split('|') : [];
    if (selectedNoteId && ids.includes(selectedNoteId)) return;
    setSelectedNoteId(ids[0] ?? null);
  }, [visibleKey, ready, selectedNoteId]);

  const selectedNote = useMemo(
    () => data?.notes.find((note) => note.id === selectedNoteId) ?? null,
    [data?.notes, selectedNoteId],
  );

  const selectedFolderName = selectedNote ? folderNames[selectedNote.folderId] ?? '备忘录' : '';

  const pinnedNotes = useMemo(() => {
    if (searchedResults || view.type === 'trash') return [];
    return notesForView.filter((note) => note.pinned);
  }, [searchedResults, view.type, notesForView]);

  const regularNotes = useMemo(() => {
    if (searchedResults) return [];
    if (view.type === 'trash') return notesForView;
    return notesForView.filter((note) => !note.pinned);
  }, [searchedResults, notesForView, view.type]);

  const listKind = searchedResults ? 'search' : view.type === 'trash' ? 'trash' : view.type === 'folder' ? 'folder' : 'all';

  const listTitle = searchedResults
    ? '搜索结果'
    : view.type === 'trash'
      ? '最近删除'
      : view.type === 'folder'
        ? folders.find((folder) => folder.id === view.folderId)?.name ?? '文件夹'
        : '所有备忘录';

  const updateNote = useCallback(
    (noteId: string, patch: Partial<Note>) => {
      mutate((previous) => ({
        ...previous,
        notes: applyNotePatch(previous.notes, noteId, patch),
      }));
    },
    [mutate],
  );

  const focusSearch = useCallback(() => {
    const input = searchInputRef.current;
    if (!input) return;
    input.focus();
    input.select();
  }, []);

  const openNewFolderDialog = useCallback(() => {
    setFolderDraft('');
    setFolderError('');
    setFolderDialog({ mode: 'create' });
  }, []);

  const openRenameFolderDialog = useCallback((folder: Folder) => {
    setFolderDraft(folder.name);
    setFolderError('');
    setFolderDialog({ mode: 'rename', folder });
  }, []);

  const createNewNote = useCallback(() => {
    if (!data) return;
    const targetFolderId =
      view.type === 'folder'
        ? view.folderId
        : selectedNote?.folderId ?? data.folders[0]?.id;
    if (!targetFolderId) return;
    const note = createNote(targetFolderId);
    setSearchQuery('');
    if (view.type === 'trash') setView({ type: 'all' });
    mutate((previous) => ({ ...previous, notes: [note, ...previous.notes] }));
    setSelectedNoteId(note.id);
  }, [data, view, selectedNote, mutate]);

  const handleSelectView = useCallback((next: View) => {
    setSearchQuery('');
    setView(next);
  }, []);

  const handleCreateFolder = () => {
    if (!data || !folderDialog) return;
    const name = folderDraft.trim();
    if (!name) {
      setFolderError('请输入文件夹名称。');
      return;
    }
    const duplicate = data.folders.some(
      (folder) => folder.id !== folderDialog.folder?.id && folder.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
    );
    if (duplicate) {
      setFolderError('已经有同名文件夹了。');
      return;
    }

    if (folderDialog.mode === 'create') {
      const folder = createFolder(name);
      mutate((previous) => ({ ...previous, folders: [...previous.folders, folder] }));
      setView({ type: 'folder', folderId: folder.id });
      setSearchQuery('');
      notify('已创建文件夹');
    } else if (folderDialog.folder) {
      mutate((previous) => ({
        ...previous,
        folders: previous.folders.map((folder) =>
          folder.id === folderDialog.folder?.id ? { ...folder, name } : folder,
        ),
      }));
      notify('文件夹已重命名');
    }
    setFolderDialog(null);
  };

  const handleDeleteFolder = () => {
    if (!data || !confirm || confirm.kind !== 'delete-folder') return;
    const folder = confirm.folder;
    if (data.folders.length <= 1) {
      setConfirm(null);
      notify('至少需要保留一个文件夹');
      return;
    }
    const fallback = data.folders.find((entry) => entry.id !== folder.id);
    const now = Date.now();
    mutate((previous) => ({
      ...previous,
      folders: previous.folders.filter((entry) => entry.id !== folder.id),
      notes: previous.notes.map((note) =>
        note.folderId === folder.id
          ? {
              ...note,
              folderId: fallback?.id ?? note.folderId,
              deletedAt: note.deletedAt ?? now,
            }
          : note,
      ),
      settings: previous.settings,
    }));
    if (view.type === 'folder' && view.folderId === folder.id) setView({ type: 'all' });
    setSearchQuery('');
    setConfirm(null);
    notify('文件夹已删除，备忘录已移到最近删除');
  };

  const moveNoteToTrash = useCallback(
    (noteId: string) => {
      updateNote(noteId, { deletedAt: Date.now() });
      notify('已移到最近删除');
    },
    [updateNote, notify],
  );

  const restoreNote = useCallback(
    (noteId: string) => {
      updateNote(noteId, { deletedAt: null });
      notify('备忘录已恢复');
    },
    [updateNote, notify],
  );

  const deleteNoteForever = useCallback(
    (noteId: string) => {
      mutate((previous) => ({
        ...previous,
        notes: previous.notes.filter((note) => note.id !== noteId),
      }));
      setConfirm(null);
      notify('已永久删除备忘录');
    },
    [mutate, notify],
  );

  const emptyTrash = () => {
    mutate((previous) => ({
      ...previous,
      notes: previous.notes.filter((note) => note.deletedAt === null),
    }));
    setConfirm(null);
    notify('最近删除已清空');
  };

  const duplicateNote = useCallback(
    (noteId: string) => {
      if (!data) return;
      const original = data.notes.find((note) => note.id === noteId);
      if (!original) return;
      const now = Date.now();
      const copy: Note = {
        ...original,
        id: crypto.randomUUID(),
        title: original.title.trim() ? `${original.title} 副本` : '',
        pinned: false,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      };
      mutate((previous) => ({ ...previous, notes: [copy, ...previous.notes] }));
      setSearchQuery('');
      setView((current) =>
        current.type === 'all' || (current.type === 'folder' && current.folderId === copy.folderId)
          ? current
          : { type: 'folder', folderId: copy.folderId },
      );
      setSelectedNoteId(copy.id);
      notify('已复制备忘录');
    },
    [data, mutate, notify],
  );

  const moveNoteToFolder = useCallback(
    (noteId: string, folderId: string) => {
      const target = folders.find((folder) => folder.id === folderId);
      updateNote(noteId, { folderId });
      if (target) notify(`已移到“${target.name}”`);
    },
    [folders, updateNote, notify],
  );

  const handleDropOnFolder = useCallback(
    (noteId: string, folderId: string) => {
      const note = data?.notes.find((entry) => entry.id === noteId);
      if (!note || note.folderId === folderId) return;
      moveNoteToFolder(noteId, folderId);
    },
    [data?.notes, moveNoteToFolder],
  );

  const handleDropInTrash = useCallback(
    (noteId: string) => {
      const note = data?.notes.find((entry) => entry.id === noteId);
      if (!note || note.deletedAt !== null) return;
      moveNoteToTrash(noteId);
    },
    [data?.notes, moveNoteToTrash],
  );

  const updateSettings = useCallback(
    (patch: Partial<NotebookSettings>) => {
      if (!data) return;
      mutate((previous) => ({
        ...previous,
        settings: { ...previous.settings, ...patch },
      }));
    },
    [data, mutate],
  );

  const toggleTheme = () => {
    if (!data) return;
    updateSettings({ theme: resolvedTheme === 'dark' ? 'light' : 'dark' });
  };

  const changeTheme = (theme: ThemePreference) => {
    updateSettings({ theme });
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const modifier = event.ctrlKey || event.metaKey;
      if (!modifier || event.altKey || modalOpen) return;
      const key = event.key.toLowerCase();
      // macOS uses the native menu as the single source of truth for these shortcuts.
      if (isMac && ['f', ',', 'w', 'q', 'n'].includes(key)) return;
      if (key === 'f') {
        event.preventDefault();
        focusSearch();
        return;
      }
      if (key === ',') {
        event.preventDefault();
        setPreferencesOpen(true);
        return;
      }
      if (key === 'w' || key === 'q') {
        event.preventDefault();
        api.close();
        return;
      }
      if (key === 'n' && !event.shiftKey) {
        event.preventDefault();
        createNewNote();
      } else if (key === 'n' && event.shiftKey) {
        event.preventDefault();
        openNewFolderDialog();
      } else if (key === 's') {
        event.preventDefault();
        notify('所有更改都会自动保存到本机');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [createNewNote, focusSearch, isMac, modalOpen, notify, openNewFolderDialog]);

  useEffect(() => {
    return api.onMenuCommand((command) => {
      if (command === 'new-note') {
        if (!modalOpen) createNewNote();
      } else if (command === 'new-folder') {
        if (!modalOpen) openNewFolderDialog();
      } else if (command === 'focus-search') {
        focusSearch();
      } else if (command === 'open-preferences') {
        setPreferencesOpen(true);
      }
    });
  }, [createNewNote, focusSearch, modalOpen, openNewFolderDialog]);

  const handleExportBackup = async () => {
    if (!data) return;
    const result = await api.exportBackup(data);
    if (result.ok) notify('完整备份已导出');
    else if (!result.canceled) notify(result.error ?? '导出备份失败');
  };

  const handleRestoreBackup = async () => {
    if (!data) return;
    const result = await api.restoreBackup(data);
    if (result.ok && result.data) {
      replaceData(result.data);
      setView({ type: 'all' });
      setSearchQuery('');
      setSelectedNoteId(null);
      setPreferencesOpen(false);
      notify('备份已恢复');
    } else if (!result.canceled) {
      notify(result.error ?? '恢复备份失败');
    }
  };

  const confirmNote = confirm?.kind === 'delete-note'
    ? data?.notes.find((note) => note.id === confirm.noteId) ?? null
    : null;
  const folderToDelete = confirm?.kind === 'delete-folder' ? confirm.folder : null;
  const notesInDeletedFolder = folderToDelete
    ? data?.notes.filter((note) => note.folderId === folderToDelete.id).length ?? 0
    : 0;

  if (!ready) {
    return (
      <div className="boot-screen">
        <div className="boot-icon">
          <NotebookPen size={28} strokeWidth={1.5} />
        </div>
        <div className="boot-title">备忘录</div>
        <div className="boot-spinner" aria-label="正在载入" />
      </div>
    );
  }

  if (loadError || !data) {
    return (
      <div className="boot-screen boot-error">
        <div className="boot-icon error-icon">
          <AlertTriangle size={26} strokeWidth={1.6} />
        </div>
        <div className="boot-title">无法打开备忘录</div>
        <p>{loadError ?? '本地数据不可用。'}</p>
        <button type="button" className="empty-action" onClick={() => window.location.reload()}>
          重新载入
        </button>
      </div>
    );
  }

  return (
    <div
      className={`app-shell platform-${api.platform} editor-font-${data.settings.fontFamily}`}
      style={{ '--editor-font-size': `${data.settings.fontSize}px` } as CSSProperties}
    >
      <TitleBar
        sidebarVisible={sidebarVisible}
        onToggleSidebar={() => setSidebarVisible((visible) => !visible)}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onClearSearch={() => {
          setSearchQuery('');
          searchInputRef.current?.focus();
        }}
        searchInputRef={searchInputRef}
        resultCount={searchedResults ? searchedResults.length : null}
      />

      <div className={`app-body${sidebarVisible ? '' : ' sidebar-hidden'}`}>
        {sidebarVisible ? (
          <Sidebar
            data={data}
            view={view}
            counts={counts}
            onSelectView={handleSelectView}
            onCreateFolder={openNewFolderDialog}
            onRenameFolder={openRenameFolderDialog}
            onDeleteFolder={(folder) => setConfirm({ kind: 'delete-folder', folder })}
            onDropNote={handleDropOnFolder}
            onDropNoteInTrash={handleDropInTrash}
            onOpenPreferences={() => setPreferencesOpen(true)}
            resolvedTheme={resolvedTheme}
            onToggleTheme={toggleTheme}
          />
        ) : null}

        <NoteList
          kind={listKind}
          title={listTitle}
          pinnedNotes={pinnedNotes}
          notes={regularNotes}
          searchResults={searchedResults}
          searchQuery={searchQuery}
          selectedNoteId={selectedNoteId}
          folderNames={folderNames}
          showFolderNames={!searchedResults && view.type === 'all'}
          sortBy={data.settings.sortBy}
          sortDir={data.settings.sortDir}
          onSortChange={(sortBy, sortDir) => updateSettings({ sortBy, sortDir })}
          onCreateNote={createNewNote}
          onSelectNote={setSelectedNoteId}
          onEmptyTrash={() => setConfirm({ kind: 'empty-trash' })}
          trashCount={counts.trash}
        />

        <EditorPane
          note={selectedNote}
          folders={folders}
          folderName={selectedFolderName}
          saveState={notebook.saveState}
          saveError={notebook.saveError}
          lastSavedAt={notebook.lastSavedAt}
          onUpdate={(patch) => {
            if (selectedNote) updateNote(selectedNote.id, patch);
          }}
          onMoveToTrash={moveNoteToTrash}
          onRestore={restoreNote}
          onDeleteForever={(noteId) => setConfirm({ kind: 'delete-note', noteId })}
          onDuplicate={duplicateNote}
          onMoveToFolder={moveNoteToFolder}
          onCreateNote={createNewNote}
          onNotify={notify}
          searchQuery={searchActive ? searchQuery : ''}
          fontFamily={data.settings.fontFamily}
          fontSize={data.settings.fontSize}
        />
      </div>

      {toast ? (
        <div className="toast" role="status" key={toast.id}>
          <Check size={13} strokeWidth={2.4} />
          {toast.message}
        </div>
      ) : null}

      <Modal
        open={Boolean(folderDialog)}
        title={folderDialog?.mode === 'rename' ? '重命名文件夹' : '新建文件夹'}
        description={
          folderDialog?.mode === 'rename'
            ? '文件夹中的备忘录不会受到影响。'
            : '用文件夹把不同场景的备忘录分开。'
        }
        onClose={() => setFolderDialog(null)}
        footer={
          <>
            <button type="button" className="modal-button" onClick={() => setFolderDialog(null)}>
              取消
            </button>
            <button type="button" className="modal-button modal-button-primary" onClick={handleCreateFolder}>
              {folderDialog?.mode === 'rename' ? '保存' : '新建'}
            </button>
          </>
        }
      >
        <label className="field-label" htmlFor="folder-name">
          文件夹名称
        </label>
        <input
          id="folder-name"
          className="text-field"
          value={folderDraft}
          onChange={(event) => {
            setFolderDraft(event.target.value);
            setFolderError('');
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              handleCreateFolder();
            }
          }}
          placeholder="例如：工作"
          autoFocus
        />
        {folderError ? <p className="field-error">{folderError}</p> : null}
      </Modal>

      <Modal
        open={Boolean(confirm)}
        title={
          confirm?.kind === 'delete-folder'
            ? `删除文件夹“${folderToDelete?.name ?? ''}”？`
            : confirm?.kind === 'empty-trash'
              ? '清空最近删除？'
              : '永久删除这条备忘录？'
        }
        description={
          confirm?.kind === 'delete-folder'
            ? `文件夹中的 ${notesInDeletedFolder} 条备忘录会被移到“最近删除”，文件夹本身将被移除。`
            : confirm?.kind === 'empty-trash'
              ? `最近删除中的 ${counts.trash} 条备忘录将被永久删除，此操作无法撤销。`
              : `“${confirmNote ? displayNoteTitle(confirmNote) : '这条备忘录'}”将从这台电脑上永久删除，此操作无法撤销。`
        }
        onClose={() => setConfirm(null)}
        footer={
          <>
            <button type="button" className="modal-button" onClick={() => setConfirm(null)}>
              取消
            </button>
            <button
              type="button"
              className="modal-button modal-button-danger"
              onClick={() => {
                if (confirm?.kind === 'delete-folder') handleDeleteFolder();
                else if (confirm?.kind === 'empty-trash') emptyTrash();
                else if (confirm?.kind === 'delete-note') deleteNoteForever(confirm.noteId);
              }}
            >
              {confirm?.kind === 'delete-folder' ? '删除文件夹' : confirm?.kind === 'empty-trash' ? '清空' : '永久删除'}
            </button>
          </>
        }
      />

      <Modal
        open={preferencesOpen}
        title="偏好设置"
        description="所有内容都留在这台电脑上。"
        width={540}
        onClose={() => setPreferencesOpen(false)}
        footer={
          <button type="button" className="modal-button modal-button-primary" onClick={() => setPreferencesOpen(false)}>
            完成
          </button>
        }
      >
        <div className="preferences-section">
          <h3>外观</h3>
          <div className="theme-segmented" role="group" aria-label="外观">
            <ThemeChoice
              active={data.settings.theme === 'system'}
              icon={<Laptop size={14} />}
              label="跟随系统"
              onClick={() => changeTheme('system')}
            />
            <ThemeChoice
              active={data.settings.theme === 'light'}
              icon={<Sun size={14} />}
              label="浅色"
              onClick={() => changeTheme('light')}
            />
            <ThemeChoice
              active={data.settings.theme === 'dark'}
              icon={<Moon size={14} />}
              label="深色"
              onClick={() => changeTheme('dark')}
            />
          </div>

          <div className="appearance-option">
            <span className="appearance-option-label">正文字号</span>
            <div className="theme-segmented font-size-segmented" role="group" aria-label="正文字号">
              {FONT_SIZE_OPTIONS.map((size) => (
                <button
                  key={size}
                  type="button"
                  className={`theme-choice${data.settings.fontSize === size ? ' is-active' : ''}`}
                  aria-pressed={data.settings.fontSize === size}
                  onClick={() => updateSettings({ fontSize: size })}
                >
                  {size}px
                </button>
              ))}
            </div>
          </div>

          <div className="appearance-option">
            <span className="appearance-option-label">正文字体</span>
            <div className="theme-segmented" role="group" aria-label="正文字体">
              {FONT_FAMILY_OPTIONS.map((option) => (
                <ThemeChoice
                  key={option.value}
                  active={data.settings.fontFamily === option.value}
                  label={option.label}
                  onClick={() => updateSettings({ fontFamily: option.value })}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="preferences-section">
          <h3>本地存储</h3>
          <div className="storage-card">
            <div className="storage-card-heading">
              <HardDrive size={16} strokeWidth={1.8} />
              <div>
                <strong>备忘录数据</strong>
                <span>仅保存在本机，不会上传到任何服务器</span>
              </div>
            </div>
            <code title={notebook.dataPath}>{notebook.dataPath || '正在读取…'}</code>
            <div className="storage-actions">
              <button
                type="button"
                className="text-action"
                onClick={() => void api.showDataFolder()}
              >
                <FolderClosed size={13} />
                在文件管理器中显示
              </button>
              <button type="button" className="text-action" onClick={() => void handleExportBackup()}>
                <Download size={13} />
                导出完整备份…
              </button>
              <button type="button" className="text-action" onClick={() => void handleRestoreBackup()}>
                <Upload size={13} />
                从备份恢复…
              </button>
            </div>
          </div>
        </div>

        <div className="preferences-section">
          <h3>
            <Keyboard size={13} /> 快捷键
          </h3>
          <dl className="shortcut-list">
            <div><dt>新建备忘录</dt><dd><kbd>{primaryModifier}</kbd><kbd>N</kbd></dd></div>
            <div><dt>新建文件夹</dt><dd><kbd>{primaryModifier}</kbd><kbd>{shiftModifier}</kbd><kbd>N</kbd></dd></div>
            <div><dt>全文搜索</dt><dd><kbd>{primaryModifier}</kbd><kbd>F</kbd></dd></div>
            <div><dt>添加链接</dt><dd><kbd>{primaryModifier}</kbd><kbd>K</kbd></dd></div>
            <div><dt>粗体 / 斜体 / 下划线</dt><dd><kbd>{primaryModifier}</kbd><kbd>B</kbd><kbd>I</kbd><kbd>U</kbd></dd></div>
            <div><dt>偏好设置</dt><dd><kbd>{primaryModifier}</kbd><kbd>,</kbd></dd></div>
            <div><dt>关闭窗口</dt><dd><kbd>{primaryModifier}</kbd><kbd>W</kbd></dd></div>
          </dl>
        </div>

        <div className="preferences-about">
          <span>FreeNotes for macOS · Windows · Linux</span>
          <span>版本 {notebook.version}</span>
        </div>
      </Modal>
    </div>
  );
}

interface ThemeChoiceProps {
  active: boolean;
  icon?: ReactNode;
  label: string;
  onClick: () => void;
}

function ThemeChoice({ active, icon, label, onClick }: ThemeChoiceProps) {
  return (
    <button
      type="button"
      className={`theme-choice${active ? ' is-active' : ''}`}
      onClick={onClick}
      aria-pressed={active}
    >
      {icon}
      {label}
    </button>
  );
}
