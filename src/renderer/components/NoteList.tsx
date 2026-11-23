import { useMemo, useRef, useState, type DragEvent, type KeyboardEvent } from 'react';
import {
  ArrowDownWideNarrow,
  ArrowUpWideNarrow,
  FolderClosed,
  Inbox,
  NotebookPen,
  Pin,
  SearchX,
  Trash2,
} from 'lucide-react';
import type { Note, SortDirection, SortKey } from '../../shared/types';
import { api } from '../lib/api';
import type { SearchResult } from '../lib/search';
import { displayNoteTitle, highlightTerms } from '../lib/search';
import { formatListDate, noteCountLabel } from '../lib/format';
import { getNotePreview } from '../lib/note';
import { NOTE_DRAG_MIME } from '../lib/view';
import { HighlightText } from './HighlightText';
import { Menu, MenuItem, MenuLabel, MenuSeparator } from './Menu';

type ListKind = 'all' | 'folder' | 'trash' | 'search';

interface NoteListProps {
  kind: ListKind;
  title: string;
  pinnedNotes: Note[];
  notes: Note[];
  searchResults: SearchResult[] | null;
  searchQuery: string;
  selectedNoteId: string | null;
  folderNames: Record<string, string>;
  showFolderNames: boolean;
  sortBy: SortKey;
  sortDir: SortDirection;
  onSortChange: (sortBy: SortKey, sortDir: SortDirection) => void;
  onCreateNote: () => void;
  onSelectNote: (noteId: string) => void;
  onEmptyTrash: () => void;
  trashCount: number;
}

