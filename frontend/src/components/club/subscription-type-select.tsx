import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Dumbbell, Layers3 } from 'lucide-react';
import { Combobox } from '@/components/common/combobox';
import { useClubT } from '@/hooks/use-club-t';
import { formatMoney } from '@/lib/formatters';
import { cn, toArabicDigits } from '@/lib/utils';
import type { ClubSubscriptionType } from '@/types/club';

export type TransferTargetKind = 'package' | 'sessions';

export type SubscriptionTypeSelectProps = {
  types: ClubSubscriptionType[];
  value: string;
  onChange: (typeId: string) => void;
  /** `all` = packages + sessions grouped; `same-kind` = match source; `by-kind` = filter by targetKind */
  mode?: 'all' | 'same-kind' | 'by-kind';
  sourceIsSessions?: boolean;
  targetKind?: TransferTargetKind;
  excludeTypeId?: number | null;
  placeholder?: string;
  className?: string;
};

function planMeta(t: ClubSubscriptionType, ct: (key: string) => string) {
  if (t.isLinkedToSessions) {
    return `${toArabicDigits(t.sessionsCount ?? 0)} ${ct('packages.sessionsUnit')}`;
  }
  return `${toArabicDigits(t.days)} ${ct('subscriptions.typeDays')}`;
}

export function SubscriptionTypeSelect({
  types,
  value,
  onChange,
  mode = 'all',
  sourceIsSessions = false,
  targetKind,
  excludeTypeId,
  placeholder = '—',
  className,
}: SubscriptionTypeSelectProps) {
  const ct = useClubT();

  const options = useMemo(() => {
    let list = types.filter((t) => t.id !== excludeTypeId);
    if (mode === 'same-kind') {
      list = list.filter((t) => Boolean(t.isLinkedToSessions) === sourceIsSessions);
    } else if (mode === 'by-kind' && targetKind) {
      list = list.filter((t) =>
        targetKind === 'sessions' ? Boolean(t.isLinkedToSessions) : !t.isLinkedToSessions,
      );
    }
    return list.slice().sort((a, b) => a.name.localeCompare(b.name, 'ar'));
  }, [types, excludeTypeId, mode, sourceIsSessions, targetKind]);

  const searchableOptions = useMemo(
    () => options.map((type) => {
      const kind = type.isLinkedToSessions
        ? ct('packages.kindSessions')
        : ct('packages.kindSubscription');
      const meta = planMeta(type, ct);
      const price = formatMoney(type.price);
      return {
        value: String(type.id),
        label: type.name,
        description: `${kind} · ${price} · ${meta}`,
        searchText: `${kind} ${price} ${meta}`,
      };
    }),
    [ct, options],
  );

  return (
    <div className={cn('grid gap-1.5', className)}>
      {mode === 'same-kind' && (
        <p className="text-xs text-muted-foreground">
          {sourceIsSessions
            ? ct('subscriptions.transferSameKindSessions')
            : ct('subscriptions.transferSameKindPackages')}
        </p>
      )}

      <Combobox
        value={value}
        onValueChange={onChange}
        options={searchableOptions}
        placeholder={placeholder}
        searchPlaceholder="ابحث باسم الاشتراك أو السعر…"
        emptyText={
          mode === 'by-kind'
            ? ct('subscriptions.transferNoTargetPlans')
            : mode === 'same-kind'
              ? ct('subscriptions.transferNoSameKindPlans')
              : 'لا توجد اشتراكات مطابقة'
        }
        disabled={options.length === 0}
        className="h-11"
        aria-label="نوع الاشتراك"
      />
    </div>
  );
}

/** Plan transfer picker: choose target kind (اشتراك / حصص) then matching types. */
export function TransferPlanPicker({
  types,
  sourceIsSessions,
  excludeTypeId,
  value,
  onChange,
  className,
}: {
  types: ClubSubscriptionType[];
  sourceIsSessions: boolean;
  excludeTypeId?: number | null;
  value: string;
  onChange: (typeId: string) => void;
  className?: string;
}) {
  const ct = useClubT();
  const [targetKind, setTargetKind] = useState<TransferTargetKind>(
    sourceIsSessions ? 'sessions' : 'package',
  );

  // Re-sync default kind when the source subscription changes.
  useEffect(() => {
    setTargetKind(sourceIsSessions ? 'sessions' : 'package');
  }, [sourceIsSessions]);

  const selectedType = types.find((type) => String(type.id) === value);

  return (
    <div className={cn('grid gap-3', className)}>
      <div className="grid gap-2">
        <p className="text-xs text-muted-foreground">{ct('subscriptions.transferChooseKind')}</p>
        <div className="mx-auto grid w-full max-w-2xl grid-cols-2 gap-3" role="radiogroup" aria-label={ct('subscriptions.transferChooseKind')}>
          {([
            { value: 'package' as const, label: ct('packages.kindSubscription') },
            { value: 'sessions' as const, label: ct('packages.kindSessions') },
          ]).map((opt) => {
            const selected = targetKind === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => {
                  if (selected) return;
                  setTargetKind(opt.value);
                  onChange('');
                }}
                className={cn(
                  'relative flex min-h-20 items-center justify-center gap-3 rounded-2xl border-2 px-4 py-3 text-base font-semibold transition-all',
                  selected
                    ? opt.value === 'sessions'
                      ? 'border-sky-500 bg-sky-500/15 text-sky-900 shadow-sm ring-2 ring-sky-500/15 dark:text-sky-100'
                      : 'border-emerald-500 bg-emerald-500/15 text-emerald-900 shadow-sm ring-2 ring-emerald-500/15 dark:text-emerald-100'
                    : 'border-border bg-background text-muted-foreground hover:border-primary/35 hover:bg-muted/40',
                )}
              >
                {opt.value === 'sessions' ? <Dumbbell className="size-5" /> : <Layers3 className="size-5" />}
                <span>{opt.label}</span>
                {selected ? <CheckCircle2 className="absolute end-3 top-3 size-5" /> : null}
              </button>
            );
          })}
        </div>
      </div>
      <SubscriptionTypeSelect
        types={types}
        mode="by-kind"
        targetKind={targetKind}
        excludeTypeId={excludeTypeId}
        value={value}
        onChange={onChange}
        placeholder={ct('subscriptions.transferToType')}
      />
      {selectedType ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 px-3.5 py-3 text-sm">
          <span className="inline-flex items-center gap-2 font-semibold text-primary">
            <CheckCircle2 className="size-4" />
            {ct('subscriptions.transferToType')}
          </span>
          <span className="text-end font-semibold">
            {selectedType.name} · {formatMoney(selectedType.price)}
          </span>
        </div>
      ) : (
        <p className="rounded-xl border border-dashed px-3 py-2 text-center text-xs text-muted-foreground">
          {ct('subscriptions.transferChooseKind')}
        </p>
      )}
    </div>
  );
}
