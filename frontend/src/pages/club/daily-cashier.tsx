import { useQuery } from '@tanstack/react-query';
import {
  Banknote,
  CircleDollarSign,
  Clock3,
  CreditCard,
  LockKeyhole,
  RefreshCw,
  UserRound,
  WalletCards,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { ErrorState } from '@/components/common/states';
import { PageHeader } from '@/components/common/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { api, apiError } from '@/lib/api';
import { formatDate, formatMoney, formatTimeFromDate } from '@/lib/formatters';
import { cn, toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';

type SubscriptionStatus = 'active' | 'expired' | 'upcoming' | 'frozen';

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

interface DailyCashierResponse {
  date: string;
  isSystemAdmin: boolean;
  lockedUser: boolean;
  selectedUserId: number | null;
  selectedUserName: string;
  users: Array<{ id: number; name: string }>;
  summary: {
    subscriptionsCount: number;
    totalValue: number;
    paidAmount: number;
    collectedToday: number;
    remainingAmount: number;
  };
  rows: DailyCashierRow[];
}

const statusMeta: Record<
  SubscriptionStatus,
  { label: string; variant: 'success' | 'warning' | 'destructive' | 'secondary' }
> = {
  active: { label: 'ساري', variant: 'success' },
  upcoming: { label: 'قادم', variant: 'warning' },
  expired: { label: 'منتهي', variant: 'destructive' },
  frozen: { label: 'مجمّد', variant: 'secondary' },
};

function SummaryCard({
  title,
  value,
  icon: Icon,
  tone,
  loading,
}: {
  title: string;
  value: string;
  icon: typeof Banknote;
  tone: string;
  loading: boolean;
}) {
  return (
    <Card className="relative overflow-hidden">
      <div className={cn('absolute inset-y-0 start-0 w-1', tone)} />
      <CardContent className="flex items-center justify-between gap-3 p-5">
        <div>
          <p className="text-sm text-muted-foreground">{title}</p>
          {loading ? (
            <Skeleton className="mt-3 h-8 w-28" />
          ) : (
            <p className="nums mt-2 text-2xl font-black">{value}</p>
          )}
        </div>
        <span className={cn('flex size-11 items-center justify-center rounded-2xl bg-opacity-10', tone.replace('bg-', 'text-'))}>
          <Icon className="size-5" />
        </span>
      </CardContent>
    </Card>
  );
}

export function ClubDailyCashierPage() {
  const { locale, ui } = useLocale();
  const [userId, setUserId] = useState('all');
  const [search, setSearch] = useState('');

  const query = useQuery({
    queryKey: ['club-subscriptions', 'daily-cashier', userId],
    queryFn: async () => {
      const response = await api.get<DailyCashierResponse>('/club-subscriptions/daily-cashier', {
        params: userId === 'all' ? undefined : { userId },
      });
      return response.data;
    },
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });

  const rows = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase(locale === 'ar' ? 'ar' : 'en');
    if (!needle) return query.data?.rows ?? [];
    return (query.data?.rows ?? []).filter((row) =>
      [
        row.subscriptionNumber,
        row.customerName,
        row.subscriptionType,
        row.createdByName,
      ].some((value) => value?.toLocaleLowerCase(locale === 'ar' ? 'ar' : 'en').includes(needle)),
    );
  }, [locale, query.data?.rows, search]);

  if (query.isError) {
    return (
      <ErrorState
        message={apiError(query.error, ui('تعذر تحميل خزينة اشتراكات اليوم'))}
        onRetry={() => void query.refetch()}
      />
    );
  }

  const data = query.data;
  const summary = data?.summary;

  return (
    <div className="space-y-5">
      <PageHeader
        title={ui('خزينة اشتراكات اليوم')}
        description={ui('اشتراكات ومدفوعات اليوم الحالي فقط، حسب المستخدم الذي سجّل العملية.')}
        eyebrow={data?.date ? formatDate(data.date, 'EEEE، d MMMM yyyy', locale) : undefined}
        actions={(
          <Button variant="outline" onClick={() => void query.refetch()} disabled={query.isFetching}>
            <RefreshCw className={cn('size-4', query.isFetching && 'animate-spin')} />
            {ui('تحديث')}
          </Button>
        )}
      />

      <Card className="border-primary/20 bg-primary/[0.025]">
        <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0 flex-1">
            <p className="mb-2 text-sm font-semibold">{ui('المستخدم')}</p>
            {data?.lockedUser ? (
              <div className="flex h-11 max-w-md items-center gap-3 rounded-xl border bg-muted/45 px-4">
                <LockKeyhole className="size-4 shrink-0 text-primary" />
                <span className="truncate font-semibold">{data.selectedUserName}</span>
                <Badge variant="secondary" className="ms-auto shrink-0">{ui('محدد تلقائيًا')}</Badge>
              </div>
            ) : (
              <Select value={userId} onValueChange={setUserId}>
                <SelectTrigger className="h-11 max-w-md">
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
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock3 className="size-4 text-primary" />
            {ui('البيانات تتجدد يوميًا ولا تعرض أيامًا سابقة')}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          title={ui('إجمالي قيمة اشتراكات اليوم')}
          value={formatMoney(summary?.totalValue ?? 0, undefined, locale)}
          icon={CircleDollarSign}
          tone="bg-sky-500"
          loading={query.isLoading}
        />
        <SummaryCard
          title={ui('المحصل اليوم')}
          value={formatMoney(summary?.collectedToday ?? 0, undefined, locale)}
          icon={WalletCards}
          tone="bg-emerald-500"
          loading={query.isLoading}
        />
        <SummaryCard
          title={ui('المتبقي في اشتراكات اليوم')}
          value={formatMoney(summary?.remainingAmount ?? 0, undefined, locale)}
          icon={Banknote}
          tone="bg-amber-500"
          loading={query.isLoading}
        />
        <SummaryCard
          title={ui('عدد اشتراكات اليوم')}
          value={toArabicDigits(summary?.subscriptionsCount ?? 0)}
          icon={CreditCard}
          tone="bg-violet-500"
          loading={query.isLoading}
        />
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-bold">{ui('الاشتراكات المسجلة اليوم')}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {data?.selectedUserName ?? ui('المستخدم الحالي')} · {toArabicDigits(rows.length)} {ui('اشتراك')}
              </p>
            </div>
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={ui('بحث برقم الاشتراك أو العميل أو النوع')}
              className="max-w-sm"
            />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-sm">
              <thead className="border-b bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-start font-semibold">{ui('رقم الاشتراك')}</th>
                  <th className="px-4 py-3 text-start font-semibold">{ui('اسم العميل')}</th>
                  <th className="px-4 py-3 text-start font-semibold">{ui('نوع الاشتراك')}</th>
                  {data?.isSystemAdmin ? (
                    <th className="px-4 py-3 text-start font-semibold">{ui('المستخدم')}</th>
                  ) : null}
                  <th className="px-4 py-3 text-start font-semibold">{ui('القيمة')}</th>
                  <th className="px-4 py-3 text-start font-semibold">{ui('المتبقي')}</th>
                  <th className="px-4 py-3 text-start font-semibold">{ui('الحالة')}</th>
                  <th className="px-4 py-3 text-start font-semibold">{ui('وقت التسجيل')}</th>
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
                  : rows.map((row) => {
                      const meta = statusMeta[row.status] ?? statusMeta.active;
                      return (
                        <tr key={row.id} className="transition-colors hover:bg-muted/25">
                          <td className="nums whitespace-nowrap px-4 py-3 font-mono font-semibold text-primary">
                            {toArabicDigits(row.subscriptionNumber)}
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
                          <td className={cn('nums whitespace-nowrap px-4 py-3 font-semibold', row.remainingAmount > 0 && 'text-amber-600')}>
                            {formatMoney(row.remainingAmount, undefined, locale)}
                          </td>
                          <td className="px-4 py-3"><Badge variant={meta.variant}>{ui(meta.label)}</Badge></td>
                          <td className="nums whitespace-nowrap px-4 py-3">
                            {formatTimeFromDate(row.createdAt, locale)}
                          </td>
                        </tr>
                      );
                    })}
              </tbody>
            </table>
          </div>

          {!query.isLoading && rows.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-4 py-14 text-center text-muted-foreground">
              <CreditCard className="size-9 opacity-40" />
              <p className="font-medium">{ui('لا توجد اشتراكات مسجلة اليوم لهذا المستخدم')}</p>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
