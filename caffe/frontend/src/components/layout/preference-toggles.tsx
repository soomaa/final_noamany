import { Languages, Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useLocale } from '@/store/locale';
import { useTheme } from '@/store/theme';

type ToggleVariant = 'default' | 'on-dark';

const buttonBase =
  'rounded-xl border border-transparent transition-colors hover:border-primary/15 hover:bg-primary/5';

export function ThemeToggle({
  variant = 'default',
  className,
}: {
  variant?: ToggleVariant;
  className?: string;
}) {
  const { ui } = useLocale();
  const { theme, toggle } = useTheme();
  const { t } = useLocale();

  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn(
        buttonBase,
        variant === 'default' && 'bg-muted/40',
        variant === 'on-dark' && 'bg-white/10 text-white hover:border-white/20 hover:bg-white/15',
        className,
      )}
      onClick={toggle}
      aria-label={t('common.toggleTheme')}
      title={theme === 'dark' ? t('common.lightMode') : t('common.darkMode')}
    >
      {theme === 'dark' ? (
        <Sun className={cn('size-[18px]', variant === 'on-dark' ? 'text-amber-300' : 'text-warning')} />
      ) : (
        <Moon className={cn('size-[18px]', variant === 'on-dark' ? 'text-amber-200' : 'text-primary')} />
      )}
    </Button>
  );
}

export function LanguageToggle({
  variant = 'default',
  className,
}: {
  variant?: ToggleVariant;
  className?: string;
}) {
  const { ui } = useLocale();
  const { locale, toggleLocale, t } = useLocale();

  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn(
        buttonBase,
        'gap-1.5 px-2.5 font-semibold',
        variant === 'default' && 'bg-muted/40',
        variant === 'on-dark' && 'bg-white/10 text-white hover:border-white/20 hover:bg-white/15',
        className,
      )}
      onClick={toggleLocale}
      aria-label={t('common.toggleLanguage')}
      title={locale === 'ar' ? t('common.english') : t('common.arabic')}
    >
      <Languages className="size-4 shrink-0 opacity-80" />
      <span className="text-xs tracking-wide">{locale === 'ar' ? 'EN' : ui('ع')}</span>
    </Button>
  );
}

export function PreferenceToggles({
  variant = 'default',
  className,
}: {
  variant?: ToggleVariant;
  className?: string;
}) {
  const { ui } = useLocale();
  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      <LanguageToggle variant={variant} />
      <ThemeToggle variant={variant} />
    </div>
  );
}
