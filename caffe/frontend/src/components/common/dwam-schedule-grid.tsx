import { Time12Input } from '@/components/common/time-12-input';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { formatTime } from '@/lib/formatters';
import { useLocale } from '@/store/locale';
import { uiStatic } from '@/lib/ui-static';

export interface DwamDay {
  day: number;
  dayName: string;
  enabled: boolean;
  startTime: string;
  endTime: string;
}

const DAY_DEFS: { day: number; nameKey: string }[] = [
  { day: 6, nameKey: uiStatic('السبت') },
  { day: 0, nameKey: uiStatic('الأحد') },
  { day: 1, nameKey: uiStatic('الإثنين') },
  { day: 2, nameKey: uiStatic('الثلاثاء') },
  { day: 3, nameKey: uiStatic('الأربعاء') },
  { day: 4, nameKey: uiStatic('الخميس') },
  { day: 5, nameKey: uiStatic('الجمعة') },
];

export function defaultDwamSchedule(): DwamDay[] {
  return DAY_DEFS.map((d) => ({
    day: d.day,
    dayName: d.nameKey,
    enabled: d.day !== 5 && d.day !== 6,
    startTime: '08:00',
    endTime: '17:00',
  }));
}

interface DwamScheduleGridProps {
  schedule: DwamDay[];
  onChange: (schedule: DwamDay[]) => void;
  shiftType?: string;
  onShiftTypeChange?: (v: string) => void;
  className?: string;
  readOnly?: boolean;
}

export function DwamScheduleGrid({ schedule, onChange, shiftType, onShiftTypeChange, className, readOnly }: DwamScheduleGridProps) {
  const { ui } = useLocale();
  const update = (day: number, patch: Partial<DwamDay>) => {
    onChange(schedule.map((d) => (d.day === day ? { ...d, ...patch } : d)));
  };

  return (
    <div className={cn('space-y-4', className)}>
      {onShiftTypeChange && !readOnly && (
        <div className="max-w-xs">
          <label className="mb-1.5 block text-sm font-medium">{ui('نوع الدوام')}</label>
          <select
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={shiftType ?? 'fixed'}
            onChange={(e) => onShiftTypeChange(e.target.value)}
          >
            <option value="fixed">{ui('دوام ثابت')}</option>
            <option value="flexible">{ui('ساعات مرنة')}</option>
            <option value="shift">{ui('شفتات')}</option>
            <option value="part_time">{ui('جزئي')}</option>
          </select>
        </div>
      )}
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="p-3 text-start">{ui('اليوم')}</th>
              <th className="p-3 text-start">{ui('مفعّل')}</th>
              <th className="p-3 text-start">{ui('من')}</th>
              <th className="p-3 text-start">{ui('إلى')}</th>
            </tr>
          </thead>
          <tbody>
            {schedule.map((row) => (
              <tr key={row.day} className="border-b border-border/60">
                <td className="p-3 font-medium">{ui(row.dayName)}</td>
                <td className="p-3">
                  {readOnly ? (
                    <span>{row.enabled ? ui('نعم') : ui('لا')}</span>
                  ) : (
                    <Switch checked={row.enabled} onCheckedChange={(v) => update(row.day, { enabled: v })} />
                  )}
                </td>
                <td className="p-3">
                  {readOnly ? (
                    <span className="nums">{row.enabled ? formatTime(row.startTime) : '—'}</span>
                  ) : (
                    <Time12Input
                      value={row.startTime}
                      disabled={!row.enabled}
                      onValueChange={(value) => update(row.day, { startTime: value })}
                      className="min-w-56"
                    />
                  )}
                </td>
                <td className="p-3">
                  {readOnly ? (
                    <span className="nums">{row.enabled ? formatTime(row.endTime) : '—'}</span>
                  ) : (
                    <Time12Input
                      value={row.endTime}
                      disabled={!row.enabled}
                      onValueChange={(value) => update(row.day, { endTime: value })}
                      className="min-w-56"
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
