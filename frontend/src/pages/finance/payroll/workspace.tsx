import { MonthlyEmployeeSheet } from './monthly-employee-sheet';
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { ArrowLeft, ArrowRight, ExternalLink, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { DataTable } from '@/components/common/data-table';
import { Money } from '@/components/common/formatters';
import { PageHeader } from '@/components/common/page-header';
import { EmptyState, ErrorState } from '@/components/common/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { usePermission } from '@/hooks/use-permission';
import { apiError } from '@/lib/api';
import { confirm } from '@/lib/confirm';
import { toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';
import { payrollApi } from './payroll-api';
import { payrollActionDescriptions, payrollActionLabels, payrollActionPermission, payrollActions, payrollPeriodLabel, payrollStatusLabels } from './payroll-model';
import type { PayrollAction, PayrollLine } from './types';

type Mode = 'preparation' | 'approval';
export function PayrollWorkspace({ mode }: { mode: Mode }) {
  const { ui } = useLocale();
  const { can } = usePermission();
  const qc = useQueryClient();
  const now = new Date();
  const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
  const [payoutDate, setPayoutDate] = useState('');
  const [runPage, setRunPage] = useState(1);
  const [status, setStatus] = useState(mode === 'approval' ? 'reviewing' : '');
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null);
  const [itemId, setItemId] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState('');
  const canView = can('payroll.runs:view');
  const canPrepare = can('financial-reports.payroll:update');
  const canApprove = can('financial-reports.payroll_approval:approve');
  const runs = useQuery({ queryKey: ['finance-payroll', 'runs', runPage, status], queryFn: () => payrollApi.list({ page: runPage, pageSize: 20, status: status || undefined }), enabled: canView });
  useEffect(() => {
    if (!runs.data) return;
    setSelectedRunId((id) => runs.data.data.some((run) => run.id === id) ? id : runs.data.data[0]?.id ?? null);
  }, [runs.data]);
  useEffect(() => { setPage(1); setSearch(''); setItemId(null); }, [selectedRunId]);
  const detail = useQuery({ queryKey: ['finance-payroll', 'run', selectedRunId], queryFn: () => payrollApi.get(selectedRunId!), enabled: selectedRunId != null && canView });
  const lines = useQuery({ queryKey: ['finance-payroll', 'lines', selectedRunId, page, pageSize, search], queryFn: () => payrollApi.lines(selectedRunId!, { page, pageSize, search }), enabled: selectedRunId != null && canView });
  const refresh = async () => {
    await Promise.all(['finance-payroll', 'payroll/runs', 'payroll', 'finance', 'expenses', 'accounting'].map((key) => qc.invalidateQueries({ queryKey: [key] })));
    if (selectedRunId) await qc.invalidateQueries({ queryKey: [`payroll/runs/${selectedRunId}/lines`] });
  };
  const create = useMutation({ mutationFn: payrollApi.create, onSuccess: async (run) => { setStatus(''); setRunPage(1); setSelectedRunId(run.id); toast.success(ui('تم إنشاء المرتبات الشهرية')); await refresh(); }, onError: (error) => toast.error(apiError(error)) });
  const action = useMutation({ mutationFn: ({ id, name }: { id: number; name: PayrollAction }) => payrollApi.action(id, name), onSuccess: async (run) => {
    if (run.bankFile) {
      const url = URL.createObjectURL(new Blob([run.bankFile.content], { type: 'text/csv;charset=utf-8' }));
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = run.bankFile.filename; anchor.click(); URL.revokeObjectURL(url);
    }
    setStatus(''); setSelectedRunId(run.id); toast.success(ui('تم تنفيذ خطوة الرواتب')); await refresh();
  }, onError: async (error) => { toast.error(apiError(error)); await refresh(); } });
  const busy = create.isPending || action.isPending;
  const run = detail.data;
  const runAction = async (name: PayrollAction) => {
    if (!run || busy) return;
    const accepted = await confirm({ title: ui(payrollActionLabels[name]), description: ui(payrollActionDescriptions[name]), confirmLabel: ui(payrollActionLabels[name]) });
    if (accepted) action.mutate({ id: run.id, name });
  };
  const columns: ColumnDef<PayrollLine>[] = [
    { accessorKey: 'employeeName', header: ui('الموظف'), cell: ({ row }) => <button type="button" className="min-h-11 text-start font-semibold text-primary underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-none" onClick={() => setItemId(row.original.id)}>{row.original.employeeName || ui('عرض الموظف')}<span className="nums mt-1 block text-xs font-normal text-muted-foreground">{toArabicDigits(row.original.empCode ?? '—')}</span></button> },
    { accessorKey: 'basicSalary', header: ui('الأساسي'), cell: ({ row }) => <Money value={row.original.basicSalary} /> },
    { accessorKey: 'allowances', header: ui('البدلات والحوافز'), cell: ({ row }) => <Money value={row.original.allowances} /> },
    { accessorKey: 'deductions', header: ui('الخصومات والضريبة'), cell: ({ row }) => <Money value={row.original.deductions} /> },
    { accessorKey: 'netSalary', header: ui('الصافي'), cell: ({ row }) => <strong className="nums"><Money value={row.original.netSalary} /></strong> },
  ];
  return <div className="space-y-6">
    <PageHeader title={ui(mode === 'preparation' ? ui('المرتبات الشهرية') : ui('اعتماد وتسوية الرواتب'))} description={ui(mode === 'preparation' ? ui('راجع استحقاقات الموظفين وخصوماتهم، ثم أرسل المرتبات الشهرية للمحاسبة.') : ui('راجع المرتبات واعتمدها، ثم تابع الترحيل وملف البنك وتأكيد التسوية.'))} />
    {!canView ? <EmptyState title={ui('يلزم الوصول إلى المرتبات الشهرية')} description={ui('يستخدم هذا القسم صلاحيات وبيانات الرواتب المعتمدة في الموارد البشرية.')} /> : <>
      {mode === 'preparation' && canPrepare && can('payroll.runs:create') && <section className="space-y-4 rounded-xl border bg-card p-5">
        <div><h2 className="font-semibold">{ui('إنشاء مرتبات شهر')}</h2><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{ui('من أول الشهر لآخر يوم فيه. بتفضل محفوظة ومفتوحة للتعديلات لحد الاعتماد؛ تاريخ الصرف للتخطيط، والصرف يحتاج تأكيد فعلي.')}</p></div>
        <div className="flex flex-wrap items-end gap-4"><div className="grid gap-2"><Label htmlFor="financePayrollMonth">{ui('شهر الرواتب')}</Label><Input id="financePayrollMonth" type="month" min="2000-01" value={month} onChange={(event) => { setMonth(event.target.value); setPayoutDate(''); }} /></div><div className="grid gap-2"><Label htmlFor="payrollPayoutDate">{ui('تاريخ الصرف المخطط')}</Label><Input id="payrollPayoutDate" type="date" min={`${month}-01`} value={payoutDate || payrollPeriodLabel(month).split(' — ')[1] || ''} onChange={e => setPayoutDate(e.target.value)} /></div><Button permissionAction={null} disabled={busy || !payrollPeriodLabel(month) || Number(month.slice(0, 4)) < 2000} onClick={() => create.mutate({ month: Number(month.slice(5)), year: Number(month.slice(0, 4)), payoutDate: payoutDate || payrollPeriodLabel(month).split(' — ')[1] })}><Plus className="size-4" />{ui(create.isPending ? ui('جاري الاحتساب…') : ui('إنشاء المرتبات'))}</Button></div>
        {payrollPeriodLabel(month) && <p className="nums text-sm text-muted-foreground" dir="ltr">{payrollPeriodLabel(month)}</p>}
      </section>}
      <section className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-4">
        <div className="grid min-w-0 flex-1 basis-64 gap-2"><Label htmlFor="financePayrollRun">{ui('المرتبات')}</Label><select id="financePayrollRun" className="h-11 min-w-0 rounded-lg border bg-background px-3 text-sm" value={selectedRunId ?? ''} onChange={(event) => setSelectedRunId(Number(event.target.value) || null)} disabled={busy}><option value="">{ui('اختر مرتبات شهر')}</option>{runs.data?.data.map((row) => <option key={row.id} value={row.id}>{row.title} · {ui(payrollStatusLabels[row.status])}</option>)}</select></div>
        <div className="grid gap-2"><Label htmlFor="financePayrollStatus">{ui('الحالة')}</Label><select id="financePayrollStatus" className="h-11 rounded-lg border bg-background px-3 text-sm" value={status} disabled={busy} onChange={(event) => { setStatus(event.target.value); setRunPage(1); }}><option value="">{ui('كل الحالات')}</option>{Object.entries(payrollStatusLabels).map(([value, label]) => <option key={value} value={value}>{ui(label)}</option>)}</select></div>
        <div className="flex items-center gap-2"><Button permissionAction={null} variant="outline" size="icon" aria-label={ui('صفحة شهور المرتبات السابقة')} disabled={busy || runPage === 1} onClick={() => setRunPage(runPage - 1)}><ArrowRight className="size-4" /></Button><span className="nums text-sm">{toArabicDigits(runPage)}</span><Button permissionAction={null} variant="outline" size="icon" aria-label={ui('صفحة شهور المرتبات التالية')} disabled={busy || runPage * 20 >= (runs.data?.total ?? 0)} onClick={() => setRunPage(runPage + 1)}><ArrowLeft className="size-4" /></Button></div>
      </section>
      {(runs.isLoading || detail.isLoading) && <Skeleton className="h-32 rounded-xl" />}
      {(runs.isError || detail.isError) && <ErrorState message={apiError(runs.error || detail.error)} onRetry={() => { void runs.refetch(); if (selectedRunId) void detail.refetch(); }} />}
      {!runs.isLoading && !runs.isError && !selectedRunId && <EmptyState title={ui('لا توجد شهور مرتبات مطابقة')} description={ui('غيّر الحالة لعرض شهور المرتبات الموجودة، أو أنشئ مرتبات شهر من صفحة إعداد الرواتب.')} />}
      {run && !detail.isError && <>
        <section className="space-y-4 rounded-xl border bg-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold">{run.title}</h2><Badge variant={run.status === 'completed' || run.status === 'banked' ? 'default' : 'secondary'}>{ui(payrollStatusLabels[run.status])}</Badge></div>
          <dl className="flex flex-wrap gap-x-8 gap-y-4"><div><dt className="text-sm text-muted-foreground">{ui('فترة المرتبات')}</dt><dd className="nums mt-1 text-sm" dir="ltr">{run.periodStart} — {run.periodEnd}</dd></div><div><dt className="text-sm text-muted-foreground">{ui('الصرف المخطط')}</dt><dd className="nums mt-1 text-sm">{run.payoutDate}</dd></div><div><dt className="text-sm text-muted-foreground">{ui('الموظفون')}</dt><dd className="nums mt-1 font-bold">{toArabicDigits(run.employeeCount ?? lines.data?.total ?? 0)}</dd></div><div><dt className="text-sm text-muted-foreground">{ui('صافي المرتبات')}</dt><dd className="nums mt-1 text-xl font-bold text-primary"><Money value={run.totalAmount} /></dd></div></dl>
          <div className="flex flex-wrap gap-2">{payrollActions(run.status, mode).filter((name) => can(payrollActionPermission(name)) && (mode === 'preparation' ? canPrepare : canApprove)).map((name) => <Button key={name} permissionAction={null} variant={name === 'compute' ? 'outline' : 'default'} disabled={busy} onClick={() => void runAction(name)}>{ui(action.isPending ? ui('جاري التنفيذ…') : payrollActionLabels[name])}</Button>)}<Button permissionAction={null} variant="outline" asChild><Link to={`/payroll/runs/${run.id}`}><ExternalLink className="size-4" />{ui('فتح مرتبات شهر الموارد البشرية')}</Link></Button></div>
          <p className="text-sm leading-relaxed text-muted-foreground">{ui('تُحفظ هذه المرتبات في سجل الرواتب نفسه. تُسجل المصروفات عند الترحيل، ويُعتمد الصرف بعد تأكيد البنك لتسوية كامل الصافي.')}</p>
        </section>
        <DataTable columns={columns} data={lines.data?.data ?? []} total={lines.data?.total ?? 0} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={(value) => { setPageSize(value); setPage(1); }} isLoading={lines.isLoading} isError={lines.isError} onRetry={() => void lines.refetch()} search={search} onSearchChange={(value) => { setSearch(value); setPage(1); }} emptyTitle={ui('لا توجد بنود مطابقة')} enableExport={false} />
        <MonthlyEmployeeSheet key={`${run.id}-${itemId}`} runId={run.id} itemId={itemId} onClose={() => setItemId(null)} onSaved={refresh} />
      </>}
    </>}
  </div>;
}
