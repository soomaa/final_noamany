import { useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Printer } from 'lucide-react';
import { Combobox } from '@/components/common/combobox';
import { ReportShell, downloadCsv } from '@/components/reports/report-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DateRangeFilter, firstOfMonth, todayLocal } from '@/components/reports/date-range-filter';
import { BranchFilter, normalizeBranchParam } from '@/components/reports/branch-filter';
import { api } from '@/lib/api';
import { cn, toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';
import { useAuth } from '@/store/auth';
import { isBranchManagerUser, isSystemAdminUser } from '@/lib/user-scope';

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
  /** Petty cash; cash/knet are present from the 2026-10-20 API onward. */
  expenses: AmountTotals & Partial<ReceiptTotals>;
  subscriptionRefunds: AmountTotals;
  /** Refunded sales — informational, already excluded from sales revenue. */
  salesReturns?: ReceiptTotals;
  totalRevenue: string;
  totalOutflows: string;
  netProfit: string;
  totalCash: string;
  totalKnet: string;
}

interface TargetRow {
  operation: string;
  /** subscription | locker | sale — older API responses omit it, so it is derived from `operation` then. */
  kind?: 'subscription' | 'locker' | 'sale';
  /** Subscription type name, locker type, or the sale's product category (بار / بروتين). */
  type: string;
  beforeDiscount: string;
  discount: string;
  afterDiscount: string;
  paid: string;
  date: string;
  employeeName?: string | null;
  customerName?: string | null;
  memberCode?: string | null;
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
  const zero: ReceiptTotals = { total: '0', cash: '0', knet: '0' };
  // Revenue columns in the order of the daily closing sheet: subscriptions (regular, private, lockers), then sales.
  const revenueGroups = data ? [
    { group: ui('الاشتراكات'), cells: [
      { label: ui('عادي'), totals: data.regularSubscriptions, withTotal: true },
      { label: ui('برايفت'), totals: data.privateSubscriptions, withTotal: true },
      { label: ui('لوكر'), totals: data.lockers, withTotal: true },
    ] },
    { group: ui('المبيعات'), cells: [
      { label: ui('عادي'), totals: data.normalSales, withTotal: false },
      { label: ui('بروتين'), totals: data.proteinSales, withTotal: false },
    ] },
  ] : [];
  const expenseColumns = data ? [
    { label: ui('مرتجع اشتراكات'), value: data.subscriptionRefunds.total },
    { label: ui('المشتريات'), value: data.purchases.total },
    { label: ui('حساب موردين'), value: data.supplierPayments.total },
    { label: ui('مرتجع مشتريات (يُخصم)'), value: data.purchaseReturns.total, credit: true },
    { label: ui('نثريات نقدي'), value: data.expenses.cash ?? data.expenses.total },
    { label: ui('نثريات KNET'), value: data.expenses.knet ?? '0' },
  ] : [];
  const salesReturns = data?.salesReturns ?? zero;
  const net = Number(data?.netProfit ?? 0);
  const exportCsv = () => downloadCsv(`daily-closing-${date}`, [
    [ui('البند'), ui('الإجمالي'), ui('نقدي'), 'KNET'],
    ...revenueGroups.flatMap((g) => g.cells.map((c) => [`${g.group} - ${c.label}`, c.totals.total, c.totals.cash, c.totals.knet])),
    [ui('إجمالي الإيرادات'), data?.totalRevenue ?? '0', data?.totalCash ?? '0', data?.totalKnet ?? '0'],
    [],
    [ui('المصروف'), ui('القيمة')],
    ...expenseColumns.map((c) => [c.label, c.value]),
    [ui('مرتجع مبيعات (للعلم)'), salesReturns.total],
    [ui('إجمالي المصروفات'), data?.totalOutflows ?? '0'],
    [ui('صافي الربح'), data?.netProfit ?? '0'],
  ]);
  const copyReport = async () => navigator.clipboard.writeText([
    `${ui('التقفيل اليومي')} ${date}`,
    ...revenueGroups.flatMap((g) => g.cells.map((c) => `${g.group} ${c.label}: ${c.totals.total} | ${ui('نقدي')} ${c.totals.cash} | KNET ${c.totals.knet}`)),
    `${ui('إجمالي الإيرادات')}: ${data?.totalRevenue ?? 0}`,
    ...expenseColumns.map((c) => `${c.label}: ${c.value}`),
    `${ui('إجمالي المصروفات')}: ${data?.totalOutflows ?? 0}`,
    `${ui('صافي الربح')}: ${data?.netProfit ?? 0}`,
  ].join('\n'));
  const subHeads = revenueGroups.flatMap((g) => g.cells.flatMap((c) => c.withTotal
    ? [{ key: `${g.group}-${c.label}-t`, label: c.label, tone: 'total' as const }, { key: `${g.group}-${c.label}-c`, label: ui('نقدي'), tone: 'cash' as const }, { key: `${g.group}-${c.label}-k`, label: 'KNET', tone: 'knet' as const }]
    : [{ key: `${g.group}-${c.label}-c`, label: `${c.label} ${ui('نقدي')}`, tone: 'cash' as const }, { key: `${g.group}-${c.label}-k`, label: `${c.label} KNET`, tone: 'knet' as const }]));
  const revenueValues = revenueGroups.flatMap((g) => g.cells.flatMap((c) => c.withTotal ? [c.totals.total, c.totals.cash, c.totals.knet] : [c.totals.cash, c.totals.knet]));
  return <ReportShell title={ui('التقفيل اليومي')} description={ui('إجمالي المقبوضات والمصروفات وصافي الربح حسب اليوم')}
    filters={<DateRangeFilter startDate={date} endDate={date} onStartChange={setDate} onEndChange={setDate} extra={<><BranchFilter value={branch} onChange={setBranch} /><select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={gender} onChange={(e) => setGender(e.target.value)}><option value="all">{ui('كل الأقسام')}</option><option value="male">{ui('رجالي')}</option><option value="female">{ui('نسائي')}</option></select></>} />}
    onExport={exportCsv} extraActions={<Button variant="outline" onClick={() => void copyReport()}>{ui('نسخ')}</Button>}>
    <style>{`@media print { @page { size: A4 landscape; margin: 8mm; } body * { visibility: hidden; } #daily-closing-report, #daily-closing-report * { visibility: visible; } #daily-closing-report { position: absolute; inset: 0; width: 100%; } #daily-closing-report .no-print { display: none !important; } #daily-closing-report * { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }`}</style>
    <div id="daily-closing-report" className="space-y-6">
      <div className="hidden text-center print:block">
        <h2 className="text-xl font-bold">{ui('التقفيل اليومي')}</h2>
        <p className="nums text-sm">{toArabicDigits(date)}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <ClosingTile label={ui('إجمالي الإيرادات')} value={data?.totalRevenue} />
        <ClosingTile label={ui('الإجمالي نقدي')} value={data?.totalCash} />
        <ClosingTile label={ui('الإجمالي KNET')} value={data?.totalKnet} />
        <ClosingTile label={ui('إجمالي المصروفات')} value={data?.totalOutflows} />
        <ClosingTile label={ui('صافي الربح')} value={data?.netProfit} tone={net < 0 ? 'negative' : 'positive'} />
      </div>

