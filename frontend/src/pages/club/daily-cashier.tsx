import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  Banknote,
  CalendarDays,
  CheckCircle2,
  Coffee,
  FileSpreadsheet,
  LockKeyhole,
  ReceiptText,
  RefreshCw,
  Search,
  SlidersHorizontal,
  TrendingDown,
  UserRound,
  WalletCards,
  Zap,
} from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { ErrorState } from '@/components/common/states';
import { PageHeader } from '@/components/common/page-header';
import { MemberGenderSelect, useMemberGenderFilter } from '@/components/club/member-gender-filter';
import { BranchFilter, normalizeBranchParam } from '@/components/reports/branch-filter';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { useBranches } from '@/hooks/use-branches';
import { api, apiError } from '@/lib/api';
import { downloadMultiSheetExcel, type ExportColumn } from '@/lib/export';
import { formatDate, formatMoney, formatTimeFromDate, localToday } from '@/lib/formatters';
import { cn, toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';

type SubscriptionStatus = 'active' | 'expired' | 'upcoming' | 'frozen';
type CashierSource =
  | 'subscription'
  | 'installment'
  | 'quick_service'
  | 'locker'
  | 'spa'
  | 'inbody'
  | 'other'
  | 'bar';

interface PaymentLine {
  method: string;
  amount: number;
}

interface ContractRow {
  id: number;
  subscriptionNumber: string;
  registrationDate?: string;
  customerName: string | null;
  subscriptionType: string | null;
  subscriptionValue: number;
  paidAmount: number;
  remainingAmount: number;
  status: SubscriptionStatus;
  createdAt: string;
  createdByUserId: number | null;
  createdByName: string | null;
}

interface MoneyRow {
  key: string;
  id: number;
  source: CashierSource;
  sourceLabel: string;
  number: string;
  customerName: string | null;
  amount: number;
  paymentMethod: string;
  payments: PaymentLine[];
  paymentsTotal: number;
  reconciliationDifference: number;
  isReconciled: boolean;
  date: string;
  createdAt: string;
  createdByUserId: number | null;
  createdByName: string;
}

interface ReceiptRow extends MoneyRow {
  subscriptionId: number | null;
  subscriptionNumber: string | null;
  subscriptionType: string | null;
}

interface ServiceRow extends MoneyRow {
  serviceName: string;
}

interface ExpenseRow {
  id: number;
  expenseNumber: string;
  date: string;
  category: string;
  subCategory: string | null;
  description: string | null;
  amount: number;
  paymentMethod: string;
  isRefund: boolean;
  createdAt: string;
  createdByUserId: number | null;
  createdByName: string;
}

interface UserCashRow {
  userId: number | null;
  name: string;
  cash: number;
  card: number;
  transfer: number;
  other: number;
  total: number;
  receptionTotal: number;
  barTotal: number;
  expensesCash: number;
  refundsCash: number;
  expensesTotal: number;
  cashInDrawer: number;
}

interface BarSaleRow {
  id: number;
  saleNumber: string;
  date: string;
  time: string;
  customerName: string;
  total: number;
  collected: number;
  unpaid: number;
  paymentMethod: string;
  payments: PaymentLine[];
  cashierUserId: number | null;
  cashierName: string;
}

interface BarCashierRow {
  userId: number | null;
  name: string;
  count: number;
  salesTotal: number;
  collected: number;
  cash: number;
  card: number;
  transfer: number;
  other: number;
}

interface DailyCashierResponse {
  date: string;
  dateFrom: string;
  dateTo: string;
  today: string;
  isToday: boolean;
  isSingleDay: boolean;
  isSystemAdmin: boolean;
  lockedUser: boolean;
  selectedUserId: number | null;
  selectedUserName: string;
  users: Array<{ id: number; name: string }>;
  summary: {
    subscriptionsCount: number;
    totalValue: number;
    paidAmount: number;
    remainingAmount: number;
    collectedToday: number;
    collectedTotal: number;
    receiptsCount: number;
    subscriptionReceiptsCount: number;
    subscriptionsCollected: number;
    servicesCount: number;
    servicesCollected: number;
    otherCollected: number;
    bySource: Record<string, { count: number; total: number; cash: number }>;
    collectedByMethod: Record<string, number>;
    paymentsTotal: number;
    reconciliationDifference: number;
    unreconciledReceiptsCount: number;
    isReconciled: boolean;
    expensesCount: number;
    expensesTotal: number;
    refundsCount: number;
    refundsTotal: number;
    expensesByMethod: Record<string, number>;
  };
  drawer: {
    subscriptionsCash: number;
    servicesCash: number;
    otherReceiptsCash: number;
    barCash: number;
    collectedCash: number;
    expensesCash: number;
    refundsCash: number;
    cashInDrawer: number;
  };
  byUser: UserCashRow[];
  rows: ContractRow[];
  receiptRows: ReceiptRow[];
  serviceRows: ServiceRow[];
  expenseRows: ExpenseRow[];
  bar: {
    count: number;
    salesTotal: number;
    collected: number;
    unpaid: number;
    byMethod: Record<string, number>;
    cash: number;
    byCashier: BarCashierRow[];
    rows: BarSaleRow[];
    rowsTruncated: boolean;
  };
}

const METHOD_LABELS: Record<string, string> = {
  cash: 'نقدي',
  card: 'بطاقة',
  visa: 'فيزا',
  instapay: 'إنستا باي',
  wallet: 'محفظة',
  bank: 'حساب بنكي',
  transfer: 'تحويل بنكي',
  online: 'إلكتروني',
  mixed: 'مختلط',
  other: 'أخرى',
};

const statusMeta: Record<
  SubscriptionStatus,
  { label: string; variant: 'success' | 'warning' | 'destructive' | 'secondary' }
> = {
  active: { label: 'ساري', variant: 'success' },
  upcoming: { label: 'قادم', variant: 'warning' },
  expired: { label: 'منتهي', variant: 'destructive' },
  frozen: { label: 'مجمّد', variant: 'secondary' },
};

const sourceVariant: Partial<Record<CashierSource, 'default' | 'secondary' | 'success' | 'warning'>> = {
  subscription: 'success',
  installment: 'warning',
  quick_service: 'default',
  locker: 'secondary',
  spa: 'secondary',
  inbody: 'secondary',
};

/** Phones: the first column stays put while the rest of the table scrolls sideways. */
const STICKY_CELL = 'max-md:sticky max-md:start-0 max-md:z-[1] max-md:bg-card max-md:border-e';
const STICKY_HEAD = `${STICKY_CELL} max-md:bg-muted`;

interface Column<T> {
  header: string;
  cell: (row: T) => ReactNode;
  className?: string;
}

function DataTable<T>({
  rows,
  columns,
  rowKey,
  loading,
  empty,
  minWidth = 960,
  caption,
}: {
  rows: T[];
  columns: Array<Column<T> | null | false>;
  rowKey: (row: T) => string | number;
  loading: boolean;
  empty: string;
  minWidth?: number;
  caption: string;
}) {
  const cols = columns.filter(Boolean) as Column<T>[];
  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-sm" style={{ minWidth }}>
          <caption className="sr-only">{caption}</caption>
          <thead className="border-b bg-muted/40 text-muted-foreground">
            <tr>
              {cols.map((col, index) => (
                <th key={col.header} className={cn('whitespace-nowrap px-4 py-3 text-start font-semibold', index === 0 && STICKY_HEAD)}>{col.header}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading
              ? Array.from({ length: 3 }).map((_, index) => (
                  <tr key={index}>
                    <td colSpan={cols.length} className="px-4 py-3"><Skeleton className="h-7 w-full" /></td>
                  </tr>
                ))
              : rows.map((row) => (
                  <tr key={rowKey(row)} className="transition-colors hover:bg-muted/25">
                    {cols.map((col, index) => (
                      <td key={col.header} className={cn('px-4 py-3', col.className, index === 0 && STICKY_CELL)}>{col.cell(row)}</td>
                    ))}
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
      {!loading && rows.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-muted-foreground">{empty}</p>
      ) : null}
    </>
  );
}

function Section({
  title,
  description,
  icon: Icon,
  children,
  className,
}: {
  title: string;
  description?: string;
  icon?: typeof Banknote;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardContent className="p-0">
        <div className="flex items-start gap-3 border-b p-4">
          {Icon ? <Icon className="mt-0.5 size-5 shrink-0 text-primary" /> : null}
          <div>
            <h2 className="font-bold">{title}</h2>
            {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
          </div>
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

function SummaryCard({
  title,
  value,
  hint,
  icon: Icon,
  iconClassName,
  loading,
}: {
  title: string;
  value: string;
  hint?: string;
  icon: typeof Banknote;
  iconClassName: string;
  loading: boolean;
}) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-3 p-5">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{title}</p>
          {loading ? (
            <Skeleton className="mt-3 h-8 w-28" />
          ) : (
            <p className="nums mt-2 text-2xl font-black">{value}</p>
          )}
          {hint && !loading ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
        </div>
        <span className={cn('flex size-11 shrink-0 items-center justify-center rounded-2xl', iconClassName)}>
          <Icon className="size-5" />
        </span>
      </CardContent>
    </Card>
  );
}

export function ClubDailyCashierPage() {
  const { locale, ui } = useLocale();
  const today = localToday();
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);
  const [branch, setBranch] = useState('all');
  const gender = useMemberGenderFilter();
  const [userId, setUserId] = useState('all');
  const [search, setSearch] = useState('');
  const [exporting, setExporting] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const { data: branchOptions } = useBranches();

  const money = (value: number) => formatMoney(value ?? 0, undefined, locale);
  const methodLabel = (method: string) => ui(METHOD_LABELS[method] ?? method);
  const methodsLabel = (payments: PaymentLine[], fallback: string) =>
    payments.length > 1
      ? payments.map((p) => `${methodLabel(p.method)} ${money(p.amount)}`).join(' + ')
      : methodLabel(payments[0]?.method ?? fallback);
  const whenLabel = (date: string, createdAt: string | null, isRange: boolean) => {
    const time = createdAt ? formatTimeFromDate(createdAt, locale) : '';
    return isRange ? `${formatDate(date, 'd MMM', locale)} ${time}`.trim() : time || '—';
  };

  const params = {
    dateFrom,
    dateTo,
    ...(userId !== 'all' ? { userId } : {}),
    ...(normalizeBranchParam(branch) ? { branchId: normalizeBranchParam(branch) } : {}),
    ...(gender.param ? { gender: gender.param } : {}),
  };

  const query = useQuery({
    queryKey: ['club-subscriptions', 'daily-cashier', params],
    queryFn: async () => {
      const response = await api.get<DailyCashierResponse>('/club-subscriptions/daily-cashier', { params });
      return response.data;
    },
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    // The drawer figure replaces the "how much cash do you have?" phone call: keep it live today.
    refetchInterval: dateTo === today ? 60_000 : false,
  });

  const data = query.data;
  const summary = data?.summary;
  const drawer = data?.drawer;
  const isRange = data ? !data.isSingleDay : dateFrom !== dateTo;
  const showUser = !data?.lockedUser;

  const needle = search.trim().toLocaleLowerCase(locale === 'ar' ? 'ar' : 'en');
  const matches = (...values: Array<string | null | undefined>) =>
    !needle || values.some((value) => value?.toLocaleLowerCase(locale === 'ar' ? 'ar' : 'en').includes(needle));

  const receiptRows = useMemo(
    () => (data?.receiptRows ?? []).filter((r) => matches(r.number, r.subscriptionNumber, r.customerName, r.subscriptionType, r.createdByName)),
    [data?.receiptRows, needle],
  );
  const serviceRows = useMemo(
    () => (data?.serviceRows ?? []).filter((r) => matches(r.number, r.customerName, r.serviceName, r.sourceLabel, r.createdByName)),
    [data?.serviceRows, needle],
  );
  const expenseRows = useMemo(
    () => (data?.expenseRows ?? []).filter((r) => matches(r.expenseNumber, r.category, r.subCategory, r.description, r.createdByName)),
    [data?.expenseRows, needle],
  );
  const contractRows = useMemo(
    () => (data?.rows ?? []).filter((r) => matches(r.subscriptionNumber, r.customerName, r.subscriptionType, r.createdByName)),
    [data?.rows, needle],
  );
  const barRows = useMemo(
    () => (data?.bar.rows ?? []).filter((r) => matches(r.saleNumber, r.customerName, r.cashierName)),
    [data?.bar.rows, needle],
  );

  const servicesByName = useMemo(() => {
    const totals = new Map<string, number>();
    for (const row of data?.serviceRows ?? []) {
      totals.set(row.serviceName, (totals.get(row.serviceName) ?? 0) + row.amount);
    }
    return [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [data?.serviceRows]);

  const periodLabel = data
    ? data.isSingleDay
      ? formatDate(data.dateFrom, 'EEEE، d MMMM yyyy', locale)
      : `${formatDate(data.dateFrom, 'd MMMM yyyy', locale)} — ${formatDate(data.dateTo, 'd MMMM yyyy', locale)}`
    : undefined;

  const exportExcel = async () => {
    if (!data) return;
    setExporting(true);
    try {
      const col = (key: string, header: string): ExportColumn => ({ key, header: ui(header) });
      const summaryRows = [
        ['الفترة', periodLabel ?? ''],
        ['المستخدم', data.selectedUserName],
        ['إجمالي تحصيل الاستقبال', data.summary.collectedTotal],
        ['الاشتراكات والأقساط', data.summary.subscriptionsCollected],
        ['خدمات الاستقبال', data.summary.servicesCollected],
        ['إيصالات أخرى', data.summary.otherCollected],
        ...Object.entries(data.summary.collectedByMethod).map(([m, v]) => [`تحصيل ${METHOD_LABELS[m] ?? m}`, v]),
        ['المصروفات', data.summary.expensesTotal],
        ['المرتجعات', data.summary.refundsTotal],
        ['البار / الكافيه — المبيعات', data.bar.salesTotal],
        ['البار / الكافيه — المحصل', data.bar.collected],
        ['نقدي الاشتراكات', data.drawer.subscriptionsCash],
        ['نقدي الخدمات', data.drawer.servicesCash],
        ['نقدي إيصالات أخرى', data.drawer.otherReceiptsCash],
        ['نقدي البار', data.drawer.barCash],
        ['مصروفات نقدي', -data.drawer.expensesCash],
        ['مرتجعات نقدي', -data.drawer.refundsCash],
        ['الكاش في الدرج', data.drawer.cashInDrawer],
        ['المطابقة', data.summary.isReconciled ? 'متطابقة' : `فرق ${data.summary.reconciliationDifference}`],
      ].map(([label, value]) => ({ label: ui(String(label)), value }));
      await downloadMultiSheetExcel(
        [
          { name: ui('الملخص'), columns: [col('label', 'البند'), col('value', 'القيمة')], rows: summaryRows },
          {
            name: ui('الكاش مع مين'),
            columns: [
              col('name', 'المستخدم'), col('cash', 'نقدي'), col('card', 'فيزا / بطاقة'), col('transfer', 'تحويل / محافظ'),
              col('other', 'أخرى'), col('total', 'الإجمالي'), col('barTotal', 'منها البار'),
              col('expensesCash', 'مصروفات نقدي'), col('refundsCash', 'مرتجعات نقدي'), col('cashInDrawer', 'الكاش اللي معاه'),
            ],
            rows: data.byUser as unknown as Record<string, unknown>[],
          },
          {
            name: ui('إيصالات الاشتراكات'),
            columns: [
              col('number', 'رقم الإيصال'), col('sourceLabel', 'النوع'), col('subscriptionNumber', 'رقم الاشتراك'),
              col('customerName', 'العميل'), col('subscriptionType', 'نوع الاشتراك'), col('createdByName', 'المستخدم'),
              col('amount', 'المبلغ'), col('method', 'طريقة الدفع'), col('date', 'التاريخ'),
            ],
            rows: data.receiptRows.map((r) => ({ ...r, method: methodsLabel(r.payments, r.paymentMethod) })),
          },
          {
            name: ui('خدمات الاستقبال'),
            columns: [
              col('number', 'الرقم'), col('sourceLabel', 'النوع'), col('serviceName', 'الخدمة'), col('customerName', 'العميل'),
              col('createdByName', 'المستخدم'), col('amount', 'المبلغ'), col('method', 'طريقة الدفع'), col('date', 'التاريخ'),
            ],
            rows: data.serviceRows.map((r) => ({ ...r, method: methodsLabel(r.payments, r.paymentMethod) })),
          },
          {
            name: ui('المصروفات والمرتجعات'),
            columns: [
              col('expenseNumber', 'الرقم'), col('kind', 'النوع'), col('category', 'البند'), col('description', 'الوصف'),
              col('createdByName', 'المستخدم'), col('amount', 'المبلغ'), col('method', 'طريقة الدفع'), col('date', 'التاريخ'),
            ],
            rows: data.expenseRows.map((r) => ({ ...r, kind: r.isRefund ? 'مرتجع' : 'مصروف', method: methodLabel(r.paymentMethod) })),
          },
          {
            name: ui('العقود'),
            columns: [
              col('subscriptionNumber', 'رقم الاشتراك'), col('customerName', 'العميل'), col('subscriptionType', 'نوع الاشتراك'),
              col('createdByName', 'المستخدم'), col('subscriptionValue', 'القيمة'), col('paidAmount', 'المدفوع'),
              col('remainingAmount', 'المتبقي'), col('registrationDate', 'التاريخ'),
            ],
            rows: data.rows as unknown as Record<string, unknown>[],
          },
          {
            name: ui('البار - الكاشير'),
            columns: [
              col('name', 'الكاشير'), col('count', 'عدد الفواتير'), col('salesTotal', 'المبيعات'), col('collected', 'المحصل'),
              col('cash', 'نقدي'), col('card', 'بطاقة'), col('transfer', 'تحويل / محافظ'),
            ],
            rows: data.bar.byCashier as unknown as Record<string, unknown>[],
          },
          {
            name: ui('البار - الفواتير'),
            columns: [
              col('saleNumber', 'رقم الفاتورة'), col('date', 'التاريخ'), col('time', 'الوقت'), col('customerName', 'العميل'),
              col('cashierName', 'الكاشير'), col('total', 'الإجمالي'), col('collected', 'المحصل'), col('method', 'طريقة الدفع'),
            ],
            rows: data.bar.rows.map((r) => ({ ...r, method: methodsLabel(r.payments, r.paymentMethod) })),
          },
        ],
        `يومية-الاستقبال-${data.dateFrom}${data.isSingleDay ? '' : `-${data.dateTo}`}.xlsx`,
      );
    } finally {
      setExporting(false);
    }
  };

  if (query.isError) {
    return (
      <ErrorState
        message={apiError(query.error, ui('تعذر تحميل يومية الاستقبال'))}
        onRetry={() => void query.refetch()}
      />
    );
  }

  const userColumn = <T extends { createdByName: string | null }>(): Column<T> | null =>
    showUser
      ? {
          header: ui('المستخدم'),
          cell: (row) => (
            <span className="inline-flex items-center gap-2 whitespace-nowrap">
              <UserRound className="size-4 text-muted-foreground" />
              {row.createdByName || '—'}
            </span>
          ),
        }
      : null;

  const methodColumn = <T extends MoneyRow>(): Column<T> => ({
    header: ui('طريقة الدفع'),
    cell: (row) => (
      <span className="inline-flex flex-wrap items-center gap-1">
        {methodsLabel(row.payments, row.paymentMethod)}
        {!row.isReconciled ? (
          <Badge variant="destructive">{ui('فرق')} {money(Math.abs(row.reconciliationDifference))}</Badge>
        ) : null}
      </span>
    ),
  });

  const drawerParts: Array<{ label: string; value: number; sign: '+' | '−'; hide?: boolean }> = drawer
    ? [
        { label: 'اشتراكات وأقساط', value: drawer.subscriptionsCash, sign: '+' },
        { label: 'خدمات الاستقبال', value: drawer.servicesCash, sign: '+' },
        { label: 'إيصالات أخرى', value: drawer.otherReceiptsCash, sign: '+', hide: drawer.otherReceiptsCash === 0 },
        { label: 'البار / الكافيه', value: drawer.barCash, sign: '+' },
        { label: 'مصروفات', value: drawer.expensesCash, sign: '−' },
        { label: 'مرتجعات', value: drawer.refundsCash, sign: '−', hide: drawer.refundsCash === 0 },
      ]
    : [];
  const hasOtherMethod = (data?.byUser ?? []).some((row) => row.other !== 0);
  const isTodayOnly = dateFrom === today && dateTo === today;
  const shortDate = (d: string) => formatDate(d, 'd MMM', locale);
  const branchName = normalizeBranchParam(branch)
    ? (branchOptions ?? []).find((b) => String(b.id) === branch)?.name ?? ui('فرع')
    : ui('كل الفروع');
  const filterSummary = [
    isTodayOnly ? ui('النهارده') : dateFrom === dateTo ? shortDate(dateFrom) : `${shortDate(dateFrom)} — ${shortDate(dateTo)}`,
    branchName,
    gender.value === 'male' ? ui('رجالي') : gender.value === 'female' ? ui('حريمي') : null,
    data?.lockedUser ? null : userId !== 'all' ? data?.selectedUserName ?? null : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const activeFilterCount =
    (isTodayOnly ? 0 : 1) + (normalizeBranchParam(branch) ? 1 : 0) + (gender.param ? 1 : 0) + (userId !== 'all' ? 1 : 0) + (search.trim() ? 1 : 0);

  /** The filter fields: inline on desktop, a 2-column grid inside the bottom sheet on phones. */
  const renderFilterFields = (mobile: boolean) => {
    const id = (name: string) => `daily-cashier-${name}${mobile ? '-m' : ''}`;
    const dateClass = mobile ? 'nums h-10 w-full' : 'nums h-10 w-[10.5rem]';
    return (
      <>
        <div className={cn('grid gap-1.5', mobile && 'min-w-0')}>
          <Label htmlFor={id('from')} className="text-xs text-muted-foreground">{ui('من تاريخ')}</Label>
          <Input
            id={id('from')}
            type="date"
            dir="ltr"
            className={dateClass}
            value={dateFrom}
            max={dateTo || today}
            onChange={(event) => setDateFrom(event.target.value || today)}
          />
        </div>
        <div className={cn('grid gap-1.5', mobile && 'min-w-0')}>
          <Label htmlFor={id('to')} className="text-xs text-muted-foreground">{ui('إلى تاريخ')}</Label>
          <Input
            id={id('to')}
            type="date"
            dir="ltr"
            className={dateClass}
            value={dateTo}
            min={dateFrom}
            max={today}
            onChange={(event) => {
              const next = event.target.value || today;
              setDateTo(next > today ? today : next);
              if (next < dateFrom) setDateFrom(next);
            }}
          />
        </div>
        {!isTodayOnly ? (
          <Button variant="outline" className={cn('h-10', mobile && 'col-span-2')} onClick={() => { setDateFrom(today); setDateTo(today); }}>
            {ui('النهارده')}
          </Button>
        ) : null}
        <div className={cn(mobile && 'min-w-0 [&_.w-52]:w-full')}>
          <BranchFilter value={branch} onChange={setBranch} />
        </div>
        <MemberGenderSelect
          value={gender.value}
          onChange={gender.setValue}
          locked={gender.locked}
          className={mobile ? 'min-w-0' : undefined}
        />
        <div className={cn('grid gap-1.5', mobile ? 'col-span-2' : 'min-w-[13rem]')}>
          <Label className="text-xs text-muted-foreground">{ui('المستخدم (اللي حصّل)')}</Label>
          {data?.lockedUser ? (
            <div className="flex h-10 items-center gap-2 rounded-md border bg-muted/45 px-3 text-sm">
              <LockKeyhole className="size-4 shrink-0 text-primary" />
              <span className="truncate font-semibold">{data.selectedUserName}</span>
            </div>
          ) : (
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger className="h-10">
                <SelectValue placeholder={ui('كل المستخدمين')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{ui('كل المستخدمين')}</SelectItem>
                {(data?.users ?? []).map((user) => (
                  <SelectItem key={user.id} value={String(user.id)}>{user.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <div className={cn('grid gap-1.5', mobile ? 'col-span-2' : 'min-w-[14rem] flex-1')}>
          <Label htmlFor={id('search')} className="text-xs text-muted-foreground">{ui('بحث في اليومية')}</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id={id('search')}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={ui('اسم، رقم إيصال، اشتراك، خدمة أو مستخدم')}
              className="h-10 ps-10"
            />
          </div>
        </div>
      </>
    );
  };


  return (
    <div className="space-y-5">
      <PageHeader
        title={ui('يومية الاستقبال')}
        description={ui('كل اللي اتحصّل في الاستقبال والبار، المصروفات، والكاش اللي المفروض يكون في الدرج — حسب الفترة والفرع والمستخدم.')}
        eyebrow={periodLabel}
        actions={(
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="max-sm:w-10 max-sm:px-0" aria-label={ui('تصدير Excel')} title={ui('تصدير Excel')} onClick={() => void exportExcel()} disabled={!data || exporting}>
              <FileSpreadsheet className="size-4" />
              <span className="max-sm:sr-only">{ui('تصدير Excel')}</span>
            </Button>
            <Button variant="outline" className="max-sm:w-10 max-sm:px-0" aria-label={ui('تحديث')} title={ui('تحديث')} onClick={() => void query.refetch()} disabled={query.isFetching}>
              <RefreshCw className={cn('size-4', query.isFetching && 'animate-spin')} />
              <span className="max-sm:sr-only">{ui('تحديث')}</span>
            </Button>
          </div>
        )}
      />

      <Card className="hidden border-primary/20 bg-primary/[0.025] md:block">
        <CardContent className="flex flex-wrap items-end gap-4 p-4">{renderFilterFields(false)}</CardContent>
      </Card>

      {/* «الكاش في الدرج دلوقتي» — the figure the owner used to phone staff for. */}
      <Card className="overflow-hidden border-2 border-emerald-600/40 bg-gradient-to-br from-emerald-500/[0.10] via-emerald-500/[0.04] to-transparent">
        <CardContent className="flex flex-col gap-5 p-5 lg:p-6">
          <div className="flex flex-col justify-center gap-2">
            <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300">
              <Banknote className="size-6" />
              <h2 className="text-lg font-black">
                {data?.isToday === false ? ui('الكاش المفروض في الدرج عن الفترة') : ui('الكاش في الدرج دلوقتي')}
              </h2>
            </div>
            {query.isLoading ? (
              <Skeleton className="h-14 w-56" />
            ) : (
              <p className={cn('nums text-4xl font-black tracking-tight sm:text-5xl md:text-6xl', (drawer?.cashInDrawer ?? 0) < 0 ? 'text-destructive' : 'text-emerald-700 dark:text-emerald-300')}>
                {money(drawer?.cashInDrawer ?? 0)}
              </p>
            )}
            <p className="text-sm text-muted-foreground">
              {data?.selectedUserName ?? ''} · {ui('النقدي المحصّل ناقص المصروفات والمرتجعات النقدي')}
              {data?.isToday ? ` · ${ui('بيتحدّث كل دقيقة')}` : ''}
            </p>
          </div>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
              {drawerParts.filter((part) => !part.hide).map((part) => (
                <div
                  key={part.label}
                  className={cn(
                    'rounded-xl border bg-background/70 px-3 py-2',
                    part.sign === '−' && part.value > 0 && 'border-destructive/30',
                  )}
                >
                  <p className="text-xs text-muted-foreground">{part.sign} {ui(part.label)} ({ui('نقدي')})</p>
                  <p className={cn('nums font-bold', part.sign === '−' && part.value > 0 && 'text-destructive')}>
                    {part.sign === '−' && part.value > 0 ? '−' : ''}{money(part.value)}
                  </p>
                </div>
              ))}
            </div>
            <div className="space-y-2 md:hidden">
              {(data?.byUser ?? []).map((row) => (
                <div key={row.userId ?? 'none'} className="rounded-xl border bg-background/80 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 font-semibold">
                      <span className="break-words">{row.name}</span>
                      {row.barTotal > 0 ? <Badge variant="secondary" className="ms-2">{ui('بار')}</Badge> : null}
                    </p>
                    <div className="shrink-0 text-end">
                      <p className="text-[11px] text-muted-foreground">{ui('الكاش اللي معاه')}</p>
                      <p className="nums text-lg font-black text-emerald-700 dark:text-emerald-300">{money(row.cashInDrawer)}</p>
                    </div>
                  </div>
                  <dl className="mt-2 grid grid-cols-3 gap-x-3 gap-y-1.5 border-t pt-2 text-xs">
                    {[
                      ['نقدي', money(row.cash)],
                      ['فيزا / بطاقة', money(row.card)],
                      ['تحويل / محافظ', money(row.transfer)],
                      ...(hasOtherMethod ? [['أخرى', money(row.other)]] : []),
                      ['الإجمالي', money(row.total)],
                      ['مصروفات نقدي', row.expensesCash + row.refundsCash > 0 ? `−${money(row.expensesCash + row.refundsCash)}` : money(0)],
                    ].map(([label, value]) => (
                      <div key={label} className="min-w-0">
                        <dt className="text-muted-foreground">{ui(label)}</dt>
                        <dd className={cn('nums truncate font-semibold', label === 'مصروفات نقدي' && row.expensesCash + row.refundsCash > 0 && 'text-destructive')}>{value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ))}
              {!query.isLoading && (data?.byUser.length ?? 0) === 0 ? (
                <p className="rounded-xl border bg-background/80 px-3 py-6 text-center text-sm text-muted-foreground">{ui('مفيش تحصيل في الفترة دي')}</p>
              ) : null}
            </div>
            <div className="hidden overflow-x-auto rounded-xl border bg-background/80 md:block">
              <table className="w-full min-w-[720px] text-sm">
                <caption className="sr-only">{ui('الكاش مع مين')}</caption>
                <thead className="border-b bg-muted/40 text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-start font-semibold">{ui('المستخدم')}</th>
                    <th className="px-3 py-2 text-start font-semibold">{ui('نقدي')}</th>
                    <th className="px-3 py-2 text-start font-semibold">{ui('فيزا / بطاقة')}</th>
                    <th className="px-3 py-2 text-start font-semibold">{ui('تحويل / محافظ')}</th>
                    {hasOtherMethod ? <th className="px-3 py-2 text-start font-semibold">{ui('أخرى')}</th> : null}
                    <th className="px-3 py-2 text-start font-semibold">{ui('الإجمالي')}</th>
                    <th className="px-3 py-2 text-start font-semibold">{ui('مصروفات / مرتجعات نقدي')}</th>
                    <th className="px-3 py-2 text-start font-semibold text-emerald-800 dark:text-emerald-300">{ui('الكاش اللي معاه')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {(data?.byUser ?? []).map((row) => (
                    <tr key={row.userId ?? 'none'}>
                      <td className="px-3 py-2 font-medium">
                        {row.name}
                        {row.barTotal > 0 ? <Badge variant="secondary" className="ms-2">{ui('بار')}</Badge> : null}
                      </td>
                      <td className="nums px-3 py-2">{money(row.cash)}</td>
                      <td className="nums px-3 py-2">{money(row.card)}</td>
                      <td className="nums px-3 py-2">{money(row.transfer)}</td>
                      {hasOtherMethod ? <td className="nums px-3 py-2">{money(row.other)}</td> : null}
                      <td className="nums px-3 py-2 font-semibold">{money(row.total)}</td>
                      <td className="nums px-3 py-2 text-destructive">
                        {row.expensesCash + row.refundsCash > 0 ? `−${money(row.expensesCash + row.refundsCash)}` : money(0)}
                      </td>
                      <td className="nums px-3 py-2 text-base font-black text-emerald-700 dark:text-emerald-300">{money(row.cashInDrawer)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!query.isLoading && (data?.byUser.length ?? 0) === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-muted-foreground">{ui('مفيش تحصيل في الفترة دي')}</p>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-2 md:hidden">
        <button
          type="button"
          onClick={() => setFiltersOpen(true)}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-full border border-primary/25 bg-primary/[0.05] px-3 py-2 text-start text-sm"
        >
          <CalendarDays className="size-4 shrink-0 text-primary" />
          <span className="truncate font-medium">{filterSummary}</span>
        </button>
        <Button variant="outline" className="shrink-0 rounded-full" onClick={() => setFiltersOpen(true)}>
          <SlidersHorizontal className="size-4" />
          {ui('فلترة')}
          {activeFilterCount > 0 ? (
            <Badge className="nums ms-1 h-5 min-w-5 justify-center px-1.5">{toArabicDigits(activeFilterCount)}</Badge>
          ) : null}
        </Button>
      </div>
      <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl p-4 pb-6 md:hidden">
          <SheetHeader className="mb-3 text-start">
            <SheetTitle>{ui('فلترة اليومية')}</SheetTitle>
          </SheetHeader>
          <div className="grid grid-cols-2 gap-3">{renderFilterFields(true)}</div>
          <Button className="mt-4 w-full" onClick={() => setFiltersOpen(false)}>{ui('عرض النتايج')}</Button>
        </SheetContent>
      </Sheet>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <SummaryCard
          title={ui('إجمالي تحصيل الاستقبال')}
          value={money(summary?.collectedTotal ?? 0)}
          hint={summary ? `${toArabicDigits(summary.receiptsCount)} ${ui('عملية')} · ${ui('بدون البار')}` : undefined}
          icon={WalletCards}
          iconClassName="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
          loading={query.isLoading}
        />
        <SummaryCard
          title={ui('الاشتراكات والأقساط')}
          value={money(summary?.subscriptionsCollected ?? 0)}
          hint={summary ? `${toArabicDigits(summary.subscriptionReceiptsCount)} ${ui('إيصال')}` : undefined}
          icon={ReceiptText}
          iconClassName="bg-sky-500/10 text-sky-700 dark:text-sky-300"
          loading={query.isLoading}
        />
        <SummaryCard
          title={ui('خدمات الاستقبال')}
          value={money(summary?.servicesCollected ?? 0)}
          hint={ui('خدمات سريعة، لوكر، سبا، InBody')}
          icon={Zap}
          iconClassName="bg-amber-500/10 text-amber-700 dark:text-amber-300"
          loading={query.isLoading}
        />
        <SummaryCard
          title={ui('المصروفات والمرتجعات')}
          value={money((summary?.expensesTotal ?? 0) + (summary?.refundsTotal ?? 0))}
          hint={summary ? `${ui('مرتجعات')}: ${money(summary.refundsTotal)}` : undefined}
          icon={TrendingDown}
          iconClassName="bg-rose-500/10 text-rose-700 dark:text-rose-300"
          loading={query.isLoading}
        />
        <SummaryCard
          title={isRange ? ui('المتبقي على عقود الفترة') : ui('المتبقي على عقود اليوم')}
          value={money(summary?.remainingAmount ?? 0)}
          hint={summary ? `${toArabicDigits(summary.subscriptionsCount)} ${ui('عقد')}` : undefined}
          icon={Banknote}
          iconClassName="bg-violet-500/10 text-violet-700 dark:text-violet-300"
          loading={query.isLoading}
        />
      </div>

      {summary ? (
        <section
          role="status"
          aria-live="polite"
          className={cn(
            'flex flex-col gap-3 rounded-xl border px-4 py-3 sm:flex-row sm:items-center sm:justify-between',
            summary.isReconciled
              ? 'border-emerald-500/25 bg-emerald-500/[0.06]'
              : 'border-destructive/30 bg-destructive/[0.06]',
          )}
        >
          <div className="flex min-w-0 items-start gap-3">
            {summary.isReconciled ? (
              <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-700 dark:text-emerald-300" />
            ) : (
              <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" />
            )}
            <div>
              <p className="font-semibold">
                {summary.isReconciled ? ui('اليومية متطابقة') : ui('فيه مشكلة في مطابقة اليومية')}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {summary.isReconciled
                  ? `${ui('مجموع طرق الدفع')} ${money(summary.paymentsTotal)} = ${ui('إجمالي التحصيل')} ${money(summary.collectedTotal)}`
                  : summary.unreconciledReceiptsCount > 0
                    ? `${toArabicDigits(summary.unreconciledReceiptsCount)} ${ui('إيصال تقسيم الدفع فيه مش مساوي للمبلغ')} · ${ui('راجعها قبل قفل اليومية')}`
                    : `${ui('فرق المطابقة')}: ${money(Math.abs(summary.reconciliationDifference))}`}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 sm:justify-end">
            {Object.entries(summary.collectedByMethod).map(([method, amount]) => (
              <Badge key={method} variant={method === 'cash' ? 'success' : 'secondary'} className="nums px-3 py-1 text-sm font-semibold">
                {methodLabel(method)} · {money(amount)}
              </Badge>
            ))}
          </div>
        </section>
      ) : null}

      {summary ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
          <span>{ui('قيمة العقود المسجلة')}: {money(summary.totalValue)}</span>
          <span>{ui('المدفوع منها')}: {money(summary.paidAmount)}</span>
          <span>{ui('عدد العقود')}: {toArabicDigits(summary.subscriptionsCount)}</span>
          {servicesByName.map(([name, amount]) => (
            <span key={name}>{name}: {money(amount)}</span>
          ))}
        </div>
      ) : null}

      <Section
        title={ui('إيصالات الاشتراكات والأقساط')}
        description={`${ui('كل تحصيل اشتراك أو قسط في الفترة، حتى لو العقد متسجل قبلها')} · ${toArabicDigits(receiptRows.length)} ${ui('إيصال')}`}
        icon={ReceiptText}
      >
        <DataTable
          caption={ui('إيصالات الاشتراكات والأقساط')}
          rows={receiptRows}
          rowKey={(row) => row.key}
          loading={query.isLoading}
          empty={ui('مفيش إيصالات اشتراكات في الفترة دي')}
          columns={[
            { header: ui('رقم الإيصال'), cell: (r) => <span className="nums font-mono font-semibold text-primary">{toArabicDigits(r.number)}</span>, className: 'whitespace-nowrap' },
            { header: ui('النوع'), cell: (r) => <Badge variant={sourceVariant[r.source] ?? 'secondary'}>{ui(r.sourceLabel)}</Badge> },
            { header: ui('رقم الاشتراك'), cell: (r) => <span className="nums">{r.subscriptionNumber ? toArabicDigits(r.subscriptionNumber) : '—'}</span>, className: 'whitespace-nowrap' },
            { header: ui('اسم العميل'), cell: (r) => r.customerName || '—', className: 'font-medium' },
            { header: ui('نوع الاشتراك'), cell: (r) => r.subscriptionType || '—' },
            userColumn<ReceiptRow>(),
            { header: ui('المبلغ'), cell: (r) => money(r.amount), className: 'nums whitespace-nowrap font-semibold' },
            methodColumn<ReceiptRow>(),
            { header: isRange ? ui('التاريخ والوقت') : ui('الوقت'), cell: (r) => whenLabel(r.date, r.createdAt, isRange), className: 'nums whitespace-nowrap' },
          ]}
        />
      </Section>

      <Section
        title={ui('خدمات الاستقبال')}
        description={`${ui('خدمات سريعة، لوكر، سبا و InBody اتحصّلت في الاستقبال')} · ${toArabicDigits(serviceRows.length)} ${ui('عملية')}`}
        icon={Zap}
      >
        <DataTable
          caption={ui('خدمات الاستقبال')}
          rows={serviceRows}
          rowKey={(row) => row.key}
          loading={query.isLoading}
          empty={ui('مفيش خدمات في الفترة دي')}
          columns={[
            { header: ui('الرقم'), cell: (r) => <span className="nums font-mono font-semibold text-primary">{toArabicDigits(r.number)}</span>, className: 'whitespace-nowrap' },
            { header: ui('النوع'), cell: (r) => <Badge variant={sourceVariant[r.source] ?? 'secondary'}>{ui(r.sourceLabel)}</Badge> },
            { header: ui('الخدمة'), cell: (r) => r.serviceName, className: 'font-medium' },
            { header: ui('اسم العميل'), cell: (r) => r.customerName || '—' },
            userColumn<ServiceRow>(),
            { header: ui('المبلغ'), cell: (r) => money(r.amount), className: 'nums whitespace-nowrap font-semibold' },
            methodColumn<ServiceRow>(),
            { header: isRange ? ui('التاريخ والوقت') : ui('الوقت'), cell: (r) => whenLabel(r.date, r.createdAt, isRange), className: 'nums whitespace-nowrap' },
          ]}
        />
      </Section>

      <Section
        title={ui('المصروفات والمرتجعات')}
        description={`${ui('المدفوع من الاستقبال في الفترة — النقدي منها بيتخصم من الدرج')} · ${toArabicDigits(expenseRows.length)}`}
        icon={TrendingDown}
      >
        <DataTable
          caption={ui('المصروفات والمرتجعات')}
          rows={expenseRows}
          rowKey={(row) => row.id}
          loading={query.isLoading}
          empty={ui('مفيش مصروفات في الفترة دي')}
          minWidth={860}
          columns={[
            { header: ui('الرقم'), cell: (r) => <span className="nums font-mono">{toArabicDigits(r.expenseNumber)}</span>, className: 'whitespace-nowrap' },
            { header: ui('النوع'), cell: (r) => <Badge variant={r.isRefund ? 'warning' : 'destructive'}>{r.isRefund ? ui('مرتجع') : ui('مصروف')}</Badge> },
            { header: ui('البند'), cell: (r) => [r.category, r.subCategory].filter(Boolean).join(' / '), className: 'font-medium' },
            { header: ui('الوصف'), cell: (r) => r.description || '—' },
            userColumn<ExpenseRow>(),
            { header: ui('المبلغ'), cell: (r) => <span className="text-destructive">−{money(r.amount)}</span>, className: 'nums whitespace-nowrap font-semibold' },
            { header: ui('طريقة الدفع'), cell: (r) => methodLabel(r.paymentMethod) },
            { header: ui('التاريخ'), cell: (r) => formatDate(r.date, 'd MMM yyyy', locale), className: 'nums whitespace-nowrap' },
          ]}
        />
      </Section>

      <Section
        title={isRange ? ui('العقود المسجلة في الفترة') : ui('العقود المسجلة النهارده')}
        description={`${ui('قيمة كل عقد والمدفوع والمتبقي عليه')} · ${toArabicDigits(contractRows.length)} ${ui('عقد')}`}
        icon={UserRound}
      >
        <DataTable
          caption={ui('العقود')}
          rows={contractRows}
          rowKey={(row) => row.id}
          loading={query.isLoading}
          empty={ui('مفيش عقود متسجلة في الفترة دي')}
          columns={[
            { header: ui('رقم الاشتراك'), cell: (r) => <span className="nums font-mono font-semibold text-primary">{toArabicDigits(r.subscriptionNumber)}</span>, className: 'whitespace-nowrap' },
            { header: ui('اسم العميل'), cell: (r) => r.customerName || '—', className: 'font-medium' },
            { header: ui('نوع الاشتراك'), cell: (r) => r.subscriptionType || '—' },
            userColumn<ContractRow>(),
            { header: ui('القيمة'), cell: (r) => money(r.subscriptionValue), className: 'nums whitespace-nowrap' },
            { header: ui('المدفوع'), cell: (r) => money(r.paidAmount), className: 'nums whitespace-nowrap' },
            { header: ui('المتبقي'), cell: (r) => <span className={cn(r.remainingAmount > 0 && 'font-semibold text-amber-600')}>{money(r.remainingAmount)}</span>, className: 'nums whitespace-nowrap' },
            { header: ui('الحالة'), cell: (r) => { const meta = statusMeta[r.status] ?? statusMeta.active; return <Badge variant={meta.variant}>{ui(meta.label)}</Badge>; } },
            { header: isRange ? ui('التاريخ والوقت') : ui('وقت التسجيل'), cell: (r) => whenLabel(r.registrationDate ?? r.createdAt.slice(0, 10), r.createdAt, isRange), className: 'nums whitespace-nowrap' },
          ]}
        />
      </Section>

      {/* البار / الكافيه — separate from the reception money above. */}
      <Card className="border-amber-500/30">
        <CardContent className="space-y-4 p-0">
          <div className="flex items-start gap-3 border-b bg-amber-500/[0.05] p-4">
            <Coffee className="mt-0.5 size-5 shrink-0 text-amber-700 dark:text-amber-300" />
            <div>
              <h2 className="font-bold">{ui('البار / الكافيه')}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {ui('مبيعات نقطة البيع في الفترة — النقدي منها داخل في الكاش اللي في الدرج فوق')}
              </p>
            </div>
          </div>
          <div className="grid gap-3 px-4 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard title={ui('عدد الفواتير')} value={toArabicDigits(data?.bar.count ?? 0)} icon={ReceiptText} iconClassName="bg-amber-500/10 text-amber-700 dark:text-amber-300" loading={query.isLoading} />
            <SummaryCard title={ui('إجمالي المبيعات')} value={money(data?.bar.salesTotal ?? 0)} icon={Coffee} iconClassName="bg-amber-500/10 text-amber-700 dark:text-amber-300" loading={query.isLoading} />
            <SummaryCard title={ui('المحصّل')} value={money(data?.bar.collected ?? 0)} hint={data ? `${ui('نقدي')}: ${money(data.bar.cash)}` : undefined} icon={WalletCards} iconClassName="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" loading={query.isLoading} />
            <SummaryCard title={ui('غير محصّل (آجل / حساب موظف)')} value={money(data?.bar.unpaid ?? 0)} icon={Banknote} iconClassName="bg-violet-500/10 text-violet-700 dark:text-violet-300" loading={query.isLoading} />
          </div>
          {data && Object.keys(data.bar.byMethod).length ? (
            <div className="flex flex-wrap gap-2 px-4">
              {Object.entries(data.bar.byMethod).map(([method, amount]) => (
                <Badge key={method} variant={method === 'cash' ? 'success' : 'secondary'} className="nums px-3 py-1 text-sm font-semibold">
                  {methodLabel(method)} · {money(amount)}
                </Badge>
              ))}
            </div>
          ) : null}
          <div className="border-t">
            <p className="px-4 pt-3 text-sm font-semibold">{ui('حسب الكاشير')}</p>
            <DataTable
              caption={ui('البار حسب الكاشير')}
              rows={data?.bar.byCashier ?? []}
              rowKey={(row) => row.userId ?? 'none'}
              loading={query.isLoading}
              empty={ui('مفيش مبيعات بار في الفترة دي')}
              minWidth={720}
              columns={[
                { header: ui('الكاشير'), cell: (r) => r.name, className: 'font-medium' },
                { header: ui('عدد الفواتير'), cell: (r) => toArabicDigits(r.count), className: 'nums' },
                { header: ui('المبيعات'), cell: (r) => money(r.salesTotal), className: 'nums' },
                { header: ui('نقدي'), cell: (r) => money(r.cash), className: 'nums' },
                { header: ui('فيزا / بطاقة'), cell: (r) => money(r.card), className: 'nums' },
                { header: ui('تحويل / محافظ'), cell: (r) => money(r.transfer), className: 'nums' },
                { header: ui('المحصّل'), cell: (r) => money(r.collected), className: 'nums font-semibold' },
              ]}
            />
          </div>
          <div className="border-t">
            <p className="px-4 pt-3 text-sm font-semibold">
              {ui('الفواتير')}
              {data?.bar.rowsTruncated ? <span className="ms-2 font-normal text-muted-foreground">({ui('معروض آخر ٥٠٠ فاتورة — الإجماليات شاملة الكل')})</span> : null}
            </p>
            <DataTable
              caption={ui('فواتير البار')}
              rows={barRows}
              rowKey={(row) => row.id}
              loading={query.isLoading}
              empty={ui('مفيش فواتير')}
              columns={[
                { header: ui('رقم الفاتورة'), cell: (r) => <span className="nums font-mono">{toArabicDigits(r.saleNumber)}</span>, className: 'whitespace-nowrap' },
                { header: ui('العميل'), cell: (r) => r.customerName || '—' },
                { header: ui('الكاشير'), cell: (r) => r.cashierName },
                { header: ui('الإجمالي'), cell: (r) => money(r.total), className: 'nums whitespace-nowrap' },
                { header: ui('المحصّل'), cell: (r) => <span className={cn(r.unpaid > 0 && 'text-amber-600')}>{money(r.collected)}</span>, className: 'nums whitespace-nowrap font-semibold' },
                { header: ui('طريقة الدفع'), cell: (r) => methodsLabel(r.payments, r.paymentMethod) },
                { header: isRange ? ui('التاريخ والوقت') : ui('الوقت'), cell: (r) => (isRange ? `${formatDate(r.date, 'd MMM', locale)} ${toArabicDigits(r.time.slice(0, 5))}` : toArabicDigits(r.time.slice(0, 5))), className: 'nums whitespace-nowrap' },
              ]}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
