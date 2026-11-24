import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Placeholder } from '@tiptap/extension-placeholder';
import { TaskList } from '@tiptap/extension-task-list';
import { TaskItem } from '@tiptap/extension-task-item';
import { Highlight } from '@tiptap/extension-highlight';
import { Image } from '@tiptap/extension-image';
import { TableKit } from '@tiptap/extension-table';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  Copy,
  FileText,
  FolderClosed,
  Loader2,
  MoreHorizontal,
  Printer,
  NotebookPen,
  Pin,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import type { Folder, Note } from '../../shared/types';
import type { SaveState } from '../hooks/useNotebook';
import { api } from '../lib/api';
import { copyText } from '../lib/clipboard';
import { countWords, formatClock, formatFullDate } from '../lib/format';
import { prepareImageAttachment } from '../lib/image';
import { useSearchHighlights } from '../hooks/useSearchHighlights';
import { buildStandaloneNoteHtml } from '../lib/noteExport';
import { displayNoteTitle } from '../lib/search';
import { FormatToolbar } from './FormatToolbar';
import { Menu, MenuItem, MenuLabel, MenuSeparator } from './Menu';
import { Modal } from './Modal';

interface EditorPaneProps {
  note: Note | null;
  folders: Folder[];
  folderName: string;
  saveState: SaveState;
  saveError: string | null;
  lastSavedAt: number | null;
  onUpdate: (patch: Partial<Note>) => void;
  onMoveToTrash: (noteId: string) => void;
  onRestore: (noteId: string) => void;
  onDeleteForever: (noteId: string) => void;
  onDuplicate: (noteId: string) => void;
  onMoveToFolder: (noteId: string, folderId: string) => void;
  onCreateNote: () => void;
  onNotify: (message: string) => void;
  searchQuery: string;
}

export function EditorPane(props: EditorPaneProps) {
  const { note } = props;
  if (!note) {
    return (
      <section className="editor-pane is-empty" aria-label="备忘录编辑区">
        <div className="editor-empty">
          <div className="editor-empty-art">
            <NotebookPen size={34} strokeWidth={1.35} />
          </div>
          <h2>选一条备忘录，或者写下新的想法</h2>
          <p>你的文字只保存在这台电脑上，并且随时可以全文搜索。</p>
          <button type="button" className="empty-action" onClick={props.onCreateNote}>
            <NotebookPen size={14} />
            新建备忘录
          </button>
          <kbd className="empty-shortcut">{api.platform === 'darwin' ? '⌘ N' : 'Ctrl N'}</kbd>
        </div>
      </section>
    );
  }

  return <NoteEditor key={note.id} {...props} note={note} />;
}

