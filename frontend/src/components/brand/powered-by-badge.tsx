import { cn } from '@/lib/utils';
import { useLocale } from '@/store/locale';

export const GYMORA_LOGO_SRC = '/gymora-logo.png';
/** Icon-only crop of the MTA Codex mark — the full lockup's wordmark is too dark to read on this dark surface. */
export const MTA_CODEX_ICON_SRC = '/mta-codex-icon.png';
export const GYMORA_URL = 'https://gymora.metacodecx.com/';
export const MTA_CODEX_URL = 'https://metacodecx.com/';
export const GYMORA_PHONE_DISPLAY = '+20 103 354 1597';
/** wa.me click-to-chat link — digits only, country code first, no leading +. */
export const GYMORA_WHATSAPP_URL = 'https://wa.me/201033541597';

interface PoweredByBadgeProps {
  className?: string;
  /** Drop the phone number for tight spaces (e.g. the sidebar footer). */
  compact?: boolean;
  /** 'lg' for spacious, guaranteed-dark surfaces like the login hero; 'sm' for tight spots like the sidebar footer. */
  size?: 'sm' | 'lg';
}

/**
 * Vendor attribution: this deployment is FITNESS TIME's own app, built on the Gymora
 * platform by MTA Codex. Only ever placed on a surface that's already dark. Every piece
 * (Gymora mark, MTA Codex line, phone number) is its own link, per the reference layout.
 */
export function PoweredByBadge({ className, compact = false, size = 'sm' }: PoweredByBadgeProps) {
  const { t, isRtl } = useLocale();
  const lg = size === 'lg';

  if (lg) {
    return (
      <section className={cn('gymora-promo', className)} aria-label="Gymora System">
        <a className="gymora-promo-backdrop" href={GYMORA_URL} target="_blank" rel="noopener noreferrer" aria-label={isRtl ? 'زيارة موقع Gymora' : 'Visit Gymora'} />
        <div className="gymora-promo-layout" dir="ltr">
          <a className="gymora-promo-logo" href={GYMORA_URL} target="_blank" rel="noopener noreferrer">
            <img src={GYMORA_LOGO_SRC} alt="Gymora System" width={1280} height={1280} />
          </a>
          <div className="gymora-promo-copy">
            <a className="gymora-promo-title" href={GYMORA_URL} target="_blank" rel="noopener noreferrer">
              <span>GYMORA</span> SYSTEM
            </a>
            <a className="gymora-promo-description" href={GYMORA_URL} target="_blank" rel="noopener noreferrer" dir={isRtl ? 'rtl' : 'ltr'}>
              {isRtl ? 'نظام متكامل لإدارة الجيمات' : 'Complete gym management system'}
            </a>
            <div className="gymora-promo-credit">
              <span className="gymora-promo-rule" aria-hidden="true" />
              <a className="gymora-promo-maker" href={MTA_CODEX_URL} target="_blank" rel="noopener noreferrer" aria-label="MTA Codex">
                <img src={MTA_CODEX_ICON_SRC} alt="" width={693} height={828} />
                <span>MTA Codex</span>
              </a>
              <a className="gymora-promo-byline" dir={isRtl ? 'rtl' : 'ltr'} href={MTA_CODEX_URL} target="_blank" rel="noopener noreferrer">
                <span className="gymora-promo-powered">{t('brand.poweredBy')}</span>
                <span dir="ltr">MTA Codex</span>
              </a>
              <span className="gymora-promo-rule" aria-hidden="true" />
            </div>
          </div>
        </div>
        {!compact && (
          <a className="gymora-promo-phone" href={GYMORA_WHATSAPP_URL} target="_blank" rel="noopener noreferrer" dir="ltr" aria-label={`WhatsApp: ${GYMORA_PHONE_DISPLAY}`}>
            <svg className="gymora-whatsapp-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M20.52 3.48A11.9 11.9 0 0 0 12.05 0C5.46 0 .1 5.36.1 11.95c0 2.1.55 4.16 1.6 5.97L0 24l6.25-1.64a11.94 11.94 0 0 0 5.8 1.48h.01c6.59 0 11.95-5.36 11.95-11.95a11.86 11.86 0 0 0-3.49-8.41ZM12.06 21.82a9.9 9.9 0 0 1-5.05-1.38l-.36-.21-3.71.97.99-3.61-.24-.37a9.9 9.9 0 0 1-1.52-5.27c0-5.48 4.46-9.94 9.94-9.94a9.87 9.87 0 0 1 7.02 2.91 9.87 9.87 0 0 1 2.91 7.02c0 5.48-4.46 9.94-9.98 9.88Zm5.45-7.44c-.3-.15-1.77-.87-2.04-.97-.28-.1-.48-.15-.68.15-.2.3-.77.97-.95 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.88-.79-1.48-1.77-1.65-2.07-.18-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.18.2-.3.3-.5.1-.2.05-.38-.03-.53-.07-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.68-.51h-.57c-.2 0-.53.07-.8.37-.28.3-1.05 1.02-1.05 2.49s1.07 2.89 1.22 3.09c.15.2 2.11 3.22 5.12 4.51.72.31 1.28.49 1.72.63.73.23 1.39.2 1.91.12.58-.09 1.77-.72 2.02-1.42.25-.7.25-1.3.18-1.42-.08-.13-.28-.2-.58-.35Z" />
            </svg>
            <span>{GYMORA_PHONE_DISPLAY}</span>
          </a>
        )}
      </section>
    );
  }

  return (
    <div className={cn('flex flex-col', lg ? 'items-start gap-3' : 'items-center gap-1', className)}>
      <a href={GYMORA_URL} target="_blank" rel="noopener noreferrer" className="transition-opacity hover:opacity-80">
        <img src={GYMORA_LOGO_SRC} alt="Gymora" className={cn('w-auto object-contain', lg ? 'h-14 sm:h-16' : 'h-4')} />
      </a>

      <a
        href={MTA_CODEX_URL}
        target="_blank"
        rel="noopener noreferrer"
        className={cn('flex items-center transition-opacity hover:opacity-80', lg ? 'gap-2.5' : 'gap-1')}
      >
        <span className={cn('shrink-0 bg-white/25', lg ? 'h-px w-6 sm:w-8' : 'h-px w-2')} />
        <img src={MTA_CODEX_ICON_SRC} alt="" className={cn('w-auto shrink-0 object-contain', lg ? 'h-6 sm:h-7' : 'h-2.5')} />
        <span className={cn('whitespace-nowrap font-bold text-white', lg ? 'text-sm sm:text-base' : 'text-[9px]')}>
          MTA Codex
        </span>
        <span className={cn('whitespace-nowrap text-white/50', lg ? 'text-xs sm:text-sm' : 'text-[8px]')}>
          {t('brand.poweredBy')}
        </span>
        <span className={cn('shrink-0 bg-white/25', lg ? 'h-px w-6 sm:w-8' : 'h-px w-2')} />
      </a>

      {!compact && (
        <a
          href={GYMORA_WHATSAPP_URL}
          target="_blank"
          rel="noopener noreferrer"
          dir="ltr"
          className={cn(
            'whitespace-nowrap text-white/60 transition-colors hover:text-white',
            lg ? 'text-sm sm:text-base' : 'text-[9px]',
          )}
        >
          {GYMORA_PHONE_DISPLAY}
        </a>
      )}
    </div>
  );
}
