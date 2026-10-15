import { CalendarPlus, Pencil, Plus, Trash2, Users } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Time12Input } from '@/components/common/time-12-input';
import { CatalogCard, CatalogEmpty, CatalogGrid, matchesCatalogSearch } from '@/components/club/package-catalog-layout';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useBranches } from '@/hooks/use-branches';
import { api, apiError } from '@/lib/api';
import { confirm } from '@/lib/confirm';
import { toArabicDigits } from '@/lib/utils';
import type { ClassAudience, ClubClassType, ClubHallRow, ClubTrainerRow } from '@/types/fitness';
import { usePermission } from '@/hooks/use-permission';
import { uiStatic } from '@/lib/ui-static';
import { CLASS_AUDIENCE_OPTIONS } from '@/lib/class-audience';
import { Switch } from '@/components/ui/switch';
import { ClassLinkedSubscriptions } from './class-linked-subscriptions';

type ScheduleDraft = {
  weekday: number;
  startTime: string;
  endTime: string;
  branchId: number;
  hallId: number | null;
  maxCapacity: number;
  audience: ClassAudience;
};

type ClassTypeForm = {
  allowExternal: boolean;
  commissionPercentage: string;
  linkedSubscriptionTypeIds: number[];
  name: string;
  singleSessionPrice: string;
  color: string;
  defaultDurationMinutes: string;
  eligibleTrainerIds: number[];
  trainerSchedules: Record<number, ScheduleDraft[]>;
};

/** These panels are embedded in /club/packages/settings but keep their own permission key. */
const PERMISSION_RESOURCE = 'club.subscriptions.special';

const weekdayOptions = [
  { value: 0, label: uiStatic('الأحد') },
  { value: 1, label: uiStatic('الإثنين') },
  { value: 2, label: uiStatic('الثلاثاء') },
  { value: 3, label: uiStatic('الأربعاء') },
  { value: 4, label: uiStatic('الخميس') },
  { value: 5, label: uiStatic('الجمعة') },
  { value: 6, label: uiStatic('السبت') },
];

