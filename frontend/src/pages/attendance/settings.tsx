import type { ColumnDef } from '@tanstack/react-table';
import { AlertTriangle, Pencil, Plus, Power, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { DataTable } from '@/components/common/data-table';
import { Time12Input } from '@/components/common/time-12-input';
import { FilterBar } from '@/components/common/filter-bar';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api, apiError } from '@/lib/api';
import { formatTime } from '@/lib/formatters';
import { useMutationWithToast, usePaginatedList } from '@/lib/api-hooks';
import { confirm } from '@/lib/confirm';
import { useListQuery } from '@/lib/use-list-query';
import { toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';
import { uiStatic } from '@/lib/ui-static';

interface ShiftRow {
  id: number;
  title?: string;
  /** Wrong or suspicious times (e.g. AM/PM typed the wrong way) reported by the API. */
  warnings?: string[];
  hdoorFromTime?: string;
  hdoorToTime?: string;
  hdoorKhasmFrom?: string;
  ensrafFromTime?: string;
  ensrafToTime?: string;
  ensrafKhasmFrom?: string;
  /** Different times for specific weekdays (0 = Sunday … 5 = Friday … 6 = Saturday). */
  dayOverrides?: DayOverride[];
}

type ShiftTimes = Omit<ShiftForm, 'title' | 'dayOverrides'>;

interface DayOverride extends ShiftTimes {
  weekday: number;
}

interface ShiftForm {
  title: string;
  hdoorFromTime: string;
  hdoorToTime: string;
  hdoorKhasmFrom: string;
  ensrafFromTime: string;
  ensrafToTime: string;
  ensrafKhasmFrom: string;
  dayOverrides: DayOverride[];
}

/** Same order as JavaScript getDay() / the API: 0 = Sunday … 6 = Saturday. */
const WEEKDAYS: { value: number; label: string }[] = [
  { value: 6, label: uiStatic('السبت') },
  { value: 0, label: uiStatic('الأحد') },
  { value: 1, label: uiStatic('الإثنين') },
  { value: 2, label: uiStatic('الثلاثاء') },
  { value: 3, label: uiStatic('الأربعاء') },
  { value: 4, label: uiStatic('الخميس') },
  { value: 5, label: uiStatic('الجمعة') },
];
const weekdayLabel = (weekday: number) => WEEKDAYS.find((d) => d.value === weekday)?.label ?? String(weekday);

const EMPTY_FORM: ShiftForm = {
  title: '',
  hdoorFromTime: '',
  hdoorToTime: '',
  hdoorKhasmFrom: '',
  ensrafFromTime: '',
  ensrafToTime: '',
  ensrafKhasmFrom: '',
  dayOverrides: [],
};

/** Backend may contain legacy "h:i A" values; normalize them before the 12-hour editor. */
function toInputTime(raw?: string): string {
  if (!raw) return '';
  const ampm = raw.trim().match(/^(\d{1,2}):(\d{2})\s*([AaPp][Mm])$/);
  if (ampm) {
    let h = parseInt(ampm[1], 10) % 12;
    if (/[Pp]/.test(ampm[3])) h += 12;
    return `${String(h).padStart(2, '0')}:${ampm[2]}`;
  }
  const hm = raw.trim().match(/^(\d{1,2}):(\d{2})/);
  return hm ? `${hm[1].padStart(2, '0')}:${hm[2]}` : '';
}

const TIME_FIELDS: { key: keyof ShiftTimes; label: string }[] = [
  { key: 'hdoorFromTime', label: uiStatic('بداية الحضور') },
  { key: 'hdoorToTime', label: uiStatic('نهاية الحضور') },
  { key: 'hdoorKhasmFrom', label: uiStatic('بداية الخصم (تأخير)') },
  { key: 'ensrafFromTime', label: uiStatic('بداية الانصراف') },
  { key: 'ensrafToTime', label: uiStatic('نهاية الانصراف') },
  { key: 'ensrafKhasmFrom', label: uiStatic('احتساب الإضافي') },
];

export function AttendanceSettingsPage() {
  const { ui } = useLocale();
  const { params, setParams } = useListQuery();
  const { data, isLoading, isError, refetch } = usePaginatedList<ShiftRow>('attendance/shifts', params);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<ShiftForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  /** Weekday whose different times are being edited in the dialog. */
  const [overrideDay, setOverrideDay] = useState<number | null>(null);
  const [activatingWeeklySchedule, setActivatingWeeklySchedule] = useState(false);
  const { data: weeklyScheduleRollout, refetch: refetchWeeklyScheduleRollout } = useQuery({
    queryKey: ['attendance', 'weekly-schedule-rollout'],
    queryFn: async () => (await api.get<{ enabled: boolean }>('/attendance/weekly-schedule-rollout')).data,
  });

  const deleteMutation = useMutationWithToast(
    (id: number) => api.delete(`/attendance/shifts/${id}`),
    { success: ui('تم حذف الوردية'), invalidate: ['attendance/shifts'] },
  );

  const openCreate = () => {
    setEditId(null);
    setForm(EMPTY_FORM);
    setOverrideDay(null);
    setDialogOpen(true);
  };

  const openEdit = (row: ShiftRow) => {
    setEditId(row.id);
    setForm({
      title: row.title ?? '',
      hdoorFromTime: toInputTime(row.hdoorFromTime),
      hdoorToTime: toInputTime(row.hdoorToTime),
      hdoorKhasmFrom: toInputTime(row.hdoorKhasmFrom),
      ensrafFromTime: toInputTime(row.ensrafFromTime),
      ensrafToTime: toInputTime(row.ensrafToTime),
      ensrafKhasmFrom: toInputTime(row.ensrafKhasmFrom),
      dayOverrides: (row.dayOverrides ?? []).map((o) => ({
        weekday: o.weekday,
        hdoorFromTime: toInputTime(o.hdoorFromTime),
        hdoorToTime: toInputTime(o.hdoorToTime),
        hdoorKhasmFrom: toInputTime(o.hdoorKhasmFrom),
        ensrafFromTime: toInputTime(o.ensrafFromTime),
        ensrafToTime: toInputTime(o.ensrafToTime),
        ensrafKhasmFrom: toInputTime(o.ensrafKhasmFrom),
      })),
    });
    setOverrideDay(row.dayOverrides?.[0]?.weekday ?? null);
    setDialogOpen(true);
  };

  const saveShift = async () => {
    const missing = TIME_FIELDS.find((f) => !form[f.key]);
    if (missing) {
      toast.error(`${missing.label} ${ui('حقل مطلوب')}`);
      return;
    }
    for (const o of form.dayOverrides) {
      const missingDay = TIME_FIELDS.find((f) => !o[f.key]);
      if (missingDay) {
        setOverrideDay(o.weekday);
        toast.error(`${weekdayLabel(o.weekday)}: ${missingDay.label} ${ui('حقل مطلوب')}`);
        return;
      }
    }
    setSaving(true);
    try {
      const payload = {
        title: form.title || undefined,
        hdoorFromTime: form.hdoorFromTime,
        hdoorToTime: form.hdoorToTime,
        hdoorKhasmFrom: form.hdoorKhasmFrom,
        ensrafFromTime: form.ensrafFromTime,
        ensrafToTime: form.ensrafToTime,
        ensrafKhasmFrom: form.ensrafKhasmFrom,
        // Always sent so removing the last day also clears it on the server.
        dayOverrides: form.dayOverrides,
      };
      if (editId != null) {
        await api.put(`/attendance/shifts/${editId}`, payload);
        toast.success(ui('تم تحديث الوردية'));
      } else {
        await api.post('/attendance/shifts', payload);
        toast.success(ui('تم إضافة الوردية'));
      }
      setDialogOpen(false);
      void refetch();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (row: ShiftRow) => {
    const ok = await confirm({
      title: ui('حذف الوردية؟'),
      description: row.title ? `${ui('هل تريد حذف «')}${row.title}${ui('»؟')}` : undefined,
      variant: 'destructive',
      confirmLabel: ui('حذف'),
    });
    if (ok) deleteMutation.mutate(row.id);
  };

  const activateWeeklySchedule = async () => {
    const ok = await confirm({
      title: ui('تفعيل جدول الدوام الأسبوعي؟'),
      description: ui('لن تعتمد البصمة بعد التفعيل إلا جدول الأسبوع المحدد لكل موظف. لا يمكن التفعيل قبل اكتمال جداول كل الموظفين.'),
      confirmLabel: ui('تفعيل'),
    });
    if (!ok) return;
    setActivatingWeeklySchedule(true);
    try {
      await api.post('/attendance/weekly-schedule-rollout/activate');
      toast.success(ui('تم تفعيل جدول الدوام الأسبوعي'));
      void refetchWeeklyScheduleRollout();
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setActivatingWeeklySchedule(false);
    }
  };

  /** Pick a weekday: adds it (pre-filled with the shift's own times) or opens it for editing. */
  const pickOverrideDay = (weekday: number) => {
    setForm((f) => {
      if (f.dayOverrides.some((o) => o.weekday === weekday)) return f;
      const { title: _title, dayOverrides, ...times } = f;
      return { ...f, dayOverrides: [...dayOverrides, { weekday, ...times }] };
    });
    setOverrideDay(weekday);
  };
  const removeOverrideDay = (weekday: number) => {
    setForm((f) => ({ ...f, dayOverrides: f.dayOverrides.filter((o) => o.weekday !== weekday) }));
    setOverrideDay(null);
  };
  const setOverrideTime = (weekday: number, key: keyof ShiftTimes, value: string) => {
    setForm((f) => ({
      ...f,
      dayOverrides: f.dayOverrides.map((o) => (o.weekday === weekday ? { ...o, [key]: value } : o)),
    }));
  };
  const editedOverride = form.dayOverrides.find((o) => o.weekday === overrideDay);

  const timeCell = (v?: string) => <span className="nums">{v ? formatTime(v) : '—'}</span>;

  const columns: ColumnDef<ShiftRow>[] = [
    { accessorKey: 'id', header: ui('م'), cell: ({ row }) => toArabicDigits((params.page - 1) * params.pageSize + row.index + 1) },
    {
      accessorKey: 'title',
      header: ui('الوردية'),
      cell: ({ row }) => (
        <div className="space-y-1">
          <span>{row.original.title ?? '—'}</span>
          {row.original.dayOverrides?.length ? (
            <p className="text-xs text-muted-foreground">
              {ui('مواعيد مختلفة:')}{' '}
              {row.original.dayOverrides
                .map((o) => `${weekdayLabel(o.weekday)} ${o.hdoorFromTime ? formatTime(o.hdoorFromTime) : ''}`.trim())
                .join('، ')}
            </p>
          ) : null}
          {row.original.warnings?.length ? (
            <ul className="space-y-0.5 text-xs text-destructive">
              {row.original.warnings.map((warning) => (
                <li key={warning} className="flex items-start gap-1">
                  <AlertTriangle className="mt-0.5 size-3 shrink-0" />
                  <span>{warning}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ),
    },
    { accessorKey: 'hdoorFromTime', header: ui('بداية الحضور'), cell: ({ getValue }) => timeCell(getValue() as string) },
    { accessorKey: 'hdoorToTime', header: ui('نهاية الحضور'), cell: ({ getValue }) => timeCell(getValue() as string) },
    { accessorKey: 'hdoorKhasmFrom', header: ui('بداية الخصم'), cell: ({ getValue }) => timeCell(getValue() as string) },
    { accessorKey: 'ensrafFromTime', header: ui('بداية الانصراف'), cell: ({ getValue }) => timeCell(getValue() as string) },
    { accessorKey: 'ensrafToTime', header: ui('نهاية الانصراف'), cell: ({ getValue }) => timeCell(getValue() as string) },
    { accessorKey: 'ensrafKhasmFrom', header: ui('احتساب الإضافي'), cell: ({ getValue }) => timeCell(getValue() as string) },
    {
      id: 'actions',
      header: ui('الإجراءات'),
      cell: ({ row }) => (
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" aria-label={ui('تعديل')} onClick={() => openEdit(row.original)}>
            <Pencil className="size-4" />
          </Button>
          <Button variant="ghost" size="icon" aria-label={ui('حذف')} onClick={() => void handleDelete(row.original)}>
            <Trash2 className="size-4 text-destructive" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={ui('إعدادات الدوام')}
        description={ui('الورديات')}
        actions={<div className="flex flex-wrap gap-2">
          {!weeklyScheduleRollout?.enabled && <Button variant="outline" size="sm" onClick={() => void activateWeeklySchedule()} disabled={activatingWeeklySchedule}>
            <Power className="size-4" /> {activatingWeeklySchedule ? ui('جارٍ التفعيل…') : ui('تفعيل جدول الأسبوع')}
          </Button>}
          <Button variant="brand" size="sm" onClick={openCreate}>
            <Plus className="size-4" /> {ui('وردية جديدة')}
          </Button>
        </div>}
      />

      <div className={`rounded-lg border px-4 py-3 text-sm ${weeklyScheduleRollout?.enabled ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200'}`}>
        {weeklyScheduleRollout?.enabled
          ? ui('جدول الدوام الأسبوعي مفعل: البصمة تعتمد جدول كل موظف، بينما التبديل والشيفت الإضافي يظلان استثناءات حسب التاريخ.')
          : ui('جدول الدوام الأسبوعي غير مفعل بعد. أكمل جدول الأيام السبعة لكل موظف أولاً، ثم فعّله من الزر أعلاه.')}
      </div>

      <FilterBar searchPlaceholder={ui('بحث في الورديات…')} />
      <DataTable
        columns={columns}
        data={data?.data ?? []}
        total={data?.total ?? 0}
        page={params.page}
        pageSize={params.pageSize}
        onPageChange={(p) => setParams({ page: p })}
        onPageSizeChange={(s) => setParams({ pageSize: s, page: 1 })}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => void refetch()}
        search={params.search}
        onSearchChange={(s) => setParams({ search: s, page: 1 })}
        emptyTitle={ui('لا توجد ورديات')}
      />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>{editId != null ? ui('تعديل الوردية') : ui('وردية جديدة')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{ui('اسم الوردية')}</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder={ui('الدوام الصباحي')}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {TIME_FIELDS.map((f) => (
                <div key={f.key} className="space-y-2">
                  <Label>
                    {f.label}
                    <span className="text-destructive"> *</span>
                  </Label>
                  <Time12Input value={form[f.key]} onValueChange={(value) => setForm((prev) => ({ ...prev, [f.key]: value }))} />
                </div>
              ))}
            </div>
            <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
              <div>
                <Label>{ui('مواعيد مختلفة لأيام معينة')}</Label>
                <p className="mt-1 text-xs text-muted-foreground">
                  {ui('مثلاً لو الفرع بيفتح الجمعة الساعة ١٠: اختار الجمعة وعدّل مواعيدها. التأخير والانصراف المبكر والإضافي في اليوم ده بيتحسبوا من مواعيده هو.')}
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {WEEKDAYS.map((day) => {
                  const has = form.dayOverrides.some((o) => o.weekday === day.value);
                  return (
                    <Button
                      key={day.value}
                      type="button"
                      size="sm"
                      variant={overrideDay === day.value ? 'brand' : has ? 'secondary' : 'outline'}
                      onClick={() => pickOverrideDay(day.value)}
                    >
                      {day.label}
                      {has ? ' •' : ''}
                    </Button>
                  );
                })}
              </div>
              {editedOverride ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{`${ui('مواعيد يوم')} ${weekdayLabel(editedOverride.weekday)}`}</span>
                    <Button type="button" variant="ghost" size="sm" onClick={() => removeOverrideDay(editedOverride.weekday)}>
                      <Trash2 className="size-4 text-destructive" /> {ui('رجّعه للمواعيد العادية')}
                    </Button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {TIME_FIELDS.map((f) => (
                      <div key={f.key} className="space-y-1.5">
                        <Label className="text-xs">{f.label}</Label>
                        <Time12Input
                          value={editedOverride[f.key]}
                          onValueChange={(value) => setOverrideTime(editedOverride.weekday, f.key, value)}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">{ui('كل الأيام ماشية على مواعيد الوردية العادية.')}</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              {ui('إلغاء')}
            </Button>
            <Button variant="brand" onClick={() => void saveShift()} disabled={saving}>
              {saving ? ui('جارٍ الحفظ…') : ui('حفظ')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
