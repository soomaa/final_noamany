import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Combobox } from '@/components/common/combobox';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useEmployeeOptions } from '@/hooks/use-employee-options';
import { api, apiError } from '@/lib/api';
import { cn, toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';

/** Mirrors backend/src/modules/termination/exit-types.ts. */
export const EXIT_TYPES = [
  'resignation',
  'resignation_short_notice',
  'abandonment',
  'termination',
  'contract_end',
  'other',
] as const;
export type ExitType = (typeof EXIT_TYPES)[number];

export const EXIT_TYPE_LABELS: Record<ExitType, string> = {
  resignation: 'استقالة بإخطار',
  resignation_short_notice: 'استقالة بدون إخطار كافٍ',
  abandonment: 'ترك العمل / إخلال طرف',
  termination: 'إنهاء خدمة من الشركة',
  contract_end: 'انتهاء عقد',
  other: 'أخرى',
};

const EMPLOYEE_INITIATED: readonly ExitType[] = ['resignation', 'resignation_short_notice', 'abandonment', 'other'];
const DEFAULT_NOTICE_DAYS = 30;

export interface EmployeeExit {
  id: number;
  empId: number;
  employeeName: string;
  exitType: ExitType;
  exitTypeLabel: string;
  noticeGivenDate: string | null;
  lastWorkingDate: string;
  requiredNoticeDays: number;
  noticeDaysGiven: number | null;
  noticeShortfallDays: number;
  reason: string | null;
  notes: string | null;
  settlementNotes: string | null;
  recordedBy: number | null;
  recordedByName: string | null;
  recordedAt: string | null;
}

function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** Same rule as the backend: required − days served (no notice = whole period); company exits owe none. */
export function computeShortfall(type: ExitType, noticeDate: string, lastDate: string, required: number) {
  if (!lastDate || !EMPLOYEE_INITIATED.includes(type)) return 0;
  const given = noticeDate ? Math.max(0, daysBetween(noticeDate, lastDate)) : 0;
  return Math.max(0, required - given);
}

const BADGE_TONE: Record<ExitType, string> = {
  resignation: 'bg-success/15 text-success',
  resignation_short_notice: 'bg-warning/15 text-warning',
  abandonment: 'bg-destructive/15 text-destructive',
  termination: 'bg-destructive/10 text-destructive',
  contract_end: 'bg-muted text-muted-foreground',
  other: 'bg-muted text-muted-foreground',
};

export function ExitTypeBadge({ type, label }: { type: ExitType; label?: string }) {
  const { ui } = useLocale();
  return (
    <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', BADGE_TONE[type] ?? BADGE_TONE.other)}>
      {label ?? ui(EXIT_TYPE_LABELS[type] ?? EXIT_TYPE_LABELS.other)}
    </span>
  );
}

const todayIso = () => new Date().toISOString().slice(0, 10);

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fixed employee (from the employees list); otherwise the dialog shows an employee picker. */
  employee?: { id: number; name: string } | null;
  onSaved?: () => void;
}

/**
 * Records an employee exit (structured type + notice). Also marks the employee as left
 * (leave_emp / end_service_date_m) on the server.
 */
