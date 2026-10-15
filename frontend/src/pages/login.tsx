import { zodResolver } from '@hookform/resolvers/zod';
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Dumbbell,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Sparkles,
  User,
  Users,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { z } from 'zod';
import { BrandLogo } from '@/components/brand/logo';
import { PoweredByBadge } from '@/components/brand/powered-by-badge';
import { PreferenceToggles } from '@/components/layout/preference-toggles';
import RotatingText from '@/components/ui/rotating-text';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { api, apiError } from '@/lib/api';
import { safeInternalPath } from '@/lib/navigation-safety';
import type { WorkspaceConfig } from '@/hooks/use-permission';
import { cn } from '@/lib/utils';
import { useAuth } from '@/store/auth';
import { useLocale } from '@/store/locale';
import { useTheme } from '@/store/theme';

type FormValues = { username: string; password: string };

const FEATURES = [
  { icon: Dumbbell, key: 'login.feature1' as const },
  { icon: CalendarDays, key: 'login.feature2' as const },
  { icon: Users, key: 'login.feature3' as const },
] as const;

const ROTATING_KEYS = [
  'login.rotate1',
  'login.rotate2',
  'login.rotate3',
  'login.rotate4',
  'login.rotate5',
  'login.rotate6',
] as const;

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const { t, isRtl } = useLocale();
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const [showPw, setShowPw] = useState(false);
  const [mounted, setMounted] = useState(false);

  const schema = useMemo(
    () =>
      z.object({
        username: z.string().min(1, t('login.usernameRequired')),
        password: z.string().min(1, t('login.passwordRequired')),
      }),
    [t],
  );

  useEffect(() => {
    const timer = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(timer);
  }, []);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: FormValues) => {
    try {
      await login(values.username, values.password);
      toast.success(t('login.success'));
      try {
        const { data } = await api.get<WorkspaceConfig>('/me/workspace');
        navigate(safeInternalPath(data.homeRoute));
      } catch {
        navigate('/profile');
      }
    } catch (e) {
      toast.error(apiError(e, t('login.error')));
    }
  };

  const copyright = t('login.copyright', { year: new Date().getFullYear() });
  const SubmitArrow = isRtl ? ArrowLeft : ArrowRight;
  const rotatingTexts = useMemo(
    () => ROTATING_KEYS.map((key) => t(key)),
    [t],
  );

  return (
    <div className="relative flex min-h-screen flex-col lg:flex-row">
      {/* ── Brand hero ── */}
      <section
        className={cn(
          'login-hero relative flex shrink-0 flex-col overflow-hidden text-white',
          'lg:min-h-screen lg:w-[min(48%,560px)] lg:max-w-[560px]',
          'min-h-[220px] lg:min-h-0',
        )}
      >

        <div
          className={cn(
            'relative z-10 flex flex-1 flex-col justify-between p-6 sm:p-8 lg:p-10 xl:p-12',
            'transition-all duration-700 ease-out',
            mounted ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0',
          )}
        >
          {/* Logo lockup */}
          <div className="flex items-center">
            <div className="login-logo-glow relative">
              <BrandLogo size="lg" className="login-logo-float relative z-10" />
            </div>
          </div>

          {/* Hero copy — desktop only */}
          <div className="hidden max-w-xl space-y-6 lg:block">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3.5 py-1.5 text-xs font-medium text-white/90 backdrop-blur-sm">
              <Sparkles className="size-3.5 text-amber-200" />
              {t('login.badge')}
            </div>
            <h1 className="text-[1.85rem] font-bold leading-snug tracking-tight xl:text-[2.25rem]">
              {t('login.titlePrefix')}{' '}
              <RotatingText
                texts={rotatingTexts}
                mainClassName="login-rotate-word align-baseline"
                staggerFrom="last"
                initial={{ y: '100%', opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: '-120%', opacity: 0 }}
                staggerDuration={isRtl ? 0 : 0.025}
                splitLevelClassName="overflow-hidden"
                elementLevelClassName="login-rotate-char"
                animatePresenceInitial
                transition={{ type: 'spring', damping: 30, stiffness: 400 }}
                rotationInterval={2200}
                splitBy={isRtl ? 'words' : 'characters'}
                auto
                loop
              />
            </h1>
            <p className="text-base leading-relaxed text-white/75">{t('login.subtitle')}</p>

            <div className="grid gap-3 pt-1">
              {FEATURES.map(({ icon: Icon, key }) => (
                <div
                  key={key}
                  className="login-feature-card flex items-center gap-3.5 rounded-2xl border border-white/15 bg-white/10 px-4 py-3.5 backdrop-blur-md"
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/15 text-white">
                    <Icon className="size-[18px]" strokeWidth={2} />
                  </span>
                  <span className="text-sm font-medium leading-snug text-white/90">{t(key)}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="text-sm font-medium text-white/80 lg:hidden">{t('login.badge')}</p>
            <div className="mt-5 pt-5 lg:mt-0 lg:pt-0">
              <PoweredByBadge size="lg" />
            </div>
          </div>
        </div>
      </section>

      {/* ── Form panel ── */}
      <section
        className={cn(
          'login-form-panel relative flex flex-1 flex-col',
          isDark ? 'bg-[#0c0a0b]' : 'bg-background',
        )}
      >
        <div className="absolute end-4 top-4 z-20 sm:end-6 sm:top-6">
          <PreferenceToggles variant={isDark ? 'on-dark' : 'default'} />
        </div>

        {/* Subtle ambient glow behind form */}
        <div
          className={cn(
            'pointer-events-none absolute inset-0',
            isDark
              ? 'bg-[radial-gradient(ellipse_70%_50%_at_50%_0%,rgba(79,163,221,0.08),transparent_60%)]'
              : 'bg-[radial-gradient(ellipse_70%_50%_at_50%_0%,rgba(45,137,200,0.06),transparent_60%)]',
          )}
        />

        <div className="relative z-10 flex flex-1 items-center justify-center px-6 py-12 sm:px-10 lg:px-14 xl:px-20">
          <div
            className={cn(
              'w-full max-w-[520px] transition-all duration-700 delay-100 ease-out',
              mounted ? 'translate-y-0 opacity-100' : 'translate-y-5 opacity-0',
            )}
          >
            {/* Mobile logo duplicate (compact) */}
            <div className="mb-10 flex justify-center lg:hidden">
              <BrandLogo size="lg" />
            </div>

            <div
              className={cn(
                'rounded-3xl border p-8 shadow-xl sm:p-10 lg:p-12',
                isDark
                  ? 'border-white/10 bg-[#141112]/80 backdrop-blur-sm'
                  : 'border-primary/10 bg-card shadow-primary/5',
              )}
            >
              <div className="mb-10 space-y-2.5 text-center lg:text-start">
                <h2
                  className={cn(
                    'text-3xl font-bold tracking-tight xl:text-[2rem]',
                    isDark ? 'text-white' : 'text-foreground',
                  )}
                >
                  {t('login.formTitle')}
                </h2>
                <p
                  className={cn(
                    'text-base leading-relaxed',
                    isDark ? 'text-white/55' : 'text-muted-foreground',
                  )}
                >
                  {t('login.formSubtitle')}
                </p>
              </div>

              <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" noValidate>
                <div className="space-y-2.5">
                  <Label htmlFor="username" className={cn('text-sm font-semibold', isDark && 'text-white/85')}>
                    {t('login.username')}
                  </Label>
                  <div className="group relative">
                    <User
                      className={cn(
                        'pointer-events-none absolute start-4 top-1/2 size-5 -translate-y-1/2 transition-colors group-focus-within:text-primary',
                        isDark ? 'text-white/35' : 'text-muted-foreground',
                      )}
                    />
                    <input
                      id="username"
                      autoComplete="username"
                      placeholder={t('login.username')}
                      className={cn('login-field login-field-lg', errors.username && 'login-field-error')}
                      {...register('username')}
                    />
                  </div>
                  {errors.username && (
                    <p className="text-xs font-medium text-destructive" role="alert">
                      {errors.username.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2.5">
                  <Label htmlFor="password" className={cn('text-sm font-semibold', isDark && 'text-white/85')}>
                    {t('login.password')}
                  </Label>
                  <div className="group relative">
                    <Lock
                      className={cn(
                        'pointer-events-none absolute start-4 top-1/2 size-5 -translate-y-1/2 transition-colors group-focus-within:text-primary',
                        isDark ? 'text-white/35' : 'text-muted-foreground',
                      )}
                    />
                    <input
                      id="password"
                      type={showPw ? 'text' : 'password'}
                      autoComplete="current-password"
                      placeholder="••••••••"
                      className={cn(
                        'login-field login-field-lg ps-12 pe-12',
                        errors.password && 'login-field-error',
                      )}
                      {...register('password')}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw((s) => !s)}
                      className={cn(
                        'absolute end-1 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-lg transition-colors',
                        isDark ? 'text-white/35 hover:text-white/80' : 'text-muted-foreground hover:text-foreground',
                      )}
                      aria-label={showPw ? t('login.hidePassword') : t('login.showPassword')}
                    >
                      {showPw ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
                    </button>
                  </div>
                  {errors.password && (
                    <p className="text-xs font-medium text-destructive" role="alert">
                      {errors.password.message}
                    </p>
                  )}
                </div>

                <Button
                  type="submit"
                  variant="brand"
                  size="lg"
                  className="login-submit group/btn mt-3 h-14 w-full text-lg font-semibold shadow-lg"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <Loader2 className="size-5 animate-spin" />
                  ) : (
                    <>
                      {t('login.submit')}
                      <SubmitArrow className="size-5 transition-transform group-hover/btn:translate-x-0.5 rtl:group-hover/btn:-translate-x-0.5" />
                    </>
                  )}
                </Button>
              </form>
            </div>

            <p
              className={cn(
                'mt-8 text-center text-xs',
                isDark ? 'text-white/30' : 'text-muted-foreground/70',
              )}
            >
              {copyright}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