      {isLoading ? <p className="py-10 text-center text-muted-foreground">{ui('جارٍ التحميل…')}</p>
        : isError ? <div className="py-10 text-center"><Button variant="outline" onClick={() => void refetch()}>{ui('إعادة المحاولة')}</Button></div>
        : <>
          <ClosingSection title={ui('تقرير الإيرادات اليومية')} caption={ui('ملخص الإيرادات')}>
            <table className="w-full min-w-[980px] border-collapse text-center text-xs sm:text-sm">
              <thead>
                <tr className={HEAD}>
                  <th rowSpan={2} className="border border-white/20 px-2 py-2">{ui('التاريخ')}</th>
                  {revenueGroups.map((g) => (
                    <th key={g.group} colSpan={g.cells.reduce((n, c) => n + (c.withTotal ? 3 : 2), 0)} className="border border-white/20 px-2 py-2 text-base">{g.group}</th>
                  ))}
                </tr>
                <tr className={SUB_HEAD}>
                  {subHeads.map((h) => (
                    <th key={h.key} className="border border-border px-2 py-2 font-bold">{h.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="bg-card">
                  <td className="nums border border-border px-2 py-3 font-semibold">{toArabicDigits(date)}</td>
                  {revenueValues.map((value, i) => (
                    <td key={subHeads[i].key} className={cn('nums border border-border px-2 py-3 text-base', subHeads[i].tone === 'total' ? 'font-extrabold' : 'font-semibold')}>{amount(value)}</td>
                  ))}
                </tr>
              </tbody>
            </table>
            <ClosingTotal label={ui('إجمالي الإيرادات')} value={data?.totalRevenue} />
          </ClosingSection>

          <ClosingSection title={ui('تقرير المصروفات اليومية')} caption={ui('ملخص المصروفات')}>
            <table className="w-full min-w-[760px] border-collapse text-center text-xs sm:text-sm">
              <thead>
                <tr className={HEAD}>
                  {expenseColumns.map((c) => <th key={c.label} className="border border-white/20 px-2 py-3 font-bold">{c.label}</th>)}
                </tr>
              </thead>
              <tbody>
                <tr className="bg-card">
                  {expenseColumns.map((c) => <td key={c.label} className="nums border border-border px-2 py-3 text-base font-semibold">{c.credit && Number(c.value) > 0 ? '−' : ''}{amount(c.value)}</td>)}
                </tr>
              </tbody>
            </table>
            <ClosingTotal label={ui('إجمالي المصروفات')} value={data?.totalOutflows} />
            <ClosingTotal label={ui('صافي الربح')} value={data?.netProfit} tone={net < 0 ? 'negative' : 'positive'} large />
            <p className="px-4 pb-3 text-xs text-muted-foreground">
              {ui('مرتجع مبيعات (للعلم)')}: <span className="nums font-semibold">{amount(salesReturns.total)}</span>
              {' — '}{ui('نقدي')} <span className="nums">{amount(salesReturns.cash)}</span>{' · '}KNET <span className="nums">{amount(salesReturns.knet)}</span>
              {' — '}{ui('المبيعات المرتجعة مستبعدة من الإيرادات ولا تُخصم مرة أخرى')}
            </p>
          </ClosingSection>
        </>}

      <div className="no-print flex justify-start">
        <Button onClick={() => window.print()} className="gap-2 px-6">
          <Printer className="size-4" />{ui('طباعة التقرير')}
        </Button>
      </div>
    </div>
  </ReportShell>;
}

/** One calm palette: a dark neutral header row, plain cells, colour only for profit/loss. */
const HEAD = 'bg-slate-800 text-white dark:bg-slate-700';
const SUB_HEAD = 'bg-muted text-foreground';
const TONE_TEXT = { neutral: 'text-foreground', positive: 'text-emerald-700 dark:text-emerald-400', negative: 'text-red-700 dark:text-red-400' } as const;
type Tone = keyof typeof TONE_TEXT;

function ClosingTile({ label, value, tone = 'neutral' }: { label: string; value: string | undefined; tone?: Tone }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <p className="text-sm font-bold text-muted-foreground">{label}</p>
      <p className={cn('nums mt-2 text-3xl font-extrabold', TONE_TEXT[tone])}>{amount(value)}</p>
    </div>
  );
}

function ClosingSection({ title, caption, children }: { title: string; caption: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="mx-auto w-fit border-b-2 border-foreground/40 px-2 pb-1 text-center text-lg font-extrabold">{title}</h3>
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="border-b border-border bg-muted px-4 py-3 text-center text-base font-extrabold">{caption}</div>
        <div className="overflow-x-auto">{children}</div>
      </div>
    </section>
  );
}

function ClosingTotal({ label, value, tone = 'neutral', large }: { label: string; value: string | undefined; tone?: Tone; large?: boolean }) {
  return (
    <div className={cn('grid grid-cols-[1fr_auto_1fr] items-center gap-3 border-t border-border bg-muted/60 px-4 font-extrabold', large ? 'py-3 text-lg' : 'py-2 text-base')}>
      <span>{label}</span>
      <span className={cn('nums text-center tracking-wide', large ? 'text-3xl' : 'text-2xl', TONE_TEXT[tone])}>{amount(value)}</span>
      <span aria-hidden="true" />
    </div>
  );
}

export function TargetReportPage() {
  const { ui } = useLocale();
  const user = useAuth((state) => state.user);
  const [branch, setBranch] = useState('all');
  const [employeeId, setEmployeeId] = useState('');
  const [operation, setOperation] = useState('all');
  const [startDate, setStartDate] = useState(firstOfMonth);
  const [endDate, setEndDate] = useState(todayLocal);
  // A regular employee only ever sees their own monthly target; admins and branch managers choose.
  const canPickEmployee = isSystemAdminUser(user) || isBranchManagerUser(user);
  const employees = useQuery({ enabled: canPickEmployee, queryKey: ['target-report-employees'], queryFn: async () => (await api.get<{ data: Array<{ id: number; employee?: string }> }>('/employees', { params: { page: 1, pageSize: 200, status: 1 } })).data.data ?? [] });
  const employeeOptions = useMemo(
    () => [
      { value: '', label: ui('كل الموظفين') },
      ...(employees.data ?? []).map((employee) => ({
        value: String(employee.id),
        label: employee.employee ?? String(employee.id),
        searchText: String(employee.id),
      })),
    ],
    [employees.data, ui],
  );
  const report = useQuery({
    queryKey: ['target-report', branch, employeeId, operation, startDate, endDate],
    queryFn: async () => (await api.get<TargetReportResponse>('/finance/target-report', { params: { ...(employeeId ? { employeeId } : {}), operationType: operation, fromDate: startDate, toDate: endDate, ...(normalizeBranchParam(branch) ? { branchId: branch } : {}) } })).data,
  });
  const rows = useMemo(() => report.data?.rows ?? [], [report.data?.rows]);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<{ key: TargetColumnKey; dir: 1 | -1 }>({ key: 'date', dir: 1 });
  const visibleRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = term
      ? rows.filter((row) => [row.date, row.type, ui(TARGET_KIND[targetKind(row)].label), row.paid, row.beforeDiscount, row.afterDiscount, row.discount, row.employeeName, row.customerName, row.memberCode]
        .some((value) => String(value).toLowerCase().includes(term)))
      : rows;
    const column = TARGET_COLUMNS.find((c) => c.key === sort.key)!;
    return [...filtered].sort((a, b) => {
      const x = column.numeric ? Number(a[sort.key as keyof TargetRow] ?? 0) : sortText(a, sort.key, ui);
      const y = column.numeric ? Number(b[sort.key as keyof TargetRow] ?? 0) : sortText(b, sort.key, ui);
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
    });
  }, [rows, search, sort, ui]);
  const headers = TARGET_COLUMNS.map((column) => ui(column.label));
  const exportRow = (row: TargetRow) => [row.date, row.employeeName ?? '', row.customerName ?? '', row.memberCode ?? '', ui(TARGET_KIND[targetKind(row)].label), row.type, row.beforeDiscount, row.discount, row.afterDiscount, row.paid];
  const exportCsv = () => downloadCsv('target-report', [headers, ...visibleRows.map(exportRow)]);
  const copyReport = async () => navigator.clipboard.writeText([
    ui('تقرير التارجت'),
    headers.join(' | '),
    ...visibleRows.map((row) => exportRow(row).join(' | ')),
    `${ui('إجمالي الإشتراكات')}: ${report.data?.subscriptionTotal ?? 0}`,
    `${ui('إجمالي المبيعات')}: ${report.data?.salesTotal ?? 0}`,
    `${ui('الإجمالي النهائي')}: ${report.data?.grandTotal ?? 0}`,
  ].join('\n'));
  const empty = ui('لا توجد عمليات تارجت');
  const employeeField = canPickEmployee
    ? <Combobox value={employeeId} onValueChange={setEmployeeId} options={employeeOptions} className="h-10 min-w-56" placeholder={ui('كل الموظفين')} searchPlaceholder={ui('بحث باسم الموظف أو كوده…')} emptyText={ui('لا يوجد موظف مطابق')} aria-label={ui('بحث واختيار الموظف')} />
    : <Input value={user?.name ?? ''} readOnly disabled className="h-10 min-w-56" aria-label={ui('الموظف')} />;
  return <ReportShell title={ui('تقرير التارجت')} description={canPickEmployee ? ui('تارجت الموظفين بالتفصيل: العميل ونوع الاشتراك والمبلغ') : ui('تارجتك للشهر الحالي بالتفصيل')}
    filters={<DateRangeFilter startDate={startDate} endDate={endDate} onStartChange={setStartDate} onEndChange={setEndDate} extra={<><BranchFilter value={branch} onChange={setBranch} /><label className="grid gap-1.5 text-xs text-muted-foreground">{ui('الموظف')}{employeeField}</label><label className="grid gap-1.5 text-xs text-muted-foreground">{ui('نوع العملية')}<select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={operation} onChange={(e) => setOperation(e.target.value)}><option value="all">{ui('الكل')}</option><option value="subscriptions">{ui('اشتراكات')}</option><option value="sales">{ui('مبيعات')}</option></select></label></>} />}
    onExport={exportCsv} extraActions={<><Button variant="outline" onClick={() => void copyReport()}>{ui('نسخ')}</Button><Button variant="outline" onClick={() => window.print()}>{ui('طباعة')}</Button></>}>
    <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <h3 className="text-base font-bold">{ui('نتيجة تقرير التارجت')}</h3>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          {ui('بحث')}
          <Input value={search} onChange={(event) => setSearch(event.target.value)} className="h-9 w-56" aria-label={ui('بحث في نتيجة التقرير')} />
        </label>
      </div>
      <div className="overflow-x-auto p-3">
        <table className="w-full min-w-[980px] border-separate border-spacing-0 overflow-hidden rounded-xl text-center text-sm">
          <thead>
            <tr className="bg-slate-800 text-white dark:bg-slate-700">
              {TARGET_COLUMNS.map((column) => (
                <th key={column.key} className="px-3 py-3 font-semibold">
                  <button type="button" className="inline-flex items-center gap-1" onClick={() => setSort((current) => ({ key: column.key, dir: current.key === column.key ? (current.dir === 1 ? -1 : 1) : 1 }))}>
                    {ui(column.label)}
                    <span className="text-xs opacity-80">{sort.key === column.key ? (sort.dir === 1 ? '↑' : '↓') : '↕'}</span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {report.isLoading ? (
              <tr><td colSpan={TARGET_COLUMNS.length} className="px-3 py-8 text-muted-foreground">{ui('جارٍ التحميل…')}</td></tr>
            ) : report.isError ? (
              <tr><td colSpan={TARGET_COLUMNS.length} className="px-3 py-8"><Button variant="outline" onClick={() => void report.refetch()}>{ui('إعادة المحاولة')}</Button></td></tr>
            ) : visibleRows.length === 0 ? (
              <tr><td colSpan={TARGET_COLUMNS.length} className="px-3 py-8 text-muted-foreground">{empty}</td></tr>
            ) : visibleRows.map((row, index) => {
              const kind = TARGET_KIND[targetKind(row)];
              return (
                <tr key={`${row.date}-${index}`} className="border-b border-border even:bg-muted/40">
                  <td className="nums px-3 py-3">{toArabicDigits(row.date)}</td>
                  <td className="px-3 py-3">{row.employeeName ?? '—'}</td>
                  <td className="px-3 py-3 font-semibold">{row.customerName ?? '—'}</td>
                  <td className="nums px-3 py-3">{row.memberCode ? toArabicDigits(row.memberCode) : '—'}</td>
                  <td className={cn('px-3 py-3 font-bold', kind.text)}>{ui(kind.label)}</td>
                  <td className="px-3 py-3">{row.type}</td>
                  <td className="nums px-3 py-3">{money2(row.beforeDiscount)}</td>
                  <td className="nums px-3 py-3">{money2(row.discount)}</td>
                  <td className="nums px-3 py-3">{money2(row.afterDiscount)}</td>
                  <td className="nums px-3 py-3 font-extrabold">{money2(row.paid)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <TargetSummary
          rows={[
            [{ label: ui('إجمالي الإشتراكات'), value: report.data?.subscriptionTotal }, { label: ui('إجمالي المبيعات'), value: report.data?.salesTotal }],
            ...(Number(report.data?.lockerTotal ?? 0) > 0 ? [[{ label: ui('إجمالي اللوكر'), value: report.data?.lockerTotal }]] : []),
            [{ label: ui('الإجمالي النهائي'), value: report.data?.grandTotal }],
          ]}
        />
      </div>
    </section>
  </ReportShell>;
}

type TargetColumnKey = 'date' | 'employeeName' | 'customerName' | 'memberCode' | 'kind' | 'type' | 'beforeDiscount' | 'discount' | 'afterDiscount' | 'paid';
const TARGET_COLUMNS: Array<{ key: TargetColumnKey; label: string; numeric?: boolean }> = [
  { key: 'date', label: 'التاريخ' },
  { key: 'employeeName', label: 'الموظف' },
  { key: 'customerName', label: 'اسم العميل' },
  { key: 'memberCode', label: 'كود العضو' },
  { key: 'kind', label: 'نوع العملية' },
  { key: 'type', label: 'نوع الاشتراك / الصنف' },
  { key: 'beforeDiscount', label: 'القيمة قبل الخصم', numeric: true },
  { key: 'discount', label: 'قيمة الخصم', numeric: true },
  { key: 'afterDiscount', label: 'القيمة بعد الخصم', numeric: true },
  { key: 'paid', label: 'المدفوع', numeric: true },
];
const TARGET_KIND = {
  subscription: { label: 'إشتراكات', text: 'text-foreground' },
  locker: { label: 'لوكر', text: 'text-foreground' },
  sale: { label: 'مبيعات', text: 'text-foreground' },
} as const;
function targetKind(row: TargetRow): keyof typeof TARGET_KIND {
  if (row.kind) return row.kind;
  return row.operation.includes('لوكر') ? 'locker' : row.operation.includes('مبيعات') ? 'sale' : 'subscription';
}
function sortText(row: TargetRow, key: TargetColumnKey, ui: (text: string) => string): string {
  if (key === 'kind') return ui(TARGET_KIND[targetKind(row)].label);
  return String(row[key as keyof TargetRow] ?? '');
}
const money2 = (value: string | number | undefined) => toArabicDigits(Number(value ?? 0).toFixed(2));

/** Totals under the table: a label cell beside its value, in the same calm palette as the report. */
function TargetSummary({ rows }: { rows: Array<Array<{ label: string; value: string | undefined }>> }) {
  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-border">
      {rows.map((cells, rowIndex) => (
        <div key={rowIndex} className="grid grid-cols-4 border-b border-border last:border-b-0">
          {cells.map((cell) => (
            <div key={cell.label} className="contents">
              <div className={cn('flex items-center justify-center bg-muted px-3 py-4 text-base font-bold', cells.length === 1 && 'col-span-3')}>
                {cell.label}
              </div>
              <div className="nums flex items-center justify-center bg-card px-3 py-4 text-xl font-extrabold">
                {toArabicDigits(Number(cell.value ?? 0))}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
