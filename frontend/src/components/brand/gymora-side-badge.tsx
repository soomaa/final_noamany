import { cn } from '@/lib/utils';
import { useLocale } from '@/store/locale';

const GYMORA_LOGO_SRC = '/gymora-logo.png';
/** Icon-only crop of the MTA Codex mark — the full lockup's wordmark is too dark on a dark surface. */
const MTA_CODEX_ICON_SRC = '/mta-codex-icon.png';
const GYMORA_URL = 'https://gymora.metacodecx.com/';
const MTA_CODEX_URL = 'https://metacodecx.com/';
const GYMORA_PHONE_DISPLAY = '+20 103 354 1597';
/** wa.me click-to-chat link — digits only, country code first, no leading +. */
const GYMORA_WHATSAPP_URL = 'https://wa.me/201033541597';

/**
 * Vendor attribution for the login side panel, the same block SWAT shows: Gymora mark,
 * "GYMORA SYSTEM" and its tagline, the MTA Codex line between gold rules, and WhatsApp.
 * Only placed on a surface that is already dark. Every piece is its own link.
 */
export function GymoraSideBadge({ className }: { className?: string }) {
  const { t, isRtl } = useLocale();
  return (
    <section className={cn('gymora-side', className)} aria-label="Gymora System">
      <div className="gymora-side-layout" dir="ltr">
        <a className="gymora-side-logo" href={GYMORA_URL} target="_blank" rel="noopener noreferrer" aria-label={t('login.promoVisitGymora')}>
          <img src={GYMORA_LOGO_SRC} alt="Gymora System" width={1280} height={1280} />
        </a>
        <div className="gymora-side-copy">
          <a className="gymora-side-title" href={GYMORA_URL} target="_blank" rel="noopener noreferrer">
            <span>GYMORA</span> SYSTEM
          </a>
          <a className="gymora-side-description" href={GYMORA_URL} target="_blank" rel="noopener noreferrer" dir={isRtl ? 'rtl' : 'ltr'}>
            {t('login.promoDescription')}
          </a>
          <div className="gymora-side-credit">
            <span className="gymora-side-rule" aria-hidden="true" />
            <a className="gymora-side-maker" href={MTA_CODEX_URL} target="_blank" rel="noopener noreferrer" aria-label={t('login.promoVisitMta')}>
              <img src={MTA_CODEX_ICON_SRC} alt="" width={693} height={828} />
              <span>MTA Codex</span>
            </a>
            <a className="gymora-side-byline" dir={isRtl ? 'rtl' : 'ltr'} href={MTA_CODEX_URL} target="_blank" rel="noopener noreferrer">
              <span className="gymora-side-powered">{t('login.promoPoweredBy')}</span>
              <span dir="ltr">MTA Codex</span>
            </a>
            <span className="gymora-side-rule" aria-hidden="true" />
          </div>
        </div>
      </div>
      <a className="gymora-side-phone" href={GYMORA_WHATSAPP_URL} target="_blank" rel="noopener noreferrer" dir="ltr" aria-label={t('login.promoWhatsApp')}>
        <svg className="gymora-whatsapp-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M20.52 3.48A11.9 11.9 0 0 0 12.05 0C5.46 0 .1 5.36.1 11.95c0 2.1.55 4.16 1.6 5.97L0 24l6.25-1.64a11.94 11.94 0 0 0 5.8 1.48h.01c6.59 0 11.95-5.36 11.95-11.95a11.86 11.86 0 0 0-3.49-8.41ZM12.06 21.82a9.9 9.9 0 0 1-5.05-1.38l-.36-.21-3.71.97.99-3.61-.24-.37a9.9 9.9 0 0 1-1.52-5.27c0-5.48 4.46-9.94 9.94-9.94a9.87 9.87 0 0 1 7.02 2.91 9.87 9.87 0 0 1 2.91 7.02c0 5.48-4.46 9.94-9.98 9.88Zm5.45-7.44c-.3-.15-1.77-.87-2.04-.97-.28-.1-.48-.15-.68.15-.2.3-.77.97-.95 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.88-.79-1.48-1.77-1.65-2.07-.18-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.18.2-.3.3-.5.1-.2.05-.38-.03-.53-.07-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.68-.51h-.57c-.2 0-.53.07-.8.37-.28.3-1.05 1.02-1.05 2.49s1.07 2.89 1.22 3.09c.15.2 2.11 3.22 5.12 4.51.72.31 1.28.49 1.72.63.73.23 1.39.2 1.91.12.58-.09 1.77-.72 2.02-1.42.25-.7.25-1.3.18-1.42-.08-.13-.28-.2-.58-.35Z" />
        </svg>
        <span>{GYMORA_PHONE_DISPLAY}</span>
      </a>
    </section>
  );
}
