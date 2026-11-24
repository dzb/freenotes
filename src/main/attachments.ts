import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { net, protocol } from 'electron';
import type { AttachmentRecord, NotebookData } from '../shared/types';
import type { NotebookDatabase } from './database';

export const ATTACHMENT_SCHEME = 'freenotes-asset';

const MIME_EXTENSIONS: Record<string, string> = {
  'image/avif': 'avif',
  'image/gif': 'gif',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/svg+xml': 'svg',
  'image/webp': 'webp',
};

const EXTENSION_MIMES: Record<string, string> = {
  avif: 'image/avif',
  gif: 'image/gif',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  png: 'image/png',
  svg: 'image/svg+xml',
  webp: 'image/webp',
};

const DATA_URL_PATTERN = /data:(image\/[a-zA-Z0-9.+-]+);base64,([a-zA-Z0-9+/=\r\n]+)/g;
const ASSET_URL_PATTERN = /freenotes-asset:\/\/([^"'\s<>]+)/g;

export function registerAttachmentScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: ATTACHMENT_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true,
      },
    },
  ]);
}

export function mimeTypeForPath(filePath: string): string {
  const extension = path.extname(filePath).slice(1).toLowerCase();
  return EXTENSION_MIMES[extension] ?? 'application/octet-stream';
}

function extensionForMime(mimeType: string, fileName: string): string {
  return MIME_EXTENSIONS[mimeType] ?? (path.extname(fileName).slice(1).toLowerCase() || 'bin');
}

export function assetUrlFor(relativePath: string): string {
  return `${ATTACHMENT_SCHEME}:///${relativePath.split('/').map(encodeURIComponent).join('/')}`;
}

export function referencedAttachmentPaths(html: string): Set<string> {
  const paths = new Set<string>();
  for (const match of html.matchAll(ASSET_URL_PATTERN)) {
    try {
      const relativePath = decodeURIComponent(match[1]).replace(/^\/+/, '');
      if (relativePath.startsWith('attachments/')) paths.add(relativePath);
    } catch {
      // Ignore malformed URLs; the editor will show a broken image.
    }
  }
  return paths;
}

export class AttachmentStore {
  readonly attachmentsDir: string;

  constructor(
    private readonly userDataDir: string,
    private readonly database: NotebookDatabase,
  ) {
    this.attachmentsDir = path.join(userDataDir, 'attachments');
    fs.mkdirSync(this.attachmentsDir, { recursive: true });
  }

  resolveRelativePath(relativePath: string): string {
    const normalized = path.posix.normalize(relativePath.replaceAll('\\', '/'));
    if (!normalized.startsWith('attachments/') || normalized.includes('..')) {
      throw new Error('附件路径无效。');
    }
    const resolved = path.resolve(this.userDataDir, normalized);
    if (resolved !== this.attachmentsDir && !resolved.startsWith(`${this.attachmentsDir}${path.sep}`)) {
      throw new Error('附件路径超出允许范围。');
    }
    return resolved;
  }

  private async writeBufferAtomically(targetPath: string, data: Uint8Array): Promise<void> {
    await fsp.mkdir(path.dirname(targetPath), { recursive: true });
    const tempPath = `${targetPath}.${process.pid}.${randomUUID()}.tmp`;
    try {
      const handle = await fsp.open(tempPath, 'w', 0o600);
      try {
        await handle.writeFile(data);
        await handle.sync();
      } finally {
        await handle.close();
      }
      try {
        await fsp.rename(tempPath, targetPath);
      } catch (error) {
        if (!fs.existsSync(targetPath)) throw error;
        await fsp.rm(targetPath, { force: true });
        await fsp.rename(tempPath, targetPath);
      }
    } catch (error) {
      await fsp.rm(tempPath, { force: true }).catch(() => undefined);
      throw error;
    }
  }

  listAttachments(): AttachmentRecord[] {
    return this.database.getAllAttachments();
  }

  async ensureAttachmentRecord(relativePath: string): Promise<AttachmentRecord> {
    const existing = this.database.getAllAttachments().find((attachment) => attachment.relativePath === relativePath);
    if (existing) return existing;
    const filePath = this.resolveRelativePath(relativePath);
    const data = await fsp.readFile(filePath);
    const sha256 = createHash('sha256').update(data).digest('hex');
    const attachment: AttachmentRecord = {
      id: sha256,
      relativePath,
      fileName: path.basename(filePath),
      mimeType: mimeTypeForPath(filePath),
      byteSize: data.byteLength,
      sha256,
      createdAt: Date.now(),
    };
    this.database.saveAttachments([attachment]);
    return attachment;
  }

