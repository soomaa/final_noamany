import { CalendarDays, CalendarPlus2, ChevronLeft, ChevronRight, ListChecks, Plus, Search, Sparkles, UserPlus, Users, Wallet } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ClassReportsPanel } from '@/components/club/class-reports-panel';
import { ClassSessionDialog } from '@/components/club/class-session-dialog';
import { PageHeader } from '@/components/common/page-header';
import { Time12Input } from '@/components/common/time-12-input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useBranches } from '@/hooks/use-branches';
import { api, apiError } from '@/lib/api';
import { formatTime, localDateStr, localToday } from '@/lib/formatters';
import { cn, toArabicDigits, withAlpha } from '@/lib/utils';
import type { ClubClassType, ClubHallRow, ClubTrainerRow } from '@/types/fitness';

type CalendarEvent = {
  sourceType: 'class' | 'event';
  id: number;
  title: string;
  classTypeId: number | null;
  color: string;
  date: string;
  startTime: string;
  endTime: string;
  trainerId: number;
  trainerName: string;
  branchId: number;
  hallId?: number | null;
  hallName?: string | null;
  enrollmentCount: number;
  maxCapacity: number;
  status: 'scheduled' | 'ongoing' | 'completed' | 'cancelled';
};

const SELECT_CLS = 'h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring';

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function startOfWeek(date: Date) {
  return addDays(date, -date.getDay());
}

function calendarRange(anchor: Date, mode: 'week' | 'month') {
  if (mode === 'week') {
    const start = startOfWeek(anchor);
    const days = Array.from({ length: 7 }, (_, index) => localDateStr(addDays(start, index)));
    return { from: days[0]!, to: days[6]!, days };
  }
  const monthStart = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const gridStart = startOfWeek(monthStart);
  const days = Array.from({ length: 42 }, (_, index) => localDateStr(addDays(gridStart, index)));
  return { from: days[0]!, to: days[41]!, days };
}

function timeMinutes(value: string) {
  const [hour, minute] = value.split(':').map(Number);
  return (hour ?? 0) * 60 + (minute ?? 0);
}

