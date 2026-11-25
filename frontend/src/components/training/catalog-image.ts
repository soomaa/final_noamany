import { uploadUrl } from '@/components/employees/use-uploads';
/** Catalog photos: stored Gymora upload paths (served under /uploads) or absolute https links. */
export function catalogImageUrl(value?: string | null) { return uploadUrl(value) ?? (value?.startsWith('https://') ? value : null); }
