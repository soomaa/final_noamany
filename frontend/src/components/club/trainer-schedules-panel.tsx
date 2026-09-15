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
import { api, apiError } from '@/lib/api';
import type { ClubHallRow, ClubTrainerRow, ClubTrainerScheduleSlot } from '@/types/fitness';

const SELECT_CLS = 'h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring';
const WEEKDAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
type EditableSlot = Omit<ClubTrainerScheduleSlot, 'id' | 'trainerId' | 'hall'>;

export function TrainerSchedulesPanel() {
  const qc = useQueryClient();
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
    })));
  }, [schedule]);

  const addSlot = () => setSlots((current) => [...current, {
    weekday: 1,
    startTime: '17:00',
    endTime: '18:00',
    branchId: branches?.[0]?.id ?? 0,
    hallId: null,
    maxCapacity: 10,
  }]);
  const patchSlot = (index: number, patch: Partial<EditableSlot>) => setSlots((current) => current.map((slot, slotIndex) => slotIndex === index ? { ...slot, ...patch } : slot));

  const save = async () => {
    if (!trainerId) return;
    if (slots.some((slot) => !slot.branchId || !slot.startTime || !slot.endTime)) {
      toast.error('أكمل بيانات كل موعد في جدول المدرب');
      return;
    }
    setSaving(true);
    try {
      await api.put(`/club-trainers/${trainerId}/default-schedule`, { slots });
      toast.success('تم حفظ الجدول الافتراضي للمدرب');
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
      <Card className="h-fit"><CardContent className="p-3"><div className="mb-3 flex items-center gap-2 px-2 py-1"><UserCheck className="size-4 text-primary" /><div><p className="font-semibold">المدربون</p><p className="text-xs text-muted-foreground">اختر مدربًا لتعديل جدوله</p></div></div><div className="space-y-1">{(trainers ?? []).map((trainer) => <button key={trainer.id} type="button" onClick={() => setTrainerId(trainer.id)} className={`w-full rounded-lg border px-3 py-3 text-start transition ${trainerId === trainer.id ? 'border-primary bg-primary/5 text-primary' : 'border-transparent hover:bg-muted/50'}`}><b className="block text-sm">{trainer.name}</b>{trainer.specialization ? <span className="text-xs text-muted-foreground">{trainer.specialization}</span> : null}</button>)}{trainersLoading ? <p className="py-5 text-center text-sm text-muted-foreground">جارٍ التحميل...</p> : null}{!trainersLoading && !(trainers ?? []).length ? <p className="py-8 text-center text-sm text-muted-foreground">لا يوجد مدربون.</p> : null}</div></CardContent></Card>

      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/20 p-4"><div className="flex items-center gap-2"><CalendarClock className="size-5 text-primary" /><div><p className="font-semibold">الجدول الافتراضي — {selectedTrainer?.name ?? 'اختر مدربًا'}</p><p className="text-sm text-muted-foreground">هذا الجدول يخص المدرب، ويظهر تلقائيًا داخل جداول كل الحصص المرتبط بها.</p></div></div><div className="flex gap-2"><Button variant="outline" onClick={addSlot} disabled={!trainerId}><Plus className="size-4" /> إضافة موعد</Button><Button variant="brand" onClick={() => void save()} disabled={!trainerId || saving}><Save className="size-4" /> حفظ الجدول</Button></div></div>
        <div className="space-y-3">
          {isLoading ? <p className="py-8 text-center text-sm text-muted-foreground">جارٍ تحميل الجدول...</p> : null}
          {slots.map((slot, index) => <div key={`${trainerId}-${index}`} className="grid gap-3 rounded-xl border bg-card p-4 shadow-sm md:grid-cols-[130px_110px_110px_1fr_1fr_100px_42px]">
            <div className="space-y-1"><Label className="text-xs">اليوم</Label><select className={SELECT_CLS} value={slot.weekday} onChange={(event) => patchSlot(index, { weekday: Number(event.target.value) })}>{WEEKDAYS.map((day, dayIndex) => <option key={day} value={dayIndex}>{day}</option>)}</select></div>
            <div className="space-y-1"><Label className="text-xs">البداية</Label><Time12Input value={slot.startTime} onValueChange={(value) => patchSlot(index, { startTime: value })} /></div>
            <div className="space-y-1"><Label className="text-xs">النهاية</Label><Time12Input value={slot.endTime} onValueChange={(value) => patchSlot(index, { endTime: value })} /></div>
            <div className="space-y-1"><Label className="text-xs">الفرع</Label><select className={SELECT_CLS} value={slot.branchId} onChange={(event) => patchSlot(index, { branchId: Number(event.target.value), hallId: null })}><option value={0}>اختر</option>{(branches ?? []).map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></div>
            <div className="space-y-1"><Label className="text-xs">القاعة</Label><select className={SELECT_CLS} value={slot.hallId ?? ''} onChange={(event) => patchSlot(index, { hallId: event.target.value ? Number(event.target.value) : null })}><option value="">بدون قاعة</option>{(halls ?? []).filter((hall) => !slot.branchId || hall.branchId === slot.branchId).map((hall) => <option key={hall.id} value={hall.id}>{hall.name}</option>)}</select></div>
            <div className="space-y-1"><Label className="text-xs">السعة</Label><Input type="number" min={1} className="nums" value={slot.maxCapacity} onChange={(event) => patchSlot(index, { maxCapacity: Number(event.target.value) })} /></div>
            <div className="flex items-end"><Button variant="ghost" size="icon" className="text-destructive" onClick={() => setSlots((current) => current.filter((_, slotIndex) => slotIndex !== index))}><Trash2 className="size-4" /></Button></div>
          </div>)}
          {!isLoading && trainerId && !slots.length ? <div className="rounded-xl border border-dashed py-12 text-center"><CalendarClock className="mx-auto mb-3 size-8 text-muted-foreground" /><p className="text-sm text-muted-foreground">لا يوجد جدول افتراضي لهذا المدرب. أضف أول موعد.</p></div> : null}
        </div>
      </div>
    </div>
  );
}
