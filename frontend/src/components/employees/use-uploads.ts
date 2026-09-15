import { useState } from 'react';
import { api, apiError } from '@/lib/api';
import { toast } from 'sonner';

/** Backend upload categories (POST /api/uploads/:category → { path, filename, url }). */
export type UploadCategory = 'emp-photo' | 'emp-bank' | 'signature' | 'document' | 'club-member' | 'product-image' | 'portal-image' | 'portal-file' | 'storage-doc' | 'inbody' | 'circular' | 'warning';

export interface UploadResult {
  path: string;
  filename: string;
  url: string;
  originalFilename: string;
  mimeType: string;
  byteSize: number;
  sha256: string;
}

/**
 * Uploads a single file to /api/uploads/:category and returns the stored
 * relative path (served at /uploads/<path>). Surfaces the API's Arabic error
 * message via a toast and resolves to null on failure.
 */
export function useFileUpload() {
  const [uploading, setUploading] = useState(false);

  const uploadDetailed = async (category: UploadCategory, file: File): Promise<UploadResult | null> => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const { data } = await api.post<UploadResult>(`/uploads/${category}`, fd);
      return data;
    } catch (e) {
      toast.error(apiError(e));
      return null;
    } finally {
      setUploading(false);
    }
  };

  const upload = async (category: UploadCategory, file: File): Promise<string | null> => {
    const result = await uploadDetailed(category, file);
    return result?.path ?? null;
  };

  return { upload, uploadDetailed, uploading };
}

/** Public URL for a stored upload path (handles already-absolute paths). */
export function uploadUrl(path?: string | null): string | null {
  if (!path || path === '0') return null;
  if (path.startsWith('http')) return path;
  if (path.startsWith('/uploads/')) return path;
  const normalized = path.replace(/^uploads\//, '');
  return `/uploads/${normalized}`;
}

/** Session/user avatar — employee upload paths or legacy users.image filename. */
export function userAvatarUrl(image?: string | null): string | null {
  if (!image || image === '0') return null;
  if (image.includes('/')) return uploadUrl(image);
  return `/uploads/user/${image}`;
}
