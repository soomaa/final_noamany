import { uploadUrl } from '@/components/employees/use-uploads';
import { DEFAULT_PRODUCT_IMAGE } from './product-image-fallback';

export { applyProductImageFallback, DEFAULT_PRODUCT_IMAGE } from './product-image-fallback';

/** Resolve stored upload path (or absolute URL) for display; falls back to placeholder. */
export function resolveProductImageUrl(imageUrl?: string | null): string {
  if (imageUrl?.startsWith('https://')) return imageUrl;
  return uploadUrl(imageUrl) ?? DEFAULT_PRODUCT_IMAGE;
}
