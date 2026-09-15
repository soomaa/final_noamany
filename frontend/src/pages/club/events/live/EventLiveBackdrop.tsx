import { useEventSettings, EventSettings } from './useEventSettings';
import { findBackdropById, useBackdrops } from './useBackdrops';
import { APP_LIVE_THEME } from './live-brand';

const DEFAULT_GRADIENT = APP_LIVE_THEME.displayGradient;

export const BACKDROP_URLS: Record<'01' | '02' | '03' | 'navy', string> = {
  '01': DEFAULT_GRADIENT,
  '02': DEFAULT_GRADIENT,
  '03': DEFAULT_GRADIENT,
  navy: DEFAULT_GRADIENT,
};

export type BackdropChoice = '01' | '02' | '03' | 'navy' | 'custom' | string;
export type GraduationScreen = 'checkin' | 'display' | 'kiosk' | 'guest';

const VIDEO_RE = /\.(mp4|webm|mov|ogg|m4v)(\?|$)/i;

export const isVideoUrl = (u?: string | null) => !!u && VIDEO_RE.test(u);

const isCssGradient = (v?: string | null) =>
  !!v && (v.startsWith('radial-gradient') || v.startsWith('linear-gradient'));

const isDirectUrl = (v?: string | null) =>
  !!v && (v.startsWith('http') || v.startsWith('/') || v.startsWith('blob:') || v.startsWith('data:'));

export const resolveBackdropUrl = (settings: EventSettings, screen?: GraduationScreen): string => {
  const perScreen = screen
    ? ({
        checkin: settings.backdrop_checkin,
        display: settings.backdrop_display,
        kiosk: settings.backdrop_kiosk,
        guest: settings.backdrop_guest,
      }[screen] as BackdropChoice | null)
    : null;

  if (isDirectUrl(perScreen)) return perScreen as string;
  const choice: BackdropChoice = (perScreen as BackdropChoice) || (settings.backdrop_variant as BackdropChoice) || 'navy';
  if (choice === 'custom' && settings.backdrop_custom_url) return settings.backdrop_custom_url;
  if (choice === 'custom') return DEFAULT_GRADIENT;
  if (choice in BACKDROP_URLS) return BACKDROP_URLS[choice as keyof typeof BACKDROP_URLS];
  const db = findBackdropById(choice);
  if (db) return db.url;
  return DEFAULT_GRADIENT;
};

export const EventLiveBackdrop = ({
  screen,
  url,
  live,
}: {
  screen?: GraduationScreen;
  url?: string;
  live?: boolean;
}) => {
  const { settings } = useEventSettings({ live });
  useBackdrops();
  const src = url ?? resolveBackdropUrl(settings, screen);
  const vignette = Math.max(0, Math.min(100, settings.vignette_intensity ?? 18)) / 100;
  const isGradient = isCssGradient(src);
  const video = !isGradient && isVideoUrl(src);

  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse at top, var(--grad-bg-from, #1A1608) 0%, var(--grad-bg-via, #121008) 55%, var(--grad-bg-to, #050505) 100%)',
        }}
      />
      {isGradient ? (
        <div className="absolute inset-0" style={{ background: src }} />
      ) : video ? (
        <video
          src={src}
          autoPlay
          muted
          loop
          playsInline
          aria-hidden
          className="absolute inset-0 h-full w-full object-cover object-center"
        />
      ) : (
        <img
          src={src}
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full object-cover object-center"
        />
      )}
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(ellipse at center, transparent 35%, rgba(6,19,48,${vignette}) 100%)`,
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-black/25 via-transparent to-black/40" />
    </div>
  );
};

export default EventLiveBackdrop;
