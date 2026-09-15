import type { ColumnDef } from '@tanstack/react-table';
import { useQuery } from '@tanstack/react-query';
import { Calculator, Download, Eye, FileText, Plus, Printer, Trash2 } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { DataTable, type PaginatedResponse } from '@/components/common/data-table';
import { DateText, Money, Num } from '@/components/common/formatters';
import { FilterBar } from '@/components/common/filter-bar';
import { PageHeader } from '@/components/common/page-header';
import { StatusBadge } from '@/components/common/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useBranches } from '@/hooks/use-branches';
import { api, apiError } from '@/lib/api';
import { useMutationWithToast, usePaginatedList } from '@/lib/api-hooks';
import { confirm } from '@/lib/confirm';
import { downloadExcel, printElement } from '@/lib/export';
import { useListQuery } from '@/lib/use-list-query';
import { toArabicDigits } from '@/lib/utils';
import { useAuth } from '@/store/auth';
import { useLocale } from '@/store/locale';

interface PayrollRunRow {
  id: number;
  title?: string;
  totalAmount?: number;
  status?: string;
  createdAt?: string;
}

interface SalaryPreviewRow extends Record<string, unknown> {
  id: number;
  empCode: number;
  employeeName: string;
  jobTitle?: string;
  branchName?: string;
  basicSalary: number;
  fixedAllowance: number;
  variableAllowance: number;
  bonusAllowance: number;
  grantAllowance: number;
  incentiveAllowance: number;
  dayWage: number;
  hourWage: number;
  overtimeHours: number;
  overtimeHoursValue: number;
  overtimeDays: number;
  overtimeDaysValue: number;
  salaryIncrease: number;
  rewards: number;
  classCommission: number;
  proteinCommission: number;
  targetBase: number;
  targetCommission: number;
  totalEarnings: number;
  absenceDays: number;
  absenceValue: number;
  paidLeaveDays: number;
  paidLeaveValue: number;
  unpaidLeaveDays: number;
  unpaidLeaveValue: number;
  lateMinutes: number;
  lateValue: number;
  permissionMinutes: number;
  permissionValue: number;
  forgottenFingerprintCount: number;
  forgottenFingerprintValue: number;
  penalties: number;
  insurance: number;
  loans: number;
  totalDeductions: number;
  netSalary: number;
}

interface PreviewResponse extends PaginatedResponse<SalaryPreviewRow> {
  summary: { employees: number; earnings: number; deductions: number; net: number };
}

interface ManualEarnings {
  privateBonus: number;
  evaluation: number;
  targetValue: number;
}

interface DisplaySalaryRow extends SalaryPreviewRow, ManualEarnings {
  displayedEarnings: number;
  displayedNet: number;
}

interface SalaryExportRow extends Record<string, unknown> {
  sequence: number | string;
}

const EMPTY_MANUAL: ManualEarnings = { privateBonus: 0, evaluation: 0, targetValue: 0 };
const CELL = 'whitespace-nowrap border border-border/70 px-2 py-2 text-center text-xs tabular-nums';
const HEAD = `${CELL} h-auto bg-muted/70 font-bold text-foreground`;
const TOTAL = `${CELL} bg-emerald-50 font-bold text-emerald-950 dark:bg-emerald-950/35 dark:text-emerald-100`;

function currentPayrollPeriod() {
  const today = new Date();
  const to = new Date(today.getFullYear(), today.getMonth(), 25);
  const from = new Date(today.getFullYear(), today.getMonth() - 1, 26);
  const iso = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  return { fromDate: iso(from), toDate: iso(to) };
}