export function NoteList({
  kind,
  title,
  pinnedNotes,
  notes,
  searchResults,
  searchQuery,
  selectedNoteId,
  folderNames,
  showFolderNames,
  sortBy,
  sortDir,
  onSortChange,
  onCreateNote,
  onSelectNote,
  onEmptyTrash,
  trashCount,
}: NoteListProps) {
  const [sortAnchor, setSortAnchor] = useState<DOMRect | null>(null);
  const sortButtonRef = useRef<HTMLButtonElement>(null);
  const terms = useMemo(() => highlightTerms(searchQuery), [searchQuery]);
  const totalCount = searchResults ? searchResults.length : pinnedNotes.length + notes.length;
  const isSearch = kind === 'search';
  const isTrash = kind === 'trash';

  const handleDragStart = (event: DragEvent<HTMLDivElement>, note: Note) => {
    if (isTrash) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.setData(NOTE_DRAG_MIME, note.id);
    event.dataTransfer.effectAllowed = 'move';
  };

  const handleRowKeyDown = (event: KeyboardEvent<HTMLDivElement>, noteId: string) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelectNote(noteId);
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      const rows = Array.from(document.querySelectorAll<HTMLElement>('.note-list .note-row'));
      const currentIndex = rows.indexOf(event.currentTarget);
      let nextIndex = currentIndex;
      if (event.key === 'ArrowDown') nextIndex = Math.min(rows.length - 1, currentIndex + 1);
      if (event.key === 'ArrowUp') nextIndex = Math.max(0, currentIndex - 1);
      if (event.key === 'Home') nextIndex = 0;
      if (event.key === 'End') nextIndex = rows.length - 1;
      const nextRow = rows[nextIndex];
      if (nextRow) {
        nextRow.focus();
        const nextId = nextRow.dataset.noteId;
        if (nextId) onSelectNote(nextId);
      }
    }
  };

  const subtitle = isSearch
    ? totalCount > 0
      ? `在所有备忘录中找到 ${totalCount} 条`
      : '试试其他关键词'
    : noteCountLabel(totalCount);

  return (
    <section className={`note-list-pane kind-${kind}`} aria-label="备忘录列表">
      <header className="note-list-header">
        <div className="note-list-heading">
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
        <div className="note-list-actions">
          {isTrash && trashCount > 0 ? (
            <button type="button" className="text-action danger-text" onClick={onEmptyTrash}>
              <Trash2 size={13} />
              清空
            </button>
          ) : null}
          {!isTrash && !isSearch ? (
            <button
              ref={sortButtonRef}
              type="button"
              className={`chrome-button${sortAnchor ? ' is-pressed' : ''}`}
              aria-label="排序方式"
              title="排序方式"
              onClick={() => {
                if (sortAnchor) setSortAnchor(null);
                else setSortAnchor(sortButtonRef.current?.getBoundingClientRect() ?? null);
              }}
            >
              {sortDir === 'asc' ? (
                <ArrowUpWideNarrow size={16} strokeWidth={1.9} />
              ) : (
                <ArrowDownWideNarrow size={16} strokeWidth={1.9} />
              )}
            </button>
          ) : null}
          {!isTrash ? (
            <button
              type="button"
              className="chrome-button compose-button"
              aria-label="新建备忘录"
              title={api.platform === 'darwin' ? '新建备忘录 (⌘N)' : '新建备忘录 (Ctrl+N)'}
              onClick={onCreateNote}
            >
              <NotebookPen size={17} strokeWidth={1.9} />
            </button>
          ) : null}
        </div>
      </header>

      <div className="note-list-scroll">
        {isSearch ? (
          totalCount === 0 ? (
            <EmptyList
              kind="search"
              title="没有找到结果"
              description="换一个关键词，或尝试更短的词组。"
            />
          ) : (
            <div className="note-list">
              {searchResults?.map((result) => {
                const note = result.note;
                return (
                  <div
                    key={note.id}
                    className={`note-row search-row${selectedNoteId === note.id ? ' is-selected' : ''}`}
                    role="button"
                    tabIndex={selectedNoteId === note.id ? 0 : -1}
                    aria-current={selectedNoteId === note.id}
                    data-note-id={note.id}
                    onClick={() => onSelectNote(note.id)}
                    onKeyDown={(event) => handleRowKeyDown(event, note.id)}
                    draggable
                    onDragStart={(event) => handleDragStart(event, note)}
                  >
                    <div className="note-row-topline">
                      <span className="note-row-title">
                        <HighlightText text={displayNoteTitle(note)} terms={terms} />
                      </span>
                      <span className="note-row-date">{formatListDate(note.updatedAt)}</span>
                    </div>
                    <p className="note-row-preview">
                      <HighlightText text={result.snippet} terms={terms} />
                    </p>
                    <div className="note-row-meta">
                      <FolderClosed size={11} strokeWidth={1.8} />
                      <span>{folderNames[note.folderId] ?? '备忘录'}</span>
                      {note.pinned ? (
                        <>
                          <span className="meta-dot">·</span>
                          <Pin size={10} strokeWidth={2} />
                          <span>已置顶</span>
                        </>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )
        ) : totalCount === 0 ? (
          <EmptyList
            kind={isTrash ? 'trash' : 'notes'}
            title={isTrash ? '最近删除是空的' : '暂无备忘录'}
            description={
              isTrash ? '移到这里的备忘录会一直保留，直到你永久删除它们。' : '记录一个想法，或者刚才发生的一件小事。'
            }
            action={
              !isTrash ? (
                <button type="button" className="empty-action" onClick={onCreateNote}>
                  <NotebookPen size={14} />
                  新建备忘录
                </button>
              ) : undefined
            }
          />
        ) : (
          <div className="note-list">
            {pinnedNotes.length > 0 ? (
              <>
                <div className="list-section-label">
                  <Pin size={11} strokeWidth={2.1} />
                  置顶
                </div>
                {pinnedNotes.map((note) => (
                  <NoteRow
                    key={note.id}
                    note={note}
                    selected={selectedNoteId === note.id}
                    isTrash={isTrash}
                    folderName={folderNames[note.folderId]}
                    showFolder={showFolderNames}
                    onSelect={onSelectNote}
                    onKeyDown={handleRowKeyDown}
                    onDragStart={handleDragStart}
                  />
                ))}
                {notes.length > 0 ? <div className="list-section-label other-label">其他</div> : null}
              </>
            ) : null}
            {notes.map((note) => (
              <NoteRow
                key={note.id}
                note={note}
                selected={selectedNoteId === note.id}
                isTrash={isTrash}
                folderName={folderNames[note.folderId]}
                showFolder={showFolderNames}
                onSelect={onSelectNote}
                onKeyDown={handleRowKeyDown}
                onDragStart={handleDragStart}
              />
            ))}
          </div>
        )}
      </div>

      <Menu
        open={Boolean(sortAnchor)}
        anchor={sortAnchor}
        align="end"
        onClose={() => setSortAnchor(null)}
        label="排序备忘录"
      >
        <MenuLabel>排序方式</MenuLabel>
        <MenuItem
          label="编辑日期"
          checked={sortBy === 'updatedAt'}
          onSelect={() => {
            onSortChange('updatedAt', sortDir);
            setSortAnchor(null);
          }}
        />
        <MenuItem
          label="创建日期"
          checked={sortBy === 'createdAt'}
          onSelect={() => {
            onSortChange('createdAt', sortDir);
            setSortAnchor(null);
          }}
        />
        <MenuItem
          label="标题"
          checked={sortBy === 'title'}
          onSelect={() => {
            onSortChange('title', sortDir);
            setSortAnchor(null);
          }}
        />
        <MenuSeparator />
        <MenuItem
          label="最新优先"
          checked={sortDir === 'desc'}
          onSelect={() => {
            onSortChange(sortBy, 'desc');
            setSortAnchor(null);
          }}
        />
        <MenuItem
          label="最早优先"
          checked={sortDir === 'asc'}
          onSelect={() => {
            onSortChange(sortBy, 'asc');
            setSortAnchor(null);
          }}
        />
      </Menu>
    </section>
  );
}

interface NoteRowProps {
  note: Note;
  selected: boolean;
  isTrash: boolean;
  folderName?: string;
  showFolder: boolean;
  onSelect: (id: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>, id: string) => void;
  onDragStart: (event: DragEvent<HTMLDivElement>, note: Note) => void;
}

function NoteRow({
  note,
  selected,
  isTrash,
  folderName,
  showFolder,
  onSelect,
  onKeyDown,
  onDragStart,
}: NoteRowProps) {
  return (
    <div
      className={`note-row${selected ? ' is-selected' : ''}`}
      role="button"
      tabIndex={selected ? 0 : -1}
      aria-current={selected}
      data-note-id={note.id}
      onClick={() => onSelect(note.id)}
      onKeyDown={(event) => onKeyDown(event, note.id)}
      draggable={!isTrash}
      onDragStart={(event) => onDragStart(event, note)}
    >
      <div className="note-row-topline">
        <span className="note-row-title">{displayNoteTitle(note)}</span>
        <span className="note-row-date">
          {formatListDate(isTrash ? (note.deletedAt ?? note.updatedAt) : note.updatedAt)}
        </span>
      </div>
      <p className="note-row-preview">{getNotePreview(note)}</p>
      {showFolder && folderName ? (
        <div className="note-row-meta">
          <FolderClosed size={11} strokeWidth={1.8} />
          <span>{folderName}</span>
        </div>
      ) : null}
    </div>
  );
}

interface EmptyListProps {
  kind: 'notes' | 'search' | 'trash';
  title: string;
  description: string;
  action?: React.ReactNode;
}

function EmptyList({ kind, title, description, action }: EmptyListProps) {
  const Icon = kind === 'search' ? SearchX : kind === 'trash' ? Trash2 : Inbox;
  return (
    <div className="empty-list">
      <div className="empty-list-icon">
        <Icon size={24} strokeWidth={1.5} />
      </div>
      <h2>{title}</h2>
      <p>{description}</p>
      {action}
    </div>
  );
}
