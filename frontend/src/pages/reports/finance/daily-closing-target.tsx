import type { ColumnDef } from '@tanstack/react-table';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DataTable } from '@/components/common/data-table';
import { Combobox } from '@/components/common/combobox';
import { ClubStatCard } from '@/components/club/stat-card';
import { ReportShell, downloadCsv } from '@/components/reports/report-shell';
import { Button } from '@/components/ui/button';
import { DateRangeFilter, firstOfMonth, todayLocal } from '@/components/reports/date-range-filter';
import { BranchFilter, normalizeBranchParam } from '@/components/reports/branch-filter';
import { api } from '@/lib/api';
import { toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';
import { useAuth } from '@/store/auth';

type ReceiptTotals = { total: string; cash: string; knet: string };
type AmountTotals = { total: string };

interface DailyClosingResponse {
  regularSubscriptions: ReceiptTotals;
  privateSubscriptions: ReceiptTotals;
  lockers: ReceiptTotals;
  normalSales: ReceiptTotals;
  proteinSales: ReceiptTotals;
  purchaseReturns: AmountTotals;
  purchases: AmountTotals;
  supplierPayments: AmountTotals;
  expenses: AmountTotals;
  subscriptionRefunds: AmountTotals;
  totalRevenue: string;
  totalOutflows: string;
  netProfit: string;
  totalCash: string;
  totalKnet: string;
}

interface TargetRow {
  operation: string;
  type: string;
  beforeDiscount: string;
  discount: string;
  afterDiscount: string;
  paid: string;
  date: string;
}

interface TargetReportResponse {
  rows: TargetRow[];
  totals: Omit<TargetRow, 'operation' | 'type' | 'date'>;
  subscriptionTotal: string;
  lockerTotal: string;
  salesTotal: string;
  grandTotal: string;
}

const amount = (value: string | number | undefined) => toArabicDigits(Number(value ?? 0));

export function DailyClosingReportPage() {
  const { ui } = useLocale();
  const [date, setDate] = useState(todayLocal);
  const [branch, setBranch] = useState('all');
  const [gender, setGender] = useState('all');
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['finance-daily-closing', date, branch, gender],
    queryFn: async () => (await api.get<DailyClosingResponse>('/finance/daily-closing', {
      params: { fromDate: date, toDate: date, ...(normalizeBranchParam(branch) ? { branchId: branch } : {}), ...(gender !== 'all' ? { gender } : {}) },
    })).data,
  });
  const receipts = data ? [
    { label: ui('اشتراكات النادي'), ...data.regularSubscriptions },
    { label: ui('الاشتراكات الخاصة'), ...data.privateSubscriptions },
    { label: ui('اللوكرات'), ...data.lockers },
    { label: ui('مبيعات عادي'), ...data.normalSales },
    { label: ui('مبيعات بروتين'), ...data.proteinSales },
  ] : [];
  const outflows = data ? [
    { label: ui('مشتريات'), total: data.purchases.total },
    { label: ui('مدفوعات الموردين'), total: data.supplierPayments.total },
    { label: ui('مصروفات'), total: data.expenses.total },
    { label: ui('مرتجعات الاشتراكات'), total: data.subscriptionRefunds.total },
    { label: ui('مرتجعات المشتريات (تُخصم)'), total: data.purchaseReturns.total },
  ] : [];
  const receiptColumns = useMemo<ColumnDef<(typeof receipts)[number]>[]>(() => [
    { accessorKey: 'label', header: ui('البند') },
    { accessorKey: 'total', header: ui('الإجمالي'), cell: ({ getValue }) => amount(getValue() as string) },
    { accessorKey: 'cash', header: ui('كاش'), cell: ({ getValue }) => amount(getValue() as string) },
    { accessorKey: 'knet', header: ui('KNET'), cell: ({ getValue }) => amount(getValue() as string) },
  ], [ui]);
  const outflowColumns = useMemo<ColumnDef<(typeof outflows)[number]>[]>(() => [
    { accessorKey: 'label', header: ui('البند') },
    { accessorKey: 'total', header: ui('القيمة'), cell: ({ getValue }) => amount(getValue() as string) },
  ], [ui]);
  const exportCsv = () => downloadCsv(`daily-closing-${date}`, [
    [ui('البند'), ui('الإجمالي'), ui('كاش'), 'KNET'],
    ...receipts.map((row) => [row.label, row.total, row.cash, row.knet]),
    [], [ui('المصروف/الخصم'), ui('القيمة')], ...outflows.map((row) => [row.label, row.total]),
  ]);
  const copyReport = async () => navigator.clipboard.writeText([
    ui('التقفيل اليومي'), date,
    ...receipts.map((row) => `${row.label}: ${row.total} | ${ui('كاش')} ${row.cash} | KNET ${row.knet}`),
    `${ui('إجمالي الإيرادات')}: ${data?.totalRevenue ?? 0}`,
    `${ui('صافي الربح')}: ${data?.netProfit ?? 0}`,
  ].join('\n'));
  return <ReportShell title={ui('التقفيل اليومي')} description={ui('إجمالي المقبوضات والمصروفات وصافي الربح حسب اليوم')}
    filters={<DateRangeFilter startDate={date} endDate={date} onStartChange={setDate} onEndChange={setDate} extra={<><BranchFilter value={branch} onChange={setBranch} /><select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={gender} onChange={(e) => setGender(e.target.value)}><option value="all">{ui('كل الأقسام')}</option><option value="male">{ui('رجالي')}</option><option value="female">{ui('نسائي')}</option></select></>} />}
    stats={<><ClubStatCard label={ui('إجمالي الإيرادات')} value={amount(data?.totalRevenue)} /><ClubStatCard label={ui('الإجمالي كاش')} value={amount(data?.totalCash)} /><ClubStatCard label={ui('الإجمالي KNET')} value={amount(data?.totalKnet)} /><ClubStatCard label={ui('صافي الربح')} value={amount(data?.netProfit)} /></>}
    onExport={exportCsv} extraActions={<><Button variant="outline" onClick={() => void copyReport()}>{ui('نسخ')}</Button><Button variant="outline" onClick={() => window.print()}>{ui('طباعة')}</Button></>}>
    <div className="space-y-6"><DataTable columns={receiptColumns} data={receipts} total={receipts.length} page={1} pageSize={10} onPageChange={() => {}} isLoading={isLoading} isError={isError} onRetry={() => void refetch()} emptyTitle={ui('لا توجد مقبوضات')} enableExport={false} />
      <DataTable columns={outflowColumns} data={outflows} total={outflows.length} page={1} pageSize={10} onPageChange={() => {}} isLoading={isLoading} isError={isError} onRetry={() => void refetch()} emptyTitle={ui('لا توجد مصروفات')} enableExport={false} />
    </div>
  </ReportShell>;
}