const exportColumns: Array<{ key: string; header: string }> = [
  { key: 'sequence', header: 'م' }, { key: 'employeeName', header: 'اسم الموظف' }, { key: 'jobTitle', header: 'الوظيفة' }, { key: 'branchName', header: 'الفرع' },
  { key: 'basicSalary', header: 'راتب أساسي' }, { key: 'fixedAllowance', header: 'بدلات ثابتة' }, { key: 'variableAllowance', header: 'بدلات متغيرة' }, { key: 'bonusAllowance', header: 'بونص' },
  { key: 'grantAllowance', header: 'منح' }, { key: 'incentiveAllowance', header: 'حافز' }, { key: 'dayWage', header: 'أجر اليوم' }, { key: 'hourWage', header: 'أجر الساعة' },
  { key: 'overtimeHours', header: 'عدد الساعات الإضافية' }, { key: 'overtimeHoursValue', header: 'قيمة الساعات الإضافية' }, { key: 'overtimeDays', header: 'عدد الأيام الإضافية' }, { key: 'overtimeDaysValue', header: 'قيمة الأيام الإضافية' },
  { key: 'salaryIncrease', header: 'زيادة مرتب' }, { key: 'rewards', header: 'مكافآت' }, { key: 'classCommission', header: 'نسبة الكلاسات' }, { key: 'privateBonus', header: 'مكافأة البرايفت' },
  { key: 'evaluation', header: 'التقييم' }, { key: 'proteinCommission', header: 'عمولة البروتين' }, { key: 'targetBase', header: 'التارجت' }, { key: 'targetValue', header: 'نسبة التارجت' },
  { key: 'displayedEarnings', header: 'إجمالي الاستحقاقات' }, { key: 'absenceDays', header: 'أيام الغياب' }, { key: 'absenceValue', header: 'قيمة الغياب' }, { key: 'paidLeaveDays', header: 'أيام الإجازة' },
  { key: 'paidLeaveValue', header: 'قيمة الإجازة' }, { key: 'lateMinutes', header: 'دقائق التأخير' }, { key: 'lateValue', header: 'قيمة التأخير' }, { key: 'permissionMinutes', header: 'دقائق الإذن' },
  { key: 'permissionValue', header: 'قيمة الإذن' }, { key: 'forgottenFingerprintCount', header: 'مرات نسيان البصمة' }, { key: 'forgottenFingerprintValue', header: 'قيمة نسيان البصمة' }, { key: 'penalties', header: 'جزاءات' },
  { key: 'insurance', header: 'التأمينات' }, { key: 'loans', header: 'السلف' }, { key: 'totalDeductions', header: 'إجمالي الاستقطاعات' }, { key: 'displayedNet', header: 'صافي المرتب' },
];

function SalaryValue({ value, strong = false }: { value: number; strong?: boolean }) {
  return <Num value={value} className={strong ? 'font-bold' : undefined} />;
}

