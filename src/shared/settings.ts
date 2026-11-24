import type { FontFamily, FontSize, NotebookSettings } from './types';

export const FONT_FAMILIES: FontFamily[] = ['system', 'serif', 'mono'];
export const FONT_SIZES: FontSize[] = [13, 14, 15, 16, 18];

export const DEFAULT_SETTINGS: NotebookSettings = {
  theme: 'system',
  sortBy: 'updatedAt',
  sortDir: 'desc',
  fontFamily: 'system',
  fontSize: 14,
};

export function normalizeSettings(raw: unknown): NotebookSettings {
  const value = raw && typeof raw === 'object' ? (raw as Partial<NotebookSettings>) : {};
  const theme = ['system', 'light', 'dark'].includes(value.theme ?? '')
    ? (value.theme as NotebookSettings['theme'])
    : DEFAULT_SETTINGS.theme;
  const sortBy = ['updatedAt', 'createdAt', 'title'].includes(value.sortBy ?? '')
    ? (value.sortBy as NotebookSettings['sortBy'])
    : DEFAULT_SETTINGS.sortBy;
  const sortDir = ['asc', 'desc'].includes(value.sortDir ?? '')
    ? (value.sortDir as NotebookSettings['sortDir'])
    : DEFAULT_SETTINGS.sortDir;
  const fontFamily = FONT_FAMILIES.includes(value.fontFamily as FontFamily)
    ? (value.fontFamily as FontFamily)
    : DEFAULT_SETTINGS.fontFamily;
  const fontSize = FONT_SIZES.includes(value.fontSize as FontSize)
    ? (value.fontSize as FontSize)
    : DEFAULT_SETTINGS.fontSize;
  return { theme, sortBy, sortDir, fontFamily, fontSize };
}