export function EmployeeExitDialog({ open, onOpenChange, employee, onSaved }: Props) {
  const { ui } = useLocale();
  const qc = useQueryClient();
  const { data: empOptions = [] } = useEmployeeOptions(open && !employee);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    empId: '',
    exitType: 'resignation' as ExitType,
    noticeGivenDate: '',
    lastWorkingDate: todayIso(),
    requiredNoticeDays: String(DEFAULT_NOTICE_DAYS),
    reason: '',
    notes: '',
    settlementNotes: '',
  });

  useEffect(() => {
    if (!open) return;
    setForm({
      empId: employee ? String(employee.id) : '',
      exitType: 'resignation',
      noticeGivenDate: '',
      lastWorkingDate: todayIso(),
      requiredNoticeDays: String(DEFAULT_NOTICE_DAYS),
      reason: '',
      notes: '',
      settlementNotes: '',
    });
    // Server default notice period (HR_REQUIRED_NOTICE_DAYS); keep 30 if unreachable.
    api
      .get<{ requiredNoticeDays: number }>('/termination/exits/meta')
      .then(({ data }) => setForm((f) => ({ ...f, requiredNoticeDays: String(data.requiredNoticeDays) })))
      .catch(() => undefined);
  }, [open, employee]);

  const required = Math.max(0, parseInt(form.requiredNoticeDays, 10) || 0);
  const shortfall = useMemo(
    () => computeShortfall(form.exitType, form.noticeGivenDate, form.lastWorkingDate, required),
    [form.exitType, form.noticeGivenDate, form.lastWorkingDate, required],
  );
  const noticeAfterLast = !!form.noticeGivenDate && !!form.lastWorkingDate && form.noticeGivenDate > form.lastWorkingDate;
  const resignationWithoutNotice = form.exitType === 'resignation' && shortfall > 0;
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  const save = async () => {
    if (!form.empId || !form.lastWorkingDate) {
      toast.error(ui('يرجى تعبئة جميع الحقول المطلوبة'));
      return;
    }
    if (noticeAfterLast) {
      toast.error(ui('تاريخ الإخطار لا يمكن أن يكون بعد آخر يوم عمل'));
      return;
    }
    setSaving(true);
    try {
      const { data } = await api.post<{ warning?: string | null }>('/termination/exits', {
        empId: parseInt(form.empId, 10),
        exitType: form.exitType,
        noticeGivenDate: form.noticeGivenDate || null,
        lastWorkingDate: form.lastWorkingDate,
        requiredNoticeDays: required,
        reason: form.reason.trim() || undefined,
        notes: form.notes.trim() || undefined,
        settlementNotes: form.settlementNotes.trim() || undefined,
      });
      toast.success(ui('تم تسجيل انتهاء خدمة الموظف'));
      if (data?.warning) toast.warning(data.warning);
      ['employees', 'termination/exits', 'termination/archive'].forEach((k) => void qc.invalidateQueries({ queryKey: [k] }));
      onOpenChange(false);
      onSaved?.();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined} className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {ui('تسجيل انتهاء خدمة')}
            {employee ? ` — ${employee.name}` : ''}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {!employee && (
            <div>
              <Label>{ui('الموظف')}</Label>
              <div className="mt-1.5">
                <Combobox
                  value={form.empId}
                  onValueChange={(empId) => set({ empId })}
                  options={empOptions}
                  placeholder={ui('اختر الموظف…')}
                  searchPlaceholder={ui('بحث في الموظفين…')}
                />
              </div>
            </div>
          )}

          <div>
            <Label>{ui('نوع انتهاء الخدمة')}</Label>
            <Select value={form.exitType} onValueChange={(v) => set({ exitType: v as ExitType })}>
              <SelectTrigger className="mt-1.5 h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXIT_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {ui(EXIT_TYPE_LABELS[t])}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="exit-notice">{ui('تاريخ تقديم الإخطار')}</Label>
              <Input id="exit-notice" type="date" className="mt-1.5" value={form.noticeGivenDate} onChange={(e) => set({ noticeGivenDate: e.target.value })} />
              <p className="mt-1 text-xs text-muted-foreground">{ui('اتركه فارغًا لو الموظف ما قدّمش إخطار')}</p>
            </div>
            <div>
              <Label htmlFor="exit-last">{ui('آخر يوم عمل')}</Label>
              <Input id="exit-last" type="date" className="mt-1.5" value={form.lastWorkingDate} onChange={(e) => set({ lastWorkingDate: e.target.value })} />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="exit-required">{ui('مدة الإخطار المطلوبة (يوم)')}</Label>
              <Input id="exit-required" type="number" min={0} max={365} className="mt-1.5" value={form.requiredNoticeDays} onChange={(e) => set({ requiredNoticeDays: e.target.value })} />
            </div>
            <div>
              <Label>{ui('أيام الإخطار الناقصة')}</Label>
              <div className={cn('mt-1.5 flex h-10 items-center rounded-md border px-3 font-semibold nums', shortfall > 0 ? 'border-destructive/40 text-destructive' : 'text-success')}>
                {toArabicDigits(shortfall)} {ui('يوم')}
              </div>
            </div>
          </div>

          {noticeAfterLast && (
            <p className="text-sm text-destructive">{ui('تاريخ الإخطار لا يمكن أن يكون بعد آخر يوم عمل')}</p>
          )}

          {resignationWithoutNotice && (
            <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
              <div className="space-y-2">
                <p className="font-medium">
                  {ui('الموظف ما أداش إخطار شهر — هيتسجل ترك عمل / إخلال طرف')}
                </p>
                <Button size="sm" variant="outline" onClick={() => set({ exitType: 'abandonment' })}>
                  {ui('تسجيلها ترك العمل / إخلال طرف')}
                </Button>
              </div>
            </div>
          )}

          <div>
            <Label htmlFor="exit-reason">{ui('السبب')}</Label>
            <Input id="exit-reason" className="mt-1.5" maxLength={500} value={form.reason} onChange={(e) => set({ reason: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="exit-settlement">{ui('ملاحظات التسوية')}</Label>
            <Textarea
              id="exit-settlement"
              className="mt-1.5"
              rows={2}
              placeholder={ui('مثال: خصم مقابل مدة الإخطار الناقصة حسب اللائحة')}
              value={form.settlementNotes}
              onChange={(e) => set({ settlementNotes: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="exit-notes">{ui('ملاحظات')}</Label>
            <Textarea id="exit-notes" className="mt-1.5" rows={2} value={form.notes} onChange={(e) => set({ notes: e.target.value })} />
          </div>
          <p className="text-xs text-muted-foreground">{ui('بعد الحفظ هيتسجل الموظف كمنتهي الخدمة ويختفي من قائمة الموظفين النشطين.')}</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{ui('إلغاء')}</Button>
          <Button variant="destructive" disabled={saving} onClick={() => void save()}>{ui('تسجيل انتهاء الخدمة')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
