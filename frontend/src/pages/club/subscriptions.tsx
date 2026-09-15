import type { ColumnDef } from '@tanstack/react-table';
import { Link, useLocation } from 'react-router-dom';
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
import { useEffect, useMemo, useState } from 'react';
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
  subscriptionId?: number | null;
  lockerSubscriptionId?: number | null;
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
  const { can } = usePermission();
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
  const { user } = useAuth();
  const subscriptionOnboarding = useFirstVisitGuide('subscriptions', user?.sub);
  const qc = useQueryClient();
  const location = useLocation();
  const initialFilters: Record<string, string> | undefined = filterSpecial
    ? { isSpecial: 'true' }
    : filterTimeBased
      ? { isTimeBased: 'true' }
      : undefined;
  const [tab, setTab] = useState<ClubSubscriptionsView>(
    singleView ?? (reportFocus ? 'reports' : 'subs'),
  );
  const { params, setParams } = useListQuery(initialFilters ? { filters: initialFilters } : undefined);
  const subscriptionListParams = useMemo(
    () => tab === 'frozen'
      ? { ...params, filters: { ...params.filters, status: 'frozen' } }
      : params,
    [params, tab],
  );
  const { data, isLoading, isError, error, refetch } = usePaginatedList<ClubSubscriptionListItem>(
    'club-subscriptions',
    subscriptionListParams,
  );
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
  const [walkIn, setWalkIn] = useState(false);
  const [selectedMember, setSelectedMember] = useState<ClubMemberListItem | null>(null);
  const visiblePrivatePackages = useMemo(() => {
    const memberBranchId = selectedMember?.branchId;
    if (!memberBranchId) return privatePackages;
    return privatePackages.filter((item) => item.branchIds.includes(memberBranchId));
  }, [privatePackages, selectedMember?.branchId]);
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
    queryKey: ['club-subscriptions', 'statistics', filterSpecial ? 'special' : 'all'],
    queryFn: async () => {
      const { data: s } = await api.get<ClubSubscriptionStatistics>('/club-subscriptions/statistics', {
        params: filterSpecial ? { isSpecial: 'true' } : undefined,
      });
      return s;
    },
  });

  const { data: expired } = useQuery({
    queryKey: ['club-subscriptions', 'expired'],
    queryFn: async () => {
      const { data: r } = await api.get<{ data: ClubSubscriptionListItem[]; count: number }>(
        '/club-subscriptions/expired-report',
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
  const filters: FilterField[] = [
    { key: 'branch', label: ct('common.branch'), type: 'select', options: branchOptions },
    { key: 'subscriptionType', label: ct('subscriptions.subType'), type: 'select', options: subTypeOptions },
    { key: 'gender', label: ct('common.gender'), type: 'select', options: genderOptions },
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
  const [freezeForm, setFreezeForm] = useState({ reason: '' });
  const [renewOpen, setRenewOpen] = useState(false);
  const [renewQuote, setRenewQuote] = useState<{ grossValue: number; netValue: number; paidAmount: number; remainingAmount: number; quoteVersion: string; startDate: string; endDate: string } | null>(null);
  const [renewForm, setRenewForm] = useState({ paidAmount: '' });
  const [renewRows, setRenewRows] = useState<ClubPaymentSplitRow[]>(singlePaymentRow());
  const [subscriptionKind, setSubscriptionKind] = useState<SubscriptionKind>('package');
  /** Tender rows for the create/edit dialog — one row unless the user splits the payment. */
  const [paymentRows, setPaymentRows] = useState<ClubPaymentSplitRow[]>(singlePaymentRow());

  const [form, setForm] = useState({
    branchId: 0,
    memberId: '',
    customerName: '',
    subscriptionTypeId: '',
    specialClassTypeId: '',
    privatePackageId: '',
    privateTrainerId: '',
    privateDiscountType: '',
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
    discountValue: '',
    isLinkedToSessions: false,
    sessionsCount: '',
    validityDays: '',
  });

  const formBranchName = useMemo(
    () => resolveBranchName(branches, form.branchId, user?.branch),
    [branches, form.branchId, user?.branch],
  );
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

  const formDiscountValue = useMemo(
    () => calculateSubscriptionDiscount(
      Number(form.subscriptionValue) || 0,
      form.discountMode,
      discountCodes,
      form.discountCodeId,
      form.discountValue,
    ),
    [discountCodes, form.discountCodeId, form.discountMode, form.discountValue, form.subscriptionValue],
  );
  const formNetValue = Math.max(0, (Number(form.subscriptionValue) || 0) - formDiscountValue);
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
  const [receiptForm, setReceiptForm] = useState({ memberName: '', amount: '', memberCode: '', subscriptionId: '' });
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
    () => (data?.data ?? []).find((item) => item.id === Number(transferForm.subscriptionId)) ?? null,
    [data?.data, transferForm.subscriptionId],
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
    setWalkIn(false);
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
      subscriptionValue: '',
      endDate: '',
      paidAmount: kind === 'special' || kind === 'private' ? '' : current.paidAmount,
      discountEnabled: false,
      discountMode: 'none',
      discountCodeId: '',
      discountValue: kind === 'private' ? '0' : '',
      isSpecial: kind === 'special' || kind === 'private',
      isLinkedToSessions: kind === 'sessions',
      sessionsCount: '',
      validityDays: kind === 'special' ? '30' : '',
    }));
    if (kind === 'special' || kind === 'private') {
      setWalkIn(false);
      if (!form.memberId) setSelectedMember(null);
    }
  };

  const openCreate = () => {
    if (!canCreateSubscriptions) return;
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
      discountValue: '',
      isLinkedToSessions: false,
      sessionsCount: '',
      validityDays: '',
    });
    setPaymentRows(singlePaymentRow());
    setEditRemainingAmount(null);
    setWalkIn(false);
    setSelectedMember(null);
    setDialogOpen(true);
  };

  const openEdit = async (row: ClubSubscriptionListItem) => {
    if (!canUpdateSubscriptions) return;
    setEditSubId(row.id);
    setSubscriptionKind(row.specialClassTypeId || row.isSpecial ? 'special' : row.isLinkedToSessions ? 'sessions' : 'package');
    setPaymentRows(singlePaymentRow((row.paymentMethod as ClubPaymentMethod) || 'cash'));
    setForm({
      branchId: row.branchId ?? branches?.[0]?.id ?? 0,
      memberId: row.memberId ? String(row.memberId) : '',
      customerName: row.customerName ?? '',
      subscriptionTypeId: row.subscriptionTypeId ? String(row.subscriptionTypeId) : '',
      specialClassTypeId: row.specialClassTypeId ? String(row.specialClassTypeId) : '',
      privatePackageId: '',
      privateTrainerId: '',
      privateDiscountType: '',
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
      discountValue: row.discountValue ? String(row.discountValue) : '',
      isLinkedToSessions: !!row.isLinkedToSessions,
      sessionsCount: row.sessionsCount ? String(row.sessionsCount) : '',
      validityDays:
        row.specialClassTypeId || row.isSpecial
          ? String(daysBetweenLocal(row.subscriptionStartDate, row.subscriptionEndDate))
          : '',
    });
    setEditRemainingAmount(row.remainingAmount);
    setWalkIn(!row.memberId);
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
    if (form.discountMode === 'code' && !form.discountCodeId) {
      toast.error('اختر كود الخصم');
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
    const employeeId = user?.emp_code ?? selectedMember?.employeeId ?? undefined;
    // Editing never collects money, so only the create paths carry a split to validate.
    const paidNow = editSubId ? 0 : Number(form.paidAmount) || 0;
    const split = buildClubPaymentSplit(paymentRows, paidNow, ct);
    if ('error' in split) {
      toast.error(split.error);
      return;
    }
    const discountPayload = {
      discountEnabled: form.discountMode !== 'none',
      discountCodeId: form.discountMode === 'code' ? Number(form.discountCodeId) : null,
      discountValue: form.discountMode === 'fixed' ? Number(form.discountValue) || 0 : 0,
    };
    setSaving(true);
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
          await api.post('/club-subscriptions', {
            ...specialPayload,
            startDate: form.startDate,
            paidAmount: form.paidAmount ? Number(form.paidAmount) : 0,
          });
        }
      } else if (editSubId) {
        const common = {
          branchId: effectiveBranchId,
          memberId: form.memberId ? Number(form.memberId) : undefined,
          customerName: form.customerName || undefined,
          subscriptionTypeId: form.subscriptionTypeId ? Number(form.subscriptionTypeId) : undefined,
          paymentMethod: split.payload.paymentMethod,
          gender: form.gender,
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
        };
        const selectedType = subTypes?.find((t) => t.id === Number(form.subscriptionTypeId));
        const datesChanged =
          !!editOriginal &&
          (editOriginal.startDate !== form.startDate || editOriginal.typeId !== form.subscriptionTypeId);
        await api.put(`/club-subscriptions/${editSubId}`, {
          ...common,
          ...(datesChanged && selectedType
            ? {
                subscriptionStartDate: form.startDate,
                subscriptionEndDate: addDaysLocal(
                  form.startDate,
                  selectedType.days > 0 ? selectedType.days : selectedType.isLinkedToSessions ? 30 : 0,
                ),
                subscriptionType: selectedType.name,
                subscriptionValue: Number(form.subscriptionValue) || selectedType.price,
                isLinkedToSessions: !!selectedType.isLinkedToSessions,
                sessionsCount: selectedType.isLinkedToSessions
                  ? (Number(form.sessionsCount) || selectedType.sessionsCount || undefined)
                  : undefined,
              }
            : {}),
        });
      } else {
        await api.post('/club-subscriptions', {
          branchId: effectiveBranchId,
          memberId: form.memberId ? Number(form.memberId) : undefined,
          customerName: form.customerName || undefined,
          subscriptionTypeId: form.subscriptionTypeId ? Number(form.subscriptionTypeId) : undefined,
          ...split.payload,
          guardianName: selectedMember?.guardianName || undefined,
          guardianPhone: selectedMember?.guardianPhone || undefined,
          employeeId,
          salesId: selectedMember?.salesId ?? undefined,
          startDate: form.startDate,
          paidAmount: form.paidAmount ? Number(form.paidAmount) : 0,
          ...discountPayload,
          isLinkedToSessions: form.isLinkedToSessions,
          sessionsCount: form.isLinkedToSessions && form.sessionsCount
            ? Number(form.sessionsCount)
            : undefined,
          isSpecial: filterSpecial || form.isSpecial,
        });
      }
      toast.success(ct('common.success'));
      setDialogOpen(false);
      setEditSubId(null);
      invalidateAll();
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

  const openRenew = async (row: ClubSubscriptionListItem) => {
    setSelectedId(row.id);
    setRenewQuote(null);
    let net = subscriptionNetValue(row);
    try {
      const { data: quote } = await api.post<typeof renewQuote>(`/club-subscriptions/${row.id}/renewal-quote`, {});
      if (quote) { setRenewQuote(quote); net = quote.netValue; }
    } catch (error) { toast.error(apiError(error)); return; }
    setRenewForm({ paidAmount: String(net) });
    setRenewRows(singlePaymentRow((row.paymentMethod as ClubPaymentMethod) || 'cash', net));
    setRenewOpen(true);
  };

  const renewSub = useMemo(
    () => (renewOpen && selectedId != null ? (data?.data ?? []).find((s) => s.id === selectedId) ?? null : null),
    [renewOpen, selectedId, data?.data],
  );
  const renewNetValue = renewQuote?.netValue ?? (renewSub ? subscriptionNetValue(renewSub) : 0);
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
      const { data: quote } = await api.post<typeof renewQuote>(`/club-subscriptions/${selectedId}/renewal-quote`, body);
      await api.patch(`/club-subscriptions/${selectedId}/renew`, { ...body, quoteVersion: quote?.quoteVersion });
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
    setFreezeForm({ reason: '' });
    setFreezeOpen(true);
  };

  const submitFreeze = async () => {
    if (!selectedId) return;
    setSaving(true);
    try {
      await api.post(`/club-subscriptions/${selectedId}/freeze`, {
        reason: freezeForm.reason.trim() || undefined,
      });
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

  const saveReceipt = async () => {
    if (!receiptForm.memberName.trim() || !receiptForm.amount) {
      toast.error(ct('members.fillRequired'));
      return;
    }
    const receiptAmount = Number(receiptForm.amount);
    if (!Number.isFinite(receiptAmount) || receiptAmount <= 0) {
      toast.error(ct('subscriptions.invalidAmount'));
      return;
    }
    setSaving(true);
    try {
      let memberId: number | undefined;
      if (receiptForm.memberCode.trim()) {
        const q = receiptForm.memberCode.trim();
        const { data: list } = await api.get<{ data: ClubMemberListItem[] }>('/club-members', {
          params: { search: q, pageSize: 5 },
        });
        const exact = list.data.find((m) => m.memberCode === q || m.cardNumber === q);
        if (!exact) {
          toast.error(ct('members.noMemberFound'));
          return;
        }
        memberId = exact.id;
      }
      await api.post('/club-receipts', {
        memberName: receiptForm.memberName,
        amount: receiptAmount,
        memberId,
        subscriptionId: receiptForm.subscriptionId ? Number(receiptForm.subscriptionId) : undefined,
      });
      toast.success(ct('common.success'));
      setReceiptOpen(false);
      invalidateAll();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const subColumns = useMemo<ColumnDef<ClubSubscriptionListItem>[]>(
    () => [
      { id: 'index', header: ct('common.index'), cell: ({ row }) => toArabicDigits((params.page - 1) * params.pageSize + row.index + 1) },
      { accessorKey: 'subscriptionNumber', header: ct('subscriptions.subNumber') },
      { accessorKey: 'customerName', header: ct('subscriptions.customerName'), cell: ({ getValue }) => getValue() ?? '—' },
      { accessorKey: 'subscriptionType', header: ct('subscriptions.subType'), cell: ({ getValue }) => getValue() ?? '—' },
      {
        accessorKey: 'sessionsCount',
        header: 'عدد الحصص',
        cell: ({ row }) => row.original.isLinkedToSessions
          ? <span className="nums">{toArabicDigits(row.original.sessionsCount ?? 0)}</span>
          : '—',
      },
      { accessorKey: 'subscriptionValue', header: 'سعر الاشتراك', cell: ({ getValue }) => <span className="nums">{formatMoney(getValue() as number)}</span> },
      { accessorKey: 'discountValue', header: 'قيمة الخصم', cell: ({ getValue }) => <span className="nums">{formatMoney(getValue() as number)}</span> },
      {
        id: 'netValue',
        header: 'صافي الاشتراك',
        cell: ({ row }) => <span className="nums font-medium">{formatMoney(subscriptionNetValue(row.original))}</span>,
      },
      { accessorKey: 'paidAmount', header: 'المدفوع نقدًا', cell: ({ getValue }) => <span className="nums text-emerald-700">{formatMoney(getValue() as number)}</span> },
      { accessorKey: 'remainingAmount', header: ct('subscriptions.remaining'), cell: ({ getValue }) => <span className="nums">{formatMoney(getValue() as number)}</span> },
      {
        accessorKey: 'status',
        header: ct('common.status'),
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
        cell: ({ row }) => !canUpdateSubscriptions && !canDeleteSubscriptions && !canPrintSubscriptions ? null : (
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
                <DropdownMenuItem onSelect={() => void unfreeze(row.original.id)}><Sun className="size-4" /> {ct('subscriptions.unfreeze')}</DropdownMenuItem>
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
      <PageHeader
        title={ui(pageTitle)}
        description={ct('subscriptions.description')}
        actions={showNewSubButton && canCreateSubscriptions ? (
          <Button variant="brand" onClick={openCreate}><Plus className="size-4" /> {ct('subscriptions.newSub')}</Button>
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

      {stats && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <ClubStatCard label={ct('subscriptions.totalSubs')} value={stats.total} />
          <ClubStatCard label={ct('common.active')} value={stats.active} />
          <ClubStatCard label={ct('subscriptions.totalPaid')} value={stats.totalPaid} />
          <ClubStatCard label={ct('subscriptions.totalRemaining')} value={stats.totalRemaining} />
        </div>
      )}

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
          <FilterBar
            fields={filters}
            preserveParams={filterSpecial ? ['isSpecial'] : filterTimeBased ? ['isTimeBased'] : []}
          />
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
          />
        </TabsContent>

        <TabsContent value="frozen" className="space-y-4 pt-4">
          <div className="rounded-xl border border-sky-200/70 bg-sky-50/50 p-4 text-sm text-sky-950 dark:border-sky-900 dark:bg-sky-950/20 dark:text-sky-100">
            {ui('تعرض هذه القائمة الاشتراكات الموقوفة مؤقتًا فقط. عند الاستئناف تُمدد نهاية الاشتراك بعدد أيام الإيقاف الفعلية للحفاظ على المدة المتبقية.')}
          </div>
          <FilterBar fields={filters.filter((field) => field.key !== 'status')} preserveParams={['status']} />
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
            <Button variant="outline" onClick={() => { setReceiptForm({ memberName: '', amount: '', memberCode: '', subscriptionId: '' }); setReceiptOpen(true); }}>
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
                  <th className="p-3 text-start">{ct('subscriptions.receiptAmount')}</th>
                  <th className="p-3 text-start">{ct('subscriptions.paymentMethod')}</th>
                  <th className="p-3 text-start">{ct('subscriptions.receiptDate')}</th>
                </tr>
              </thead>
              <tbody>
                {(receipts ?? []).length === 0 && (
                  <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">{ct('common.noData')}</td></tr>
                )}
                {(receipts ?? []).map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="p-3 nums">{r.receiptNumber}</td>
                    <td className="p-3">{r.memberName}</td>
                    <td className="p-3 nums">{toArabicDigits(r.amount)}</td>
                    <td className="p-3">{clubPaymentMethodsLabel(ct, r.payments, r.paymentMethod)}</td>
                    <td className="p-3 nums">{toArabicDigits(r.receiptDate)}</td>
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
            {canUpdateSubscriptions ? <Button asChild variant="brand"><Link to="/club/subscriptions/member-transfer"><ArrowRightLeft className="size-4" /> تحويل الاشتراك بين الأعضاء</Link></Button> : null}
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
                    <th className="p-2 text-start">{ct('subscriptions.customerName')}</th>
                    <th className="p-2 text-start">{ct('subscriptions.subType')}</th>
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
                    <th className="p-2 text-start">{ct('subscriptions.customerName')}</th>
                    <th className="p-2 text-start">{ct('subscriptions.subType')}</th>
                  </tr>
                </thead>
                <tbody>
                  {(expired?.data ?? []).map((s) => (
                    <tr key={s.id} className="border-t">
                      <td className="p-2">{s.customerName}</td>
                      <td className="p-2">{s.subscriptionType}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className={FORM_DIALOG_CONTENT_CLASS} aria-describedby={undefined}>
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
              <div className="mx-auto grid w-full max-w-5xl gap-3 sm:grid-cols-2">
                {([
                  { value: 'package', label: 'اشتراك', description: 'الباقات العادية', icon: Package },
                  { value: 'sessions', label: 'حصص', description: 'باقات الحصص في الباقات والأسعار', icon: Dumbbell },
                  { value: 'private', label: 'اشتراكات برايفت', description: 'اشتراكات وحصص برايفت مع مدرب خاص', icon: ContactRound },
                  { value: 'special', label: 'اشتراكات خاصة', description: 'عدد حصص ومدة مرتبطة بجدول المدربين', icon: Sparkles },
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
                  <Input className="bg-muted" value={formBranchName} readOnly />
                </FieldWrapper>
                <FieldWrapper label={ct('members.registeredBy')}>
                  <Input className="bg-muted" value={user?.name ?? '—'} readOnly />
                </FieldWrapper>
              </DialogFormGrid>
              {subscriptionKind !== 'special' && subscriptionKind !== 'private' ? <div className="flex flex-wrap items-center justify-end gap-2">
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border bg-background px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted/40">
                  <input
                    type="checkbox"
                    className="size-3.5 rounded accent-primary"
                    checked={walkIn}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setWalkIn(checked);
                      if (checked) {
                        setForm((f) => ({ ...f, memberId: '', customerName: f.customerName }));
                        setSelectedMember(null);
                      }
                    }}
                  />
                  {ct('subscriptions.walkInCustomer')}
                </label>
              </div> : null}
              {walkIn ? (
                <FieldWrapper label={ct('subscriptions.customerName')} required>
                  <Input
                    value={form.customerName}
                    onChange={(e) => setForm((f) => ({ ...f, customerName: e.target.value }))}
                    placeholder={ct('subscriptions.customerName')}
                  />
                </FieldWrapper>
              ) : (
                <FieldWrapper label={ct('subscriptions.customerName')} required>
                  <MemberSearchCombobox
                    selectedMember={selectedMember}
                    onSelect={(member) => {
                      setSelectedMember(member);
                      setForm((f) => ({
                        ...f,
                        memberId: String(member.id),
                        customerName: member.name,
                        gender: member.gender ?? f.gender,
                        branchId: member.branchId || f.branchId,
                      }));
                    }}
                    onClear={() => {
                      setSelectedMember(null);
                      setForm((f) => ({ ...f, memberId: '', customerName: '' }));
                    }}
                  />
                </FieldWrapper>
              )}
              {selectedMember && !walkIn && (
                <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-sm">
                  <span className="font-medium">{selectedMember.name}</span>
                  <span className="nums text-muted-foreground font-mono ms-2">{selectedMember.memberCode}</span>
                  {selectedMember.phone && (
                    <span className="nums text-muted-foreground"> · {toArabicDigits(selectedMember.phone)}</span>
                  )}
                </div>
              )}
            </DialogFormSection>

            <Tabs defaultValue="details" className="space-y-4">
              <TabsList className="grid h-auto w-full grid-cols-3">
                <TabsTrigger value="details">بيانات الاشتراك</TabsTrigger>
                <TabsTrigger value="discount">كود خصم</TabsTrigger>
                <TabsTrigger value="payment">الدفع</TabsTrigger>
              </TabsList>
              <TabsContent value="details" className="mt-0 space-y-4">
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
                  <FieldWrapper label="رجالي - حريمي" required><select className={selectCls} value={form.gender} onChange={(event) => setForm((current) => ({ ...current, gender: event.target.value as 'male' | 'female' }))}><option value="male">رجالي</option><option value="female">حريمي</option></select></FieldWrapper>
                  <FieldWrapper label="الكابتن" required className="sm:col-span-2"><select className={selectCls} value={form.privateTrainerId} onChange={(event) => setForm((current) => ({ ...current, privateTrainerId: event.target.value }))}><option value="">اختر الكابتن</option>{privateTrainers.map((trainer) => <option key={trainer.id} value={trainer.id}>{trainer.name}{trainer.specialization ? ` — ${trainer.specialization}` : ''}</option>)}</select></FieldWrapper>
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
                  <SubscriptionTypeSelect
                    types={subTypes as ClubSubscriptionType[]}
                    mode="all"
                    value={form.subscriptionTypeId}
                    onChange={(typeId) =>
                      setForm((f) => ({ ...f, subscriptionTypeId: typeId }))
                    }
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

              </TabsContent>

              <TabsContent value="discount" className="mt-0">
                <DialogFormSection title="كود خصم أو قيمة خصم" icon={Sparkles}>
                  <SubscriptionDiscountFields
                    grossValue={Number(form.subscriptionValue) || 0}
                    codes={discountCodes}
                    mode={form.discountMode}
                    codeId={form.discountCodeId}
                    fixedValue={form.discountValue}
                    onChange={(discount) => setForm((current) => ({
                      ...current,
                      discountMode: discount.mode,
                      discountCodeId: discount.codeId,
                      discountValue: discount.fixedValue,
                      discountEnabled: discount.mode !== 'none',
                    }))}
                  />
                </DialogFormSection>
              </TabsContent>

              <TabsContent value="payment" className="mt-0">

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
              <DialogFormGrid>
                {editSubId ? (
                  <FieldWrapper label={ct('subscriptions.paymentMethod')} className="sm:col-span-2">
                    <ClubPaymentMethodSelect
                      value={paymentRows[0]?.method ?? 'cash'}
                      onChange={(method) => setPaymentRows(singlePaymentRow(method))}
                    />
                  </FieldWrapper>
                ) : (
                  <div className="sm:col-span-2">
                    <ClubPaymentSplitFields
                      total={formNetValue}
                      rows={paymentRows}
                      onChange={setPaymentRows}
                      onTotalChange={(paidAmount) =>
                        setForm((current) => ({ ...current, paidAmount: String(paidAmount) }))
                      }
                    />
                  </div>
                )}
                <FieldWrapper label={ct('subscriptions.receiptNumber')}>
                  <Input className="nums bg-muted" dir="ltr" value={ct('subscriptions.autoGenerated')} readOnly />
                </FieldWrapper>
              </DialogFormGrid>
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
              </TabsContent>
            </Tabs>
          </FormDialogBody>

          <FormDialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{ct('common.cancel')}</Button>
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
                  {(data?.data ?? []).filter((item) => item.status === 'active').map((item) => (
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

      <Dialog open={receiptOpen} onOpenChange={setReceiptOpen}>
        <DialogContent size="sm" aria-describedby={undefined}>
          <DialogHeader><DialogTitle>{ct('subscriptions.newReceipt')}</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <Input placeholder={ct('subscriptions.customerName')} value={receiptForm.memberName} onChange={(e) => setReceiptForm((f) => ({ ...f, memberName: e.target.value }))} />
            <Input className="nums" type="number" min={0} step="any" placeholder={ct('common.amount')} value={receiptForm.amount} onChange={(e) => setReceiptForm((f) => ({ ...f, amount: e.target.value }))} />
            <Input className="font-mono" dir="ltr" placeholder={ct('subscriptions.memberIdOptional')} value={receiptForm.memberCode} onChange={(e) => setReceiptForm((f) => ({ ...f, memberCode: e.target.value }))} />
            <Input className="nums" placeholder={ct('subscriptions.subscriptionId')} value={receiptForm.subscriptionId} onChange={(e) => setReceiptForm((f) => ({ ...f, subscriptionId: e.target.value }))} />
          </div>
          <DialogFooter>
            <Button variant="brand" onClick={() => void saveReceipt()} disabled={saving}>{ct('common.save')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={freezeOpen} onOpenChange={setFreezeOpen}>
        <DialogContent size="sm" aria-describedby={undefined}>
          <DialogHeader><DialogTitle>{ct('subscriptions.freezeTitle')}</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <p className="text-sm text-muted-foreground">{ct('subscriptions.freezePreserveHint')}</p>
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
              {saving ? ct('common.saving') : ct('subscriptions.freeze')}
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
                    label: renewQuote ? 'قيمة الباقة الحالية' : ct('subscriptions.value'),
                    value: formatMoney(renewQuote?.grossValue ?? renewNetValue),
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