export function TargetReportPage() {
  const { ui } = useLocale();
  const user = useAuth((state) => state.user);
  const [branch, setBranch] = useState('all');
  const [employeeId, setEmployeeId] = useState('');
  const [operation, setOperation] = useState('all');
  const [startDate, setStartDate] = useState(firstOfMonth);
  const [endDate, setEndDate] = useState(todayLocal);
  const employees = useQuery({ queryKey: ['target-report-employees'], queryFn: async () => (await api.get<{ data: Array<{ id: number; employee?: string }> }>('/employees', { params: { page: 1, pageSize: 200, status: 1 } })).data.data ?? [] });
  const employeeOptions = useMemo(
    () => (employees.data ?? []).map((employee) => ({
      value: String(employee.id),
      label: employee.employee ?? String(employee.id),
      searchText: String(employee.id),
    })),
    [employees.data],
  );
  const report = useQuery({
    queryKey: ['target-report', branch, employeeId, operation, startDate, endDate], enabled: employeeId !== '' || user?.level === 2,
    queryFn: async () => (await api.get<TargetReportResponse>('/finance/target-report', { params: { ...(employeeId ? { employeeId } : {}), operationType: operation, fromDate: startDate, toDate: endDate, ...(normalizeBranchParam(branch) ? { branchId: branch } : {}) } })).data,
  });
  const rows = report.data?.rows ?? [];
  const columns = useMemo<ColumnDef<TargetRow>[]>(() => [
    { accessorKey: 'date', header: ui('التاريخ') }, { accessorKey: 'operation', header: ui('العملية') }, { accessorKey: 'type', header: ui('النوع') },
    { accessorKey: 'beforeDiscount', header: ui('قبل الخصم'), cell: ({ getValue }) => amount(getValue() as string) },
    { accessorKey: 'discount', header: ui('الخصم'), cell: ({ getValue }) => amount(getValue() as string) },
    { accessorKey: 'afterDiscount', header: ui('بعد الخصم'), cell: ({ getValue }) => amount(getValue() as string) },
    { accessorKey: 'paid', header: ui('المدفوع'), cell: ({ getValue }) => amount(getValue() as string) },
  ], [ui]);
  const exportCsv = () => downloadCsv('target-report', [[ui('التاريخ'), ui('العملية'), ui('النوع'), ui('قبل الخصم'), ui('الخصم'), ui('بعد الخصم'), ui('المدفوع')], ...rows.map((row) => [row.date, row.operation, row.type, row.beforeDiscount, row.discount, row.afterDiscount, row.paid])]);
  const copyReport = async () => navigator.clipboard.writeText([
    ui('تقرير التارجت'),
    ...rows.map((row) => `${row.date} | ${row.operation} | ${row.type} | ${row.paid}`),
    `${ui('الإجمالي النهائي')}: ${report.data?.grandTotal ?? 0}`,
  ].join('\n'));
  return <ReportShell title={ui('تقرير التارجت')} description={ui('حركة الشهر الحالي للمندوب المختار')}
    filters={<DateRangeFilter startDate={startDate} endDate={endDate} onStartChange={setStartDate} onEndChange={setEndDate} extra={<><BranchFilter value={branch} onChange={setBranch} /><label className="grid gap-1.5 text-xs text-muted-foreground">{ui('الموظف')}<Combobox value={employeeId} onValueChange={setEmployeeId} options={employeeOptions} className="h-10 min-w-56" placeholder={ui('اختر الموظف')} searchPlaceholder={ui('بحث باسم الموظف أو كوده…')} emptyText={ui('لا يوجد موظف مطابق')} aria-label={ui('بحث واختيار الموظف')} /></label><label className="grid gap-1.5 text-xs text-muted-foreground">{ui('نوع العملية')}<select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={operation} onChange={(e) => setOperation(e.target.value)}><option value="all">{ui('الكل')}</option><option value="subscriptions">{ui('اشتراكات')}</option><option value="sales">{ui('مبيعات')}</option></select></label></>} />}
    stats={<><ClubStatCard label={ui('إجمالي الاشتراكات')} value={amount(report.data?.subscriptionTotal)} /><ClubStatCard label={ui('إجمالي اللوكر')} value={amount(report.data?.lockerTotal)} /><ClubStatCard label={ui('إجمالي المبيعات')} value={amount(report.data?.salesTotal)} /><ClubStatCard label={ui('الإجمالي النهائي')} value={amount(report.data?.grandTotal)} /></>} onExport={exportCsv} extraActions={<><Button variant="outline" onClick={() => void copyReport()}>{ui('نسخ')}</Button><Button variant="outline" onClick={() => window.print()}>{ui('طباعة')}</Button></>}>
    <DataTable columns={columns} data={rows} total={rows.length} page={1} pageSize={rows.length || 10} onPageChange={() => {}} isLoading={report.isLoading} isError={report.isError} onRetry={() => void report.refetch()} emptyTitle={employeeId || user?.level === 2 ? ui('لا توجد عمليات تارجت') : ui('اختر موظفاً لعرض التقرير')} enableExport={false} />
  </ReportShell>;
}