function NoteEditor({
  note,
  folders,
  folderName,
  saveState,
  saveError,
  lastSavedAt,
  onUpdate,
  onMoveToTrash,
  onRestore,
  onDeleteForever,
  onDuplicate,
  onMoveToFolder,
  onNotify,
  searchQuery,
}: Omit<EditorPaneProps, 'note' | 'onCreateNote'> & { note: Note }) {
  const isTrash = note.deletedAt !== null;
  const isMac = api.platform === 'darwin';
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [moreAnchor, setMoreAnchor] = useState<DOMRect | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkLabel, setLinkLabel] = useState('');
  const [linkError, setLinkError] = useState('');
  const [hasSelection, setHasSelection] = useState(false);
  const noteRef = useRef(note);
  const updateRef = useRef(onUpdate);
  const notifyRef = useRef(onNotify);

  noteRef.current = note;
  updateRef.current = onUpdate;
  notifyRef.current = onNotify;

  const editor = useEditor({
    content: note.content || '<p></p>',
    editable: !isTrash,
    immediatelyRender: true,
    shouldRerenderOnTransaction: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: {
          openOnClick: false,
          autolink: true,
          HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
        },
        underline: {},
        trailingNode: false,
      }),
      Placeholder.configure({
        placeholder: ({ node }) => (node.type.name === 'heading' ? '标题' : '开始书写…'),
        emptyEditorClass: 'is-editor-empty',
      }),
      TaskList,
      TaskItem.configure({
        nested: true,
        a11y: {
          checkboxLabel: (node) => `任务：${node.textContent || '未命名任务'}`,
        },
      }),
      Highlight,
      Image.configure({
        allowBase64: true,
        resize: {
          enabled: true,
          minWidth: 100,
          minHeight: 80,
          alwaysPreserveAspectRatio: true,
        },
      }),
      TableKit.configure({
        table: {
          resizable: false,
          HTMLAttributes: { class: 'notes-table' },
        },
      }),
    ],
    editorProps: {
      attributes: {
        class: 'notes-prosemirror',
        spellcheck: 'true',
        'aria-label': '备忘录正文',
        'aria-multiline': 'true',
        role: 'textbox',
      },
      handleClick: (_view, _position, event) => {
        const target = event.target as HTMLElement | null;
        const anchor = target?.closest('a');
        if (!anchor) return false;
        if ((event.ctrlKey || event.metaKey) && anchor.href) {
          event.preventDefault();
          void api.openExternal(anchor.href);
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor: current }) => {
      if (!noteRef.current || noteRef.current.deletedAt !== null) return;
      updateRef.current({
        content: current.getHTML(),
        text: current.getText({ blockSeparator: '\n' }),
      });
    },
  });

  useEffect(() => {
    if (!editor) return;
    const shouldBeEditable = !isTrash;
    if (editor.isEditable === shouldBeEditable) return;
    // The second argument prevents TipTap from emitting an `update` event here.
    // Changing editability is not a content change and must not reorder the list.
    editor.setEditable(shouldBeEditable, false);
  }, [editor, isTrash]);

  useSearchHighlights(editor, searchQuery, note.text);

  useEffect(() => {
    const element = titleRef.current;
    if (element) {
      element.style.height = 'auto';
      element.style.height = `${element.scrollHeight}px`;
    }
  }, [note.title, note.id]);

  useEffect(() => {
    if (!note.title.trim() && !note.text.trim()) {
      const frame = window.requestAnimationFrame(() => titleRef.current?.focus());
      return () => window.cancelAnimationFrame(frame);
    }
  }, [note.id]);

  useEffect(() => {
    if (!editor || isTrash) return;
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k' && editor.isFocused) {
        event.preventDefault();
        openLinkDialog();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // openLinkDialog reads the live editor selection and state setters are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, isTrash]);

  const openLinkDialog = () => {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    const existing = String(editor.getAttributes('link').href ?? '');
    const text = from !== to ? editor.state.doc.textBetween(from, to, ' ') : '';
    setLinkUrl(existing || 'https://');
    setLinkLabel(text);
    setHasSelection(from !== to);
    setLinkError('');
    setLinkOpen(true);
  };

  const applyLink = () => {
    if (!editor) return;
    let normalized = linkUrl.trim();
    if (!normalized) {
      setLinkError('请输入链接地址。');
      return;
    }
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      normalized = `mailto:${normalized}`;
    } else if (!/^(https?:|mailto:)/i.test(normalized)) {
      normalized = `https://${normalized}`;
    }
    if (!/^(https?:\/\/[^\s]+|mailto:[^\s]+)$/i.test(normalized)) {
      setLinkError('请输入有效的网址，例如 https://example.com。');
      return;
    }

    if (!hasSelection) {
      const label = linkLabel.trim() || normalized;
      editor
        .chain()
        .focus()
        .insertContent({
          type: 'text',
          text: label,
          marks: [{ type: 'link', attrs: { href: normalized } }],
        })
        .run();
    } else {
      editor.chain().focus().extendMarkRange('link').setLink({ href: normalized }).run();
    }
    setLinkOpen(false);
  };

  const removeLink = () => {
    if (!editor) return;
    editor.chain().focus().extendMarkRange('link').unsetLink().run();
    setLinkOpen(false);
  };

  const handleTitleChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    onUpdate({ title: event.target.value });
  };

  const handleTitleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      editor?.commands.focus('start');
    }
  };

  const insertImageFile = useCallback(
    async (file: File) => {
      if (!editor) return;
      try {
        const prepared = await prepareImageAttachment(file);
        const saved = await api.saveAttachment(prepared.fileName, prepared.mimeType, prepared.data);
        if (!saved.ok || !saved.url) throw new Error(saved.error ?? '保存图片附件失败');
        editor.chain().focus().setImage({ src: saved.url, alt: file.name }).run();
      } catch (error) {
        notifyRef.current(error instanceof Error ? error.message : '插入图片失败');
      }
    },
    [editor],
  );

  const handlePaste = (event: ClipboardEvent<HTMLDivElement>) => {
    if (!editor || isTrash) return;
    const item = Array.from(event.clipboardData.items).find(
      (entry) => entry.kind === 'file' && entry.type.startsWith('image/'),
    );
    const file = item?.getAsFile();
    if (file) {
      event.preventDefault();
      event.stopPropagation();
      void insertImageFile(file);
    }
  };

  const handleFileInput = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) void insertImageFile(file);
  };

  const insertTable = () => {
    editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  };

  const togglePin = () => {
    onUpdate({ pinned: !note.pinned });
  };

  const copyPlainText = async () => {
    const text = [note.title.trim(), note.text.trim()].filter(Boolean).join('\n\n');
    const copied = await copyText(text || '（空白备忘录）');
    onNotify(copied ? '已复制到剪贴板' : '复制失败');
    setMoreAnchor(null);
  };

  const exportNote = async (kind: 'html' | 'pdf') => {
    if (!editor) return;
    setMoreAnchor(null);
    const html = buildStandaloneNoteHtml(displayNoteTitle(note), editor.getHTML());
    const result =
      kind === 'html'
        ? await api.exportNoteHtml(html, displayNoteTitle(note))
        : await api.exportNotePdf(html, displayNoteTitle(note));
    if (result.ok) onNotify(kind === 'html' ? '已导出 HTML' : '已导出 PDF');
    else if (!result.canceled) onNotify(result.error ?? '导出失败');
  };

  const saveLabel =
    saveState === 'saving'
      ? '正在保存…'
      : saveState === 'error'
        ? '保存失败'
        : lastSavedAt
          ? `已保存 ${formatClock(lastSavedAt)}`
          : '已保存';

  const folderForName = folders.find((folder) => folder.id === note.folderId)?.name ?? folderName;

  return (
    <section className={`editor-pane${isTrash ? ' is-trash' : ''}`} aria-label="备忘录编辑区">
      <div className="editor-topbar">
        {isTrash ? (
          <div className="trash-toolbar-label">
            <Trash2 size={14} strokeWidth={1.8} />
            <span>最近删除</span>
          </div>
        ) : editor ? (
          <FormatToolbar
            editor={editor}
            onOpenLink={openLinkDialog}
            onInsertImage={() => fileInputRef.current?.click()}
            onInsertTable={insertTable}
          />
        ) : (
          <div className="format-toolbar" />
        )}

        <div className="editor-actions">
          {isTrash ? (
            <>
              <button
                type="button"
                className="text-action restore-action"
                onClick={() => onRestore(note.id)}
                title="将备忘录恢复到原文件夹"
              >
                <RotateCcw size={14} strokeWidth={1.9} />
                恢复
              </button>
              <button
                type="button"
                className="text-action danger-text"
                onClick={() => onDeleteForever(note.id)}
              >
                <Trash2 size={14} strokeWidth={1.9} />
                永久删除
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className={`chrome-button editor-action${note.pinned ? ' is-active' : ''}`}
                aria-label={note.pinned ? '取消置顶' : '置顶'}
                title={note.pinned ? '取消置顶' : '置顶'}
                onClick={togglePin}
              >
                <Pin size={16} strokeWidth={1.9} fill={note.pinned ? 'currentColor' : 'none'} />
              </button>
              <button
                type="button"
                className="chrome-button editor-action"
                aria-label="移到最近删除"
                title="移到最近删除"
                onClick={() => onMoveToTrash(note.id)}
              >
                <Trash2 size={16} strokeWidth={1.8} />
              </button>
              <button
                type="button"
                className={`chrome-button editor-action${moreAnchor ? ' is-pressed' : ''}`}
                aria-label="更多操作"
                title="更多操作"
                onClick={(event: MouseEvent<HTMLButtonElement>) => {
                  if (moreAnchor) setMoreAnchor(null);
                  else setMoreAnchor(event.currentTarget.getBoundingClientRect());
                }}
              >
                <MoreHorizontal size={17} strokeWidth={2} />
              </button>
            </>
          )}
        </div>
      </div>

      <div className="editor-scroll">
        <article className="note-paper">
          <div className="note-meta">
            <span>
              {isTrash && note.deletedAt
                ? `删除于 ${formatFullDate(note.deletedAt)}`
                : `编辑于 ${formatFullDate(note.updatedAt)}`}
            </span>
            <span className="note-meta-separator">·</span>
            <span className="note-meta-folder">
              <FolderClosed size={11} strokeWidth={1.9} />
              {folderForName}
            </span>
          </div>

          <textarea
            ref={titleRef}
            className="note-title-input"
            value={note.title}
            onChange={handleTitleChange}
            onKeyDown={handleTitleKeyDown}
            placeholder="标题"
            rows={1}
            readOnly={isTrash}
            spellCheck
            aria-label="备忘录标题"
          />

          <div className="editor-body" onPasteCapture={handlePaste}>
            <EditorContent editor={editor} />
          </div>
        </article>
      </div>

      <footer className="editor-statusbar">
        <span
          className={`save-indicator save-${saveState}`}
          title={saveError ?? '所有更改都会自动保存到本机'}
          aria-live="polite"
        >
          {saveState === 'saving' ? (
            <Loader2 size={11} className="spin" />
          ) : saveState === 'error' ? (
            <AlertTriangle size={11} />
          ) : (
            <Check size={11} strokeWidth={2.6} />
          )}
          {isTrash ? '只读 · 已移入最近删除' : saveLabel}
        </span>
        <span className="statusbar-right">
          <span>{countWords(note.text)} 字</span>
          <span className="statusbar-divider">/</span>
          <span>{note.text.length} 字符</span>
        </span>
      </footer>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
        className="visually-hidden"
        onChange={handleFileInput}
        aria-label="选择图片"
      />

      <Menu
        open={Boolean(moreAnchor)}
        anchor={moreAnchor}
        align="end"
        onClose={() => setMoreAnchor(null)}
        label="备忘录操作"
        width={236}
      >
        <MenuItem
          icon={<Copy size={14} />}
          label="复制备忘录"
          onSelect={() => {
            onDuplicate(note.id);
            setMoreAnchor(null);
          }}
        />
        <MenuItem
          icon={<CheckCircle2 size={14} />}
          label="复制为纯文本"
          onSelect={() => void copyPlainText()}
        />
        <MenuSeparator />
        <MenuItem
          icon={<FileText size={14} />}
          label="导出为 HTML…"
          onSelect={() => void exportNote('html')}
        />
        <MenuItem
          icon={<Printer size={14} />}
          label="导出为 PDF…"
          onSelect={() => void exportNote('pdf')}
        />
        <MenuSeparator />
        <MenuLabel>移到文件夹</MenuLabel>
        {folders.map((folder) => (
          <MenuItem
            key={folder.id}
            icon={<FolderClosed size={14} />}
            label={folder.name}
            checked={folder.id === note.folderId}
            disabled={folder.id === note.folderId}
            onSelect={() => {
              onMoveToFolder(note.id, folder.id);
              setMoreAnchor(null);
            }}
          />
        ))}
        <MenuSeparator />
        <MenuItem
          icon={<Trash2 size={14} />}
          label="移到最近删除"
          destructive
          onSelect={() => {
            onMoveToTrash(note.id);
            setMoreAnchor(null);
          }}
        />
      </Menu>

      <Modal
        open={linkOpen}
        title={hasSelection ? '编辑链接' : '插入链接'}
        description={`使用 ${isMac ? 'Command' : 'Ctrl'} + 单击可以在浏览器中打开链接。`}
        onClose={() => setLinkOpen(false)}
        footer={
          <>
            <button type="button" className="modal-button" onClick={() => setLinkOpen(false)}>
              取消
            </button>
            {editor?.isActive('link') ? (
              <button type="button" className="modal-button danger-text" onClick={removeLink}>
                移除链接
              </button>
            ) : null}
            <button type="button" className="modal-button modal-button-primary" onClick={applyLink}>
              完成
            </button>
          </>
        }
      >
        <label className="field-label" htmlFor="link-url">
          链接地址
        </label>
        <input
          id="link-url"
          className="text-field"
          value={linkUrl}
          onChange={(event) => {
            setLinkUrl(event.target.value);
            setLinkError('');
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              applyLink();
            }
          }}
          placeholder="https://example.com"
          spellCheck={false}
          autoFocus
        />
        {!hasSelection ? (
          <>
            <label className="field-label field-label-spaced" htmlFor="link-label">
              显示文字
            </label>
            <input
              id="link-label"
              className="text-field"
              value={linkLabel}
              onChange={(event) => setLinkLabel(event.target.value)}
              placeholder="留空则使用链接地址"
            />
          </>
        ) : null}
        {linkError ? <p className="field-error">{linkError}</p> : null}
      </Modal>
    </section>
  );
}
