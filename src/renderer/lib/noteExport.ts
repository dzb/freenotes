import type { FontFamily, FontSize } from '../../shared/types';
import { escapeHtml } from './format';

function sanitizeRichHtml(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, '')
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');
}

export interface NoteExportTypography {
  fontFamily: FontFamily;
  fontSize: FontSize;
}

const FONT_STACKS: Record<FontFamily, string> = {
  system:
    '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", "Noto Sans CJK SC", "PingFang SC", sans-serif',
  serif:
    '"Songti SC", "STSong", "Noto Serif CJK SC", "Source Han Serif SC", Georgia, serif',
  mono:
    '"SFMono-Regular", "Cascadia Code", "JetBrains Mono", "Noto Sans Mono", "Noto Sans CJK SC", monospace',
};

function exportStyles(typography: NoteExportTypography): string {
  return `
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  html { background: #ffffff; }
  body {
    margin: 0 auto;
    max-width: 820px;
    padding: 48px 52px 64px;
    color: #2c2b28;
    background: #ffffff;
    font-family: ${FONT_STACKS[typography.fontFamily]};
    font-size: ${typography.fontSize}px;
    line-height: 1.75;
    word-break: break-word;
  }
  h1, h2, h3 { color: #1f1e1b; line-height: 1.35; margin: 1.4em 0 0.55em; }
  h1 { font-size: 2em; }
  h2 { font-size: 1.53em; }
  h3 { font-size: 1.2em; }
  p { margin: 0.65em 0; }
  a { color: #a56a1b; text-decoration: underline; text-underline-offset: 2px; }
  strong { font-weight: 650; }
  mark { background: #ffe58a; color: inherit; border-radius: 2px; padding: 0 1px; }
  blockquote {
    margin: 1.1em 0;
    padding: 0.25em 0 0.25em 1em;
    border-left: 3px solid #d8c49d;
    color: #696558;
  }
  ul, ol { padding-left: 1.55em; }
  li { margin: 0.2em 0; }
  ul[data-type="taskList"] { list-style: none; padding-left: 0; }
  li[data-type="taskItem"] { display: flex; align-items: flex-start; gap: 0.55em; }
  li[data-type="taskItem"] > label { flex: 0 0 auto; margin-top: 0.3em; }
  li[data-type="taskItem"] > div { flex: 1 1 auto; }
  li[data-type="taskItem"] input { pointer-events: none; }
  img { display: block; max-width: 100%; height: auto; margin: 1.2em auto; border-radius: 6px; }
  table { width: 100%; border-collapse: collapse; margin: 1.2em 0; font-size: 0.94em; }
  th, td { border: 1px solid #ddd8cc; padding: 0.55em 0.7em; vertical-align: top; }
  th { background: #f6f2e8; font-weight: 650; }
  code { font-family: "SFMono-Regular", Consolas, monospace; background: #f4f1ea; padding: 0.12em 0.32em; border-radius: 4px; }
  pre { overflow-x: auto; padding: 1em; background: #f4f1ea; border-radius: 6px; white-space: pre-wrap; }
  hr { border: 0; border-top: 1px solid #e5e1d8; margin: 2em 0; }
  .note-export-title { margin-top: 0; margin-bottom: 1.4em; }
  .note-export-title:empty { display: none; }
  @page { size: A4; margin: 18mm; }
  @media print {
    html, body { background: #ffffff; }
    body { max-width: none; padding: 0; }
    a { color: inherit; }
    img, table, blockquote, pre { break-inside: avoid; }
  }
`;
}

export function buildStandaloneNoteHtml(
  title: string,
  content: string,
  typography: NoteExportTypography = { fontFamily: 'system', fontSize: 14 },
): string {
  const safeTitle = escapeHtml(title.trim());
  const safeContent = sanitizeRichHtml(content || '<p></p>');
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="generator" content="FreeNotes" />
  <title>${safeTitle || '未命名备忘录'}</title>
  <style>${exportStyles(typography)}</style>
</head>
<body>
  <h1 class="note-export-title">${safeTitle}</h1>
  <article class="note-export-content">${safeContent}</article>
</body>
</html>`;
}
