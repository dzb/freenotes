import { useState, type RefObject } from 'react';
import { PanelLeftClose, PanelLeftOpen, Search, X } from 'lucide-react';
import { api } from '../lib/api';
import { TrafficLights } from './TrafficLights';

interface TitleBarProps {
  sidebarVisible: boolean;
  onToggleSidebar: () => void;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  onClearSearch: () => void;
  searchInputRef: RefObject<HTMLInputElement | null>;
  resultCount?: number | null;
}

export function TitleBar({
  sidebarVisible,
  onToggleSidebar,
  searchQuery,
  onSearchChange,
  onClearSearch,
  searchInputRef,
  resultCount,
}: TitleBarProps) {
  const [searchFocused, setSearchFocused] = useState(false);
  const hasQuery = searchQuery.trim().length > 0;
  const isMac = api.platform === 'darwin';

  return (
    <header className="titlebar">
      <div className="titlebar-left">
        {isMac ? null : <TrafficLights />}
        <button
          type="button"
          className="chrome-button sidebar-toggle no-drag"
          onClick={onToggleSidebar}
          aria-label={sidebarVisible ? '隐藏文件夹边栏' : '显示文件夹边栏'}
          title={sidebarVisible ? '隐藏边栏' : '显示边栏'}
        >
          {sidebarVisible ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
        </button>
        <div className="app-wordmark" aria-hidden="true">
          备忘录
        </div>
      </div>

      <div
        className="titlebar-drag-region"
        onDoubleClick={
          isMac
            ? undefined
            : () => {
                if (window.macnotes) window.macnotes.toggleMaximize();
              }
        }
      />

      <div className={`search-field no-drag${searchFocused ? ' is-focused' : ''}${hasQuery ? ' has-query' : ''}`}>
        <Search size={14} strokeWidth={2.2} className="search-icon" aria-hidden="true" />
        <input
          ref={searchInputRef}
          type="search"
          value={searchQuery}
          onChange={(event) => onSearchChange(event.target.value)}
          onFocus={() => setSearchFocused(true)}
          onBlur={() => setSearchFocused(false)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              if (hasQuery) onClearSearch();
              else (event.currentTarget as HTMLInputElement).blur();
            }
          }}
          placeholder="搜索所有备忘录"
          aria-label="全文搜索所有备忘录"
          spellCheck={false}
          autoComplete="off"
        />
        {hasQuery ? (
          <button type="button" className="search-clear" onClick={onClearSearch} aria-label="清除搜索">
            <X size={12} strokeWidth={2.4} />
          </button>
        ) : (
          <kbd className={`search-shortcut${searchFocused ? ' is-hidden' : ''}`}>{isMac ? '⌘ F' : 'Ctrl F'}</kbd>
        )}
        {hasQuery && resultCount !== undefined && resultCount !== null ? (
          <span className="search-result-count" aria-live="polite">
            {resultCount}
          </span>
        ) : null}
      </div>
    </header>
  );
}
