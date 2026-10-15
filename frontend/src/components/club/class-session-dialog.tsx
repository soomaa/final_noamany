import { formatDisplayNumber } from '@/lib/number-display';
import { CalendarClock, Check, MapPin, UserCheck, Users, X } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { StatusBadge } from '@/components/common/status-badge';
import { Time12Input } from '@/components/common/time-12-input';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api, apiError } from '@/lib/api';
import { formatTime } from '@/lib/formatters';
import { confirm } from '@/lib/confirm';
import { usePermission } from '@/hooks/use-permission';
import type { ClassAudience, ClubClassDetail, ClubHallRow, ClubTrainerRow } from '@/types/fitness';
import { uiStatic } from '@/lib/ui-static';
import { CLASS_AUDIENCE_OPTIONS, classAudienceLabel } from '@/lib/class-audience';

const SELECT_CLS = 'h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring';

export function ClassSessionDialog({
  sessionId,
  open,
  onOpenChange,
  trainers,
  halls,
  permissionResource,
}: {
  sessionId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trainers: ClubTrainerRow[];
  halls: ClubHallRow[];
  permissionResource: string;
}) {
  const qc = useQueryClient();
  const { can } = usePermission();
  const canUpdate = can(`${permissionResource}:update`);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    trainerId: '',
    hallId: '',
    classDate: '',
    startTime: '',
    endTime: '',
    maxCapacity: '',
    audience: 'mixed' as ClassAudience,
  });
  const { data: session, refetch } = useQuery({
    queryKey: ['club-class-session', sessionId],
    enabled: open && sessionId != null,
    queryFn: async () => (await api.get<ClubClassDetail>(`/club-classes/${sessionId}`)).data,
  });

  useEffect(() => {
    if (!session) return;
    setForm({
      trainerId: String(session.trainerId),
      hallId: session.hallId ? String(session.hallId) : '',
      classDate: session.classDate,
      startTime: session.startTime,
      endTime: session.endTime,
      maxCapacity: String(session.maxCapacity),
      audience: session.audience ?? 'mixed',
    });
  }, [session]);

  const refresh = async () => {
    await refetch();
    await qc.invalidateQueries({ queryKey: ['club-calendar'] });
    await qc.invalidateQueries({ queryKey: ['club-classes'] });
  };

  const save = async () => {
    if (!canUpdate || !sessionId) return;
    setSaving(true);
    try {
      await api.put(`/club-classes/${sessionId}`, {
        trainerId: Number(form.trainerId),
        hallId: form.hallId ? Number(form.hallId) : null,
        classDate: form.classDate,
        startTime: form.startTime,
        endTime: form.endTime,
        maxCapacity: Number(form.maxCapacity),
        audience: form.audience,
      });
      toast.success(uiStatic('تم تحديث الحصة'));
      setEditing(false);
      await refresh();
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setSaving(false);
    }
  };

  const cancelSession = async () => {
    if (!canUpdate || !sessionId || !(await confirm({ title: uiStatic('إلغاء هذه الحصة فقط؟'), description: uiStatic('لن يتأثر الجدول الأسبوعي الافتراضي.'), variant: 'destructive' }))) return;
    try {
      await api.put(`/club-classes/${sessionId}`, { status: 'cancelled', cancelledReason: uiStatic('تم الإلغاء من شاشة إدارة الحصص') });
      toast.success(uiStatic('تم إلغاء الحصة'));
      await refresh();
    } catch (error) {
      toast.error(apiError(error));
    }
  };

  const attendance = async (memberId: number, status: 'attended' | 'absent') => {
    if (!canUpdate || !sessionId) return;
    try {
      await api.patch(`/club-classes/${sessionId}/attendance/${memberId}`, {
        attendanceStatus: status,
        attendanceTime: status === 'attended' ? new Date().toTimeString().slice(0, 5) : null,
      });
      await refresh();
    } catch (error) {
      toast.error(apiError(error));
    }
  };

  const attendanceRecords = session?.enrollments?.filter((item) => item.attendanceStatus !== 'cancelled') ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl" className="max-h-[92vh] overflow-y-auto" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="size-3 rounded-full" style={{ backgroundColor: session?.classType?.color ?? '#2563EB' }} />
            {session?.className ?? uiStatic('تفاصيل الحصة')}
          </DialogTitle>
        </DialogHeader>

        {session ? (
          <div className="space-y-5">
            <div className="grid gap-3 rounded-xl border bg-muted/20 p-4 sm:grid-cols-2 lg:grid-cols-5">
              <div><p className="text-xs text-muted-foreground">{uiStatic('التاريخ والوقت')}</p><p className="mt-1 flex items-center gap-1 text-sm font-medium"><CalendarClock className="size-4" />{session.classDate} · {formatTime(session.startTime)}–{formatTime(session.endTime)}</p></div>
              <div><p className="text-xs text-muted-foreground">{uiStatic('المدرب')}</p><p className="mt-1 flex items-center gap-1 text-sm font-medium"><UserCheck className="size-4" />{session.trainer?.name ?? '—'}</p></div>
              <div><p className="text-xs text-muted-foreground">{uiStatic('القاعة')}</p><p className="mt-1 flex items-center gap-1 text-sm font-medium"><MapPin className="size-4" />{session.hall?.name ?? '—'}</p></div>
              <div><p className="text-xs text-muted-foreground">{uiStatic('الحضور / السعة')}</p><p className="mt-1 flex items-center gap-1 text-sm font-medium"><Users className="size-4" />{formatDisplayNumber(attendanceRecords.filter((item) => item.attendanceStatus === 'attended').length)} / {formatDisplayNumber(session.maxCapacity)}</p></div>
              <div><p className="text-xs text-muted-foreground">{uiStatic('الفئة')}</p><p className="mt-1 text-sm font-medium">{uiStatic(classAudienceLabel(session.audience))}</p></div>
            </div>

            {canUpdate && editing ? (
              <div className="grid gap-3 rounded-xl border p-4 sm:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-2"><Label>{uiStatic('المدرب')}</Label><select className={SELECT_CLS} value={form.trainerId} onChange={(e) => setForm((f) => ({ ...f, trainerId: e.target.value }))}>{trainers.map((trainer) => <option key={trainer.id} value={trainer.id}>{trainer.name}</option>)}</select></div>
                <div className="space-y-2"><Label>{uiStatic('القاعة')}</Label><select className={SELECT_CLS} value={form.hallId} onChange={(e) => setForm((f) => ({ ...f, hallId: e.target.value }))}><option value="">{uiStatic('بدون قاعة')}</option>{halls.filter((hall) => hall.branchId === session.branchId).map((hall) => <option key={hall.id} value={hall.id}>{hall.name}</option>)}</select></div>
                <div className="space-y-2"><Label>{uiStatic('التاريخ')}</Label><Input type="date" className="nums" value={form.classDate} onChange={(e) => setForm((f) => ({ ...f, classDate: e.target.value }))} /></div>
                <div className="space-y-2"><Label>{uiStatic('من')}</Label><Time12Input value={form.startTime} onValueChange={(value) => setForm((f) => ({ ...f, startTime: value }))} /></div>
                <div className="space-y-2"><Label>{uiStatic('إلى')}</Label><Time12Input value={form.endTime} onValueChange={(value) => setForm((f) => ({ ...f, endTime: value }))} /></div>
                <div className="space-y-2"><Label>{uiStatic('السعة')}</Label><Input type="number" min={1} className="nums" value={form.maxCapacity} onChange={(e) => setForm((f) => ({ ...f, maxCapacity: e.target.value }))} /></div>
                <div className="space-y-2"><Label>{uiStatic('الفئة')}</Label><select className={SELECT_CLS} value={form.audience} onChange={(e) => setForm((f) => ({ ...f, audience: e.target.value as ClassAudience }))}>{CLASS_AUDIENCE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{uiStatic(option.label)}</option>)}</select></div>
                <div className="flex gap-2 sm:col-span-2 lg:col-span-3"><Button onClick={() => void save()} disabled={saving}>{uiStatic('حفظ التعديلات')}</Button><Button variant="outline" onClick={() => setEditing(false)}>{uiStatic('إلغاء')}</Button></div>
              </div>
            ) : null}

            <section className="overflow-hidden rounded-xl border">
              <div className="flex items-center justify-between border-b bg-muted/30 px-4 py-3"><div><p className="font-medium">{uiStatic('سجل حضور الحصة')}</p><p className="text-xs text-muted-foreground">{uiStatic('يُضاف تلقائيًا عند تسجيل دخول العضو من الاستقبال في موعد الكلاس.')}</p></div><span className="text-sm text-muted-foreground">{formatDisplayNumber(attendanceRecords.length)} سجل</span></div>
              <div className="divide-y">
                {attendanceRecords.map((record) => (
                  <div key={record.id} className="grid items-center gap-3 px-4 py-3 sm:grid-cols-[1fr_auto_auto]">
                    <div><p className="font-medium">{record.memberName ?? `${uiStatic('عضو #')}${record.memberId}`}</p><p className="text-xs text-muted-foreground">{record.memberCode ?? '—'} · {record.bookingSource === 'reception_auto' ? uiStatic('تسجيل تلقائي من الاستقبال') : uiStatic('سجل سابق')}</p></div>
                    <StatusBadge status={record.attendanceStatus === 'attended' ? 'active' : record.attendanceStatus === 'absent' ? 'absent' : 'pending'} label={record.attendanceStatus === 'attended' ? uiStatic('حضر') : record.attendanceStatus === 'absent' ? uiStatic('لم يحضر') : uiStatic('بانتظار الحضور')} />
                    {canUpdate ? <div className="flex gap-1">
                      <Button variant="ghost" size="sm" title={uiStatic('حضر')} onClick={() => void attendance(record.memberId, 'attended')}><Check className="size-4 text-emerald-600" /></Button>
                      <Button variant="ghost" size="sm" title={uiStatic('لم يحضر')} onClick={() => void attendance(record.memberId, 'absent')}><X className="size-4 text-amber-600" /></Button>
                    </div> : null}
                  </div>
                ))}
                {!attendanceRecords.length ? <p className="px-4 py-8 text-center text-sm text-muted-foreground">{uiStatic('لم يُسجل حضور أي عضو لهذه الحصة بعد.')}</p> : null}
              </div>
            </section>
          </div>
        ) : <p className="py-10 text-center text-muted-foreground">{uiStatic('جارٍ تحميل تفاصيل الحصة...')}</p>}

        <DialogFooter className="justify-between sm:justify-between">
          {canUpdate ? <Button permissionAction="update" variant="destructive" disabled={!session || session.status === 'cancelled'} onClick={() => void cancelSession()}>{uiStatic('إلغاء الحصة')}</Button> : <span />}
          <div className="flex gap-2"><Button variant="outline" onClick={() => onOpenChange(false)}>{uiStatic('إغلاق')}</Button>{canUpdate ? <Button permissionAction="update" variant="outline" onClick={() => setEditing((value) => !value)}>{uiStatic('تعديل / إعادة جدولة')}</Button> : null}</div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
