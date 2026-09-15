import { useMemo, useState } from 'react';
import { History, Pencil, Plus, Power, TicketPercent, Users, WalletCards } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { api, apiError } from '@/lib/api';
import { usePaginatedList } from '@/lib/api-hooks';
import { useListQuery } from '@/lib/use-list-query';
import { confirm } from '@/lib/confirm';
import { toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';
import { useAuth } from '@/store/auth';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DataTable, type PaginatedResponse } from '@/components/common/data-table';
import { PageHeader } from '@/components/common/page-header';
import { StatusBadge } from '@/components/common/status-badge';
import { useClubT } from '@/hooks/use-club-t';
import type { ClubDiscountCode, ClubMemberListItem, ClubSubscriptionListItem } from '@/types/club';

type DiscountForm = {
  code: string; percentage: string; maxUses: string; validFrom: string; validTo: string;
  audience: 'all_users' | 'specific_users'; memberIds: number[]; isActive: boolean;
};

type PointHistory = { memberId: number; balance: number; transactions: Array<{ id: number; points: number; type: string; action: string | null; occurredAt: string | null; expiryLabel: string | null }> };

const emptyForm: DiscountForm = {
  code: '', percentage: '', maxUses: '', validFrom: '', validTo: '',
  audience: 'all_users', memberIds: [], isActive: true,
};

