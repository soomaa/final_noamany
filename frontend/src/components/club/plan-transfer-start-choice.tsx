import { FieldWrapper } from '@/components/common/form-fields';
import { useClubT } from '@/hooks/use-club-t';
import { cn, toArabicDigits } from '@/lib/utils';

export type PlanTransferStartFrom = 'original' | 'today';

/**
 * Time plan → time plan transfer: keep the original start date (same period, only the price
 * difference moves) or start the new plan today (unused days credited, full new period).
 */
export function PlanTransferStartChoice({
  value,
  originalStartDate,
  disabled,
  onChange,
}: {
  value: PlanTransferStartFrom;
  originalStartDate?: string | null;
  disabled?: boolean;
  onChange: (next: PlanTransferStartFrom) => void;
}) {
  const ct = useClubT();
  const options = [
    {
      key: 'original' as const,
      title: ct('subscriptions.transferStartOriginal'),
      hint: originalStartDate
        ? ct('subscriptions.transferStartOriginalHint', { date: toArabicDigits(originalStartDate) })
        : ct('subscriptions.transferStartOriginalHintNoDate'),
    },
    {
      key: 'today' as const,
      title: ct('subscriptions.transferStartToday'),
      hint: ct('subscriptions.transferStartTodayHint'),
    },
  ];

  return (
    <FieldWrapper label={ct('subscriptions.transferStartChoice')}>
      <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label={ct('subscriptions.transferStartChoice')}>
        {options.map((option) => (
          <button
            key={option.key}
            type="button"
            role="radio"
            aria-checked={value === option.key}
            disabled={disabled}
            onClick={() => onChange(option.key)}
            className={cn(
              'rounded-xl border px-4 py-3 text-start transition-colors disabled:opacity-60',
              value === option.key
                ? 'border-primary bg-primary/10 ring-1 ring-primary/40'
                : 'border-border/70 bg-background hover:bg-muted/40',
            )}
          >
            <p className="font-semibold text-foreground">{option.title}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{option.hint}</p>
          </button>
        ))}
      </div>
    </FieldWrapper>
  );
}
