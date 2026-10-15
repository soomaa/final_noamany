import { CalendarClock, Plus, Save, Trash2, UserCheck } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Time12Input } from '@/components/common/time-12-input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useBranches } from '@/hooks/use-branches';
import { usePermission } from '@/hooks/use-permission';
import { api, apiError } from '@/lib/api';
import type { ClassAudience, ClubHallRow, ClubTrainerRow, ClubTrainerScheduleSlot } from '@/types/fitness';
import { CLASS_AUDIENCE_OPTIONS } from '@/lib/class-audience';
import { useLocale } from '@/store/locale';
import { uiStatic } from '@/lib/ui-static';

const SELECT_CLS = 'h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring';
const WEEKDAYS = [uiStatic('الأحد'), uiStatic('الاثنين'), uiStatic('الثلاثاء'), uiStatic('الأربعاء'), uiStatic('الخميس'), uiStatic('الجمعة'), uiStatic('السبت')];
type EditableSlot = Omit<ClubTrainerScheduleSlot, 'id' | 'trainerId' | 'hall'>;

export function TrainerSchedulesPanel() {
  const { ui } = useLocale();
  const qc = useQueryClient();
  const { can } = usePermission();
  const canUpdate = can('club.subscriptions.special:update') || can('club.fitness.trainer_settings:update');
  const { data: branches } = useBranches();
  const { data: trainers, isLoading: trainersLoading } = useQuery({
    queryKey: ['club-trainers', 'default-schedules'],
    queryFn: async () => (await api.get<{ data: ClubTrainerRow[] }>('/club-trainers', { params: { page: 1, pageSize: 200, isActive: true } })).data.data,
  });
  const { data: halls } = useQuery({
    queryKey: ['club-halls', 'trainer-schedules'],
    queryFn: async () => (await api.get<{ data: ClubHallRow[] }>('/club-halls', { params: { page: 1, pageSize: 200 } })).data.data,
  });
  const [trainerId, setTrainerId] = useState<number | null>(null);
  const [slots, setSlots] = useState<EditableSlot[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!trainerId && trainers?.[0]) setTrainerId(trainers[0].id);
  }, [trainerId, trainers]);

  const { data: schedule, isLoading } = useQuery({
    queryKey: ['club-trainer-default-schedule', trainerId],
    queryFn: async () => (await api.get<ClubTrainerScheduleSlot[]>(`/club-trainers/${trainerId}/default-schedule`)).data,
    enabled: trainerId != null,
  });

  useEffect(() => {
    if (!schedule) return;
    setSlots(schedule.map((slot) => ({
      weekday: slot.weekday,
      startTime: slot.startTime,
      endTime: slot.endTime,
      branchId: slot.branchId,
      hallId: slot.hallId,
      maxCapacity: slot.maxCapacity,
      audience: slot.audience ?? 'mixed',
    })));
  }, [schedule]);

  const addSlot = () => {
    if (!canUpdate) return;
    setSlots((current) => [...current, {
    weekday: 1,
    startTime: '17:00',
    endTime: '18:00',
    branchId: branches?.[0]?.id ?? 0,
    hallId: null,
    maxCapacity: 10,
    audience: 'mixed',
    }]);
  };
  const patchSlot = (index: number, patch: Partial<EditableSlot>) => {
    if (!canUpdate) return;
    setSlots((current) => current.map((slot, slotIndex) => slotIndex === index ? { ...slot, ...patch } : slot));
  };

  const save = async () => {
    if (!canUpdate || !trainerId) return;
    if (slots.some((slot) => !slot.branchId || !slot.startTime || !slot.endTime)) {
      toast.error(ui('أكمل بيانات كل موعد في جدول المدرب'));
      return;
    }
    setSaving(true);
    try {
      await api.put(`/club-trainers/${trainerId}/default-schedule`, { slots });
      toast.success(ui('تم حفظ الجدول الافتراضي للمدرب'));
      await qc.invalidateQueries({ queryKey: ['club-trainer-default-schedule', trainerId] });
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setSaving(false);
    }
  };

  const selectedTrainer = trainers?.find((trainer) => trainer.id === trainerId);

  return (
    <div className="grid gap-5 pt-4 lg:grid-cols-[280px_1fr]">
      <Card className="h-fit"><CardContent className="p-3"><div className="mb-3 flex items-center gap-2 px-2 py-1"><UserCheck className="size-4 text-primary" /><div><p className="font-semibold">{ui('المدربون')}</p><p className="text-xs text-muted-foreground">{ui('اختر مدربًا لتعديل جدوله')}</p></div></div><div className="space-y-1">{(trainers ?? []).map((trainer) => <button key={trainer.id} type="button" onClick={() => setTrainerId(trainer.id)} className={`w-full rounded-lg border px-3 py-3 text-start transition ${trainerId === trainer.id ? 'border-primary bg-primary/5 text-primary' : 'border-transparent hover:bg-muted/50'}`}><b className="block text-sm">{trainer.name}</b>{trainer.specialization ? <span className="text-xs text-muted-foreground">{trainer.specialization}</span> : null}</button>)}{trainersLoading ? <p className="py-5 text-center text-sm text-muted-foreground">{ui('جارٍ التحميل...')}</p> : null}{!trainersLoading && !(trainers ?? []).length ? <p className="py-8 text-center text-sm text-muted-foreground">{ui('لا يوجد مدربون.')}</p> : null}</div></CardContent></Card>

      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/20 p-4"><div className="flex items-center gap-2"><CalendarClock className="size-5 text-primary" /><div><p className="font-semibold">الجدول الافتراضي — {selectedTrainer?.name ?? ui('اختر مدربًا')}</p><p className="text-sm text-muted-foreground">{ui('هذا الجدول يخص المدرب، ويظهر تلقائيًا داخل جداول كل الحصص المرتبط بها.')}</p></div></div>{canUpdate ? <div className="flex gap-2"><Button permissionAction="update" variant="outline" onClick={addSlot} disabled={!trainerId}><Plus className="size-4" /> {ui('إضافة موعد')}</Button><Button permissionAction="update" variant="brand" onClick={() => void save()} disabled={!trainerId || saving}><Save className="size-4" /> {ui('حفظ الجدول')}</Button></div> : null}</div>
        <div className="space-y-3">
          {isLoading ? <p className="py-8 text-center text-sm text-muted-foreground">{ui('جارٍ تحميل الجدول...')}</p> : null}
          {slots.map((slot, index) => <div key={`${trainerId}-${index}`} className="grid gap-3 rounded-xl border bg-card p-4 shadow-sm md:grid-cols-[130px_110px_110px_110px_1fr_1fr_100px_42px]">
            <div className="space-y-1"><Label className="text-xs">{ui('اليوم')}</Label><select className={SELECT_CLS} value={slot.weekday} onChange={(event) => patchSlot(index, { weekday: Number(event.target.value) })}>{WEEKDAYS.map((day, dayIndex) => <option key={day} value={dayIndex}>{day}</option>)}</select></div>
            <div className="space-y-1"><Label className="text-xs">{ui('البداية')}</Label><Time12Input value={slot.startTime} onValueChange={(value) => patchSlot(index, { startTime: value })} /></div>
            <div className="space-y-1"><Label className="text-xs">{ui('النهاية')}</Label><Time12Input value={slot.endTime} onValueChange={(value) => patchSlot(index, { endTime: value })} /></div>
            <div className="space-y-1"><Label className="text-xs">{ui('الفئة')}</Label><select className={SELECT_CLS} value={slot.audience ?? 'mixed'} onChange={(event) => patchSlot(index, { audience: event.target.value as ClassAudience })}>{CLASS_AUDIENCE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{ui(option.label)}</option>)}</select></div>
            <div className="space-y-1"><Label className="text-xs">{ui('الفرع')}</Label><select className={SELECT_CLS} value={slot.branchId} onChange={(event) => patchSlot(index, { branchId: Number(event.target.value), hallId: null })}><option value={0}>{ui('اختر')}</option>{(branches ?? []).map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></div>
            <div className="space-y-1"><Label className="text-xs">{ui('القاعة')}</Label><select className={SELECT_CLS} value={slot.hallId ?? ''} onChange={(event) => patchSlot(index, { hallId: event.target.value ? Number(event.target.value) : null })}><option value="">{ui('بدون قاعة')}</option>{(halls ?? []).filter((hall) => !slot.branchId || hall.branchId === slot.branchId).map((hall) => <option key={hall.id} value={hall.id}>{hall.name}</option>)}</select></div>
            <div className="space-y-1"><Label className="text-xs">{ui('السعة')}</Label><Input type="number" min={1} className="nums" value={slot.maxCapacity} onChange={(event) => patchSlot(index, { maxCapacity: Number(event.target.value) })} /></div>
            <div className="flex items-end">{canUpdate ? <Button permissionAction="update" variant="ghost" size="icon" className="text-destructive" onClick={() => setSlots((current) => current.filter((_, slotIndex) => slotIndex !== index))}><Trash2 className="size-4" /></Button> : null}</div>
          </div>)}
          {!isLoading && trainerId && !slots.length ? <div className="rounded-xl border border-dashed py-12 text-center"><CalendarClock className="mx-auto mb-3 size-8 text-muted-foreground" /><p className="text-sm text-muted-foreground">{ui('لا يوجد جدول افتراضي لهذا المدرب. أضف أول موعد.')}</p></div> : null}
        </div>
      </div>
    </div>
  );
}
