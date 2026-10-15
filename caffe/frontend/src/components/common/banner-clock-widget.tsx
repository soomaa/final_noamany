import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { ar, enUS } from 'date-fns/locale';
import { CalendarDays, Moon, Sun, Sunrise, Sunset } from 'lucide-react';
import { formatDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';

function TimeOfDayIcon({ hour }: { hour: number }) {
  if (hour >= 5 && hour < 8) return <Sunrise className="size-5 text-amber-200" />;
  if (hour >= 8 && hour < 17) return <Sun className="size-5 text-yellow-200" />;
  if (hour >= 17 && hour < 20) return <Sunset className="size-5 text-orange-200" />;
  return <Moon className="size-5 text-indigo-200" />;
}

export function BannerClockWidget() {
  const { ui } = useLocale();
  const { locale, t } = useLocale();
  const dateFnsLocale = locale === 'en' ? enUS : ar;
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const hour = now.getHours();
  const minute = now.getMinutes();
  const second = now.getSeconds();
  const h12 = hour % 12 || 12;
  const period = hour >= 12 ? t('common.evening') : t('common.morning');

  const hStr = formatDigits(h12.toString().padStart(2, '0'), locale);
  const mStr = formatDigits(minute.toString().padStart(2, '0'), locale);
  const sStr = formatDigits(second.toString().padStart(2, '0'), locale);
  const timeMain = `${hStr}:${mStr}:`;
  const timeSec = sStr;

  const datePattern = locale === 'en' ? 'EEEE, d MMMM' : ui('EEEE، d MMMM');
  const dateLabel = formatDigits(format(now, datePattern, { locale: dateFnsLocale }), locale);
  const yearLabel = formatDigits(format(now, 'yyyy', { locale: dateFnsLocale }), locale);

  const secondAngle = (second / 60) * 360;
  const minuteAngle = ((minute + second / 60) / 60) * 360;
  const hourAngle = (((hour % 12) + minute / 60) / 12) * 360;

  return (
    <div className="relative shrink-0">
      <div className="banner-glass relative overflow-hidden rounded-[1.65rem] p-5">
        <div
          className="pointer-events-none absolute inset-0 opacity-30"
          style={{
            background: 'conic-gradient(from 180deg, transparent, rgba(255,255,255,0.08), transparent)',
          }}
        />

        <div className="relative flex items-center gap-5">
          {/* Analog mini clock */}
          <div className="relative hidden size-[5.5rem] shrink-0 sm:block">
            <svg viewBox="0 0 100 100" className="size-full">
              <circle cx="50" cy="50" r="46" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" />
              {Array.from({ length: 12 }).map((_, i) => {
                const angle = (i / 12) * 360 - 90;
                const rad = (angle * Math.PI) / 180;
                const x1 = 50 + Math.cos(rad) * 38;
                const y1 = 50 + Math.sin(rad) * 38;
                const x2 = 50 + Math.cos(rad) * (i % 3 === 0 ? 32 : 35);
                const y2 = 50 + Math.sin(rad) * (i % 3 === 0 ? 32 : 35);
                return (
                  <line
                    key={i}
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke="rgba(255,255,255,0.45)"
                    strokeWidth={i % 3 === 0 ? 2 : 1}
                    strokeLinecap="round"
                  />
                );
              })}
              <line
                x1="50" y1="50" x2="50" y2="28"
                stroke="rgba(255,255,255,0.85)"
                strokeWidth="2.5"
                strokeLinecap="round"
                transform={`rotate(${hourAngle}, 50, 50)`}
              />
              <line
                x1="50" y1="50" x2="50" y2="22"
                stroke="rgba(255,255,255,0.7)"
                strokeWidth="2"
                strokeLinecap="round"
                transform={`rotate(${minuteAngle}, 50, 50)`}
              />
              <line
                x1="50" y1="50" x2="50" y2="18"
                stroke="#FBBF24"
                strokeWidth="1.5"
                strokeLinecap="round"
                transform={`rotate(${secondAngle}, 50, 50)`}
              />
              <circle cx="50" cy="50" r="3" fill="white" />
            </svg>
          </div>

          {/* Digital time */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <TimeOfDayIcon hour={hour} />
              <span className="text-xs font-semibold uppercase tracking-wider text-white/60">{period}</span>
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400/60" />
                <span className="relative inline-flex size-2 rounded-full bg-emerald-400" />
              </span>
            </div>

            <div className="mt-2 flex items-baseline gap-0.5">
              <span className="nums text-[2.75rem] font-bold leading-none tabular-nums tracking-tight text-white md:text-5xl">
                {timeMain}
              </span>
              <span className="nums mb-1 text-2xl font-semibold tabular-nums text-amber-200/90 md:text-3xl">
                {timeSec}
              </span>
            </div>

            <div className="mt-3 flex flex-col gap-1 border-t border-white/15 pt-3">
              <span className="inline-flex items-center gap-2 text-sm font-medium text-white/85">
                <CalendarDays className="size-3.5 shrink-0 text-white/60" />
                {dateLabel}
              </span>
              <span className="nums text-xs text-white/55">{yearLabel}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
