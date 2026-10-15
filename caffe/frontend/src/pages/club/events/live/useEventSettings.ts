import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { clubEventsLiveApi } from '@/lib/api/club-events-live';
import { useEventLiveContext } from './event-live-context';
import { APP_LIVE_THEME, GYM_LOGO_URL } from './live-brand';

export interface EventSettings {
  id: string;
  event_name: string;
  welcome_title: string;
  thank_you_message: string;
  primary_color: string;
  secondary_color: string;
  logo_url: string | null;
  footer_text: string;
  backdrop_variant: string;
  backdrop_checkin: string | null;
  backdrop_display: string | null;
  backdrop_kiosk: string | null;
  backdrop_guest: string | null;
  backdrop_custom_url: string | null;
  titles: string[];
  vignette_intensity: number;
  card_top_opacity: number;
  card_bottom_opacity: number;
  theme_preset: string;
  bg_from: string;
  bg_via: string;
  bg_to: string;
  accent_primary: string;
  accent_gold: string;
  accent_ink: string;
  font_family: string;
  hidden_default_backdrops: string[];
  default_backdrop_labels: Record<string, string>;
  show_program: boolean;
  event_start_time: string | null;
  event_end_time: string | null;
  btn_kiosk_staff: boolean;
  btn_kiosk_guest: boolean;
  btn_display_staff: boolean;
  btn_display_guest: boolean;
  btn_settings_staff: boolean;
  btn_settings_guest: boolean;
  btn_print_staff: boolean;
  btn_print_guest: boolean;
  hero_text: string;
  hero_font: string;
  hero_color: string;
  hero_size_px: number;
  hero_italic: boolean;
  hero_subtitle_text: string;
  hero_subtitle_color: string;
  intro_highlight: string;
  intro_text: string;
  checkin_steps: string[];
  thank_title: string;
  thank_body: string;
  hero_font_url: string | null;
  hero_font_family: string | null;
  display_welcome_color: string;
  display_welcome_size_px: number;
  display_welcome_font: string;
  display_name_color: string;
  display_name_glow_color: string;
  display_thanks_color: string;
  display_thanks_size_px: number;
  display_thanks_font: string;
  program_align: 'right' | 'left';
  program_offset_pct: number;
}

export const DEFAULT_TITLES = [
  'السيد', 'السيدة', 'الأستاذ', 'الأستاذة', 'الدكتور', 'الدكتورة',
  'المهندس', 'المهندسة', 'الكابتن', 'معالي', 'سعادة', 'ضيفنا', 'ضيفتنا',
];

export const DEFAULT_SETTINGS: EventSettings = {
  id: '',
  event_name: 'فعالية النادي',
  welcome_title: 'يسعدنا حضور',
  thank_you_message: 'شكراً لتشريفنا بحضورك، نتمنى لك وقتاً ممتعاً في النادي',
  primary_color: APP_LIVE_THEME.primaryHsl,
  secondary_color: APP_LIVE_THEME.secondaryHsl,
  logo_url: GYM_LOGO_URL,
  footer_text: APP_LIVE_THEME.footerText,
  backdrop_variant: 'one80',
  backdrop_checkin: null,
  backdrop_display: null,
  backdrop_kiosk: null,
  backdrop_guest: null,
  backdrop_custom_url: null,
  titles: DEFAULT_TITLES,
  vignette_intensity: 18,
  card_top_opacity: 35,
  card_bottom_opacity: 75,
  theme_preset: 'one80',
  bg_from: APP_LIVE_THEME.bgFrom,
  bg_via: APP_LIVE_THEME.bgVia,
  bg_to: APP_LIVE_THEME.bgTo,
  accent_primary: APP_LIVE_THEME.accentPrimary,
  accent_gold: APP_LIVE_THEME.accentGold,
  accent_ink: APP_LIVE_THEME.accentInk,
  font_family: 'Cairo',
  hidden_default_backdrops: [],
  default_backdrop_labels: {},
  show_program: true,
  event_start_time: '',
  event_end_time: '',
  btn_kiosk_staff: true,
  btn_kiosk_guest: true,
  btn_display_staff: true,
  btn_display_guest: true,
  btn_settings_staff: true,
  btn_settings_guest: true,
  btn_print_staff: true,
  btn_print_guest: true,
  hero_text: 'أهلاً وسهلاً',
  hero_font: 'Cairo',
  hero_color: APP_LIVE_THEME.accentGold,
  hero_size_px: 96,
  hero_italic: false,
  hero_subtitle_text: 'بضيوفنا الكرام',
  hero_subtitle_color: APP_LIVE_THEME.accentInk,
  intro_highlight: 'أهلاً وسهلاً بكم،',
  intro_text: 'يسعدنا تشريفكم في فعاليتنا. نرجو تسجيل حضوركم عبر الخطوات التالية.',
  checkin_steps: [
    'وجّه كاميرا جوالك إلى رمز QR',
    'اضغط الرابط الذي سيظهر',
    'أدخل اسمك ورقم جوالك ثم اضغط تأكيد',
  ],
  thank_title: 'شكراً لتشريفكم',
  thank_body: 'حضوركم أضفى علينا بهجةً، نتمنى لكم أجمل الأوقات.',
  hero_font_url: null,
  hero_font_family: null,
  display_welcome_color: APP_LIVE_THEME.accentGold,
  display_welcome_size_px: 30,
  display_welcome_font: 'Cairo',
  display_name_color: '#FFFFFF',
  display_name_glow_color: APP_LIVE_THEME.accentGold,
  display_thanks_color: APP_LIVE_THEME.accentInk,
  display_thanks_size_px: 20,
  display_thanks_font: 'Cairo',
  program_align: 'right',
  program_offset_pct: 22,
};