export function ClubDiscountsPage() {
  const ct = useClubT();
  const { ui } = useLocale();
  const qc = useQueryClient();
  const isSystemAdmin = useAuth((state) => state.user?.level === 1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<DiscountForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [pointMemberId, setPointMemberId] = useState<string>('');
  const [pointAdjustment, setPointAdjustment] = useState({ points: '', reason: '' });
  const [adjustingPoints, setAdjustingPoints] = useState(false);

  const codesQuery = useQuery({
    queryKey: ['club-discount-codes', 'admin'],
    queryFn: async () => (await api.get<ClubDiscountCode[]>('/club-discount-codes', { params: { includeInactive: true } })).data ?? [],
  });
  const membersQuery = useQuery({
    queryKey: ['club-members', 'discount-code-options'],
    queryFn: async () => (await api.get<PaginatedResponse<ClubMemberListItem>>('/club-members/select-options', {
      params: { page: 1, pageSize: 500, isActive: true },
    })).data.data ?? [],
  });
  const pointHistory = useQuery({
    queryKey: ['club-member-points', pointMemberId],
    enabled: Boolean(pointMemberId),
    queryFn: async () => (await api.get<PointHistory>(`/club-members/${pointMemberId}/point-history`)).data,
  });

  const openCreate = () => { setEditId(null); setForm(emptyForm); setDialogOpen(true); };
  const openEdit = (row: ClubDiscountCode) => {
    setEditId(row.id);
    setForm({
      code: row.code, percentage: String(row.percentage),
      maxUses: row.maxUses == null ? '' : String(row.maxUses),
      validFrom: row.validFrom ?? '', validTo: row.validTo ?? '', audience: row.audience,
      memberIds: row.memberIds, isActive: row.isActive,
    });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!form.code.trim() || !Number(form.percentage)) return toast.error(ui('اسم الكود ونسبة الخصم مطلوبان'));
    if (form.audience === 'specific_users' && form.memberIds.length === 0) return toast.error(ui('اختر عضوًا واحدًا على الأقل'));
    setSaving(true);
    try {
      const body = {
        code: form.code, percentage: Number(form.percentage),
        maxUses: form.maxUses ? Number(form.maxUses) : null,
        validFrom: form.validFrom || null, validTo: form.validTo || null,
        audience: form.audience, memberIds: form.audience === 'specific_users' ? form.memberIds : [],
        isActive: form.isActive,
      };
      if (editId) await api.put(`/club-discount-codes/${editId}`, body);
      else await api.post('/club-discount-codes', body);
      toast.success(ui('تم حفظ كود الخصم'));
      setDialogOpen(false);
      void qc.invalidateQueries({ queryKey: ['club-discount-codes'] });
    } catch (error) { toast.error(apiError(error)); } finally { setSaving(false); }
  };

  const savePointAdjustment = async () => {
    const points = Number(pointAdjustment.points);
    if (!pointMemberId || !Number.isInteger(points) || points === 0 || !pointAdjustment.reason.trim()) {
      return toast.error(ui('اختر العضو وأدخل عدد نقاط صحيحًا وسبب التعديل'));
    }
    setAdjustingPoints(true);
    try {
      await api.post(`/club-members/${pointMemberId}/point-adjustments`, { points, reason: pointAdjustment.reason });
      setPointAdjustment({ points: '', reason: '' });
      toast.success(ui('تم تسجيل تعديل النقاط'));
      void pointHistory.refetch();
    } catch (error) { toast.error(apiError(error)); } finally { setAdjustingPoints(false); }
  };

  const codeColumns = useMemo<ColumnDef<ClubDiscountCode>[]>(() => [
    { accessorKey: 'code', header: ui('كود الخصم'), cell: ({ getValue }) => <b dir="ltr" className="tracking-wider">{String(getValue())}</b> },
    { accessorKey: 'percentage', header: ui('النسبة'), cell: ({ getValue }) => <span className="nums">{toArabicDigits(Number(getValue()))}%</span> },
    { accessorKey: 'usageCount', header: ui('الاستخدامات'), cell: ({ row }) => <span className="nums">{toArabicDigits(row.original.usageCount)} / {row.original.maxUses == null ? '∞' : toArabicDigits(row.original.maxUses)}</span> },
    { id: 'validity', header: ui('فترة الصلاحية'), cell: ({ row }) => <span className="text-xs">{row.original.validFrom || ui('بدون بداية')} — {row.original.validTo || ui('بدون نهاية')}</span> },
    { accessorKey: 'audience', header: ui('المتاح لـ'), cell: ({ row }) => row.original.audience === 'specific_users' ? `${ui('أعضاء محددون')} (${toArabicDigits(row.original.memberIds.length)})` : ui('كل الأعضاء') },
    { accessorKey: 'isActive', header: ui('الحالة'), cell: ({ getValue }) => <StatusBadge status={getValue() ? 'active' : 'suspended'} label={getValue() ? ui('نشط') : ui('غير نشط')} /> },
    { id: 'actions', header: ui('إجراءات'), cell: ({ row }) => isSystemAdmin ? <div className="flex gap-1">
      <Button variant="ghost" size="icon" aria-label={ui('تعديل')} onClick={() => openEdit(row.original)}><Pencil className="h-4 w-4" /></Button>
      {row.original.isActive && <Button variant="ghost" size="icon" aria-label={ui('إيقاف')} onClick={() => void (async () => {
        if (await confirm({ title: ui('إيقاف كود الخصم؟'), description: ui('لن يمكن استخدامه في اشتراكات جديدة.'), variant: 'destructive' })) {
          try {
            await api.delete(`/club-discount-codes/${row.original.id}`);
            toast.success(ui('تم إيقاف الكود'));
            void qc.invalidateQueries({ queryKey: ['club-discount-codes'] });
          } catch (error) { toast.error(apiError(error)); }
        }
      })()}><Power className="h-4 w-4 text-destructive" /></Button>}
    </div> : <span className="text-xs text-muted-foreground">{ui('عرض فقط')}</span> },
  ], [isSystemAdmin, qc, ui]);

  const { params, setParams } = useListQuery({ filters: { hasDiscount: 'true' } });
  const report = usePaginatedList<ClubSubscriptionListItem>('club-subscriptions', params);
  const reportColumns = useMemo<ColumnDef<ClubSubscriptionListItem>[]>(() => [
    { accessorKey: 'subscriptionNumber', header: ct('subscriptions.subNumber') },
    { accessorKey: 'customerName', header: ct('common.customer') },
    { accessorKey: 'subscriptionValue', header: ct('subscriptions.value') },
    { accessorKey: 'discountValue', header: ct('subscriptions.discountValue'), cell: ({ getValue }) => <span className="nums text-green-600">-{toArabicDigits(Number(getValue()))}</span> },
    { id: 'net', header: ct('subscriptions.netValue'), cell: ({ row }) => <span className="nums font-medium">{toArabicDigits(row.original.subscriptionValue - (row.original.discountValue ?? 0))}</span> },
    { accessorKey: 'status', header: ct('common.status') },
  ], [ct]);

  const pointColumns = useMemo<ColumnDef<PointHistory['transactions'][number]>[]>(() => [
    { accessorKey: 'occurredAt', header: ui('التاريخ'), cell: ({ getValue }) => String(getValue() ?? '—').slice(0, 10) },
    { accessorKey: 'type', header: ui('النوع'), cell: ({ row }) => row.original.type === 'manual_adjustment' ? ui('تعديل يدوي') : row.original.type },
    { accessorKey: 'action', header: ui('السبب / العملية'), cell: ({ getValue }) => String(getValue() ?? '—') },
    { accessorKey: 'points', header: ui('النقاط'), cell: ({ getValue }) => <span className={Number(getValue()) < 0 ? 'nums text-destructive' : 'nums text-emerald-700'}>{Number(getValue()) > 0 ? '+' : ''}{toArabicDigits(Number(getValue()))}</span> },
  ], [ui]);

  return <div className="space-y-6">
    <PageHeader title={ui('إدارة النقاط وأكواد الخصم')} description={ui('أكواد الخصم وسجل نقاط العضو في مساحة إدارية واحدة، مع تعديلات موثقة لا تغيّر التاريخ السابق.')} actions={isSystemAdmin ? <Button onClick={openCreate}><Plus className="h-4 w-4" />{ui('كود خصم جديد')}</Button> : undefined} />
    <Tabs defaultValue="codes" dir="rtl">
      <TabsList className="h-auto flex-wrap">
        <TabsTrigger value="codes" className="min-h-11 gap-2"><TicketPercent className="h-4 w-4" />{ui('أكواد الخصم')}</TabsTrigger>
        <TabsTrigger value="report" className="min-h-11 gap-2"><Users className="h-4 w-4" />{ui('سجل الخصومات')}</TabsTrigger>
        <TabsTrigger value="points" className="min-h-11 gap-2"><WalletCards className="h-4 w-4" />{ui('سجل النقاط')}</TabsTrigger>
      </TabsList>
      <TabsContent value="codes" className="mt-5"><DataTable columns={codeColumns} data={codesQuery.data ?? []} total={codesQuery.data?.length ?? 0} page={1} pageSize={Math.max(codesQuery.data?.length ?? 0, 10)} onPageChange={() => {}} isLoading={codesQuery.isLoading} isError={codesQuery.isError} onRetry={() => void codesQuery.refetch()} emptyTitle={ui('لا توجد أكواد خصم')} enableExport={false} /></TabsContent>
      <TabsContent value="report" className="mt-5"><DataTable columns={reportColumns} data={report.data?.data ?? []} total={report.data?.total ?? 0} page={params.page} pageSize={params.pageSize} onPageChange={(page) => setParams({ page })} onPageSizeChange={(pageSize) => setParams({ pageSize, page: 1 })} search={params.search} onSearchChange={(search) => setParams({ search, page: 1 })} isLoading={report.isLoading} isError={report.isError} onRetry={() => void report.refetch()} emptyTitle={ct('common.noData')} /></TabsContent>
      <TabsContent value="points" className="mt-5 space-y-5">
        <div className="grid gap-3 rounded-xl border bg-card p-4 md:grid-cols-[minmax(0,1fr)_10rem_minmax(0,1fr)_auto] md:items-end">
          <div className="grid gap-2"><Label htmlFor="points-member">{ui('العضو')}</Label><select id="points-member" className="min-h-10 rounded-md border bg-background px-3" value={pointMemberId} onChange={(event) => setPointMemberId(event.target.value)}><option value="">{ui('اختر عضوًا')}</option>{(membersQuery.data ?? []).map((member) => <option key={member.id} value={member.id}>{member.name} · {member.memberCode}</option>)}</select></div>
          {isSystemAdmin ? <>
            <div className="grid gap-2"><Label htmlFor="points-adjustment">{ui('تعديل نقاط')}</Label><Input id="points-adjustment" type="number" step="1" value={pointAdjustment.points} onChange={(event) => setPointAdjustment({ ...pointAdjustment, points: event.target.value })} placeholder="+50 / -50" /></div>
            <div className="grid gap-2"><Label htmlFor="points-reason">{ui('سبب التعديل')}</Label><Input id="points-reason" value={pointAdjustment.reason} onChange={(event) => setPointAdjustment({ ...pointAdjustment, reason: event.target.value })} placeholder={ui('مثال: تصحيح إداري')} /></div>
            <Button onClick={() => void savePointAdjustment()} disabled={adjustingPoints || !pointMemberId}><History className="h-4 w-4" />{adjustingPoints ? ui('جاري الحفظ…') : ui('حفظ التعديل')}</Button>
          </> : <p className="self-center text-sm text-muted-foreground md:col-span-3">{ui('تعديل النقاط اليدوي متاح لمدير النظام فقط.')}</p>}
        </div>
        {pointMemberId ? <DataTable columns={pointColumns} data={pointHistory.data?.transactions ?? []} total={pointHistory.data?.transactions.length ?? 0} page={1} pageSize={100} onPageChange={() => {}} isLoading={pointHistory.isLoading} isError={pointHistory.isError} onRetry={() => void pointHistory.refetch()} emptyTitle={ui('لا توجد عمليات نقاط')} enableExport={false} toolbar={<span className="nums text-sm font-semibold">{ui('الرصيد الحالي')}: {toArabicDigits(pointHistory.data?.balance ?? 0)}</span>} /> : <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">{ui('اختر عضوًا لعرض سجل النقاط وإضافة تعديل يدوي موثق.')}</div>}
      </TabsContent>
    </Tabs>

    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <DialogContent size="lg">
        <DialogHeader><DialogTitle>{editId ? ui('تعديل كود الخصم') : ui('إضافة كود خصم')}</DialogTitle></DialogHeader>
        <div className="grid gap-4 py-2 sm:grid-cols-2">
          <div className="grid gap-2"><Label htmlFor="discount-code-name">{ui('اسم الكود')}</Label><Input id="discount-code-name" dir="ltr" className="text-left uppercase" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="SUMMER20" /></div>
          <div className="grid gap-2"><Label htmlFor="discount-percentage">{ui('نسبة الخصم %')}</Label><Input id="discount-percentage" type="number" min="0.001" max="100" value={form.percentage} onChange={(e) => setForm({ ...form, percentage: e.target.value })} /></div>
          <div className="grid gap-2"><Label htmlFor="discount-max-uses">{ui('عدد الاستخدامات')}</Label><Input id="discount-max-uses" type="number" min="1" value={form.maxUses} onChange={(e) => setForm({ ...form, maxUses: e.target.value })} placeholder={ui('غير محدود')} /></div>
          <div className="grid gap-2"><Label htmlFor="discount-audience">{ui('نطاق الاستخدام')}</Label><select id="discount-audience" className="min-h-10 rounded-md border bg-background px-3" value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value as DiscountForm['audience'], memberIds: [] })}><option value="all_users">{ui('كل الأعضاء')}</option><option value="specific_users">{ui('أعضاء محددون')}</option></select></div>
          <div className="grid gap-2"><Label htmlFor="discount-valid-from">{ui('من تاريخ')}</Label><Input id="discount-valid-from" type="date" value={form.validFrom} onChange={(e) => setForm({ ...form, validFrom: e.target.value })} /></div>
          <div className="grid gap-2"><Label htmlFor="discount-valid-to">{ui('إلى تاريخ')}</Label><Input id="discount-valid-to" type="date" value={form.validTo} onChange={(e) => setForm({ ...form, validTo: e.target.value })} /></div>
          {form.audience === 'specific_users' && <div className="grid gap-2 sm:col-span-2"><Label htmlFor="discount-members">{ui('الأعضاء المسموح لهم')}</Label><select id="discount-members" multiple className="min-h-40 rounded-md border bg-background p-2" value={form.memberIds.map(String)} onChange={(e) => setForm({ ...form, memberIds: Array.from(e.target.selectedOptions, (option) => Number(option.value)) })}>{(membersQuery.data ?? []).map((member) => <option key={member.id} value={member.id}>{member.name} · {member.memberCode} · {member.phone ?? ui('بدون هاتف')}</option>)}</select><p className="text-xs text-muted-foreground">{ui('يمكن اختيار أكثر من عضو.')}</p></div>}
          <div className="flex min-h-11 items-center gap-3 sm:col-span-2"><Switch id="discountActive" checked={form.isActive} onCheckedChange={(isActive) => setForm({ ...form, isActive })} /><Label htmlFor="discountActive">{ui('الكود نشط ومتاح للاستخدام')}</Label></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>{ui('إلغاء')}</Button><Button onClick={() => void save()} disabled={saving}>{saving ? ui('جاري الحفظ…') : ui('حفظ')}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </div>;
}
