import { uploadUrl } from '@/components/employees/use-uploads';

/** Inline SVG placeholder when a product has no uploaded image. */
export const DEFAULT_PRODUCT_IMAGE =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 120'%3E%3Crect fill='%23f1f5f9' width='120' height='120'/%3E%3Ctext x='50%25' y='52%25' dominant-baseline='middle' text-anchor='middle' fill='%2394a3b8' font-family='system-ui,sans-serif' font-size='14'%3E%F0%9F%8F%8B%EF%B8%8F%3C/text%3E%3C/svg%3E";

/** Resolve stored upload path (or absolute URL) for display; falls back to placeholder. */
export function resolveProductImageUrl(imageUrl?: string | null): string {
  if (imageUrl?.startsWith('https://')) return imageUrl;
  return uploadUrl(imageUrl) ?? DEFAULT_PRODUCT_IMAGE;
}
