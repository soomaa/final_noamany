import { Clock3 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { cn, formatDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';

interface Time12InputProps {
  value?: string | null;
  onValueChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  id?: string;
  'aria-label'?: string;
}

const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

function toLatinDigits(value: string) {
  return value.replace(/[٠-٩]/g, (digit) => String(ARABIC_DIGITS.indexOf(digit)));
}

function parseValue(value?: string | null) {
  const match = /^(\d{1,2}):(\d{2})/.exec(value?.trim() ?? '');
  if (!match) return null;
  const hour24 = Number(match[1]);
  if (!Number.isFinite(hour24) || hour24 < 0 || hour24 > 23) return null;
  return {
    hour: String(hour24 % 12 || 12).padStart(2, '0'),
    minute: match[2],
    period: hour24 >= 12 ? 'pm' : 'am',
  } as const;
}

function normalizeHour(value: string) {
  const parsed = Number(toLatinDigits(value));
  return String(Math.min(12, Math.max(1, Number.isFinite(parsed) && parsed > 0 ? parsed : 12))).padStart(2, '0');
}

function normalizeMinute(value: string) {
  const parsed = Number(toLatinDigits(value));
  return String(Math.min(59, Math.max(0, Number.isFinite(parsed) ? parsed : 0))).padStart(2, '0');
}

/** Compact 12-hour editor with direct typing and a one-tap AM/PM switch. */
export function Time12Input({ value, onValueChange, disabled, className, id, 'aria-label': ariaLabel }: Time12InputProps) {
  const { locale, ui } = useLocale();
  const parsed = parseValue(value);
  const period = parsed?.period ?? 'am';
  const [hourDraft, setHourDraft] = useState(parsed?.hour ?? '12');
  const [minuteDraft, setMinuteDraft] = useState(parsed?.minute ?? '00');

  useEffect(() => {
    const next = parseValue(value);
    if (!next) return;
    setHourDraft(next.hour);
    setMinuteDraft(next.minute);
  }, [value]);

  const emit = (hourValue: string, minuteValue: string, nextPeriod: 'am' | 'pm') => {
    const normalizedHour = normalizeHour(hourValue);
    const normalizedMinute = normalizeMinute(minuteValue);
    setHourDraft(normalizedHour);
    setMinuteDraft(normalizedMinute);
    let hour24 = Number(normalizedHour) % 12;
    if (nextPeriod === 'pm') hour24 += 12;
    onValueChange(`${String(hour24).padStart(2, '0')}:${normalizedMinute}`);
  };

  const updateDraft = (raw: string, setter: (value: string) => void) => {
    setter(toLatinDigits(raw).replace(/\D/g, '').slice(0, 2));
  };

  return (
    <div
      id={id}
      role="group"
      aria-label={ariaLabel ?? ui('الوقت بصيغة 12 ساعة')}
      className={cn(
        'flex h-12 min-w-0 items-center gap-2 rounded-xl border border-input bg-background p-1.5 shadow-sm transition focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15',
        className,
      )}
      dir="ltr"
    >
      <Clock3 className="ms-1 size-4 shrink-0 text-primary" aria-hidden />

      <div className="flex min-w-0 flex-1 items-center justify-center gap-1">
        <input
          inputMode="numeric"
          autoComplete="off"
          aria-label={ui('الساعة')}
          value={formatDigits(hourDraft, locale)}
          disabled={disabled}
          onFocus={(event) => event.currentTarget.select()}
          onChange={(event) => updateDraft(event.target.value, setHourDraft)}
          onBlur={() => emit(hourDraft, minuteDraft, period)}
          onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }}
          className="h-9 w-11 rounded-lg bg-muted/60 text-center text-base font-black outline-none transition focus:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50"
        />
        <span className="pb-0.5 text-lg font-black text-muted-foreground" aria-hidden>:</span>
        <input
          inputMode="numeric"
          autoComplete="off"
          aria-label={ui('الدقيقة')}
          value={formatDigits(minuteDraft, locale)}
          disabled={disabled}
          onFocus={(event) => event.currentTarget.select()}
          onChange={(event) => updateDraft(event.target.value, setMinuteDraft)}
          onBlur={() => emit(hourDraft, minuteDraft, period)}
          onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }}
          className="h-9 w-11 rounded-lg bg-muted/60 text-center text-base font-black outline-none transition focus:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>

      <div className="grid shrink-0 grid-cols-2 rounded-lg bg-muted p-1" aria-label={ui('الفترة')}>
        {(['am', 'pm'] as const).map((item) => {
          const active = period === item;
          return (
            <button
              key={item}
              type="button"
              disabled={disabled}
              aria-pressed={active}
              onClick={() => emit(hourDraft, minuteDraft, item)}
              className={cn(
                'h-8 min-w-9 rounded-md px-2 text-xs font-black transition disabled:cursor-not-allowed disabled:opacity-50',
                active ? 'bg-background text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {locale === 'ar' ? (item === 'am' ? 'ص' : 'م') : item.toUpperCase()}
            </button>
          );
        })}
      </div>
    </div>
  );
}
