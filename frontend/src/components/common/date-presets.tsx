import { Button } from '@/components/ui/button';
import { firstOfMonth, todayLocal } from '@/components/reports/date-range-filter';

export type DatePresetKey = 'today' | 'last7' | 'last30' | 'month' | 'quarter';

export interface DatePreset {
  key: DatePresetKey;
  labelAr: string;
  labelEn: string;
  range: () => { start: string; end: string };
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function quarterStart(): string {
  const d = new Date();
  const qMonth = Math.floor(d.getMonth() / 3) * 3;
  return `${d.getFullYear()}-${String(qMonth + 1).padStart(2, '0')}-01`;
}

export const DATE_PRESETS: DatePreset[] = [
  { key: 'today', labelAr: 'اليوم', labelEn: 'Today', range: () => ({ start: todayLocal(), end: todayLocal() }) },
  { key: 'last7', labelAr: 'آخر ٧ أيام', labelEn: 'Last 7 days', range: () => ({ start: daysAgo(6), end: todayLocal() }) },
  { key: 'last30', labelAr: 'آخر ٣٠ يوم', labelEn: 'Last 30 days', range: () => ({ start: daysAgo(29), end: todayLocal() }) },
  { key: 'month', labelAr: 'الشهر', labelEn: 'This month', range: () => ({ start: firstOfMonth(), end: todayLocal() }) },
  { key: 'quarter', labelAr: 'الربع', labelEn: 'This quarter', range: () => ({ start: quarterStart(), end: todayLocal() }) },
];

interface DatePresetsProps {
  locale?: 'ar' | 'en';
  onSelect: (start: string, end: string) => void;
  activeStart?: string;
  activeEnd?: string;
}

export function DatePresets({ locale = 'ar', onSelect, activeStart, activeEnd }: DatePresetsProps) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {DATE_PRESETS.map((p) => {
        const { start, end } = p.range();
        const active = activeStart === start && activeEnd === end;
        return (
          <Button
            key={p.key}
            type="button"
            size="sm"
            variant={active ? 'default' : 'outline'}
            className="h-7 text-xs"
            onClick={() => onSelect(start, end)}
          >
            {locale === 'en' ? p.labelEn : p.labelAr}
          </Button>
        );
      })}
    </div>
  );
}
