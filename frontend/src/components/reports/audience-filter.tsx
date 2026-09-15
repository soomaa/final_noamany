import { useState } from 'react';
import { useAuth } from '@/store/auth';
import { useLocale } from '@/store/locale';

export type ReportAudience = 'all' | 'male' | 'female';

export function useReportAudience() {
  const user = useAuth((state) => state.user);
  const [selected, setSelected] = useState<ReportAudience>('all');
  const lockedValue: ReportAudience | null =
    user?.man_women_type === 0 ? 'male' : user?.man_women_type === 1 ? 'female' : null;
  const value = lockedValue ?? selected;
  return {
    value,
    gender: value === 'all' ? undefined : value,
    locked: lockedValue !== null,
    setValue: setSelected,
  };
}

export function ReportAudienceFilter({
  value,
  onChange,
  locked = false,
}: {
  value: ReportAudience;
  onChange: (value: ReportAudience) => void;
  locked?: boolean;
}) {
  const { ui } = useLocale();
  return (
    <div className="grid gap-1.5">
      <label className="text-xs text-muted-foreground">{ui('القسم')}</label>
      <select
        aria-label={ui('القسم')}
        className="flex h-10 min-w-36 items-center rounded-md border border-input bg-background px-3 text-sm"
        value={value}
        onChange={(event) => onChange(event.target.value as ReportAudience)}
        disabled={locked}
      >
        <option value="all">{ui('كل الأقسام')}</option>
        <option value="male">{ui('رجال')}</option>
        <option value="female">{ui('سيدات')}</option>
      </select>
      {locked && <span className="sr-only">{ui('القسم محدد حسب صلاحيات حسابك')}</span>}
    </div>
  );
}
