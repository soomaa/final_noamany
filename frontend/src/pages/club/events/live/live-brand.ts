/** شعار ONE80 الافتراضي لشاشات العرض الحي */
export const GYM_LOGO_URL = '/one-logo.png';

/** ألوان التطبيق — مأخوذة من index.css (--primary, --sidebar, --warning) */
export const APP_LIVE_THEME = {
  primaryHsl: '205 64% 45%',
  secondaryHsl: '205 78% 62%',
  bgFrom: '#0B2545',
  bgVia: '#0A1F38',
  bgTo: '#061528',
  accentPrimary: '#2E8BC7',
  accentGold: '#E8973A',
  accentInk: '#F8FAFC',
  footerText: 'ONE80 Gym & Fitness Hub',
  displayGradient:
    'radial-gradient(ellipse at top, #0B2545 0%, #0A1F38 55%, #061528 100%)',
} as const;

export function resolveEventLogo(logoUrl?: string | null): string {
  const trimmed = logoUrl?.trim();
  return trimmed || GYM_LOGO_URL;
}
