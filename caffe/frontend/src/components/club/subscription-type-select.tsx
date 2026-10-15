import { useMemo } from 'react';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useClubT } from '@/hooks/use-club-t';
import { formatMoney } from '@/lib/formatters';
import { cn, toArabicDigits } from '@/lib/utils';
import type { ClubSubscriptionType } from '@/types/club';

export type SubscriptionTypeSelectProps = {
  types: ClubSubscriptionType[];
  value: string;
  onChange: (typeId: string) => void;
  /** `all` = packages + sessions grouped; `same-kind` = match source plan kind only */
  mode?: 'all' | 'same-kind';
  sourceIsSessions?: boolean;
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

function TypeRow({ t, ct }: { t: ClubSubscriptionType; ct: (key: string) => string }) {
  return (
    <span className="grid w-full grid-cols-[minmax(0,1.4fr)_auto_auto] items-center gap-x-3 text-start">
      <span className="truncate font-medium leading-snug">{t.name}</span>
      <span className="nums shrink-0 text-xs tabular-nums text-muted-foreground">
        {formatMoney(t.price)}
      </span>
      <span
        className={cn(
          'nums shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-medium',
          t.isLinkedToSessions
            ? 'bg-sky-500/10 text-sky-800 dark:text-sky-200'
            : 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-200',
        )}
      >
        {planMeta(t, ct)}
      </span>
    </span>
  );
}

export function SubscriptionTypeSelect({
  types,
  value,
  onChange,
  mode = 'all',
  sourceIsSessions = false,
  excludeTypeId,
  placeholder = '—',
  className,
}: SubscriptionTypeSelectProps) {
  const ct = useClubT();

  const options = useMemo(() => {
    let list = types.filter((t) => t.id !== excludeTypeId);
    if (mode === 'same-kind') {
      list = list.filter((t) => Boolean(t.isLinkedToSessions) === sourceIsSessions);
    }
    return list.slice().sort((a, b) => a.name.localeCompare(b.name, 'ar'));
  }, [types, excludeTypeId, mode, sourceIsSessions]);

  const packages = useMemo(
    () => options.filter((t) => !t.isLinkedToSessions),
    [options],
  );
  const sessions = useMemo(
    () => options.filter((t) => !!t.isLinkedToSessions),
    [options],
  );

  const selected = options.find((t) => String(t.id) === value) ?? null;

  const renderItems = (list: ClubSubscriptionType[]) =>
    list.map((t) => (
      <SelectItem
        key={t.id}
        value={String(t.id)}
        className="cursor-pointer rounded-md py-2.5 pe-3 ps-8 data-[highlighted]:bg-accent"
      >
        <TypeRow t={t} ct={ct} />
      </SelectItem>
    ));

  return (
    <div className={cn('grid gap-1.5', className)}>
      {mode === 'same-kind' && (
        <p className="text-xs text-muted-foreground">
          {sourceIsSessions
            ? ct('subscriptions.transferSameKindSessions')
            : ct('subscriptions.transferSameKindPackages')}
        </p>
      )}

      <Select
        value={value || undefined}
        onValueChange={onChange}
        disabled={options.length === 0}
      >
        <SelectTrigger className="h-11 w-full">
          <SelectValue placeholder={placeholder}>
            {selected ? (
              <span className="flex w-full min-w-0 items-center justify-between gap-3 pe-1">
                <span className="truncate font-medium">{selected.name}</span>
                <span className="shrink-0 nums text-xs text-muted-foreground">
                  {formatMoney(selected.price)}
                  <span className="mx-1.5 text-border">|</span>
                  {planMeta(selected, ct)}
                </span>
              </span>
            ) : null}
          </SelectValue>
        </SelectTrigger>

        <SelectContent
          position="popper"
          className="w-[var(--radix-select-trigger-width)] max-w-[min(100vw-2rem,32rem)] p-1"
        >
          {options.length === 0 ? (
            <div className="px-3 py-4 text-center text-sm text-muted-foreground">
              {ct('subscriptions.transferNoSameKindPlans')}
            </div>
          ) : mode === 'same-kind' ? (
            renderItems(options)
          ) : (
            <>
              {packages.length > 0 && (
                <SelectGroup>
                  <SelectLabel className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                    {ct('packages.kindSubscription')}
                  </SelectLabel>
                  {renderItems(packages)}
                </SelectGroup>
              )}
              {packages.length > 0 && sessions.length > 0 && <SelectSeparator />}
              {sessions.length > 0 && (
                <SelectGroup>
                  <SelectLabel className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-sky-700 dark:text-sky-300">
                    {ct('packages.kindSessions')}
                  </SelectLabel>
                  {renderItems(sessions)}
                </SelectGroup>
              )}
            </>
          )}
        </SelectContent>
      </Select>
    </div>
  );
}

/** @deprecated Prefer SubscriptionTypeSelect — kept for existing transfer call sites */
export function TransferPlanPicker(
  props: Omit<SubscriptionTypeSelectProps, 'mode'> & { sourceIsSessions: boolean },
) {
  return <SubscriptionTypeSelect {...props} mode="same-kind" />;
}
