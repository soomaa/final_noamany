import { CalendarClock, RefreshCcw, WalletCards } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { TargetCycle } from '@/lib/sales-commission';
import { toArabicDigits } from '@/lib/utils';
import { uiStatic } from '@/lib/ui-static';

export type TargetPeriodMode = 'monthly' | 'custom' | 'days';

export interface TargetPeriodValue {
  targetPeriodMode: TargetPeriodMode;
  targetStartDate: string | null;
  targetEndDate: string | null;
  targetDays: number | null;
}

export function TargetPeriodFields({ value, cycle, disabled, onChange }: {
  value: TargetPeriodValue;
  cycle?: TargetCycle;
  disabled?: boolean;
  onChange: (next: TargetPeriodValue) => void;
}) {
  return (
    <div className="rounded-xl border bg-muted/10 p-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="grid gap-2">
          <Label>{uiStatic('مدة التارجت')}</Label>
          <select
            className="h-10 rounded-md border bg-background px-3"
            value={value.targetPeriodMode}
            disabled={disabled}
            onChange={(event) => onChange({
              targetPeriodMode: event.target.value as TargetPeriodMode,
              targetStartDate: null,
              targetEndDate: null,
              targetDays: null,
            })}
          >
            <option value="monthly">{uiStatic('شهري')}</option>
            <option value="custom">{uiStatic('فترة محددة')}</option>
            <option value="days">{uiStatic('عدد أيام')}</option>
          </select>
        </div>
        {value.targetPeriodMode === 'custom' ? <>
          <div className="grid gap-2"><Label>{uiStatic('من')}</Label><Input type="date" className="nums" disabled={disabled} value={value.targetStartDate ?? ''} onChange={(event) => onChange({ ...value, targetStartDate: event.target.value || null })} /></div>
          <div className="grid gap-2"><Label>{uiStatic('إلى')}</Label><Input type="date" className="nums" disabled={disabled} value={value.targetEndDate ?? ''} onChange={(event) => onChange({ ...value, targetEndDate: event.target.value || null })} /></div>
        </> : null}
        {value.targetPeriodMode === 'days' ? <>
          <div className="grid gap-2"><Label>{uiStatic('بداية أول دورة')}</Label><Input type="date" className="nums" disabled={disabled} value={value.targetStartDate ?? ''} onChange={(event) => onChange({ ...value, targetStartDate: event.target.value || null })} /></div>
          <div className="grid gap-2"><Label>{uiStatic('عدد الأيام')}</Label><Input type="number" min={1} className="nums" disabled={disabled} value={value.targetDays ?? ''} onChange={(event) => onChange({ ...value, targetDays: event.target.value ? Number(event.target.value) : null })} /></div>
        </> : null}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        {value.targetPeriodMode === 'monthly' ? uiStatic('يُعاد احتساب التارجت كل شهر.') : value.targetPeriodMode === 'custom' ? uiStatic('يُطبّق التارجت على الفترة المختارة.') : uiStatic('يُقاس التارجت لكل عدد الأيام المحدد.')}
      </p>
      {cycle ? (
        <div className="mt-4 grid gap-2 border-t pt-4 sm:grid-cols-3" aria-label={uiStatic('تفاصيل دورة التارجت الحالية')}>
          <CycleItem icon={CalendarClock} label={uiStatic('الدورة الحالية')} value={`${toArabicDigits(cycle.startDate)} — ${toArabicDigits(cycle.endDate)}`} />
          <CycleItem icon={RefreshCcw} label={uiStatic('بداية الدورة الجديدة')} value={toArabicDigits(cycle.resetDate)} />
          <CycleItem icon={WalletCards} label={uiStatic('موعد احتساب وصرف المستحق')} value={toArabicDigits(cycle.payoutDate)} />
        </div>
      ) : null}
    </div>
  );
}

function CycleItem({ icon: Icon, label, value }: { icon: typeof CalendarClock; label: string; value: string }) {
  return <div className="rounded-[10px] border border-border/70 bg-background p-3"><div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground"><Icon className="size-4 text-primary" />{label}</div><p className="nums mt-2 text-sm font-bold">{value}</p></div>;
}
