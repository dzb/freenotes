const MAX_EDGE = 1800;

export interface PreparedImageAttachment {
  data: ArrayBuffer;
  fileName: string;
  mimeType: string;
}

function withExtension(fileName: string, extension: string): string {
  const withoutExtension = fileName.replace(/\.[^.]+$/, '');
  return `${withoutExtension || 'image'}.${extension}`;
}

async function originalAttachment(file: File): Promise<PreparedImageAttachment> {
  return {
    data: await file.arrayBuffer(),
    fileName: file.name || 'image',
    mimeType: file.type,
  };
}

export async function prepareImageAttachment(file: File): Promise<PreparedImageAttachment> {
  if (!file.type.startsWith('image/')) throw new Error('请选择图片文件。');
  if (file.type === 'image/gif') return originalAttachment(file);

  try {
    const bitmap = await createImageBitmap(file);
    const longestEdge = Math.max(bitmap.width, bitmap.height);
    if (longestEdge <= MAX_EDGE && file.size <= 900 * 1024) {
      bitmap.close();
      return originalAttachment(file);
    }

    const scale = Math.min(1, MAX_EDGE / longestEdge);
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) {
      bitmap.close();
      return originalAttachment(file);
    }
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((result) => resolve(result), 'image/webp', 0.88);
    });
    if (!blob || blob.size >= file.size) return originalAttachment(file);
    return {
      data: await blob.arrayBuffer(),
      fileName: withExtension(file.name, 'webp'),
      mimeType: 'image/webp',
    };
  } catch (error) {
    console.warn('[freenotes] Image optimization skipped', error);
    return originalAttachment(file);
  }
}
