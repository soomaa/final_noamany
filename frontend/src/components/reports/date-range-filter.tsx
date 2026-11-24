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
  /**
   * The server keeps the period inside the current month (e.g. the target report for captains and
   * reception): the date pickers only offer this month's days.
   */
  monthOnly?: boolean;
}

export function DateRangeFilter({
  startDate,
  endDate,
  onStartChange,
  onEndChange,
  extra,
  showPresets = true,
  monthOnly = false,
}: DateRangeFilterProps) {
  const { ui, locale } = useLocale();
  if (monthOnly) {
    // Days inside the current month only (client video, 23 Nov: «من يوم ٤ لحد يوم ٦»); the server
    // clamps to the same month.
    const [year, month] = todayLocal().split('-').map(Number);
    const first = `${year}-${String(month).padStart(2, '0')}-01`;
    const last = `${year}-${String(month).padStart(2, '0')}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`;
    const clamp = (v: string) => (!v ? v : v < first ? first : v > last ? last : v);
    return (
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1.5">
          <Label className="text-xs text-muted-foreground">{ui('من')} <span className="text-[11px]">({ui('الشهر الحالي')})</span></Label>
          <Input type="date" min={first} max={last} value={clamp(startDate)} onChange={(e) => onStartChange(clamp(e.target.value) || first)} className="w-40" />
        </div>
        <div className="grid gap-1.5">
          <Label className="text-xs text-muted-foreground">{ui('إلى')}</Label>
          <Input type="date" min={first} max={last} value={clamp(endDate)} onChange={(e) => onEndChange(clamp(e.target.value) || last)} className="w-40" />
        </div>
        {extra}
      </div>
    );
  }
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
