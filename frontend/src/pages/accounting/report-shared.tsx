import { useQuery } from '@tanstack/react-query';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DatePresets } from '@/components/common/date-presets';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useBranches } from '@/hooks/use-branches';
import { api } from '@/lib/api';
import { formatMoney, localDateStr } from '@/lib/formatters';
import { uiStatic } from '@/lib/ui-static';
import { useLocale } from '@/store/locale';
import type { AccountingSettings } from '@/types/accounting';

/** One line of a financial statement, as every report endpoint returns it. */
export interface StatementItem {
  code?: string;
  name: string;
  amount: number;
}

/** Colour role for a statement figure — maps onto the app's own semantic tokens. */
export type StatementTone =
  | 'success'
  | 'destructive'
  | 'warning'
  | 'primary'
  | 'neutral';

const TONE_TEXT: Record<StatementTone, string> = {
  success: 'text-success',
  destructive: 'text-destructive',
  warning: 'text-warning',
  primary: 'text-primary',
  neutral: 'text-foreground',
};

const TONE_BOX: Record<StatementTone, string> = {
  success: 'border-success/40 bg-success/5',
  destructive: 'border-destructive/40 bg-destructive/5',
  warning: 'border-warning/40 bg-warning/5',
  primary: 'border-primary/40 bg-primary/5',
  neutral: 'border-border bg-muted/30',
};

/** First day of the current month — the default report start date. */
export function monthStart(): string {
  const d = new Date();
  return localDateStr(new Date(d.getFullYear(), d.getMonth(), 1));
}

/** Currency symbol from accounting settings, shared by every statement page. */
export function useAccountingCurrency(): string {
  const { data } = useQuery({
    queryKey: ['accounting', 'settings'],
    queryFn: async () => {
      const { data: d } = await api.get<AccountingSettings>('/accounting/settings');
      return d;
    },
    staleTime: 5 * 60 * 1000,
  });
  return data?.currencySymbol ?? 'ج.م';
}

