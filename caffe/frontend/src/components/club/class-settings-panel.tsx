import { CalendarPlus, Clock3, Pencil, Plus, Trash2, Users, Wallet } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Time12Input } from '@/components/common/time-12-input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useBranches } from '@/hooks/use-branches';
import { api, apiError } from '@/lib/api';
import { confirm } from '@/lib/confirm';
import { toArabicDigits } from '@/lib/utils';
import type { ClubClassType, ClubHallRow, ClubTrainerRow } from '@/types/fitness';

type ScheduleDraft = {
  weekday: number;
  startTime: string;
  endTime: string;
  branchId: number;
  hallId: number | null;
  maxCapacity: number;
};

type ClassTypeForm = {
  name: string;
  singleSessionPrice: string;
  color: string;
  defaultDurationMinutes: string;
  eligibleTrainerIds: number[];
  trainerSchedules: Record<number, ScheduleDraft[]>;
};

const weekdayOptions = [
  { value: 0, label: 'الأحد' },
  { value: 1, label: 'الإثنين' },
  { value: 2, label: 'الثلاثاء' },
  { value: 3, label: 'الأربعاء' },
  { value: 4, label: 'الخميس' },
  { value: 5, label: 'الجمعة' },
  { value: 6, label: 'السبت' },
];

const emptyForm = (): ClassTypeForm => ({
  name: '',
  singleSessionPrice: '',
  color: '#2563EB',
  defaultDurationMinutes: '60',
  eligibleTrainerIds: [],
  trainerSchedules: {},
});

