import type { ColumnDef } from '@tanstack/react-table';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  CreditCard,
  FileText,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Repeat,
  Snowflake,
  Sun,
  Undo2,
  Printer,
  User,
  CalendarDays,
  Wallet,
  ShieldOff,
  Dumbbell,
  Package,
  Sparkles,
  ContactRound,
  ArrowRightLeft,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { DataTable } from '@/components/common/data-table';
import { Combobox } from '@/components/common/combobox';
import { FilterBar, type FilterField } from '@/components/common/filter-bar';
import { PageHeader } from '@/components/common/page-header';
import { StatusBadge } from '@/components/common/status-badge';
import { ErrorState } from '@/components/common/states';
import { ClubStatCard } from '@/components/club/stat-card';
import { DialogFormGrid, DialogFormSection, DialogFormSummary, FormDialogBody, FormDialogFooter, FormDialogHeader, FORM_DIALOG_CONTENT_CLASS } from '@/components/common/dialog-form-layout';
import { FieldWrapper } from '@/components/common/form-fields';
import { MemberSearchCombobox } from '@/components/club/member-search-combobox';
import { SubscriptionReceiptCreateDialog } from '@/pages/club/subscription-receipt-create-dialog';
import {
  MemberOnboardingGuide,
  useFirstVisitGuide,
} from '@/components/club/member-onboarding-guide';
import { SubscriptionTypeSelect, TransferPlanPicker } from '@/components/club/subscription-type-select';
import {
  calculateSubscriptionDiscount,
  SubscriptionDiscountFields,
  type SubscriptionDiscountMode,
} from '@/components/club/subscription-discount-fields';
import { SubscriptionInvoicePrint } from '@/components/club/subscription-invoice-print';
import {
  ClubPaymentMethodSelect,
  clubPaymentMethodsLabel,
  type ClubPaymentMethod,
} from '@/components/club/club-payment-method-select';
import {
  buildClubPaymentSplit,
  ClubPaymentSplitFields,
  singlePaymentRow,
  type ClubPaymentSplitRow,
} from '@/components/club/club-payment-split-fields';
import { SubscriptionRefundsWorkspace } from '@/pages/club/subscription-refunds';
import { PrivateEnrollmentsList } from '@/components/club/private-subscriptions';
import {
  SubscriptionPaymentPanel,
  subscriptionNetValue,
  type SubscriptionPaymentReceiptRow,
} from '@/components/club/subscription-payment-panel';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Pagination } from '@/components/ui/pagination';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useBranches } from '@/hooks/use-branches';
import { useClubT } from '@/hooks/use-club-t';
import { usePermission } from '@/hooks/use-permission';
import { useLocale } from '@/store/locale';
import { useAuth } from '@/store/auth';
import { translateNavRoute } from '@/lib/nav';
import { api, apiError } from '@/lib/api';
import { formatMoney, formatTime, localToday } from '@/lib/formatters';
import { resolveSessionMatrixPrice } from '@/lib/session-price-matrix';
import { subscriptionTypesForBranch } from '@/lib/club-subscription-branches';
import { useArrayResource, usePaginatedList } from '@/lib/api-hooks';
import { confirm, afterMenuClose } from '@/lib/confirm';
import { useListQuery } from '@/lib/use-list-query';
import { cn, toArabicDigits } from '@/lib/utils';
import type { ClubSubscriptionsView } from '@/lib/club-routes';
import type { ClubDiscountCode, ClubMemberListItem, ClubPrivatePackage, ClubSubscriptionListItem, ClubSubscriptionStatistics, ClubSubscriptionType } from '@/types/club';
import type { ClubClassType, ClubTrainerRow } from '@/types/fitness';

const selectCls = 'flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm';

function resolveBranchName(
  branches: { id: number; name: string | null }[] | undefined,
  branchId: number,
  userBranchId?: number,
): string {
  if (!branchId) return '—';
  const name = branches?.find((b) => b.id === branchId)?.name?.trim();
  if (name) return name;
  if (userBranchId === branchId) return branches === undefined ? '…' : '—';
  return branches === undefined ? '…' : '—';
}

