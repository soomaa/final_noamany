import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DatePresets } from '@/components/common/date-presets';
import { useLocale } from '@/store/locale';

interface DateRangeFilterProps {
  startDate: string;
  endDate: string;
  onStartChange: (v: string) => void;
  onEndChange: (v: string) => void;
  extra?: React.ReactNode;
  /** Show quick preset buttons (اليوم / آخر ٧ / …). */
  showPresets?: boolean;
}

export function DateRangeFilter({
  startDate,
  endDate,
  onStartChange,
  onEndChange,
  extra,
  showPresets = true,
}: DateRangeFilterProps) {
  const { ui, locale } = useLocale();
  return (
    <div className="flex flex-col gap-2">
      {showPresets && (
        <DatePresets
          locale={locale}
          activeStart={startDate}
          activeEnd={endDate}
          onSelect={(s, e) => {
            onStartChange(s);
            onEndChange(e);
          }}
        />
      )}
    <div className="flex flex-wrap items-end gap-3">
      <div className="grid gap-1.5">
        <Label className="text-xs text-muted-foreground">{ui('من')}</Label>
        <Input
          type="date"
          value={startDate}
          onChange={(e) => onStartChange(e.target.value)}
          className="w-40"
        />
      </div>
      <div className="grid gap-1.5">
        <Label className="text-xs text-muted-foreground">{ui('إلى')}</Label>
        <Input
          type="date"
          value={endDate}
          onChange={(e) => onEndChange(e.target.value)}
          className="w-40"
        />
      </div>
      {extra}
    </div>
    </div>
  );
}

/** First day of the current month as YYYY-MM-DD (local time). */
export function firstOfMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

/** Today as YYYY-MM-DD (local time). */
export function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
