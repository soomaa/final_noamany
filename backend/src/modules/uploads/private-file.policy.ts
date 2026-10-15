import { DetectedFileKind, HrFileCategoryAdapter } from '../../ports/files/file-category.adapter';

const portableCategories = new HrFileCategoryAdapter();

export function isPublicMediaCategory(category: string): boolean {
  return portableCategories.policy(category)?.publicMedia === true;
}

export function requiresEmployeeOwner(category: string): boolean {
  return portableCategories.policy(category)?.employeeOwner === true;
}

function startsWith(buffer: Buffer, signature: readonly number[]): boolean {
  return signature.every((byte, index) => buffer[index] === byte);
}

export function detectFileKind(buffer: Buffer): DetectedFileKind | null {
  if (startsWith(buffer, [0xff, 0xd8, 0xff])) return 'jpeg';
  if (startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';
  const prefix = buffer.subarray(0, 12).toString('latin1');
  if (prefix.startsWith('GIF87a') || prefix.startsWith('GIF89a')) return 'gif';
  if (prefix.startsWith('RIFF') && prefix.slice(8, 12) === 'WEBP') return 'webp';
  if (buffer.subarray(0, 5).toString('latin1') === '%PDF-') return 'pdf';
  if (startsWith(buffer, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) return 'office';
  if (
    startsWith(buffer, [0x50, 0x4b, 0x03, 0x04]) &&
    buffer.includes(Buffer.from('[Content_Types].xml')) &&
    (buffer.includes(Buffer.from('word/')) ||
      buffer.includes(Buffer.from('xl/')) ||
      buffer.includes(Buffer.from('ppt/')))
  ) {
    return 'office-zip';
  }
  return null;
}

export function isKindAllowedForCategory(
  category: string,
  kind: DetectedFileKind | null,
): boolean {
  return kind != null && (portableCategories.policy(category)?.allowedKinds.has(kind) ?? false);
}

export function safeOriginalName(value: string): string {
  const base = value.replaceAll('\\', '/').split('/').pop() ?? 'file';
  const cleaned = base.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return (cleaned || 'file').slice(0, 255);
}

export const FILE_KIND_METADATA: Record<DetectedFileKind, { extension: string; mime: string }> = {
  jpeg: { extension: 'jpg', mime: 'image/jpeg' },
  png: { extension: 'png', mime: 'image/png' },
  gif: { extension: 'gif', mime: 'image/gif' },
  webp: { extension: 'webp', mime: 'image/webp' },
  pdf: { extension: 'pdf', mime: 'application/pdf' },
  office: { extension: 'doc', mime: 'application/msword' },
  'office-zip': {
    extension: 'docx',
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  },
};
