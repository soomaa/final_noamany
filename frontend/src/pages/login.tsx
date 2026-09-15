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
import { LOGO_SRC } from '@/components/brand/logo';
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
    <div className="noamany-login-page min-h-screen bg-[#080d11] p-2 sm:p-3">
      <main className="noamany-login-shell relative flex min-h-[calc(100vh-1rem)] flex-col overflow-hidden rounded-[22px] border border-white/20 lg:min-h-[calc(100vh-1.5rem)] lg:flex-row">
        <div className="noamany-login-split-aura pointer-events-none absolute inset-y-0 z-20 hidden w-14 lg:block" />
        <div className="noamany-login-split-edge pointer-events-none absolute inset-y-0 z-30 hidden w-3 lg:block" />
        <section className="noamany-login-showcase relative flex min-h-[430px] shrink-0 overflow-hidden text-white lg:min-h-0 lg:w-[45%]">
          <div className="noamany-login-showcase-pattern pointer-events-none absolute inset-0" />
          <div className="noamany-login-showcase-glow pointer-events-none absolute inset-0" />
          <Dumbbell className="pointer-events-none absolute -start-12 top-[26%] size-56 rotate-[-18deg] text-white opacity-[0.1]" strokeWidth={1.2} />
          <Dumbbell className="pointer-events-none absolute -end-16 bottom-[5%] size-64 rotate-[20deg] text-[#ffb0a5] opacity-[0.13]" strokeWidth={1.1} />
          <div
            className={cn(
              'relative z-10 flex w-full flex-col px-7 py-6 transition-all duration-700 sm:px-10 lg:px-12 lg:py-6 xl:px-16',
              mounted ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0',
            )}
          >
            <div className="noamany-login-brand flex w-fit flex-col items-center gap-3">
              <div className="flex items-center gap-3">
                <div className="overflow-hidden rounded-2xl bg-white p-2 shadow-[0_12px_30px_rgba(52,0,0,.28)] ring-1 ring-white/70">
                  <img src={LOGO_SRC} alt="Noamany Fitness Center" className="h-14 w-20 object-contain sm:h-[4.4rem] sm:w-[6.5rem]" />
                </div>
                <div className="hidden leading-tight sm:block">
                  <p className="text-lg font-black tracking-wide">NOAMANY</p>
                  <p className="text-[9px] font-semibold tracking-[0.24em] text-white/65">FITNESS CENTER</p>
                </div>
              </div>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-[#581016]/45 px-3.5 py-2 text-xs font-semibold text-white/85 shadow-lg backdrop-blur-sm">
                <Sparkles className="size-3.5 text-[#ffd2c4]" />
                {t('login.badge')}
              </div>
            </div>

            <div className="my-auto py-7 lg:py-4">
              <h1 className="max-w-2xl text-3xl font-black leading-[1.35] tracking-tight sm:text-4xl xl:text-[2.55rem]">
                {t('login.titlePrefix')}{' '}
                <RotatingText
                  texts={rotatingTexts}
                  mainClassName="noamany-login-rotate align-middle"
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
              <p className="mt-5 max-w-xl text-sm leading-7 text-white/65 sm:text-[15px]">{t('login.subtitle')}</p>

              <div className="mt-7 grid gap-2.5">
                {FEATURES.map(({ icon: Icon, key }) => (
                  <div key={key} className="noamany-login-feature flex min-h-14 items-center gap-4 rounded-2xl border px-4 py-2.5 backdrop-blur-sm">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-[#f0a17b]/40 bg-[#5c1a18]/75 text-[#ffe8df] shadow-inner">
                      <Icon className="size-5" strokeWidth={1.8} />
                    </span>
                    <span className="text-sm font-semibold text-white/88">{t(key)}</span>
                  </div>
                ))}
              </div>
            </div>

            <p className="text-center text-[11px] text-white/35">{copyright}</p>
          </div>
        </section>

        <section className="noamany-login-auth relative flex min-h-[620px] flex-1 items-center justify-center overflow-hidden px-6 py-20 sm:px-10 lg:min-h-0 lg:px-14 xl:px-20">
          <div className="noamany-login-auth-pattern pointer-events-none absolute inset-0" />
          <div className="absolute left-5 top-5 z-20 sm:left-7 sm:top-7">
            <PreferenceToggles variant={theme === 'dark' ? 'on-dark' : 'default'} />
          </div>

          <div
            className={cn(
              'relative z-10 w-full max-w-[500px] transition-all delay-100 duration-700',
              mounted ? 'translate-y-0 opacity-100' : 'translate-y-5 opacity-0',
            )}
          >
            <div className="noamany-login-card rounded-[24px] border border-[#a36a4c] bg-[#11161b]/92 px-7 py-10 shadow-[0_32px_70px_rgba(0,0,0,.42)] backdrop-blur-sm sm:px-10 sm:py-11 lg:px-11">
              <div className="mb-9 text-center lg:text-start">
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
            <p className="mt-8 text-center text-[11px] text-white/25 lg:hidden">{copyright}</p>
          </div>
        </section>
      </main>
    </div>
  );
}
