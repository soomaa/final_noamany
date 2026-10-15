import { FreezeExpiryPreview } from '@/components/club/freeze-expiry-preview';
import { formatDisplayNumber } from '@/lib/number-display';
import { SubscriptionFormFrame } from './subscription-form-frame';
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
  StickyNote,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { DataTable } from '@/components/common/data-table';
import { Combobox } from '@/components/common/combobox';
import { FilterBar, type FilterField } from '@/components/common/filter-bar';
import { OutstandingReportFilters } from '@/components/club/outstanding-report-filters';
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
import { SubscriptionNoteDialog } from '@/components/club/subscription-note-dialog';
import { PlanTransferStartChoice, type PlanTransferStartFrom } from '@/components/club/plan-transfer-start-choice';
import { SubscriptionRenewalDialog } from '@/components/club/subscription-renewal-dialog';
import {
  NO_PLAN_TRANSFER_DISCOUNT,
  PlanTransferDiscountFields,
  planTransferDiscountBody,
  type PlanTransferDiscount,
} from '@/components/club/plan-transfer-discount';
import {
  printThermalFinancialReceiptWithFallback,
  printThermalSubscriptionReceipt,
} from '@/components/club/thermal-receipt-print';
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
import { SubscriptionExpiryReports } from '@/components/club/subscription-expiry-reports';
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
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useBranches } from '@/hooks/use-branches';
import { useClubT } from '@/hooks/use-club-t';
import { usePermission } from '@/hooks/use-permission';
import { useClubPrintingPolicy } from '@/hooks/use-club-printing-policy';
import { useLocale } from '@/store/locale';
import { useAuth } from '@/store/auth';
import { translateNavRoute } from '@/lib/nav';
import { api, apiError } from '@/lib/api';
import { formatMoney, formatTime, localToday } from '@/lib/formatters';
import { resolveSessionMatrixPrice } from '@/lib/session-price-matrix';
import { packagePriceForBranch, sessionMatrixForBranchPrice } from '@/lib/package-price';
import { RenewalFollowUpWorkspace } from '@/components/club/renewal-follow-up-workspace';
import { subscriptionTypesForBranch } from '@/lib/club-subscription-branches';
import { useArrayResource, usePaginatedList } from '@/lib/api-hooks';
import { confirm, afterMenuClose } from '@/lib/confirm';
import { useListQuery } from '@/lib/use-list-query';
import { cn, toArabicDigits, formatDigits } from '@/lib/utils';
import { readRenewalConflict } from '@/lib/subscription-renewal';
import { shiftSubscriptionDate } from '@/lib/subscription-dates';
import { subscriptionActionAccess } from '@/lib/subscription-action-access';
import { runAutoPrintOnce } from '@/lib/club-printing';
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
  return Math.max(0, Math.round((end - start) / 86_400_000));
}

interface ReceiptRow extends SubscriptionPaymentReceiptRow {
  memberName: string;
  subscriptionId?: number | null;
  lockerSubscriptionId?: number | null;
}

interface PlanTransferPreview {
  pricingMode: 'price_difference' | 'unused_credit';
  canChooseStart?: boolean;
  startFrom?: PlanTransferStartFrom;
  toStartDate: string;
  subscriptionId: number;
  sourceType: string | null;
  sourceKind: 'sessions' | 'subscription';
  consumedValue: number;
  consumedSessions?: number | null;
  transferableCredit: number;
  targetType: string;
  targetKind: 'sessions' | 'subscription';
  targetUnitPrice: number | null;
  targetSessionsCount: number | null;
  targetValue: number;
  creditApplied: number;
  discountValue?: number;
  requestedDiscountValue?: number;
  refundAmount: number;
  additionalDue: number;
  toEndDate: string;
}

type SubscriptionKind = 'package' | 'sessions' | 'special' | 'private';

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

export interface ClubSubscriptionsPageProps {
  singleView?: ClubSubscriptionsView;
  openCreateOnMount?: boolean;
  isolated?: boolean;
  createOnly?: boolean;
  filterSpecial?: boolean;
  filterTimeBased?: boolean;
  reportFocus?: 'expired' | 'outstanding' | 'expiring';
}

