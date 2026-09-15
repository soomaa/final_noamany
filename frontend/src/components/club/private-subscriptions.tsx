import type { ColumnDef } from '@tanstack/react-table';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Layers3, Pencil, Plus, Save, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { DataTable } from '@/components/common/data-table';
import { clubPaymentMethodLabel } from '@/components/club/club-payment-method-select';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useBranches } from '@/hooks/use-branches';
import { usePermission } from '@/hooks/use-permission';
import { useClubT } from '@/hooks/use-club-t';
import { api, apiError } from '@/lib/api';
import { usePaginatedList } from '@/lib/api-hooks';
import { formatMoney } from '@/lib/formatters';
import { useListQuery } from '@/lib/use-list-query';
import { toArabicDigits } from '@/lib/utils';
import type { ClubPrivateEnrollment, ClubPrivatePackage } from '@/types/club';

export function PrivatePackageCatalog() {
  const qc = useQueryClient();
  const { can } = usePermission();
  const canCreate = can('club.subscriptions.special:create') || can('club.subscriptions:create');
  const canUpdate = can('club.subscriptions.special:update') || can('club.subscriptions:update');
  const canDelete = can('club.subscriptions.special:delete') || can('club.subscriptions:delete');
  const { data: branches = [] } = useBranches();
  const { data: packages = [], isLoading } = useQuery({
    queryKey: ['club-private-subscriptions', 'packages'],
    queryFn: async () => (await api.get<ClubPrivatePackage[]>('/club-private-subscriptions/packages')).data,
  });
  const empty = { kind: 'subscription' as const, name: '', price: '', durationDays: '30', sessionsCount: '', branchIds: [] as number[] };
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<{ kind: 'subscription' | 'sessions'; name: string; price: string; durationDays: string; sessionsCount: string; branchIds: number[] }>(empty);

  const openCreate = () => { setEditId(null); setForm({ ...empty, branchIds: branches.map((b) => b.id) }); setOpen(true); };
  const openEdit = (item: ClubPrivatePackage) => {
    setEditId(item.id);
    setForm({ kind: item.kind, name: item.name, price: String(item.price), durationDays: String(item.durationDays), sessionsCount: item.sessionsCount == null ? '' : String(item.sessionsCount), branchIds: item.branchIds });
    setOpen(true);
  };
  const save = async () => {
    if (!form.name.trim() || Number(form.price) < 0 || Number(form.durationDays) < 1 || !form.branchIds.length) {
      toast.error('أكمل اسم الباقة والسعر والمدة واختر فرعًا واحدًا على الأقل'); return;
    }
    if (form.kind === 'sessions' && Number(form.sessionsCount) < 1) { toast.error('عدد الحصص مطلوب'); return; }
    setSaving(true);
    try {
      const payload = { kind: form.kind, name: form.name.trim(), price: Number(form.price), durationDays: Number(form.durationDays), sessionsCount: form.kind === 'sessions' ? Number(form.sessionsCount) : undefined, branchIds: form.branchIds };
      if (editId) await api.put(`/club-private-subscriptions/packages/${editId}`, payload);
      else await api.post('/club-private-subscriptions/packages', payload);
      toast.success('تم حفظ باقة البرايفت'); setOpen(false);
      void qc.invalidateQueries({ queryKey: ['club-private-subscriptions'] });
    } catch (error) { toast.error(apiError(error)); } finally { setSaving(false); }
  };
  const deactivate = async (id: number) => {
    if (!window.confirm('هل تريد إيقاف هذه الباقة؟ الاشتراكات المسجلة لن تتأثر.')) return;
    try { await api.delete(`/club-private-subscriptions/packages/${id}`); toast.success('تم إيقاف الباقة'); void qc.invalidateQueries({ queryKey: ['club-private-subscriptions'] }); }
    catch (error) { toast.error(apiError(error)); }
  };

  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card p-5 shadow-sm">
      <div><h2 className="text-lg font-bold">باقات اشتراكات البرايفت</h2><p className="mt-1 text-sm text-muted-foreground">أنشئ اشتراكًا بمدة، أو باقة حصص مرتبطة بمدرب خاص.</p></div>
      {canCreate ? <Button variant="brand" onClick={openCreate}><Plus className="size-4" /> إضافة اشتراك برايفت</Button> : null}
    </div>
    {!isLoading && !packages.length ? <div className="rounded-2xl border border-dashed p-12 text-center text-muted-foreground">لا توجد باقات برايفت بعد.</div> : null}
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {packages.map((item) => <Card key={item.id} className="overflow-hidden border-primary/15 shadow-sm">
        <CardHeader className="bg-gradient-to-l from-primary/10 to-transparent pb-3"><div className="flex items-start justify-between gap-3"><div><span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">{item.kind === 'sessions' ? 'حصص برايفت' : 'اشتراك برايفت'}</span><CardTitle className="mt-3 text-lg">{item.name}</CardTitle></div><Layers3 className="size-6 text-primary" /></div></CardHeader>
        <CardContent className="space-y-3 pt-4 text-sm"><div className="grid grid-cols-2 gap-3"><div className="rounded-xl bg-muted/50 p-3"><span className="block text-xs text-muted-foreground">القيمة</span><b>{formatMoney(item.price)}</b></div><div className="rounded-xl bg-muted/50 p-3"><span className="block text-xs text-muted-foreground">الصلاحية</span><b className="nums">{toArabicDigits(item.durationDays)} يوم</b></div></div>{item.kind === 'sessions' ? <p className="font-medium">عدد الحصص: <span className="nums">{toArabicDigits(item.sessionsCount ?? 0)}</span></p> : null}<p className="text-muted-foreground">{item.branchIds.map((id) => branches.find((b) => b.id === id)?.name).filter(Boolean).join('، ') || '—'}</p>{canUpdate || canDelete ? <div className="flex gap-2 pt-2">{canUpdate ? <Button size="sm" variant="outline" onClick={() => openEdit(item)}><Pencil className="size-4" /> تعديل</Button> : null}{canDelete ? <Button size="sm" variant="ghost" className="text-destructive" onClick={() => void deactivate(item.id)}><Trash2 className="size-4" /> إيقاف</Button> : null}</div> : null}</CardContent>
      </Card>)}
    </div>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent size="lg" dir="rtl" aria-describedby={undefined}><DialogHeader><DialogTitle>{editId ? 'تعديل اشتراك برايفت' : 'إضافة اشتراك برايفت'}</DialogTitle></DialogHeader><div className="space-y-5">
      <Tabs value={form.kind} onValueChange={(kind) => setForm((f) => ({ ...f, kind: kind as 'subscription' | 'sessions', sessionsCount: kind === 'sessions' ? f.sessionsCount : '' }))}><TabsList className="grid w-full grid-cols-2"><TabsTrigger value="subscription">اشتراك</TabsTrigger><TabsTrigger value="sessions">حصص</TabsTrigger></TabsList></Tabs>
      <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>اسم الاشتراك *</Label><Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></div><div className="space-y-2"><Label>قيمة الاشتراك (جنيه) *</Label><Input type="number" min={0} className="nums" value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} /></div><div className="space-y-2"><Label>صلاحية الباقة (بالأيام) *</Label><Input type="number" min={1} className="nums" value={form.durationDays} onChange={(e) => setForm((f) => ({ ...f, durationDays: e.target.value }))} /></div>{form.kind === 'sessions' ? <div className="space-y-2"><Label>عدد الحصص *</Label><Input type="number" min={1} className="nums" value={form.sessionsCount} onChange={(e) => setForm((f) => ({ ...f, sessionsCount: e.target.value }))} /></div> : null}</div>
      <div className="space-y-2"><Label>الفروع *</Label><div className="grid gap-2 rounded-xl border bg-muted/20 p-3 sm:grid-cols-2">{branches.map((branch) => <label key={branch.id} className="flex cursor-pointer items-center gap-2 rounded-lg bg-background px-3 py-2"><input type="checkbox" checked={form.branchIds.includes(branch.id)} onChange={(e) => setForm((f) => ({ ...f, branchIds: e.target.checked ? [...f.branchIds, branch.id] : f.branchIds.filter((id) => id !== branch.id) }))} />{branch.name}</label>)}</div></div>
    </div><DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button><Button variant="brand" disabled={saving} onClick={() => void save()}><Save className="size-4" /> حفظ</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}

