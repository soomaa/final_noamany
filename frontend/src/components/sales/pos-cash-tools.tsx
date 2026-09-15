import { useEffect, useMemo, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  Calculator,
  ChevronDown,
  Delete,
  Equal,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  calculateCashSettlement,
  createCalculatorState,
  pressCalculatorKey,
  type CalculatorKey,
} from '@/lib/pos-cash-tools';
import { toArabicDigits } from '@/lib/utils';
import { useTouchKeypad } from '@/components/ui/touch-keypad-context';

type Ui = (text: string) => string;

const calculatorKeys: Array<{
  key: CalculatorKey;
  label: string;
  tone?: 'operator' | 'utility' | 'equals';
  wide?: boolean;
}> = [
  { key: 'clear', label: 'AC', tone: 'utility' },
  { key: 'sign', label: '±', tone: 'utility' },
  { key: 'backspace', label: '⌫', tone: 'utility' },
  { key: '÷', label: '÷', tone: 'operator' },
  { key: '7', label: '7' },
  { key: '8', label: '8' },
  { key: '9', label: '9' },
  { key: '×', label: '×', tone: 'operator' },
  { key: '4', label: '4' },
  { key: '5', label: '5' },
  { key: '6', label: '6' },
  { key: '-', label: '−', tone: 'operator' },
  { key: '1', label: '1' },
  { key: '2', label: '2' },
  { key: '3', label: '3' },
  { key: '+', label: '+', tone: 'operator' },
  { key: '0', label: '0', wide: true },
  { key: '.', label: '.' },
  { key: '=', label: '=', tone: 'equals' },
];