function timeFromMinutes(value: number) {
  const normalized = Math.max(0, Math.min((24 * 60) - 1, value));
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`;
}

function displayTime(value: string) {
  return formatTime(value);
}

function endTimeFromDuration(start: string, duration: number) {
  const minutes = timeMinutes(start) + duration;
  return `${String(Math.floor(minutes / 60) % 24).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

export function FitnessSchedulingPage({ embedded = false, onAddSpecialSubscription }: { embedded?: boolean; onAddSpecialSubscription?: () => void } = {}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const today = localToday();
  const { data: branches } = useBranches();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab');
  const tab = !embedded && requestedTab === 'reports' ? requestedTab : 'schedule';
  const setTab = (value: string) => setSearchParams((current) => { const next = new URLSearchParams(current); next.set('tab', value); return next; }, { replace: true });
  const [mode, setMode] = useState<'week' | 'month'>('week');
  const [anchor, setAnchor] = useState(new Date());
  const [branchId, setBranchId] = useState('all');
  const [classTypeId, setClassTypeId] = useState('all');
  const [classSearch, setClassSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [externalOpen, setExternalOpen] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [externalSaving, setExternalSaving] = useState(false);
  const range = useMemo(() => calendarRange(anchor, mode), [anchor, mode]);

  const { data: classTypes, refetch: refetchClassTypes } = useQuery({
    queryKey: ['club-class-types'],
    queryFn: async () => (await api.get<ClubClassType[]>('/club-class-types')).data,
  });
  const { data: trainers, refetch: refetchTrainers } = useQuery({
    queryKey: ['club-trainers', 'classes-management'],
    queryFn: async () => (await api.get<{ data: ClubTrainerRow[] }>('/club-trainers', { params: { page: 1, pageSize: 200, isActive: true } })).data.data,
  });
  const { data: halls } = useQuery({
    queryKey: ['club-halls', 'classes-management'],
    queryFn: async () => (await api.get<{ data: ClubHallRow[] }>('/club-halls', { params: { page: 1, pageSize: 200 } })).data.data,
  });
  const { data: events, isLoading, refetch } = useQuery({
    queryKey: ['club-calendar', range.from, range.to, branchId],
    queryFn: async () => (await api.get<CalendarEvent[]>('/club/calendar/events', { params: { from: range.from, to: range.to, branchId: branchId === 'all' ? undefined : branchId } })).data.filter((event) => event.sourceType === 'class'),
  });

  const visibleEvents = useMemo(
    () => (events ?? []).filter((event) => classTypeId === 'all' || event.classTypeId === Number(classTypeId)),
    [events, classTypeId],
  );
  const byDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const event of visibleEvents) map.set(event.date, [...(map.get(event.date) ?? []), event]);
    for (const values of map.values()) values.sort((a, b) => a.startTime.localeCompare(b.startTime));
    return map;
  }, [visibleEvents]);
  const visibleClassTypes = useMemo(() => {
    const search = classSearch.trim().toLocaleLowerCase('ar');
    if (!search) return classTypes ?? [];
    return (classTypes ?? []).filter((item) => item.name.toLocaleLowerCase('ar').includes(search));
  }, [classSearch, classTypes]);

  const [form, setForm] = useState({
    classTypeId: '',
    trainerId: '',
    branchId: '',
    hallId: '',
    classDate: today,
    startTime: '17:00',
    endTime: '18:00',
    maxCapacity: '10',
    price: '0',
    notes: '',
  });
  const [externalForm, setExternalForm] = useState({
    name: '',
    phone: '',
    commissionPercentage: '',
  });

  const selectedType = classTypes?.find((item) => item.id === Number(form.classTypeId));
  const eligibleTrainers = selectedType?.eligibleTrainerIds.length
    ? (trainers ?? []).filter((trainer) => selectedType.eligibleTrainerIds.includes(trainer.id))
    : (trainers ?? []);

  const openCreate = (date = today, startTime = '17:00') => {
    const type = classTypes?.[0];
    const firstTrainerId = type?.eligibleTrainerIds[0] ?? trainers?.[0]?.id;
    setForm({
      classTypeId: type ? String(type.id) : '',
      trainerId: firstTrainerId ? String(firstTrainerId) : '',
      branchId: branchId !== 'all' ? branchId : branches?.[0] ? String(branches[0].id) : '',
      hallId: '',
      classDate: date,
      startTime,
      endTime: endTimeFromDuration(startTime, type?.defaultDurationMinutes ?? 60),
      maxCapacity: '10',
      price: String(type?.singleSessionPrice ?? 0),
      notes: '',
    });
    setCreateOpen(true);
  };

  const createSession = async () => {
    if (!form.classTypeId || !form.trainerId || !form.branchId) {
      toast.error('اختر نوع الحصة والمدرب والفرع');
      return;
    }
    setSaving(true);
    try {
      await api.post('/club-classes', {
        classTypeId: Number(form.classTypeId),
        trainerId: Number(form.trainerId),
        branchId: Number(form.branchId),
        hallId: form.hallId ? Number(form.hallId) : undefined,
        classDate: form.classDate,
        startTime: form.startTime,
        endTime: form.endTime,
        maxCapacity: Number(form.maxCapacity),
        price: Number(form.price),
        notes: form.notes || undefined,
      });
      toast.success('تم إنشاء الحصة');
      setCreateOpen(false);
      await refetch();
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setSaving(false);
    }
  };

  const createExternalTrainer = async () => {
    if (!form.classTypeId) {
      toast.error('اختر نوع الحصة أولًا');
      return;
    }
    if (!externalForm.name.trim()) {
      toast.error('اكتب اسم الكابتن');
      return;
    }
    if (!externalForm.commissionPercentage.trim()) {
      toast.error('اكتب نسبة الكابتن');
      return;
    }
    const commissionPercentage = Number(externalForm.commissionPercentage);
    if (!Number.isFinite(commissionPercentage) || commissionPercentage < 0 || commissionPercentage > 100) {
      toast.error('النسبة يجب أن تكون بين 0 و 100');
      return;
    }
    setExternalSaving(true);
    try {
      const { data } = await api.post<ClubTrainerRow & { commissionPercentage: number }>('/club-trainers/external', {
        ...externalForm,
        classTypeId: Number(form.classTypeId),
        commissionPercentage,
      });
      await Promise.all([refetchTrainers(), refetchClassTypes()]);
      setForm((current) => ({ ...current, trainerId: String(data.id) }));
      setExternalForm({ name: '', phone: '', commissionPercentage: '' });
      setExternalOpen(false);
      toast.success(`تمت إضافة ${data.name} ككابتن خارجي بنسبة ${data.commissionPercentage}%`);
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setExternalSaving(false);
    }
  };

  const addDefaultWeek = async () => {
    setSaving(true);
    try {
      const weekStart = localDateStr(startOfWeek(anchor));
      const { data } = await api.post<{ created: number; skippedCount: number }>('/club-classes/generate-default', {
        weekStart,
        branchId: branchId === 'all' ? undefined : Number(branchId),
        classTypeId: classTypeId === 'all' ? undefined : Number(classTypeId),
      });
      if (data.created) {
        toast.success(`تمت إضافة ${data.created} حصة من الافتراضي لهذا الأسبوع${data.skippedCount ? `، وتخطي ${data.skippedCount} مضافة مسبقًا أو متعارضة` : ''}`);
      } else {
        toast.info(data.skippedCount ? 'الجدول الافتراضي لهذا الأسبوع مضاف بالفعل، أو توجد تعارضات في المواعيد.' : 'لا توجد مواعيد افتراضية مطابقة لإضافتها هذا الأسبوع.');
      }
      await refetch();
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setSaving(false);
    }
  };

  const moveEvent = async (id: number, newDate: string, newStartTime?: string) => {
    try {
      const current = events?.find((event) => event.id === id);
      const duration = current ? timeMinutes(current.endTime) - timeMinutes(current.startTime) : 60;
      const startMinutes = newStartTime ? Math.min(timeMinutes(newStartTime), (24 * 60) - duration) : null;
      const normalizedStartTime = startMinutes != null ? timeFromMinutes(startMinutes) : undefined;
      await api.patch(`/club/calendar/classes/${id}/move`, {
        classDate: newDate,
        ...(normalizedStartTime ? { startTime: normalizedStartTime, endTime: timeFromMinutes(startMinutes! + duration) } : {}),
      });
      toast.success('تمت إعادة جدولة الحصة');
      await refetch();
    } catch (error) {
      toast.error(apiError(error));
    }
  };

  const shift = (direction: number) => setAnchor((current) => addDays(current, direction * (mode === 'week' ? 7 : 28)));
  const currentMonth = anchor.toLocaleDateString('ar-EG', { month: 'long', year: 'numeric' });
  const weekLabel = `${new Date(`${range.days[0]!}T12:00:00`).toLocaleDateString('ar-EG', { day: 'numeric', month: 'long' })} — ${new Date(`${range.days[6]!}T12:00:00`).toLocaleDateString('ar-EG', { day: 'numeric', month: 'long', year: 'numeric' })}`;

  return (
    <div className="space-y-6">
      {!embedded ? <PageHeader title="إدارة الحصص" description="جدولة مواعيد الكلاسات ومتابعة الحضور وتقارير الأداء في شاشة واحدة." /> : null}

      <Tabs value={tab} onValueChange={setTab}>
        {!embedded ? (
          <TabsList className="h-auto flex-wrap">
            <TabsTrigger value="schedule"><CalendarDays className="me-2 size-4" /> الجدولة</TabsTrigger>
            <TabsTrigger value="reports"><ListChecks className="me-2 size-4" /> التقارير</TabsTrigger>
          </TabsList>
        ) : null}

        <TabsContent value="schedule" className="space-y-4 pt-2">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]" dir="ltr">
            <main className="min-w-0 space-y-4" dir="rtl">
              <div className="rounded-2xl border bg-card p-3 shadow-sm sm:p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="brand" onClick={() => openCreate()}><CalendarPlus2 className="size-4" /> موعد جديد</Button>
                  <Button variant="outline" onClick={() => void addDefaultWeek()} disabled={saving} title="يضيف جداول المدربين الافتراضية للأسبوع المعروض فقط"><Sparkles className={cn('size-4', saving && 'animate-pulse')} /> إضافة الافتراضي</Button>
                  <select className={`${SELECT_CLS} sm:w-40`} value={branchId} onChange={(e) => setBranchId(e.target.value)}><option value="all">كل الفروع</option>{(branches ?? []).map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select>
                  <div className="flex rounded-xl border bg-muted/30 p-1"><Button variant={mode === 'week' ? 'secondary' : 'ghost'} size="sm" onClick={() => setMode('week')}>أسبوع</Button><Button variant={mode === 'month' ? 'secondary' : 'ghost'} size="sm" onClick={() => setMode('month')}>شهر</Button></div>
                  <div className="ms-auto flex items-center gap-1">
                    <Button variant="outline" size="icon" aria-label="الفترة السابقة" onClick={() => shift(-1)}><ChevronRight className="size-4" /></Button>
                    <Button variant="ghost" className="min-w-44" onClick={() => setAnchor(new Date())}>{mode === 'month' ? currentMonth : weekLabel}</Button>
                    <Button variant="outline" size="icon" aria-label="الفترة التالية" onClick={() => shift(1)}><ChevronLeft className="size-4" /></Button>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-xs text-muted-foreground">
                  <span>{classTypeId === 'all' ? 'كل الاشتراكات الخاصة' : classTypes?.find((item) => item.id === Number(classTypeId))?.name}</span>
                  <span><b className="nums text-foreground">{toArabicDigits(visibleEvents.length)}</b> حصة في الفترة المعروضة · اسحب الحصة لتغيير يومها أو وقتها</span>
                </div>
              </div>

              {mode === 'week' ? (
                <WeekCalendar days={range.days} events={byDate} today={today} loading={isLoading} onCreate={openCreate} onOpen={setDetailId} onMove={moveEvent} />
              ) : (
                <MonthCalendar days={range.days} events={byDate} anchor={anchor} today={today} onCreate={openCreate} onOpen={setDetailId} onMove={moveEvent} />
              )}
            </main>

            <aside className="min-w-0" dir="rtl">
              <Card className="overflow-hidden lg:sticky lg:top-4">
                <CardContent className="p-0">
                  <div className="border-b p-4">
                    <Button variant="brand" className="w-full" onClick={() => { if (onAddSpecialSubscription) onAddSpecialSubscription(); else navigate('/club/subscriptions/special?section=classes&action=create'); }}><Plus className="size-4" /> إضافة اشتراك خاص</Button>
                    <div className="relative mt-3">
                      <Search className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input className="pe-9" value={classSearch} onChange={(event) => setClassSearch(event.target.value)} placeholder="ابحث عن اشتراك..." />
                    </div>
                  </div>
                  <div className="flex items-center justify-between border-b bg-muted/20 px-4 py-3">
                    <p className="font-semibold">الاشتراكات الخاصة</p>
                    <span className="nums rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{toArabicDigits(classTypes?.length ?? 0)}</span>
                  </div>
                  <div className="max-h-[34rem] overflow-y-auto p-2">
                    <button type="button" onClick={() => setClassTypeId('all')} className={cn('flex w-full items-center gap-3 rounded-xl px-3 py-3 text-start transition-colors', classTypeId === 'all' ? 'bg-primary/10 text-primary' : 'hover:bg-muted/60')}>
                      <span className="flex size-9 items-center justify-center rounded-xl bg-primary/10"><CalendarDays className="size-4" /></span>
                      <span className="min-w-0 flex-1"><b className="block text-sm">كل الاشتراكات</b><span className="text-xs text-muted-foreground">عرض الجدول كاملًا</span></span>
                    </button>
                    {visibleClassTypes.map((item) => (
                      <button key={item.id} type="button" onClick={() => setClassTypeId(String(item.id))} className={cn('mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-3 text-start transition-colors', classTypeId === String(item.id) ? 'bg-primary/10 ring-1 ring-primary/20' : 'hover:bg-muted/60')}>
                        <span className="size-3 shrink-0 rounded-full ring-4 ring-muted" style={{ backgroundColor: item.color }} />
                        <span className="min-w-0 flex-1"><b className="block truncate text-sm">{item.name}</b><span className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><Wallet className="size-3" /> {toArabicDigits(item.singleSessionPrice ?? 0)} ج.م / حصة</span></span>
                      </button>
                    ))}
                    {!isLoading && !visibleClassTypes.length ? <p className="px-3 py-8 text-center text-sm text-muted-foreground">{classSearch ? 'لا توجد نتائج مطابقة.' : 'لا توجد اشتراكات خاصة بعد.'}</p> : null}
                  </div>
                </CardContent>
              </Card>
            </aside>
          </div>
        </TabsContent>

        <TabsContent value="reports"><ClassReportsPanel /></TabsContent>
      </Tabs>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent size="lg" aria-describedby={undefined}>
          <DialogHeader><DialogTitle>إنشاء حصة</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-2 sm:grid-cols-2">
            <div className="space-y-2"><Label>نوع الحصة *</Label><select className={SELECT_CLS} value={form.classTypeId} onChange={(e) => { const type = classTypes?.find((item) => item.id === Number(e.target.value)); setForm((current) => ({ ...current, classTypeId: e.target.value, trainerId: type?.eligibleTrainerIds[0] ? String(type.eligibleTrainerIds[0]) : '', endTime: endTimeFromDuration(current.startTime, type?.defaultDurationMinutes ?? 60), price: String(type?.singleSessionPrice ?? 0) })); }}><option value="">اختر</option>{(classTypes ?? []).map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}</select></div>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label>الكابتن *</Label>
                <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs text-primary" onClick={() => {
                  if (!form.classTypeId) {
                    toast.error('اختر نوع الحصة أولًا');
                    return;
                  }
                  setExternalOpen(true);
                }}>
                  <UserPlus className="size-3.5" /> كابتن خارجي
                </Button>
              </div>
              <select className={SELECT_CLS} value={form.trainerId} onChange={(e) => setForm((f) => ({ ...f, trainerId: e.target.value }))}><option value="">اختر</option>{eligibleTrainers.map((trainer) => <option key={trainer.id} value={trainer.id}>{trainer.name}{trainer.employeeId == null ? ' — خارجي' : ''}</option>)}</select>
            </div>
            <div className="space-y-2"><Label>الفرع *</Label><select className={SELECT_CLS} value={form.branchId} onChange={(e) => setForm((f) => ({ ...f, branchId: e.target.value, hallId: '' }))}><option value="">اختر</option>{(branches ?? []).map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></div>
            <div className="space-y-2"><Label>القاعة</Label><select className={SELECT_CLS} value={form.hallId} onChange={(e) => setForm((f) => ({ ...f, hallId: e.target.value }))}><option value="">بدون قاعة</option>{(halls ?? []).filter((hall) => !form.branchId || hall.branchId === Number(form.branchId)).map((hall) => <option key={hall.id} value={hall.id}>{hall.name}</option>)}</select></div>
            <div className="space-y-2"><Label>التاريخ *</Label><Input type="date" className="nums" value={form.classDate} onChange={(e) => setForm((f) => ({ ...f, classDate: e.target.value }))} /></div>
            <div className="grid gap-2 sm:grid-cols-2"><div className="space-y-2"><Label>من</Label><Time12Input value={form.startTime} onValueChange={(value) => setForm((f) => ({ ...f, startTime: value }))} /></div><div className="space-y-2"><Label>إلى</Label><Time12Input value={form.endTime} onValueChange={(value) => setForm((f) => ({ ...f, endTime: value }))} /></div></div>
            <div className="space-y-2"><Label>عدد الأماكن</Label><Input type="number" min={1} className="nums" value={form.maxCapacity} onChange={(e) => setForm((f) => ({ ...f, maxCapacity: e.target.value }))} /></div>
            <div className="space-y-2"><Label>السعر</Label><Input type="number" min={0} className="nums" value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} /></div>
            <div className="space-y-2 sm:col-span-2"><Label>ملاحظات</Label><Input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setCreateOpen(false)}>إلغاء</Button><Button variant="brand" onClick={() => void createSession()} disabled={saving}>إنشاء الحصة</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={externalOpen} onOpenChange={setExternalOpen}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>إضافة كابتن خارجي</DialogTitle>
          </DialogHeader>
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm text-muted-foreground">
            الكابتن الخارجي لا يُضاف كموظف في الجيم. تُحسب مستحقاته من إيراد الحضور الفعلي للحصص × النسبة المسجلة.
          </div>
          <div className="grid gap-4 py-2 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2"><Label>اسم الكابتن *</Label><Input value={externalForm.name} onChange={(e) => setExternalForm((current) => ({ ...current, name: e.target.value }))} placeholder="مثال: كابتن أحمد" /></div>
            <div className="space-y-2"><Label>رقم الهاتف</Label><Input dir="ltr" value={externalForm.phone} onChange={(e) => setExternalForm((current) => ({ ...current, phone: e.target.value }))} /></div>
            <div className="space-y-2">
              <Label>نسبة الكابتن من إيراد الحصة *</Label>
              <div className="relative">
                <Input type="number" min={0} max={100} step="0.01" className="nums pe-10" value={externalForm.commissionPercentage} onChange={(e) => setExternalForm((current) => ({ ...current, commissionPercentage: e.target.value }))} placeholder="مثال: 30" />
                <span className="absolute end-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
              </div>
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setExternalOpen(false)}>إلغاء</Button><Button variant="brand" onClick={() => void createExternalTrainer()} disabled={externalSaving}>{externalSaving ? 'جارٍ الإضافة...' : 'إضافة واختيار الكابتن'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <ClassSessionDialog sessionId={detailId} open={detailId != null} onOpenChange={(value) => { if (!value) setDetailId(null); }} trainers={trainers ?? []} halls={halls ?? []} />
    </div>
  );
}

