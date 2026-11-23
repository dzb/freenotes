export type View =
  | { type: 'all' }
  | { type: 'folder'; folderId: string }
  | { type: 'trash' };

export function sameView(a: View, b: View): boolean {
  if (a.type !== b.type) return false;
  if (a.type === 'folder' && b.type === 'folder') return a.folderId === b.folderId;
  return true;
}

export const NOTE_DRAG_MIME = 'application/x-macnotes-note';
