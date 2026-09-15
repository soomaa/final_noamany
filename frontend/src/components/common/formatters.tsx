import { formatDate, formatDateTime, formatMoney, formatNum, formatTime, formatTimeFromDate } from '@/lib/formatters';
import { cn } from '@/lib/utils';
import { useLocale } from '@/store/locale';

export function Money({ value, currency, className }: { value: number | string | null | undefined; currency?: string; className?: string }) {
  const { locale } = useLocale();
  return <span className={cn('nums tabular-nums', className)}>{formatMoney(value, currency, locale)}</span>;
}

export function Num({ value, className }: { value: number | string | null | undefined; className?: string }) {
  const { locale } = useLocale();
  return <span className={cn('nums tabular-nums', className)}>{formatNum(value, locale)}</span>;
}

export function DateText({ value, pattern, className }: { value: string | Date | null | undefined; pattern?: string; className?: string }) {
  const { locale } = useLocale();
  return <span className={cn('nums', className)}>{formatDate(value, pattern, locale)}</span>;
}

export function TimeText({ value, className }: { value: string | null | undefined; className?: string }) {
  const { locale } = useLocale();
  return <span className={cn('nums', className)}>{formatTime(value, locale)}</span>;
}

export function TimestampTimeText({ value, seconds, className }: { value: string | Date | null | undefined; seconds?: boolean; className?: string }) {
  const { locale } = useLocale();
  return <span className={cn('nums', className)}>{formatTimeFromDate(value, locale, { seconds })}</span>;
}

export function DateTimeText({ value, seconds, className }: { value: string | Date | null | undefined; seconds?: boolean; className?: string }) {
  const { locale } = useLocale();
  return <span className={cn('nums', className)}>{formatDateTime(value, locale, { seconds })}</span>;
}