function addMinutes(time: string, minutes: number) {
  const [hour = '17', minute = '00'] = time.split(':');
  const date = new Date(2000, 0, 1, Number(hour), Number(minute));
  date.setMinutes(date.getMinutes() + minutes);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function ClassSettingsPanel({ autoOpenCreate = false, onAutoOpenHandled }: { autoOpenCreate?: boolean; onAutoOpenHandled?: () => void } = {}) {
  const qc = useQueryClient();
  const { data: classTypes, isLoading } = useQuery({
    queryKey: ['club-class-types', 'special-subscriptions'],
    queryFn: async () => (await api.get<ClubClassType[]>('/club-class-types', { params: { includeInactive: 1 } })).data,
  });
  const { data: trainers, isLoading: trainersLoading, isError: trainersError, refetch: refetchTrainers } = useQuery({
    queryKey: ['club-trainers', 'special-subscriptions'],
    queryFn: async () => (await api.get<{ data: ClubTrainerRow[] }>('/club-trainers', { params: { page: 1, pageSize: 200, isActive: true } })).data.data,
  });
  const { data: branches } = useBranches();
  const { data: halls } = useQuery({
    queryKey: ['club-halls', 'special-class-form'],
    queryFn: async () => (await api.get<{ data: ClubHallRow[] }>('/club-halls', { params: { page: 1, pageSize: 200 } })).data.data,
  });
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<ClassTypeForm>(emptyForm);

  const defaultBranchId = branches?.[0]?.id ?? 0;

  const makeSlot = (duration = Number(form.defaultDurationMinutes) || 60): ScheduleDraft => ({
    weekday: 1,
    startTime: '17:00',
    endTime: addMinutes('17:00', duration),
    branchId: defaultBranchId,
    hallId: null,
    maxCapacity: 10,
  });

  useEffect(() => {
    if (!defaultBranchId) return;
    setForm((current) => {
      let changed = false;
      const trainerSchedules = Object.fromEntries(
        Object.entries(current.trainerSchedules).map(([trainerId, slots]) => [
          trainerId,
          slots.map((slot) => {
            if (slot.branchId) return slot;
            changed = true;
            return { ...slot, branchId: defaultBranchId };
          }),
        ]),
      );
      return changed ? { ...current, trainerSchedules } : current;
    });
  }, [defaultBranchId]);

  const trainersById = useMemo(() => new Map((trainers ?? []).map((trainer) => [trainer.id, trainer])), [trainers]);

  const openCreate = () => {
    setEditId(null);
    setForm(emptyForm());
    setOpen(true);
  };

  useEffect(() => {
    if (!autoOpenCreate) return;
    setEditId(null);
    setForm(emptyForm());
    setOpen(true);
    onAutoOpenHandled?.();
  }, [autoOpenCreate, onAutoOpenHandled]);

  const openEdit = (item: ClubClassType) => {
    const trainerSchedules: Record<number, ScheduleDraft[]> = {};
    for (const slot of item.trainerScheduleSlots ?? []) {
      trainerSchedules[slot.trainerId] = [
        ...(trainerSchedules[slot.trainerId] ?? []),
        {
          weekday: slot.weekday,
          startTime: slot.startTime.slice(0, 5),
          endTime: slot.endTime.slice(0, 5),
          branchId: slot.branchId,
          hallId: slot.hallId,
          maxCapacity: slot.maxCapacity,
        },
      ];
    }
    setEditId(item.id);
    setForm({
      name: item.name,
      singleSessionPrice: String(item.singleSessionPrice ?? 0),
      color: item.color,
      defaultDurationMinutes: String(item.defaultDurationMinutes),
      eligibleTrainerIds: item.eligibleTrainerIds,
      trainerSchedules,
    });
    setOpen(true);
  };

  const toggleTrainer = (trainerId: number, checked: boolean) => {
    setForm((current) => {
      const eligibleTrainerIds = checked
        ? [...new Set([...current.eligibleTrainerIds, trainerId])]
        : current.eligibleTrainerIds.filter((id) => id !== trainerId);
      const trainerSchedules = { ...current.trainerSchedules };
      if (checked && !trainerSchedules[trainerId]?.length) trainerSchedules[trainerId] = [makeSlot(Number(current.defaultDurationMinutes) || 60)];
      if (!checked) delete trainerSchedules[trainerId];
      return { ...current, eligibleTrainerIds, trainerSchedules };
    });
  };

  const addTrainerSlot = (trainerId: number) => {
    setForm((current) => ({
      ...current,
      trainerSchedules: {
        ...current.trainerSchedules,
        [trainerId]: [...(current.trainerSchedules[trainerId] ?? []), makeSlot(Number(current.defaultDurationMinutes) || 60)],
      },
    }));
  };

  const updateTrainerSlot = (trainerId: number, index: number, patch: Partial<ScheduleDraft>) => {
    setForm((current) => ({
      ...current,
      trainerSchedules: {
        ...current.trainerSchedules,
        [trainerId]: (current.trainerSchedules[trainerId] ?? []).map((slot, slotIndex) => {
          if (slotIndex !== index) return slot;
          const next = { ...slot, ...patch };
          if (patch.startTime && !patch.endTime) next.endTime = addMinutes(patch.startTime, Number(current.defaultDurationMinutes) || 60);
          if (patch.branchId) next.hallId = null;
          return next;
        }),
      },
    }));
  };

  const removeTrainerSlot = (trainerId: number, index: number) => {
    setForm((current) => ({
      ...current,
      trainerSchedules: {
        ...current.trainerSchedules,
        [trainerId]: (current.trainerSchedules[trainerId] ?? []).filter((_, slotIndex) => slotIndex !== index),
      },
    }));
  };

  const save = async () => {
    if (!form.name.trim() || form.singleSessionPrice === '') {
      toast.error('أدخل اسم الحصة وسعر الحصة الواحدة');
      return;
    }
    if (!form.eligibleTrainerIds.length) {
      toast.error('اختر مدربًا واحدًا على الأقل');
      return;
    }
    for (const trainerId of form.eligibleTrainerIds) {
      const slots = form.trainerSchedules[trainerId] ?? [];
      if (!slots.length) {
        toast.error(`أضف موعدًا واحدًا على الأقل للمدرب ${trainersById.get(trainerId)?.name ?? ''}`);
        return;
      }
      if (slots.some((slot) => !slot.branchId || !slot.startTime || !slot.endTime || slot.endTime <= slot.startTime)) {
        toast.error('راجع أيام وأوقات وجدول المدربين');
        return;
      }
    }
    setSaving(true);
    try {
      const body = {
        name: form.name.trim(),
        singleSessionPrice: Number(form.singleSessionPrice),
        color: form.color,
        defaultDurationMinutes: Number(form.defaultDurationMinutes) || 60,
        eligibleTrainerIds: form.eligibleTrainerIds,
        trainerSchedules: form.eligibleTrainerIds.map((trainerId) => ({ trainerId, slots: form.trainerSchedules[trainerId] ?? [] })),
      };
      if (editId) await api.put(`/club-class-types/${editId}`, body);
      else await api.post('/club-class-types', body);
      await qc.invalidateQueries({ queryKey: ['club-class-types'] });
      setOpen(false);
      toast.success('تم حفظ الاشتراك الخاص');
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: number) => {
    if (!(await confirm({ title: 'حذف الاشتراك الخاص؟', variant: 'destructive' }))) return;
    try {
      await api.delete(`/club-class-types/${id}`);
      toast.success('تم حذف الاشتراك الخاص');
      await qc.invalidateQueries({ queryKey: ['club-class-types'] });
    } catch (error) {
      toast.error(apiError(error));
    }
  };

  return (
    <div className="space-y-4 pt-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/20 p-4">
        <div>
          <p className="font-semibold">اشتراكات الحصص الخاصة</p>
          <p className="mt-1 text-sm text-muted-foreground">هنا يتم تعريف الحصة وسعرها ومدربيها ومواعيدهم؛ عدد الحصص ومدة الصلاحية يحددهما اشتراك كل عضو.</p>
        </div>
        <Button variant="brand" onClick={openCreate}><Plus className="size-4" /> إنشاء اشتراك خاص</Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {(classTypes ?? []).map((item) => (
          <div key={item.id} className="rounded-xl border bg-card p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="size-4 rounded-full ring-4 ring-muted" style={{ backgroundColor: item.color }} />
                <div><p className="font-semibold">{item.name}</p><p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground"><Wallet className="size-3.5" /> {toArabicDigits(item.singleSessionPrice ?? 0)} ج.م / حصة</p></div>
              </div>
              <div className="flex gap-1"><Button variant="ghost" size="icon" onClick={() => openEdit(item)}><Pencil className="size-4" /></Button><Button variant="ghost" size="icon" className="text-destructive" onClick={() => void remove(item.id)}><Trash2 className="size-4" /></Button></div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 text-center text-xs"><div className="rounded-lg bg-muted/60 p-2"><Users className="mx-auto mb-1 size-4" /><b className="block text-sm">{toArabicDigits(item.eligibleTrainerIds.length)}</b> مدربون</div><div className="rounded-lg bg-muted/60 p-2"><Clock3 className="mx-auto mb-1 size-4" /><b className="block text-sm">{toArabicDigits(item.defaultDurationMinutes)}</b> دقيقة</div></div>
          </div>
        ))}
        {!isLoading && !(classTypes ?? []).length ? <p className="col-span-full rounded-xl border border-dashed py-12 text-center text-sm text-muted-foreground">لا توجد اشتراكات خاصة بعد.</p> : null}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="xl" className="max-h-[92vh] overflow-y-auto" aria-describedby={undefined}>
          <DialogHeader><DialogTitle>{editId ? 'تعديل اشتراك خاص' : 'إنشاء اشتراك خاص'}</DialogTitle></DialogHeader>
          <div className="space-y-5 py-2">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <div className="space-y-2"><Label>اسم الحصة *</Label><Input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="Yoga" /></div>
              <div className="space-y-2"><Label>سعر الحصة الواحدة *</Label><Input type="number" min={0} step="0.01" className="nums" value={form.singleSessionPrice} onChange={(event) => setForm((current) => ({ ...current, singleSessionPrice: event.target.value }))} /></div>
              <div className="space-y-2"><Label>المدة الافتراضية (دقيقة)</Label><Input type="number" min={5} max={480} className="nums" value={form.defaultDurationMinutes} onChange={(event) => setForm((current) => ({ ...current, defaultDurationMinutes: event.target.value }))} /></div>
              <div className="space-y-2"><Label>لون الحصة في التقويم</Label><div className="flex gap-2"><Input type="color" className="w-16 p-1" value={form.color} onChange={(event) => setForm((current) => ({ ...current, color: event.target.value }))} /><Input className="nums" value={form.color} onChange={(event) => setForm((current) => ({ ...current, color: event.target.value }))} /></div></div>
            </div>
            <section className="space-y-4 rounded-xl border p-4">
              <div>
                <p className="font-medium">المدربون ومواعيدهم الافتراضية *</p>
                <p className="text-xs text-muted-foreground">كل مدرب تختاره هنا تظهر مواعيده الخاصة بهذه الحصة داخل نفس الفورم.</p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {(trainers ?? []).map((trainer) => (
                  <label key={trainer.id} className="flex cursor-pointer items-center gap-3 rounded-lg border bg-background px-3 py-3 text-sm transition-colors hover:border-primary/50 has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                    <Checkbox checked={form.eligibleTrainerIds.includes(trainer.id)} onCheckedChange={(checked) => toggleTrainer(trainer.id, checked === true)} />
                    <span><b className="block">{trainer.name}</b>{trainer.specialization ? <span className="text-xs text-muted-foreground">{trainer.specialization}</span> : null}</span>
                  </label>
                ))}
                {trainersLoading ? <p className="col-span-full py-4 text-center text-sm text-muted-foreground">جارٍ تحميل المدربين...</p> : null}
                {!trainersLoading && trainersError ? <div className="col-span-full flex items-center justify-center gap-2 rounded-lg border border-destructive/30 p-4 text-sm text-destructive"><span>تعذر تحميل المدربين.</span><Button variant="outline" size="sm" onClick={() => void refetchTrainers()}>إعادة المحاولة</Button></div> : null}
                {!trainersLoading && !trainersError && !(trainers ?? []).length ? <p className="col-span-full rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">لا يوجد موظفون بمسمى وظيفي من نوع مدرب.</p> : null}
              </div>

              {form.eligibleTrainerIds.map((trainerId) => {
                const trainer = trainersById.get(trainerId);
                return (
                  <div key={trainerId} className="rounded-xl border bg-muted/20 p-3">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-semibold">{trainer?.name ?? 'مدرب'}</p>
                        <p className="text-xs text-muted-foreground">مواعيد {form.name.trim() || 'الحصة'} الافتراضية لهذا المدرب</p>
                      </div>
                      <Button type="button" variant="outline" size="sm" onClick={() => addTrainerSlot(trainerId)}><CalendarPlus className="size-4" /> إضافة موعد</Button>
                    </div>
                    <div className="space-y-2">
                      {(form.trainerSchedules[trainerId] ?? []).map((slot, index) => (
                        <div key={`${trainerId}-${index}`} className="grid gap-2 rounded-lg border bg-background p-3 md:grid-cols-[1fr_1fr_1fr_1.2fr_1.2fr_0.8fr_auto]">
                          <div className="space-y-1">
                            <Label className="text-xs">اليوم</Label>
                            <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={slot.weekday} onChange={(event) => updateTrainerSlot(trainerId, index, { weekday: Number(event.target.value) })}>
                              {weekdayOptions.map((day) => <option key={day.value} value={day.value}>{day.label}</option>)}
                            </select>
                          </div>
                          <div className="space-y-1"><Label className="text-xs">البداية</Label><Time12Input value={slot.startTime} onValueChange={(value) => updateTrainerSlot(trainerId, index, { startTime: value })} /></div>
                          <div className="space-y-1"><Label className="text-xs">النهاية</Label><Time12Input value={slot.endTime} onValueChange={(value) => updateTrainerSlot(trainerId, index, { endTime: value })} /></div>
                          <div className="space-y-1">
                            <Label className="text-xs">الفرع</Label>
                            <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={slot.branchId || ''} onChange={(event) => updateTrainerSlot(trainerId, index, { branchId: Number(event.target.value) })}>
                              <option value="">اختر الفرع</option>
                              {(branches ?? []).map((branch) => <option key={branch.id} value={branch.id}>{branch.name ?? branch.id}</option>)}
                            </select>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">القاعة</Label>
                            <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={slot.hallId ?? ''} onChange={(event) => updateTrainerSlot(trainerId, index, { hallId: event.target.value ? Number(event.target.value) : null })}>
                              <option value="">بدون قاعة</option>
                              {(halls ?? []).filter((hall) => hall.branchId === slot.branchId).map((hall) => <option key={hall.id} value={hall.id}>{hall.name} - {hall.hallNumber}</option>)}
                            </select>
                          </div>
                          <div className="space-y-1"><Label className="text-xs">الأماكن</Label><Input type="number" min={1} className="nums" value={slot.maxCapacity} onChange={(event) => updateTrainerSlot(trainerId, index, { maxCapacity: Number(event.target.value) || 1 })} /></div>
                          <div className="flex items-end">
                            <Button type="button" variant="ghost" size="icon" className="text-destructive" onClick={() => removeTrainerSlot(trainerId, index)}><Trash2 className="size-4" /></Button>
                          </div>
                        </div>
                      ))}
                      {!(form.trainerSchedules[trainerId] ?? []).length ? <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">لا توجد مواعيد لهذا المدرب بعد.</p> : null}
                    </div>
                  </div>
                );
              })}
            </section>
          </div>
          <DialogFooter>
            <Button variant="brand" onClick={() => void save()} disabled={saving}>حفظ</Button>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>إلغاء</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
