import type { ReactNode } from 'react';
import { Activity, Clock, Sparkles, TrendingUp, UserCheck, Users, UserX } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { BannerClockWidget } from '@/components/common/banner-clock-widget';
import { formatNum } from '@/lib/formatters';
import { formatDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';
import { uiStatic } from '@/lib/ui-static';

export interface WelcomeBannerStat {
  label: string;
  value: number | string;
  suffix?: string;
  icon?: ReactNode;
}

export interface BannerTodaySnapshot {
  attendancePct: number;
  onTimeToday: number;
  absentToday: number;
  avgLateMinutes?: number;
}

interface WelcomeBannerProps {
  name?: string | null;
  instituteName?: string | null;
  stats?: WelcomeBannerStat[];
  snapshot?: BannerTodaySnapshot;
  actions?: ReactNode;
  loading?: boolean;
}

const DEFAULT_STAT_ICONS = [Users, UserCheck, TrendingUp, Clock];

function BannerTodayPanel({ snapshot, loading }: { snapshot?: BannerTodaySnapshot; loading?: boolean }) {
  const { ui, locale } = useLocale();

  if (loading) {
    return (
      <div className="banner-glass rounded-2xl p-4">
        <Skeleton className="h-3 w-28 bg-white/20" />
        <Skeleton className="mt-3 h-2 w-full rounded-full bg-white/15" />
        <div className="mt-4 grid grid-cols-3 gap-3">
          <Skeleton className="h-12 rounded-xl bg-white/15" />
          <Skeleton className="h-12 rounded-xl bg-white/15" />
          <Skeleton className="h-12 rounded-xl bg-white/15" />
        </div>
      </div>
    );
  }

  if (!snapshot) return null;

  const pct = Math.min(100, Math.max(0, snapshot.attendancePct));

  return (
    <div className="banner-glass rounded-2xl p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <UserCheck className="size-4 shrink-0 text-emerald-200" />
          <span className="text-sm font-medium text-white/80">{uiStatic('معدل حضور اليوم')}</span>
        </div>
        <span className="nums text-lg font-bold text-white">{formatDigits(`${Math.round(pct)}%`, locale)}</span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/15">
        <div
          className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-emerald-300 to-teal-300 transition-all duration-700"
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 sm:gap-3">
        <div className="rounded-xl bg-white/10 px-2.5 py-2.5 text-center sm:px-3">
          <UserCheck className="mx-auto size-4 text-emerald-200" />
          <p className="nums mt-1 text-lg font-bold text-white">{formatNum(snapshot.onTimeToday, locale)}</p>
          <p className="text-[11px] font-medium text-white/65">{uiStatic('في الوقت')}</p>
        </div>
        <div className="rounded-xl bg-white/10 px-2.5 py-2.5 text-center sm:px-3">
          <UserX className="mx-auto size-4 text-rose-200" />
          <p className="nums mt-1 text-lg font-bold text-white">{formatNum(snapshot.absentToday, locale)}</p>
          <p className="text-[11px] font-medium text-white/65">{uiStatic('غائب')}</p>
        </div>
        <div className="rounded-xl bg-white/10 px-2.5 py-2.5 text-center sm:px-3">
          <Clock className="mx-auto size-4 text-amber-200" />
          <p className="nums mt-1 text-lg font-bold text-white">
            {snapshot.avgLateMinutes
              ? formatDigits(`${Math.round(snapshot.avgLateMinutes)}`, locale)
              : '—'}
          </p>
          <p className="text-[11px] font-medium text-white/65">{uiStatic('د تأخير')}</p>
        </div>
      </div>
    </div>
  );
}

export function WelcomeBanner({
  name,
  instituteName,
  stats,
  snapshot,
  actions,
  loading,
}: WelcomeBannerProps) {
  const { ui, locale } = useLocale();
  const now = new Date();
  const hour = now.getHours();
  const greeting =
    hour < 12 ? ui('صباح الخير') : hour < 17 ? ui('مساء الخير') : ui('مساء النور');

  return (
    <div className="relative overflow-hidden rounded-3xl bg-brand-gradient shadow-xl ring-1 ring-white/10">
      {/* Animated background layers */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
          backgroundSize: '28px 28px',
        }}
      />
      <div className="pointer-events-none absolute -end-16 -top-16 size-72 animate-banner-drift rounded-full bg-white/12 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 start-1/4 size-64 animate-banner-drift-reverse rounded-full bg-brand-300/30 blur-3xl" />
      <div className="pointer-events-none absolute start-1/2 top-1/2 size-48 -translate-x-1/2 -translate-y-1/2 animate-banner-drift rounded-full bg-brand-400/15 blur-3xl [animation-delay:3s]" />

      {/* Shimmer sweep */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-y-0 w-1/3 animate-banner-shine bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      </div>

      <div className="relative px-6 py-8 md:px-10 md:py-10 lg:py-12">
        <div className="flex flex-col gap-8 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0 flex-1 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <div className="banner-glass inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium text-white/90">
                <Sparkles className="size-3.5 shrink-0 animate-pulse" />
                <span>{instituteName ?? 'Noamany Fitness Center'}</span>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-400/15 px-2.5 py-1 text-xs font-medium text-emerald-100">
                <Activity className="size-3 shrink-0" />
                {ui('مباشر')}
              </span>
            </div>

            <div>
              <p className="text-lg font-medium text-white/80 md:text-xl">
                {greeting}
                {locale === 'ar' ? ui('،') : ','}
              </p>
              <h1 className="mt-1 text-4xl font-bold leading-tight tracking-tight text-white md:text-5xl lg:text-[3.25rem]">
                {name ?? ui('مرحباً')}
              </h1>
              <p className="mt-3 max-w-2xl text-base leading-relaxed text-white/75 md:text-lg">
                {ui('لوحة متابعة الحضور والموارد البشرية — اطلع على أهم مؤشرات اليوم في لمحة واحدة')}
              </p>
            </div>

            <BannerTodayPanel snapshot={snapshot} loading={loading} />
          </div>

          <div className="flex flex-col gap-4 xl:items-end">
            <BannerClockWidget />

            {stats && stats.length > 0 && (
              <div className="grid w-full grid-cols-2 gap-3 sm:gap-3 xl:w-[min(100%,24rem)]">
                {stats.map((stat, i) => {
                  const Icon = DEFAULT_STAT_ICONS[i % DEFAULT_STAT_ICONS.length];
                  return (
                    <div
                      key={stat.label}
                      className="banner-glass rounded-2xl p-3.5 transition-all duration-300 hover:scale-[1.02]"
                      style={{ animationDelay: `${i * 80}ms` }}
                    >
                      {loading ? (
                        <>
                          <Skeleton className="h-3 w-16 bg-white/20" />
                          <Skeleton className="mt-2 h-7 w-12 bg-white/25" />
                        </>
                      ) : (
                        <>
                          <div className="flex items-center gap-1.5">
                            <Icon className="size-3.5 shrink-0 text-white/70" />
                            <p className="text-xs font-medium text-white/80">{stat.label}</p>
                          </div>
                          <p className="mt-1 text-xl font-bold tabular-nums text-white md:text-2xl nums">
                            {typeof stat.value === 'number' ? formatNum(stat.value, locale) : stat.value}
                            {stat.suffix && (
                              <span className="ms-1 text-sm font-semibold text-white/75">{stat.suffix}</span>
                            )}
                          </p>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {actions && (
          <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-white/15 pt-6">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}
