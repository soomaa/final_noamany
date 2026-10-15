import { uploadReferenceUrl } from '../../common/uploads/upload-reference-url';

export function hasMemberPhoto(reference?: string | null): boolean {
  const value = reference?.trim().toLowerCase();
  if (!value || ['0', 'null'].includes(value)) return false;
  const filename = value.split('?')[0].split('/').pop();
  return !['logo.png', 'user.png', 'no-image.png'].includes(filename ?? '');
}

export function memberPhotoUrl(base: string, reference?: string | null): string | null {
  if (!hasMemberPhoto(reference)) return null;
  // Legacy staff photos used file: references; the image-only club-member category
  // now shares the same public delivery contract as member-profile uploads.
  const value = reference!.trim();
  if (value.startsWith('/uploads/') || value.startsWith('/api/uploads/public/')) return value;
  if (value.startsWith('/api/uploads/files/')) return value.replace('/api/uploads/files/', '/api/uploads/public/');
  return uploadReferenceUrl(base, value.replace(/^file:/, 'public-file:'));
}
