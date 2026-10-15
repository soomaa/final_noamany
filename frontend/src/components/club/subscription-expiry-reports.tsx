import { formatDisplayNumber } from '@/lib/number-display';
import type { ColumnDef } from '@tanstack/react-table';
import { CalendarDays, LockKeyhole } from 'lucide-react';
import { useMemo, useReducer, useState } from 'react';
import { DataTable } from '@/components/common/data-table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useBranches } from '@/hooks/use-branches';
import { useClubT } from '@/hooks/use-club-t';
import { formatMoney, localToday } from '@/lib/formatters';
import {
  createExpiryDaysFilterState,
  reduceExpiryDaysFilter,
} from '@/lib/subscription-expiry-filter';
import { usePaginatedList } from '@/lib/api-hooks';
import { toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';
import { useAuth } from '@/store/auth';
import type { ClubSubscriptionListItem } from '@/types/club';

function remainingDaysUntil(endDate: string): number {
  const today = new Date(`${localToday()}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  return Math.max(0, Math.round((end.getTime() - today.getTime()) / 86_400_000));
}

function toWhatsAppLink(phone: string | null | undefined, message?: string): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (!digits) return null;
  let international = digits;
  if (digits.startsWith('00')) international = digits.slice(2);
  else if (digits.startsWith('0') && digits.length >= 10) international = `20${digits.slice(1)}`;
  else if (digits.length === 10 && digits.startsWith('1')) international = `20${digits}`;
  if (international.length < 10) return null;
  const url = `https://wa.me/${international}`;
  return message ? `${url}?text=${encodeURIComponent(message)}` : url;
}

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

function RemainingDaysBadge({ days }: { days: number }) {
  const { ui } = useLocale();
  const label = days === 0
    ? ui('اليوم')
    : `${toArabicDigits(days)} ${ui('يوم')}`;
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-warning/30 bg-warning/15 px-2.5 py-0.5 text-xs font-medium text-warning">
      <CalendarDays className="size-3.5" />
      <span className="nums">{label}</span>
    </span>
  );
}

export function SubscriptionExpiryReports() {
  const ct = useClubT();
  const { ui } = useLocale();
  const { user } = useAuth();
  const { data: branches } = useBranches();
  const isSystemAdmin = user?.level === 1;
  const isBranchLocked = !isSystemAdmin;
  const lockedBranchId = !isSystemAdmin && user?.branch && user.branch > 0 ? String(user.branch) : '';
  const [statusTab, setStatusTab] = useState<'expiring' | 'expired'>('expiring');
  const [branchFilter, setBranchFilter] = useState('all');
  const [expiryDaysFilter, dispatchExpiryDaysFilter] = useReducer(
    reduceExpiryDaysFilter,
    7,
    createExpiryDaysFilterState,
  );
  const [expiringPage, setExpiringPage] = useState(1);
  const [expiringPageSize, setExpiringPageSize] = useState(10);
  const [expiringSearch, setExpiringSearch] = useState('');
  const [expiredPage, setExpiredPage] = useState(1);
  const [expiredPageSize, setExpiredPageSize] = useState(10);
  const [expiredSearch, setExpiredSearch] = useState('');

  const effectiveBranch = lockedBranchId || (branchFilter !== 'all' ? branchFilter : '');
  const daysFilter = expiryDaysFilter.applied;

  const applyExpiryDaysFilter = () => {
    dispatchExpiryDaysFilter({ type: 'apply' });
    setExpiringPage(1);
  };

  const expiringParams = useMemo(() => ({
    page: expiringPage,
    pageSize: expiringPageSize,
    search: expiringSearch,
    filters: {
      status: 'active',
      expiresWithinDays: String(daysFilter),
      ...(effectiveBranch ? { branch: effectiveBranch } : {}),
    },
  }), [daysFilter, effectiveBranch, expiringPage, expiringPageSize, expiringSearch]);

  const expiredParams = useMemo(() => ({
    page: expiredPage,
    pageSize: expiredPageSize,
    search: expiredSearch,
    filters: {
      status: 'expired',
      ...(effectiveBranch ? { branch: effectiveBranch } : {}),
    },
  }), [effectiveBranch, expiredPage, expiredPageSize, expiredSearch]);

  const {
    data: expiring,
    isLoading: expiringLoading,
    isError: expiringError,
    refetch: refetchExpiring,
  } = usePaginatedList<ClubSubscriptionListItem>(
    'club-subscriptions',
    expiringParams,
    statusTab === 'expiring',
  );

  const {
    data: expired,
    isLoading: expiredLoading,
    isError: expiredError,
    refetch: refetchExpired,
  } = usePaginatedList<ClubSubscriptionListItem>(
    'club-subscriptions',
    expiredParams,
    statusTab === 'expired',
  );

  const expiredTotal = expired?.total ?? 0;

  const lockedBranchName = user?.branch_name
    ?? branches?.find((b) => String(b.id) === lockedBranchId)?.name
    ?? (lockedBranchId ? `${ui('فرع رقم')} ${lockedBranchId}` : ui('غير محدد'));

  const expiringColumns = useMemo<ColumnDef<ClubSubscriptionListItem>[]>(
    () => [
      {
        id: 'index',
        header: ct('common.index'),
        cell: ({ row }) => toArabicDigits((expiringPage - 1) * expiringPageSize + row.index + 1),
      },
      {
        accessorKey: 'registrationDate',
        header: ct('subscriptions.registrationDate'),
        cell: ({ getValue }) => <span className="nums">{toArabicDigits(String(getValue() ?? ''))}</span>,
      },
      {
        accessorKey: 'memberCode',
        header: ct('members.memberCode'),
        cell: ({ getValue }) => {
          const value = getValue() as string | null;
          return value ? <span className="nums font-mono">{value}</span> : '—';
        },
      },
      {
        accessorKey: 'customerName',
        header: ct('members.name'),
        cell: ({ getValue }) => getValue() ?? '—',
      },
      {
        accessorKey: 'memberPhone',
        header: ct('members.phone'),
        cell: ({ getValue }) => {
          const value = getValue() as string | null;
          return value ? <span className="nums" dir="ltr">{value}</span> : '—';
        },
      },
      {
        accessorKey: 'subscriptionType',
        header: ct('subscriptions.subType'),
        cell: ({ getValue }) => getValue() ?? '—',
      },
      {
        accessorKey: 'subscriptionValue',
        header: ct('subscriptions.subscriptionValue'),
        cell: ({ getValue }) => <span className="nums">{formatMoney(getValue() as number)}</span>,
      },
      {
        accessorKey: 'subscriptionStartDate',
        header: ct('subscriptions.startDate'),
        cell: ({ getValue }) => <span className="nums">{toArabicDigits(String(getValue() ?? ''))}</span>,
      },
      {
        accessorKey: 'subscriptionEndDate',
        header: ct('subscriptions.endDate'),
        cell: ({ getValue }) => <span className="nums">{toArabicDigits(String(getValue() ?? ''))}</span>,
      },
      {
        id: 'remainingDays',
        header: ct('subscriptions.remainingDaysCol'),
        cell: ({ row }) => <RemainingDaysBadge days={remainingDaysUntil(row.original.subscriptionEndDate)} />,
      },
      {
        id: 'actions',
        header: ct('common.actions'),
        cell: ({ row }) => {
          const days = remainingDaysUntil(row.original.subscriptionEndDate);
          const href = toWhatsAppLink(
            row.original.memberPhone,
            `${ui('تذكير: اشتراك ')}${row.original.customerName ?? ''}${ui(' ينتهي خلال ')}${formatDisplayNumber(days)}${ui(' يوم بتاريخ ')}${row.original.subscriptionEndDate}`.trim(),
          );
          if (!href) return <span className="text-muted-foreground">—</span>;
          return (
            <Button
              permissionAction={null}
              size="icon"
              variant="outline"
              className="size-9 border-success/30 bg-success/10 text-success hover:bg-success/15 hover:text-success"
              asChild
            >
              <a href={href} target="_blank" rel="noopener noreferrer" aria-label={ct('subscriptions.whatsapp')}>
                <WhatsAppIcon className="size-4" />
              </a>
            </Button>
          );
        },
      },
    ],
    [ct, expiringPage, expiringPageSize],
  );

  const expiredColumns = useMemo<ColumnDef<ClubSubscriptionListItem>[]>(
    () => [
      {
        id: 'index',
        header: ct('common.index'),
        cell: ({ row }) => toArabicDigits((expiredPage - 1) * expiredPageSize + row.index + 1),
      },
      {
        accessorKey: 'customerName',
        header: ct('subscriptions.customerName'),
        cell: ({ getValue }) => getValue() ?? '—',
      },
      {
        accessorKey: 'subscriptionType',
        header: ct('subscriptions.subType'),
        cell: ({ getValue }) => getValue() ?? '—',
      },
      {
        accessorKey: 'subscriptionEndDate',
        header: ct('subscriptions.endDate'),
        cell: ({ getValue }) => <span className="nums">{toArabicDigits(String(getValue() ?? ''))}</span>,
      },
    ],
    [ct, expiredPage, expiredPageSize],
  );

  const projectExpiringRow = (row: ClubSubscriptionListItem, index: number) => ({
    index: index + 1,
    registrationDate: row.registrationDate ?? '',
    memberCode: row.memberCode ?? '',
    customerName: row.customerName ?? '',
    memberPhone: row.memberPhone ?? '',
    subscriptionType: row.subscriptionType ?? '',
    subscriptionValue: row.subscriptionValue,
    subscriptionStartDate: row.subscriptionStartDate,
    subscriptionEndDate: row.subscriptionEndDate,
    remainingDays: remainingDaysUntil(row.subscriptionEndDate),
  });

  return (
    <Tabs value={statusTab} onValueChange={(value) => setStatusTab(value as 'expiring' | 'expired')} className="space-y-4">
      <div className="flex justify-center">
        <TabsList className="flex h-auto max-w-full flex-wrap justify-center gap-1 rounded-xl border bg-muted/40 p-1.5 shadow-sm">
          <TabsTrigger value="expiring">{ct('subscriptions.expiringReport')}</TabsTrigger>
          <TabsTrigger value="expired">{ct('subscriptions.expiredReport')}</TabsTrigger>
        </TabsList>
      </div>

      <div className="surface-panel flex flex-col gap-3 rounded-xl border bg-card px-4 py-3 md:flex-row md:flex-wrap md:items-end">
        <div className="grid min-w-[200px] gap-1.5">
          <Label>{ct('common.branch')}</Label>
          {isBranchLocked ? (
            <div className="flex h-10 items-center gap-2 rounded-md border border-primary/20 bg-muted/45 px-3 text-sm font-semibold">
              <span className="min-w-0 flex-1 truncate">{lockedBranchName}</span>
              <LockKeyhole className="size-3.5 text-muted-foreground" />
            </div>
          ) : (
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={branchFilter}
              onChange={(event) => {
                setBranchFilter(event.target.value);
                setExpiringPage(1);
                setExpiredPage(1);
              }}
            >
              <option value="all">{ct('common.allBranches')}</option>
              {(branches ?? []).map((branch) => (
                <option key={branch.id} value={String(branch.id)}>
                  {branch.name ?? '—'}
                </option>
              ))}
            </select>
          )}
        </div>
        {statusTab === 'expiring' ? (
          <div className="flex w-full flex-col gap-1.5 md:max-w-md md:flex-1">
            <Label htmlFor="expires-within-days">{ct('subscriptions.daysUntilExpiryFilter')}</Label>
            <div className="flex items-center gap-2">
              <Input
                id="expires-within-days"
                type="number"
                min={0}
                max={90}
                inputMode="numeric"
                className="h-10 min-w-0 flex-1 nums"
                value={expiryDaysFilter.draft}
                onChange={(event) => dispatchExpiryDaysFilter({ type: 'edit', value: event.target.value })}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    applyExpiryDaysFilter();
                  }
                }}
              />
              <Button
                type="button"
                variant="brand"
                className="h-10 shrink-0 px-5"
                onClick={applyExpiryDaysFilter}
                disabled={expiryDaysFilter.draft === String(expiryDaysFilter.applied)}
              >
                {ct('subscriptions.applyExpiryFilter')}
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      <TabsContent value="expiring" className="space-y-3">
        <p className="text-sm text-muted-foreground nums">
          {toArabicDigits(expiring?.total ?? 0)} {ct('subscriptions.tabSubs')}
        </p>
        <DataTable
          columns={expiringColumns}
          data={expiring?.data ?? []}
          total={expiring?.total ?? 0}
          page={expiringPage}
          pageSize={expiringPageSize}
          onPageChange={setExpiringPage}
          onPageSizeChange={(size) => {
            setExpiringPageSize(size);
            setExpiringPage(1);
          }}
          search={expiringSearch}
          onSearchChange={(value) => {
            setExpiringSearch(value);
            setExpiringPage(1);
          }}
          isLoading={expiringLoading}
          isError={expiringError}
          onRetry={() => void refetchExpiring()}
          emptyTitle={ct('common.noData')}
          exportSource={{
            resource: 'club-subscriptions',
            params: expiringParams,
            project: projectExpiringRow,
          }}
          exportColumns={[
            { key: 'index', header: ct('common.index') },
            { key: 'registrationDate', header: ct('subscriptions.registrationDate') },
            { key: 'memberCode', header: ct('members.memberCode') },
            { key: 'customerName', header: ct('members.name') },
            { key: 'memberPhone', header: ct('members.phone') },
            { key: 'subscriptionType', header: ct('subscriptions.subType') },
            { key: 'subscriptionValue', header: ct('subscriptions.subscriptionValue') },
            { key: 'subscriptionStartDate', header: ct('subscriptions.startDate') },
            { key: 'subscriptionEndDate', header: ct('subscriptions.endDate') },
            { key: 'remainingDays', header: ct('subscriptions.remainingDaysCol') },
          ]}
        />
      </TabsContent>

      <TabsContent value="expired" className="space-y-3">
        <p className="text-sm nums">{toArabicDigits(expiredTotal)}</p>
        <DataTable
          columns={expiredColumns}
          data={expired?.data ?? []}
          total={expiredTotal}
          page={expiredPage}
          pageSize={expiredPageSize}
          onPageChange={setExpiredPage}
          onPageSizeChange={(size) => {
            setExpiredPageSize(size);
            setExpiredPage(1);
          }}
          search={expiredSearch}
          onSearchChange={(value) => {
            setExpiredSearch(value);
            setExpiredPage(1);
          }}
          isLoading={expiredLoading}
          isError={expiredError}
          onRetry={() => void refetchExpired()}
          emptyTitle={ct('common.noData')}
          exportSource={{ resource: 'club-subscriptions', params: expiredParams }}
        />
      </TabsContent>
    </Tabs>
  );
}