export function PayrollRunsPage() {
  const { ui } = useLocale();
  const navigate = useNavigate();
  const reportRef = useRef<HTMLDivElement>(null);
  const salaryTableRef = useRef<HTMLDivElement>(null);
  const user = useAuth((state) => state.user);
  const scopedBranch = (user?.branch ?? 0) > 0 ? String(user!.branch) : 'all';
  const initialPeriod = useMemo(currentPayrollPeriod, []);
  const [filterForm, setFilterForm] = useState({ ...initialPeriod, branchId: scopedBranch });
  const [applied, setApplied] = useState(filterForm);
  const [manual, setManual] = useState<Record<number, ManualEarnings>>({});
  const [selectedReport, setSelectedReport] = useState<DisplaySalaryRow | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [runForm, setRunForm] = useState(() => ({ month: String(new Date(`${initialPeriod.toDate}T00:00:00`).getMonth() + 1), year: String(new Date(`${initialPeriod.toDate}T00:00:00`).getFullYear()) }));
  const { data: branches = [] } = useBranches();
  const { params, setParams } = useListQuery();
  const { data: runs, isLoading: runsLoading, isError: runsError, refetch: refetchRuns } = usePaginatedList<PayrollRunRow>('payroll/runs', params);

  const preview = useQuery({
    queryKey: ['payroll/preview', applied],
    queryFn: async ({ signal }) => (await api.get<PreviewResponse>('/payroll/preview', {
      params: {
        fromDate: applied.fromDate,
        toDate: applied.toDate,
        ...(applied.branchId !== 'all' ? { branchId: Number(applied.branchId) } : {}),
        page: 1,
        pageSize: 500,
      },
      signal,
    })).data,
    enabled: Boolean(applied.fromDate && applied.toDate),
  });

  const displayRows = useMemo<DisplaySalaryRow[]>(() => (preview.data?.data ?? []).map((row) => {
    const inputs = manual[row.id] ?? { ...EMPTY_MANUAL, targetValue: row.targetCommission };
    const added = inputs.privateBonus + inputs.evaluation + (inputs.targetValue - row.targetCommission);
    return { ...row, ...inputs, displayedEarnings: row.totalEarnings + added, displayedNet: row.netSalary + added };
  }), [manual, preview.data?.data]);

  const totals = useMemo(() => {
    const sum = (key: keyof DisplaySalaryRow) => displayRows.reduce((total, row) => total + Number(row[key] ?? 0), 0);
    return { sum };
  }, [displayRows]);

  const deleteMutation = useMutationWithToast(
    (id: number) => api.delete(`/payroll/runs/${id}`),
    { success: ui('تم حذف المسيرة'), invalidate: ['payroll/runs'] },
  );

  const calculate = () => {
    if (!filterForm.fromDate || !filterForm.toDate || filterForm.fromDate > filterForm.toDate) {
      toast.error(ui('يرجى إدخال فترة صحيحة لحساب الرواتب'));
      return;
    }
    setManual({});
    setApplied(filterForm);
  };

  const updateManual = (employeeId: number, key: keyof ManualEarnings, rawValue: string) => {
    const value = Math.max(0, Number(rawValue) || 0);
    const calculatedTarget = preview.data?.data.find((row) => row.id === employeeId)?.targetCommission ?? 0;
    setManual((current) => ({
      ...current,
      [employeeId]: { ...(current[employeeId] ?? { ...EMPTY_MANUAL, targetValue: calculatedTarget }), [key]: value },
    }));
  };

  const createRun = async () => {
    const month = Number(runForm.month);
    const year = Number(runForm.year);
    if (month < 1 || month > 12 || year < 2000) {
      toast.error(ui('يرجى اختيار شهر وسنة صحيحين'));
      return;
    }
    setCreating(true);
    try {
      const { data } = await api.post<{ id: number }>('/payroll/runs', { month, year });
      toast.success(ui('تم إنشاء مسيرة الرواتب واحتسابها'));
      setCreateOpen(false);
      void refetchRuns();
      navigate(`/payroll/runs/${data.id}`);
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setCreating(false);
    }
  };

  const exportPreview = async () => {
    try {
      const rows: SalaryExportRow[] = displayRows.map((row, index) => ({ ...row, sequence: index + 1 }));
      const totalRow: SalaryExportRow = { sequence: '', employeeName: ui('الإجمالي') };
      for (const column of exportColumns) {
        if (column.key === 'sequence' || column.key === 'employeeName' || column.key === 'jobTitle' || column.key === 'branchName') continue;
        if (column.key === 'dayWage' || column.key === 'hourWage') {
          totalRow[column.key] = 0;
          continue;
        }
        totalRow[column.key] = displayRows.reduce((total, row) => total + Number(row[column.key] ?? 0), 0);
      }
      rows.push(totalRow);
      await downloadExcel(rows, exportColumns.map((column) => ({ key: column.key, header: ui(column.header) })), `مسير_الرواتب_${applied.fromDate}_${applied.toDate}`, ui('مسير الرواتب'));
    } catch (error) {
      toast.error(apiError(error));
    }
  };

  const printSalaryTable = () => {
    const table = salaryTableRef.current;
    if (!table) return;
    const clone = table.cloneNode(true) as HTMLElement;
    const sourceInputs = table.querySelectorAll('input');
    clone.querySelectorAll('input').forEach((input, index) => {
      const span = document.createElement('span');
      span.textContent = sourceInputs[index]?.value || '0';
      input.replaceWith(span);
    });
    clone.querySelectorAll('.no-print').forEach((element) => element.remove());
    clone.querySelectorAll<HTMLElement>('[class*="print:table-cell"]').forEach((element) => { element.style.display = 'table-cell'; });
    clone.querySelectorAll<HTMLElement>('[class*="print:block"]').forEach((element) => { element.style.display = 'block'; });
    const printStyle = document.createElement('style');
    printStyle.textContent = '@page{size:landscape;margin:7mm}table{font-size:7px}th,td{padding:2px!important;white-space:nowrap;text-align:center!important}';
    clone.prepend(printStyle);
    printElement(clone, ui('تقرير المرتبات الشامل'));
  };

  const handleDelete = async (row: PayrollRunRow) => {
    const ok = await confirm({ title: ui('حذف مسيرة الرواتب'), description: `${ui('هل تريد حذف مسيرة «')}${row.title ?? ui('هذه المسيرة')}${ui('»؟')}`, confirmLabel: ui('حذف'), variant: 'destructive' });
    if (ok) deleteMutation.mutate(row.id);
  };

  const runColumns = useMemo<ColumnDef<PayrollRunRow>[]>(() => [
    { accessorKey: 'id', header: ui('م'), cell: ({ row }) => toArabicDigits((params.page - 1) * params.pageSize + row.index + 1) },
    { accessorKey: 'title', header: ui('المسيرة'), cell: ({ row }) => <Link to={`/payroll/runs/${row.original.id}`} className="font-medium text-primary hover:underline">{row.original.title ?? `${ui('مسيرة')} ${toArabicDigits(row.original.id)}`}</Link> },
    { accessorKey: 'totalAmount', header: ui('الإجمالي'), cell: ({ getValue }) => <Money value={getValue() as number} /> },
    { accessorKey: 'status', header: ui('الحالة'), cell: ({ getValue }) => { const status = getValue() as string; return <StatusBadge status={status === 'approved' || status === 'posted' || status === 'banked' || status === 'completed' ? 'approved' : 'pending'} label={ui(status || 'draft')} />; } },
    { accessorKey: 'createdAt', header: ui('تاريخ الإنشاء'), cell: ({ getValue }) => <DateText value={getValue() as string} /> },
    { id: 'actions', header: ui('الإجراءات'), cell: ({ row }) => <div className="flex gap-1"><Button variant="ghost" size="sm" asChild><Link to={`/payroll/runs/${row.original.id}`}><Eye className="size-4" />{ui('عرض')}</Link></Button><Button variant="ghost" size="icon" aria-label={ui('حذف')} onClick={() => void handleDelete(row.original)}><Trash2 className="size-4 text-destructive" /></Button></div> },
  ], [params.page, params.pageSize, ui]);

  const earningsReport = selectedReport ? [
    ['راتب أساسي', selectedReport.basicSalary], ['بدلات ثابتة', selectedReport.fixedAllowance], ['بدلات متغيرة', selectedReport.variableAllowance], ['بونص', selectedReport.bonusAllowance],
    ['منح', selectedReport.grantAllowance], ['حافز', selectedReport.incentiveAllowance], ['قيمة الساعات الإضافية', selectedReport.overtimeHoursValue], ['قيمة الأيام الإضافية', selectedReport.overtimeDaysValue],
    ['زيادة مرتب', selectedReport.salaryIncrease], ['مكافآت', selectedReport.rewards], ['نسبة الكلاسات', selectedReport.classCommission], ['مكافأة البرايفت', selectedReport.privateBonus],
    ['التقييم', selectedReport.evaluation], ['عمولة البروتين', selectedReport.proteinCommission], ['نسبة التارجت', selectedReport.targetValue],
  ] as Array<[string, number]> : [];
  const deductionsReport = selectedReport ? [
    ['قيمة الغياب', selectedReport.absenceValue], ['قيمة الإجازة', selectedReport.paidLeaveValue], ['إجازة بدون راتب', selectedReport.unpaidLeaveValue], ['قيمة التأخير', selectedReport.lateValue],
    ['قيمة الإذن', selectedReport.permissionValue], ['قيمة نسيان البصمة', selectedReport.forgottenFingerprintValue], ['جزاءات', selectedReport.penalties], ['التأمينات', selectedReport.insurance], ['السلف', selectedReport.loans],
  ] as Array<[string, number]> : [];

  return (
    <div className="space-y-6">
      <PageHeader title={ui('مسير الرواتب')} description={ui('حساب المرتبات بنفس فترة ومعادلات وترتيب شاشة النظام القديم.')} actions={<Button variant="brand" size="sm" onClick={() => setCreateOpen(true)}><Plus className="size-4" />{ui('مسيرة جديدة')}</Button>} />

      <Card className="no-print">
        <CardHeader><CardTitle className="text-base">{ui('تحديد فترة حساب المرتب')}</CardTitle></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-4 md:items-end">
          <div className="space-y-2"><Label htmlFor="salary-from">{ui('من تاريخ')}</Label><Input id="salary-from" type="date" value={filterForm.fromDate} onChange={(event) => setFilterForm((current) => ({ ...current, fromDate: event.target.value }))} /></div>
          <div className="space-y-2"><Label htmlFor="salary-to">{ui('إلى تاريخ')}</Label><Input id="salary-to" type="date" value={filterForm.toDate} onChange={(event) => setFilterForm((current) => ({ ...current, toDate: event.target.value }))} /></div>
          <div className="space-y-2"><Label htmlFor="salary-branch">{ui('الفرع')}</Label><select id="salary-branch" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={filterForm.branchId} disabled={(user?.branch ?? 0) > 0} onChange={(event) => setFilterForm((current) => ({ ...current, branchId: event.target.value }))}><option value="all">{ui('الكل')}</option><option value="0">{ui('الإدارة')}</option>{branches.map((branch) => <option key={branch.id} value={String(branch.id)}>{branch.name}</option>)}</select></div>
          <div className="flex flex-wrap gap-2"><Button variant="brand" onClick={calculate}><Calculator className="size-4" />{ui('حساب المرتبات')}</Button><Button variant="outline" onClick={() => void exportPreview()} disabled={!displayRows.length}><Download className="size-4" />{ui('تصدير Excel')}</Button><Button variant="outline" onClick={printSalaryTable} disabled={!displayRows.length}><Printer className="size-4" />{ui('طباعة')}</Button></div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          {preview.isLoading || preview.isFetching ? <div className="p-10 text-center text-sm text-muted-foreground">{ui('جارٍ حساب المرتبات…')}</div> : preview.isError ? <div className="space-y-3 p-10 text-center"><p className="text-sm text-destructive">{ui('تعذر حساب مسير الرواتب')}</p><Button variant="outline" size="sm" onClick={() => void preview.refetch()}>{ui('إعادة المحاولة')}</Button></div> : !displayRows.length ? <div className="p-10 text-center text-sm text-muted-foreground">{ui('لا توجد رواتب في الفترة والفرع المحددين')}</div> : (
            <div ref={salaryTableRef} className="payroll-sheet">
              <div className="hidden px-4 py-3 text-center print:block"><h1 className="text-xl font-bold">{ui('تقرير المرتبات الشامل')}</h1><p>{applied.fromDate} — {applied.toDate}</p></div>
              <Table className="border-collapse">
                <TableHeader className="sticky top-0 z-10">
                  <TableRow className="hover:bg-transparent">
                    <TableHead rowSpan={2} className={HEAD}>{ui('م')}</TableHead><TableHead rowSpan={2} className={HEAD}>{ui('اسم الموظف')}</TableHead><TableHead rowSpan={2} className={HEAD}>{ui('الوظيفة')}</TableHead><TableHead rowSpan={2} className={HEAD}>{ui('الفرع')}</TableHead>
                    <TableHead colSpan={20} className={`${HEAD} bg-emerald-100 text-emerald-950 dark:bg-emerald-950 dark:text-emerald-100`}>{ui('الاستحقاقات')}</TableHead>
                    <TableHead rowSpan={2} className={TOTAL}>{ui('إجمالي الاستحقاقات')}</TableHead>
                    <TableHead colSpan={13} className={`${HEAD} bg-rose-100 text-rose-950 dark:bg-rose-950 dark:text-rose-100`}>{ui('الاستقطاعات')}</TableHead>
                    <TableHead rowSpan={2} className={TOTAL}>{ui('إجمالي الاستقطاعات')}</TableHead><TableHead rowSpan={2} className={TOTAL}>{ui('صافي المرتب')}</TableHead><TableHead rowSpan={2} className={HEAD}>{ui('التقرير')}</TableHead>
                  </TableRow>
                  <TableRow className="hover:bg-transparent">
                    {['راتب أساسي', 'بدلات ثابتة', 'بدلات متغيرة', 'بونص', 'منح', 'حافز', 'أجر اليوم', 'أجر الساعة', 'عدد الساعات الإضافية', 'قيمة الساعات الإضافية', 'عدد الأيام الإضافية', 'قيمة الأيام الإضافية', 'زيادة مرتب', 'مكافآت', 'نسبة الكلاسات', 'مكافأة البرايفت', 'التقييم', 'عمولة البروتين', 'التارجت', 'نسبة التارجت'].map((label) => <TableHead key={label} className={HEAD}>{ui(label)}</TableHead>)}
                    {['أيام الغياب', 'قيمة الغياب', 'أيام الإجازة', 'قيمة الإجازة', 'دقائق التأخير', 'قيمة التأخير', 'دقائق الإذن', 'قيمة الإذن', 'مرات نسيان البصمة', 'قيمة نسيان البصمة', 'جزاءات', 'التأمينات', 'السلف'].map((label) => <TableHead key={label} className={HEAD}>{ui(label)}</TableHead>)}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayRows.map((row, index) => <TableRow key={row.id}>
                    <TableCell className={CELL}><Num value={index + 1} /></TableCell><TableCell className={`${CELL} min-w-44 text-start font-medium`}>{row.employeeName}</TableCell><TableCell className={CELL}>{row.jobTitle || '—'}</TableCell><TableCell className={CELL}>{row.branchName || '—'}</TableCell>
                    {[row.basicSalary, row.fixedAllowance, row.variableAllowance, row.bonusAllowance, row.grantAllowance, row.incentiveAllowance, row.dayWage, row.hourWage, row.overtimeHours, row.overtimeHoursValue, row.overtimeDays, row.overtimeDaysValue, row.salaryIncrease, row.rewards, row.classCommission].map((value, valueIndex) => <TableCell key={valueIndex} className={CELL}><SalaryValue value={value} /></TableCell>)}
                    <TableCell className={CELL}><Input aria-label={`${ui('مكافأة البرايفت')} - ${row.employeeName}`} className="h-8 w-20 text-center" type="number" min={0} step="0.01" value={row.privateBonus} onChange={(event) => updateManual(row.id, 'privateBonus', event.target.value)} /></TableCell>
                    <TableCell className={CELL}><Input aria-label={`${ui('التقييم')} - ${row.employeeName}`} className="h-8 w-20 text-center" type="number" min={0} step="0.01" value={row.evaluation} onChange={(event) => updateManual(row.id, 'evaluation', event.target.value)} /></TableCell>
                    <TableCell className={CELL}><SalaryValue value={row.proteinCommission} /></TableCell><TableCell className={CELL}><SalaryValue value={row.targetBase} /></TableCell>
                    <TableCell className={CELL}><Input aria-label={`${ui('نسبة التارجت')} - ${row.employeeName}`} className="h-8 w-20 text-center" type="number" min={0} step="0.01" value={row.targetValue} onChange={(event) => updateManual(row.id, 'targetValue', event.target.value)} /></TableCell>
                    <TableCell className={TOTAL}><SalaryValue value={row.displayedEarnings} strong /></TableCell>
                    {[row.absenceDays, row.absenceValue, row.paidLeaveDays, row.paidLeaveValue, row.lateMinutes, row.lateValue, row.permissionMinutes, row.permissionValue, row.forgottenFingerprintCount, row.forgottenFingerprintValue, row.penalties, row.insurance, row.loans].map((value, valueIndex) => <TableCell key={valueIndex} className={CELL}><SalaryValue value={value} /></TableCell>)}
                    <TableCell className={TOTAL}><SalaryValue value={row.totalDeductions} strong /></TableCell><TableCell className={TOTAL}><SalaryValue value={row.displayedNet} strong /></TableCell>
                    <TableCell className={`${CELL} no-print`}><Button variant="outline" size="sm" onClick={() => setSelectedReport(row)}><FileText className="size-4" />{ui('التقرير')}</Button></TableCell><TableCell className={`${CELL} hidden print:table-cell`}>{ui('التقرير')}</TableCell>
                  </TableRow>)}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableHead colSpan={4} className={HEAD}>{ui('الإجمالي')}</TableHead>
                    {(['basicSalary', 'fixedAllowance', 'variableAllowance', 'bonusAllowance', 'grantAllowance', 'incentiveAllowance'] as const).map((key) => <TableHead key={key} className={HEAD}><SalaryValue value={totals.sum(key)} strong /></TableHead>)}
                    <TableHead className={HEAD}><SalaryValue value={0} /></TableHead><TableHead className={HEAD}><SalaryValue value={0} /></TableHead>
                    {(['overtimeHours', 'overtimeHoursValue', 'overtimeDays', 'overtimeDaysValue', 'salaryIncrease', 'rewards', 'classCommission', 'privateBonus', 'evaluation', 'proteinCommission', 'targetBase', 'targetValue'] as const).map((key) => <TableHead key={key} className={HEAD}><SalaryValue value={totals.sum(key)} strong /></TableHead>)}
                    <TableHead className={TOTAL}><SalaryValue value={totals.sum('displayedEarnings')} strong /></TableHead>
                    {(['absenceDays', 'absenceValue', 'paidLeaveDays', 'paidLeaveValue', 'lateMinutes', 'lateValue', 'permissionMinutes', 'permissionValue', 'forgottenFingerprintCount', 'forgottenFingerprintValue', 'penalties', 'insurance', 'loans'] as const).map((key) => <TableHead key={key} className={HEAD}><SalaryValue value={totals.sum(key)} strong /></TableHead>)}
                    <TableHead className={TOTAL}><SalaryValue value={totals.sum('totalDeductions')} strong /></TableHead><TableHead className={TOTAL}><SalaryValue value={totals.sum('displayedNet')} strong /></TableHead><TableHead className={HEAD}>{ui('التقرير')}</TableHead>
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <details className="no-print rounded-xl border bg-card p-4">
        <summary className="cursor-pointer font-semibold">{ui('المسيرات المحفوظة ودورة الاعتماد')}</summary>
        <section className="mt-4 space-y-3">
          <FilterBar searchPlaceholder={ui('بحث في المسيرات…')} fields={[{ key: 'status', label: ui('الحالة'), type: 'select', options: [{ value: 'draft', label: ui('مسودة') }, { value: 'computed', label: ui('تم الاحتساب') }, { value: 'reviewing', label: ui('قيد المراجعة') }, { value: 'approved', label: ui('معتمد') }, { value: 'posted', label: ui('مرحّل') }, { value: 'banked', label: ui('ملف البنك') }] }]} />
          <DataTable columns={runColumns} data={runs?.data ?? []} total={runs?.total ?? 0} page={params.page} pageSize={params.pageSize} onPageChange={(page) => setParams({ page })} onPageSizeChange={(pageSize) => setParams({ pageSize, page: 1 })} isLoading={runsLoading} isError={runsError} onRetry={() => void refetchRuns()} search={params.search} onSearchChange={(search) => setParams({ search, page: 1 })} emptyTitle={ui('لا توجد مسيرات رواتب محفوظة')} />
        </section>
      </details>

      <Dialog open={Boolean(selectedReport)} onOpenChange={(open) => { if (!open) setSelectedReport(null); }}>
        <DialogContent size="xl" aria-describedby={undefined}>
          <div ref={reportRef} className="space-y-5">
            <DialogHeader><DialogTitle>{ui('تقرير المرتب المفصل')}</DialogTitle></DialogHeader>
            {selectedReport && <>
              <div className="grid gap-2 rounded-lg border p-4 text-sm sm:grid-cols-2"><p><strong>{ui('اسم الموظف')}:</strong> {selectedReport.employeeName}</p><p><strong>{ui('كود الموظف')}:</strong> <Num value={selectedReport.empCode} /></p><p><strong>{ui('الوظيفة')}:</strong> {selectedReport.jobTitle || '—'}</p><p><strong>{ui('الفرع')}:</strong> {selectedReport.branchName || '—'}</p><p><strong>{ui('من تاريخ')}:</strong> {applied.fromDate}</p><p><strong>{ui('إلى تاريخ')}:</strong> {applied.toDate}</p></div>
              <div className="grid gap-4 md:grid-cols-2">
                <div><h3 className="mb-2 font-bold text-emerald-700">{ui('الاستحقاقات')}</h3><Table><TableBody>{earningsReport.map(([label, value]) => <TableRow key={label}><TableCell>{ui(label)}</TableCell><TableCell><SalaryValue value={value} /></TableCell></TableRow>)}</TableBody><TableFooter><TableRow><TableHead>{ui('الإجمالي')}</TableHead><TableHead><SalaryValue value={selectedReport.displayedEarnings} strong /></TableHead></TableRow></TableFooter></Table></div>
                <div><h3 className="mb-2 font-bold text-rose-700">{ui('الاستقطاعات')}</h3><Table><TableBody>{deductionsReport.map(([label, value]) => <TableRow key={label}><TableCell>{ui(label)}</TableCell><TableCell><SalaryValue value={value} /></TableCell></TableRow>)}</TableBody><TableFooter><TableRow><TableHead>{ui('الإجمالي')}</TableHead><TableHead><SalaryValue value={selectedReport.totalDeductions} strong /></TableHead></TableRow></TableFooter></Table></div>
              </div>
              <div className="rounded-lg bg-primary/10 p-4 text-center text-lg font-bold">{ui('صافي المرتب')}: <SalaryValue value={selectedReport.displayedNet} strong /></div>
            </>}
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setSelectedReport(null)}>{ui('إغلاق')}</Button><Button variant="brand" onClick={() => reportRef.current && printElement(reportRef.current, ui('تقرير المرتب المفصل'))}><Printer className="size-4" />{ui('طباعة')}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent size="sm" aria-describedby={undefined}>
          <DialogHeader><DialogTitle>{ui('إنشاء مسيرة رواتب جديدة')}</DialogTitle></DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="run-month">{ui('الشهر')}</Label><Input id="run-month" type="number" min="1" max="12" value={runForm.month} onChange={(event) => setRunForm((current) => ({ ...current, month: event.target.value }))} /></div><div className="space-y-2"><Label htmlFor="run-year">{ui('السنة')}</Label><Input id="run-year" type="number" min="2000" value={runForm.year} onChange={(event) => setRunForm((current) => ({ ...current, year: event.target.value }))} /></div></div>
          <p className="text-sm text-muted-foreground">{ui('سيتم احتساب الفترة من يوم 26 من الشهر السابق إلى يوم 25 من الشهر المختار، كما في النظام القديم.')}</p>
          <DialogFooter><Button variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>{ui('إلغاء')}</Button><Button variant="brand" onClick={() => void createRun()} disabled={creating}>{creating ? ui('جارٍ إنشاء المسيرة…') : ui('إنشاء واحتساب')}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