export function ReportFilters({
  startDate,
  endDate,
  branchId,
  onStart,
  onEnd,
  onBranch,
  onSearch,
}: {
  startDate: string;
  endDate: string;
  branchId: string;
  onStart: (v: string) => void;
  onEnd: (v: string) => void;
  onBranch: (v: string) => void;
  onSearch: () => void;
}) {
  const { locale } = useLocale();
  const { data: branches } = useBranches();
  return (
    <div className="space-y-3 rounded-xl border bg-card p-4">
      <DatePresets
        locale={locale}
        activeStart={startDate}
        activeEnd={endDate}
        onSelect={(start, end) => {
          onStart(start);
          onEnd(end);
        }}
      />
      <div className="flex flex-wrap items-end gap-4">
        <div className="grid gap-1">
          <Label className="text-xs">{uiStatic('من تاريخ')}</Label>
          <Input
            className="nums"
            type="date"
            value={startDate}
            onChange={(e) => onStart(e.target.value)}
          />
        </div>
        <div className="grid gap-1">
          <Label className="text-xs">{uiStatic('إلى تاريخ')}</Label>
          <Input
            className="nums"
            type="date"
            value={endDate}
            onChange={(e) => onEnd(e.target.value)}
          />
        </div>
        <div className="grid gap-1">
          <Label className="text-xs">{uiStatic('الفرع')}</Label>
          <select
            className="rounded-md border bg-background px-3 py-2 text-sm"
            value={branchId}
            onChange={(e) => onBranch(e.target.value)}
          >
            <option value="all">{uiStatic('كل الفروع')}</option>
            {(branches ?? []).map((b) => (
              <option key={b.id} value={String(b.id)}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <Button variant="brand" onClick={onSearch}>
          {uiStatic('بحث')}
        </Button>
      </div>
    </div>
  );
}

/** A single statement line: account name on the reading side, money on the far side. */
export function StatementLine({
  item,
  currency,
  tone = 'neutral',
  signed = false,
}: {
  item: StatementItem;
  currency: string;
  tone?: StatementTone;
  signed?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b py-2 last:border-b-0">
      <span className="min-w-0 truncate ps-4" title={item.name}>
        {item.code && <span className="nums me-2 text-xs text-muted-foreground">{item.code}</span>}
        {item.name}
      </span>
      <span className={`nums shrink-0 font-semibold ${TONE_TEXT[tone]}`}>
        {signed ? '-' : ''}
        {formatMoney(item.amount, currency)}
      </span>
    </div>
  );
}

/**
 * A titled block of statement lines closed by its own total row — the repeated
 * unit of the income statement, balance sheet and cash-flow pages.
 * Labels arrive already translated (callers wrap them in `ui()`).
 */
export function StatementGroup({
  title,
  icon: Icon,
  iconClassName,
  items,
  total,
  totalLabel,
  emptyLabel,
  currency,
  tone = 'neutral',
  signed = false,
  size = 'md',
}: {
  title: string;
  icon?: LucideIcon;
  iconClassName?: string;
  items: StatementItem[];
  total: number;
  totalLabel: string;
  emptyLabel: string;
  currency: string;
  tone?: StatementTone;
  signed?: boolean;
  /** `lg` for a statement's top-level section, `md` for a nested sub-total block. */
  size?: 'md' | 'lg';
}) {
  const isLarge = size === 'lg';
  return (
    <div>
      <h4
        className={`flex items-center gap-2 font-semibold ${isLarge ? 'mb-4 text-lg' : 'mb-2'}`}
      >
        {Icon && <Icon className={`${isLarge ? 'h-5 w-5' : 'h-4 w-4'} ${iconClassName ?? ''}`} />}
        {title}
      </h4>
      {items.length > 0 ? (
        <>
          {items.map((item, index) => (
            <StatementLine
              key={item.code ?? `${item.name}-${index}`}
              item={item}
              currency={currency}
              tone={tone}
              signed={signed}
            />
          ))}
          <div
            className={`mt-2 flex items-center justify-between gap-3 border-t-2 py-2 font-bold ${
              isLarge ? 'text-lg' : ''
            }`}
          >
            <span>{totalLabel}</span>
            <span className={`nums ${TONE_TEXT[tone]}`}>{formatMoney(total, currency)}</span>
          </div>
        </>
      ) : (
        <div className="py-4 text-center text-muted-foreground">{emptyLabel}</div>
      )}
    </div>
  );
}

/**
 * A bold subtotal rule between two blocks of a statement — gross profit, total
 * liabilities. Labels arrive already translated.
 */
export function StatementSubtotal({
  label,
  amount,
  currency,
  tone = 'neutral',
}: {
  label: string;
  amount: number;
  currency: string;
  tone?: StatementTone;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-y-2 py-2 font-bold">
      <span>{label}</span>
      <span className={`nums ${TONE_TEXT[tone]}`}>{formatMoney(amount, currency)}</span>
    </div>
  );
}

/** The highlighted grand total that closes a statement. Labels arrive translated. */
export function StatementTotal({
  label,
  icon: Icon,
  amount,
  currency,
  tone = 'primary',
  boxTone,
  note,
  noteTone,
}: {
  label: string;
  icon?: LucideIcon;
  amount: number;
  currency: string;
  /** Colours the figure. */
  tone?: StatementTone;
  /** Colours the banner itself; defaults to `tone`. */
  boxTone?: StatementTone;
  note?: string;
  noteTone?: StatementTone;
}) {
  return (
    <div className={`rounded-lg border-2 p-4 ${TONE_BOX[boxTone ?? tone]}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-lg font-bold">
          {Icon && <Icon className="h-5 w-5" />}
          {label}
        </span>
        <span className={`nums text-2xl font-bold ${TONE_TEXT[tone]}`}>
          {formatMoney(amount, currency)}
        </span>
      </div>
      {note && (
        <p className={`mt-2 text-sm ${TONE_TEXT[noteTone ?? tone]}`}>{note}</p>
      )}
    </div>
  );
}
