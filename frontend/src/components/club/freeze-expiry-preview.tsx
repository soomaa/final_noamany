import { useLocale } from '@/store/locale';
import { shiftSubscriptionDate } from '@/lib/subscription-dates';
import { formatDate } from '@/lib/formatters';

export function FreezeExpiryPreview({ endDate, days }: { endDate?: string; days: number }) {
  const { locale } = useLocale();
  if (!endDate || endDate.startsWith('9999-') || !Number.isInteger(days) || days < 1) return null;
  const projected = shiftSubscriptionDate(endDate, days);
  if (!projected) return null;
  return <div className="grid gap-1 text-sm" aria-live="polite" aria-atomic="true">
    <p className="text-muted-foreground">{locale === 'en' ? 'Original expiry' : 'الانتهاء قبل التجميد'}: <span className="nums">{formatDate(endDate)}</span></p>
    <p className="font-semibold">{locale === 'en' ? 'Expiry after freezing' : 'الانتهاء بعد التجميد'}: <span className="nums">{formatDate(projected)}</span></p>
  </div>;
}
