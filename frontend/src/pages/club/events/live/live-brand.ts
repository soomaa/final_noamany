import { LOGO_SRC } from '@/components/brand/logo';

/** شعار Noamany Fitness Center الافتراضي لشاشات العرض الحي */
export const GYM_LOGO_URL = LOGO_SRC;

/** ألوان التطبيق — مأخوذة من index.css (--primary, --sidebar, --warning) */
export const APP_LIVE_THEME = {
  primaryHsl: '357 85% 52%',
  secondaryHsl: '357 88% 62%',
  bgFrom: '#351012',
  bgVia: '#1D0B0C',
  bgTo: '#080808',
  accentPrimary: '#ED1C24',
  accentGold: '#F75D64',
  accentInk: '#F8FAFC',
  footerText: 'Noamany Fitness Center',
  displayGradient:
    'radial-gradient(ellipse at top, #351012 0%, #1D0B0C 55%, #080808 100%)',
} as const;

export function resolveEventLogo(logoUrl?: string | null): string {
  const trimmed = logoUrl?.trim();
  return trimmed || GYM_LOGO_URL;
}
