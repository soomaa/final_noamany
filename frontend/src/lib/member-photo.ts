/**
 * Legacy gym systems wrote a shared placeholder filename into the member photo column
 * for anyone who never uploaded a picture. Those files are not part of the uploads tree,
 * so treating them as real photos renders a broken image instead of the initials avatar.
 */
const PLACEHOLDER_MEMBER_PHOTOS = new Set(['logo.png', 'user.png', 'no-image.png']);

/**
 * Public URL for a member photo, or `null` when the member has no real picture so the
 * caller falls back to initials. Kept dependency-free so it stays unit-testable.
 */
export function memberAvatarUrl(image?: string | null): string | null {
  const trimmed = image?.trim();
  if (!trimmed || ['0', 'null'].includes(trimmed.toLowerCase()) || PLACEHOLDER_MEMBER_PHOTOS.has(trimmed.toLowerCase().split('?')[0]!.split('/').pop()!)) return null;
  if (trimmed.startsWith('http')) return trimmed;
  if (trimmed.startsWith('file:')) return `/api/uploads/public/${encodeURIComponent(trimmed.slice(5))}`;
  if (trimmed.startsWith('public-file:')) {
    return `/api/uploads/public/${encodeURIComponent(trimmed.slice('public-file:'.length))}`;
  }
  if (trimmed.startsWith('/api/uploads/public/')) return trimmed;
  if (trimmed.startsWith('/api/uploads/files/')) return trimmed.replace('/api/uploads/files/', '/api/uploads/public/');
  if (trimmed.startsWith('/uploads/')) return trimmed;
  return `/uploads/${trimmed.replace(/^uploads\//, '')}`;
}