export function ClubSubscriptionsPage({
  singleView,
  openCreateOnMount,
  isolated = false,
  createOnly = false,
  filterSpecial,
  filterTimeBased,
  reportFocus,
}: ClubSubscriptionsPageProps = {}) {
  const ct = useClubT();
  const { ui, t } = useLocale();
  const { can } = usePermission();
  const subscriptionActions = subscriptionActionAccess(can);
  const canCreateSubscriptions = isolated ? can('club.membership_add:create') : subscriptionActions.canCreate;
  const canUpdateSubscriptions = subscriptionActions.canUpdate;
  const canPayOutstanding =
    can('club.subscriptions.outstanding:update') ||
    can('club.subscriptions.list:update') ||
    can('club.reception:update');
  const canDeleteSubscriptions = subscriptionActions.canDelete;
  const canPrintSubscriptions = subscriptionActions.canPrint;
  const canCreateReceipts =
    can('club.subscriptions.receipts:create');
  const canViewReceipts =
    can('club.subscriptions.receipts:view');
  const canViewRefunds =
    can('club.subscriptions.refunds:view');
  const canViewSpecial =
    can('club.subscriptions.special:view');
  const { user } = useAuth();
  const { policy, shouldPrint } = useClubPrintingPolicy();
  const subscriptionOnboarding = useFirstVisitGuide('subscriptions', user?.sub);
  const qc = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
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
    !reportFocus && !createOnly,
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
  }>(isolated ? 'club-membership-registration/types' : 'club-subscription-types');
  const { data: specialClassTypes } = useArrayResource<ClubClassType>('club-class-types', canViewSpecial);
  const { data: discountCodes = [] } = useArrayResource<ClubDiscountCode>('club-discount-codes', !isolated);
  const { data: privatePackages = [] } = useArrayResource<ClubPrivatePackage>('club-private-subscriptions/packages', canViewSpecial);
  const { data: privateTrainers = [], isLoading: loadingPrivateTrainers, isError: privateTrainersError, refetch: refetchPrivateTrainers } = useQuery({
    queryKey: ['club-trainers', 'private-subscriptions'],
    queryFn: async () => (await api.get<{ data: ClubTrainerRow[] }>('/club-trainers', { params: { page: 1, pageSize: 200, isActive: true } })).data.data,
    enabled: canViewSpecial,
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
      ? `${ui('حصص برايفت · ')}${toArabicDigits(item.sessionsCount ?? 0)}${ui(' حصة · ')}${formatMoney(item.price)}`
      : `${ui('اشتراك برايفت · ')}${formatMoney(item.price)}`,
    searchText: item.kind === 'sessions'
      ? `حصص برايفت ${item.sessionsCount ?? 0} ${item.price}`
      : `اشتراك برايفت ${item.price}`,
  })), [visiblePrivatePackages]);
  const showNewSubButton = !createOnly && (!singleView || singleView === 'subs');
  const { data: receipts, refetch: refetchReceipts } = useArrayResource<ReceiptRow>('club-receipts', canViewReceipts && !createOnly);
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
  }>('club-subscription-transfers', !createOnly);

  const { data: stats } = useQuery({
    enabled: !createOnly,
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
    enabled: !reportFocus && !createOnly,
    queryFn: async () => {
      const { data: r } = await api.get<{ data: ClubSubscriptionListItem[]; count: number }>(
        '/club-subscriptions/expired-report',
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

  const {
    data: outstanding,
    refetch: refetchOutstanding,
    isLoading: outstandingIsLoading,
    isFetching: outstandingIsFetching,
    isError: outstandingIsError,
    error: outstandingError,
  } = useQuery({
    queryKey: ['club-subscriptions', 'outstanding', user?.sub, params.search.trim(), params.filters.branch ?? ''],
    queryFn: async ({ signal }) => {
      const { data: r } = await api.get<{ subscriptions: ClubSubscriptionListItem[]; summary: { count: number } }>(
        '/club-subscriptions/outstanding-report',
        { params: { search: params.search.trim() || undefined, branch: params.filters.branch || undefined }, signal },
      );
      return r;
    },
    enabled: reportFocus === 'outstanding' || (!reportFocus && tab === 'reports'),
  });
  const { data: waivers } = useQuery({
    queryKey: ['club-subscriptions', 'waivers'],
    queryFn: async () => (await api.get<{ data: WaiverReportRow[]; summary: { count: number; totalAmount: number } }>('/club-subscriptions/waivers-report')).data,
    enabled: !reportFocus && tab === 'waivers',
  });
  const [dialogOpen, setDialogOpen] = useState(!!openCreateOnMount || createOnly);
  const [editSubId, setEditSubId] = useState<number | null>(null);
  const [editSubscription, setEditSubscription] = useState<ClubSubscriptionListItem | null>(null);
  const [editOriginal, setEditOriginal] = useState<{ startDate: string; endDate: string; typeId: string } | null>(null);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [printSub, setPrintSub] = useState<ClubSubscriptionListItem | null>(null);
  const [noteSub, setNoteSub] = useState<ClubSubscriptionListItem | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const isolatedSaveInFlight = useRef(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [installmentRows, setInstallmentRows] = useState<ClubPaymentSplitRow[]>(singlePaymentRow());
  const [paymentMaxRemaining, setPaymentMaxRemaining] = useState(0);
  const [paymentSub, setPaymentSub] = useState<ClubSubscriptionListItem | null>(null);
  const [waiverOpen, setWaiverOpen] = useState(false);
  const [waiverSub, setWaiverSub] = useState<ClubSubscriptionListItem | null>(null);
  const [waiverForm, setWaiverForm] = useState({ amount: '', reason: '' });
  const [editRemainingAmount, setEditRemainingAmount] = useState<number | null>(null);
  const [freezeOpen, setFreezeOpen] = useState(false);
  const [freezeForm, setFreezeForm] = useState({ reason: '', days: '' });
  const freezeDaysInvalid = freezeForm.days !== '' && (!Number.isInteger(Number(freezeForm.days)) || Number(freezeForm.days) < 1);
  const { data: freezePreview, isFetching: freezePreviewLoading, isError: freezePreviewError, refetch: retryFreezePreview } = useQuery({
    queryKey: ['subscription-freeze-preview', selectedId, freezeOpen],
    queryFn: async () => (await api.get<{ subscriptionNumber: string; customerName: string; remainingDays: number | null; remainingTimes: number | null; minDays: number; queuedRenewals: number; blockedReason: string | null; plannedEndDate: string | null; subscriptionEndDate: string }>(`/club-subscriptions/${selectedId}/freeze-preview`)).data,
    enabled: freezeOpen && !!selectedId,
    staleTime: 0,
  });
  const [renewOpen, setRenewOpen] = useState(false);
  const [renewTarget, setRenewTarget] = useState<ClubSubscriptionListItem | null>(null);
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
    notes: '',
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
    enabled: historySubId != null && !isolated,
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
  const paidAmountEdited = useRef(false);
  const paidSourceRef = useRef('');
  useEffect(() => {
    if (editSubId) return;
    const source = `${form.subscriptionTypeId}|${form.specialClassTypeId}|${form.privatePackageId}|${form.sessionsCount}|${form.validityDays}`;
    if (paidSourceRef.current !== source) {
      paidSourceRef.current = source;
      paidAmountEdited.current = false;
    }
    if (paidAmountEdited.current) return;
    const amount = formNetValue > 0 ? String(Math.round(formNetValue * 100) / 100) : '';
    setPaymentRows((rows) => {
      if (rows.length > 1) return rows;
      if ((rows[0]?.amount ?? '') === amount) return rows;
      return singlePaymentRow(rows[0]?.method ?? 'cash', amount);
    });
    setForm((current) => (current.paidAmount === amount ? current : { ...current, paidAmount: amount }));
  }, [editSubId, form.subscriptionTypeId, form.specialClassTypeId, form.privatePackageId, form.sessionsCount, form.validityDays, formNetValue]);
  const formRemaining = useMemo(() => {
    const paid = Number(form.paidAmount) || 0;
    return Math.max(0, formNetValue - paid);
  }, [formNetValue, form.paidAmount]);
  const availableSubTypes = useMemo(() => {
    const types = (subTypesRaw ?? []).filter((type) => !type.isSpecialOffer);
    // A registered member's branch is authoritative. The form may still contain the
    // operator's previously selected branch while the member picker is being updated.
    const branchId = selectedMember?.branchId || form.branchId;
    return subscriptionTypesForBranch(types as ClubSubscriptionType[], branchId);
  }, [subTypesRaw, form.branchId, selectedMember?.branchId]);

  // A plan selected before the member/branch changed must not survive invisibly in the form:
  // the picker would show no valid selection while the stale id is still posted, and the server
  // rejects it as a foreign-branch plan.
  useEffect(() => {
    if (!subTypesRaw || editSubId || !form.subscriptionTypeId) return;
    const stillAvailable = availableSubTypes.some(
      (type) => type.id === Number(form.subscriptionTypeId),
    );
    if (stillAvailable) return;
    setForm((current) =>
      current.subscriptionTypeId
        ? {
            ...current,
            subscriptionTypeId: '',
            subscriptionValue: '',
            endDate: '',
            isLinkedToSessions: false,
            sessionsCount: '',
          }
        : current,
    );
  }, [availableSubTypes, editSubId, form.subscriptionTypeId, subTypesRaw]);
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
  const [transferDiscount, setTransferDiscount] = useState<PlanTransferDiscount>(NO_PLAN_TRANSFER_DISCOUNT);
  const [transferTargetValue, setTransferTargetValue] = useState(0);
  const [transferStartFrom, setTransferStartFrom] = useState<PlanTransferStartFrom>('original');
  const [transferCanChooseStart, setTransferCanChooseStart] = useState(false);
  const transferDiscountBody = useMemo(() => planTransferDiscountBody(transferDiscount), [transferDiscount]);
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
    ? ui('اشتراكات برايفت ومجدولة')
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
    // Sale price follows the member's branch (per-branch package price).
    const branchPrice = packagePriceForBranch(type, form.branchId || undefined);
    setForm((f) => ({
      ...f,
      subscriptionValue: String(branchPrice),
      isLinkedToSessions: !!type.isLinkedToSessions,
      sessionsCount: type.isLinkedToSessions ? String(packageSessions) : '',
      endDate: addDaysLocal(f.startDate, Math.max(1, type.days > 0 ? type.days : type.isLinkedToSessions ? 30 : 1) - 1),
    }));
  }, [form.subscriptionTypeId, form.startDate, form.branchId, subTypes]);

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
        (Number.isInteger(Number(current.validityDays)) && Number(current.validityDays) > 0 ? Number(current.validityDays) : 30) - 1,
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
      endDate: addDaysLocal(current.startDate, Math.max(1, packageRow.durationDays) - 1),
      isSpecial: true,
      isLinkedToSessions: packageRow.kind === 'sessions',
      sessionsCount: packageRow.sessionsCount == null ? '' : String(packageRow.sessionsCount),
    }));
    // The full package is the default sale; picking fewer sessions repricing happens below.
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
    setTransferPreview(null);
    const timer = window.setTimeout(() => {
      void api.post<PlanTransferPreview>('/club-subscription-transfers/preview', {
        subscriptionId,
        toSubscriptionTypeId,
        targetSessionsCount: subTypes?.find(type => type.id === toSubscriptionTypeId)?.isLinkedToSessions ? subTypes?.find(type => type.id === toSubscriptionTypeId)?.sessionsCount : undefined,
        preservePeriod: Boolean(transferSource?.isLinkedToSessions && subTypes?.find(type => type.id === toSubscriptionTypeId)?.isLinkedToSessions),
        toStartDate: transferForm.toStartDate,
        startFrom: transferStartFrom,
        ...transferDiscountBody,
      }).then(({ data: preview }) => {
        if (cancelled) return;
        setTransferPreview(preview);
        setTransferTargetValue(preview.targetValue);
        setTransferCanChooseStart(!!preview.canChooseStart);
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
  }, [transferForm.subscriptionId, transferForm.toStartDate, transferForm.toSubscriptionTypeId, transferDiscountBody, transferStartFrom]);

  useEffect(() => {
    // A discount belongs to one target plan; switching plan or source starts clean.
    setTransferDiscount(NO_PLAN_TRANSFER_DISCOUNT);
    setTransferTargetValue(0);
    setTransferStartFrom('original');
    setTransferCanChooseStart(false);
  }, [transferForm.subscriptionId, transferForm.toSubscriptionTypeId]);

  const invalidateAll = () => {
    if (!createOnly) void refetch();
    if (!createOnly) void refetchReceipts();
    if (!createOnly) void refetchTransfers();
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
    setEditSubscription(null);
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
      notes: '',
    });
    paidAmountEdited.current = false;
    paidSourceRef.current = '';
    setPaymentRows(singlePaymentRow());
    setEditRemainingAmount(null);
    setWalkIn(false);
    setSelectedMember(null);
    setDialogOpen(true);
  };

  const openEdit = async (row: ClubSubscriptionListItem) => {
    if (!canUpdateSubscriptions) return;
    setEditSubId(row.id);
    setEditSubscription(row);
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
          ? String(daysBetweenLocal(row.subscriptionStartDate, row.subscriptionEndDate) + 1)
          : '',
      notes: row.notes ?? '',
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
      endDate: row.subscriptionEndDate,
      typeId: row.subscriptionTypeId ? String(row.subscriptionTypeId) : '',
    });
    setDialogOpen(true);
  };

  const changeSubscriptionDate = (field: 'startDate' | 'endDate', value: string) => {
    setForm((current) => {
      const type = subTypes?.find((item) => item.id === Number(current.subscriptionTypeId));
      const days = subscriptionKind === 'special'
        ? Number(current.validityDays) - 1
        : editOriginal && editOriginal.typeId === current.subscriptionTypeId
          ? daysBetweenLocal(editOriginal.startDate, editOriginal.endDate)
          : type ? Math.max(0, (type.days > 0 ? type.days : type.isLinkedToSessions ? 30 : 1) - 1) : undefined;
      const otherField = field === 'startDate' ? 'endDate' : 'startDate';
      const otherDate = days === undefined
        ? ''
        : shiftSubscriptionDate(value, field === 'startDate' ? days : -days);
      return { ...current, [field]: value, ...(otherDate ? { [otherField]: otherDate } : {}) };
    });
  };

  const saveSub = async () => {
    if (isolatedSaveInFlight.current) return;
    if (editSubId ? !canUpdateSubscriptions : !canCreateSubscriptions) return;
    if (editSubId && (
      !shiftSubscriptionDate(form.startDate, 0) ||
      !shiftSubscriptionDate(form.endDate, 0) ||
      form.endDate < form.startDate
    )) {
      toast.error(ct('subscriptions.invalidDates'));
      return;
    }
    if ((subscriptionKind === 'special' || subscriptionKind === 'private') && (!selectedMember || !form.memberId)) {
      toast.error(ui('اختر عضوًا مسجلًا لإضافة الاشتراك الخاص'));
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
    if (
      (subscriptionKind === 'package' || subscriptionKind === 'sessions') &&
      !editSubId &&
      !subTypes?.some((item) => item.id === Number(form.subscriptionTypeId))
    ) {
      toast.error(ui('الخطة لم تعد متاحة لفرع العضو — أعد اختيارها بعد اختيار العضو'));
      return;
    }
    if (subscriptionKind === 'private' && !form.privateTrainerId) {
      toast.error(ui('اختر الكابتن المسؤول عن اشتراك البرايفت'));
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
      toast.error(`${ui('عدد الحصص يجب أن يكون من 1 إلى ')}${formatDisplayNumber(selectedSpecialClass?.subscriptionSessionsCount ?? 1)}`);
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
      toast.error(`${ui('عدد الحصص يجب أن يكون من 1 إلى ')}${formatDisplayNumber(selectedSessionPackage?.sessionsCount ?? 1)}`);
      return;
    }
    if (form.discountMode === 'code' && !form.discountCodeId) {
      toast.error(ui('اختر كود الخصم'));
      return;
    }
    const specialValidityDays = Number(form.validityDays);
    if (
      subscriptionKind === 'special' &&
      (!Number.isInteger(specialValidityDays) || specialValidityDays < 1)
    ) {
      toast.error(ui('مدة صلاحية الاشتراك يجب أن تكون رقمًا صحيحًا أكبر من صفر'));
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
    // Saving a new subscription with nothing collected books the FULL price as debt. That is a
    // legitimate case (register today, pay later), but an empty paid field by mistake looks
    // identical — and the outstanding report can't tell the two apart afterwards.
    if (!editSubId && paidNow === 0 && formNetValue > 0) {
      const ok = await confirm({
        title: ui('تسجيل اشتراك بدون تحصيل أي مبلغ؟'),
        description:
          `${ui('قيمة الاشتراك بعد الخصم')} ${formatMoney(formNetValue)}${ui('، والمحصّل الآن صفر — فستُسجَّل على')} ${form.customerName || ui('العضو')} ${ui('مديونية بقيمة')} ${formatMoney(formNetValue)} ${ui('كاملة.')}`,
        warning: ui('لو العضو دفع فعلًا، ارجع واكتب المبلغ في خانة السداد بدل ما تسجّله مديونية.'),
        confirmLabel: ui('سجّله مديونية'),
      });
      if (!ok) return;
    }
    const discountPayload = {
      discountEnabled: form.discountMode !== 'none',
      discountCodeId: form.discountMode === 'code' ? Number(form.discountCodeId) : null,
      discountValue: form.discountMode === 'fixed' ? Number(form.discountValue) || 0 : 0,
    };
    if (isolatedSaveInFlight.current) return;
    if (isolated) isolatedSaveInFlight.current = true;
    setSaving(true);
    let createdSubscription: ClubSubscriptionListItem | null = null;
    try {
      if (subscriptionKind === 'private') {
        await api.post('/club-private-subscriptions/enrollments', {
          notes: form.notes.trim() || undefined,
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
          notes: form.notes.trim() || (editSubId ? '' : undefined),
          employeeId,
          salesId: selectedMember?.salesId ?? undefined,
          isSpecial: true,
          ...discountPayload,
        };
        if (editSubId) {
          await api.put(`/club-subscriptions/${editSubId}`, {
            ...specialPayload,
            subscriptionStartDate: form.startDate,
            subscriptionEndDate: form.endDate,
          });
        } else {
          createdSubscription = (await api.post<ClubSubscriptionListItem>('/club-subscriptions', {
            ...specialPayload,
            startDate: form.startDate,
            paidAmount: form.paidAmount ? Number(form.paidAmount) : 0,
          })).data;
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
          notes: form.notes.trim() || (editSubId ? '' : undefined),
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
          (editOriginal.startDate !== form.startDate || editOriginal.endDate !== form.endDate || editOriginal.typeId !== form.subscriptionTypeId);
        await api.put(`/club-subscriptions/${editSubId}`, {
          ...common,
          ...(datesChanged && selectedType
            ? {
                subscriptionStartDate: form.startDate,
                subscriptionEndDate: form.endDate,
                subscriptionType: selectedType.name,
                subscriptionValue: Number(form.subscriptionValue) || packagePriceForBranch(selectedType, form.branchId || undefined),
                isLinkedToSessions: !!selectedType.isLinkedToSessions,
                sessionsCount: selectedType.isLinkedToSessions
                  ? (Number(form.sessionsCount) || selectedType.sessionsCount || undefined)
                  : undefined,
              }
            : {}),
        });
      } else {
        createdSubscription = (await api.post<ClubSubscriptionListItem>('/club-subscriptions', {
          branchId: effectiveBranchId,
          memberId: form.memberId ? Number(form.memberId) : undefined,
          isWalkIn: walkIn,
          customerName: form.customerName || undefined,
          subscriptionTypeId: form.subscriptionTypeId ? Number(form.subscriptionTypeId) : undefined,
          ...split.payload,
          guardianName: selectedMember?.guardianName || undefined,
          guardianPhone: selectedMember?.guardianPhone || undefined,
          notes: form.notes.trim() || (editSubId ? '' : undefined),
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
        })).data;
      }
      toast.success(ct('common.success'));
      const newReceiptReference = createdSubscription?.receiptNumber || createdSubscription?.subscriptionNumber;
      if (createdSubscription && newReceiptReference && shouldPrint('subscription', createdSubscription.paidAmount, newReceiptReference)) {
        runAutoPrintOnce('subscription', newReceiptReference, () => {
          const printed = printThermalSubscriptionReceipt({
            ...createdSubscription!,
            customerPhone: selectedMember?.phone,
            branchName: formBranchName,
            operatorName: user?.name,
          }, policy);
          if (!printed) toast.warning(ui('تم الحفظ، لكن المتصفح منع نافذة الطباعة. استخدم طباعة الفاتورة من قائمة الاشتراك.'));
        });
      }
      setDialogOpen(false);
      setEditSubId(null);
      setEditSubscription(null);
      invalidateAll();
      if (isolated) navigate('/club/membership-add');
    } catch (e) {
      const conflict = readRenewalConflict(e);
      if (conflict && !isolated) {
        try {
          const existing =
            (data?.data ?? []).find((item) => item.id === conflict.subscriptionId) ??
            (await api.get<ClubSubscriptionListItem>(
              `/club-subscriptions/${conflict.subscriptionId}`,
            )).data;
          setDialogOpen(false);
          setEditSubId(null);
          setEditSubscription(null);
          setRenewTarget(existing);
          setSelectedId(existing.id);
          setRenewOpen(true);
          toast.info(ct('subscriptions.renewConflictRedirect'));
        } catch (loadError) {
          toast.error(apiError(loadError));
        }
      } else {
        toast.error(apiError(e));
      }
    } finally {
      isolatedSaveInFlight.current = false;
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

  const openPaymentFromEdit = () => {
    if (!editSubscription || editSubscription.remainingAmount <= 0) return;
    const subscription = editSubscription;
    setDialogOpen(false);
    setEditSubId(null);
    setEditSubscription(null);
    setEditOriginal(null);
    openPayment(subscription);
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
        receiptNumber: string;
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
      if (shouldPrint('subscriptionPayment', result.paymentAmount, result.receiptNumber)) {
        runAutoPrintOnce('subscriptionPayment', result.receiptNumber, () => printThermalFinancialReceiptWithFallback({
          documentNumber: result.receiptNumber,
          transactionLabel: 'Subscription payment',
          itemName: result.subscription.subscriptionType || 'Membership',
          customerName: result.subscription.customerName,
          memberCode: result.subscription.memberCode,
          branchName: branches?.find((branch) => branch.id === result.subscription.branchId)?.name,
          collectedAmount: result.paymentAmount,
          payments: installmentRows.map((row) => ({ method: row.method, amount: Number(row.amount) || 0 })),
          operatorName: user?.name,
          subscriptionNumber: result.subscription.subscriptionNumber,
        }, policy));
      }
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
      toast.error(ui('أدخل مبلغ إعفاء صحيحًا لا يتجاوز المديونية'));
      return;
    }
    setSaving(true);
    try {
      await api.post(`/club-subscriptions/${selectedId}/waiver`, {
        amount,
        reason: waiverForm.reason.trim() || undefined,
      });
      toast.success(ui('تم تسجيل الإعفاء دون إنشاء أي حركة مالية'));
      setWaiverOpen(false);
      setWaiverSub(null);
      invalidateAll();
      void refetchOutstanding();
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setSaving(false);
    }
  };

  const openRenew = (row: ClubSubscriptionListItem) => {
    setSelectedId(row.id);
    setRenewTarget(row);
    setRenewOpen(true);
  };

  const openFreeze = (id: number) => {
    setSelectedId(id);
    setFreezeForm({ reason: '', days: '' });
    setFreezeOpen(true);
  };

  const submitFreeze = async () => {
    if (!selectedId) return;
    setSaving(true);
    try {
      await api.post(`/club-subscriptions/${selectedId}/freeze`, {
        reason: freezeForm.reason.trim() || undefined,
        days: freezeForm.days ? Number(freezeForm.days) : undefined,
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
    if (!canUpdateSubscriptions) return;
    const subId = Number(transferForm.subscriptionId);
    const typeId = Number(transferForm.toSubscriptionTypeId);
    if (!subId || !typeId || !transferForm.toStartDate) {
      toast.error(ct('members.fillRequired'));
      return;
    }
    if (!transferPreview) {
      toast.error(transferPreviewError || ui('تعذر حساب التحويل'));
      return;
    }
    const additionalPaidAmount = Math.max(0, Number(transferForm.additionalPaidAmount) || 0);
    if (additionalPaidAmount > transferPreview.additionalDue) {
      toast.error(ui('المبلغ المحصل أكبر من فرق التحويل المطلوب'));
      return;
    }
    setSaving(true);
    try {
      await api.post('/club-subscription-transfers', {
        subscriptionId: subId,
        toSubscriptionTypeId: typeId,
        targetSessionsCount: subTypes?.find(type => type.id === typeId)?.isLinkedToSessions ? subTypes?.find(type => type.id === typeId)?.sessionsCount : undefined,
        preservePeriod: Boolean(transferSource?.isLinkedToSessions && subTypes?.find(type => type.id === typeId)?.isLinkedToSessions),
        toStartDate: transferForm.toStartDate,
        reason: transferForm.reason.trim() || undefined,
        additionalPaidAmount,
        startFrom: transferStartFrom,
        ...transferDiscountBody,
        paymentMethod: additionalPaidAmount > 0 ? transferForm.additionalPaymentMethod : undefined,
        refundPaymentMethod: transferPreview.refundAmount > 0
          ? transferForm.refundPaymentMethod
          : undefined,
      });
      toast.success(
        transferPreview.refundAmount > 0
          ? `${ui('تم التحويل ورد ')}${formatMoney(transferPreview.refundAmount)}${ui(' من الخزينة')}`
          : ui('تم تحويل الخطة وإنشاء الاشتراك الجديد'),
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
    if (!canCreateReceipts) return;
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
      const { data: receipt } = await api.post<ReceiptRow>('/club-receipts', {
        memberName: receiptForm.memberName,
        amount: receiptAmount,
        memberId,
        subscriptionId: receiptForm.subscriptionId ? Number(receiptForm.subscriptionId) : undefined,
      });
      toast.success(ct('common.success'));
      if (shouldPrint('subscriptionPayment', receipt.amount, receipt.receiptNumber)) {
        runAutoPrintOnce('subscriptionPayment', receipt.receiptNumber, () => printThermalFinancialReceiptWithFallback({
          documentNumber: receipt.receiptNumber,
          transactionLabel: 'Membership receipt',
          itemName: 'Membership payment',
          customerName: receipt.memberName,
          memberCode: receiptForm.memberCode || null,
          collectedAmount: receipt.amount,
          paymentMethod: receipt.paymentMethod,
          operatorName: user?.name,
          subscriptionNumber: receiptForm.subscriptionId || null,
        }, policy));
      }
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
      {
        accessorKey: 'customerName',
        header: ct('subscriptions.customerName'),
        cell: ({ row }) => (
          <span className="inline-flex items-center gap-1.5">
            {row.original.customerName ?? '—'}
            {row.original.notes ? (
              <button
                type="button"
                className="text-amber-600 hover:text-amber-700 dark:text-amber-400"
                title={row.original.notes}
                aria-label={ct('subscriptions.noteTitle')}
                onClick={() => setNoteSub(row.original)}
              >
                <StickyNote className="size-3.5" />
              </button>
            ) : null}
          </span>
        ),
      },
      { accessorKey: 'subscriptionType', header: ct('subscriptions.subType'), cell: ({ getValue }) => getValue() ?? '—' },
      {
        accessorKey: 'sessionsCount',
        header: ui('عدد الحصص'),
        cell: ({ row }) => row.original.isLinkedToSessions
          ? <span className="nums">{toArabicDigits(row.original.sessionsCount ?? 0)}</span>
          : '—',
      },
      { accessorKey: 'subscriptionValue', header: ui('سعر الاشتراك'), cell: ({ getValue }) => <span className="nums">{formatMoney(getValue() as number)}</span> },
      { accessorKey: 'discountValue', header: ui('قيمة الخصم'), cell: ({ getValue }) => <span className="nums">{formatMoney(getValue() as number)}</span> },
      {
        id: 'netValue',
        header: ui('صافي الاشتراك'),
        cell: ({ row }) => <span className="nums font-medium">{formatMoney(subscriptionNetValue(row.original))}</span>,
      },
      { accessorKey: 'paidAmount', header: ui('المدفوع نقدًا'), cell: ({ getValue }) => <span className="nums text-emerald-700">{formatMoney(getValue() as number)}</span> },
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
              {canUpdateSubscriptions ? (
                <DropdownMenuItem onSelect={() => afterMenuClose(() => setNoteSub(row.original))}>
                  <StickyNote className="size-4" /> {ct(row.original.notes ? 'subscriptions.noteEdit' : 'subscriptions.noteAdd')}
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
                    <ShieldOff className="size-4" /> {ui('إعفاء')}
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
        header: ui('الانتهاء بعد التجميد'),
        cell: ({ row }) => <span className="nums whitespace-nowrap">{toArabicDigits(row.original.projectedSubscriptionEndDate || row.original.subscriptionEndDate)}</span>,
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

  if (isError && !reportFocus && !createOnly) {
    return (
      <div className="space-y-6">
        <PageHeader title={createOnly ? ct('subscriptions.newSub') : ui(pageTitle)} description={ct('subscriptions.description')} />
        <ErrorState message={apiError(error)} onRetry={() => void refetch()} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={createOnly ? ct('subscriptions.newSub') : ui(pageTitle)}
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

      {!createOnly && <>
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
          <TabsTrigger value="followUps"><RefreshCw className="size-4" /> {ui('متابعة التجديدات')}</TabsTrigger>
          <TabsTrigger value="private"><ContactRound className="size-4" /> {ui('قائمة الاشتراكات الخاصة')}</TabsTrigger>
          {canViewReceipts ? <TabsTrigger value="receipts"><FileText className="size-4" /> {ct('subscriptions.tabReceipts')}</TabsTrigger> : null}
          {canViewRefunds ? <TabsTrigger value="refunds"><Undo2 className="size-4" /> {ct('subscriptions.tabRefunds')}</TabsTrigger> : null}
          <TabsTrigger value="transfers"><Repeat className="size-4" /> {ct('subscriptions.tabTransfers')}</TabsTrigger>
          <TabsTrigger value="expiring"><CalendarDays className="size-4" /> {ui('اشتراكات على وشك الانتهاء')}</TabsTrigger>
          <TabsTrigger value="frozen"><Snowflake className="size-4" /> {ui('الاشتراكات الموقوفة')}</TabsTrigger>
          <TabsTrigger value="waivers"><ShieldOff className="size-4" /> {ui('إجمالي الإعفاءات')}</TabsTrigger>
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
            exportSource={{ resource: 'club-subscriptions', params: subscriptionListParams }}
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
            exportSource={{ resource: 'club-subscriptions', params: subscriptionListParams }}
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

        {canViewReceipts ? <TabsContent value="receipts" className="space-y-4 pt-4">
          {canCreateReceipts ? <Button permissionResource="club.subscriptions.receipts" permissionAction="create" variant="outline" onClick={() => { setReceiptForm({ memberName: '', amount: '', memberCode: '', subscriptionId: '' }); setReceiptOpen(true); }}>
            <Plus className="size-4" /> {ct('subscriptions.newReceipt')}
          </Button> : null}
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
        </TabsContent> : null}

        {canViewRefunds ? <TabsContent value="refunds" className="space-y-4 pt-4">
          <SubscriptionRefundsWorkspace />
        </TabsContent> : null}

        <TabsContent value="transfers" className="space-y-4 pt-4">
          <div className="flex flex-wrap gap-2">
            {canUpdateSubscriptions ? <Button permissionResource="club.subscriptions.list" permissionAction="update" variant="outline" onClick={() => {
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
            }}><Plus className="size-4" /> {ct('subscriptions.newTransfer')}</Button> : null}
            {canUpdateSubscriptions ? <Button asChild variant="brand"><Link to="/club/subscriptions/member-transfer"><ArrowRightLeft className="size-4" /> {ui('تحويل الاشتراك بين الأعضاء')}</Link></Button> : null}
          </div>
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="p-3 text-start">{ct('subscriptions.subscriptionId')}</th>
                  <th className="p-3 text-start">{ct('subscriptions.transferFrom')}</th>
                  <th className="p-3 text-start">{ct('subscriptions.transferTo')}</th>
                  <th className="p-3 text-start">{ct('subscriptions.transferDate')}</th>
                  <th className="p-3 text-start">{ui('الرصيد المحول')}</th>
                  <th className="p-3 text-start">{ui('عدد الحصص')}</th>
                  <th className="p-3 text-start">{ui('فرق محصل')}</th>
                  <th className="p-3 text-start">{ui('مردود من الخزينة')}</th>
                </tr>
              </thead>
              <tbody>
                {(transfers ?? []).length === 0 && (
                  <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">{ct('common.noData')}</td></tr>
                )}
                {(transfers ?? []).map((t) => (
                  <tr key={t.id} className="border-t">
                    <td className="p-3 nums">{formatDigits(t.subscription_id)}</td>
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

        <TabsContent value="expiring" className="space-y-4 pt-4">
          <SubscriptionExpiryReports />
        </TabsContent>

        <TabsContent value="followUps" className="space-y-4 pt-4">
          {tab === 'followUps' && <RenewalFollowUpWorkspace />}
        </TabsContent>

        <TabsContent value="waivers" className="space-y-4 pt-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <ClubStatCard label={ui('عدد الإعفاءات')} value={waivers?.summary.count ?? 0} />
            <ClubStatCard label={ui('إجمالي الإعفاءات')} value={formatMoney(waivers?.summary.totalAmount ?? 0)} />
          </div>
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="p-3 text-start">{ui('رقم الاشتراك')}</th>
                  <th className="p-3 text-start">{ui('العميل')}</th>
                  <th className="p-3 text-start">{ui('المبلغ المعفى')}</th>
                  <th className="p-3 text-start">{ui('التاريخ')}</th>
                  <th className="p-3 text-start">{ui('السبب')}</th>
                </tr>
              </thead>
              <tbody>
                {(waivers?.data ?? []).map((row) => (
                  <tr key={row.id} className="border-t">
                    <td className="p-3 nums">{row.subscriptionNumber}</td>
                    <td className="p-3">{row.memberName ?? '—'}</td>
                    <td className="p-3 nums font-medium">{formatMoney(row.amount)}</td>
                    <td className="p-3 nums">{toArabicDigits(row.waiverDate)}</td>
                    <td className="p-3 text-muted-foreground">{row.reason ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!waivers?.data.length ? <p className="py-10 text-center text-sm text-muted-foreground">{ui('لا توجد إعفاءات مسجلة.')}</p> : null}
          </div>
        </TabsContent>

        <TabsContent value="private" className="space-y-4 pt-4">
          <PrivateEnrollmentsList />
        </TabsContent>

        <TabsContent value="reports" className="space-y-6 pt-4">
          {(reportFocus === 'expired' || reportFocus === 'expiring') && (
            <SubscriptionExpiryReports />
          )}
          {(!reportFocus || reportFocus === 'outstanding') && (
          <div>
            <h3 className="mb-3 font-medium">{ct('subscriptions.outstandingReport')}</h3>
            <OutstandingReportFilters branches={branchOptions} />
            <p className="mb-2 text-sm text-muted-foreground nums" aria-live="polite">
              {outstandingIsLoading ? ct('common.loading') : outstandingIsError ? null : <>{toArabicDigits(outstanding?.summary?.count ?? 0)} {ct('subscriptions.tabSubs')}</>}
            </p>
            {outstandingIsError ? (
              <ErrorState inline message={apiError(outstandingError)} onRetry={() => void refetchOutstanding()} />
            ) : (
            <div className="overflow-x-auto rounded-xl border" aria-busy={outstandingIsFetching}>
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="p-2 text-start">{ct('subscriptions.customerName')}</th>
                    <th className="p-2 text-start">{ct('subscriptions.remaining')}</th>
                    <th className="p-2 text-start">{ct('common.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {outstandingIsLoading && (
                    <tr><td colSpan={3} className="p-6 text-center text-muted-foreground">{ct('common.loading')}</td></tr>
                  )}
                  {!outstandingIsLoading && (outstanding?.subscriptions ?? []).length === 0 && (
                    <tr><td colSpan={3} className="p-6 text-center text-muted-foreground">{ct(params.search.trim() || params.filters.branch ? 'subscriptions.outstandingNoMatches' : 'common.noData')}</td></tr>
                  )}
                  {(outstanding?.subscriptions ?? []).map((s) => (
                    <tr key={s.id} className="border-t">
                      <td className="p-2">{s.customerName ?? '—'}</td>
                      <td className="p-2 nums">{toArabicDigits(s.remainingAmount)}</td>
                      <td className="p-2">
                        <div className="flex flex-wrap gap-2">
                          {canPayOutstanding ? <Button permissionAction={null} size="sm" variant="outline" onClick={() => openPayment(s)}>
                            <CreditCard className="size-4" /> {ct('subscriptions.pay')}
                          </Button> : null}
                          {canUpdateSubscriptions ? <Button size="sm" variant="outline" onClick={() => openWaiver(s)}>
                            <ShieldOff className="size-4" /> {ui('إعفاء')}
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
            )}
          </div>
          )}
          {!reportFocus && (
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
      </>}

      <SubscriptionFormFrame inline={createOnly} open={dialogOpen} onOpenChange={setDialogOpen} title={editSubId ? ct('subscriptions.editSub') : ct('subscriptions.newSub')}>
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
                <p className="font-semibold">{ui('نوع الاشتراك')}</p>
                <p className="mt-1 text-sm text-muted-foreground">{ui('اختر المسار أولًا لإظهار الباقات أو الحصص المطلوبة.')}</p>
              </div>
              <div className="mx-auto grid w-full max-w-5xl gap-3 sm:grid-cols-2">
                {([
                  { value: 'package', label: ui('اشتراك'), description: ui('الباقات العادية'), icon: Package },
                  { value: 'sessions', label: ui('حصص'), description: ui('باقات الحصص في الباقات والأسعار'), icon: Dumbbell },
                  { value: 'private', label: ui('اشتراكات برايفت'), description: ui('اشتراكات وحصص برايفت مع مدرب خاص'), icon: ContactRound },
                  { value: 'special', label: ui('اشتراكات خاصة'), description: ui('عدد حصص ومدة مرتبطة بجدول المدربين'), icon: Sparkles },
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
                  isolated={isolated}
                    selectedMember={selectedMember}
                    onSelect={(member) => {
                      setSelectedMember(member);
                      setForm((f) => ({
                        ...f,
                        memberId: String(member.id),
                        customerName: member.name,
                        gender: member.gender ?? f.gender,
                        branchId: member.branchId || f.branchId,
                        // A plan picked for another branch is not sellable to this member.
                        ...(f.branchId && member.branchId && f.branchId !== member.branchId
                          ? {
                              subscriptionTypeId: '',
                              subscriptionValue: '',
                              endDate: '',
                              isLinkedToSessions: false,
                              sessionsCount: '',
                            }
                          : {}),
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
                    <span className="nums text-muted-foreground"> · {formatDigits(selectedMember.phone)}</span>
                  )}
                </div>
              )}
            </DialogFormSection>

            <Tabs defaultValue="details" className="space-y-4">
              <TabsList className="grid h-auto w-full grid-cols-3">
                <TabsTrigger value="details">{ui('بيانات الاشتراك')}</TabsTrigger>
                <TabsTrigger value="discount">{ui('كود خصم')}</TabsTrigger>
                <TabsTrigger value="payment">{ui('الدفع')}</TabsTrigger>
              </TabsList>
              <TabsContent value="details" className="mt-0 space-y-4">
            {subscriptionKind === 'special' ? (
              <DialogFormSection title={ui('الاشتراك الخاص')} icon={CalendarDays}>
                <DialogFormGrid>
                  <FieldWrapper label={ui('نوع الاشتراك الخاص')} required>
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
                          endDate: selectedClass ? addDaysLocal(current.startDate, 29) : '',
                          subscriptionValue: selectedClass
                            ? String(
                                selectedClass.singleSessionPrice *
                                  Math.max(1, selectedClass.subscriptionSessionsCount ?? 1),
                              )
                            : '',
                        }));
                      }}
                    >
                      <option value="">{ui('اختر الاشتراك الخاص')}</option>
                      {(specialClassTypes ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                    </select>
                  </FieldWrapper>
                  <FieldWrapper label={ct('subscriptions.startDate')} required>
                    <Input type="date" className="nums" dir="ltr" aria-label={ct('subscriptions.startDate')} value={form.startDate} onChange={(event) => changeSubscriptionDate('startDate', event.target.value)} />
                  </FieldWrapper>
                  {(() => {
                    const item = specialClassTypes?.find((classType) => classType.id === Number(form.specialClassTypeId));
                    if (!item) return null;
                    return <>
                      <FieldWrapper label={ui('عدد الحصص')} required>
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
                      <FieldWrapper label={ui('مدة صلاحية الاشتراك (يوم)')} required>
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
                                  ? addDaysLocal(current.startDate, Math.max(1, parsedDays) - 1)
                                  : '',
                            }));
                          }}
                        />
                      </FieldWrapper>
                      <FieldWrapper label={ct('subscriptions.endDate')}>
                        <Input type="date" className={cn('nums', !editSubId && 'bg-muted')} dir="ltr" aria-label={ct('subscriptions.endDate')} aria-describedby={editSubId ? 'special-subscription-date-sync-hint' : undefined} value={form.endDate} readOnly={!editSubId} onChange={(event) => changeSubscriptionDate('endDate', event.target.value)} />
                        {editSubId && <p id="special-subscription-date-sync-hint" className="text-sm text-muted-foreground">{ct('subscriptions.dateSyncHint')}</p>}
                      </FieldWrapper>
                      <FieldWrapper label={ui('سعر الحصة')}><Input className="nums bg-muted" value={toArabicDigits(item.singleSessionPrice)} readOnly /></FieldWrapper>
                    </>;
                  })()}
                </DialogFormGrid>
                {(() => {
                  const item = specialClassTypes?.find((classType) => classType.id === Number(form.specialClassTypeId));
                  if (!item) return null;
                  const days = [ui('الأحد'), ui('الإثنين'), ui('الثلاثاء'), ui('الأربعاء'), ui('الخميس'), ui('الجمعة'), ui('السبت')];
                  return (
                    <div className="mt-4 rounded-xl border border-primary/20 bg-primary/5 p-4">
                      <p className="font-semibold">{ui('جدول المدربين المتاح للكلاس')}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{ui('لا يلزم حجز موعد. عند حضور العضو، يطابق الاستقبال الموعد الحالي تلقائيًا ويسجل الحضور مع المدرب.')}</p>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        {(item.trainerScheduleSlots ?? []).map((slot, index) => {
                          const trainer = item.eligibleTrainers.find((candidate) => candidate.id === slot.trainerId);
                          return <div key={slot.id ?? `${slot.trainerId}-${index}`} className="rounded-lg border bg-background px-3 py-2 text-sm"><b>{trainer?.name ?? ui('مدرب')}</b><span className="text-muted-foreground"> · {days[slot.weekday]} · <span className="nums">{formatTime(slot.startTime)} - {formatTime(slot.endTime)}</span></span></div>;
                        })}
                      </div>
                    </div>
                  );
                })()}
              </DialogFormSection>
            ) : subscriptionKind === 'private' ? (
              <DialogFormSection title={ui('اشتراك برايفت مع مدرب خاص')} icon={ContactRound}>
                <DialogFormGrid>
                  <FieldWrapper label={ui('نوع الاشتراك')} required className="sm:col-span-2">
                    <Combobox
                      value={form.privatePackageId}
                      onValueChange={(privatePackageId) => setForm((current) => ({ ...current, privatePackageId }))}
                      options={privatePackageOptions}
                      placeholder={ui('اختر اشتراك البرايفت')}
                      searchPlaceholder={ui('ابحث باسم الاشتراك أو السعر…')}
                      emptyText="لا توجد اشتراكات برايفت مطابقة"
                      aria-label={ui('نوع اشتراك البرايفت')}
                      className="h-11"
                    />
                    {selectedMember && visiblePrivatePackages.length === 0 ? (
                      <p className="mt-2 text-xs text-destructive">
                        لا توجد باقات برايفت مفعلة لفرع هذا العضو. أضف الفرع للباقة من تبويب اشتراكات برايفت أولًا.
                      </p>
                    ) : null}
                  </FieldWrapper>
                  <FieldWrapper label={ui('مدة الاشتراك من')} required><Input type="date" className="nums" dir="ltr" value={form.startDate} onChange={(event) => setForm((current) => ({ ...current, startDate: event.target.value }))} /></FieldWrapper>
                  <FieldWrapper label={ui('مدة الاشتراك إلى')}><Input type="date" className="nums bg-muted" dir="ltr" value={form.endDate} readOnly /></FieldWrapper>
                  <FieldWrapper label={ui('قيمة الاشتراك')}><Input className="nums bg-muted" value={form.subscriptionValue} readOnly /></FieldWrapper>
                  <FieldWrapper label={ui('رجالي - حريمي')} required><select className={selectCls} value={form.gender} onChange={(event) => setForm((current) => ({ ...current, gender: event.target.value as 'male' | 'female' }))}><option value="male">{ui('رجالي')}</option><option value="female">{ui('حريمي')}</option></select></FieldWrapper>
                  <FieldWrapper label={ui('الكابتن')} required className="sm:col-span-2">{loadingPrivateTrainers && <p role="status">{ct('common.loading')}</p>}{privateTrainersError && <div role="alert"><p>{ct('subscriptions.trainerLoadError')}</p><Button type="button" variant="outline" onClick={() => void refetchPrivateTrainers()}>{ct('common.retry')}</Button></div>}<select className={selectCls} value={form.privateTrainerId} onChange={(event) => setForm((current) => ({ ...current, privateTrainerId: event.target.value }))}><option value="">{ui('اختر الكابتن')}</option>{privateTrainers.map((trainer) => <option key={trainer.id} value={trainer.id}>{trainer.name}{trainer.specialization ? ` — ${trainer.specialization}` : ''}</option>)}</select></FieldWrapper>
                  {(() => {
                    const selectedPackage = privatePackages.find((item) => item.id === Number(form.privatePackageId));
                    if (selectedPackage?.kind !== 'sessions') return null;
                    const max = Math.max(1, selectedPackage.sessionsCount ?? 1);
                    return (
                      <FieldWrapper label={ui('عدد الحصص')} required>
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
                                  ? String(
                                      resolveSessionMatrixPrice({
                                        packagePrice: selectedPackage.price,
                                        maxSessions: max,
                                        selectedSessions: count,
                                        matrix: selectedPackage.sessionPrices,
                                      }),
                                    )
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
                      setForm((f) => {
                        const type = subTypes?.find((item) => item.id === Number(typeId));
                        return {
                          ...f,
                          subscriptionTypeId: typeId,
                          endDate: type
                            ? shiftSubscriptionDate(f.startDate, Math.max(0, (type.days > 0 ? type.days : type.isLinkedToSessions ? 30 : 1) - 1))
                            : f.endDate,
                        };
                      })
                    }
                  />
                </FieldWrapper>
                <FieldWrapper label={ct('subscriptions.startDate')} required>
                  <Input type="date" className="nums" dir="ltr" aria-label={ct('subscriptions.startDate')} value={form.startDate} onChange={(e) => changeSubscriptionDate('startDate', e.target.value)} />
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
                                          packagePrice: packagePriceForBranch(selectedType, form.branchId || undefined),
                                          maxSessions: max,
                                          selectedSessions: count,
                                          matrix: sessionMatrixForBranchPrice(
                                            selectedType.sessionPrices,
                                            selectedType.price,
                                            packagePriceForBranch(selectedType, form.branchId || undefined),
                                          ),
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
                        <Input type="date" className={cn('nums', !editSubId && 'bg-muted')} dir="ltr" aria-label={ct('subscriptions.endDate')} aria-describedby={editSubId ? 'subscription-date-sync-hint' : undefined} value={form.endDate} readOnly={!editSubId} onChange={(e) => changeSubscriptionDate('endDate', e.target.value)} />
                        {editSubId && <p id="subscription-date-sync-hint" className="text-sm text-muted-foreground">{ct('subscriptions.dateSyncHint')}</p>}
                      </FieldWrapper>
                    </>
                  );
                })()}
              </DialogFormGrid>
            </DialogFormSection>
            )}

            <FieldWrapper label={ct('subscriptions.noteTitle')}>
              <Textarea
                rows={3}
                maxLength={2000}
                value={form.notes}
                placeholder={ct('subscriptions.notePlaceholder')}
                onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
              />
            </FieldWrapper>

              </TabsContent>

              <TabsContent value="discount" className="mt-0">
                <DialogFormSection title={ui('كود خصم أو قيمة خصم')} icon={Sparkles}>
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
                  <p className="mb-3 text-sm font-semibold">{ui('ملخص الاشتراك قبل التحصيل')}</p>
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
                        ? [{ label: ui('الخصم'), value: formatMoney(formDiscountValue), accent: 'warning' as const }]
                        : []),
                      { label: ui('صافي المستحق'), value: formatMoney(formNetValue), accent: 'success' as const },
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
                      onChange={(rows) => {
                        const previous = paymentRows.map((row) => row.amount).join('|');
                        const next = rows.map((row) => row.amount).join('|');
                        if (previous !== next) paidAmountEdited.current = true;
                        setPaymentRows(rows);
                      }}
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
                    { label: ui('قيمة الخصم'), value: toArabicDigits(formDiscountValue) },
                    { label: ui('صافي الاشتراك'), value: toArabicDigits(formNetValue) },
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
            <Button variant="outline" onClick={() => createOnly ? navigate('/club/membership-add') : setDialogOpen(false)}>{ct('common.cancel')}</Button>
            {editSubId && editSubscription && (editRemainingAmount ?? 0) > 0 && canUpdateSubscriptions ? (
              <Button variant="outline" onClick={openPaymentFromEdit}>
                <CreditCard className="size-4" /> {ct('subscriptions.pay')}
              </Button>
            ) : null}
            {(editSubId ? canUpdateSubscriptions : canCreateSubscriptions) ? (
              <Button permissionAction={editSubId ? 'update' : 'create'} variant="brand" onClick={() => void saveSub()} disabled={saving}>{saving ? ct('common.saving') : ct('common.save')}</Button>
            ) : null}
          </FormDialogFooter>
        
      </SubscriptionFormFrame>

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
          <DialogHeader><DialogTitle>{ui('إعفاء من المديونية')}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
              <p className="font-medium">{ui('هذا الإجراء لا يُعتبر سدادًا.')}</p>
              <p className="mt-1 text-muted-foreground">{ui('سيتم تخفيض المديونية فقط، بدون إيصال أو إيراد أو حركة خزينة أو قيد محاسبي.')}</p>
            </div>
            {waiverSub ? <DialogFormSummary items={[{ label: ui('العميل'), value: waiverSub.customerName ?? '—' }, { label: ui('المديونية الحالية'), value: formatMoney(waiverSub.remainingAmount), accent: 'warning' }]} /> : null}
            <FieldWrapper label={ui('المبلغ المعفى')} required><Input type="number" min={0.01} max={waiverSub?.remainingAmount} step="0.01" className="nums text-lg" value={waiverForm.amount} onChange={(event) => setWaiverForm((current) => ({ ...current, amount: event.target.value }))} /></FieldWrapper>
            <FieldWrapper label={ui('سبب الإعفاء')}><Input value={waiverForm.reason} onChange={(event) => setWaiverForm((current) => ({ ...current, reason: event.target.value }))} placeholder={ui('اختياري')} /></FieldWrapper>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setWaiverOpen(false)}>{ui('إلغاء')}</Button><Button variant="brand" onClick={() => void waive()} disabled={saving}><ShieldOff className="size-4" /> {ui('تأكيد الإعفاء')}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={transferOpen && canUpdateSubscriptions} onOpenChange={setTransferOpen}>
        <DialogContent size="lg" aria-describedby={undefined}>
          <DialogHeader><DialogTitle>{ct('subscriptions.newTransfer')}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <DialogFormGrid>
              <FieldWrapper label={ui('الاشتراك الحالي')} required>
                <select
                  className={selectCls}
                  value={transferForm.subscriptionId}
                  onChange={(event) => setTransferForm((current) => ({
                    ...current,
                    subscriptionId: event.target.value,
                    toSubscriptionTypeId: '',
                  }))}
                >
                  <option value="">{ui('اختر الاشتراك النشط')}</option>
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
              <FieldWrapper label={ct('subscriptions.startDate')} required>
                <Input type="date" readOnly={transferPreview?.pricingMode === 'price_difference'} value={transferPreview?.pricingMode === 'price_difference' ? transferPreview.toStartDate : transferForm.toStartDate} onChange={(event) => setTransferForm((current) => ({ ...current, toStartDate: event.target.value }))} />
              </FieldWrapper>
              <FieldWrapper label={ui('سبب التحويل')}>
                <Input value={transferForm.reason} onChange={(event) => setTransferForm((current) => ({ ...current, reason: event.target.value }))} placeholder={ui('اختياري')} />
              </FieldWrapper>
            </DialogFormGrid>

            {transferForm.toSubscriptionTypeId && transferCanChooseStart ? (
              <PlanTransferStartChoice
                value={transferStartFrom}
                originalStartDate={transferSource?.subscriptionStartDate}
                disabled={saving}
                onChange={(next) => {
                  setTransferStartFrom(next);
                  if (next === 'today') setTransferForm((current) => ({ ...current, toStartDate: localToday() }));
                }}
              />
            ) : null}

            {transferForm.toSubscriptionTypeId && transferTargetValue > 0 ? (
              <PlanTransferDiscountFields
                open={transferOpen}
                grossValue={transferTargetValue}
                value={transferDiscount}
                appliedDiscount={transferPreview?.discountValue}
                requestedDiscount={transferPreview?.requestedDiscountValue}
                disabled={saving}
                onChange={setTransferDiscount}
              />
            ) : null}

            {transferPreviewError ? (
              <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                {transferPreviewError}
              </p>
            ) : null}

            {transferPreview ? (
              <div className="space-y-4 rounded-2xl border bg-muted/15 p-4">
                {transferPreview.pricingMode === 'price_difference' && <p className="text-sm text-muted-foreground">{ct('subscriptions.transferPriceDifferenceHelp')}</p>}
                <DialogFormSummary
                  items={[
                    ...(transferPreview.pricingMode === 'price_difference' ? [] : [{
                      label: transferPreview.consumedSessions
                        ? `${ui('المستهلك من الخطة القديمة')} (${toArabicDigits(transferPreview.consumedSessions)}${ui(' حصة')})`
                        : ui('المستهلك من الخطة القديمة'),
                      value: formatMoney(transferPreview.consumedValue),
                    }]),
                    { label: transferPreview.pricingMode === 'price_difference' ? ct('subscriptions.transferPaidCredit') : ui('الرصيد القابل للتحويل'), value: formatMoney(transferPreview.transferableCredit), accent: 'success' },
                    ...(transferPreview.targetSessionsCount != null
                      ? [{ label: ui('الحصص الناتجة'), value: `${toArabicDigits(transferPreview.targetSessionsCount)}${ui(' حصة')}` }]
                      : [{ label: ui('قيمة الخطة الجديدة'), value: formatMoney(transferPreview.targetValue) }]),
                    { label: ui('الرصيد المستخدم'), value: formatMoney(transferPreview.creditApplied) },
                    ...((transferPreview.discountValue ?? 0) > 0
                      ? [{ label: ui('الخصم'), value: `− ${formatMoney(transferPreview.discountValue ?? 0)}`, accent: 'success' as const }]
                      : []),
                    { label: ui('فرق مطلوب تحصيله'), value: formatMoney(transferPreview.additionalDue), accent: 'warning' },
                    { label: ui('مبلغ يُرد من الخزينة'), value: formatMoney(transferPreview.refundAmount), accent: transferPreview.refundAmount > 0 ? 'warning' : undefined },
                  ]}
                />
                {transferPreview.targetSessionsCount != null ? (
                  <p className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm">
                    {ui('الباقة الجديدة تشمل ')}<b>{toArabicDigits(transferPreview.targetSessionsCount)} {ui('حصة')}</b>
                    {transferPreview.pricingMode === 'price_difference' && transferSource?.isLinkedToSessions ? <>{ui('؛ الحصص المستخدمة: ')}{toArabicDigits(transferPreview.consumedSessions ?? 0)}{ui('، والمتبقي: ')}{toArabicDigits(Math.max(0, transferPreview.targetSessionsCount - (transferPreview.consumedSessions ?? 0)))}</> : null}
                    {transferPreview.targetUnitPrice != null ? `${ui(' بسعر ')}${formatMoney(transferPreview.targetUnitPrice)}${ui(' للحصة')}` : ''}
                    {transferPreview.refundAmount > 0 ? `${ui('، ويتبقى ')}${formatMoney(transferPreview.refundAmount)}${ui(' تُرد فعليًا من الخزينة.')}` : '.'}
                  </p>
                ) : null}
                {transferPreview.additionalDue > 0 ? (
                  <DialogFormGrid>
                    <FieldWrapper label={ui('المبلغ المحصل الآن')}>
                      <Input type="number" min={0} max={transferPreview.additionalDue} step="0.01" className="nums" value={transferForm.additionalPaidAmount} onChange={(event) => setTransferForm((current) => ({ ...current, additionalPaidAmount: event.target.value }))} />
                    </FieldWrapper>
                    <FieldWrapper label={ui('طريقة تحصيل الفرق')}>
                      <ClubPaymentMethodSelect value={transferForm.additionalPaymentMethod} onChange={(method) => setTransferForm((current) => ({ ...current, additionalPaymentMethod: method }))} />
                    </FieldWrapper>
                  </DialogFormGrid>
                ) : null}
                {transferPreview.refundAmount > 0 ? (
                  <FieldWrapper label={ui('طريقة رد المتبقي من الخزينة')}>
                    <ClubPaymentMethodSelect value={transferForm.refundPaymentMethod} onChange={(method) => setTransferForm((current) => ({ ...current, refundPaymentMethod: method }))} />
                  </FieldWrapper>
                ) : null}
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransferOpen(false)}>{ct('common.cancel')}</Button>
            <Button permissionResource="club.subscriptions.list" permissionAction="update" variant="brand" onClick={() => void saveTransfer()} disabled={saving || !transferPreview}>{ct('common.save')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={receiptOpen && canCreateReceipts} onOpenChange={setReceiptOpen}>
        <DialogContent size="sm" aria-describedby={undefined}>
          <DialogHeader><DialogTitle>{ct('subscriptions.newReceipt')}</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <Input placeholder={ct('subscriptions.customerName')} value={receiptForm.memberName} onChange={(e) => setReceiptForm((f) => ({ ...f, memberName: e.target.value }))} />
            <Input className="nums" type="number" min={0} step="any" placeholder={ct('common.amount')} value={receiptForm.amount} onChange={(e) => setReceiptForm((f) => ({ ...f, amount: e.target.value }))} />
            <Input className="font-mono" dir="ltr" placeholder={ct('subscriptions.memberIdOptional')} value={receiptForm.memberCode} onChange={(e) => setReceiptForm((f) => ({ ...f, memberCode: e.target.value }))} />
            <Input className="nums" placeholder={ct('subscriptions.subscriptionId')} value={receiptForm.subscriptionId} onChange={(e) => setReceiptForm((f) => ({ ...f, subscriptionId: e.target.value }))} />
          </div>
          <DialogFooter>
            <Button permissionResource="club.subscriptions.receipts" permissionAction="create" variant="brand" onClick={() => void saveReceipt()} disabled={saving}>{ct('common.save')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={freezeOpen} onOpenChange={setFreezeOpen}>
        <DialogContent size="sm" aria-describedby={undefined}>
          <DialogHeader><DialogTitle>{ct('subscriptions.freezeTitle')}</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <p className="text-sm text-muted-foreground">{ct('subscriptions.freezePreserveHint')}</p>
            <div className="grid gap-2">
              <Label htmlFor="subscription-freeze-days">{ui('مدة التجميد بالأيام')}</Label>
              <Input id="subscription-freeze-days" type="number" min="1" step="1" inputMode="numeric" aria-invalid={freezeDaysInvalid} value={freezeForm.days}
                aria-describedby="subscription-freeze-days-hint"
                onChange={event => setFreezeForm(form => ({ ...form, days: event.target.value }))} />
              <p id="subscription-freeze-days-hint" className="text-sm text-muted-foreground">{ui('سيب المدة فاضية للتجميد حتى فكّه أو نهاية رصيد التجميد المسموح.')}</p>
            </div>
            <FreezeExpiryPreview endDate={freezePreview?.subscriptionEndDate} days={Number(freezeForm.days) || freezePreview?.remainingDays || 0} />
            {freezePreviewLoading && <p role="status">{ct('common.loading')}</p>}
            {freezePreviewError && <div role="alert"><p>{ct('subscriptions.freezePreviewError')}</p><Button variant="outline" onClick={() => void retryFreezePreview()}>{ct('common.retry')}</Button></div>}
            {freezePreview && <div className="grid gap-2 text-sm" aria-live="polite">
              <p className="font-medium">{freezePreview.customerName} · {freezePreview.subscriptionNumber}</p>
              <p>{ct('subscriptions.freezeBalance', { days: freezePreview.remainingDays ?? ct('subscriptions.unlimited'), times: freezePreview.remainingTimes ?? ct('subscriptions.unlimited') })}</p>
              {freezePreview.minDays > 0 && <p>{ct('subscriptions.freezeMinimum', { days: freezePreview.minDays })}</p>}
              {freezePreview.plannedEndDate && <p>{ct('subscriptions.freezeAutomaticEnd', { date: freezePreview.plannedEndDate })}</p>}
              {freezePreview.queuedRenewals > 0 && <p>{ct('subscriptions.freezeRenewalImpact', { count: freezePreview.queuedRenewals })}</p>}
              <p className="text-muted-foreground">{ct('subscriptions.freezeBookingsHint')}</p>
              {freezePreview.blockedReason && <p role="alert" className="text-destructive">{freezePreview.blockedReason}</p>}
            </div>}
            <div className="grid gap-2">
              <Label htmlFor="subscription-freeze-reason">{ct('subscriptions.freezeReason')}</Label>
              <Input
                id="subscription-freeze-reason"
                value={freezeForm.reason}
                onChange={(e) => setFreezeForm((f) => ({ ...f, reason: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFreezeOpen(false)}>{ct('common.cancel')}</Button>
            <Button variant="brand" onClick={() => void submitFreeze()} disabled={freezeDaysInvalid || saving || freezePreviewLoading || freezePreviewError || !freezePreview || !!freezePreview.blockedReason}>
              {saving ? ct('common.saving') : ct('subscriptions.freeze')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SubscriptionRenewalDialog
        source={renewTarget}
        open={renewOpen}
        onOpenChange={(open) => {
          setRenewOpen(open);
          if (!open) setRenewTarget(null);
        }}
        onSuccess={({ subscription, quote, payments }) => {
          toast.success(
            quote.scheduleMode === 'immediate' || quote.scheduleMode === 'from_today'
              ? ct('subscriptions.renewSuccessNow')
              : ct('subscriptions.renewSuccessScheduled', {
                  date: toArabicDigits(quote.startDate),
                }),
          );
          const receiptNumber = subscription.receiptNumber || subscription.subscriptionNumber;
          if (shouldPrint('subscriptionPayment', quote.paidAmount, receiptNumber)) {
            runAutoPrintOnce('subscriptionPayment', receiptNumber, () => printThermalFinancialReceiptWithFallback({
              documentNumber: receiptNumber,
              transactionLabel: 'Subscription renewal',
              itemName: subscription.subscriptionType || 'Membership renewal',
              customerName: subscription.customerName,
              memberCode: subscription.memberCode,
              branchName: branches?.find((branch) => branch.id === subscription.branchId)?.name,
              collectedAmount: quote.paidAmount,
              payments: payments.map((row) => ({ method: row.method, amount: Number(row.amount) || 0 })),
              operatorName: user?.name,
              subscriptionNumber: subscription.subscriptionNumber,
            }, policy));
          }
          invalidateAll();
        }}
      />

      <SubscriptionNoteDialog
        subscription={noteSub}
        onOpenChange={(open) => !open && setNoteSub(null)}
        onSaved={() => invalidateAll()}
      />

      <SubscriptionInvoicePrint
        open={!!printSub}
        onOpenChange={(open) => !open && setPrintSub(null)}
        subscription={printSub}
        receipts={printSub ? subscriptionReceipts : []}
      />
    </div>
  );
}
