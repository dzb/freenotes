import { useEffect } from 'react';
import type { Editor } from '@tiptap/react';
import { parseSearchQuery } from '../lib/search';

interface HighlightRegistryLike {
  set: (name: string, highlight: unknown) => void;
  delete: (name: string) => void;
}

const registry = (CSS as unknown as { highlights?: HighlightRegistryLike }).highlights;
const HighlightConstructor = (
  window as unknown as { Highlight?: new (...ranges: Range[]) => unknown }
).Highlight;

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Paints all search hits inside the editor with the browser Highlight API.
 * This keeps search context visible while reading the opened note without
 * mutating the rich-text document or its undo history.
 */
export function useSearchHighlights(editor: Editor | null, query: string, text: string): void {
  useEffect(() => {
    if (!editor) return;
    if (!registry || !HighlightConstructor) return;
    const name = 'macnotes-search';

    const { displayTokens } = parseSearchQuery(query);
    if (displayTokens.length === 0) {
      registry.delete(name);
      return;
    }

    const matcher = new RegExp(
      displayTokens
        .slice()
        .sort((a, b) => b.length - a.length)
        .map(escapeRegExp)
        .join('|'),
      'gi',
    );
    const ranges: Range[] = [];
    const walker = document.createTreeWalker(editor.view.dom, NodeFilter.SHOW_TEXT);
    let current = walker.nextNode();

    while (current && ranges.length < 600) {
      const node = current as Text;
      const content = node.nodeValue ?? '';
      if (content) {
        matcher.lastIndex = 0;
        let match = matcher.exec(content);
        while (match && ranges.length < 600) {
          if (match[0].length > 0) {
            const range = document.createRange();
            range.setStart(node, match.index);
            range.setEnd(node, match.index + match[0].length);
            ranges.push(range);
          }
          if (match.index + match[0].length >= content.length) break;
          match = matcher.exec(content);
        }
      }
      current = walker.nextNode();
    }

    if (ranges.length === 0) {
      registry.delete(name);
      return;
    }

    registry.set(name, new HighlightConstructor(...ranges));

    const scrollContainer = editor.view.dom.closest('.editor-scroll');
    const firstRange = ranges[0];
    if (scrollContainer) {
      const matchRect = firstRange.getBoundingClientRect();
      const containerRect = scrollContainer.getBoundingClientRect();
      const isOutside =
        matchRect.top < containerRect.top + 40 || matchRect.bottom > containerRect.bottom - 60;
      if (isOutside) {
        const top = scrollContainer.scrollTop + matchRect.top - containerRect.top - 150;
        scrollContainer.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
      }
    }

    return () => {
      registry.delete(name);
    };
  }, [editor, query, text]);
}
