export function collapseSearchText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}
