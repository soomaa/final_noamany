import { zodResolver } from '@hookform/resolvers/zod';
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Dumbbell,
  Eye,
  EyeOff,
  Globe2,
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
import { GymoraSideBadge } from '@/components/brand/gymora-side-badge';
import { PreferenceToggles } from '@/components/layout/preference-toggles';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import RotatingText from '@/components/ui/rotating-text';
import type { WorkspaceConfig } from '@/hooks/use-permission';
import { api, apiError } from '@/lib/api';
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
  const [showPassword, setShowPassword] = useState(false);
  const [mounted, setMounted] = useState(false);

  const schema = useMemo(
    () => z.object({
      username: z.string().min(1, t('login.usernameRequired')),
      password: z.string().min(1, t('login.passwordRequired')),
    }),
    [t],
  );

  useEffect(() => {
    const frame = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(frame);
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
        navigate(data.homeRoute);
      } catch {
        navigate('/profile');
      }
    } catch (error) {
      toast.error(apiError(error, t('login.error')));
    }
  };

  const SubmitArrow = isRtl ? ArrowLeft : ArrowRight;
  const rotatingTexts = useMemo(() => ROTATING_KEYS.map((key) => t(key)), [t]);
  const copyright = t('login.copyright', { year: new Date().getFullYear() });

  return (
    <div className="noamany-login-page flex h-dvh min-h-0 flex-col overflow-y-auto overscroll-y-contain bg-[#080d11]">
      <main className="noamany-login-shell relative flex min-h-0 flex-1 flex-col">
        {/* Same composition as SWAT: a slim dark brand panel beside a centered sign-in card. */}
        <div className="noamany-login-panels relative flex flex-1 flex-col lg:flex-row">
          <section className="noamany-login-hero relative flex shrink-0 flex-col overflow-hidden text-white lg:w-[min(42%,520px)]">
            <div
              className={cn(
                'relative z-10 flex flex-1 flex-col justify-between gap-6 p-6 sm:p-8 lg:px-10 lg:py-7 xl:px-12',
                'transition-all duration-700 ease-out',
                mounted ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0',
              )}
            >
              <div className="flex items-center gap-3">
                <div className="noamany-login-logo overflow-hidden rounded-2xl bg-white p-2 ring-1 ring-white/70">
                  <img src="/noamany-logo-clean.png" alt="Noamany Fitness Center" className="h-14 w-20 object-contain sm:h-16 sm:w-24" />
                </div>
                <div className="leading-tight">
                  <p className="text-lg font-black tracking-wide">NOAMANY</p>
                  <p className="text-[10px] font-semibold tracking-[0.24em] text-white/65">FITNESS CENTER</p>
                </div>
              </div>

              {/* Hero copy — desktop only, like SWAT. */}
              <div className="hidden max-w-xl space-y-4 lg:block">
                <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3.5 py-1.5 text-xs font-semibold text-white/90 backdrop-blur-sm">
                  <Sparkles className="size-3.5 text-[#ffd2c4]" />
                  {t('login.badge')}
                </div>
                <h1 className="text-[1.85rem] font-black leading-snug tracking-tight xl:text-[2.25rem]">
                  {t('login.titlePrefix')}{' '}
                  <RotatingText
                    texts={rotatingTexts}
                    mainClassName="noamany-login-rotate align-baseline"
                    staggerFrom="last"
                    initial={{ y: '100%', opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: '-120%', opacity: 0 }}
                    staggerDuration={isRtl ? 0 : 0.025}
                    splitLevelClassName="overflow-hidden"
                    elementLevelClassName="font-black text-white"
                    transition={{ type: 'spring', damping: 30, stiffness: 400 }}
                    rotationInterval={2300}
                    splitBy={isRtl ? 'words' : 'characters'}
                    auto
                    loop
                  />
                </h1>
                <p className="text-base leading-relaxed text-white/75">{t('login.subtitle')}</p>
                <div className="grid gap-2.5 pt-1">
                  {FEATURES.map(({ icon: Icon, key }) => (
                    <div key={key} className="noamany-login-feature flex items-center gap-3.5 rounded-2xl border px-4 py-2.5 backdrop-blur-md">
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/15 text-white">
                        <Icon className="size-[18px]" strokeWidth={2} />
                      </span>
                      <span className="text-sm font-semibold leading-snug text-white/90">{t(key)}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-sm font-semibold text-white/80 lg:hidden">{t('login.badge')}</p>
                {/* Gymora vendor block at the foot of the side panel, as in SWAT. */}
                <GymoraSideBadge className="mt-5 lg:mt-0" />
              </div>
            </div>
          </section>

          <section className="noamany-login-auth relative flex flex-1 items-center justify-center overflow-hidden px-6 pb-12 pt-20 sm:px-10 lg:px-14 xl:px-20">
            <div className="noamany-login-auth-pattern pointer-events-none absolute inset-0" />
            <div className="absolute end-4 top-4 z-20 sm:end-6 sm:top-6">
              <PreferenceToggles variant={theme === 'dark' ? 'on-dark' : 'default'} />
            </div>

            <div
              className={cn(
                'relative z-10 w-full max-w-[480px] transition-all delay-100 duration-700',
                mounted ? 'translate-y-0 opacity-100' : 'translate-y-5 opacity-0',
              )}
            >
              <div className="noamany-login-card rounded-[24px] border border-[#a36a4c] bg-[#11161b]/92 px-7 py-10 shadow-[0_32px_70px_rgba(0,0,0,.42)] backdrop-blur-sm sm:px-10 sm:py-11 lg:px-11">
                <div className="mb-9 text-center">
                  <h2 className="noamany-login-heading text-3xl font-black tracking-tight text-white sm:text-[2.15rem]">{t('login.formTitle')}</h2>
                  <p className="noamany-login-subtitle mt-3 text-sm leading-7 text-white/45">{t('login.formSubtitle')}</p>
                </div>

                <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" noValidate>
                  <div className="space-y-2.5">
                    <Label htmlFor="username" className="noamany-login-label text-sm font-bold text-white/55">{t('login.username')}</Label>
                    <div className="group relative">
                      <User className="noamany-login-input-icon pointer-events-none absolute end-4 top-1/2 size-5 -translate-y-1/2 text-white/28 transition-colors group-focus-within:text-[#e55c60]" />
                      <input
                        id="username"
                        autoComplete="username"
                        placeholder={t('login.username')}
                        className={cn('noamany-login-field pe-12', errors.username && 'noamany-login-field-error')}
                        {...register('username')}
                      />
                    </div>
                    {errors.username && <p className="text-xs font-semibold text-[#ff777b]" role="alert">{errors.username.message}</p>}
                  </div>

                  <div className="space-y-2.5">
                    <Label htmlFor="password" className="noamany-login-label text-sm font-bold text-white/55">{t('login.password')}</Label>
                    <div className="group relative">
                      <Lock className="noamany-login-input-icon pointer-events-none absolute end-4 top-1/2 size-5 -translate-y-1/2 text-white/28 transition-colors group-focus-within:text-[#e55c60]" />
                      <input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="current-password"
                        placeholder="••••••••"
                        className={cn('noamany-login-field px-12', errors.password && 'noamany-login-field-error')}
                        {...register('password')}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((value) => !value)}
                        className="noamany-login-eye absolute start-4 top-1/2 -translate-y-1/2 rounded-md p-1 text-white/30 transition-colors hover:text-white/80"
                        aria-label={showPassword ? t('login.hidePassword') : t('login.showPassword')}
                      >
                        {showPassword ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
                      </button>
                    </div>
                    {errors.password && <p className="text-xs font-semibold text-[#ff777b]" role="alert">{errors.password.message}</p>}
                  </div>

                  <Button
                    type="submit"
                    variant="brand"
                    size="lg"
                    className="noamany-login-submit group mt-3 h-14 w-full rounded-xl border text-base font-black text-white"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? <Loader2 className="size-5 animate-spin" /> : <>
                      {t('login.submit')}
                      <SubmitArrow className="size-5 transition-transform group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5" />
                    </>}
                  </Button>
                </form>
              </div>
              <div className="noamany-login-edition" role="note" aria-label={t('login.editionFull')} dir={isRtl ? 'rtl' : 'ltr'}>
                <span className="noamany-login-edition-icon" aria-hidden="true"><Globe2 className="size-4" strokeWidth={1.7} /></span>
                <span className="noamany-login-edition-copy">
                  <span className="noamany-login-edition-kicker">{t('login.editionKicker')}</span>
                  <strong className="noamany-login-edition-title">{t('login.editionTitle')}</strong>
                </span>
                <span className="noamany-login-edition-version" dir="ltr">1.1</span>
              </div>
              <p className="mt-3 text-center text-[11px] text-white/25">{copyright}</p>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
