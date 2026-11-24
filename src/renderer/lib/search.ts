import type { Note } from '../../shared/types';
import { cleanTitle } from './format';

export interface SearchResult {
  note: Note;
  score: number;
  matchedTitle: boolean;
  snippet: string;
}

interface ParsedQuery {
  displayTokens: string[];
  normalizedTokens: string[];
}

export interface SearchIndexEntry {
  note: Note;
  title: string;
  normalizedTitle: string;
  normalizedBody: string;
  collapsedBody: string;
  normalizedCollapsedBody: string;
}

export type SearchIndex = Map<string, SearchIndexEntry>;

const normalize = (value: string) =>
  value
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .normalize('NFKC')
    .toLocaleLowerCase('zh-CN');

export function parseSearchQuery(query: string): ParsedQuery {
  const pieces = query.match(/"[^"]+"|\S+/g) ?? [];
  const seen = new Set<string>();
  const displayTokens: string[] = [];
  const normalizedTokens: string[] = [];

  for (const piece of pieces) {
    const display = piece.replace(/^"|"$/g, '').trim();
    if (!display) continue;
    const normalized = normalize(display);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    displayTokens.push(display);
    normalizedTokens.push(normalized);
  }

  return { displayTokens, normalizedTokens };
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let index = 0;
  while ((index = haystack.indexOf(needle, index)) !== -1) {
    count += 1;
    index += Math.max(1, needle.length);
  }
  return count;
}

export function notePlainText(note: Note): string {
  return note.text || '';
}

export function displayNoteTitle(note: Note): string {
  const title = cleanTitle(note.title);
  if (title) return title;
  const firstLine = notePlainText(note)
    .split('\n')
    .map((line) => line.trim())
    .find(Boolean);
  return firstLine ? firstLine.slice(0, 80) : '新建备忘录';
}

export function buildSearchIndex(notes: Note[]): SearchIndex {
  const index: SearchIndex = new Map();
  for (const note of notes) {
    if (note.deletedAt !== null) continue;
    const title = displayNoteTitle(note);
    const body = notePlainText(note);
    const collapsedBody = body.replace(/\s+/g, ' ').trim();
    index.set(note.id, {
      note,
      title,
      normalizedTitle: normalize(title),
      normalizedBody: normalize(body),
      collapsedBody,
      normalizedCollapsedBody: normalize(collapsedBody),
    });
  }
  return index;
}

function buildSnippet(entry: SearchIndexEntry, normalizedTokens: string[]): string {
  const { collapsedBody: body, normalizedCollapsedBody: lowerBody } = entry;
  if (!body) return '空白备忘录';
  let matchIndex = -1;
  let matchLength = 0;
  for (const token of normalizedTokens) {
    const index = lowerBody.indexOf(token);
    if (index !== -1 && (matchIndex === -1 || index < matchIndex)) {
      matchIndex = index;
      matchLength = token.length;
    }
  }

  if (matchIndex === -1) {
    return body.length > 180 ? `${body.slice(0, 180).trimEnd()}…` : body;
  }

  const before = 22;
  const after = 120;
  let start = Math.max(0, matchIndex - before);
  let end = Math.min(body.length, matchIndex + matchLength + after);

  if (start > 0) {
    const nextSpace = body.indexOf(' ', start);
    if (nextSpace !== -1 && nextSpace < matchIndex) start = nextSpace + 1;
  }
  if (end < body.length) {
    const previousSpace = body.lastIndexOf(' ', end);
    if (previousSpace > matchIndex + matchLength) end = previousSpace;
  }

  const prefix = start > 0 ? '…' : '';
  const suffix = end < body.length ? '…' : '';
  return `${prefix}${body.slice(start, end).trim()}${suffix}`;
}

export function searchNotesFromIndex(index: SearchIndex, query: string): SearchResult[] {
  const { normalizedTokens } = parseSearchQuery(query);
  if (normalizedTokens.length === 0) return [];

  const results: SearchResult[] = [];

  for (const entry of index.values()) {
    const { note, normalizedTitle, normalizedBody } = entry;
    const normalizedAll = `${normalizedTitle}\n${normalizedBody}`;
    if (!normalizedTokens.every((token) => normalizedAll.includes(token))) continue;

    let score = 0;
    let matchedTitle = false;
    for (const token of normalizedTokens) {
      const titleHits = countOccurrences(normalizedTitle, token);
      const bodyHits = countOccurrences(normalizedBody, token);
      if (titleHits > 0) {
        matchedTitle = true;
        score += 20 + titleHits * 8;
      }
      score += Math.min(bodyHits, 12) * 2;
    }
    if (normalizedTitle.startsWith(normalizedTokens[0])) score += 10;
    if (note.pinned) score += 1;

    results.push({
      note,
      score,
      matchedTitle,
      snippet: buildSnippet(entry, normalizedTokens),
    });
  }

  return results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.note.updatedAt - a.note.updatedAt;
  });
}

export function searchNotes(notes: Note[], query: string, preparedIndex?: SearchIndex): SearchResult[] {
  return searchNotesFromIndex(preparedIndex ?? buildSearchIndex(notes), query);
}

export function highlightTerms(query: string): string[] {
  return parseSearchQuery(query).displayTokens;
}