export function PrivateEnrollmentsList() {
  const ct = useClubT();
  const { params, setParams } = useListQuery();
  const { data, isLoading, isError, refetch } = usePaginatedList<ClubPrivateEnrollment>('club-private-subscriptions/enrollments', params);
  const columns = useMemo<ColumnDef<ClubPrivateEnrollment>[]>(() => [
    { id: 'index', header: '#', cell: ({ row }) => <span className="nums">{toArabicDigits((params.page - 1) * params.pageSize + row.index + 1)}</span> },
    { accessorKey: 'memberCode', header: 'كود العضو' }, { accessorKey: 'memberName', header: 'اسم العضو' }, { accessorKey: 'trainerName', header: 'اسم المدرب' },
    { accessorKey: 'subscriptionType', header: 'نوع الاشتراك' }, { accessorKey: 'registrationDate', header: 'تاريخ التسجيل' },
    { id: 'period', header: 'بداية من / إلى تاريخ', cell: ({ row }) => <span className="nums whitespace-nowrap">{toArabicDigits(row.original.startDate)} — {toArabicDigits(row.original.endDate)}</span> },
    { accessorKey: 'sessionsCount', header: 'عدد الحصص', cell: ({ getValue }) => getValue() == null ? '—' : toArabicDigits(getValue() as number) },
    { accessorKey: 'subscriptionValue', header: 'قيمة الاشتراك', cell: ({ getValue }) => formatMoney(getValue() as number) },
    { accessorKey: 'discountType', header: 'نوع الخصم', cell: ({ getValue }) => (getValue() as string | null) || '—' },
    { accessorKey: 'discountValue', header: 'قيمة الخصم', cell: ({ getValue }) => formatMoney(getValue() as number) },
    { accessorKey: 'paidAmount', header: 'المدفوع', cell: ({ getValue }) => formatMoney(getValue() as number) },
    { accessorKey: 'remainingAmount', header: 'الباقي', cell: ({ getValue }) => formatMoney(getValue() as number) },
    { accessorKey: 'receiptNumber', header: 'رقم الإيصال', cell: ({ getValue }) => (getValue() as string | null) || '—' },
    {
      accessorKey: 'gender',
      header: 'رجالي - حريمي',
      cell: ({ getValue }) => getValue() === 'female'
        ? 'حريمي'
        : getValue() === 'male'
          ? 'رجالي'
          : '—',
    },
    {
      id: 'paymentMethod',
      header: 'طريقة الدفع',
      cell: ({ row }) => row.original.paymentMethods?.length
        ? row.original.paymentMethods.map((method) => clubPaymentMethodLabel(ct, method)).join(' + ')
        : clubPaymentMethodLabel(ct, row.original.paymentMethod),
    },
    { accessorKey: 'createdByName', header: 'القائم بالإضافة', cell: ({ getValue }) => (getValue() as string | null) || '—' },
    { accessorKey: 'status', header: 'الحالة', cell: ({ getValue }) => ({ active: 'نشط', expired: 'منتهي', upcoming: 'قادم', frozen: 'موقوف' }[getValue() as string] ?? getValue()) },
    { id: 'actions', header: 'الإجراء', cell: () => '—' },
  ], [ct, params.page, params.pageSize]);
  return <DataTable columns={columns} data={data?.data ?? []} total={data?.total ?? 0} page={params.page} pageSize={params.pageSize} onPageChange={(page) => setParams({ page })} onPageSizeChange={(pageSize) => setParams({ pageSize, page: 1 })} search={params.search} onSearchChange={(search) => setParams({ search, page: 1 })} isLoading={isLoading} isError={isError} onRetry={() => void refetch()} emptyTitle="لا توجد اشتراكات برايفت مسجلة" />;
}
