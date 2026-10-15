import { Languages, Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useLocale } from '@/store/locale';
import { useTheme } from '@/store/theme';

type ToggleVariant = 'default' | 'on-dark';

const buttonBase =
  'min-h-11 min-w-11 rounded-xl border border-transparent transition-colors hover:border-primary/15 hover:bg-primary/5';

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
  compact = false,
}: {
  variant?: ToggleVariant;
  className?: string;
  compact?: boolean;
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
        compact && 'size-11 px-2 sm:w-auto sm:px-2.5',
        variant === 'default' && 'bg-muted/40',
        variant === 'on-dark' && 'bg-white/10 text-white hover:border-white/20 hover:bg-white/15',
        className,
      )}
      onClick={toggleLocale}
      aria-label={t('common.toggleLanguage')}
      title={locale === 'ar' ? t('common.english') : t('common.arabic')}
    >
      <Languages className="size-4 shrink-0 opacity-80" />
      <span className={cn('text-xs tracking-wide', compact && 'hidden sm:inline')}>{locale === 'ar' ? 'EN' : ui('ع')}</span>
    </Button>
  );
}

export function PreferenceToggles({
  variant = 'default',
  className,
  compact = false,
}: {
  variant?: ToggleVariant;
  className?: string;
  compact?: boolean;
}) {
  const { ui } = useLocale();
  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      <LanguageToggle variant={variant} compact={compact} />
      <ThemeToggle variant={variant} className={compact ? 'hidden sm:inline-flex' : undefined} />
    </div>
  );
}
