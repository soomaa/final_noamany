import { useState } from 'react';
import { api, apiError } from '@/lib/api';
import { toast } from 'sonner';

/** Backend upload categories (POST /api/uploads/:category → { path, filename, url }). */
export type HrUploadCategory = 'emp-photo' | 'emp-bank' | 'signature' | 'document';
export type UploadCategory = 'equipment-image' | HrUploadCategory | (string & Record<never, never>);

interface UploadResult {
  path: string;
  filename: string;
  url: string;
}

/**
 * Uploads a single file to /api/uploads/:category and returns the stored
 * opaque file reference. Surfaces the API's Arabic error
 * message via a toast and resolves to null on failure.
 */
export function useFileUpload() {
  const [uploading, setUploading] = useState(false);

  const upload = async (category: UploadCategory, file: File): Promise<string | null> => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const { data } = await api.post<UploadResult>(`/uploads/${category}`, fd);
      return data.path;
    } catch (e) {
      toast.error(apiError(e));
      return null;
    } finally {
      setUploading(false);
    }
  };

  return { upload, uploading };
}

/** Authenticated URL for an opaque upload reference. */
export function uploadUrl(path?: string | null): string | null {
  if (!path || path === '0') return null;
  if (path.startsWith('public-file:')) return `/api/uploads/public/${path.slice(12)}`;
  if (path.startsWith('file:')) return `/api/uploads/files/${path.slice(5)}`;
  // Legacy static paths are intentionally not reconstructed: the backend no longer
  // exposes the upload root. They must be migrated to opaque file metadata.
  return null;
}

/** Session/user avatar — employee upload paths or legacy users.image filename. */
export function userAvatarUrl(image?: string | null): string | null {
  if (!image || image === '0') return null;
  return uploadUrl(image);
}
