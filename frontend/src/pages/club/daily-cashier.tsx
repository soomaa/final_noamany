import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  Clock3,
  CreditCard,
  LockKeyhole,
  ReceiptText,
  RefreshCw,
  Search,
  UserRound,
  WalletCards,
  Wallet,
  Zap,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { ErrorState } from '@/components/common/states';
import { PageHeader } from '@/components/common/page-header';
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
import { Skeleton } from '@/components/ui/skeleton';
import { api, apiError } from '@/lib/api';
import { formatDate, formatMoney, formatTimeFromDate, localToday } from '@/lib/formatters';
import { cn, toArabicDigits, formatDigits } from '@/lib/utils';
import { useLocale, type Locale } from '@/store/locale';
import { clubPaymentMethodLabel } from '@/components/club/club-payment-method-select';
import { useClubT } from '@/hooks/use-club-t';
import { uiStatic } from '@/lib/ui-static';

type SubscriptionStatus = 'active' | 'expired' | 'upcoming' | 'frozen';

interface DailyCashierPaymentLine {
  method: string;
  amount: number;
}

interface DailyCashierRow {
  id: number;
  subscriptionNumber: string;
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

interface DailyCashierQuickRow {
  id: number;
  receiptNumber: string;
  customerName: string | null;
  serviceName: string;
  amount: number;
  paymentMethod: string;
  payments: DailyCashierPaymentLine[];
  paymentsTotal: number;
  reconciliationDifference: number;
  isReconciled: boolean;
  createdAt: string;
  createdByUserId: number | null;
  createdByName: string | null;
}

interface DailyCashierReceiptRow {
  id: number;
  receiptNumber: string;
  subscriptionId: number | null;
  subscriptionNumber: string | null;
  customerName: string | null;
  subscriptionType: string;
  amount: number;
  paymentMethod: string;
  payments: DailyCashierPaymentLine[];
  paymentsTotal: number;
  reconciliationDifference: number;
  isReconciled: boolean;
  createdAt: string;
  createdByUserId: number | null;
  createdByName: string | null;
}

interface DailyCashierResponse {
  expenseRows: Array<{
    id: number; expenseNumber: string; category: string; businessUnit: string;
    amount: number; paidAmount: number; remainingAmount: number; paymentNeedsReview: boolean;
    paymentMethod: string; payments: DailyCashierPaymentLine[];
    paymentStatus: string; approvalStatus: string; expenseDate: string; createdAt: string; createdByName: string;
  }>;
  date: string;
  isToday: boolean;
  isSystemAdmin: boolean;
  lockedUser: boolean;
  selectedUserId: number | null;
  selectedUserName: string;
  users: Array<{ id: number; name: string }>;
  summary: {
    expensesPaidAmount: number;
    expensesNeedingReview: number;
    subscriptionsCount: number;
    totalValue: number;
    paidAmount: number;
    collectedToday: number;
    collectedNonQuickAmount: number;
    remainingAmount: number;
    receiptsCount: number;
    subscriptionReceiptsCount: number;
    quickServicesCount: number;
    quickServicesAmount: number;
    collectedByMethod: Record<string, number>;
    paymentsTotal: number;
    reconciliationDifference: number;
    unreconciledReceiptsCount: number;
    isReconciled: boolean;
  };
  rows: DailyCashierRow[];
  receiptRows: DailyCashierReceiptRow[];
  quickServiceRows: DailyCashierQuickRow[];
}

const statusMeta: Record<
  SubscriptionStatus,
  { label: string; variant: 'success' | 'warning' | 'destructive' | 'secondary' }
> = {
  active: { label: uiStatic('ساري'), variant: 'success' },
  upcoming: { label: uiStatic('قادم'), variant: 'warning' },
  expired: { label: uiStatic('منتهي'), variant: 'destructive' },
  frozen: { label: uiStatic('مجمّد'), variant: 'secondary' },
};

function SummaryCard({
  title,
  value,
  icon: Icon,
  iconClassName,
  loading,
}: {
  title: string;
  value: string;
  icon: typeof Banknote;
  iconClassName: string;
  loading: boolean;
}) {
  return (
    <Card>
      <CardContent className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-2 p-5">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{title}</p>
        </div>
        <span className={cn('flex size-11 items-center justify-center rounded-xl', iconClassName)}>
          <Icon className="size-5" aria-hidden="true" />
        </span>
        {loading ? <Skeleton className="col-span-2 h-8 w-28" /> : <p className="nums col-span-2 min-w-0 break-words text-2xl font-black">{value}</p>}
      </CardContent>
    </Card>
  );
}

function includesSearch(values: Array<string | null | undefined>, needle: string, locale: string) {
  return values.some((value) => value?.toLocaleLowerCase(locale).includes(needle));
}

function paymentBreakdownLabel(
  payments: DailyCashierPaymentLine[],
  fallbackMethod: string,
  receiptAmount: number,
  ct: ReturnType<typeof useClubT>,
  locale: Locale,
) {
  if (
    payments.length <= 1 &&
    (payments.length === 0 || Math.abs(payments[0].amount - receiptAmount) < 0.01)
  ) {
    return clubPaymentMethodLabel(ct, payments[0]?.method ?? fallbackMethod);
  }
  return payments
    .map((payment) => `${clubPaymentMethodLabel(ct, payment.method)} ${formatMoney(payment.amount, undefined, locale)}`)
    .join(' + ');
}

export function ClubDailyCashierPage() {
  const { locale, ui } = useLocale();
  const ct = useClubT();
  const [userId, setUserId] = useState('all');
  const [search, setSearch] = useState('');
  const [date, setDate] = useState(() => localToday());

  const query = useQuery({
    queryKey: ['club-subscriptions', 'daily-cashier', userId, date],
    queryFn: async () => {
      const response = await api.get<DailyCashierResponse>('/club-subscriptions/daily-cashier', {
        params: {
          ...(userId === 'all' ? {} : { userId }),
          ...(date ? { date } : {}),
        },
      });
      return response.data;
    },
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });

  const searchLocale = locale === 'ar' ? 'ar' : 'en';
  const needle = search.trim().toLocaleLowerCase(searchLocale);

  const contractRows = useMemo(() => {
    if (!needle) return query.data?.rows ?? [];
    return (query.data?.rows ?? []).filter((row) =>
      includesSearch([
        row.subscriptionNumber,
        row.customerName,
        row.subscriptionType,
        row.createdByName,
      ], needle, searchLocale),
    );
  }, [needle, query.data?.rows, searchLocale]);

  const receiptRows = useMemo(() => {
    if (!needle) return query.data?.receiptRows ?? [];
    return (query.data?.receiptRows ?? []).filter((row) =>
      includesSearch([
        row.receiptNumber,
        row.subscriptionNumber,
        row.customerName,
        row.subscriptionType,
        row.createdByName,
      ], needle, searchLocale),
    );
  }, [needle, query.data?.receiptRows, searchLocale]);

  const quickRows = useMemo(() => {
    if (!needle) return query.data?.quickServiceRows ?? [];
    return (query.data?.quickServiceRows ?? []).filter((row) =>
      includesSearch([
        row.receiptNumber,
        row.customerName,
        row.serviceName,
        row.createdByName,
      ], needle, searchLocale),
    );
  }, [needle, query.data?.quickServiceRows, searchLocale]);

  const quickServicesByName = useMemo(() => {
    const totals = new Map<string, number>();
    for (const row of query.data?.quickServiceRows ?? []) {
      const name = row.serviceName?.trim() || ui('خدمة استقبال');
      totals.set(name, (totals.get(name) ?? 0) + row.amount);
    }
    return [...totals.entries()].sort(([a], [b]) => a.localeCompare(b, locale === 'ar' ? 'ar' : 'en'));
  }, [locale, query.data?.quickServiceRows, ui]);

  const expenseRows = useMemo(() => (query.data?.expenseRows ?? []).filter((row) =>
    !needle || includesSearch([row.expenseNumber, row.category, row.createdByName, row.paymentStatus], needle, searchLocale),
  ), [needle, query.data?.expenseRows, searchLocale]);

  if (query.isError) {
    return (
      <ErrorState
        message={apiError(query.error, ui('تعذر تحميل يومية الاستقبال'))}
        onRetry={() => void query.refetch()}
      />
    );
  }

  const data = query.data;
  const summary = data?.summary;

  return (
    <div className="space-y-5">
      <PageHeader
        title={ui('يومية الاستقبال')}
        description={ui('كل إيصال تحصيل يظهر بتفاصيله وطريقة دفعه، بما في ذلك الأقساط والخدمات السريعة.')}
        eyebrow={data?.date ? formatDate(data.date, ui('EEEE، d MMMM yyyy'), locale) : undefined}
        actions={(
          <Button variant="outline" onClick={() => void query.refetch()} disabled={query.isFetching}>
            <RefreshCw className={cn('size-4', query.isFetching && 'animate-spin')} />
            {ui('تحديث')}
          </Button>
        )}
      />

      <Card className="border-primary/20 bg-primary/[0.025]">
        <CardContent className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_auto_minmax(16rem,24rem)] lg:items-end">
          <div className="min-w-0 flex-1">
            <Label
              id="daily-cashier-user-label"
              htmlFor={data?.lockedUser ? undefined : 'daily-cashier-user'}
              className="mb-2 block"
            >
              {ui('المستخدم')}
            </Label>
            {data?.lockedUser ? (
              <div
                aria-labelledby="daily-cashier-user-label"
                className="flex h-11 items-center gap-3 rounded-xl border bg-muted/45 px-4"
              >
                <LockKeyhole className="size-4 shrink-0 text-primary" />
                <span className="truncate font-semibold">{data.selectedUserName}</span>
                <Badge variant="secondary" className="ms-auto shrink-0">{ui('محدد تلقائيًا')}</Badge>
              </div>
            ) : (
              <Select value={userId} onValueChange={setUserId}>
                <SelectTrigger id="daily-cashier-user" className="h-11">
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
          <div className="grid gap-2">
            <Label htmlFor="daily-cashier-date">{ui('تاريخ اليومية')}</Label>
            <div className="flex items-center gap-2">
              <Input
                id="daily-cashier-date"
                type="date"
                className="nums h-11 w-[11.5rem]"
                dir="ltr"
                value={date}
                max={localToday()}
                onChange={(event) => setDate(event.target.value || localToday())}
              />
              {date !== localToday() ? (
                <Button variant="outline" className="h-11" onClick={() => setDate(localToday())}>
                  {ui('اليوم')}
                </Button>
              ) : null}
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="daily-cashier-search">{ui('بحث في اليومية')}</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="daily-cashier-search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={ui('اسم، إيصال، اشتراك، خدمة، أو مصروف')}
                className="h-11 ps-10"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <SummaryCard
          title={ui('إجمالي تحصيل اليوم (كل الإيصالات)')}
          value={formatMoney(summary?.collectedToday ?? 0, undefined, locale)}
          icon={WalletCards}
          iconClassName="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
          loading={query.isLoading}
        />
        <SummaryCard
          title={ui('مصروفات المستخدم المدفوعة')}
          value={formatMoney(summary?.expensesPaidAmount ?? 0, undefined, locale)}
          icon={Wallet}
          iconClassName="bg-red-500/10 text-red-700 dark:text-red-300"
          loading={query.isLoading}
        />
        <SummaryCard
          title={ui('تحصيل الاشتراكات والأقساط')}
          value={formatMoney(summary?.collectedNonQuickAmount ?? 0, undefined, locale)}
          icon={ReceiptText}
          iconClassName="bg-sky-500/10 text-sky-700 dark:text-sky-300"
          loading={query.isLoading}
        />
        <SummaryCard
          title={ui('خدمات الاستقبال')}
          value={formatMoney(summary?.quickServicesAmount ?? 0, undefined, locale)}
          icon={Zap}
          iconClassName="bg-amber-500/10 text-amber-700 dark:text-amber-300"
          loading={query.isLoading}
        />
        <SummaryCard
          title={ui('المتبقي على عقود اليوم')}
          value={formatMoney(summary?.remainingAmount ?? 0, undefined, locale)}
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
                {summary.isReconciled
                  ? ui('اليومية متطابقة')
                  : ui('توجد مشكلة في مطابقة اليومية')}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {summary.isReconciled
                  ? `${toArabicDigits(summary.receiptsCount)} ${ui('إيصال')} · ${ui('مجموع طرق الدفع يساوي إجمالي التحصيل')}`
                  : summary.unreconciledReceiptsCount > 0
                    ? `${toArabicDigits(summary.unreconciledReceiptsCount)} ${ui('إيصال بتقسيم دفع غير مطابق')} · ${ui('راجع تقسيمات الدفع قبل إغلاق اليومية')}`
                    : `${ui('فرق المطابقة')}: ${formatMoney(Math.abs(summary.reconciliationDifference), undefined, locale)} · ${ui('راجع تقسيمات الدفع قبل إغلاق اليومية')}`}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 sm:justify-end">
            {Object.entries(summary.collectedByMethod ?? {}).map(([method, amount]) => (
              <Badge key={method} variant="secondary" className="nums font-medium">
                {clubPaymentMethodLabel(ct, method)} · {formatMoney(amount, undefined, locale)}
              </Badge>
            ))}
          </div>
        </section>
      ) : null}

      {summary ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
          <Clock3 className="size-4 text-primary" />
          <span>{ui('قيمة العقود المسجلة في التاريخ')}: {formatMoney(summary.totalValue, undefined, locale)}</span>
          <span>{ui('عدد العقود')}: {toArabicDigits(summary.subscriptionsCount)}</span>
          {quickServicesByName.map(([serviceName, amount]) => (
            <span key={serviceName}>{serviceName}: {formatMoney(amount, undefined, locale)}</span>
          ))}
        </div>
      ) : null}

