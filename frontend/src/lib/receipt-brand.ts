/** Use the transparent Noamany mark for bundled legacy receipt logos. */
export function receiptLogoUrl(value?: string | null): string {
  const defaultLogo = '/noamany-logo.png';
  if (!value?.trim()) return defaultLogo;
  try {
    const path = decodeURIComponent(new URL(value, 'https://receipt.local').pathname).toLowerCase();
    if (/^\/[^/]*logo\.(?:png|jpe?g)$/.test(path)) return defaultLogo;
  } catch { return defaultLogo; }
  return value.trim();
}
