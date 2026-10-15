import type { ColumnDef } from '@tanstack/react-table';
import { useQuery } from '@tanstack/react-query';
import { Eye, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Combobox } from '@/components/common/combobox';
import { DataTable } from '@/components/common/data-table';
import { DateText, Money } from '@/components/common/formatters';
import { FilterBar } from '@/components/common/filter-bar';
import { PageHeader } from '@/components/common/page-header';
import { StatusBadge } from '@/components/common/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { usePermission } from '@/hooks/use-permission';
import { api, apiError } from '@/lib/api';
import { usePaginatedList } from '@/lib/api-hooks';
import { fetchAllReportRows } from '@/lib/report-fetch';
import { useListQuery } from '@/lib/use-list-query';
import { toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';
import type { EmployeeListItem } from '@/types/employees';

interface SettlementRow {
  id: number;
  settlement_number: number;
  employee_id: number;
  employee_name: string;
  termination_date: string;
  service_years: string;
  unused_leave_compensation: string;
  end_of_service_benefit: string;
  income_tax: string;
  gross_entitlements: string;
  total_deductions: string;
  net_payable: string;
  status: 'draft' | 'approved' | 'posted' | 'paid';
  policy_version: string;
  tax_policy_version: string;
  calculation_snapshot?: Record<string, unknown>;
}

const statusKey = (status: SettlementRow['status']) =>
  status === 'paid' ? 'paid' : status === 'approved' ? 'approved' : status === 'posted' ? 'info' : 'pending';

export function FinalSettlementsPage() {
  const { ui } = useLocale();
  const { can } = usePermission();
  const canCreate = can('payroll.final_settlements:create');
  const canApprove = can('payroll.final_settlements:approve');
  const canExecute = can('payroll.final_settlements:execute');
  const { params, setParams } = useListQuery();
  const { data, isLoading, isError, refetch } = usePaginatedList<SettlementRow>('payroll/final-settlements', params);
  const [formOpen, setFormOpen] = useState(false);
  const [detail, setDetail] = useState<SettlementRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ employeeId: '', terminationDate: '', otherEarnings: '', otherDeductions: '', reason: '' });
  const { data: employeeOptions = [] } = useQuery({
    queryKey: ['employees', 'resigned-settlement-options'],
    queryFn: async () => {
      const rows = await fetchAllReportRows<EmployeeListItem>('/employees', { status: 'resigned' }, 200);
      return rows.map((row) => ({ value: String(row.id), label: `${row.employee ?? '—'} (${row.emp_code ?? '—'})` }));
    },
  });

  const columns = useMemo<ColumnDef<SettlementRow>[]>(() => [
    { accessorKey: 'settlement_number', header: ui('رقم التسوية'), cell: ({ getValue }) => toArabicDigits(getValue() as number) },
    { accessorKey: 'employee_name', header: ui('الموظف') },
    { accessorKey: 'termination_date', header: ui('آخر يوم عمل'), cell: ({ getValue }) => <DateText value={String(getValue())} /> },
    { accessorKey: 'net_payable', header: ui('صافي المستحق'), cell: ({ getValue }) => <Money value={Number(getValue())} /> },
    { accessorKey: 'status', header: ui('الحالة'), cell: ({ row }) => <StatusBadge status={statusKey(row.original.status)} label={ui(row.original.status === 'draft' ? ui('مسودة') : row.original.status === 'approved' ? ui('معتمدة') : row.original.status === 'posted' ? ui('مرحلة') : ui('مصروفة'))} /> },
    { id: 'actions', header: ui('التفاصيل'), cell: ({ row }) => <Button permissionAction={null} variant="ghost" size="icon" aria-label={ui('عرض التسوية')} onClick={() => void openDetail(row.original.id)}><Eye className="size-4" /></Button> },
  ], [ui]);

  const openDetail = async (id: number) => {
    try { setDetail((await api.get<SettlementRow>(`/payroll/final-settlements/${id}`)).data); }
    catch (error) { toast.error(apiError(error, ui('تعذر تحميل التسوية'))); }
  };

  const create = async () => {
    if (!canCreate || saving) return;
    if (!form.employeeId || !form.terminationDate) { toast.error(ui('الموظف وتاريخ آخر يوم عمل مطلوبان')); return; }
    setSaving(true);
    try {
      const response = await api.post<SettlementRow>('/payroll/final-settlements', {
        employeeId: Number(form.employeeId), terminationDate: form.terminationDate,
        otherEarnings: Number(form.otherEarnings || 0), otherDeductions: Number(form.otherDeductions || 0), reason: form.reason.trim() || undefined,
      });
      toast.success(ui('تم احتساب التسوية وحفظ snapshot المراجعة'));
      setFormOpen(false); setDetail(response.data); await refetch();
    } catch (error) { toast.error(apiError(error, ui('تعذر إنشاء التسوية النهائية'))); }
    finally { setSaving(false); }
  };

  const action = async (name: 'approve' | 'post' | 'pay') => {
    if (!detail) return;
    try {
      setDetail((await api.post<SettlementRow>(`/payroll/final-settlements/${detail.id}/${name}`)).data);
      toast.success(ui('تم تنفيذ خطوة التسوية')); await refetch();
    } catch (error) { toast.error(apiError(error, ui('تعذر تنفيذ الخطوة'))); }
  };

  return <div className="space-y-6">
    <PageHeader title={ui('التسويات النهائية')} description={ui('احتساب موثق لنهاية الخدمة، رصيد الإجازات، السلف، الضريبة، ثم الاعتماد والترحيل والصرف دون ازدواج مع المسير.')} actions={canCreate ? <Button permissionResource="payroll.final_settlements" permissionAction="create" size="sm" onClick={() => setFormOpen(true)}><Plus className="size-4" />{ui('تسوية جديدة')}</Button> : null} />
    <FilterBar searchPlaceholder={ui('بحث باسم الموظف أو رقم التسوية…')} />
    <DataTable
      exportSource={{ resource: 'payroll/final-settlements', params }} columns={columns} data={data?.data ?? []} total={data?.total ?? 0} page={params.page} pageSize={params.pageSize} onPageChange={(page) => setParams({ page })} onPageSizeChange={(pageSize) => setParams({ pageSize, page: 1 })} isLoading={isLoading} isError={isError} onRetry={() => void refetch()} search={params.search} onSearchChange={(search) => setParams({ search, page: 1 })} emptyTitle={ui('لا توجد تسويات نهائية')} />

    <Dialog open={formOpen} onOpenChange={setFormOpen}><DialogContent size="md"><DialogHeader><DialogTitle>{ui('إنشاء تسوية نهائية')}</DialogTitle><DialogDescription>{ui('يجب إنهاء خدمة الموظف أولًا وتسجيل تاريخ آخر يوم عمل. الحساب لن ينجح بلا سياسات منشورة تغطي التاريخ.')}</DialogDescription></DialogHeader><div className="grid gap-4 sm:grid-cols-2"><div className="grid gap-1.5 sm:col-span-2"><Label>{ui('الموظف المنتهية خدمته')}</Label><Combobox value={form.employeeId} onValueChange={(employeeId) => setForm((current) => ({ ...current, employeeId }))} options={employeeOptions} /></div><Field label={ui('آخر يوم عمل')}><Input type="date" value={form.terminationDate} onChange={(event) => setForm((current) => ({ ...current, terminationDate: event.target.value }))} /></Field><Field label={ui('مستحقات أخرى')}><Input type="number" min={0} step="0.01" value={form.otherEarnings} onChange={(event) => setForm((current) => ({ ...current, otherEarnings: event.target.value }))} /></Field><Field label={ui('استقطاعات أخرى')}><Input type="number" min={0} step="0.01" value={form.otherDeductions} onChange={(event) => setForm((current) => ({ ...current, otherDeductions: event.target.value }))} /></Field><Field label={ui('سبب / ملاحظة')}><Input value={form.reason} onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))} /></Field></div><DialogFooter><Button permissionAction={null} variant="outline" onClick={() => setFormOpen(false)}>{ui('إلغاء')}</Button><Button permissionResource="payroll.final_settlements" permissionAction="create" disabled={saving} onClick={() => void create()}>{ui('احتساب وحفظ')}</Button></DialogFooter></DialogContent></Dialog>

    <Dialog open={detail != null} onOpenChange={(value) => { if (!value) setDetail(null); }}><DialogContent size="lg"><DialogHeader><DialogTitle>{ui('تفاصيل التسوية')} #{detail ? toArabicDigits(detail.settlement_number) : ''}</DialogTitle><DialogDescription>{detail?.employee_name}</DialogDescription></DialogHeader>{detail ? <div className="space-y-4"><div className="grid gap-3 sm:grid-cols-3"><Metric label={ui('إجمالي المستحقات')} value={detail.gross_entitlements} /><Metric label={ui('إجمالي الاستقطاعات')} value={detail.total_deductions} /><Metric label={ui('صافي المستحق')} value={detail.net_payable} emphasis /></div><Card><CardContent className="grid gap-3 py-4 text-sm sm:grid-cols-2"><Line label={ui('مقابل رصيد الإجازات')} value={detail.unused_leave_compensation} /><Line label={ui('مكافأة نهاية الخدمة')} value={detail.end_of_service_benefit} /><Line label={ui('ضريبة الدخل')} value={detail.income_tax} /><Line label={ui('مدة الخدمة بالسنوات')} value={detail.service_years} /><Line label={ui('سياسة التسوية')} value={detail.policy_version} /><Line label={ui('سياسة الضريبة')} value={detail.tax_policy_version} /></CardContent></Card></div> : null}<DialogFooter><Button permissionAction={null} variant="outline" onClick={() => setDetail(null)}>{ui('إغلاق')}</Button>{detail?.status === 'draft' && canApprove ? <Button permissionResource="payroll.final_settlements" permissionAction="approve" onClick={() => void action('approve')}>{ui('اعتماد')}</Button> : null}{detail?.status === 'approved' && canExecute ? <Button permissionResource="payroll.final_settlements" permissionAction="execute" onClick={() => void action('post')}>{ui('ترحيل محاسبي')}</Button> : null}{detail?.status === 'posted' && canExecute ? <Button permissionResource="payroll.final_settlements" permissionAction="execute" onClick={() => void action('pay')}>{ui('صرف')}</Button> : null}</DialogFooter></DialogContent></Dialog>
  </div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div className="grid gap-1.5"><Label>{label}</Label>{children}</div>; }
function Metric({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) { return <Card className={emphasis ? 'border-primary/30 bg-primary/5' : undefined}><CardContent className="py-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-xl font-semibold tabular-nums"><Money value={Number(value)} /></p></CardContent></Card>; }
function Line({ label, value }: { label: string; value: string }) { return <div className="flex items-center justify-between gap-3 border-b border-border/50 pb-2"><span className="text-muted-foreground">{label}</span><span className="font-medium">{Number.isFinite(Number(value)) ? toArabicDigits(Number(value).toLocaleString()) : value}</span></div>; }