      <Card>
        <CardContent className="p-0">
          <div className="border-b p-4">
            <h2 className="font-bold">{ui('مصروفات المستخدم')}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{ui('مصروفات مسجلة بتاريخ اليومية للمستخدم المحدد؛ الكارد يحسب المدفوع فقط.')} · {toArabicDigits(expenseRows.length)} {ui('مصروف')}</p>
            {(summary?.expensesNeedingReview ?? 0) > 0 && <p role="status" className="mt-2 text-sm text-amber-700 dark:text-amber-300">{ui('في مصروفات جزئية قديمة محتاجة مراجعة المدفوع؛ الإجمالي المدفوع غير مكتمل لحين المراجعة.')}</p>}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] text-sm">
              <caption className="sr-only">{ui('مصروفات المستخدم بتاريخ اليومية')}</caption>
              <thead className="border-b bg-muted/40 text-muted-foreground">
                <tr>{['رقم المصروف', 'نوع المصروف', 'الإدارة', 'المستخدم', 'الإجمالي', 'المدفوع', 'المتبقي', 'طريقة الدفع', 'حالة الدفع', 'الوقت'].map((label) => <th key={label} scope="col" className="px-4 py-3 text-start font-semibold">{ui(label)}</th>)}</tr>
              </thead>
              <tbody className="divide-y">
                {query.isLoading ? [0, 1, 2].map((index) => <tr key={index}><td colSpan={10} className="px-4 py-4"><Skeleton className="h-7 w-full" /></td></tr>) : expenseRows.map((row) => (
                  <tr key={row.id} className={cn('transition-colors', row.paymentNeedsReview || (row.paidAmount > 0 && row.remainingAmount > 0) ? 'bg-amber-50/70 hover:bg-amber-100/70 dark:bg-amber-950/20 dark:hover:bg-amber-950/30' : row.paidAmount <= 0 ? 'bg-red-50/70 hover:bg-red-100/70 dark:bg-red-950/20 dark:hover:bg-red-950/30' : 'hover:bg-muted/25')}>
                    <td className="nums whitespace-nowrap px-4 py-3 font-semibold">{row.expenseNumber}</td>
                    <td className="max-w-64 break-words px-4 py-3">{row.category}</td>
                    <td className="px-4 py-3">{ui(row.businessUnit === 'cafe' ? 'الكافيه' : 'الجيم')}</td>
                    <td className="max-w-64 break-words px-4 py-3">{row.createdByName}</td>
                    <td className="nums whitespace-nowrap px-4 py-3">{formatMoney(row.amount, undefined, locale)}</td>
                    <td className="nums whitespace-nowrap px-4 py-3 font-bold">{row.paymentNeedsReview ? ui('راجع المدفوع') : formatMoney(row.paidAmount, undefined, locale)}</td>
                    <td className="nums whitespace-nowrap px-4 py-3">{row.paymentNeedsReview ? '—' : formatMoney(row.remainingAmount, undefined, locale)}</td>
                    <td className="px-4 py-3">{row.payments.length ? paymentBreakdownLabel(row.payments, row.paymentMethod, row.paidAmount, ct, locale) : ui(row.paymentMethod)}</td>
                    <td className="px-4 py-3"><Badge variant={row.paymentNeedsReview || (row.paidAmount > 0 && row.remainingAmount > 0) ? 'warning' : row.paidAmount <= 0 ? 'destructive' : 'success'}>{ui(row.paymentStatus)}</Badge></td>
                    <td className="nums whitespace-nowrap px-4 py-3">{row.expenseDate.includes('T') ? row.expenseDate.slice(11) : formatTimeFromDate(row.createdAt, locale)}</td>
                  </tr>
                ))}
                {!query.isLoading && !expenseRows.length && <tr><td colSpan={10} className="px-4 py-10 text-center text-muted-foreground">{ui(needle ? 'لا توجد مصروفات مطابقة للبحث' : 'لا توجد مصروفات في هذا التاريخ لهذا المستخدم')}</td></tr>}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="border-b p-4">
            <h2 className="font-bold">{ui('إيصالات الاشتراكات والأقساط')}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {ui('كل تحصيل اشتراك أو قسط تم في التاريخ، حتى لو كان العقد مسجلًا قبل ذلك')} ·{' '}
              {toArabicDigits(receiptRows.length)} {ui('إيصال')}
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1080px] text-sm">
              <caption className="sr-only">{ui('إيصالات الاشتراكات والأقساط')}</caption>
              <thead className="border-b bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-start font-semibold">{ui('رقم الإيصال')}</th>
                  <th className="px-4 py-3 text-start font-semibold">{ui('رقم الاشتراك')}</th>
                  <th className="px-4 py-3 text-start font-semibold">{ui('اسم العميل')}</th>
                  <th className="px-4 py-3 text-start font-semibold">{ui('نوع الاشتراك')}</th>
                  {data?.isSystemAdmin ? (
                    <th className="px-4 py-3 text-start font-semibold">{ui('المستخدم')}</th>
                  ) : null}
                  <th className="px-4 py-3 text-start font-semibold">{ui('المبلغ المحصل')}</th>
                  <th className="px-4 py-3 text-start font-semibold">{ui('طريقة الدفع')}</th>
                  <th className="px-4 py-3 text-start font-semibold">{ui('وقت التحصيل')}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {query.isLoading
                  ? Array.from({ length: 5 }).map((_, index) => (
                      <tr key={index}>
                        <td colSpan={data?.isSystemAdmin ? 8 : 7} className="px-4 py-4">
                          <Skeleton className="h-7 w-full" />
                        </td>
                      </tr>
                    ))
                  : receiptRows.map((row) => (
                      <tr key={row.id} className="transition-colors hover:bg-muted/25">
                        <td className="nums whitespace-nowrap px-4 py-3 font-mono font-semibold text-primary">
                          {formatDigits(row.receiptNumber)}
                        </td>
                        <td className="nums whitespace-nowrap px-4 py-3 font-mono">
                          {row.subscriptionNumber ? formatDigits(row.subscriptionNumber) : '—'}
                        </td>
                        <td className="px-4 py-3 font-medium">{row.customerName || '—'}</td>
                        <td className="px-4 py-3">{row.subscriptionType || '—'}</td>
                        {data?.isSystemAdmin ? (
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center gap-2 whitespace-nowrap">
                              <UserRound className="size-4 text-muted-foreground" />
                              {row.createdByName || '—'}
                            </span>
                          </td>
                        ) : null}
                        <td className="nums whitespace-nowrap px-4 py-3 font-bold">
                          {formatMoney(row.amount, undefined, locale)}
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-2 whitespace-nowrap">
                            {paymentBreakdownLabel(row.payments, row.paymentMethod, row.amount, ct, locale)}
                            {!row.isReconciled ? (
                              <Badge variant="destructive">{ui('غير مطابق')}</Badge>
                            ) : null}
                          </span>
                        </td>
                        <td className="nums whitespace-nowrap px-4 py-3">
                          {formatTimeFromDate(row.createdAt, locale)}
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>

          {!query.isLoading && receiptRows.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-4 py-14 text-center text-muted-foreground">
              <ReceiptText className="size-9 opacity-40" />
              <p className="font-medium">{ui('لا توجد إيصالات اشتراكات أو أقساط في هذا التاريخ')}</p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="border-b p-4">
            <h2 className="font-bold">{ui('خدمات الاستقبال')}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {ui('كارنيه، رسوم إدارية، حصة فردية، وغيرها')} · {toArabicDigits(quickRows.length)} {ui('عملية')}
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] text-sm">
              <caption className="sr-only">{ui('خدمات الاستقبال')}</caption>
              <thead className="border-b bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-start font-semibold">{ui('رقم الإيصال')}</th>
                  <th className="px-4 py-3 text-start font-semibold">{ui('اسم العميل')}</th>
                  <th className="px-4 py-3 text-start font-semibold">{ui('الخدمة')}</th>
                  {data?.isSystemAdmin ? (
                    <th className="px-4 py-3 text-start font-semibold">{ui('المستخدم')}</th>
                  ) : null}
                  <th className="px-4 py-3 text-start font-semibold">{ui('المبلغ')}</th>
                  <th className="px-4 py-3 text-start font-semibold">{ui('طريقة الدفع')}</th>
                  <th className="px-4 py-3 text-start font-semibold">{ui('الوقت')}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {query.isLoading
                  ? Array.from({ length: 3 }).map((_, index) => (
                      <tr key={index}>
                        <td colSpan={data?.isSystemAdmin ? 7 : 6} className="px-4 py-4">
                          <Skeleton className="h-7 w-full" />
                        </td>
                      </tr>
                    ))
                  : quickRows.map((row) => (
                      <tr key={row.id} className="transition-colors hover:bg-muted/25">
                        <td className="nums whitespace-nowrap px-4 py-3 font-mono font-semibold text-primary">
                          {formatDigits(row.receiptNumber)}
                        </td>
                        <td className="px-4 py-3 font-medium">{row.customerName || '—'}</td>
                        <td className="px-4 py-3">{row.serviceName}</td>
                        {data?.isSystemAdmin ? (
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center gap-2 whitespace-nowrap">
                              <UserRound className="size-4 text-muted-foreground" />
                              {row.createdByName || '—'}
                            </span>
                          </td>
                        ) : null}
                        <td className="nums whitespace-nowrap px-4 py-3 font-semibold">
                          {formatMoney(row.amount, undefined, locale)}
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-2 whitespace-nowrap">
                            {paymentBreakdownLabel(row.payments, row.paymentMethod, row.amount, ct, locale)}
                            {!row.isReconciled ? (
                              <Badge variant="destructive">{ui('غير مطابق')}</Badge>
                            ) : null}
                          </span>
                        </td>
                        <td className="nums whitespace-nowrap px-4 py-3">
                          {formatTimeFromDate(row.createdAt, locale)}
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
          {!query.isLoading && quickRows.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-4 py-14 text-center text-muted-foreground">
              <Zap className="size-9 opacity-40" />
              <p className="font-medium">{ui('لا توجد خدمات استقبال في هذا التاريخ')}</p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="border-b p-4">
            <h2 className="font-bold">{ui('العقود المسجلة في التاريخ')}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {ui('قيمة العقد والمدفوع عليه والمتبقي بيانات تعاقدية، وليست بديلًا عن تحصيل الإيصالات')} ·{' '}
              {toArabicDigits(contractRows.length)} {ui('عقد')}
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1080px] text-sm">
              <caption className="sr-only">{ui('العقود المسجلة في التاريخ')}</caption>
              <thead className="border-b bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-start font-semibold">{ui('رقم الاشتراك')}</th>
                  <th className="px-4 py-3 text-start font-semibold">{ui('اسم العميل')}</th>
                  <th className="px-4 py-3 text-start font-semibold">{ui('نوع الاشتراك')}</th>
                  {data?.isSystemAdmin ? (
                    <th className="px-4 py-3 text-start font-semibold">{ui('المستخدم')}</th>
                  ) : null}
                  <th className="px-4 py-3 text-start font-semibold">{ui('قيمة العقد')}</th>
                  <th className="px-4 py-3 text-start font-semibold">{ui('المدفوع على العقد')}</th>
                  <th className="px-4 py-3 text-start font-semibold">{ui('المتبقي')}</th>
                  <th className="px-4 py-3 text-start font-semibold">{ui('الحالة')}</th>
                  <th className="px-4 py-3 text-start font-semibold">{ui('وقت التسجيل')}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {query.isLoading
                  ? Array.from({ length: 4 }).map((_, index) => (
                      <tr key={index}>
                        <td colSpan={data?.isSystemAdmin ? 9 : 8} className="px-4 py-4">
                          <Skeleton className="h-7 w-full" />
                        </td>
                      </tr>
                    ))
                  : contractRows.map((row) => {
                      const meta = statusMeta[row.status] ?? statusMeta.active;
                      return (
                        <tr key={row.id} className="transition-colors hover:bg-muted/25">
                          <td className="nums whitespace-nowrap px-4 py-3 font-mono font-semibold text-primary">
                            {formatDigits(row.subscriptionNumber)}
                          </td>
                          <td className="px-4 py-3 font-medium">{row.customerName || '—'}</td>
                          <td className="px-4 py-3">{row.subscriptionType || '—'}</td>
                          {data?.isSystemAdmin ? (
                            <td className="px-4 py-3">
                              <span className="inline-flex items-center gap-2 whitespace-nowrap">
                                <UserRound className="size-4 text-muted-foreground" />
                                {row.createdByName || '—'}
                              </span>
                            </td>
                          ) : null}
                          <td className="nums whitespace-nowrap px-4 py-3">
                            {formatMoney(row.subscriptionValue, undefined, locale)}
                          </td>
                          <td className="nums whitespace-nowrap px-4 py-3">
                            {formatMoney(row.paidAmount, undefined, locale)}
                          </td>
                          <td className={cn(
                            'nums whitespace-nowrap px-4 py-3 font-semibold',
                            row.remainingAmount > 0 && 'text-amber-700 dark:text-amber-300',
                          )}>
                            {formatMoney(row.remainingAmount, undefined, locale)}
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant={meta.variant}>{ui(meta.label)}</Badge>
                          </td>
                          <td className="nums whitespace-nowrap px-4 py-3">
                            {formatTimeFromDate(row.createdAt, locale)}
                          </td>
                        </tr>
                      );
                    })}
              </tbody>
            </table>
          </div>

          {!query.isLoading && contractRows.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-4 py-14 text-center text-muted-foreground">
              <CreditCard className="size-9 opacity-40" />
              <p className="font-medium">{ui('لا توجد عقود مسجلة في هذا التاريخ لهذا المستخدم')}</p>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