const emptyForm = (): ClassTypeForm => ({
  allowExternal: false,
  commissionPercentage: '0',
  linkedSubscriptionTypeIds: [],
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

export function ClassSettingsPanel({
  autoOpenCreate = false,
  onAutoOpenHandled,
  /** Rendered inside the packages catalog: the section shell supplies the heading and add button. */
  embedded = false,
  onReady,
  /** Name filter supplied by the catalog tab's search box. */
  search = '',
}: {
  autoOpenCreate?: boolean;
  onAutoOpenHandled?: () => void;
  embedded?: boolean;
  onReady?: (api: { count: number; openCreate: () => void; canCreate: boolean }) => void;
  search?: string;
} = {}) {
  const qc = useQueryClient();
  const { can } = usePermission();
  const canCreate = can('club.subscriptions.special:create');
  const canUpdate = can('club.subscriptions.special:update');
  const canDelete = can('club.subscriptions.special:delete');
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
    audience: 'men',
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
    if (!canCreate) return;
    setEditId(null);
    setForm(emptyForm());
    setOpen(true);
  };

  useEffect(() => {
    if (!autoOpenCreate || !canCreate) return;
    setEditId(null);
    setForm(emptyForm());
    setOpen(true);
    onAutoOpenHandled?.();
  }, [autoOpenCreate, canCreate, onAutoOpenHandled]);

  const visibleClassTypes = useMemo(
    () => (classTypes ?? []).filter((item) => matchesCatalogSearch(item.name, search)),
    [classTypes, search],
  );

  // Lets the embedding catalog section render the count badge and the add button itself.
  useEffect(() => {
    onReady?.({ count: visibleClassTypes.length, openCreate, canCreate });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleClassTypes, canCreate]);

  const openEdit = (item: ClubClassType) => {
    if (!canUpdate) return;
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
          audience: slot.audience ?? 'mixed',
        },
      ];
    }
    setEditId(item.id);
    setForm({
      allowExternal: item.allowExternal ?? false,
      commissionPercentage: String(item.commissionPercentage ?? 0),
      linkedSubscriptionTypeIds: item.linkedSubscriptionTypeIds ?? [],
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
    if (editId ? !canUpdate : !canCreate) return;
    if (!form.name.trim() || form.singleSessionPrice === '') {
      toast.error(uiStatic('أدخل اسم الحصة وسعر الحصة الواحدة'));
      return;
    }
    if (!form.eligibleTrainerIds.length) {
      toast.error(uiStatic('اختر مدربًا واحدًا على الأقل'));
      return;
    }
    for (const trainerId of form.eligibleTrainerIds) {
      const slots = form.trainerSchedules[trainerId] ?? [];
      if (!slots.length) {
        toast.error(`${uiStatic('أضف موعدًا واحدًا على الأقل للمدرب ')}${trainersById.get(trainerId)?.name ?? ''}`);
        return;
      }
      if (slots.some((slot) => !slot.branchId || !slot.startTime || !slot.endTime || slot.endTime <= slot.startTime)) {
        toast.error(uiStatic('راجع أيام وأوقات وجدول المدربين'));
        return;
      }
    }
    setSaving(true);
    try {
      const body = {
        allowExternal: form.allowExternal,
        commissionPercentage: Number(form.commissionPercentage),
        linkedSubscriptionTypeIds: form.linkedSubscriptionTypeIds,
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
      toast.success(uiStatic('تم حفظ الاشتراك الخاص'));
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: number) => {
    if (!canDelete) return;
    if (!(await confirm({ title: uiStatic('حذف الاشتراك الخاص؟'), variant: 'destructive' }))) return;
    try {
      await api.delete(`/club-class-types/${id}`);
      toast.success(uiStatic('تم حذف الاشتراك الخاص'));
      await qc.invalidateQueries({ queryKey: ['club-class-types'] });
    } catch (error) {
      toast.error(apiError(error));
    }
  };

  return (
    <div className={embedded ? 'space-y-4' : 'space-y-4 pt-4'}>
      {embedded ? null : (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/20 p-4">
          <div>
            <p className="font-semibold">{uiStatic('اشتراكات الحصص الخاصة')}</p>
            <p className="mt-1 text-sm text-muted-foreground">{uiStatic('هنا يتم تعريف الحصة وسعرها ومدربيها ومواعيدهم؛ عدد الحصص ومدة الصلاحية يحددهما اشتراك كل عضو.')}</p>
          </div>
          {canCreate ? <Button permissionResource={PERMISSION_RESOURCE} permissionAction="create" variant="brand" onClick={openCreate}><Plus className="size-4" /> {uiStatic('إنشاء اشتراك خاص')}</Button> : null}
        </div>
      )}

      <CatalogGrid>
        {visibleClassTypes.map((item) => (
          <CatalogCard
            key={item.id}
            name={item.name}
            badge={uiStatic('حصة مجدولة')}
            badgeTone="sky"
            accent={item.color}
            stats={[
              { label: uiStatic('سعر الحصة'), value: `${toArabicDigits(item.singleSessionPrice ?? 0)} EGP` },
              { label: uiStatic('المدة'), value: `${toArabicDigits(item.defaultDurationMinutes)} ${uiStatic('دقيقة')}` },
            ]}
            note={
              <span className="inline-flex items-center gap-1">
                <Users className="size-3.5" />
                {toArabicDigits(item.eligibleTrainerIds.length)} {uiStatic('مدربون')}
              </span>
            }
            actions={
              <>
                {canUpdate ? <Button permissionResource={PERMISSION_RESOURCE} permissionAction="update" variant="ghost" size="sm" onClick={() => openEdit(item)}><Pencil className="size-4" /> {uiStatic('تعديل')}</Button> : null}
                {canDelete ? <Button permissionResource={PERMISSION_RESOURCE} permissionAction="delete" variant="ghost" size="sm" className="text-destructive" onClick={() => void remove(item.id)}><Trash2 className="size-4" /> {uiStatic('حذف')}</Button> : null}
              </>
            }
          />
        ))}
        {!isLoading && !visibleClassTypes.length ? (
          <CatalogEmpty label={search.trim() ? uiStatic('لا توجد حصة بهذا الاسم.') : uiStatic('لا توجد حصص مجدولة بعد.')} />
        ) : null}
      </CatalogGrid>

      <Dialog open={open && (editId ? canUpdate : canCreate)} onOpenChange={setOpen}>
        <DialogContent size="form" className="max-h-[92vh] overflow-y-auto" aria-describedby={undefined}>
          <DialogHeader><DialogTitle>{editId ? uiStatic('تعديل اشتراك خاص') : uiStatic('إنشاء اشتراك خاص')}</DialogTitle></DialogHeader>
          <div className="space-y-5 py-2">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <div className="space-y-2"><Label>{uiStatic('اسم الحصة *')}</Label><Input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="Yoga" /></div>
              <div className="space-y-2"><Label>{uiStatic('سعر الحصة الواحدة *')}</Label><Input type="number" min={0} step="0.01" className="nums" value={form.singleSessionPrice} onChange={(event) => setForm((current) => ({ ...current, singleSessionPrice: event.target.value }))} /></div>
              <div className="space-y-2"><Label>{uiStatic('المدة الافتراضية (دقيقة)')}</Label><Input type="number" min={5} max={480} className="nums" value={form.defaultDurationMinutes} onChange={(event) => setForm((current) => ({ ...current, defaultDurationMinutes: event.target.value }))} /></div>
              <div className="space-y-2"><Label>{uiStatic('لون الحصة في التقويم')}</Label><div className="flex gap-2"><Input type="color" className="w-16 p-1" value={form.color} onChange={(event) => setForm((current) => ({ ...current, color: event.target.value }))} /><Input className="nums" value={form.color} onChange={(event) => setForm((current) => ({ ...current, color: event.target.value }))} /></div></div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2"><Label htmlFor="class-type-commission">نسبة الكابتن من قيمة الحصة (%)</Label><Input id="class-type-commission" type="number" min={0} max={100} step="0.01" value={form.commissionPercentage} onChange={(event) => setForm((current) => ({ ...current, commissionPercentage: event.target.value }))} /></div>
              <div className="flex items-center justify-between gap-4 rounded-lg border p-4"><Label htmlFor="class-type-external">السماح بحضور من خارج الجيم</Label><Switch id="class-type-external" checked={form.allowExternal} onCheckedChange={(value) => setForm((current) => ({ ...current, allowExternal: value }))} /></div>
            </div>
            <ClassLinkedSubscriptions value={form.linkedSubscriptionTypeIds} onChange={(value) => setForm((current) => ({ ...current, linkedSubscriptionTypeIds: value }))} />
            <section className="space-y-4 rounded-xl border p-4">
              <div>
                <p className="font-medium">{uiStatic('المدربون ومواعيدهم الافتراضية *')}</p>
                <p className="text-xs text-muted-foreground">{uiStatic('كل مدرب تختاره هنا تظهر مواعيده الخاصة بهذه الحصة داخل نفس الفورم.')}</p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {(trainers ?? []).map((trainer) => (
                  <label key={trainer.id} className="flex cursor-pointer items-center gap-3 rounded-lg border bg-background px-3 py-3 text-sm transition-colors hover:border-primary/50 has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                    <Checkbox checked={form.eligibleTrainerIds.includes(trainer.id)} onCheckedChange={(checked) => toggleTrainer(trainer.id, checked === true)} />
                    <span><b className="block">{trainer.name}</b>{trainer.specialization ? <span className="text-xs text-muted-foreground">{trainer.specialization}</span> : null}</span>
                  </label>
                ))}
                {trainersLoading ? <p className="col-span-full py-4 text-center text-sm text-muted-foreground">{uiStatic('جارٍ تحميل المدربين...')}</p> : null}
                {!trainersLoading && trainersError ? <div className="col-span-full flex items-center justify-center gap-2 rounded-lg border border-destructive/30 p-4 text-sm text-destructive"><span>{uiStatic('تعذر تحميل المدربين.')}</span><Button variant="outline" size="sm" onClick={() => void refetchTrainers()}>{uiStatic('إعادة المحاولة')}</Button></div> : null}
                {!trainersLoading && !trainersError && !(trainers ?? []).length ? <p className="col-span-full rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">{uiStatic('لا يوجد موظفون بمسمى وظيفي من نوع مدرب.')}</p> : null}
              </div>

              {form.eligibleTrainerIds.map((trainerId) => {
                const trainer = trainersById.get(trainerId);
                return (
                  <div key={trainerId} className="rounded-xl border bg-muted/20 p-3">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-semibold">{trainer?.name ?? uiStatic('مدرب')}</p>
                        <p className="text-xs text-muted-foreground">مواعيد {form.name.trim() || uiStatic('الحصة')} الافتراضية لهذا المدرب</p>
                      </div>
                      <Button type="button" permissionAction={null} variant="outline" size="sm" onClick={() => addTrainerSlot(trainerId)}><CalendarPlus className="size-4" /> {uiStatic('إضافة موعد')}</Button>
                    </div>
                    <div className="space-y-2">
                      {(form.trainerSchedules[trainerId] ?? []).map((slot, index) => (
                        <div key={`${trainerId}-${index}`} className="grid gap-4 rounded-lg border bg-background p-4 sm:grid-cols-2 xl:grid-cols-3">
                          <div className="space-y-1">
                            <Label className="text-xs">{uiStatic('اليوم')}</Label>
                            <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={slot.weekday} onChange={(event) => updateTrainerSlot(trainerId, index, { weekday: Number(event.target.value) })}>
                              {weekdayOptions.map((day) => <option key={day.value} value={day.value}>{day.label}</option>)}
                            </select>
                          </div>
                          <div className="space-y-1"><Label className="text-xs">{uiStatic('البداية')}</Label><Time12Input value={slot.startTime} onValueChange={(value) => updateTrainerSlot(trainerId, index, { startTime: value })} /></div>
                          <div className="space-y-1"><Label className="text-xs">{uiStatic('النهاية')}</Label><Time12Input value={slot.endTime} onValueChange={(value) => updateTrainerSlot(trainerId, index, { endTime: value })} /></div>
                          <div className="space-y-1">
                            <Label className="text-xs">{uiStatic('الفئة')}</Label>
                            <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={slot.audience} onChange={(event) => updateTrainerSlot(trainerId, index, { audience: event.target.value as ClassAudience })}>
                              {CLASS_AUDIENCE_OPTIONS.filter((option) => option.value === 'men' || option.value === 'women').map((option) => <option key={option.value} value={option.value}>{uiStatic(option.value === 'men' ? 'رجالي' : 'حريمي')}</option>)}
                            </select>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">{uiStatic('الفرع')}</Label>
                            <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={slot.branchId || ''} onChange={(event) => updateTrainerSlot(trainerId, index, { branchId: Number(event.target.value) })}>
                              <option value="">{uiStatic('اختر الفرع')}</option>
                              {(branches ?? []).map((branch) => <option key={branch.id} value={branch.id}>{branch.name ?? branch.id}</option>)}
                            </select>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">{uiStatic('القاعة')}</Label>
                            <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={slot.hallId ?? ''} onChange={(event) => updateTrainerSlot(trainerId, index, { hallId: event.target.value ? Number(event.target.value) : null })}>
                              <option value="">{uiStatic('بدون قاعة')}</option>
                              {(halls ?? []).filter((hall) => hall.branchId === slot.branchId).map((hall) => <option key={hall.id} value={hall.id}>{hall.name} - {hall.hallNumber}</option>)}
                            </select>
                          </div>
                          <div className="flex items-end">
                            <Button type="button" variant="ghost" size="icon" className="text-destructive" onClick={() => removeTrainerSlot(trainerId, index)}><Trash2 className="size-4" /></Button>
                          </div>
                        </div>
                      ))}
                      {!(form.trainerSchedules[trainerId] ?? []).length ? <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">{uiStatic('لا توجد مواعيد لهذا المدرب بعد.')}</p> : null}
                    </div>
                  </div>
                );
              })}
            </section>
          </div>
          <DialogFooter>
            <Button permissionResource={PERMISSION_RESOURCE} permissionAction={editId ? 'update' : 'create'} variant="brand" onClick={() => void save()} disabled={saving}>{uiStatic('حفظ')}</Button>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>{uiStatic('إلغاء')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