export const applyThemeColors = (primary: string, secondary: string) => {
  const root = document.documentElement;
  root.style.setProperty('--primary', primary);
  root.style.setProperty('--accent', primary);
  root.style.setProperty('--ring', primary);
  root.style.setProperty('--secondary', secondary);
};

export const applyGradTheme = (s: Partial<EventSettings>) => {
  const r = document.documentElement;
  if (s.bg_from) r.style.setProperty('--grad-bg-from', s.bg_from);
  if (s.bg_via) r.style.setProperty('--grad-bg-via', s.bg_via);
  if (s.bg_to) r.style.setProperty('--grad-bg-to', s.bg_to);
  if (s.accent_primary) r.style.setProperty('--grad-accent', s.accent_primary);
  if (s.accent_gold) r.style.setProperty('--grad-accent-gold', s.accent_gold);
  if (s.accent_ink) r.style.setProperty('--grad-accent-ink', s.accent_ink);
  if (s.font_family) r.style.setProperty('--grad-font', `"${s.font_family}", "Cairo", system-ui, sans-serif`);

  const hexToHsl = (hex?: string) => {
    if (!hex) return null;
    const m = hex.replace('#', '');
    const v = m.length === 3 ? m.split('').map((c) => c + c).join('') : m;
    if (v.length !== 6) return null;
    const rC = parseInt(v.slice(0, 2), 16) / 255;
    const gC = parseInt(v.slice(2, 4), 16) / 255;
    const bC = parseInt(v.slice(4, 6), 16) / 255;
    const max = Math.max(rC, gC, bC);
    const min = Math.min(rC, gC, bC);
    let h = 0;
    let sa = 0;
    const l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      sa = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case rC: h = (gC - bC) / d + (gC < bC ? 6 : 0); break;
        case gC: h = (bC - rC) / d + 2; break;
        case bC: h = (rC - gC) / d + 4; break;
      }
      h /= 6;
    }
    return { h: Math.round(h * 360), s: Math.round(sa * 100), l: Math.round(l * 100) };
  };
  const fmt = (c: { h: number; s: number; l: number }) => `${c.h} ${c.s}% ${c.l}%`;
  const green = hexToHsl(s.accent_primary);
  if (green) {
    r.style.setProperty('--grad-green', fmt(green));
    r.style.setProperty('--grad-green-dark', fmt({ ...green, l: Math.max(15, green.l - 12) }));
    r.style.setProperty('--grad-green-ink', fmt({ ...green, l: Math.max(10, green.l - 26) }));
  }
  const gold = hexToHsl(s.accent_gold);
  if (gold) {
    r.style.setProperty('--grad-gold', fmt(gold));
    r.style.setProperty('--grad-gold-dark', fmt({ ...gold, l: Math.max(15, gold.l - 12) }));
  }
};

export const useEventSettings = (options?: { live?: boolean }) => {
  const { eventId } = useEventLiveContext();
  const live = options?.live ?? false;
  const { data, isLoading } = useQuery({
    queryKey: ['club-event-live', eventId, 'settings'],
    queryFn: async () => {
      const raw = await clubEventsLiveApi.getDisplaySettings(eventId);
      return { ...DEFAULT_SETTINGS, ...(raw as Partial<EventSettings>) } as EventSettings;
    },
    ...(live ? { refetchInterval: 5000, refetchIntervalInBackground: true, staleTime: 2000 } : {}),
    placeholderData: (prev) => prev,
  });

  const settings = data ?? DEFAULT_SETTINGS;

  useEffect(() => {
    if (!data) return;
    applyThemeColors(data.primary_color, data.secondary_color);
    applyGradTheme(data);
  }, [data]);

  return { settings, loading: isLoading };
};