const HOUR_HEIGHT = 68;

function WeekCalendar({ days, events, today, loading, onCreate, onOpen, onMove }: { days: string[]; events: Map<string, CalendarEvent[]>; today: string; loading: boolean; onCreate: (date: string, time?: string) => void; onOpen: (id: number) => void; onMove: (id: number, date: string, startTime?: string) => Promise<void> }) {
  const allEvents = Array.from(events.values()).flat();
  const earliest = allEvents.length ? Math.min(...allEvents.map((event) => timeMinutes(event.startTime))) : 8 * 60;
  const latest = allEvents.length ? Math.max(...allEvents.map((event) => timeMinutes(event.endTime))) : 22 * 60;
  const startHour = Math.max(0, Math.min(7, Math.floor(earliest / 60)));
  const endHour = Math.min(24, Math.max(22, Math.ceil(latest / 60)));
  const totalHeight = (endHour - startHour) * HOUR_HEIGHT;
  const hourLabels = Array.from({ length: endHour - startHour + 1 }, (_, index) => startHour + index);
  const now = new Date();
  const nowMinutes = (now.getHours() * 60) + now.getMinutes();
  const nowTop = ((nowMinutes - (startHour * 60)) / 60) * HOUR_HEIGHT;

  return (
    <Card className="overflow-hidden">
      <CardContent className="relative p-0">
        <div className="max-h-[720px] overflow-auto">
          <div className="min-w-[760px]" dir="rtl">
            <div className="sticky top-0 z-30 grid border-b bg-card/95 shadow-sm backdrop-blur" style={{ gridTemplateColumns: '64px repeat(7, minmax(96px, 1fr))' }}>
              <div className="flex items-center justify-center border-s text-muted-foreground"><CalendarDays className="size-4" /></div>
              {days.map((day) => {
                const date = new Date(`${day}T12:00:00`);
                const isToday = day === today;
                return (
                  <div key={day} className={cn('border-s px-2 py-3 text-center', isToday && 'bg-primary/5')}>
                    <p className={cn('text-xs font-medium text-muted-foreground', isToday && 'text-primary')}>{date.toLocaleDateString('ar-EG', { weekday: 'long' })}</p>
                    <p className={cn('nums mt-1 text-sm font-bold', isToday && 'text-primary')}>{toArabicDigits(date.getDate())} {date.toLocaleDateString('ar-EG', { month: 'short' })}</p>
                    <button type="button" className="mt-1 inline-flex items-center gap-1 text-[11px] text-primary hover:underline" onClick={() => onCreate(day)}><Plus className="size-3" /> إضافة</button>
                  </div>
                );
              })}
            </div>

            <div className="grid bg-card" style={{ gridTemplateColumns: '64px repeat(7, minmax(96px, 1fr))' }}>
              <div className="relative border-s bg-muted/15" style={{ height: totalHeight }}>
                {hourLabels.map((hour) => (
                  <span key={hour} className="nums absolute inset-x-0 -translate-y-1/2 px-1 text-center text-[10px] text-muted-foreground" style={{ top: (hour - startHour) * HOUR_HEIGHT }}>
                    {formatTime(`${String(hour).padStart(2, '0')}:00`)}
                  </span>
                ))}
              </div>
              {days.map((day) => {
                const dayEvents = events.get(day) ?? [];
                const isToday = day === today;
                return (
                  <div
                    key={day}
                    className={cn('relative border-s', isToday && 'bg-primary/[0.025]')}
                    style={{
                      height: totalHeight,
                      backgroundImage: 'linear-gradient(to bottom, hsl(var(--border)) 1px, transparent 1px)',
                      backgroundSize: `100% ${HOUR_HEIGHT}px`,
                    }}
                    onDoubleClick={(event) => {
                      if (event.target !== event.currentTarget) return;
                      const rect = event.currentTarget.getBoundingClientRect();
                      const minutes = (startHour * 60) + Math.round((((event.clientY - rect.top) / HOUR_HEIGHT) * 60) / 15) * 15;
                      onCreate(day, timeFromMinutes(minutes));
                    }}
                    onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; }}
                    onDrop={(event) => {
                      event.preventDefault();
                      const id = Number(event.dataTransfer.getData('classId'));
                      if (!id) return;
                      const rect = event.currentTarget.getBoundingClientRect();
                      const rawMinutes = (startHour * 60) + (((event.clientY - rect.top) / HOUR_HEIGHT) * 60);
                      const snappedMinutes = Math.max(startHour * 60, Math.min((endHour * 60) - 15, Math.round(rawMinutes / 15) * 15));
                      void onMove(id, day, timeFromMinutes(snappedMinutes));
                    }}
                  >
                    {isToday && nowTop >= 0 && nowTop <= totalHeight ? <div className="pointer-events-none absolute inset-x-0 z-20 border-t border-primary" style={{ top: nowTop }}><span className="absolute -end-1 -top-1 size-2 rounded-full bg-primary" /></div> : null}
                    {dayEvents.map((event) => {
                      const top = Math.max(0, ((timeMinutes(event.startTime) - (startHour * 60)) / 60) * HOUR_HEIGHT);
                      const duration = Math.max(15, timeMinutes(event.endTime) - timeMinutes(event.startTime));
                      const height = Math.max(42, (duration / 60) * HOUR_HEIGHT - 4);
                      return <WeekEventBlock key={event.id} event={event} top={top} height={height} onOpen={onOpen} />;
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        {loading ? <p className="border-t py-4 text-center text-sm text-muted-foreground">جارٍ تحميل الجدول...</p> : null}
        {!loading && !allEvents.length ? <div className="pointer-events-none absolute inset-x-0 top-72 z-10 text-center"><span className="rounded-full border bg-card/90 px-4 py-2 text-xs text-muted-foreground shadow-sm">لا توجد جلسات في هذا الأسبوع — أضف موعدًا أو أضف الجدول الافتراضي</span></div> : null}
      </CardContent>
    </Card>
  );
}

function WeekEventBlock({ event, top, height, onOpen }: { event: CalendarEvent; top: number; height: number; onOpen: (id: number) => void }) {
  return (
    <button
      type="button"
      draggable
      onDragStart={(dragEvent) => { dragEvent.dataTransfer.effectAllowed = 'move'; dragEvent.dataTransfer.setData('classId', String(event.id)); }}
      onClick={() => onOpen(event.id)}
      title={`${event.title} · ${event.trainerName} · ${displayTime(event.startTime)}–${displayTime(event.endTime)}`}
      className={cn('absolute inset-x-1 z-10 overflow-hidden rounded-xl border-s-[4px] px-2 py-1.5 text-start shadow-sm transition hover:z-20 hover:brightness-105 hover:shadow-md', event.status === 'cancelled' && 'opacity-50 line-through')}
      style={{ top, height, backgroundColor: withAlpha(event.color, 0.16), borderInlineStartColor: event.color }}
    >
      <span className="nums block text-[10px] font-bold" dir="ltr" style={{ color: event.color }}>{displayTime(event.startTime)} – {displayTime(event.endTime)}</span>
      <span className="mt-0.5 block truncate text-xs font-semibold text-foreground">{event.title}</span>
      {height >= 58 ? <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">{event.trainerName || 'بدون مدرب'}{event.hallName ? ` · ${event.hallName}` : ''}</span> : null}
      {height >= 80 ? <span className="nums mt-1 block text-[10px] text-muted-foreground"><Users className="me-1 inline size-3" />{toArabicDigits(event.enrollmentCount)} / {toArabicDigits(event.maxCapacity)}</span> : null}
    </button>
  );
}

function MonthCalendar({ days, events, anchor, today, onCreate, onOpen, onMove }: { days: string[]; events: Map<string, CalendarEvent[]>; anchor: Date; today: string; onCreate: (date: string) => void; onOpen: (id: number) => void; onMove: (id: number, date: string, startTime?: string) => Promise<void> }) {
  return (
    <Card className="overflow-hidden"><div className="overflow-x-auto"><div className="min-w-[760px]"><div className="grid grid-cols-7 border-b bg-muted/40">{['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'].map((day) => <div key={day} className="border-e p-2 text-center text-xs font-semibold text-muted-foreground last:border-e-0">{day}</div>)}</div><div className="grid grid-cols-7">{days.map((day, index) => { const date = new Date(`${day}T12:00:00`); const currentMonth = date.getMonth() === anchor.getMonth(); const dayEvents = events.get(day) ?? []; return <div key={day} className={cn('min-h-32 border-b border-e p-2', (index + 1) % 7 === 0 && 'border-e-0', index >= 35 && 'border-b-0', !currentMonth && 'bg-muted/20 text-muted-foreground', day === today && 'bg-primary/5')} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const id = Number(e.dataTransfer.getData('classId')); if (id) void onMove(id, day); }}><button type="button" className={cn('nums mb-2 flex size-7 items-center justify-center rounded-full text-xs font-medium hover:bg-muted', day === today && 'bg-primary text-primary-foreground hover:bg-primary')} onClick={() => onCreate(day)}>{toArabicDigits(date.getDate())}</button><div className="space-y-1.5">{dayEvents.slice(0, 3).map((event) => <ClassEventChip key={event.id} event={event} onOpen={onOpen} compact />)}{dayEvents.length > 3 ? <p className="text-[10px] text-muted-foreground">+ {toArabicDigits(dayEvents.length - 3)} جلسات</p> : null}</div></div>; })}</div></div></div></Card>
  );
}

function ClassEventChip({ event, onOpen, compact = false }: { event: CalendarEvent; onOpen: (id: number) => void; compact?: boolean }) {
  return (
    <button
      type="button"
      draggable
      onDragStart={(e) => e.dataTransfer.setData('classId', String(event.id))}
      onClick={() => onOpen(event.id)}
      title={`${displayTime(event.startTime)} ${event.title} · ${event.trainerName}`}
      className={cn('w-full overflow-hidden rounded-lg border-s-[3px] px-2 py-1.5 text-start transition hover:brightness-110', compact ? 'text-[10px]' : 'text-xs', event.status === 'cancelled' && 'opacity-45 line-through')}
      style={{ backgroundColor: withAlpha(event.color, 0.12), borderInlineStartColor: event.color }}
    >
      <span className="nums font-semibold" dir="ltr" style={{ color: event.color }}>{displayTime(event.startTime)}</span>{' '}
      <span className="font-medium text-foreground">{event.title}</span>
      {!compact ? <><span className="mt-1 block truncate text-[11px] text-muted-foreground">{event.trainerName || 'بدون مدرب'}</span><span className="nums mt-1 block text-[10px] text-muted-foreground"><Users className="me-1 inline size-3" />{toArabicDigits(event.enrollmentCount)} / {toArabicDigits(event.maxCapacity)}</span></> : null}
    </button>
  );
}