/** Add N days to a YYYY-MM-DD string using local time (no UTC shift). */
function addDaysLocal(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, (m ?? 1) - 1, (d ?? 1) + days);
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${dt.getFullYear()}-${mm}-${dd}`;
}

function daysBetweenLocal(startDate: string, endDate: string): number {
  const [sy, sm, sd] = startDate.split('-').map(Number);
  const [ey, em, ed] = endDate.split('-').map(Number);
  const start = Date.UTC(sy, (sm ?? 1) - 1, sd ?? 1);
  const end = Date.UTC(ey, (em ?? 1) - 1, ed ?? 1);
  return Math.max(1, Math.round((end - start) / 86_400_000));
}

interface ReceiptRow extends SubscriptionPaymentReceiptRow {
  memberName: string;
  memberCode?: string | null;
  subscriptionType?: string | null;
  subscriptionId?: number | null;
  lockerSubscriptionId?: number | null;
  branchId?: number | null;
}

interface PlanTransferPreview {
  subscriptionId: number;
  sourceType: string | null;
  sourceKind: 'sessions' | 'subscription';
  consumedValue: number;
  transferableCredit: number;
  targetType: string;
  targetKind: 'sessions' | 'subscription';
  targetUnitPrice: number | null;
  targetSessionsCount: number | null;
  targetValue: number;
  creditApplied: number;
  refundAmount: number;
  additionalDue: number;
  toEndDate: string;
}

interface WaiverReportRow {
  id: number;
  subscriptionId: number;
  subscriptionNumber: string;
  subscriptionType: string | null;
  memberName: string | null;
  amount: number;
  waiverDate: string;
  reason: string | null;
}

type SubscriptionKind = 'package' | 'sessions' | 'special' | 'private';
type WorkspaceSubscriptionAction = 'renew' | 'freeze' | 'unfreeze' | 'transfer';

export interface ClubSubscriptionsPageProps {
  singleView?: ClubSubscriptionsView;
  openCreateOnMount?: boolean;
  filterSpecial?: boolean;
  filterTimeBased?: boolean;
  reportFocus?: 'expired' | 'outstanding' | 'expiring';
}

export function ClubSubscriptionsPage({
  singleView,
  openCreateOnMount,
  filterSpecial,
  filterTimeBased,
  reportFocus,
}: ClubSubscriptionsPageProps = {}) {
  const ct = useClubT();
  const { ui, t } = useLocale();
  const { can, canRoute } = usePermission();
  const canCreateSubscriptions =
    can('club.subscriptions:create') ||
    can('club.subscriptions.list:create') ||
    can('club.subscriptions.new:create');
  const canUpdateSubscriptions =
    can('club.subscriptions:update') ||
    can('club.subscriptions.list:update');
  const canDeleteSubscriptions =
    can('club.subscriptions:delete') ||
    can('club.subscriptions.list:delete');
  const canPrintSubscriptions =
    can('club.subscriptions:print') ||
    can('club.subscriptions.list:print');
  const canCreateRefund =
    canRoute('/club/subscriptions/refunds') &&
    (canUpdateSubscriptions || can('club.reception:update'));
  // Admin can change the stats date filter; reception staff is locked to today
  const canChangeStatsFilter = can('club.subscriptions:view') || can('club.subscriptions.user_analytics:view');
  type StatsPreset = 'today' | 'week' | 'month' | 'quarter' | 'custom';
  const [statsPreset, setStatsPreset] = useState<StatsPreset>(canChangeStatsFilter ? 'month' : 'today');
  const [statsCustomFrom, setStatsCustomFrom] = useState('');
  const [statsCustomTo, setStatsCustomTo] = useState('');
  const statsDateRange = useMemo(() => {
    const today = localToday();
    if (statsPreset === 'today') return { dateFrom: today, dateTo: today };
    if (statsPreset === 'week') {
      const [y, m, d] = today.split('-').map(Number);
      const from = new Date(y, (m ?? 1) - 1, (d ?? 1) - 6);
      const mm = String(from.getMonth() + 1).padStart(2, '0');
      const dd = String(from.getDate()).padStart(2, '0');
      return { dateFrom: `${from.getFullYear()}-${mm}-${dd}`, dateTo: today };
    }
    if (statsPreset === 'month') {
      const [y, m] = today.split('-').map(Number);
      const mm = String(m ?? 1).padStart(2, '0');
      return { dateFrom: `${y}-${mm}-01`, dateTo: today };
    }
    if (statsPreset === 'quarter') {
      const [y, m] = today.split('-').map(Number);
      const qStartMonth = Math.floor(((m ?? 1) - 1) / 3) * 3 + 1;
      const mm = String(qStartMonth).padStart(2, '0');
      return { dateFrom: `${y}-${mm}-01`, dateTo: today };
    }
    // custom
    return { dateFrom: statsCustomFrom || undefined, dateTo: statsCustomTo || undefined };
  }, [statsPreset, statsCustomFrom, statsCustomTo]);
  const { user } = useAuth();
  const subscriptionOnboarding = useFirstVisitGuide('subscriptions', user?.sub);
  const qc = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
  const workspaceActionHandled = useRef(false);
  const [workspaceSubscription, setWorkspaceSubscription] = useState<ClubSubscriptionListItem | null>(null);
  const initialFilters: Record<string, string> | undefined = filterSpecial
    ? { isSpecial: 'true' }
    : filterTimeBased
      ? { isTimeBased: 'true' }
      : undefined;
  const [tab, setTab] = useState<ClubSubscriptionsView>(
    singleView ?? (reportFocus ? 'reports' : 'subs'),
  );
  const [expiredPage, setExpiredPage] = useState(1);
  const expiredPageSize = 20;
  const { params, setParams } = useListQuery(initialFilters ? { filters: initialFilters } : undefined);
  const subscriptionListParams = useMemo(() => {
    const dateFilters = {
      ...(statsDateRange.dateFrom ? { registrationDateFrom: statsDateRange.dateFrom } : {}),
      ...(statsDateRange.dateTo ? { registrationDateTo: statsDateRange.dateTo } : {}),
    };
    const { kind, ...restFilters } = (params.filters ?? {}) as Record<string, string | undefined>;
    const kindFilters: Record<string, string> =
      kind === 'normal' ? { isSpecial: 'false', isLinkedToSessions: 'false' } :
      kind === 'private' ? { isSpecial: 'true' } :
      kind === 'sessions' ? { isLinkedToSessions: 'true' } :
      {};
    const baseFilters = { ...restFilters, ...dateFilters, ...kindFilters };
    return tab === 'frozen'
      ? { ...params, filters: { ...baseFilters, status: 'frozen' } }
      : { ...params, filters: baseFilters };
  }, [params, tab, statsDateRange]);
  const { data, isLoading, isError, error, refetch } = usePaginatedList<ClubSubscriptionListItem>(
    'club-subscriptions',
    subscriptionListParams,
  );
  const availableSubscriptions = useMemo(() => {
    const current = data?.data ?? [];
    return workspaceSubscription && !current.some((subscription) => subscription.id === workspaceSubscription.id)
      ? [workspaceSubscription, ...current]
      : current;
  }, [data?.data, workspaceSubscription]);
  const { data: branches } = useBranches();
  const { data: subTypesRaw, refetch: refetchTypes } = useArrayResource<{
    id: number;
    name: string;
    price: number;
    days: number;
    isSpecialOffer?: boolean;
    applyToAllBranches?: boolean;
    branchIds?: number[];
    branchId?: number | null;
    isLinkedToSessions?: boolean;
    sessionsCount?: number | null;
    sessionPrices?: Array<{ sessionsCount: number; price: number }>;
  }>('club-subscription-types');
  const { data: specialClassTypes } = useArrayResource<ClubClassType>('club-class-types');
  const { data: discountCodes = [] } = useArrayResource<ClubDiscountCode>('club-discount-codes');
  const { data: privatePackages = [] } = useArrayResource<ClubPrivatePackage>('club-private-subscriptions/packages');
  const { data: privateTrainers = [] } = useQuery({
    queryKey: ['club-trainers', 'private-subscriptions'],
    queryFn: async () => (await api.get<{ data: ClubTrainerRow[] }>('/club-trainers', { params: { page: 1, pageSize: 200, isActive: true } })).data.data,
  });
  const [selectedMember, setSelectedMember] = useState<ClubMemberListItem | null>(null);
  const showNewSubButton = !singleView || singleView === 'subs';
  const [receiptFilters, setReceiptFilters] = useState({ branchId: '', memberId: '', startDate: '', endDate: '' });
  const { data: receipts = [], refetch: refetchReceipts } = useQuery({
    queryKey: ['club-receipts', 'period', receiptFilters],
    queryFn: async () => (await api.get<{ data: ReceiptRow[] }>('/club-receipts', {
      params: {
        page: 1, pageSize: 500,
        ...(receiptFilters.branchId ? { branchId: Number(receiptFilters.branchId) } : {}),
        ...(receiptFilters.memberId ? { memberId: Number(receiptFilters.memberId) } : {}),
        ...(receiptFilters.startDate ? { startDate: receiptFilters.startDate } : {}),
        ...(receiptFilters.endDate ? { endDate: receiptFilters.endDate } : {}),
      },
    })).data.data,
  });

  const printReceiptInvoice = async (receipt: ReceiptRow) => {
    if (!receipt.subscriptionId) {
      toast.error('لا يوجد اشتراك مرتبط بهذا الإيصال');
      return;
    }
    try {
      const { data: subscription } = await api.get<ClubSubscriptionListItem>(
        `/club-subscriptions/${receipt.subscriptionId}`,
      );
      setPrintSub(subscription);
    } catch (error) {
      toast.error(apiError(error));
    }
  };
  const { data: transfers, refetch: refetchTransfers } = useArrayResource<{
    id: number;
    subscription_id: number;
    destination_subscription_id?: number | null;
    from_subscription_type: string | null;
    to_subscription_type: string;
    transfer_date: string;
    to_value: number;
    consumed_value?: number;
    credit_amount?: number;
    refund_amount?: number;
    additional_paid_amount?: number;
    destination_sessions_count?: number | null;
  }>('club-subscription-transfers');

  const { data: stats } = useQuery({
    queryKey: ['club-subscriptions', 'statistics', filterSpecial ? 'special' : 'all', statsDateRange.dateFrom, statsDateRange.dateTo],
    queryFn: async () => {
      const { data: s } = await api.get<ClubSubscriptionStatistics>('/club-subscriptions/statistics', {
        params: {
          ...(filterSpecial ? { isSpecial: 'true' } : {}),
          ...(statsDateRange.dateFrom ? { dateFrom: statsDateRange.dateFrom } : {}),
          ...(statsDateRange.dateTo ? { dateTo: statsDateRange.dateTo } : {}),
        },
      });
      return s;
    },
  });

  const { data: expired } = useQuery({
    queryKey: ['club-subscriptions', 'expired', expiredPage, expiredPageSize],
    // The expired report may contain years of history. It is only visible in the reports tab,
    // so do not make this expensive request while reception is creating a subscription.
    enabled: tab === 'reports' && (!reportFocus || reportFocus === 'expired'),
    queryFn: async () => {
      const { data: r } = await api.get<{ data: ClubSubscriptionListItem[]; count: number; page: number; pageSize: number }>(
        '/club-subscriptions/expired-report',
        { params: { page: expiredPage, pageSize: expiredPageSize } },
      );
      return r;
    },
  });

  // Subscriptions expiring within the next 7 days (uses endDateFrom/endDateTo range).
  const expiringRange = useMemo(() => {
    const from = localToday();
    const to = addDaysLocal(from, 7);
    return { from, to };
  }, []);
  const { data: expiring } = useQuery({
    queryKey: ['club-subscriptions', 'expiring', expiringRange.from, expiringRange.to],
    enabled: reportFocus === 'expiring',
    queryFn: async () => {
      const { data: r } = await api.get<{ data: ClubSubscriptionListItem[]; total: number }>(
        '/club-subscriptions',
        {
          params: {
            endDateFrom: expiringRange.from,
            endDateTo: expiringRange.to,
            status: 'active',
            pageSize: 100,
          },
        },
      );
      return r;
    },
  });

  const statusOptions = useMemo(
    () => [
      { value: 'active', label: ct('common.active') },
      { value: 'expired', label: ct('common.expired') },
      { value: 'upcoming', label: ct('common.upcoming') },
      { value: 'frozen', label: ct('subscriptions.frozen') },
    ],
    [ct],
  );
  const branchOptions = (branches ?? []).map((b) => ({ value: String(b.id), label: b.name ?? '—' }));
  const subTypeOptions = (subTypesRaw ?? [])
    .map((t) => ({ value: t.name, label: t.name }))
    .filter((o, i, arr) => arr.findIndex((x) => x.value === o.value) === i);
  const genderOptions = [
    { value: 'male', label: ct('common.male') },
    { value: 'female', label: ct('common.female') },
  ];
  const kindOptions = [
    { value: 'normal', label: 'اشتراك عادى' },
    { value: 'private', label: 'برايفت' },
    { value: 'sessions', label: 'حصص' },
  ];
  const filters: FilterField[] = [
    { key: 'branch', label: ct('common.branch'), type: 'select', options: branchOptions },
    { key: 'kind', label: 'فئة الاشتراك', type: 'select', options: kindOptions },
    { key: 'subscriptionType', label: ct('subscriptions.subType'), type: 'select', options: subTypeOptions },
    { key: 'gender', label: 'الفئة', type: 'select', options: genderOptions },
    { key: 'status', label: ct('common.status'), type: 'select', options: statusOptions },
  ];

  const { data: outstanding, refetch: refetchOutstanding } = useQuery({
    queryKey: ['club-subscriptions', 'outstanding'],
    queryFn: async () => {
      const { data: r } = await api.get<{ subscriptions: ClubSubscriptionListItem[]; summary: { count: number } }>(
        '/club-subscriptions/outstanding-report',
      );
      return r;
    },
    enabled: reportFocus === 'outstanding' || tab === 'reports',
  });
  const { data: waivers, refetch: refetchWaivers } = useQuery({
    queryKey: ['club-subscriptions', 'waivers'],
    queryFn: async () => (await api.get<{ data: WaiverReportRow[]; summary: { count: number; totalAmount: number } }>('/club-subscriptions/waivers-report')).data,
    enabled: tab === 'waivers',
  });
  const [dialogOpen, setDialogOpen] = useState(!!openCreateOnMount);
  const [editSubId, setEditSubId] = useState<number | null>(null);
  const [editOriginal, setEditOriginal] = useState<{ startDate: string; typeId: string } | null>(null);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [printSub, setPrintSub] = useState<ClubSubscriptionListItem | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [installmentRows, setInstallmentRows] = useState<ClubPaymentSplitRow[]>(singlePaymentRow());
  const [paymentMaxRemaining, setPaymentMaxRemaining] = useState(0);
  const [paymentSub, setPaymentSub] = useState<ClubSubscriptionListItem | null>(null);
  const [waiverOpen, setWaiverOpen] = useState(false);
  const [waiverSub, setWaiverSub] = useState<ClubSubscriptionListItem | null>(null);
  const [waiverForm, setWaiverForm] = useState({ amount: '', reason: '' });
  const [editRemainingAmount, setEditRemainingAmount] = useState<number | null>(null);
  const [freezeOpen, setFreezeOpen] = useState(false);
  const [editingFreeze, setEditingFreeze] = useState(false);
  const [freezeForm, setFreezeForm] = useState({ startDate: localToday(), endDate: localToday(), reason: '' });
  const [renewOpen, setRenewOpen] = useState(false);
  const [renewForm, setRenewForm] = useState({ paidAmount: '' });
  const [renewRows, setRenewRows] = useState<ClubPaymentSplitRow[]>(singlePaymentRow());
  const [subscriptionKind, setSubscriptionKind] = useState<SubscriptionKind>('package');
  const { data: subscriptionEmployees = [] } = useQuery({
    queryKey: ['employees', 'subscription-options'],
    queryFn: async () => (await api.get<Array<{ id: number; employee: string | null; emp_code: number | null }>>('/employees/subscription-options')).data,
    enabled: subscriptionKind === 'package',
  });
  /** Tender rows for the create/edit dialog — one row unless the user splits the payment. */
  const [paymentRows, setPaymentRows] = useState<ClubPaymentSplitRow[]>(singlePaymentRow());
  const [receiptNumber, setReceiptNumber] = useState('');
  const [paidAmountEdited, setPaidAmountEdited] = useState(false);

  const [form, setForm] = useState({
    branchId: 0,
    memberId: '',
    customerName: '',
    subscriptionTypeId: '',
    specialClassTypeId: '',
    privatePackageId: '',
    privateTrainerId: '',
    privateDiscountType: '',
    employeeId: '',
    startDate: localToday(),
    endDate: '',
    subscriptionValue: '',
    paidAmount: '',
    gender: 'male' as 'male' | 'female',
    isSpecial: false,
    isTimeBased: false,
    timeFrom: '06:00',
    timeTo: '22:00',
    discountEnabled: false,
    discountMode: 'none' as SubscriptionDiscountMode,
    discountCodeId: '',
    memberDiscountGrantId: '',
    discountValue: '',
    pointsToRedeem: '',
    isLinkedToSessions: false,
    sessionsCount: '',
    validityDays: '',
  });

  const subscriptionBranchOptions = useMemo(() => {
    const allowedUserBranches = user?.level === 1 || !user?.branch ? null : [user.branch];
    return branchOptions.filter((branch) => {
      const branchId = Number(branch.value);
      return allowedUserBranches === null || allowedUserBranches.includes(branchId);
    });
  }, [branchOptions, user?.branch, user?.level]);

  const visiblePrivatePackages = useMemo(() => {
    const subscriptionBranchId = form.branchId || selectedMember?.branchId;
    if (!subscriptionBranchId) return privatePackages;
    return privatePackages.filter((item) => item.branchIds.includes(subscriptionBranchId));
  }, [form.branchId, privatePackages, selectedMember?.branchId]);
  const privatePackageOptions = useMemo(() => visiblePrivatePackages.map((item) => ({
    value: String(item.id),
    label: item.name,
    description: item.kind === 'sessions'
      ? `حصص برايفت · ${toArabicDigits(item.sessionsCount ?? 0)} حصة · ${formatMoney(item.price)}`
      : `اشتراك برايفت · ${formatMoney(item.price)}`,
    searchText: item.kind === 'sessions'
      ? `حصص برايفت ${item.sessionsCount ?? 0} ${item.price}`
      : `اشتراك برايفت ${item.price}`,
  })), [visiblePrivatePackages]);

  const historySubId =
    paymentOpen && selectedId != null
      ? selectedId
      : dialogOpen && editSubId != null
        ? editSubId
        : // The printed invoice lists the tender breakdown, which lives on the receipts.
          (printSub?.id ?? null);

  const { data: subscriptionReceipts = [], isLoading: loadingSubscriptionReceipts } = useQuery({
    queryKey: ['club-receipts', 'by-subscription', historySubId],
    queryFn: async () => {
      const { data } = await api.get<{ data: ReceiptRow[] }>('/club-receipts', {
        params: { subscriptionId: historySubId, pageSize: 100, page: 1 },
      });
      return data.data ?? [];
    },
    enabled: historySubId != null,
  });

  const { data: pointsAccount } = useQuery({
    queryKey: ['club-points', 'subscription-account', selectedMember?.id],
    enabled: selectedMember?.id != null && dialogOpen,
    queryFn: async () => (await api.get<{ points: number; conversion: { points: number; value: number } | null }>(`/club-points/members/${selectedMember!.id}`)).data,
  });
  const { data: memberDiscountGrants = [] } = useQuery({
    queryKey: ['club-discount-codes', 'member-grants', selectedMember?.id],
    enabled: selectedMember?.id != null && dialogOpen,
    queryFn: async () => (await api.get<Array<{ id: number; code: string | null; percentage: number; used: boolean; expiresOn: string | null }>>('/club-discount-codes/member-grants', { params: { memberId: selectedMember!.id } })).data
      .filter((grant) => !grant.used && !!grant.code),
  });
  const formDiscountValue = useMemo(
    () => calculateSubscriptionDiscount(
      Number(form.subscriptionValue) || 0,
      form.discountMode,
      form.discountMode === 'code' ? memberDiscountGrants.map((grant) => ({ id: grant.id, code: grant.code ?? '', percentage: grant.percentage, isActive: true, usageCount: 0, createdAt: '', updatedAt: '' })) : discountCodes,
      form.discountMode === 'code' ? form.memberDiscountGrantId : form.discountCodeId,
      form.discountValue,
      form.pointsToRedeem,
      pointsAccount?.conversion ?? null,
    ),
    [discountCodes, form.discountCodeId, form.discountMode, form.discountValue, form.memberDiscountGrantId, form.pointsToRedeem, form.subscriptionValue, memberDiscountGrants, pointsAccount?.conversion],
  );
  const formNetValue = Math.max(0, (Number(form.subscriptionValue) || 0) - formDiscountValue);
  useEffect(() => {
    if (editSubId || paidAmountEdited) return;
    const automaticPaidAmount = String(formNetValue);
    setPaymentRows((rows) => rows.length === 1
      ? singlePaymentRow(rows[0]?.method ?? 'cash', automaticPaidAmount)
      : rows);
    setForm((current) => current.paidAmount === automaticPaidAmount
      ? current
      : { ...current, paidAmount: automaticPaidAmount });
  }, [editSubId, formNetValue, paidAmountEdited]);
  const formRemaining = useMemo(() => {
    const paid = Number(form.paidAmount) || 0;
    return Math.max(0, formNetValue - paid);
  }, [formNetValue, form.paidAmount]);
  const availableSubTypes = useMemo(() => {
    const types = (subTypesRaw ?? []).filter((type) => !type.isSpecialOffer);
    const branchId = form.branchId || selectedMember?.branchId;
    return subscriptionTypesForBranch(types as ClubSubscriptionType[], branchId);
  }, [subTypesRaw, form.branchId, selectedMember?.branchId]);
  const subTypes = useMemo(
    () => availableSubTypes.filter((type) =>
      subscriptionKind === 'sessions' ? !!type.isLinkedToSessions : !type.isLinkedToSessions,
    ),
    [availableSubTypes, subscriptionKind],
  );
  const [transferForm, setTransferForm] = useState({
    subscriptionId: '',
    toSubscriptionTypeId: '',
    toStartDate: localToday(),
    reason: '',
    additionalPaidAmount: '',
    additionalPaymentMethod: 'cash' as ClubPaymentMethod,
    refundPaymentMethod: 'cash' as ClubPaymentMethod,
  });
  const [transferPreview, setTransferPreview] = useState<PlanTransferPreview | null>(null);
  const [transferPreviewError, setTransferPreviewError] = useState('');
  const transferSource = useMemo(
    () => availableSubscriptions.find((item) => item.id === Number(transferForm.subscriptionId)) ?? null,
    [availableSubscriptions, transferForm.subscriptionId],
  );
  const transferAvailableSubTypes = useMemo(
    () => subscriptionTypesForBranch(
      (subTypesRaw ?? []).filter((type) => !type.isSpecialOffer) as ClubSubscriptionType[],
      transferSource?.branchId,
    ),
    [subTypesRaw, transferSource?.branchId],
  );

  const pageTitle = filterSpecial
    ? translateNavRoute(t, '/club/subscriptions/special')
    : filterTimeBased
      ? translateNavRoute(t, '/club/subscriptions/time-based')
      : ct('subscriptions.title');

  useEffect(() => {
    if (filterSpecial) setParams({ filters: { isSpecial: 'true' }, page: 1 });
    else if (filterTimeBased) setParams({ filters: { isTimeBased: 'true' }, page: 1 });
  }, [filterSpecial, filterTimeBased, setParams]);

  // Arriving from the member form's «حفظ وإضافة اشتراك»: preselect that member and open the dialog.
  useEffect(() => {
    const prefill = (location.state as { prefillMember?: ClubMemberListItem } | null)?.prefillMember;
    if (!prefill) return;
    window.history.replaceState({}, '');
    setEditSubId(null);
    setSelectedMember(prefill);
    const branchId =
      (user?.branch && user.branch > 0 ? user.branch : undefined) ??
      prefill.branchId ??
      branches?.[0]?.id ??
      0;
    setForm((f) => ({
      ...f,
      memberId: String(prefill.id),
      customerName: prefill.name,
      gender: prefill.gender ?? f.gender,
      branchId,
    }));
    setDialogOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Lock branch to the logged-in employee when the create dialog opens empty.
  useEffect(() => {
    if (!dialogOpen || editSubId) return;
    if (form.branchId) return;
    const branchId = user?.branch && user.branch > 0 ? user.branch : (branches?.[0]?.id ?? 0);
    if (!branchId) return;
    setForm((f) => (f.branchId ? f : { ...f, branchId }));
  }, [dialogOpen, editSubId, form.branchId, user?.branch, branches]);

  useEffect(() => {
    if (!form.subscriptionTypeId || !form.startDate) return;
    const type = subTypes?.find((t) => t.id === Number(form.subscriptionTypeId));
    if (!type) return;
    const packageSessions = type.isLinkedToSessions ? Math.max(1, Number(type.sessionsCount) || 1) : 0;
    setForm((f) => ({
      ...f,
      subscriptionValue: String(type.price),
      isLinkedToSessions: !!type.isLinkedToSessions,
      sessionsCount: type.isLinkedToSessions ? String(packageSessions) : '',
      endDate: addDaysLocal(f.startDate, type.days > 0 ? type.days : type.isLinkedToSessions ? 30 : 0),
    }));
  }, [form.subscriptionTypeId, form.startDate, subTypes]);

  useEffect(() => {
    if (!form.specialClassTypeId || !form.startDate) return;
    const classType = specialClassTypes?.find((item) => item.id === Number(form.specialClassTypeId));
    if (!classType) return;
    const maxSessions = Math.max(1, classType.subscriptionSessionsCount ?? 1);
    setForm((current) => ({
      ...current,
      validityDays:
        Number.isInteger(Number(current.validityDays)) && Number(current.validityDays) > 0
          ? current.validityDays
          : '30',
      subscriptionValue: String(
        classType.singleSessionPrice *
          (Number.isInteger(Number(current.sessionsCount)) && Number(current.sessionsCount) > 0
            ? Math.min(Number(current.sessionsCount), maxSessions)
            : maxSessions),
      ),
      sessionsCount:
        Number.isInteger(Number(current.sessionsCount)) && Number(current.sessionsCount) > 0
          ? String(Math.min(Number(current.sessionsCount), maxSessions))
          : String(maxSessions),
      endDate: addDaysLocal(
        current.startDate,
        Number.isInteger(Number(current.validityDays)) && Number(current.validityDays) > 0
          ? Number(current.validityDays)
          : 30,
      ),
      isSpecial: true,
      isLinkedToSessions: true,
    }));
  }, [form.specialClassTypeId, form.startDate, specialClassTypes]);

  useEffect(() => {
    if (!form.privatePackageId || !form.startDate) return;
    const packageRow = privatePackages.find((item) => item.id === Number(form.privatePackageId));
    if (!packageRow) return;
    setForm((current) => ({
      ...current,
      subscriptionValue: String(packageRow.price),
      endDate: addDaysLocal(current.startDate, packageRow.durationDays),
      isSpecial: true,
      isLinkedToSessions: packageRow.kind === 'sessions',
      sessionsCount: packageRow.sessionsCount == null ? '' : String(packageRow.sessionsCount),
    }));
  }, [form.privatePackageId, form.startDate, privatePackages]);

  useEffect(() => {
    const subscriptionId = Number(transferForm.subscriptionId);
    const toSubscriptionTypeId = Number(transferForm.toSubscriptionTypeId);
    if (!subscriptionId || !toSubscriptionTypeId || !transferForm.toStartDate) {
      setTransferPreview(null);
      setTransferPreviewError('');
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void api.post<PlanTransferPreview>('/club-subscription-transfers/preview', {
        subscriptionId,
        toSubscriptionTypeId,
        toStartDate: transferForm.toStartDate,
      }).then(({ data: preview }) => {
        if (cancelled) return;
        setTransferPreview(preview);
        setTransferPreviewError('');
        setTransferForm((current) => ({
          ...current,
          additionalPaidAmount: preview.additionalDue > 0
            ? String(preview.additionalDue)
            : '',
        }));
      }).catch((error) => {
        if (cancelled) return;
        setTransferPreview(null);
        setTransferPreviewError(apiError(error));
      });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [transferForm.subscriptionId, transferForm.toStartDate, transferForm.toSubscriptionTypeId]);

  const invalidateAll = () => {
    void refetch();
    void refetchReceipts();
    void refetchTransfers();
    void refetchTypes();
    void qc.invalidateQueries({ queryKey: ['club-subscriptions'] });
    void qc.invalidateQueries({ queryKey: ['club-subscriptions', 'outstanding'] });
    void qc.invalidateQueries({ queryKey: ['club-private-subscriptions'] });
    void qc.invalidateQueries({ queryKey: ['club-receipts'] });
  };

  const selectSubscriptionKind = (kind: SubscriptionKind) => {
    if (editSubId) return;
    setSubscriptionKind(kind);
    setForm((current) => ({
      ...current,
      subscriptionTypeId: '',
      specialClassTypeId: '',
      privatePackageId: '',
      privateTrainerId: '',
      privateDiscountType: '',
      employeeId: '',
      subscriptionValue: '',
      endDate: '',
      paidAmount: kind === 'special' || kind === 'private' ? '' : current.paidAmount,
      discountEnabled: false,
      discountMode: 'none',
      discountCodeId: '',
      memberDiscountGrantId: '',
      discountValue: kind === 'private' ? '0' : '',
      pointsToRedeem: '',
      isSpecial: kind === 'special' || kind === 'private',
      isLinkedToSessions: kind === 'sessions',
      sessionsCount: '',
      validityDays: kind === 'special' ? '30' : '',
    }));
    if (kind === 'special' || kind === 'private') {
      if (!form.memberId) setSelectedMember(null);
    }
  };

  const openCreate = () => {
    if (!canCreateSubscriptions) return;
    if (!openCreateOnMount) {
      navigate('/club/subscriptions/new');
      return;
    }
    const branchId = user?.branch && user.branch > 0 ? user.branch : (branches?.[0]?.id ?? 0);
    setEditSubId(null);
    setSubscriptionKind('package');
    setForm({
      branchId,
      memberId: '',
      customerName: '',
      subscriptionTypeId: '',
      specialClassTypeId: '',
      privatePackageId: '',
      privateTrainerId: '',
      privateDiscountType: '',
      employeeId: '',
      startDate: localToday(),
      endDate: '',
      subscriptionValue: '',
      paidAmount: '',
      gender: 'male',
        isSpecial: false,
      isTimeBased: false,
      timeFrom: '06:00',
      timeTo: '22:00',
      discountEnabled: false,
      discountMode: 'none',
      discountCodeId: '',
      memberDiscountGrantId: '',
      discountValue: '',
      pointsToRedeem: '',
      isLinkedToSessions: false,
      sessionsCount: '',
      validityDays: '',
    });
    setPaymentRows(singlePaymentRow());
    setReceiptNumber('');
    setPaidAmountEdited(false);
    setEditRemainingAmount(null);
    setSelectedMember(null);
    setDialogOpen(true);
  };

  const openEdit = async (row: ClubSubscriptionListItem) => {
    if (!canUpdateSubscriptions) return;
    setEditSubId(row.id);
    setSubscriptionKind(row.specialClassTypeId || row.isSpecial ? 'special' : row.isLinkedToSessions ? 'sessions' : 'package');
    setPaymentRows(singlePaymentRow((row.paymentMethod as ClubPaymentMethod) || 'cash'));
    setReceiptNumber(row.receiptNumber ?? '');
    setPaidAmountEdited(true);
    setForm({
      branchId: row.branchId ?? branches?.[0]?.id ?? 0,
      memberId: row.memberId ? String(row.memberId) : '',
      customerName: row.customerName ?? '',
      subscriptionTypeId: row.subscriptionTypeId ? String(row.subscriptionTypeId) : '',
      specialClassTypeId: row.specialClassTypeId ? String(row.specialClassTypeId) : '',
      privatePackageId: '',
      privateTrainerId: '',
      privateDiscountType: '',
      employeeId: row.employeeId ? String(row.employeeId) : '',
      startDate: row.subscriptionStartDate,
      endDate: row.subscriptionEndDate,
      subscriptionValue: String(row.subscriptionValue ?? ''),
      paidAmount: String(row.paidAmount ?? ''),
      gender: (row.gender as 'male' | 'female') ?? 'male',
      isSpecial: !!row.isSpecial,
      isTimeBased: !!row.isTimeBased,
      timeFrom: row.timeFrom ?? '06:00',
      timeTo: row.timeTo ?? '22:00',
      discountEnabled: !!row.discountEnabled,
      discountMode: row.discountCodeId ? 'code' : row.discountValue > 0 ? 'fixed' : 'none',
      discountCodeId: row.discountCodeId ? String(row.discountCodeId) : '',
      memberDiscountGrantId: '',
      discountValue: row.discountValue ? String(row.discountValue) : '',
      pointsToRedeem: '',
      isLinkedToSessions: !!row.isLinkedToSessions,
      sessionsCount: row.sessionsCount ? String(row.sessionsCount) : '',
      validityDays:
        row.specialClassTypeId || row.isSpecial
          ? String(daysBetweenLocal(row.subscriptionStartDate, row.subscriptionEndDate))
          : '',
    });
    setEditRemainingAmount(row.remainingAmount);
    if (row.memberId) {
      try {
        const { data } = await api.get<ClubMemberListItem>(`/club-members/${row.memberId}`);
        setSelectedMember(data);
      } catch {
        setSelectedMember(null);
      }
    } else {
      setSelectedMember(null);
    }
    setEditOriginal({
      startDate: row.subscriptionStartDate,
      typeId: row.subscriptionTypeId ? String(row.subscriptionTypeId) : '',
    });
    setDialogOpen(true);
  };

  const saveSub = async () => {
    if (editSubId ? !canUpdateSubscriptions : !canCreateSubscriptions) return;
    if ((subscriptionKind === 'special' || subscriptionKind === 'private') && (!selectedMember || !form.memberId)) {
      toast.error('اختر عضوًا مسجلًا لإضافة الاشتراك الخاص');
      return;
    }
    if (!form.customerName.trim() && !form.memberId) {
      toast.error(ct('subscriptions.customerName'));
      return;
    }
    if (
      (subscriptionKind === 'special' && !form.specialClassTypeId) ||
      (subscriptionKind === 'private' && !form.privatePackageId) ||
      (subscriptionKind !== 'special' && subscriptionKind !== 'private' && !form.subscriptionTypeId)
    ) {
      toast.error(ct('subscriptions.subType'));
      return;
    }
    if (subscriptionKind === 'private' && !form.privateTrainerId) {
      toast.error('اختر الكابتن المسؤول عن اشتراك البرايفت');
      return;
    }
    const specialSessionsCount = Number(form.sessionsCount);
    const selectedSpecialClass = specialClassTypes?.find(
      (item) => item.id === Number(form.specialClassTypeId),
    );
    if (
      subscriptionKind === 'special' &&
      (!Number.isInteger(specialSessionsCount) ||
        specialSessionsCount < 1 ||
        specialSessionsCount > Math.max(1, selectedSpecialClass?.subscriptionSessionsCount ?? 1))
    ) {
      toast.error(`عدد الحصص يجب أن يكون من 1 إلى ${selectedSpecialClass?.subscriptionSessionsCount ?? 1}`);
      return;
    }
    const selectedSessionPackage = subTypes?.find((item) => item.id === Number(form.subscriptionTypeId));
    const requestedSessionsCount = Number(form.sessionsCount);
    if (
      subscriptionKind === 'sessions' &&
      (!Number.isInteger(requestedSessionsCount) ||
        requestedSessionsCount < 1 ||
        requestedSessionsCount > Math.max(1, selectedSessionPackage?.sessionsCount ?? 1))
    ) {
      toast.error(`عدد الحصص يجب أن يكون من 1 إلى ${selectedSessionPackage?.sessionsCount ?? 1}`);
      return;
    }
    if (form.discountMode === 'code' && !form.memberDiscountGrantId) {
      toast.error('اختر كود خصم ممنوحًا لهذا العضو');
      return;
    }
    if (form.discountMode === 'points' && (!form.memberId || editSubId || !Number.isInteger(Number(form.pointsToRedeem)) || Number(form.pointsToRedeem) < 1)) {
      toast.error(editSubId ? 'لا يمكن تعديل النقاط المستبدلة بعد إنشاء الاشتراك' : 'اختر عضوًا وأدخل عدد نقاط صحيحًا للاستبدال');
      return;
    }
    const specialValidityDays = Number(form.validityDays);
    if (
      subscriptionKind === 'special' &&
      (!Number.isInteger(specialValidityDays) || specialValidityDays < 1)
    ) {
      toast.error('مدة صلاحية الاشتراك يجب أن تكون رقمًا صحيحًا أكبر من صفر');
      return;
    }
    const effectiveBranchId =
      form.branchId ||
      (user?.branch && user.branch > 0 ? user.branch : undefined) ||
      selectedMember?.branchId ||
      branches?.[0]?.id;
    if (!effectiveBranchId) {
      toast.error(ct('common.branch'));
      return;
    }
    const employeeId = subscriptionKind === 'package' ? Number(form.employeeId) || undefined : user?.emp_code ?? selectedMember?.employeeId ?? undefined;
    // Editing never collects money, so only the create paths carry a split to validate.
    const paidNow = editSubId ? 0 : Number(form.paidAmount) || 0;
    const split = buildClubPaymentSplit(paymentRows, paidNow, ct);
    if ('error' in split) {
      toast.error(split.error);
      return;
    }
    const discountPayload = {
      // Points are resolved on the server from the current balance. Sending a
      // regular discount flag with them would correctly be rejected as stacking.
      discountEnabled: form.discountMode !== 'none' && form.discountMode !== 'points',
      discountCodeId: null,
      memberDiscountGrantId: form.discountMode === 'code' ? Number(form.memberDiscountGrantId) : undefined,
      discountValue: form.discountMode === 'fixed' ? Number(form.discountValue) || 0 : form.discountMode === 'percentage' ? formDiscountValue : 0,
      pointsToRedeem: form.discountMode === 'points' ? Number(form.pointsToRedeem) || 0 : undefined,
    };
    setSaving(true);
    let newlySavedSub: ClubSubscriptionListItem | null = null;
    try {
      if (subscriptionKind === 'private') {
        await api.post('/club-private-subscriptions/enrollments', {
          memberId: Number(form.memberId),
          packageId: Number(form.privatePackageId),
          trainerId: Number(form.privateTrainerId),
          branchId: effectiveBranchId,
          startDate: form.startDate,
          discountType: form.privateDiscountType.trim() || undefined,
          discountCodeId: discountPayload.discountCodeId ?? undefined,
          discountValue: discountPayload.discountValue,
          sessionsCount: form.sessionsCount ? Number(form.sessionsCount) : undefined,
          paidAmount: Number(form.paidAmount) || 0,
          gender: form.gender,
          ...split.payload,
        });
      } else if (subscriptionKind === 'special') {
        const specialPayload = {
          branchId: effectiveBranchId,
          memberId: Number(form.memberId),
          customerName: form.customerName || undefined,
          specialClassTypeId: Number(form.specialClassTypeId),
          sessionsCount: specialSessionsCount,
          validityDays: specialValidityDays,
          ...split.payload,
          guardianName: selectedMember?.guardianName || undefined,
          guardianPhone: selectedMember?.guardianPhone || undefined,
          employeeId,
          salesId: selectedMember?.salesId ?? undefined,
          isSpecial: true,
          ...discountPayload,
        };
        if (editSubId) {
          await api.put(`/club-subscriptions/${editSubId}`, {
            ...specialPayload,
            subscriptionStartDate: form.startDate,
          });
        } else {
          const { data: createdSpecial } = await api.post<ClubSubscriptionListItem>('/club-subscriptions', {
            ...specialPayload,
            startDate: form.startDate,
            paidAmount: form.paidAmount ? Number(form.paidAmount) : 0,
          });
          newlySavedSub = createdSpecial;
        }
      } else if (editSubId) {
        const selectedType = subTypes?.find((t) => t.id === Number(form.subscriptionTypeId));
        const datesChanged =
          !!editOriginal &&
          (editOriginal.startDate !== form.startDate || editOriginal.typeId !== form.subscriptionTypeId);
        const common = {
          branchId: effectiveBranchId,
          memberId: form.memberId ? Number(form.memberId) : undefined,
          customerName: form.customerName || undefined,
          subscriptionTypeId: form.subscriptionTypeId ? Number(form.subscriptionTypeId) : undefined,
          gender: form.gender,
          ...split.payload,
          guardianName: selectedMember?.guardianName || undefined,
          guardianPhone: selectedMember?.guardianPhone || undefined,
          employeeId,
          salesId: selectedMember?.salesId ?? undefined,
          isSpecial: form.isSpecial,
          isTimeBased: form.isTimeBased,
          timeFrom: form.isTimeBased ? form.timeFrom : undefined,
          timeTo: form.isTimeBased ? form.timeTo : undefined,
          ...discountPayload,
          isLinkedToSessions: form.isLinkedToSessions,
          sessionsCount: form.isLinkedToSessions && form.sessionsCount ? Number(form.sessionsCount) : undefined,
          // Always send start date and value so they save even when only those fields change
          subscriptionStartDate: form.startDate,
          subscriptionValue: Number(form.subscriptionValue) || undefined,
        };
        await api.put(`/club-subscriptions/${editSubId}`, {
          ...common,
          ...(datesChanged && selectedType
            ? {
                subscriptionEndDate: addDaysLocal(
                  form.startDate,
                  selectedType.days > 0 ? selectedType.days : selectedType.isLinkedToSessions ? 30 : 0,
                ),
                subscriptionType: selectedType.name,
                isLinkedToSessions: !!selectedType.isLinkedToSessions,
                sessionsCount: selectedType.isLinkedToSessions
                  ? (Number(form.sessionsCount) || selectedType.sessionsCount || undefined)
                  : undefined,
              }
            : {}),
        });
      } else {
        const { data: createdSub } = await api.post<ClubSubscriptionListItem>('/club-subscriptions', {
          branchId: effectiveBranchId,
          memberId: form.memberId ? Number(form.memberId) : undefined,
          customerName: form.customerName || undefined,
          subscriptionTypeId: form.subscriptionTypeId ? Number(form.subscriptionTypeId) : undefined,
          guardianName: selectedMember?.guardianName || undefined,
          guardianPhone: selectedMember?.guardianPhone || undefined,
          employeeId,
          salesId: selectedMember?.salesId ?? undefined,
          startDate: form.startDate,
          paidAmount: form.paidAmount ? Number(form.paidAmount) : 0,
          ...split.payload,
          ...discountPayload,
          isLinkedToSessions: form.isLinkedToSessions,
          sessionsCount: form.isLinkedToSessions && form.sessionsCount
            ? Number(form.sessionsCount)
            : undefined,
          isSpecial: filterSpecial || form.isSpecial,
        });
        newlySavedSub = createdSub;
      }
      toast.success(ct('common.success'));
      setDialogOpen(false);
      setEditSubId(null);
      invalidateAll();
      if (!editSubId && openCreateOnMount) navigate('/club/subscriptions', { replace: true });

    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const openPayment = (sub: ClubSubscriptionListItem) => {
    setSelectedId(sub.id);
    setPaymentSub(sub);
    setPaymentMaxRemaining(sub.remainingAmount);
    setPaymentAmount('');
    setInstallmentRows(singlePaymentRow((sub.paymentMethod as ClubPaymentMethod) || 'cash'));
    setPaymentOpen(true);
  };

  const pay = async () => {
    if (!selectedId) return;
    const amount = Number(paymentAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error(ct('subscriptions.invalidAmount'));
      return;
    }
    if (paymentMaxRemaining > 0 && amount > paymentMaxRemaining) {
      toast.error(ct('subscriptions.amountExceedsRemaining'));
      return;
    }
    const split = buildClubPaymentSplit(installmentRows, amount, ct);
    if ('error' in split) {
      toast.error(split.error);
      return;
    }
    setSaving(true);
    try {
      const { data: result } = await api.patch<{
        subscription: ClubSubscriptionListItem;
        paymentAmount: number;
      }>(`/club-subscriptions/${selectedId}/payment`, {
        paymentAmount: amount,
        ...split.payload,
      });
      if (result.subscription) {
        setPaymentSub(result.subscription);
        setPaymentMaxRemaining(result.subscription.remainingAmount);
      }
      void qc.invalidateQueries({ queryKey: ['club-receipts', 'by-subscription', selectedId] });
      toast.success(ct('common.success'));
      setPaymentOpen(false);
      setPaymentSub(null);
      invalidateAll();
      void refetchOutstanding();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const openWaiver = (sub: ClubSubscriptionListItem) => {
    setSelectedId(sub.id);
    setWaiverSub(sub);
    setWaiverForm({ amount: String(sub.remainingAmount), reason: '' });
    setWaiverOpen(true);
  };

  const waive = async () => {
    if (!selectedId || !waiverSub) return;
    const amount = Number(waiverForm.amount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > waiverSub.remainingAmount) {
      toast.error('أدخل مبلغ إعفاء صحيحًا لا يتجاوز المديونية');
      return;
    }
    setSaving(true);
    try {
      await api.post(`/club-subscriptions/${selectedId}/waiver`, {
        amount,
        reason: waiverForm.reason.trim() || undefined,
      });
      toast.success('تم تسجيل الإعفاء دون إنشاء أي حركة مالية');
      setWaiverOpen(false);
      setWaiverSub(null);
      invalidateAll();
      void refetchOutstanding();
      void refetchWaivers();
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setSaving(false);
    }
  };

  const openRenew = (row: ClubSubscriptionListItem) => {
    setSelectedId(row.id);
    const net = subscriptionNetValue(row);
    setRenewForm({ paidAmount: String(net) });
    setRenewRows(singlePaymentRow((row.paymentMethod as ClubPaymentMethod) || 'cash', net));
    setRenewOpen(true);
  };

  const renewSub = useMemo(
    () => (renewOpen && selectedId != null ? availableSubscriptions.find((s) => s.id === selectedId) ?? null : null),
    [renewOpen, selectedId, availableSubscriptions],
  );
  const renewNetValue = renewSub ? subscriptionNetValue(renewSub) : 0;
  const renewPaidNow = Math.max(0, Number(renewForm.paidAmount) || 0);
  const renewRemaining = Math.max(0, renewNetValue - renewPaidNow);

  const submitRenew = async () => {
    if (!selectedId) return;
    const trimmed = renewForm.paidAmount.trim();
    const body: {
      paidAmount?: number;
      paymentMethod?: string;
      payments?: { method: string; amount: number }[];
    } = {};
    if (trimmed) {
      const amount = Number(trimmed);
      if (!Number.isFinite(amount) || amount < 0) {
        toast.error(ct('subscriptions.invalidAmount'));
        return;
      }
      if (amount > renewNetValue) {
        toast.error(ct('subscriptions.amountExceedsRemaining'));
        return;
      }
      if (amount > 0) {
        const split = buildClubPaymentSplit(renewRows, amount, ct);
        if ('error' in split) {
          toast.error(split.error);
          return;
        }
        body.paidAmount = amount;
        Object.assign(body, split.payload);
      }
    }
    setSaving(true);
    try {
      await api.patch(`/club-subscriptions/${selectedId}/renew`, body);
      toast.success(ct('common.success'));
      setRenewOpen(false);
      invalidateAll();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const openFreeze = (id: number) => {
    setSelectedId(id);
    setEditingFreeze(false);
    setFreezeForm({ startDate: localToday(), endDate: localToday(), reason: '' });
    setFreezeOpen(true);
  };

  const openEditFreeze = (sub: ClubSubscriptionListItem) => {
    if (!sub.activeFreeze) return;
    setSelectedId(sub.id);
    setEditingFreeze(true);
    setFreezeForm({
      startDate: sub.activeFreeze.startDate,
      endDate: sub.activeFreeze.plannedEndDate ?? sub.activeFreeze.startDate,
      reason: sub.activeFreeze.reason ?? '',
    });
    setFreezeOpen(true);
  };

  const submitFreeze = async () => {
    if (!selectedId) return;
    setSaving(true);
    try {
      if (editingFreeze) {
        await api.patch(`/club-subscriptions/${selectedId}/freeze`, {
          freezeEndDate: freezeForm.endDate,
          reason: freezeForm.reason.trim() || undefined,
        });
      } else {
        await api.post(`/club-subscriptions/${selectedId}/freeze`, {
          freezeStartDate: freezeForm.startDate,
          freezeEndDate: freezeForm.endDate,
          reason: freezeForm.reason.trim() || undefined,
        });
      }
      toast.success(ct('common.success'));
      setFreezeOpen(false);
      invalidateAll();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const unfreeze = async (id: number) => {
    const ok = await confirm({ title: ct('subscriptions.unfreezeConfirm') });
    if (!ok) return;
    try {
      await api.post(`/club-subscriptions/${id}/unfreeze`, {});
      toast.success(ct('common.success'));
      invalidateAll();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  useEffect(() => {
    const state = location.state as { workspaceSubscriptionId?: number; workspaceAction?: WorkspaceSubscriptionAction } | null;
    const subscriptionId = state?.workspaceSubscriptionId;
    const workspaceAction = state?.workspaceAction;
    if (workspaceActionHandled.current || !subscriptionId || !workspaceAction) return;
    workspaceActionHandled.current = true;
    void (async () => {
      try {
        const { data: subscription } = await api.get<ClubSubscriptionListItem>(`/club-subscriptions/${subscriptionId}`);
        setWorkspaceSubscription(subscription);
        if (workspaceAction === 'renew') {
          openRenew(subscription);
        } else if (workspaceAction === 'freeze') {
          openFreeze(subscription.id);
        } else if (workspaceAction === 'unfreeze') {
          void unfreeze(subscription.id);
        } else if (workspaceAction === 'transfer') {
          setTab('transfers');
          setTransferForm({
            subscriptionId: String(subscription.id),
            toSubscriptionTypeId: '',
            toStartDate: localToday(),
            reason: '',
            additionalPaidAmount: '',
            additionalPaymentMethod: 'cash',
            refundPaymentMethod: 'cash',
          });
          setTransferPreview(null);
          setTransferPreviewError('');
          setTransferOpen(true);
        }
      } catch (error) {
        toast.error(apiError(error));
      }
    })();
  }, [location.key]);

  const remove = async (id: number) => {
    if (!canDeleteSubscriptions) return;
    const ok = await confirm({ title: ct('subscriptions.deleteConfirm'), variant: 'destructive', confirmLabel: ct('common.delete') });
    if (!ok) return;
    try {
      await api.delete(`/club-subscriptions/${id}`);
      toast.success(ct('common.success'));
      invalidateAll();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const saveTransfer = async () => {
    const subId = Number(transferForm.subscriptionId);
    const typeId = Number(transferForm.toSubscriptionTypeId);
    if (!subId || !typeId || !transferForm.toStartDate) {
      toast.error(ct('members.fillRequired'));
      return;
    }
    if (!transferPreview) {
      toast.error(transferPreviewError || 'تعذر حساب التحويل');
      return;
    }
    const additionalPaidAmount = Math.max(0, Number(transferForm.additionalPaidAmount) || 0);
    if (additionalPaidAmount > transferPreview.additionalDue) {
      toast.error('المبلغ المحصل أكبر من فرق التحويل المطلوب');
      return;
    }
    setSaving(true);
    try {
      await api.post('/club-subscription-transfers', {
        subscriptionId: subId,
        toSubscriptionTypeId: typeId,
        toStartDate: transferForm.toStartDate,
        reason: transferForm.reason.trim() || undefined,
        additionalPaidAmount,
        paymentMethod: additionalPaidAmount > 0 ? transferForm.additionalPaymentMethod : undefined,
        refundPaymentMethod: transferPreview.refundAmount > 0
          ? transferForm.refundPaymentMethod
          : undefined,
      });
      toast.success(
        transferPreview.refundAmount > 0
          ? `تم التحويل ورد ${formatMoney(transferPreview.refundAmount)} من الخزينة`
          : 'تم تحويل الخطة وإنشاء الاشتراك الجديد',
      );
      setTransferOpen(false);
      setTransferPreview(null);
      invalidateAll();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const subColumns = useMemo<ColumnDef<ClubSubscriptionListItem>[]>(
    () => [
      { id: 'index', header: ct('common.index'), size: 30, cell: ({ row }) => toArabicDigits((params.page - 1) * params.pageSize + row.index + 1) },
      { accessorKey: 'memberCode', header: 'كود العضو', size: 58, cell: ({ getValue }) => <span className="nums whitespace-nowrap">{(getValue() as string | null) || '—'}</span> },
      { accessorKey: 'customerName', header: ct('subscriptions.customerName'), size: 110, cell: ({ getValue }) => <span className="block truncate" title={(getValue() as string | null) ?? undefined}>{(getValue() as string | null) ?? '—'}</span> },
      { accessorKey: 'subscriptionType', header: ct('subscriptions.subType'), size: 100, cell: ({ getValue }) => <span className="block truncate" title={(getValue() as string | null) ?? undefined}>{(getValue() as string | null) ?? '—'}</span> },
      { accessorKey: 'registrationDate', header: 'تاريخ التسجيل', size: 70, cell: ({ getValue }) => <span className="nums whitespace-nowrap">{(getValue() as string | null)?.slice(0, 10) || '—'}</span> },
      { accessorKey: 'subscriptionStartDate', header: 'بداية الاشتراك', size: 70, cell: ({ getValue }) => <span className="nums whitespace-nowrap">{(getValue() as string | null)?.slice(0, 10) || '—'}</span> },
      { accessorKey: 'subscriptionEndDate', header: 'نهاية الاشتراك', size: 70, cell: ({ getValue }) => <span className="nums whitespace-nowrap">{(getValue() as string | null)?.slice(0, 10) || '—'}</span> },
      { accessorKey: 'branchName', header: 'الفرع', size: 72, cell: ({ getValue }) => <span className="block truncate" title={(getValue() as string | null) ?? undefined}>{(getValue() as string | null) ?? '—'}</span> },
      {
        id: 'category',
        header: 'الفئة',
        size: 48,
        cell: ({ row }) => row.original.gender === 'female' ? 'حريمي' : row.original.gender === 'male' ? 'رجالي' : '—',
      },
      {
        accessorKey: 'assignedStaffName',
        header: 'الموظف / الكابتن',
        size: 80,
        cell: ({ getValue }) => getValue() ? <span className="block truncate" title={getValue() as string}>{getValue() as string}</span> : <span className="text-muted-foreground">—</span>,
      },
      { accessorKey: 'subscriptionValue', header: 'سعر الاشتراك', size: 62, cell: ({ getValue }) => <span className="nums whitespace-nowrap">{formatMoney(getValue() as number)}</span> },
      { accessorKey: 'discountValue', header: 'الخصم', size: 56, cell: ({ getValue }) => <span className="nums whitespace-nowrap">{formatMoney(getValue() as number)}</span> },
      { accessorKey: 'paidAmount', header: 'المدفوع', size: 60, cell: ({ getValue }) => <span className="nums whitespace-nowrap text-emerald-700">{formatMoney(getValue() as number)}</span> },
      { accessorKey: 'receiptNumber', header: ct('subscriptions.receiptNumber'), size: 56, cell: ({ getValue }) => <span className="nums whitespace-nowrap">{(getValue() as string | null) || '—'}</span> },
      {
        accessorKey: 'createdByName',
        header: 'القائم بالإضافة',
        size: 80,
        cell: ({ getValue }) => getValue() ? <span className="block truncate" title={getValue() as string}>{getValue() as string}</span> : <span className="text-muted-foreground">—</span>,
      },
      {
        accessorKey: 'status',
        header: ct('common.status'),
        size: 68,
        cell: ({ row }) => {
          const status = row.original.status as string;
          if (status === 'frozen') {
            return <StatusBadge status="info" label={ct('subscriptions.frozen')} />;
          }
          const map: Record<string, 'active' | 'expired' | 'pending'> = {
            active: 'active',
            expired: 'expired',
            upcoming: 'pending',
          };
          return <StatusBadge status={map[status] ?? 'pending'} />;
        },
      },
      {
        id: 'actions',
        header: ct('common.actions'),
        size: 42,
        cell: ({ row }) => !canUpdateSubscriptions && !canDeleteSubscriptions && !canPrintSubscriptions && !canCreateRefund ? null : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreHorizontal /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {canUpdateSubscriptions ? (
                <DropdownMenuItem onSelect={() => afterMenuClose(() => void openEdit(row.original))}>
                  <Pencil className="size-4" /> {ct('subscriptions.editSub')}
                </DropdownMenuItem>
              ) : null}
              {canPrintSubscriptions ? (
                <DropdownMenuItem onSelect={() => afterMenuClose(() => setPrintSub(row.original))}>
                  <Printer className="size-4" /> {ct('subscriptions.printInvoice')}
                </DropdownMenuItem>
              ) : null}
              {canCreateRefund && row.original.memberId != null && row.original.status === 'active' && row.original.paidAmount > 0 ? (
                <DropdownMenuItem asChild>
                  <Link to={`/club/subscriptions/refunds?memberId=${row.original.memberId}&subscriptionId=${row.original.id}`}>
                    <Undo2 className="size-4" /> عمل مرتجع
                  </Link>
                </DropdownMenuItem>
              ) : null}
              {canUpdateSubscriptions && row.original.remainingAmount > 0 && (
                <>
                  <DropdownMenuItem onSelect={() => afterMenuClose(() => openPayment(row.original))}>
                    <CreditCard className="size-4" /> {ct('subscriptions.pay')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => afterMenuClose(() => openWaiver(row.original))}>
                    <ShieldOff className="size-4" /> إعفاء
                  </DropdownMenuItem>
                </>
              )}
              {canUpdateSubscriptions ? <DropdownMenuItem onSelect={() => afterMenuClose(() => openRenew(row.original))}><RefreshCw className="size-4" /> {ct('subscriptions.renew')}</DropdownMenuItem> : null}
              {canUpdateSubscriptions && ((row.original.status as string) === 'frozen' ? (
                <>
                  {row.original.activeFreeze ? <DropdownMenuItem onSelect={() => afterMenuClose(() => openEditFreeze(row.original))}><Snowflake className="size-4" /> تعديل الإيقاف</DropdownMenuItem> : null}
                  <DropdownMenuItem onSelect={() => void unfreeze(row.original.id)}><Sun className="size-4" /> {ct('subscriptions.unfreeze')}</DropdownMenuItem>
                </>
              ) : (
                (row.original.status as string) === 'active' && (
                  <DropdownMenuItem onSelect={() => afterMenuClose(() => openFreeze(row.original.id))}><Snowflake className="size-4" /> {ct('subscriptions.freeze')}</DropdownMenuItem>
                )
              ))}
              {canDeleteSubscriptions ? <DropdownMenuItem className="text-destructive" onSelect={() => void remove(row.original.id)}>{ct('common.delete')}</DropdownMenuItem> : null}
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ],
    [
      ct,
      params.page,
      params.pageSize,
      canUpdateSubscriptions,
      canDeleteSubscriptions,
      canPrintSubscriptions,
      canCreateRefund,
    ],
  );

  const frozenColumns = useMemo<ColumnDef<ClubSubscriptionListItem>[]>(
    () => [
      {
        id: 'index',
        header: ct('common.index'),
        cell: ({ row }) => toArabicDigits((params.page - 1) * params.pageSize + row.index + 1),
      },
      {
        accessorKey: 'subscriptionNumber',
        header: ct('subscriptions.subNumber'),
        cell: ({ getValue }) => <span className="nums font-mono">{getValue() as string}</span>,
      },
      { accessorKey: 'customerName', header: ct('subscriptions.customerName'), cell: ({ getValue }) => getValue() ?? '—' },
      { accessorKey: 'subscriptionType', header: ct('subscriptions.subType'), cell: ({ getValue }) => getValue() ?? '—' },
      {
        id: 'freezeStart',
        header: ui('بداية الإيقاف'),
        cell: ({ row }) => <span className="nums whitespace-nowrap">{toArabicDigits(row.original.activeFreeze?.startDate ?? '—')}</span>,
      },
      {
        id: 'subscriptionEnd',
        header: ui('نهاية الاشتراك الأصلية'),
        cell: ({ row }) => <span className="nums whitespace-nowrap">{toArabicDigits(row.original.subscriptionEndDate)}</span>,
      },
      {
        id: 'freezeReason',
        header: ui('سبب الإيقاف'),
        cell: ({ row }) => <span className="block min-w-40 max-w-72 whitespace-normal">{row.original.activeFreeze?.reason || ui('لم يُسجل سبب')}</span>,
      },
      {
        id: 'branch',
        header: ct('common.branch'),
        cell: ({ row }) => resolveBranchName(branches, row.original.branchId, user?.branch),
      },
      {
        id: 'createdBy',
        header: ui('القائم بالإيقاف'),
        cell: ({ row }) => row.original.activeFreeze?.createdByName ?? '—',
      },
      {
        id: 'status',
        header: ct('common.status'),
        cell: () => <StatusBadge status="info" label={ui('موقوف مؤقتًا')} />,
      },
      {
        id: 'actions',
        header: ct('common.actions'),
        cell: ({ row }) => canUpdateSubscriptions ? (
          <Button size="sm" variant="outline" onClick={() => void unfreeze(row.original.id)}>
            <Sun className="size-4" /> {ui('استئناف الاشتراك')}
          </Button>
        ) : null,
      },
    ],
    [branches, canUpdateSubscriptions, ct, params.page, params.pageSize, ui, user?.branch],
  );

  if (isError) {
    return (
      <div className="space-y-6">
        <PageHeader title={ui(pageTitle)} description={ct('subscriptions.description')} />
        <ErrorState message={apiError(error)} onRetry={() => void refetch()} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className={openCreateOnMount ? 'hidden' : undefined}>
      <PageHeader
        title={ui(pageTitle)}
        description={ct('subscriptions.description')}
        actions={showNewSubButton && (canCreateSubscriptions || canCreateRefund) ? (
          <>
            {canCreateRefund ? (
              <Button asChild variant="outline" className="border-primary/40 text-primary hover:bg-primary/10">
                <Link to="/club/subscriptions/refunds"><Undo2 className="size-4" /> عمل مرتجع اشتراك</Link>
              </Button>
            ) : null}
            {canCreateSubscriptions ? (
              <Button variant="brand" onClick={openCreate}><Plus className="size-4" /> {ct('subscriptions.newSub')}</Button>
            ) : null}
          </>
        ) : undefined}
      />

      {subscriptionOnboarding.visible && !dialogOpen && showNewSubButton && canCreateSubscriptions && (
        <MemberOnboardingGuide
          scope="subscriptions"
          onDismiss={subscriptionOnboarding.dismiss}
          onStart={() => {
            subscriptionOnboarding.dismiss();
            openCreate();
          }}
        />
      )}

      <div className="space-y-3">
        {canChangeStatsFilter && (
          <div className="flex flex-wrap items-center gap-2">
            {(
              [
                { key: 'today', label: 'اليوم' },
                { key: 'week', label: 'آخر ٧ أيام' },
                { key: 'month', label: 'الشهر' },
                { key: 'quarter', label: 'الربع' },
                { key: 'custom', label: 'مخصص' },
              ] as { key: StatsPreset; label: string }[]
            ).map(({ key, label }) => (
              <Button
                key={key}
                type="button"
                size="sm"
                variant={statsPreset === key ? 'default' : 'outline'}
                onClick={() => setStatsPreset(key)}
                className="h-8 text-xs"
              >
                {label}
              </Button>
            ))}
            {statsPreset === 'custom' && (
              <>
                <Input
                  type="date"
                  className="h-8 w-36 text-xs"
                  value={statsCustomFrom}
                  onChange={(e) => setStatsCustomFrom(e.target.value)}
                />
                <span className="text-xs text-muted-foreground">—</span>
                <Input
                  type="date"
                  className="h-8 w-36 text-xs"
                  value={statsCustomTo}
                  onChange={(e) => setStatsCustomTo(e.target.value)}
                />
              </>
            )}
          </div>
        )}
        {stats && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <ClubStatCard label={ct('subscriptions.totalSubs')} value={stats.total} />
            <ClubStatCard label={ct('common.active')} value={stats.active} />
            <ClubStatCard label={ct('subscriptions.totalPaid')} value={stats.totalPaid} />
            <ClubStatCard label={ct('subscriptions.totalRemaining')} value={stats.totalRemaining} />
          </div>
        )}
      </div>

      <Tabs
        value={tab}
        onValueChange={(v) => {
          setTab(v as ClubSubscriptionsView);
          setParams({ page: 1 });
        }}
      >
        {!singleView && !reportFocus && (
        <div className="flex justify-center">
        <TabsList className="flex h-auto max-w-full flex-wrap justify-center gap-1 rounded-xl border bg-muted/40 p-1.5 shadow-sm">
          <TabsTrigger value="subs"><CreditCard className="size-4" /> {ct('subscriptions.tabSubs')}</TabsTrigger>
          <TabsTrigger value="private"><ContactRound className="size-4" /> قائمة الاشتراكات الخاصة</TabsTrigger>
          <TabsTrigger value="receipts"><FileText className="size-4" /> {ct('subscriptions.tabReceipts')}</TabsTrigger>
          <TabsTrigger value="refunds"><Undo2 className="size-4" /> {ct('subscriptions.tabRefunds')}</TabsTrigger>
          <TabsTrigger value="transfers"><Repeat className="size-4" /> {ct('subscriptions.tabTransfers')}</TabsTrigger>
          <TabsTrigger value="waivers"><ShieldOff className="size-4" /> إجمالي الإعفاءات</TabsTrigger>
          <TabsTrigger value="frozen"><Snowflake className="size-4" /> {ui('الاشتراكات الموقوفة')}</TabsTrigger>
          <TabsTrigger value="reports">{ct('subscriptions.tabReports')}</TabsTrigger>
        </TabsList>
        </div>
        )}

        <TabsContent value="subs" className="space-y-4 pt-4">
          <FilterBar fields={filters} hideSearch />
          <DataTable
            columns={subColumns}
            data={data?.data ?? []}
            total={data?.total ?? 0}
            page={params.page}
            pageSize={params.pageSize}
            onPageChange={(page) => setParams({ page })}
            onPageSizeChange={(pageSize) => setParams({ pageSize, page: 1 })}
            search={params.search}
            onSearchChange={(search) => setParams({ search, page: 1 })}
            isLoading={isLoading}
            isError={isError}
            onRetry={() => void refetch()}
            emptyTitle={ct('subscriptions.emptySubs')}
            compact
          />
        </TabsContent>

        <TabsContent value="frozen" className="space-y-4 pt-4">
          <div className="rounded-xl border border-sky-200/70 bg-sky-50/50 p-4 text-sm text-sky-950 dark:border-sky-900 dark:bg-sky-950/20 dark:text-sky-100">
            {ui('تعرض هذه القائمة الاشتراكات الموقوفة مؤقتًا فقط. عند الاستئناف تُمدد نهاية الاشتراك بعدد أيام الإيقاف الفعلية للحفاظ على المدة المتبقية.')}
          </div>
          <FilterBar fields={filters.filter((field) => field.key !== 'status' && field.key !== 'subscriptionType' && field.key !== 'gender' && field.key !== 'kind')} preserveParams={['status']} />
          <DataTable
            columns={frozenColumns}
            data={data?.data ?? []}
            total={data?.total ?? 0}
            page={params.page}
            pageSize={params.pageSize}
            onPageChange={(page) => setParams({ page })}
            onPageSizeChange={(pageSize) => setParams({ pageSize, page: 1 })}
            search={params.search}
            onSearchChange={(search) => setParams({ search, page: 1 })}
            isLoading={isLoading}
            isError={isError}
            onRetry={() => void refetch()}
            emptyTitle={ui('لا توجد اشتراكات موقوفة')}
          />
        </TabsContent>

        <TabsContent value="receipts" className="space-y-4 pt-4">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setReceiptOpen(true)}>
              <Plus className="size-4" /> {ct('subscriptions.newReceipt')}
            </Button>
            <Button variant="outline" onClick={() => window.print()}><Printer className="size-4" /> طباعة النتائج</Button>
          </div>
          <div className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 xl:grid-cols-4 print:hidden">
            <select className={selectCls} value={receiptFilters.branchId} onChange={(e) => setReceiptFilters((f) => ({ ...f, branchId: e.target.value }))}>
              <option value="">كل الفروع</option>{branchOptions.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
            </select>
            <Input className="nums" inputMode="numeric" value={receiptFilters.memberId} onChange={(e) => setReceiptFilters((f) => ({ ...f, memberId: e.target.value }))} placeholder="رقم العضو (اختياري)" />
            <Input className="nums" type="date" value={receiptFilters.startDate} onChange={(e) => setReceiptFilters((f) => ({ ...f, startDate: e.target.value }))} />
            <Input className="nums" type="date" value={receiptFilters.endDate} onChange={(e) => setReceiptFilters((f) => ({ ...f, endDate: e.target.value }))} />
          </div>
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="p-3 text-start">{ct('subscriptions.receiptNumber')}</th>
                  <th className="p-3 text-start">{ct('common.customer')}</th>
                  <th className="p-3 text-start">كود العميل</th>
                  <th className="p-3 text-start">نوع الاشتراك</th>
                  <th className="p-3 text-start">{ct('common.branch')}</th>
                  <th className="p-3 text-start">{ct('subscriptions.receiptAmount')}</th>
                  <th className="p-3 text-start">{ct('subscriptions.paymentMethod')}</th>
                  <th className="p-3 text-start">{ct('subscriptions.receiptDate')}</th>
                  <th className="p-3 text-start">{ct('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {(receipts ?? []).length === 0 && (
                  <tr><td colSpan={9} className="p-6 text-center text-muted-foreground">{ct('common.noData')}</td></tr>
                )}
                {(receipts ?? []).map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="p-3 nums">{r.receiptNumber}</td>
                    <td className="p-3">{r.memberName}</td>
                    <td className="p-3 nums">{r.memberCode ?? '—'}</td>
                    <td className="p-3">{r.subscriptionType ?? '—'}</td>
                    <td className="p-3">{resolveBranchName(branches, r.branchId ?? 0, user?.branch)}</td>
                    <td className="p-3 nums">{toArabicDigits(r.amount)}</td>
                    <td className="p-3">{clubPaymentMethodsLabel(ct, r.payments, r.paymentMethod)}</td>
                    <td className="p-3 nums">{toArabicDigits(r.receiptDate)}</td>
                    <td className="p-3">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void printReceiptInvoice(r)}
                        disabled={!r.subscriptionId || !canPrintSubscriptions}
                        title={!r.subscriptionId ? 'لا يوجد اشتراك مرتبط بهذا الإيصال' : undefined}
                      >
                        <Printer className="size-4" /> {ct('subscriptions.printInvoice')}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="refunds" className="space-y-4 pt-4">
          <SubscriptionRefundsWorkspace />
        </TabsContent>

        <TabsContent value="transfers" className="space-y-4 pt-4">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => {
              setTransferForm({
                subscriptionId: '',
                toSubscriptionTypeId: '',
                toStartDate: localToday(),
                reason: '',
                additionalPaidAmount: '',
                additionalPaymentMethod: 'cash',
                refundPaymentMethod: 'cash',
              });
              setTransferPreview(null);
              setTransferPreviewError('');
              setTransferOpen(true);
            }}><Plus className="size-4" /> {ct('subscriptions.newTransfer')}</Button>
            {canRoute('/club/subscriptions/member-transfer') ? <Button asChild variant="brand"><Link to="/club/subscriptions/member-transfer"><ArrowRightLeft className="size-4" /> تحويل الاشتراك بين الأعضاء</Link></Button> : null}
          </div>
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="p-3 text-start">{ct('subscriptions.subscriptionId')}</th>
                  <th className="p-3 text-start">{ct('subscriptions.transferFrom')}</th>
                  <th className="p-3 text-start">{ct('subscriptions.transferTo')}</th>
                  <th className="p-3 text-start">{ct('subscriptions.transferDate')}</th>
                  <th className="p-3 text-start">الرصيد المحول</th>
                  <th className="p-3 text-start">عدد الحصص</th>
                  <th className="p-3 text-start">فرق محصل</th>
                  <th className="p-3 text-start">مردود من الخزينة</th>
                </tr>
              </thead>
              <tbody>
                {(transfers ?? []).length === 0 && (
                  <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">{ct('common.noData')}</td></tr>
                )}
                {(transfers ?? []).map((t) => (
                  <tr key={t.id} className="border-t">
                    <td className="p-3 nums">{toArabicDigits(t.subscription_id)}</td>
                    <td className="p-3">{t.from_subscription_type ?? '—'}</td>
                    <td className="p-3">{t.to_subscription_type}</td>
                    <td className="p-3 nums">{toArabicDigits(t.transfer_date)}</td>
                    <td className="p-3 nums">{formatMoney(Number(t.credit_amount ?? t.to_value))}</td>
                    <td className="p-3 nums">{t.destination_sessions_count == null ? '—' : toArabicDigits(t.destination_sessions_count)}</td>
                    <td className="p-3 nums">{formatMoney(Number(t.additional_paid_amount ?? 0))}</td>
                    <td className="p-3 nums">{formatMoney(Number(t.refund_amount ?? 0))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="waivers" className="space-y-4 pt-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <ClubStatCard label="عدد الإعفاءات" value={waivers?.summary.count ?? 0} />
            <ClubStatCard label="إجمالي الإعفاءات" value={formatMoney(waivers?.summary.totalAmount ?? 0)} />
          </div>
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-sm"><thead className="bg-muted/50"><tr><th className="p-3 text-start">رقم الاشتراك</th><th className="p-3 text-start">العميل</th><th className="p-3 text-start">المبلغ المعفى</th><th className="p-3 text-start">التاريخ</th><th className="p-3 text-start">السبب</th></tr></thead><tbody>{(waivers?.data ?? []).map((row) => <tr key={row.id} className="border-t"><td className="p-3 nums">{row.subscriptionNumber}</td><td className="p-3">{row.memberName ?? '—'}</td><td className="p-3 nums font-medium">{formatMoney(row.amount)}</td><td className="p-3 nums">{toArabicDigits(row.waiverDate)}</td><td className="p-3 text-muted-foreground">{row.reason ?? '—'}</td></tr>)}</tbody></table>
            {!waivers?.data.length ? <p className="py-10 text-center text-sm text-muted-foreground">لا توجد إعفاءات مسجلة.</p> : null}
          </div>
        </TabsContent>

        <TabsContent value="private" className="space-y-4 pt-4">
          <PrivateEnrollmentsList />
        </TabsContent>

        <TabsContent value="reports" className="space-y-6 pt-4">
          {reportFocus === 'expiring' && (
          <div>
            <h3 className="mb-3 font-medium">{ct('subscriptions.expiringReport')}</h3>
            <p className="mb-2 text-sm text-muted-foreground nums">
              {toArabicDigits(expiring?.total ?? (expiring?.data?.length ?? 0))} {ct('subscriptions.tabSubs')}
            </p>
            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="p-2 text-start">كود العضو</th>
                    <th className="p-2 text-start">{ct('subscriptions.customerName')}</th>
                    <th className="p-2 text-start">{ct('subscriptions.subType')}</th>
                    <th className="p-2 text-start">تاريخ البداية</th>
                    <th className="p-2 text-start">تاريخ النهاية</th>
                    <th className="p-2 text-start">{ct('subscriptions.endDate')}</th>
                  </tr>
                </thead>
                <tbody>
                  {(expiring?.data ?? []).length === 0 && (
                    <tr><td colSpan={3} className="p-6 text-center text-muted-foreground">{ct('common.noData')}</td></tr>
                  )}
                  {(expiring?.data ?? []).map((s) => (
                    <tr key={s.id} className="border-t">
                      <td className="p-2">{s.customerName ?? '—'}</td>
                      <td className="p-2">{s.subscriptionType ?? '—'}</td>
                      <td className="p-2 nums">
                        {toArabicDigits(s.subscriptionEndDate)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          )}
          {(!reportFocus || reportFocus === 'outstanding') && (
          <div>
            <h3 className="mb-3 font-medium">{ct('subscriptions.outstandingReport')}</h3>
            <p className="mb-2 text-sm text-muted-foreground nums">
              {toArabicDigits(outstanding?.summary?.count ?? 0)} {ct('subscriptions.tabSubs')}
            </p>
            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="p-2 text-start">{ct('subscriptions.customerName')}</th>
                    <th className="p-2 text-start">{ct('subscriptions.remaining')}</th>
                    <th className="p-2 text-start">{ct('common.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {(outstanding?.subscriptions ?? []).length === 0 && (
                    <tr><td colSpan={3} className="p-6 text-center text-muted-foreground">{ct('common.noData')}</td></tr>
                  )}
                  {(outstanding?.subscriptions ?? []).map((s) => (
                    <tr key={s.id} className="border-t">
                      <td className="p-2">{s.customerName ?? '—'}</td>
                      <td className="p-2 nums">{toArabicDigits(s.remainingAmount)}</td>
                      <td className="p-2">
                        <div className="flex flex-wrap gap-2">
                          {canUpdateSubscriptions ? <Button size="sm" variant="outline" onClick={() => openPayment(s)}>
                            <CreditCard className="size-4" /> {ct('subscriptions.pay')}
                          </Button> : null}
                          {canUpdateSubscriptions ? <Button size="sm" variant="outline" onClick={() => openWaiver(s)}>
                            <ShieldOff className="size-4" /> إعفاء
                          </Button> : null}
                          {canUpdateSubscriptions ? <Button size="sm" variant="ghost" onClick={() => void openEdit(s)}>
                            <Pencil className="size-4" /> {ct('common.edit')}
                          </Button> : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          )}
          {(!reportFocus || reportFocus === 'expired') && (
          <div>
            <h3 className="mb-3 font-medium">{ct('subscriptions.expiredReport')}</h3>
            <p className="mb-2 text-sm nums">{toArabicDigits(expired?.count ?? 0)}</p>
            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="p-2 text-start">كود العضو</th>
                    <th className="p-2 text-start">{ct('subscriptions.customerName')}</th>
                    <th className="p-2 text-start">{ct('subscriptions.subType')}</th>
                    <th className="p-2 text-start">الفرع</th>
                    <th className="p-2 text-start">الفئة</th>
                    <th className="p-2 text-start">من</th>
                    <th className="p-2 text-start">إلى</th>
                  </tr>
                </thead>
                <tbody>
                  {(expired?.data ?? []).map((s) => (
                    <tr key={s.id} className="border-t">
                      <td className="p-2 nums">{toArabicDigits(s.memberCode ?? '—')}</td>
                      <td className="p-2">{s.customerName}</td>
                      <td className="p-2">{s.subscriptionTypeName ?? s.subscriptionType ?? '—'}</td>
                      <td className="p-2">{s.branchName ?? '—'}</td>
                      <td className="p-2">{s.gender === 'female' ? 'حريمي' : s.gender === 'male' ? 'رجالي' : '—'}</td>
                      <td className="p-2 nums whitespace-nowrap">{toArabicDigits(s.subscriptionStartDate)}</td>
                      <td className="p-2 nums whitespace-nowrap">{toArabicDigits(s.subscriptionEndDate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {(expired?.count ?? 0) > 0 && (
              <div className="mt-3">
                <Pagination
                  page={expired?.page ?? expiredPage}
                  pageSize={expired?.pageSize ?? expiredPageSize}
                  total={expired?.count ?? 0}
                  onPageChange={setExpiredPage}
                />
              </div>
            )}
          </div>
          )}
        </TabsContent>
      </Tabs>
      </div>

      <Dialog open={dialogOpen} onOpenChange={(open) => {
        if (!open && openCreateOnMount) {
          navigate('/club/subscriptions', { replace: true });
          return;
        }
        setDialogOpen(open);
      }}>
        <DialogContent inline={!!openCreateOnMount} className={cn(FORM_DIALOG_CONTENT_CLASS, openCreateOnMount && 'min-h-screen w-full max-w-none rounded-none')} aria-describedby={undefined}>
          <FormDialogHeader>
            <DialogTitle>{editSubId ? ct('subscriptions.editSub') : ct('subscriptions.newSub')}</DialogTitle>
          </FormDialogHeader>

          <FormDialogBody>
            {subscriptionOnboarding.visible && !editSubId && (
              <MemberOnboardingGuide
                scope="subscriptions"
                compact
                onDismiss={subscriptionOnboarding.dismiss}
              />
            )}
            <section className="rounded-2xl border bg-muted/15 p-4 sm:p-5">
              <div className="mb-3">
                <p className="font-semibold">نوع الاشتراك</p>
                <p className="mt-1 text-sm text-muted-foreground">اختر المسار أولًا لإظهار الباقات أو الحصص المطلوبة.</p>
              </div>
              <div className="mx-auto grid w-full max-w-5xl gap-3 sm:grid-cols-3">
                {([
                  { value: 'package', label: 'اشتراك', description: 'الباقات العادية', icon: Package },
                  { value: 'private', label: 'اشتراكات برايفت', description: 'اشتراكات وحصص برايفت مع مدرب خاص', icon: ContactRound },
                  { value: 'sessions', label: 'حصص', description: 'باقات الحصص في الباقات والأسعار', icon: Dumbbell },
                ] as const).map((item) => {
                  const Icon = item.icon;
                  const selected = subscriptionKind === item.value;
                  return (
                    <button
                      key={item.value}
                      type="button"
                      disabled={!!editSubId}
                      onClick={() => selectSubscriptionKind(item.value)}
                      className={cn(
                        'flex min-h-24 items-center gap-3 rounded-xl border bg-background p-3 text-start transition-all',
                        selected ? 'border-primary bg-primary/5 ring-2 ring-primary/15' : 'hover:border-primary/40 hover:bg-muted/30',
                        editSubId && !selected && 'opacity-45',
                      )}
                    >
                      <span className={cn('flex size-11 shrink-0 items-center justify-center rounded-xl', selected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}><Icon className="size-5" /></span>
                      <span className="min-w-0"><b className="block text-sm">{item.label}</b><span className="mt-1 block text-xs leading-5 text-muted-foreground">{item.description}</span></span>
                    </button>
                  );
                })}
              </div>
            </section>

            <DialogFormSection title={ct('subscriptions.sectionCustomer')} icon={User}>
              <DialogFormGrid>
                <FieldWrapper label={ct('common.branch')} required>
                  <select
                    className={selectCls}
                    value={form.branchId || ''}
                    disabled={!!editSubId}
                    onChange={(event) => {
                      const branchId = Number(event.target.value) || 0;
                      setSelectedMember(null);
                      setForm((current) => ({
                        ...current,
                        branchId,
                        memberId: '',
                        customerName: '',
                        subscriptionTypeId: '',
                        privatePackageId: '',
                      }));
                    }}
                  >
                    <option value="">اختر الفرع</option>
                    {subscriptionBranchOptions.map((branch) => (
                      <option key={branch.value} value={branch.value}>{branch.label}</option>
                    ))}
                  </select>
                </FieldWrapper>
                <FieldWrapper label={ct('subscriptions.customerName')} required>
                  <MemberSearchCombobox
                    key={form.branchId}
                    selectedMember={selectedMember}
                    branchId={form.branchId}
                    forMembershipOperation
                    disabled={!form.branchId}
                    onSelect={(member) => {
                      setSelectedMember(member);
                      setForm((f) => ({
                        ...f,
                        memberId: String(member.id),
                        customerName: member.name,
                        gender: member.gender ?? f.gender,
                      }));
                    }}
                    onClear={() => {
                      setSelectedMember(null);
                      setForm((f) => ({ ...f, memberId: '', customerName: '' }));
                    }}
                  />
                </FieldWrapper>
                <FieldWrapper label="الفئة" required>
                  <select
                    className={selectCls}
                    value={form.gender}
                    onChange={(event) => setForm((current) => ({
                      ...current,
                      gender: event.target.value as 'male' | 'female',
                    }))}
                  >
                    <option value="male">رجالي</option>
                    <option value="female">حريمي</option>
                  </select>
                </FieldWrapper>
                {subscriptionKind === 'package' ? (
                  <FieldWrapper label="الموظف">
                    <Combobox
                      value={form.employeeId}
                      onValueChange={(val) => setForm((current) => ({ ...current, employeeId: val }))}
                      options={[
                        { value: '', label: 'بدون موظف' },
                        ...subscriptionEmployees.map((employee) => ({
                          value: String(employee.id),
                          label: `${employee.employee ?? `موظف #${employee.id}`}${employee.emp_code ? ` (${employee.emp_code})` : ''}`,
                        })),
                      ]}
                      placeholder="بدون موظف"
                      searchPlaceholder="ابحث باسم الموظف أو الكود…"
                      emptyText="لا يوجد موظف مطابق"
                      className="h-11"
                    />
                  </FieldWrapper>
                ) : subscriptionKind === 'private' ? (
                  <FieldWrapper label="الكابتن" required>
                    <Combobox
                      value={form.privateTrainerId}
                      onValueChange={(val) => setForm((current) => ({ ...current, privateTrainerId: val }))}
                      options={privateTrainers.map((trainer) => ({
                        value: String(trainer.id),
                        label: trainer.name + (trainer.specialization ? ` — ${trainer.specialization}` : ''),
                      }))}
                      placeholder="اختر الكابتن"
                      searchPlaceholder="ابحث باسم الكابتن أو التخصص…"
                      emptyText="لا يوجد كابتن مطابق"
                      className="h-11"
                    />
                  </FieldWrapper>
                ) : null}
              </DialogFormGrid>
              {selectedMember && (
                <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-sm">
                  <span className="font-medium">{selectedMember.name}</span>
                  <span className="nums text-muted-foreground font-mono ms-2">{selectedMember.memberCode}</span>
                  {selectedMember.phone && (
                    <span className="nums text-muted-foreground"> · {toArabicDigits(selectedMember.phone)}</span>
                  )}
                </div>
              )}
            </DialogFormSection>

            <div className="space-y-5">
            {subscriptionKind === 'special' ? (
              <DialogFormSection title="الاشتراك الخاص" icon={CalendarDays}>
                <DialogFormGrid>
                  <FieldWrapper label="نوع الاشتراك الخاص" required>
                    <select
                      className={selectCls}
                      value={form.specialClassTypeId}
                      onChange={(event) => {
                        const specialClassTypeId = event.target.value;
                        const selectedClass = specialClassTypes?.find(
                          (item) => item.id === Number(specialClassTypeId),
                        );
                        setForm((current) => ({
                          ...current,
                          specialClassTypeId,
                          sessionsCount: selectedClass
                            ? String(Math.max(1, selectedClass.subscriptionSessionsCount ?? 1))
                            : '',
                          validityDays: selectedClass ? '30' : '',
                          endDate: selectedClass ? addDaysLocal(current.startDate, 30) : '',
                          subscriptionValue: selectedClass
                            ? String(
                                selectedClass.singleSessionPrice *
                                  Math.max(1, selectedClass.subscriptionSessionsCount ?? 1),
                              )
                            : '',
                        }));
                      }}
                    >
                      <option value="">اختر الاشتراك الخاص</option>
                      {(specialClassTypes ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                    </select>
                  </FieldWrapper>
                  <FieldWrapper label={ct('subscriptions.startDate')} required>
                    <Input type="date" className="nums" dir="ltr" value={form.startDate} onChange={(event) => setForm((current) => ({ ...current, startDate: event.target.value }))} />
                  </FieldWrapper>
                  {(() => {
                    const item = specialClassTypes?.find((classType) => classType.id === Number(form.specialClassTypeId));
                    if (!item) return null;
                    return <>
                      <FieldWrapper label="عدد الحصص" required>
                        <Input
                          type="number"
                          min={1}
                          max={Math.max(1, item.subscriptionSessionsCount ?? 1)}
                          step={1}
                          className="nums"
                          value={form.sessionsCount}
                          onChange={(event) => {
                            const sessionsCount = event.target.value;
                            const parsedCount = Number(sessionsCount);
                            setForm((current) => ({
                              ...current,
                              sessionsCount,
                              subscriptionValue:
                                Number.isInteger(parsedCount) && parsedCount > 0
                                  ? String(item.singleSessionPrice * parsedCount)
                                  : '',
                            }));
                          }}
                        />
                      </FieldWrapper>
                      <FieldWrapper label="مدة صلاحية الاشتراك (يوم)" required>
                        <Input
                          type="number"
                          min={1}
                          max={3650}
                          step={1}
                          className="nums"
                          value={form.validityDays}
                          onChange={(event) => {
                            const validityDays = event.target.value;
                            const parsedDays = Number(validityDays);
                            setForm((current) => ({
                              ...current,
                              validityDays,
                              endDate:
                                Number.isInteger(parsedDays) && parsedDays > 0
                                  ? addDaysLocal(current.startDate, parsedDays)
                                  : '',
                            }));
                          }}
                        />
                      </FieldWrapper>
                      <FieldWrapper label={ct('subscriptions.endDate')}><Input type="date" className="nums bg-muted" dir="ltr" value={form.endDate} readOnly /></FieldWrapper>
                      <FieldWrapper label="سعر الحصة"><Input className="nums bg-muted" value={toArabicDigits(item.singleSessionPrice)} readOnly /></FieldWrapper>
                    </>;
                  })()}
                </DialogFormGrid>
                {(() => {
                  const item = specialClassTypes?.find((classType) => classType.id === Number(form.specialClassTypeId));
                  if (!item) return null;
                  const days = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
                  return (
                    <div className="mt-4 rounded-xl border border-primary/20 bg-primary/5 p-4">
                      <p className="font-semibold">جدول المدربين المتاح للكلاس</p>
                      <p className="mt-1 text-xs text-muted-foreground">لا يلزم حجز موعد. عند حضور العضو، يطابق الاستقبال الموعد الحالي تلقائيًا ويسجل الحضور مع المدرب.</p>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        {(item.trainerScheduleSlots ?? []).map((slot, index) => {
                          const trainer = item.eligibleTrainers.find((candidate) => candidate.id === slot.trainerId);
                          return <div key={slot.id ?? `${slot.trainerId}-${index}`} className="rounded-lg border bg-background px-3 py-2 text-sm"><b>{trainer?.name ?? 'مدرب'}</b><span className="text-muted-foreground"> · {days[slot.weekday]} · <span className="nums">{formatTime(slot.startTime)} - {formatTime(slot.endTime)}</span></span></div>;
                        })}
                      </div>
                    </div>
                  );
                })()}
              </DialogFormSection>
            ) : subscriptionKind === 'private' ? (
              <DialogFormSection title="اشتراك برايفت مع مدرب خاص" icon={ContactRound}>
                <DialogFormGrid>
                  <FieldWrapper label="نوع الاشتراك" required className="sm:col-span-2">
                    <Combobox
                      value={form.privatePackageId}
                      onValueChange={(privatePackageId) => setForm((current) => ({ ...current, privatePackageId }))}
                      options={privatePackageOptions}
                      placeholder="اختر اشتراك البرايفت"
                      searchPlaceholder="ابحث باسم الاشتراك أو السعر…"
                      emptyText="لا توجد اشتراكات برايفت مطابقة"
                      aria-label="نوع اشتراك البرايفت"
                      className="h-11"
                    />
                    {selectedMember && visiblePrivatePackages.length === 0 ? (
                      <p className="mt-2 text-xs text-destructive">
                        لا توجد باقات برايفت مفعلة لفرع هذا العضو. أضف الفرع للباقة من تبويب اشتراكات برايفت أولًا.
                      </p>
                    ) : null}
                  </FieldWrapper>
                  <FieldWrapper label="مدة الاشتراك من" required><Input type="date" className="nums" dir="ltr" value={form.startDate} onChange={(event) => setForm((current) => ({ ...current, startDate: event.target.value }))} /></FieldWrapper>
                  <FieldWrapper label="مدة الاشتراك إلى"><Input type="date" className="nums bg-muted" dir="ltr" value={form.endDate} readOnly /></FieldWrapper>
                  <FieldWrapper label="قيمة الاشتراك"><Input className="nums bg-muted" value={form.subscriptionValue} readOnly /></FieldWrapper>
                  {(() => {
                    const selectedPackage = privatePackages.find((item) => item.id === Number(form.privatePackageId));
                    if (selectedPackage?.kind !== 'sessions') return null;
                    const max = Math.max(1, selectedPackage.sessionsCount ?? 1);
                    return (
                      <FieldWrapper label="عدد الحصص" required>
                        <Input
                          type="number"
                          min={1}
                          max={max}
                          step={1}
                          className="nums"
                          value={form.sessionsCount}
                          onChange={(event) => {
                            const sessionsCount = event.target.value;
                            const count = Number(sessionsCount);
                            setForm((current) => ({
                              ...current,
                              sessionsCount,
                              subscriptionValue:
                                Number.isInteger(count) && count >= 1 && count <= max
                                  ? String(Math.round((selectedPackage.price / max) * count * 100) / 100)
                                  : '',
                            }));
                          }}
                        />
                        <p className="mt-1 text-xs text-muted-foreground">
                          الحد الأقصى {toArabicDigits(max)} حصة · سعر الحصة {formatMoney(selectedPackage.price / max)}
                        </p>
                      </FieldWrapper>
                    );
                  })()}
                </DialogFormGrid>
              </DialogFormSection>
            ) : (
            <DialogFormSection title={ct('subscriptions.sectionSubscription')} icon={CalendarDays}>
              <DialogFormGrid>
                <FieldWrapper label={ct('subscriptions.subType')} required>
                  <Combobox
                    value={form.subscriptionTypeId}
                    onValueChange={(typeId) => {
                      const selectedType = subTypes?.find((t) => t.id === Number(typeId));
                      const isStudentSub =
                        selectedType?.isForStudents ||
                        (selectedType?.name ?? '').includes('طلب');
                      if (isStudentSub) {
                        const dob = selectedMember?.dateOfBirth;
                        if (!dob) {
                          toast.error('لا يمكن تحديد عمر العضو — يرجى التأكد من إدخال تاريخ الميلاد');
                          return;
                        }
                        const dobDate = new Date(dob);
                        const today = new Date();
                        let age = today.getFullYear() - dobDate.getFullYear();
                        const monthDiff = today.getMonth() - dobDate.getMonth();
                        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dobDate.getDate())) {
                          age--;
                        }
                        if (age > 23) {
                          toast.error('أنت لست طالباً — هذا الاشتراك خاص بالطلبة (23 سنة أو أقل)');
                          return;
                        }
                      }
                      setForm((f) => ({ ...f, subscriptionTypeId: typeId }));
                    }}
                    options={(subTypes ?? []).map((t) => ({
                      value: String(t.id),
                      label: t.name,
                      description: t.price ? `${t.price.toLocaleString('ar-EG')} ج.م` : undefined,
                    }))}
                    placeholder="اختر نوع الاشتراك"
                    searchPlaceholder="ابحث باسم الاشتراك أو السعر…"
                    emptyText="لا يوجد اشتراك مطابق"
                    className="h-11"
                  />
                </FieldWrapper>
                <FieldWrapper label={ct('subscriptions.startDate')} required>
                  <Input type="date" className="nums" dir="ltr" value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} />
                </FieldWrapper>
                {(() => {
                  const selectedType = subTypes?.find((t) => t.id === Number(form.subscriptionTypeId));
                  if (!selectedType) return null;
                  return (
                    <>
                      {selectedType.isLinkedToSessions ? (
                        <FieldWrapper label={ct('packages.sessionsCount')}>
                          <Input
                            type="number"
                            min={1}
                            max={Math.max(1, selectedType.sessionsCount ?? 1)}
                            step={1}
                            className="nums"
                            value={form.sessionsCount}
                            onChange={(event) => {
                              const sessionsCount = event.target.value;
                              const count = Number(sessionsCount);
                              const max = Math.max(1, selectedType.sessionsCount ?? 1);
                              setForm((current) => ({
                                ...current,
                                sessionsCount,
                                subscriptionValue:
                                  Number.isInteger(count) && count >= 1 && count <= max
                                    ? String(
                                        resolveSessionMatrixPrice({
                                          packagePrice: selectedType.price,
                                          maxSessions: max,
                                          selectedSessions: count,
                                          matrix: selectedType.sessionPrices,
                                        }),
                                      )
                                    : '',
                              }));
                            }}
                          />
                          <p className="mt-1 text-xs text-muted-foreground">
                            الحد الأقصى {toArabicDigits(selectedType.sessionsCount ?? 1)} حصة
                          </p>
                        </FieldWrapper>
                      ) : null}
                      <FieldWrapper label={ct('subscriptions.endDate')}>
                        <Input type="date" className="nums bg-muted" dir="ltr" value={form.endDate} readOnly />
                      </FieldWrapper>
                    </>
                  );
                })()}
              </DialogFormGrid>
            </DialogFormSection>
            )}

              <div>
                <DialogFormSection title="كود خصم أو قيمة خصم" icon={Sparkles}>
                  <SubscriptionDiscountFields
                    grossValue={Number(form.subscriptionValue) || 0}
                    codes={memberDiscountGrants.map((grant) => ({ id: grant.id, code: grant.code ?? '', percentage: grant.percentage, isActive: true, usageCount: 0, createdAt: '', updatedAt: '' }))}
                    mode={form.discountMode}
                    codeId={form.memberDiscountGrantId}
                    fixedValue={form.discountValue}
                    pointsToRedeem={form.pointsToRedeem}
                    pointsBalance={pointsAccount?.points ?? 0}
                    pointsConversion={pointsAccount?.conversion ?? null}
                    onChange={(discount) => setForm((current) => ({
                      ...current,
                      discountMode: discount.mode,
                      discountCodeId: '',
                      memberDiscountGrantId: discount.codeId,
                      discountValue: discount.fixedValue,
                      pointsToRedeem: discount.pointsToRedeem,
                      discountEnabled: discount.mode !== 'none',
                    }))}
                  />
                </DialogFormSection>
              <div>

            <DialogFormSection title={ct('subscriptions.sectionPayment')} icon={Wallet}>
              {!editSubId ? (
                <div className="mb-4 rounded-2xl border border-primary/20 bg-primary/[0.04] p-4">
                  <p className="mb-3 text-sm font-semibold">ملخص الاشتراك قبل التحصيل</p>
                  <DialogFormSummary
                    items={[
                      {
                        label: ct('subscriptions.subType'),
                        value:
                          subscriptionKind === 'special'
                            ? specialClassTypes?.find((t) => t.id === Number(form.specialClassTypeId))?.name ?? '—'
                            : subscriptionKind === 'private'
                              ? privatePackages.find((p) => p.id === Number(form.privatePackageId))?.name ?? '—'
                              : subTypes?.find((t) => t.id === Number(form.subscriptionTypeId))?.name ?? '—',
                      },
                      ...(form.isLinkedToSessions || subscriptionKind === 'special' || Number(form.sessionsCount) > 0
                        ? [{ label: ct('packages.sessionsCount'), value: toArabicDigits(form.sessionsCount || 0) }]
                        : form.endDate
                          ? [{
                              label: ct('packages.subscriptionDays'),
                              value: toArabicDigits(
                                Math.max(
                                  0,
                                  Math.round(
                                    (new Date(form.endDate).getTime() - new Date(form.startDate).getTime()) /
                                      86400000,
                                  ),
                                ),
                              ),
                            }]
                          : []),
                      { label: ct('subscriptions.startDate'), value: form.startDate || '—' },
                      { label: ct('subscriptions.endDate'), value: form.endDate || '—' },
                      { label: ct('subscriptions.value'), value: formatMoney(Number(form.subscriptionValue) || 0) },
                      ...(formDiscountValue > 0
                        ? [{ label: 'الخصم', value: formatMoney(formDiscountValue), accent: 'warning' as const }]
                        : []),
                      { label: 'صافي المستحق', value: formatMoney(formNetValue), accent: 'success' as const },
                    ]}
                  />
                </div>
              ) : null}
              <div className="grid gap-4 md:grid-cols-3">
                {editSubId ? (
                  <FieldWrapper label={ct('subscriptions.paymentMethod')} className="md:col-span-2">
                    <ClubPaymentMethodSelect
                      value={paymentRows[0]?.method ?? 'cash'}
                      onChange={(method) => setPaymentRows(singlePaymentRow(method))}
                    />
                  </FieldWrapper>
                ) : (
                  <div className="md:col-span-2">
                    <ClubPaymentSplitFields
                      total={formNetValue}
                      rows={paymentRows}
                      allowMultipleMethods={false}
                      onChange={(rows) => {
                        setPaidAmountEdited(true);
                        setPaymentRows(rows);
                      }}
                      onTotalChange={(paidAmount) =>
                        setForm((current) => ({ ...current, paidAmount: String(paidAmount) }))
                      }
                    />
                  </div>
                )}
                <FieldWrapper label={ct('subscriptions.receiptNumber')}>
                  <Input
                    className="nums"
                    dir="ltr"
                    value={editSubId ? receiptNumber : 'يُحدد تلقائيًا عند الحفظ'}
                    disabled
                  />
                </FieldWrapper>
                </div>
              {editSubId ? (
                <SubscriptionPaymentPanel
                  value={formNetValue}
                  paid={Number(form.paidAmount) || 0}
                  remaining={editRemainingAmount ?? 0}
                  receipts={subscriptionReceipts}
                  loading={loadingSubscriptionReceipts}
                />
              ) : (
                <DialogFormSummary
                  items={[
                    { label: ct('subscriptions.value'), value: toArabicDigits(form.subscriptionValue || 0) },
                    { label: 'قيمة الخصم', value: toArabicDigits(formDiscountValue) },
                    { label: 'صافي الاشتراك', value: toArabicDigits(formNetValue) },
                    {
                      label: ct('subscriptions.paid'),
                      value: toArabicDigits(form.paidAmount || 0),
                      accent: 'success',
                    },
                    {
                      label: ct('subscriptions.remaining'),
                      value: toArabicDigits(formRemaining),
                      accent: 'warning',
                    },
                  ]}
                />
              )}
            </DialogFormSection>
              </div>
            </div>
            </div>
          </FormDialogBody>

          <FormDialogFooter>
            <Button variant="outline" onClick={() => openCreateOnMount ? navigate('/club/subscriptions', { replace: true }) : setDialogOpen(false)}>{ct('common.cancel')}</Button>
            {(editSubId ? canUpdateSubscriptions : canCreateSubscriptions) ? (
              <Button variant="brand" onClick={() => void saveSub()} disabled={saving}>{saving ? ct('common.saving') : ct('common.save')}</Button>
            ) : null}
          </FormDialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={paymentOpen}
        onOpenChange={(open) => {
          setPaymentOpen(open);
          if (!open) setPaymentSub(null);
        }}
      >
        <DialogContent size="lg" aria-describedby={undefined}>
          <DialogHeader><DialogTitle>{ct('subscriptions.paymentTitle')}</DialogTitle></DialogHeader>
          {paymentSub && (
            <SubscriptionPaymentPanel
              value={subscriptionNetValue(paymentSub)}
              paid={
                paymentSub.settledAmount ??
                paymentSub.paidAmount + (paymentSub.transferredCreditAmount ?? 0)
              }
              remaining={paymentMaxRemaining}
              receipts={subscriptionReceipts}
              loading={loadingSubscriptionReceipts}
            />
          )}
          <ClubPaymentSplitFields
            total={paymentMaxRemaining}
            rows={installmentRows}
            allowMultipleMethods={false}
            onChange={setInstallmentRows}
            onTotalChange={(amount) => setPaymentAmount(String(amount))}
          />
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setPaymentOpen(false)}>{ct('common.cancel')}</Button>
            <Button variant="brand" onClick={() => void pay()} disabled={saving}>{ct('subscriptions.pay')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={waiverOpen} onOpenChange={(open) => { setWaiverOpen(open); if (!open) setWaiverSub(null); }}>
        <DialogContent size="md" aria-describedby={undefined}>
          <DialogHeader><DialogTitle>إعفاء من المديونية</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
              <p className="font-medium">هذا الإجراء لا يُعتبر سدادًا.</p>
              <p className="mt-1 text-muted-foreground">سيتم تخفيض المديونية فقط، بدون إيصال أو إيراد أو حركة خزينة أو قيد محاسبي.</p>
            </div>
            {waiverSub ? <DialogFormSummary items={[{ label: 'العميل', value: waiverSub.customerName ?? '—' }, { label: 'المديونية الحالية', value: formatMoney(waiverSub.remainingAmount), accent: 'warning' }]} /> : null}
            <FieldWrapper label="المبلغ المعفى" required><Input type="number" min={0.01} max={waiverSub?.remainingAmount} step="0.01" className="nums text-lg" value={waiverForm.amount} onChange={(event) => setWaiverForm((current) => ({ ...current, amount: event.target.value }))} /></FieldWrapper>
            <FieldWrapper label="سبب الإعفاء"><Input value={waiverForm.reason} onChange={(event) => setWaiverForm((current) => ({ ...current, reason: event.target.value }))} placeholder="اختياري" /></FieldWrapper>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setWaiverOpen(false)}>إلغاء</Button><Button variant="brand" onClick={() => void waive()} disabled={saving}><ShieldOff className="size-4" /> تأكيد الإعفاء</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
        <DialogContent size="lg" aria-describedby={undefined}>
          <DialogHeader><DialogTitle>{ct('subscriptions.newTransfer')}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <DialogFormGrid>
              <FieldWrapper label="الاشتراك الحالي" required>
                <select
                  className={selectCls}
                  value={transferForm.subscriptionId}
                  onChange={(event) => setTransferForm((current) => ({
                    ...current,
                    subscriptionId: event.target.value,
                    toSubscriptionTypeId: '',
                  }))}
                >
                  <option value="">اختر الاشتراك النشط</option>
                  {availableSubscriptions.filter((item) => item.status === 'active').map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.subscriptionNumber} — {item.customerName} — {item.subscriptionType}
                    </option>
                  ))}
                </select>
              </FieldWrapper>
              <FieldWrapper label={ct('subscriptions.transferToType')} required>
                {(() => {
                  const source = transferSource;
                  if (!transferForm.subscriptionId || !source) {
                    return (
                      <p className="rounded-xl border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">
                        اختر الاشتراك الحالي أولاً
                      </p>
                    );
                  }
                  return (
                    <TransferPlanPicker
                      types={transferAvailableSubTypes}
                      sourceIsSessions={Boolean(source.isLinkedToSessions)}
                      excludeTypeId={source.subscriptionTypeId}
                      value={transferForm.toSubscriptionTypeId}
                      onChange={(typeId) => setTransferForm((current) => ({
                        ...current,
                        toSubscriptionTypeId: typeId,
                      }))}
                    />
                  );
                })()}
              </FieldWrapper>
              <FieldWrapper label="تاريخ التحويل وبداية الخطة الجديدة" required>
                <Input type="date" value={transferForm.toStartDate} onChange={(event) => setTransferForm((current) => ({ ...current, toStartDate: event.target.value }))} />
              </FieldWrapper>
              <FieldWrapper label="سبب التحويل">
                <Input value={transferForm.reason} onChange={(event) => setTransferForm((current) => ({ ...current, reason: event.target.value }))} placeholder="اختياري" />
              </FieldWrapper>
            </DialogFormGrid>

            {transferPreviewError ? (
              <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                {transferPreviewError}
              </p>
            ) : null}

            {transferPreview ? (
              <div className="space-y-4 rounded-2xl border bg-muted/15 p-4">
                <DialogFormSummary
                  items={[
                    { label: 'المستهلك من الخطة القديمة', value: formatMoney(transferPreview.consumedValue) },
                    { label: 'الرصيد القابل للتحويل', value: formatMoney(transferPreview.transferableCredit), accent: 'success' },
                    ...(transferPreview.targetSessionsCount != null
                      ? [{ label: 'الحصص الناتجة', value: `${toArabicDigits(transferPreview.targetSessionsCount)} حصة` }]
                      : [{ label: 'قيمة الخطة الجديدة', value: formatMoney(transferPreview.targetValue) }]),
                    { label: 'الرصيد المستخدم', value: formatMoney(transferPreview.creditApplied) },
                    { label: 'فرق مطلوب تحصيله', value: formatMoney(transferPreview.additionalDue), accent: 'warning' },
                    { label: 'مبلغ يُرد من الخزينة', value: formatMoney(transferPreview.refundAmount), accent: transferPreview.refundAmount > 0 ? 'warning' : undefined },
                  ]}
                />
                {transferPreview.targetSessionsCount != null ? (
                  <p className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm">
                    الرصيد {formatMoney(transferPreview.transferableCredit)} يساوي{' '}
                    <b>{toArabicDigits(transferPreview.targetSessionsCount)} حصة</b>
                    {transferPreview.targetUnitPrice != null ? ` بسعر ${formatMoney(transferPreview.targetUnitPrice)} للحصة` : ''}
                    {transferPreview.refundAmount > 0 ? `، ويتبقى ${formatMoney(transferPreview.refundAmount)} تُرد فعليًا من الخزينة.` : '.'}
                  </p>
                ) : null}
                {transferPreview.additionalDue > 0 ? (
                  <DialogFormGrid>
                    <FieldWrapper label="المبلغ المحصل الآن">
                      <Input type="number" min={0} max={transferPreview.additionalDue} step="0.01" className="nums" value={transferForm.additionalPaidAmount} onChange={(event) => setTransferForm((current) => ({ ...current, additionalPaidAmount: event.target.value }))} />
                    </FieldWrapper>
                    <FieldWrapper label="طريقة تحصيل الفرق">
                      <ClubPaymentMethodSelect value={transferForm.additionalPaymentMethod} onChange={(method) => setTransferForm((current) => ({ ...current, additionalPaymentMethod: method }))} />
                    </FieldWrapper>
                  </DialogFormGrid>
                ) : null}
                {transferPreview.refundAmount > 0 ? (
                  <FieldWrapper label="طريقة رد المتبقي من الخزينة">
                    <ClubPaymentMethodSelect value={transferForm.refundPaymentMethod} onChange={(method) => setTransferForm((current) => ({ ...current, refundPaymentMethod: method }))} />
                  </FieldWrapper>
                ) : null}
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransferOpen(false)}>{ct('common.cancel')}</Button>
            <Button variant="brand" onClick={() => void saveTransfer()} disabled={saving || !transferPreview}>{ct('common.save')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SubscriptionReceiptCreateDialog open={receiptOpen} onOpenChange={setReceiptOpen} />

      <Dialog open={freezeOpen} onOpenChange={setFreezeOpen}>
        <DialogContent size="sm" aria-describedby={undefined}>
          <DialogHeader><DialogTitle>{editingFreeze ? 'تعديل الإيقاف' : ct('subscriptions.freezeTitle')}</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <p className="text-sm text-muted-foreground">{ct('subscriptions.freezePreserveHint')}</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2"><Label>بداية الإيقاف</Label><Input type="date" className="nums" disabled={editingFreeze} value={freezeForm.startDate} onChange={(e) => setFreezeForm((f) => ({ ...f, startDate: e.target.value }))} /></div>
              <div className="grid gap-2"><Label>نهاية الإيقاف</Label><Input type="date" className="nums" min={freezeForm.startDate} value={freezeForm.endDate} onChange={(e) => setFreezeForm((f) => ({ ...f, endDate: e.target.value }))} /></div>
            </div>
            <div className="grid gap-2">
              <Label>{ct('subscriptions.freezeReason')}</Label>
              <Input
                value={freezeForm.reason}
                onChange={(e) => setFreezeForm((f) => ({ ...f, reason: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFreezeOpen(false)}>{ct('common.cancel')}</Button>
            <Button variant="brand" onClick={() => void submitFreeze()} disabled={saving}>
              {saving ? ct('common.saving') : editingFreeze ? 'حفظ التعديل' : ct('subscriptions.freeze')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={renewOpen} onOpenChange={setRenewOpen}>
        <DialogContent size="md" aria-describedby={undefined}>
          <DialogHeader><DialogTitle>{ct('subscriptions.renewTitle')}</DialogTitle></DialogHeader>
          <div className="grid gap-4">
            {renewSub && (
              <DialogFormSummary
                items={[
                  {
                    label: ct('subscriptions.value'),
                    value: formatMoney(renewNetValue),
                  },
                  {
                    label: ct('subscriptions.paid'),
                    value: formatMoney(renewPaidNow),
                    accent: 'success',
                  },
                  {
                    label: ct('subscriptions.remaining'),
                    value: formatMoney(renewRemaining),
                    accent: 'warning',
                  },
                ]}
              />
            )}
            <ClubPaymentSplitFields
              total={renewNetValue}
              rows={renewRows}
              allowMultipleMethods={false}
              onChange={setRenewRows}
              onTotalChange={(paidAmount) =>
                setRenewForm({ paidAmount: String(paidAmount) })
              }
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenewOpen(false)}>{ct('common.cancel')}</Button>
            <Button variant="brand" onClick={() => void submitRenew()} disabled={saving}>
              {saving ? ct('common.saving') : ct('subscriptions.renew')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SubscriptionInvoicePrint
        open={!!printSub}
        onOpenChange={(open) => !open && setPrintSub(null)}
        subscription={printSub}
        receipts={printSub ? subscriptionReceipts : []}
      />
    </div>
  );
}
