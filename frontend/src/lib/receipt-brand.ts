/** Use the transparent ONE80 mark for bundled legacy receipt logos. */
export function receiptLogoUrl(value?: string | null): string {
  const defaultLogo = '/one-logo.png';
  if (!value?.trim()) return defaultLogo;
  try {
    const path = decodeURIComponent(new URL(value, 'https://receipt.local').pathname).toLowerCase();
    if (/\/(?:one[- ]?80[- ]?logo|one[- ]?logo|ordera[- ]?logo)\.(?:png|jpe?g)$/.test(path)) return defaultLogo;
  } catch { return defaultLogo; }
  return value.trim();
}