  async saveBuffer(data: Uint8Array, fileName: string, mimeType: string): Promise<AttachmentRecord> {
    if (!mimeType.startsWith('image/')) throw new Error('只支持图片附件。');
    if (data.byteLength === 0) throw new Error('附件内容为空。');

    const sha256 = createHash('sha256').update(data).digest('hex');
    const extension = extensionForMime(mimeType, fileName);
    const relativePath = `attachments/${sha256.slice(0, 2)}/${sha256}.${extension}`;
    const targetPath = this.resolveRelativePath(relativePath);

    let shouldWrite = true;
    if (fs.existsSync(targetPath)) {
      try {
        const existing = await fsp.readFile(targetPath);
        shouldWrite = createHash('sha256').update(existing).digest('hex') !== sha256;
      } catch {
        shouldWrite = true;
      }
    }
    if (shouldWrite) await this.writeBufferAtomically(targetPath, data);

    const attachment: AttachmentRecord = {
      id: sha256,
      relativePath,
      fileName: fileName.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').trim() || `image.${extension}`,
      mimeType,
      byteSize: data.byteLength,
      sha256,
      createdAt: Date.now(),
    };
    this.database.saveAttachments([attachment]);
    return attachment;
  }

  async migrateInlineImages(html: string): Promise<{ html: string; attachments: AttachmentRecord[] }> {
    const matches = [...html.matchAll(DATA_URL_PATTERN)];
    if (matches.length === 0) return { html, attachments: [] };

    const replacements = new Map<string, string>();
    const attachments: AttachmentRecord[] = [];
    for (const match of matches) {
      const dataUrl = match[0];
      if (replacements.has(dataUrl)) continue;
      try {
        const mimeType = match[1];
        const bytes = Buffer.from(match[2].replace(/\s+/g, ''), 'base64');
        if (bytes.length === 0) continue;
        const attachment = await this.saveBuffer(bytes, `image.${extensionForMime(mimeType, '')}`, mimeType);
        replacements.set(dataUrl, assetUrlFor(attachment.relativePath));
        attachments.push(attachment);
      } catch (error) {
        console.warn('[freenotes] Skipped invalid inline image during migration:', error);
      }
    }

    let migratedHtml = html;
    for (const [dataUrl, assetUrl] of replacements) {
      migratedHtml = migratedHtml.split(dataUrl).join(assetUrl);
    }
    return { html: migratedHtml, attachments };
  }

  async inlineAssets(html: string): Promise<string> {
    const replacements = new Map<string, string>();
    for (const match of html.matchAll(ASSET_URL_PATTERN)) {
      if (replacements.has(match[0])) continue;
      const relativePath = decodeURIComponent(match[1]).replace(/^\/+/, '');
      const filePath = this.resolveRelativePath(relativePath);
      const data = await fsp.readFile(filePath);
      const mimeType = mimeTypeForPath(filePath);
      replacements.set(match[0], `data:${mimeType};base64,${data.toString('base64')}`);
    }
    let inlined = html;
    for (const [assetUrl, dataUrl] of replacements) {
      inlined = inlined.split(assetUrl).join(dataUrl);
    }
    return inlined;
  }
}

export function registerAttachmentProtocol(store: AttachmentStore): void {
  protocol.handle(ATTACHMENT_SCHEME, async (request) => {
    try {
      const url = new URL(request.url);
      const relativePath = decodeURIComponent(`${url.hostname}${url.pathname}`).replace(/^\/+/, '');
      const filePath = store.resolveRelativePath(relativePath);
      return await net.fetch(pathToFileURL(filePath).toString());
    } catch (error) {
      console.warn('[freenotes] Failed to serve attachment:', request.url, error);
      return new Response('Not found', { status: 404 });
    }
  });
}

export async function migrateNotebookInlineImages(
  data: NotebookData,
  store: AttachmentStore,
): Promise<{ data: NotebookData; attachments: AttachmentRecord[] }> {
  const attachmentMap = new Map<string, AttachmentRecord>();
  const notes = [];
  for (const note of data.notes) {
    const migrated = await store.migrateInlineImages(note.content);
    notes.push({ ...note, content: migrated.html });
    for (const attachment of migrated.attachments) {
      attachmentMap.set(attachment.relativePath, attachment);
    }
  }
  return {
    data: { ...data, notes },
    attachments: [...attachmentMap.values()],
  };
}
