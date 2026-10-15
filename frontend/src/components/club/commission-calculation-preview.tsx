import { formatDisplayNumber } from '@/lib/number-display';
import { Calculator } from 'lucide-react';
import { commissionPreview } from '@/lib/commission-preview';
import { formatMoney } from '@/lib/formatters';
import { useLocale } from '@/store/locale';
import { uiStatic } from '@/lib/ui-static';

export function CommissionCalculationPreview({ baseAmount, percent, label = uiStatic('العمولة المتوقعة') }: {
  baseAmount: number;
  percent: number;
  label?: string;
}) {
  const { ui } = useLocale();
  const preview = commissionPreview(baseAmount, percent);
  return (
    <div className="rounded-xl border border-primary/25 bg-primary/5 p-4" aria-label={ui('معادلة احتساب العمولة')}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-bold"><Calculator className="size-4 text-primary" />{label}</div>
        <strong className="nums text-lg text-primary">{formatMoney(preview.amount)}</strong>
      </div>
      <p className="nums mt-2 text-sm text-muted-foreground" dir="ltr">
        {formatMoney(preview.baseAmount)} × {formatDisplayNumber(preview.percent)}% = {formatMoney(preview.amount)}
      </p>
    </div>
  );
}