export function PosCalculatorDialog({
  open,
  onOpenChange,
  ui,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ui: Ui;
}) {
  const [state, setState] = useState(createCalculatorState);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      const keyMap: Record<string, CalculatorKey | undefined> = {
        Enter: '=',
        '=': '=',
        Escape: 'clear',
        Backspace: 'backspace',
        '/': '÷',
        '*': '×',
        x: '×',
        X: '×',
        '+': '+',
        '-': '-',
        '.': '.',
      };
      const key = /^\d$/.test(event.key)
        ? (event.key as CalculatorKey)
        : keyMap[event.key];
      if (!key) return;
      event.preventDefault();
      setState((current) => pressCalculatorKey(current, key));
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  const display = state.display === 'Error' ? ui('خطأ') : toArabicDigits(state.display);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm" className="overflow-hidden bg-slate-950 p-4 text-white [&>button]:text-slate-300 [&>button:hover]:bg-white/10 sm:p-5">
        <DialogHeader className="pe-10 text-start">
          <DialogTitle className="flex items-center gap-2 text-white">
            <Calculator className="size-5 text-amber-400" />
            {ui('الآلة الحاسبة')}
          </DialogTitle>
          <DialogDescription className="text-slate-300">
            {ui('استخدم الأزرار أو لوحة المفاتيح للحساب السريع')}
          </DialogDescription>
        </DialogHeader>

        <div
          dir="ltr"
          className="nums flex min-h-24 items-end justify-end overflow-x-auto rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-end text-4xl font-black tracking-tight text-white"
          aria-live="polite"
          aria-label={ui('نتيجة الحاسبة')}
        >
          {display}
        </div>

        <div dir="ltr" className="grid grid-cols-4 gap-2">
          {calculatorKeys.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`grid min-h-14 place-items-center rounded-xl text-lg font-black transition active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 ${
                item.wide ? 'col-span-2' : ''
              } ${
                item.tone === 'operator'
                  ? 'bg-amber-500 text-amber-950 hover:bg-amber-400'
                  : item.tone === 'equals'
                    ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                    : item.tone === 'utility'
                      ? 'bg-slate-300 text-slate-950 hover:bg-white'
                      : 'bg-slate-800 text-white hover:bg-slate-700'
              }`}
              aria-label={item.key === 'backspace' ? ui('حذف آخر رقم') : item.label}
              onClick={() => setState((current) => pressCalculatorKey(current, item.key))}
            >
              {item.key === 'backspace' ? <Delete className="size-5" /> : item.label}
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function PosCashAssistant({
  total,
  currency,
  ui,
  tendered: controlledTendered,
  onTenderedChange,
}: {
  total: number;
  currency: string;
  ui: Ui;
  tendered?: string;
  onTenderedChange?: (value: string) => void;
}) {
  const touchKeypad = useTouchKeypad();
  const [open, setOpen] = useState(false);
  useEffect(() => { if (touchKeypad) setOpen(true); }, [touchKeypad]);
  const [localTendered, setLocalTendered] = useState('');
  const tendered = controlledTendered ?? localTendered;
  const setTendered = onTenderedChange ?? setLocalTendered;
  const settlement = useMemo(
    () => calculateCashSettlement(total, tendered),
    [tendered, total],
  );

  const result = settlement.status === 'change'
    ? {
        label: ui('الباقي للعميل'),
        amount: settlement.changeCents,
        icon: ArrowDownLeft,
        className: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200',
      }
    : settlement.status === 'short'
      ? {
          label: ui('المتبقي على العميل'),
          amount: settlement.remainingCents,
          icon: ArrowUpRight,
          className: 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200',
        }
      : settlement.status === 'exact'
        ? {
            label: ui('المبلغ مضبوط — لا يوجد باقي'),
            amount: 0,
            icon: Equal,
            className: 'border-primary/20 bg-primary/[0.06] text-primary',
          }
        : null;

  return (
    <section className="overflow-hidden rounded-xl border bg-background">
      <button
        type="button"
        className="flex min-h-11 w-full items-center justify-between gap-3 px-3 py-2 text-start transition hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-200">
            <Banknote className="size-4" />
          </span>
          <span>
            <b className="block text-sm">{ui('حساب الباقي')}</b>
            <small className="text-[10px] text-muted-foreground">{ui('أدخل ما دفعه العميل ليظهر الباقي فورًا')}</small>
          </span>
        </span>
        <ChevronDown className={`size-4 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open ? (
        <div className="grid gap-2 border-t bg-muted/20 p-3 sm:grid-cols-[minmax(0,1fr)_auto]">
          <div>
            <Label htmlFor="cashTendered" className="text-[11px]">{ui('العميل دفع كام؟')}</Label>
            <div dir="ltr" className="relative mt-1">
              <Input
                id="cashTendered"
                touchTitle={ui('العميل دفع كام؟')}
                touchSummary={<div className="space-y-2 text-sm" aria-live="polite">
                  <div className="flex justify-between gap-2"><span>{ui('المطلوب')}</span><b className="nums">{toArabicDigits(total.toFixed(2))} {currency}</b></div>
                  {result && <div className={`flex justify-between gap-2 rounded-lg border p-2 ${result.className}`}><span>{result.label}</span><b className="nums">{toArabicDigits((result.amount / 100).toFixed(2))}</b></div>}
                  <button type="button" onClick={() => setTendered(total.toFixed(2))} className="min-h-11 w-full rounded-lg border font-semibold text-primary">{ui('دفع المبلغ بالضبط')}</button>
                </div>}
                dir="ltr"
                inputMode="decimal"
                type="number"
                min={0}
                step="0.01"
                className="nums h-11 pe-14 text-start text-base font-black"
                value={tendered}
                placeholder="0.00"
                onChange={(event) => setTendered(event.target.value)}
              />
              <span className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-muted-foreground">{currency}</span>
            </div>
          </div>
          <Button
            permissionAction={null}
            type="button"
            variant="outline"
            size="sm"
            className="self-end sm:h-11"
            onClick={() => setTendered(total.toFixed(2))}
          >
            {ui('دفع الإجمالي')}
          </Button>

          <div className={`sm:col-span-2 flex min-h-12 items-center justify-between gap-3 rounded-xl border px-3 py-2 ${result?.className ?? 'border-dashed bg-background text-muted-foreground'}`} aria-live="polite">
            {result ? (
              <>
                <span className="flex items-center gap-2 text-xs font-bold">
                  <result.icon className="size-4" />
                  {result.label}
                </span>
                <b className="nums text-lg">
                  {toArabicDigits((result.amount / 100).toFixed(2))} <small className="text-[10px]">{currency}</small>
                </b>
              </>
            ) : (
              <span className="text-xs">{ui('اكتب المبلغ المدفوع لعرض النتيجة')}</span>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
