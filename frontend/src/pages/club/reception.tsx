import { FreezeExpiryPreview } from '@/components/club/freeze-expiry-preview';
import { EntrySoundSettings } from '@/components/club/entry-sound-settings';
import { prepareEntrySound, playEntrySound } from '@/lib/entry-sounds';
import { isEntryRejection } from '@/lib/entry-sound-player';
import { ReceptionEntryAlerts as EntryAlerts } from '@/components/club/reception-entry-alerts';
import { receptionSearchOptions, useReceptionMemberSearch } from '@/hooks/use-reception-member-search';
import {
  AlertTriangle,
  ArrowRightLeft,
  Ban,
  Building2,
  CheckCircle2,
  CreditCard,
  LogIn,
  LockKeyhole,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  Snowflake,
  Sun,
  Undo2,
  XCircle,
  Zap,
  StickyNote,
  TicketPlus,
} from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Maximize2, Minimize2 } from 'lucide-react';
import { usePersistentScanner } from '@/components/club/persistent-scanner';
import { MemberAvatar } from '@/components/club/member-avatar';
import { MemberProfileSheet } from '@/components/club/member-profile-sheet';
import { type ClubPaymentMethod } from '@/components/club/club-payment-method-select';
import {
  buildClubPaymentSplit,
  ClubPaymentSplitFields,
  singlePaymentRow,
  type ClubPaymentSplitRow,
} from '@/components/club/club-payment-split-fields';
import { ReceptionDailyAttendanceTable as DailyAttendanceTable } from '@/components/club/reception-daily-attendance-table';
import {
  ReceptionMemberSearchBox,
  type ReceptionMemberSearchBoxHandle,
} from '@/components/club/reception-member-search-box';
import { MemberLockerAssign, ReceptionLockerDeskButton } from '@/components/club/reception-locker-desk';
import { ReceptionClassDesk } from '@/components/club/reception-class-desk';
import { GuestInvitationDialog, useInvitationSummary } from '@/components/club/guest-invitation-dialog';
import { ScheduledClassCaptainChip } from '@/components/club/scheduled-class-captain-chip';
import {
  AttendanceSummaryCards,
  useClubAttendanceStatistics,
} from '@/components/club/attendance-summary-cards';
import { TransferPlanPicker } from '@/components/club/transfer-plan-picker';
import {
  NO_PLAN_TRANSFER_DISCOUNT,
  PlanTransferDiscountFields,
  planTransferDiscountBody,
  type PlanTransferDiscount,
} from '@/components/club/plan-transfer-discount';
import { SubscriptionRenewalDialog } from '@/components/club/subscription-renewal-dialog';
import { SubscriptionNoteDialog } from '@/components/club/subscription-note-dialog';
import { PlanTransferStartChoice, type PlanTransferStartFrom } from '@/components/club/plan-transfer-start-choice';
import { PageHeader } from '@/components/common/page-header';
import { PendingGateEntries as GateEntries } from '@/components/club/pending-gate-entries';
import { ReceptionGateControl as GateControl } from '@/components/club/reception-gate-control';
import { FieldWrapper } from '@/components/common/form-fields';
import {
  SubscriptionPaymentPanel,
  subscriptionNetValue,
  type SubscriptionPaymentReceiptRow,
} from '@/components/club/subscription-payment-panel';
import { WorkspaceWidgets as Widgets } from '@/components/workspace/workspace-widgets';
import { StatusBadge } from '@/components/common/status-badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { DialogFormSummary } from '@/components/common/dialog-form-layout';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useClubT } from '@/hooks/use-club-t';
import { useBranches } from '@/hooks/use-branches';
import { usePermission } from '@/hooks/use-permission';
import { api, apiError } from '@/lib/api';
import { useArrayResource } from '@/lib/api-hooks';
import { CLUB_ROUTES as CR } from '@/lib/club-routes';
import { confirm, confirmWithPreview } from '@/lib/confirm';
import { formatMoney, localToday } from '@/lib/formatters';
import { invitationBalanceForSubscription } from '@/lib/guest-invitation-model';
import { subscriptionTypesForBranch } from '@/lib/club-subscription-branches';
import {
  isReceptionSubscriptionExpired,
  selectReceptionSubscriptions,
} from '@/lib/reception-subscription-visibility';
import { cn, toArabicDigits, formatDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';
import { useAuth } from '@/store/auth';
import { useClubPrintingPolicy } from '@/hooks/use-club-printing-policy';
import { printThermalFinancialReceiptWithFallback } from '@/components/club/thermal-receipt-print';
import { runAutoPrintOnce } from '@/lib/club-printing';
import {
  consumeReceptionScan,
  isReceptionSearchReady,
  normalizeReceptionScanCode,
  pickReceptionScanHit,
} from '@/lib/reception-scan';
import type { ClubMemberListItem, ClubSubscriptionListItem, ClubSubscriptionType } from '@/types/club';
import type {
  CheckInResponse,
  ClubSearchHit,
  EntitlementReason,
  EntitlementResult,
  RecentCheckIn,
} from '@/types/gym-ops';
import type { ClubQuickServiceRow } from './reception-quick-services';
import { uiStatic } from '@/lib/ui-static';

// Editing a member form must not redraw unrelated reception panels. Their own
// queries, permission updates and locale changes still refresh them normally.
const ReceptionDailyAttendanceTable = memo(DailyAttendanceTable);
const ReceptionEntryAlerts = memo(EntryAlerts);
const PendingGateEntries = memo(GateEntries);
const ReceptionGateControl = memo(GateControl);
const WorkspaceWidgets = memo(Widgets);

const GRACE_REASON_PRESETS = [
  uiStatic('جلسة سماح بعد انتهاء الاشتراك'),
  uiStatic('تجديد قيد الإجراء'),
  uiStatic('موافقة الإدارة'),
] as const;
/** Reception may work one section at a time: men, women, or everyone. */
type ReceptionGenderFilter = '' | 'female' | 'male';

const selectCls =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

function addDaysLocal(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00`);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

type RefundPreview = {
  subscriptionId: number;
  stopDate: string;
  remainingDays: number;
  remainingSessions: number | null;
  refundBasis: 'days' | 'sessions';
  refundAmount: number;
  originalValue: number;
  totalDays: number;
  consumedDays: number;
  consumedValue: number;
  paidAmount?: number;
};

function EntitlementBanner({
  entitlement,
  canGrace,
  onGrace,
}: {
  entitlement: EntitlementResult;
  canGrace?: boolean;
  onGrace?: () => void;
}) {
  const { ui, locale } = useLocale();
  const blocking = entitlement.reasons.filter((r) => r.severity === 'block');
  const warnings = [...entitlement.warnings, ...entitlement.reasons.filter((r) => r.severity === 'warn')];
  const outstanding = entitlement.activeSubscription?.remainingAmount ?? 0;
  const latest = entitlement.latestSubscription ?? entitlement.activeSubscription;
  const endDate = latest?.projectedEndDate || latest?.endDate;

  const reasonLabel = (r: EntitlementReason) => {
    if (r.code === 'outstanding_balance' && outstanding > 0) {
      return `${ui('عليه مبلغ متبقٍ')}: ${formatMoney(outstanding, undefined, locale)}`;
    }
    return locale === 'en' ? r.messageEn : r.messageAr;
  };

  if (entitlement.allowed && warnings.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2.5 text-sm text-emerald-800 dark:text-emerald-200">
        <CheckCircle2 className="size-5 shrink-0" />
        <span>{ui('مسموح بالدخول — اشتراك نشط')}</span>
      </div>
    );
  }

  if (!entitlement.allowed) {
    return (
      <div className="space-y-3 rounded-xl border border-destructive/35 bg-destructive/10 px-3 py-2.5">
        <div className="flex items-center gap-2 font-medium text-destructive">
          <XCircle className="size-5" />
          <span>{ui('الدخول مرفوض')}</span>
        </div>
        <ul className="list-inside list-disc text-sm text-destructive/90">
          {blocking.map((r) => (
            <li key={r.code}>{reasonLabel(r)}</li>
          ))}
        </ul>
        {endDate ? (
          <p className="rounded-lg bg-background/60 px-2.5 py-1.5 text-sm font-medium text-destructive nums">
            {ui('تاريخ انتهاء الاشتراك')}: {toArabicDigits(endDate)}
            {latest?.subscriptionType ? ` — ${latest.subscriptionType}` : ''}
          </p>
        ) : null}
        {canGrace && onGrace ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-destructive/40 text-destructive hover:bg-destructive/10"
            onClick={onGrace}
          >
            {ui('جلسة سماح / تجاوز')}
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-1 rounded-xl border border-amber-500/35 bg-amber-500/10 px-3 py-2.5 text-sm">
      <div className="flex items-center gap-2 font-medium text-amber-800 dark:text-amber-200">
        <AlertTriangle className="size-5" />
        <span>{ui('مسموح مع تحذيرات')}</span>
      </div>
      <ul className="list-inside list-disc text-amber-900/80 dark:text-amber-100/80">
        {warnings.map((r) => (
          <li key={r.code}>{reasonLabel(r)}</li>
        ))}
      </ul>
    </div>
  );
}


export function ClubReceptionPage() {
  const { ui } = useLocale();
  const ct = useClubT();
  const { can } = usePermission();
  const { user } = useAuth();
  const { policy, shouldPrint } = useClubPrintingPolicy();
  const isSystemAdmin = user?.level === 1;
  const { data: branches = [] } = useBranches();
  const canCheckIn =
    can('club.reception:create') ||
    can('club.members.attendance:create');
  const canSellQuick =
    can('club.reception:create') ||
    can('club.reception.quick_services:create');
  const canManageQuick =
    can('club.reception:update') ||
    can('club.reception.quick_services:update') ||
    can('club.reception.quick_services:view');
  const canCreateSubscription =
    can('club.reception:create') ||
    can('club.subscriptions.list:create') ||
    can('club.subscriptions.new:create');
  const canUpdateSubscription =
    can('club.reception:update') ||
    can('club.subscriptions.list:update');
  const canBlockMember =
    can('club.members:update') ||
    can('club.reception:update');
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const inputRef = useRef<ReceptionMemberSearchBoxHandle>(null);
  const consumedScanRef = useRef('');
  const tabletMode = searchParams.get('tablet') === '1';
  const [receptionBranch, setReceptionBranch] = useState('');
  const effectiveReceptionBranch = isSystemAdmin
    ? receptionBranch
    : user?.branch
      ? String(user.branch)
      : '';
  const activeReceptionBranchId = effectiveReceptionBranch
    ? Number(effectiveReceptionBranch)
    : null;
  const activeReceptionBranchName = activeReceptionBranchId
    ? branches.find((branch) => branch.id === activeReceptionBranchId)?.name?.trim()
      || `${ui('فرع رقم')} ${formatDigits(activeReceptionBranchId)}`
    : ui('كل الفروع');
  const [receptionGender, setReceptionGender] = useState<ReceptionGenderFilter>('');
  const effectiveReceptionGender = receptionGender || undefined;
  const activeReceptionGenderName = receptionGender === 'female'
    ? ui('سيدات')
    : receptionGender === 'male'
      ? ui('رجال')
      : ui('كل الأعضاء');
  const [query, setQuery] = useState('');
  // Invalidate submitted searches immediately, before the input's debounce.
  // A response for an earlier draft/scope must never open a member panel.
  const searchSubmission = useRef(0);
  const searchMounted = useRef(true);
  const searchScope = `${effectiveReceptionBranch}:${receptionGender}`;
  const previousSearchScope = useRef(searchScope);
  const invalidateSearchSubmission = useCallback(() => { searchSubmission.current++; }, []);
  const {
    open: cameraOpen,
    setOpen: setCameraOpen,
    pendingScan,
    completeScan,
  } = usePersistentScanner();
  const handledPersistentScanRef = useRef<number | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [memberOpen, setMemberOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteSubId, setInviteSubId] = useState<number | null>(null);
  const invitationSummary = useInvitationSummary(selectedId, memberOpen);
  const [profileOpen, setProfileOpen] = useState(false);
  const [entitlement, setEntitlement] = useState<EntitlementResult | null>(null);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');
  const [overrideSubId, setOverrideSubId] = useState<number | null>(null);
  const [checkingSubId, setCheckingSubId] = useState<number | null>(null);
  const [quickSellOpen, setQuickSellOpen] = useState(false);
  const [quickSellService, setQuickSellService] = useState<ClubQuickServiceRow | null>(null);
  const [quickSellMemberId, setQuickSellMemberId] = useState<number | null>(null);
  const [quickSellName, setQuickSellName] = useState('');
  const [quickSellRows, setQuickSellRows] = useState<ClubPaymentSplitRow[]>(singlePaymentRow());
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paySubId, setPaySubId] = useState<number | null>(null);
  const [payMaxRemaining, setPayMaxRemaining] = useState(0);
  const [payAmount, setPayAmount] = useState('');
  const [payRows, setPayRows] = useState<ClubPaymentSplitRow[]>(singlePaymentRow());
  const [freezeOpen, setFreezeOpen] = useState(false);
  const [freezeSubId, setFreezeSubId] = useState<number | null>(null);
  const [freezeForm, setFreezeForm] = useState({ reason: '', days: '' });
  const freezeDaysInvalid = freezeForm.days !== '' && (!Number.isInteger(Number(freezeForm.days)) || Number(freezeForm.days) < 1);
  const [renewOpen, setRenewOpen] = useState(false);
  const [renewSubId, setRenewSubId] = useState<number | null>(null);
  const [refundOpen, setRefundOpen] = useState(false);
  const [refundSubId, setRefundSubId] = useState<number | null>(null);
  const [refundStopDate, setRefundStopDate] = useState(localToday());
  const [refundReason, setRefundReason] = useState('');
  const [refundNotes, setRefundNotes] = useState('');
  const [refundPreview, setRefundPreview] = useState<RefundPreview | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferSubId, setTransferSubId] = useState<number | null>(null);
  const [transferPaidAmount, setTransferPaidAmount] = useState('0');
  const [transferPaymentRows, setTransferPaymentRows] = useState<ClubPaymentSplitRow[]>(singlePaymentRow('cash', 0));
  const [transferForm, setTransferForm] = useState({
    toSubscriptionTypeId: '',
    toStartDate: localToday(),
    toEndDate: '',
    toValue: '',
  });
  const [transferPlanPreview, setTransferPlanPreview] = useState<{
    pricingMode: 'price_difference' | 'unused_credit';
    canChooseStart?: boolean;
    toStartDate: string;
    transferableCredit: number;
    targetValue: number;
    creditApplied: number;
    refundAmount: number;
    additionalDue: number;
    toEndDate: string;
    targetSessionsCount: number | null;
    consumedValue?: number;
    consumedSessions?: number | null;
    discountValue?: number;
    requestedDiscountValue?: number;
  } | null>(null);
  const [transferPlanPreviewError, setTransferPlanPreviewError] = useState<string | null>(null);
  const [transferDiscount, setTransferDiscount] = useState<PlanTransferDiscount>(NO_PLAN_TRANSFER_DISCOUNT);
  const [transferTargetValue, setTransferTargetValue] = useState(0);
  const [transferStartFrom, setTransferStartFrom] = useState<PlanTransferStartFrom>('original');
  const [transferCanChooseStart, setTransferCanChooseStart] = useState(false);
  const [noteSub, setNoteSub] = useState<ClubSubscriptionListItem | null>(null);
  const transferDiscountBody = useMemo(() => planTransferDiscountBody(transferDiscount), [transferDiscount]);
  const [blockOpen, setBlockOpen] = useState(false);
  const [blockReason, setBlockReason] = useState('');
  const [blockSaving, setBlockSaving] = useState(false);
  const [saving, setSaving] = useState(false);

  const { data: subTypes } = useArrayResource<ClubSubscriptionType>('club-subscription-types');

  useEffect(() => {
    searchMounted.current = true;
    return () => { searchMounted.current = false; };
  }, []);

  useEffect(() => {
    if (previousSearchScope.current !== searchScope) {
      previousSearchScope.current = searchScope;
      invalidateSearchSubmission();
    }
    setSelectedId(null);
    setMemberOpen(false);
    setProfileOpen(false);
    setEntitlement(null);
    setQuery('');
  }, [searchScope, invalidateSearchSubmission]);

  useEffect(() => {
    if (tabletMode) {
      document.documentElement.classList.add('reception-tablet');
    } else {
      document.documentElement.classList.remove('reception-tablet');
    }
    return () => document.documentElement.classList.remove('reception-tablet');
  }, [tabletMode]);

  const toggleTablet = () => {
    if (tabletMode) {
      searchParams.delete('tablet');
    } else {
      searchParams.set('tablet', '1');
    }
    setSearchParams(searchParams, { replace: true });
  };

  const { data: recent } = useQuery({
    queryKey: ['club-recent-checkins', effectiveReceptionBranch || 'all', effectiveReceptionGender || 'all'],
    queryFn: async ({ signal }) => {
      const { data } = await api.get<RecentCheckIn[]>('/club/search/recent-checkins', {
        params: {
          limit: 20,
          branchId: effectiveReceptionBranch || undefined,
          gender: effectiveReceptionGender,
        },
        signal,
      });
      return data;
    },
    refetchInterval: 60_000,
  });

  const { data: quickServices = [] } = useQuery({
    queryKey: ['club-quick-services', 'catalog', effectiveReceptionBranch || 'all'],
    queryFn: async ({ signal }) => {
      const { data } = await api.get<ClubQuickServiceRow[]>('/club-quick-services/catalog', {
        params: { branchId: effectiveReceptionBranch || undefined },
        signal,
      });
      return data;
    },
    enabled: canSellQuick || canManageQuick,
  });

  const today = localToday();
  const { data: todayAttendanceStats } = useClubAttendanceStatistics(
    {
      startDate: today,
      endDate: today,
      branch: effectiveReceptionBranch || undefined,
      gender: effectiveReceptionGender,
    },
    { refetchInterval: 60_000 },
  );

  const { data: searchResult, isFetching: searching, isError: searchFailed, error: searchError,
    isSuccess: searchSucceeded, refetch: retrySearch } = useReceptionMemberSearch(
    query, effectiveReceptionBranch, effectiveReceptionGender, !memberOpen,
  );

  const { data: member, refetch: refetchMember, isFetching: loadingMember } = useQuery({
    queryKey: ['club-reception-member', effectiveReceptionBranch || 'all', selectedId],
    enabled: selectedId != null,
    refetchInterval: memberOpen ? 5_000 : false,
    refetchIntervalInBackground: false,
    queryFn: async () => {
      const { data: m } = await api.get(`/club-members/${selectedId}`);
      return m as ClubMemberListItem;
    },
  });

  const { data: subs, refetch: refetchSubs, isFetching: loadingSubs } = useQuery({
    queryKey: ['club-reception-subs', effectiveReceptionBranch || 'all', selectedId],
    enabled: selectedId != null,
    refetchInterval: memberOpen ? 10_000 : false,
    refetchIntervalInBackground: false,
    queryFn: async () => {
      const { data: list } = await api.get<{ data: ClubSubscriptionListItem[] }>('/club-subscriptions', {
        params: {
          memberId: selectedId,
          pageSize: 50,
          branch: effectiveReceptionBranch || undefined,
        },
      });
      return list.data;
    },
  });

  /** Show one operational record per package: current first, otherwise latest expired. */
  const sortedSubs = useMemo(
    () => selectReceptionSubscriptions(subs ?? [], localToday()),
    [subs],
  );

  /** Reception alert: no usable active subscription (all expired / empty). */
  const hasExpiredSubscriptionAlert = useMemo(() => {
    if (!subs || loadingSubs) return false;
    if (sortedSubs.length === 0) return true;
    const hasUsable = sortedSubs.some((s) => {
      const st = String(s.status ?? '').toLowerCase();
      return (
        (st === 'active' || st === 'frozen') &&
        !isReceptionSubscriptionExpired(s, localToday())
      );
    });
    return !hasUsable;
  }, [subs, sortedSubs, loadingSubs]);

  const paymentSub = useMemo(
    () => (paySubId != null ? (subs ?? []).find((s) => s.id === paySubId) ?? null : null),
    [paySubId, subs],
  );

  const renewSub = useMemo(
    () => (renewSubId != null ? (subs ?? []).find((s) => s.id === renewSubId) ?? null : null),
    [renewSubId, subs],
  );

  const refundSub = useMemo(
    () => (refundSubId != null ? (subs ?? []).find((s) => s.id === refundSubId) ?? null : null),
    [refundSubId, subs],
  );

  const transferSub = useMemo(
    () => (transferSubId != null ? (subs ?? []).find((s) => s.id === transferSubId) ?? null : null),
    [transferSubId, subs],
  );
  const transferSubTypes = useMemo(
    () => subscriptionTypesForBranch(subTypes ?? [], transferSub?.branchId ?? member?.branchId),
    [member?.branchId, subTypes, transferSub?.branchId],
  );
  const memberQuickServices = useMemo(
    () => quickServices.filter((service) => service.branchId == null || service.branchId === member?.branchId),
    [member?.branchId, quickServices],
  );

  useEffect(() => {
    if (!transferOpen || !transferSubId || !transferForm.toSubscriptionTypeId || !transferForm.toStartDate) {
      setTransferPlanPreview(null);
      setTransferPlanPreviewError(null);
      return;
    }
    const type = (subTypes ?? []).find((t) => t.id === Number(transferForm.toSubscriptionTypeId));
    if (!type) return;
    let cancelled = false;
    setTransferPlanPreview(null);
    setTransferPlanPreviewError(null);
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const { data } = await api.post<{
            pricingMode: 'price_difference' | 'unused_credit';
            canChooseStart?: boolean;
            toStartDate: string;
            transferableCredit: number;
            targetValue: number;
            creditApplied: number;
            refundAmount: number;
            additionalDue: number;
            toEndDate: string;
            targetSessionsCount: number | null;
            consumedValue?: number;
            consumedSessions?: number | null;
            discountValue?: number;
            requestedDiscountValue?: number;
          }>('/club-subscription-transfers/preview', {
            subscriptionId: transferSubId,
            toSubscriptionTypeId: Number(transferForm.toSubscriptionTypeId),
            targetSessionsCount: subTypes?.find(type => type.id === Number(transferForm.toSubscriptionTypeId))?.isLinkedToSessions ? subTypes?.find(type => type.id === Number(transferForm.toSubscriptionTypeId))?.sessionsCount : undefined,
        preservePeriod: Boolean(transferSub?.isLinkedToSessions && subTypes?.find(type => type.id === Number(transferForm.toSubscriptionTypeId))?.isLinkedToSessions),
            toStartDate: transferForm.toStartDate,
            startFrom: transferStartFrom,
            ...transferDiscountBody,
          });
          if (cancelled) return;
          setTransferPlanPreview(data);
          setTransferTargetValue(data.targetValue);
          setTransferCanChooseStart(!!data.canChooseStart);
          setTransferPaidAmount(String(data.additionalDue));
          setTransferPaymentRows(singlePaymentRow('cash', data.additionalDue));
          setTransferPlanPreviewError(null);
          setTransferForm((f) => ({
            ...f,
            toEndDate: data.toEndDate,
            toValue: String(data.targetValue),
          }));
        } catch (e) {
          if (cancelled) return;
          setTransferPlanPreview(null);
          setTransferPlanPreviewError(apiError(e));
          setTransferForm((f) => ({
            ...f,
            toEndDate: addDaysLocal(
              f.toStartDate,
              type.days > 0 ? type.days : type.isLinkedToSessions ? 30 : 0,
            ),
            toValue: String(type.price),
          }));
        }
      })();
    }, 250);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [transferOpen, transferSubId, transferForm.toSubscriptionTypeId, transferForm.toStartDate, subTypes, transferDiscountBody, transferStartFrom]);

  useEffect(() => {
    // A discount belongs to one target plan; switching plan or source starts clean.
    setTransferDiscount(NO_PLAN_TRANSFER_DISCOUNT);
    setTransferTargetValue(0);
    setTransferStartFrom('original');
    setTransferCanChooseStart(false);
  }, [transferOpen, transferSubId, transferForm.toSubscriptionTypeId]);

  useEffect(() => {
    if (!refundOpen || !refundSubId || !refundStopDate) {
      setRefundPreview(null);
      return;
    }
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const { data } = await api.post<{ preview?: RefundPreview } & RefundPreview>(
            '/club-subscription-refunds?dryRun=true',
            { subscriptionId: refundSubId, stopDate: refundStopDate },
          );
          const p = (data as { preview?: RefundPreview }).preview ?? data;
          if (p && typeof p === 'object' && 'refundAmount' in p) {
            setRefundPreview(p as RefundPreview);
          }
        } catch (e) {
          setRefundPreview(null);
          toast.error(apiError(e));
        }
      })();
    }, 300);
    return () => window.clearTimeout(timer);
  }, [refundOpen, refundSubId, refundStopDate]);

  useEffect(() => {
    if (!transferOpen || !transferSubId) {
      setTransferPlanPreview(null);
      setTransferPlanPreviewError(null);
    }
  }, [transferOpen, transferSubId]);

  const { data: subscriptionReceipts = [], isLoading: loadingSubscriptionReceipts } = useQuery({
    queryKey: ['club-receipts', 'by-subscription', paySubId],
    queryFn: async () => {
      const { data } = await api.get<{ data: SubscriptionPaymentReceiptRow[] }>('/club-receipts', {
        params: { subscriptionId: paySubId, pageSize: 100, page: 1 },
      });
      return data.data ?? [];
    },
    enabled: paymentOpen && paySubId != null,
  });

  const refreshEntitlement = async (memberId: number, branchId?: number) => {
    try {
      const { data } = await api.get<EntitlementResult>('/club/entitlement/validate', {
        params: { memberId, branchId: branchId ?? member?.branchId ?? undefined },
      });
      setEntitlement(data);
      return data;
    } catch {
      setEntitlement(null);
    }
  };

  const selectMember = async (hit: ClubSearchHit) => {
    invalidateSearchSubmission();
    prepareEntrySound();
    void qc.invalidateQueries({ queryKey: ['club-reception-subs', effectiveReceptionBranch || 'all', hit.id] });
    void qc.invalidateQueries({ queryKey: ['club-reception-member', effectiveReceptionBranch || 'all', hit.id] });
    setSelectedId(hit.id);
    setQuery(hit.memberCode);
    setMemberOpen(true);
    const result = await refreshEntitlement(hit.id, hit.branchId);
    if (result?.allowed === false) void playEntrySound('rejected');
  };

  const closeMemberPanel = (open: boolean) => {
    invalidateSearchSubmission();
    setMemberOpen(open);
    if (!open) {
      if (pendingScan) completeScan(pendingScan.id);
      setProfileOpen(false);
      setSelectedId(null);
      setEntitlement(null);
      setBlockOpen(false);
      setBlockReason('');
      setQuery('');
      if (!cameraOpen) {
        requestAnimationFrame(() => inputRef.current?.focus());
      }
    }
  };

  const refreshMemberAfterBlockChange = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['club-reception-member'] }),
      qc.invalidateQueries({ queryKey: ['club-universal-search'] }),
      qc.invalidateQueries({ queryKey: ['club-members'] }),
    ]);
    await refetchMember();
    if (selectedId) await refreshEntitlement(selectedId, member?.branchId);
  };

  const submitMemberBlock = async () => {
    if (!member || !canBlockMember || blockSaving) return;
    const reason = blockReason.trim();
    if (reason.length < 3) {
      toast.error(ui('اكتب سببًا واضحًا للحظر لا يقل عن 3 أحرف'));
      return;
    }
    setBlockSaving(true);
    try {
      await api.post(`/club-members/${member.id}/block`, { reason });
      await refreshMemberAfterBlockChange();
      setBlockOpen(false);
      setBlockReason('');
      toast.success(ui('تم حظر العضو ومنع تسجيل دخوله'));
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setBlockSaving(false);
    }
  };

  const unblockMember = async () => {
    if (!member || !canBlockMember || blockSaving) return;
    const ok = await confirm({
      title: ui('إلغاء حظر العضو؟'),
      description: ui('سيعود العضو نشطًا وسيُسمح له بالدخول حسب صلاحية اشتراكه.'),
      confirmLabel: ui('إلغاء الحظر'),
    });
    if (!ok) return;
    setBlockSaving(true);
    try {
      await api.post(`/club-members/${member.id}/unblock`, {});
      await refreshMemberAfterBlockChange();
      toast.success(ui('تم إلغاء حظر العضو'));
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setBlockSaving(false);
    }
  };

  const runSearch = async (rawQuery = query): Promise<boolean> => {
    const submission = ++searchSubmission.current;
    prepareEntrySound();
    const q = rawQuery.trim();
    if (!isReceptionSearchReady(q)) {
      toast.error(ct('members.enterCode'));
      return false;
    }
    // Keyboard scanners on the Arabic layout mangle the branch letter (ش012253 → A012253) or
    // drop it; rebuild the code and open only that exact member.
    const scan = normalizeReceptionScanCode(q, activeReceptionBranchId);
    setQuery(scan.query);
    try {
      // Share an in-flight autocomplete request with Enter / barcode submission.
      const result = await qc.fetchQuery(receptionSearchOptions(scan.query, effectiveReceptionBranch, effectiveReceptionGender));
      if (!searchMounted.current || submission !== searchSubmission.current) return false;
      const hit = pickReceptionScanHit(result.hits, result.topMatch, scan);
      if (hit) {
        await selectMember(hit);
        return true;
      }
      toast.error(ct('members.noMemberFound'));
      void playEntrySound('rejected');
      return false;
    } catch (e) {
      if (searchMounted.current && submission === searchSubmission.current) {
        toast.error(apiError(e, ui('تعذر البحث عن العضو. حاول مرة أخرى.')));
      }
      return false;
    }
  };

  useEffect(() => {
    if (!pendingScan || handledPersistentScanRef.current === pendingScan.id) return;
    handledPersistentScanRef.current = pendingScan.id;
    setMemberOpen(false);
    setQuery(pendingScan.code);
    void runSearch(pendingScan.code).then((found) => {
      if (!found) completeScan(pendingScan.id);
    });
    // The provider retains the scan across navigation; its id makes each scan one-shot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingScan]);

  useEffect(() => {
    const result = consumeReceptionScan(searchParams, consumedScanRef.current);
    if (!result) {
      if (!searchParams.get('scan')?.trim()) consumedScanRef.current = '';
      return;
    }
    consumedScanRef.current = result.code;
    setMemberOpen(false);
    setQuery(result.code);
    setSearchParams(result.nextParams, { replace: true });
    void runSearch(result.code);
    // runSearch reads the current branch scope; the scan parameter is the trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const openGrace = (subscriptionId?: number | null) => {
    if (entitlement?.allowGraceSessions !== true) {
      toast.error(ui('جلسات السماح غير مفعّلة من سياسات الجيم'));
      return;
    }
    const subId =
      subscriptionId ??
      entitlement?.latestSubscription?.id ??
      entitlement?.activeSubscription?.id ??
      null;
    setOverrideSubId(subId);
    setOverrideReason(GRACE_REASON_PRESETS[0]);
    setOverrideOpen(true);
  };

  const openQuickSell = (service: ClubQuickServiceRow, memberId?: number | null) => {
    if (!memberId && isSystemAdmin && service.branchId == null && activeReceptionBranchId == null) {
      toast.error(ui('حدد فرعًا من أعلى قبل تسجيل بيع نقدي'));
      return;
    }
    setQuickSellService(service);
    setQuickSellMemberId(memberId ?? null);
    setQuickSellName('');
    setQuickSellRows(singlePaymentRow('cash', service.price));
    setQuickSellOpen(true);
  };

  const sellQuickService = async () => {
    if (!quickSellService || !canSellQuick || saving) return;
    const amount = quickSellService.price;
    const split = buildClubPaymentSplit(quickSellRows, amount, ct);
    if ('error' in split) {
      toast.error(split.error);
      return;
    }
    setSaving(true);
    try {
      const { data } = await api.post<{
        receipt: { receiptNumber: string; amount: number };
        service: ClubQuickServiceRow;
      }>('/club-quick-services/sell', {
        serviceId: quickSellService.id,
        memberId: quickSellMemberId ?? undefined,
        memberName: quickSellMemberId ? undefined : quickSellName.trim() || undefined,
        branchId: quickSellMemberId
          ? undefined
          : quickSellService.branchId ?? activeReceptionBranchId ?? undefined,
        ...split.payload,
      });
      toast.success(
        `${ui('تم البيع')}: ${data.service.name} — ${formatMoney(data.receipt.amount)} (${data.receipt.receiptNumber})`,
      );
      if (shouldPrint('quickService', data.receipt.amount, data.receipt.receiptNumber)) {
        runAutoPrintOnce('quickService', data.receipt.receiptNumber, () => printThermalFinancialReceiptWithFallback({
          documentNumber: data.receipt.receiptNumber,
          transactionLabel: 'Quick service',
          itemName: data.service.name,
          customerName: quickSellMemberId ? member?.name : quickSellName.trim() || 'Walk-in customer',
          memberCode: quickSellMemberId ? member?.memberCode : null,
          branchName: activeReceptionBranchName,
          collectedAmount: data.receipt.amount,
          payments: quickSellRows.map((row) => ({ method: row.method, amount: Number(row.amount) || 0 })),
          operatorName: user?.name,
        }, policy));
      }
      setQuickSellOpen(false);
      setQuickSellService(null);
      setQuickSellMemberId(null);
      void qc.invalidateQueries({ queryKey: ['club-receipts'] });
      void qc.invalidateQueries({ queryKey: ['me', 'workspace', 'widgets'] });
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const checkIn = async (subscriptionId?: number, force = false) => {
    if (!selectedId || !canCheckIn || saving) return;
    prepareEntrySound();
    setSaving(true);
    if (subscriptionId != null) setCheckingSubId(subscriptionId);
    try {
      const { data } = await api.post<CheckInResponse>('/club-attendance/check-in', {
        memberId: selectedId,
        subscriptionId,
        branchId: member?.branchId ?? activeReceptionBranchId ?? undefined,
        consumeSession: true,
        force,
        overrideReason: force ? overrideReason : undefined,
      });
      setEntitlement(data.entitlement);
      const sub = data.subscription;
      const detail =
        sub?.isLinkedToSessions && sub.sessionsRemaining != null
          ? `${ui('تبقّى')} ${toArabicDigits(sub.sessionsRemaining)} ${ui('حصة')}`
          : sub && !sub.isLinkedToSessions && sub.daysRemaining != null
            ? `${ui('متبقّي')} ${toArabicDigits(sub.daysRemaining)} ${ui('يوم')} — ${ui('ينتهي')} ${toArabicDigits(sub.endDate ?? '')}`
            : (sub?.type ?? '');
      const base = data.overridden
        ? ui('تم تسجيل الدخول (تجاوز)')
        : ct('members.checkInNamed', { name: data.attendance.memberName });
      const classDetail = data.classAttendance
        ? `${data.classAttendance.className} — ${ui('كابتن')} ${data.classAttendance.trainerName}${data.classAttendance.hallName ? ` — ${data.classAttendance.hallName}` : ''}`
        : '';
      toast.success([base, classDetail, detail].filter(Boolean).join(' — '));
      void playEntrySound('granted');
      void qc.invalidateQueries({ queryKey: ['club-attendance', 'entry-alerts'] });
      setOverrideOpen(false);
      setOverrideReason('');
      setOverrideSubId(null);
      void qc.invalidateQueries({ queryKey: ['club-recent-checkins'] });
      void qc.invalidateQueries({ queryKey: ['club-attendance', 'statistics'] });
      void qc.invalidateQueries({ queryKey: ['club-attendance', 'next-class'] });
      void refetchSubs();
    } catch (e) {
      if (isEntryRejection(e)) void playEntrySound('rejected');
      void qc.invalidateQueries({ queryKey: ['club-attendance', 'entry-alerts'] });
      const err = e as { response?: { data?: { entitlement?: EntitlementResult } } };
      const deniedEntitlement = err.response?.data?.entitlement;
      if (deniedEntitlement) setEntitlement(deniedEntitlement);
      if (
        !force &&
        deniedEntitlement &&
        deniedEntitlement.allowed === false &&
        deniedEntitlement.allowGraceSessions === true
      ) {
        setOverrideSubId(subscriptionId ?? deniedEntitlement.latestSubscription?.id ?? null);
        setOverrideReason(GRACE_REASON_PRESETS[0]);
        setOverrideOpen(true);
      } else {
        toast.error(apiError(e));
      }
    } finally {
      setSaving(false);
      setCheckingSubId(null);
    }
  };

  const pay = async () => {
    if (!paySubId || !canUpdateSubscription) return;
    const amount = Number(payAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error(ui('أدخل مبلغاً صحيحاً'));
      return;
    }
    if (payMaxRemaining > 0 && amount > payMaxRemaining) {
      toast.error(ct('subscriptions.amountExceedsRemaining'));
      return;
    }
    const split = buildClubPaymentSplit(payRows, amount, ct);
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
      }>(`/club-subscriptions/${paySubId}/payment`, {
        paymentAmount: amount,
        ...split.payload,
      });
      if (result.subscription) {
        setPayMaxRemaining(result.subscription.remainingAmount);
      }
      void qc.invalidateQueries({ queryKey: ['club-receipts', 'by-subscription', paySubId] });
      void qc.invalidateQueries({ queryKey: ['me', 'workspace', 'widgets'] });
      toast.success(ct('common.success'));
      if (shouldPrint('subscriptionPayment', result.paymentAmount, result.receiptNumber)) {
        runAutoPrintOnce('subscriptionPayment', result.receiptNumber, () => printThermalFinancialReceiptWithFallback({
          documentNumber: result.receiptNumber,
          transactionLabel: 'Subscription payment',
          itemName: result.subscription.subscriptionType || 'Membership',
          customerName: result.subscription.customerName,
          memberCode: result.subscription.memberCode,
          branchName: branches.find((branch) => branch.id === result.subscription.branchId)?.name,
          collectedAmount: result.paymentAmount,
          payments: payRows.map((row) => ({ method: row.method, amount: Number(row.amount) || 0 })),
          operatorName: user?.name,
          subscriptionNumber: result.subscription.subscriptionNumber,
        }, policy));
      }
      setPaymentOpen(false);
      void refetchSubs();
      if (selectedId) await refreshEntitlement(selectedId);
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const submitFreeze = async () => {
    if (!freezeSubId || !canUpdateSubscription || freezeDaysInvalid) return;
    setSaving(true);
    try {
      await api.post(`/club-subscriptions/${freezeSubId}/freeze`, {
        reason: freezeForm.reason.trim() || undefined,
        days: freezeForm.days ? Number(freezeForm.days) : undefined,
      });
      toast.success(ct('common.success'));
      setFreezeOpen(false);
      void refetchSubs();
      if (selectedId) await refreshEntitlement(selectedId);
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const unfreeze = async (id: number) => {
    if (!canUpdateSubscription) return;
    const ok = await confirm({ title: ct('subscriptions.unfreezeConfirm') });
    if (!ok) return;
    setSaving(true);
    try {
      await api.post(`/club-subscriptions/${id}/unfreeze`, {});
      toast.success(ct('common.success'));
      void refetchSubs();
      if (selectedId) await refreshEntitlement(selectedId);
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const submitRefund = async () => {
    if (!canUpdateSubscription || !refundSubId || !refundPreview) return;
    const zeroRefund = refundPreview.refundAmount <= 0;
    setSaving(true);
    try {
      const ok = await confirmWithPreview(
        {
          title: ct('subscriptions.refundTitle'),
          description: ct(zeroRefund ? 'subscriptions.refundCloseDesc' : 'subscriptions.refundPayoutDesc'),
          confirmLabel: ct(zeroRefund ? 'subscriptions.refundCloseAction' : 'subscriptions.refundPayoutAction'),
          variant: 'destructive',
        },
        async () => {
          const { data } = await api.post('/club-subscription-refunds?dryRun=true', {
            subscriptionId: refundSubId,
            stopDate: refundStopDate,
            reason: refundReason || undefined,
            notes: refundNotes || undefined,
          });
          return {
            rows: (data as { rows?: { label: string; after?: string }[] }).rows,
            warning: (data as { warning?: string }).warning ?? ct('subscriptions.refundPayoutWarning'),
          };
        },
        async () => {
          await api.post('/club-subscription-refunds', {
            subscriptionId: refundSubId,
            stopDate: refundStopDate,
            reason: refundReason || undefined,
            notes: refundNotes || undefined,
          });
        },
      );
      if (ok) {
        toast.success(ct('subscriptions.refundPayoutSuccess'));
        setRefundOpen(false);
        void refetchSubs();
        if (selectedId) await refreshEntitlement(selectedId);
      }
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const saveTransfer = async () => {
    if (!canUpdateSubscription) return;
    if (!transferSubId || !transferForm.toSubscriptionTypeId || !transferForm.toStartDate) {
      toast.error(ct('members.fillRequired'));
      return;
    }
    if (!transferPlanPreview) {
      toast.error(transferPlanPreviewError || ui('تعذر حساب التحويل — راجع شاشة الاشتراكات'));
      return;
    }
    const additionalPaidAmount = Number(transferPaidAmount);
    if (!transferPaidAmount.trim() || !Number.isFinite(additionalPaidAmount) || additionalPaidAmount < 0 || additionalPaidAmount > transferPlanPreview.additionalDue) {
      toast.error(ct('subscriptions.transferInvalidPayment'));
      return;
    }
    if (transferPaymentRows.some((row) => !Number.isFinite(Number(row.amount)) || Number(row.amount) < 0)) {
      toast.error(ct('subscriptions.transferInvalidPayment'));
      return;
    }
    const split = buildClubPaymentSplit(additionalPaidAmount > 0 ? transferPaymentRows : singlePaymentRow(transferPaymentRows[0]?.method), additionalPaidAmount, ct);
    if ('error' in split) {
      toast.error(split.error);
      return;
    }
    setSaving(true);
    try {
      await api.post('/club-subscription-transfers', {
        subscriptionId: transferSubId,
        toSubscriptionTypeId: Number(transferForm.toSubscriptionTypeId),
            targetSessionsCount: subTypes?.find(type => type.id === Number(transferForm.toSubscriptionTypeId))?.isLinkedToSessions ? subTypes?.find(type => type.id === Number(transferForm.toSubscriptionTypeId))?.sessionsCount : undefined,
        preservePeriod: Boolean(transferSub?.isLinkedToSessions && subTypes?.find(type => type.id === Number(transferForm.toSubscriptionTypeId))?.isLinkedToSessions),
        toStartDate: transferForm.toStartDate,
        additionalPaidAmount,
        startFrom: transferStartFrom,
        ...transferDiscountBody,
        ...split.payload,
        refundPaymentMethod:
          transferPlanPreview.refundAmount > 0 ? 'cash' : undefined,
      });
      toast.success(
        transferPlanPreview.refundAmount > 0
          ? `${ui('تم التحويل ورد ')}${formatMoney(transferPlanPreview.refundAmount)}`
          : ui('تم تحويل الخطة وإنشاء الاشتراك الجديد'),
      );
      setTransferOpen(false);
      setTransferPlanPreview(null);
      void refetchSubs();
      if (selectedId) await refreshEntitlement(selectedId);
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const hits = searchResult?.hits ?? [];
  const showHits = !memberOpen && isReceptionSearchReady(query) && hits.length > 0;

  return (
    <div
      className={
        tabletMode
          ? 'reception-tablet-shell mx-auto min-h-[calc(100vh-4rem)] max-w-5xl space-y-6 p-4 md:p-8'
          : 'mx-auto max-w-5xl space-y-6'
      }
    >
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row">
        <PageHeader
          title={ui('الاستقبال')}
          description={ui('ابحث عن العضو — تفتح بطاقته مع الاشتراكات والإجراءات فورًا')}
        />
        <div className="flex flex-wrap w-full items-center gap-2 sm:w-auto">
          {canCheckIn && <EntrySoundSettings />}
          <ReceptionLockerDeskButton branchId={effectiveReceptionBranch || undefined} />
          <Button
            variant="outline"
            size="icon"
            permissionAction={null}
            onClick={toggleTablet}
            title={tabletMode ? ui('وضع عادي') : ui('وضع تابلت')}
          >
            {tabletMode ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
          </Button>
        </div>
      </div>

      <ReceptionGateControl branchId={effectiveReceptionBranch ? Number(effectiveReceptionBranch) : null} />
      <ReceptionEntryAlerts branchId={effectiveReceptionBranch} />
      <PendingGateEntries branchId={effectiveReceptionBranch} />
      <ReceptionClassDesk branchId={effectiveReceptionBranch || undefined} />

      <section className="relative overflow-hidden rounded-2xl border border-primary/20 bg-card p-4 shadow-sm md:p-5">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-brand-gradient" />
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="grid size-9 place-items-center rounded-xl bg-primary/10 text-primary">
                <Building2 className="size-5" />
              </span>
              <div>
                <h2 className="font-semibold">{ui('فرع الاستقبال')}</h2>
                <p className="text-xs text-muted-foreground">
                  {isSystemAdmin
                    ? ui('يتحكم في البحث وآخر الداخلين والخدمات وأرقام الحضور')
                    : ui('البيانات مقفولة على فرع الحساب')}
                </p>
              </div>
            </div>
          </div>
          <div className="grid w-full gap-3 sm:max-w-xl sm:grid-cols-[minmax(0,1fr)_minmax(0,11rem)]">
          <div>
            <Label className="mb-1.5 block text-xs text-muted-foreground">{ui('الفرع المعروض')}</Label>
            {isSystemAdmin ? (
              <select
                className={cn(selectCls, 'h-11 rounded-xl border-primary/25 bg-background font-medium')}
                value={receptionBranch}
                onChange={(event) => setReceptionBranch(event.target.value)}
              >
                <option value="">{ui('كل الفروع')}</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name?.trim() || `${ui('فرع رقم')} ${branch.id}`}
                  </option>
                ))}
              </select>
            ) : (
              <div className="flex h-11 items-center gap-2 rounded-xl border border-primary/20 bg-muted/45 px-3 text-sm font-semibold">
                <Building2 className="size-4 text-primary" />
                <span className="min-w-0 flex-1 truncate">{activeReceptionBranchName}</span>
                <LockKeyhole className="size-4 text-muted-foreground" />
              </div>
            )}
          </div>
          <div>
            <Label className="mb-1.5 block text-xs text-muted-foreground">{ui('الأعضاء المعروضون')}</Label>
            <select
              className={cn(selectCls, 'h-11 rounded-xl border-primary/25 bg-background font-medium')}
              value={receptionGender}
              onChange={(event) => setReceptionGender(event.target.value as ReceptionGenderFilter)}
            >
              <option value="">{ui('الكل')}</option>
              <option value="female">{ui('سيدات')}</option>
              <option value="male">{ui('رجال')}</option>
            </select>
          </div>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
          <CheckCircle2 className="size-4 text-primary" />
          <span>{ui('البيانات المعروضة الآن')}:</span>
          <strong className="text-foreground">{activeReceptionBranchName}</strong>
          <span aria-hidden="true">·</span>
          <strong className="text-foreground">{activeReceptionGenderName}</strong>
        </div>
      </section>

      {!tabletMode && <WorkspaceWidgets branchId={effectiveReceptionBranch || undefined} />}

      <div
        className={cn(
          'relative overflow-hidden rounded-3xl border bg-card shadow-sm',
          tabletMode ? 'p-6 md:p-10' : 'p-5 md:p-8',
        )}
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-1.5 bg-brand-gradient" />
        <div className="mb-4 space-y-1">
          <h2 className="text-lg font-semibold tracking-tight">{ui('بحث سريع عن العضو')}</h2>
          <p className="text-sm text-muted-foreground">
            {ui('اكتب الاسم أو الموبايل أو الكود أو الباركود ثم Enter — أو امسح بالكاميرا')}
          </p>
        </div>
        <ReceptionMemberSearchBox
          key={`${effectiveReceptionBranch || 'all'}:${effectiveReceptionGender || 'all'}`}
          ref={inputRef}
          value={query}
          tabletMode={tabletMode}
          searching={searching}
          onQueryChange={setQuery}
          onDraftChange={invalidateSearchSubmission}
          onSubmit={(value) => void runSearch(value)}
          onOpenCamera={() => setCameraOpen(true)}
        />

        {!memberOpen && isReceptionSearchReady(query) && (
          <div className="mt-3 text-sm" aria-live="polite" aria-atomic="true">
            {searching ? (
              <p role="status" className="text-muted-foreground">{ui('جاري البحث')}</p>
            ) : searchFailed ? (
              <div role="alert" className="flex flex-wrap items-center gap-2 text-destructive">
                <span>{apiError(searchError, ui('تعذر البحث عن العضو. حاول مرة أخرى.'))}</span>
                <Button type="button" variant="outline" size="sm" permissionAction={null}
                  onClick={() => void retrySearch()}>{ui('إعادة المحاولة')}</Button>
              </div>
            ) : searchSucceeded && hits.length === 0 ? (
              <p role="status" className="text-muted-foreground">{ui('لا توجد نتائج مطابقة.')}</p>
            ) : null}
          </div>
        )}

        {showHits && (
          <div className="mt-4 max-h-72 space-y-2 overflow-y-auto rounded-2xl border bg-muted/20 p-2">
            {hits.map((h) => (
              <button
                key={h.id}
                type="button"
                onClick={() => void selectMember(h)}
                className="flex w-full items-center gap-3 rounded-xl border border-transparent bg-card px-3 py-3 text-start transition hover:border-primary/30 hover:bg-primary/5"
              >
                <MemberAvatar name={h.name} size="md" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{h.name}</p>
                  <p className="text-xs text-muted-foreground nums">
                    {h.memberCode}
                    {h.phone ? ` · ${formatDigits(h.phone)}` : ''}
                  </p>
                </div>
                {isSystemAdmin && !effectiveReceptionBranch ? (
                  <span className="hidden items-center gap-1 rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground md:inline-flex">
                    <Building2 className="size-3" />
                    {branches.find((branch) => branch.id === h.branchId)?.name?.trim()
                      || `${ui('فرع رقم')} ${formatDigits(h.branchId)}`}
                  </span>
                ) : null}
                {h.activeSubscriptionType && (
                  <span className="hidden rounded-full bg-primary/10 px-2.5 py-1 text-xs text-primary sm:inline">
                    {h.activeSubscriptionType}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        {recent && recent.length > 0 && (
          <div className="mt-6">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {ui('آخر الداخلين')}
            </p>
            <div className="flex flex-wrap gap-2">
              {recent.slice(0, 12).map((r) => (
                <Button
                  key={`${r.memberId}-${r.checkInTime}`}
                  variant="secondary"
                  size="sm"
                  className="rounded-full"
                  onClick={() => {
                    void selectMember({
                      id: r.memberId,
                      memberCode: r.memberCode,
                      name: r.memberName,
                      phone: null,
                      cardNumber: null,
                      branchId: r.branchId,
                      gender: r.gender ?? null,
                      isActive: true,
                      matchType: 'code',
                      activeSubscriptionType: null,
                      subscriptionStatus: null,
                      remainingAmount: null,
                      lastCheckIn: r.checkInTime,
                      score: 100,
                    });
                  }}
                >
                  <span>{r.memberName}</span>
                  {isSystemAdmin && !effectiveReceptionBranch ? (
                    <span className="text-[10px] text-muted-foreground">
                      {branches.find((branch) => branch.id === r.branchId)?.name?.trim()
                        || `${ui('فرع رقم')} ${formatDigits(r.branchId)}`}
                    </span>
                  ) : null}
                </Button>
              ))}
            </div>
          </div>
        )}
      </div>

      {(canSellQuick || canManageQuick) && (quickServices.length > 0 || canManageQuick) ? (
        <div className="relative overflow-hidden rounded-3xl border bg-card p-5 shadow-sm md:p-6">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Zap className="size-4 text-primary" />
              <h2 className="text-base font-semibold tracking-tight">{ui('خدمات سريعة')}</h2>
              <span className="text-xs text-muted-foreground">{ui('بيع فوري من الاستقبال')}</span>
            </div>
            {canManageQuick ? (
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 text-muted-foreground"
                onClick={() => navigate(CR.members.quickServices)}
              >
                <Settings2 className="size-4" />
                {ui('إعدادات')}
              </Button>
            ) : null}
          </div>
          {quickServices.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {ui('لا توجد خدمات ظاهرة — أضف خدمة من الإعدادات')}
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
              {quickServices.map((service) => (
                <button
                  key={service.id}
                  type="button"
                  disabled={!canSellQuick || saving}
                  onClick={() => openQuickSell(service, null)}
                  className={cn(
                    'flex flex-col items-start gap-1 rounded-2xl border bg-muted/20 px-3.5 py-3 text-start transition',
                    'hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    'disabled:cursor-not-allowed disabled:opacity-50',
                  )}
                >
                  <span className="text-sm font-semibold leading-snug">{service.name}</span>
                  <span className="nums text-sm text-primary">{formatMoney(service.price)}</span>
                  {isSystemAdmin && !effectiveReceptionBranch && service.branchId != null ? (
                    <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                      <Building2 className="size-3" />
                      {branches.find((branch) => branch.id === service.branchId)?.name?.trim()
                        || `${ui('فرع رقم')} ${formatDigits(service.branchId)}`}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : null}

      <AttendanceSummaryCards statistics={todayAttendanceStats} />

      <ReceptionDailyAttendanceTable
        branchId={effectiveReceptionBranch || undefined}
        gender={effectiveReceptionGender}
        branches={branches}
        showBranch={isSystemAdmin}
      />

      <Dialog open={memberOpen} onOpenChange={closeMemberPanel}>
        <DialogContent size="xl" className="gap-4" aria-describedby={undefined}>
          <DialogHeader className="space-y-4 text-start">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  disabled={!member}
                  aria-label={ui('عرض ملف العضو')}
                  title={ui('عرض ملف العضو')}
                  className="group cursor-pointer rounded-full outline-none transition hover:scale-[1.03] focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-default disabled:opacity-70"
                  onClick={() => setProfileOpen(true)}
                >
                  <MemberAvatar
                    name={member?.name}
                    profilePicture={member?.profilePicture}
                    size="lg"
                    className="size-16 text-xl ring-2 ring-transparent transition group-hover:ring-primary/35"
                  />
                </button>
                <div className="space-y-1">
                  <DialogTitle className="text-2xl leading-tight">
                    {member?.name ?? ui('جاري التحميل…')}
                  </DialogTitle>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                    <span className="font-mono nums">{member?.memberCode}</span>
                    {member?.phone && (
                      <span className="inline-flex items-center gap-1 nums">
                        <Phone className="size-3.5" />
                        {formatDigits(member.phone)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex min-w-[16rem] flex-1 items-center justify-end gap-2">
                {canCheckIn && selectedId ? <MemberLockerAssign memberId={selectedId} /> : null}
                <Button
                  variant="outline"
                  size="icon"
                  disabled={loadingMember || loadingSubs}
                  onClick={() => {
                    void refetchMember();
                    void refetchSubs();
                    if (selectedId) void refreshEntitlement(selectedId);
                  }}
                >
                  <RefreshCw className={cn('size-4', (loadingMember || loadingSubs) && 'animate-spin')} />
                </Button>
              </div>
            </div>
            {entitlement && (
              <EntitlementBanner
                entitlement={entitlement}
                canGrace={
                  canCheckIn &&
                  !member?.isBlocked &&
                  entitlement.allowGraceSessions === true
                }
                onGrace={() => openGrace()}
              />
            )}
          </DialogHeader>

          <div className="space-y-3">
            <div
              className={cn(
                'flex items-center gap-2 rounded-xl px-3 py-2',
                hasExpiredSubscriptionAlert
                  ? 'border border-destructive/40 bg-destructive/10 text-destructive'
                  : '',
              )}
            >
              <CreditCard
                className={cn('size-4', hasExpiredSubscriptionAlert ? 'text-destructive' : 'text-primary')}
              />
              <h3
                className={cn(
                  'font-semibold',
                  hasExpiredSubscriptionAlert && 'text-destructive',
                )}
              >
                {ct('subscriptions.tabSubs')}
              </h3>
              <span
                className={cn(
                  'text-sm nums',
                  hasExpiredSubscriptionAlert ? 'text-destructive/80' : 'text-muted-foreground',
                )}
              >
                ({toArabicDigits(sortedSubs.length)})
              </span>
              {hasExpiredSubscriptionAlert && (
                <span className="ms-auto inline-flex items-center gap-1 text-xs font-bold">
                  <AlertTriangle className="size-3.5" />
                  {ui('اشتراك منتهي')}
                </span>
              )}
            </div>

            {sortedSubs.length === 0 && !loadingSubs && (
              <div className="rounded-2xl border border-dashed border-destructive/40 bg-destructive/5 px-4 py-10 text-center text-sm text-destructive">
                {ui('لا توجد اشتراكات')}
              </div>
            )}

            <div className="grid gap-3">
              {sortedSubs.map((s) => {
                const sessions = !!s.isLinkedToSessions;
                const remainingSessions = Math.max(0, (s.sessionsCount ?? 0) - (s.sessionsUsed ?? 0));
                const daysRemaining = Math.max(
                  0,
                  Math.round((Date.parse(s.projectedSubscriptionEndDate || s.subscriptionEndDate) - Date.parse(localToday())) / 86_400_000),
                );
                const status = s.status as string;
                const active = status === 'active';
                const frozen = status === 'frozen';
                const expired = isReceptionSubscriptionExpired(s, localToday());
                const invitationsRemaining = invitationBalanceForSubscription(invitationSummary.data, s.id);
                return (
                  <div
                    key={s.id}
                    className={cn(
                      'rounded-2xl border p-4 shadow-sm',
                      expired
                        ? 'border-destructive/50 bg-gradient-to-br from-destructive/15 via-destructive/5 to-card ring-1 ring-destructive/30'
                        : 'bg-gradient-to-br from-card to-muted/20',
                    )}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 space-y-2">
                        <p
                          className={cn(
                            'text-base font-semibold',
                            expired && 'text-destructive',
                          )}
                        >
                          {s.subscriptionType ?? '—'}
                        </p>
                        <div className="flex flex-wrap items-center gap-2 text-sm">
                          {s.specialClassTypeId ? (
                            <ScheduledClassCaptainChip
                              memberId={selectedId!}
                              subscriptionId={s.id}
                              branchId={member?.branchId ?? activeReceptionBranchId ?? undefined}
                              canReassign={canCheckIn}
                            />
                          ) : null}
                          {sessions && <span className="rounded-full bg-muted px-2.5 py-1 text-sm text-foreground">
                            {s.projectedSubscriptionEndDate ? ui('الانتهاء بعد التجميد') : ui('ينتهي')}{' '}<bdi className="nums" dir="ltr">{toArabicDigits(s.projectedSubscriptionEndDate || s.subscriptionEndDate)}</bdi>
                          </span>}
                          {sessions ? (
                            <span
                              className={cn(
                                'rounded-full px-2.5 py-1 nums',
                                expired
                                  ? 'bg-destructive/15 text-destructive'
                                  : 'bg-primary/10 text-primary',
                              )}
                            >
                              {ui('حصص')}: {toArabicDigits(remainingSessions)} {ui('متبقّية')}
                            </span>
                          ) : (
                            <>
                              <span
                                className={cn(
                                  'rounded-full px-2.5 py-1 nums',
                                  expired
                                    ? 'bg-destructive/15 text-destructive'
                                    : 'bg-primary/10 text-primary',
                                )}
                              >
                                {ui('متبقّي')} {toArabicDigits(daysRemaining)} {ui('يوم')}
                              </span>
                              <span
                                className={cn(
                                  'rounded-full px-2.5 py-1 nums',
                                  expired
                                    ? 'bg-destructive/10 text-destructive/90'
                                    : 'bg-muted text-muted-foreground',
                                )}
                              >
                                {s.projectedSubscriptionEndDate ? ui('الانتهاء بعد التجميد') : ui('ينتهي')} <bdi dir="ltr" className="whitespace-nowrap">{toArabicDigits(s.projectedSubscriptionEndDate || s.subscriptionEndDate)}</bdi>
                              </span>
                            </>
                          )}
                          <StatusBadge
                            status={
                              frozen
                                ? 'info'
                                : active && !expired
                                  ? 'active'
                                  : expired || status === 'expired'
                                    ? 'expired'
                                    : 'pending'
                            }
                            label={frozen ? ct('subscriptions.frozen') : undefined}
                          />
                          {s.remainingAmount > 0 && (
                            <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-amber-800 nums dark:text-amber-200">
                              {ct('subscriptions.remaining')}: {formatMoney(s.remainingAmount)}
                            </span>
                          )}
                        </div>
                      </div>
                      {canCheckIn && active && !expired && (
                        <Button
                          variant="brand"
                          disabled={saving}
                          onClick={() => void checkIn(s.id)}
                          className="ms-auto min-w-[11.5rem] gap-2 px-5 py-2.5 text-sm font-semibold shadow-md shadow-primary/20"
                        >
                          <LogIn className="size-4 shrink-0" />
                          {checkingSubId === s.id ? ct('common.saving') : ct('members.checkIn')}
                        </Button>
                      )}
                      {canCheckIn && expired && entitlement?.allowGraceSessions === true && (
                        <Button
                          variant="outline"
                          disabled={saving}
                          onClick={() => openGrace(s.id)}
                          className="ms-auto min-w-[11.5rem] gap-2 border-destructive/40 px-5 py-2.5 text-sm font-semibold text-destructive hover:bg-destructive/10"
                        >
                          <LogIn className="size-4 shrink-0" />
                          {ui('جلسة سماح')}
                        </Button>
                      )}
                    </div>

                    {s.notes ? (
                      <button
                        type="button"
                        className="mt-3 flex w-full items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/[0.08] px-3 py-2 text-start text-sm text-amber-950 dark:text-amber-100"
                        onClick={() => canUpdateSubscription && setNoteSub(s)}
                      >
                        <StickyNote className="mt-0.5 size-4 shrink-0" />
                        <span className="whitespace-pre-wrap">{s.notes}</span>
                      </button>
                    ) : null}

                    {canUpdateSubscription ? <div className="mt-4 flex flex-wrap gap-2 border-t border-border/60 pt-3">
                      {s.remainingAmount > 0 && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setPaySubId(s.id);
                            setPayMaxRemaining(s.remainingAmount);
                            setPayAmount(String(s.remainingAmount));
                            setPayRows(
                              singlePaymentRow(
                                (s.paymentMethod as ClubPaymentMethod) || 'cash',
                                s.remainingAmount,
                              ),
                            );
                            setPaymentOpen(true);
                          }}
                        >
                          {ct('subscriptions.pay')}
                        </Button>
                      )}
                      {active && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setFreezeSubId(s.id);
                            setFreezeForm({ reason: '', days: '' });
                            setFreezeOpen(true);
                          }}
                        >
                          <Snowflake className="size-4" />
                          {ct('subscriptions.freeze')}
                        </Button>
                      )}
                      {frozen && (
                        <Button size="sm" variant="outline" disabled={saving} onClick={() => void unfreeze(s.id)}>
                          <Sun className="size-4" />
                          {ct('subscriptions.unfreeze')}
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setRenewSubId(s.id);
                          setRenewOpen(true);
                        }}
                      >
                        <RefreshCw className="size-4" />
                        {ct('subscriptions.renew')}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setNoteSub(s)}>
                        <StickyNote className="size-4" />
                        {ct(s.notes ? 'subscriptions.noteEdit' : 'subscriptions.noteAdd')}
                      </Button>
                      {active && !frozen && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setTransferSubId(s.id);
                            setTransferPaidAmount('0');
                            setTransferPaymentRows(singlePaymentRow('cash', 0));
                            setTransferForm({
                              toSubscriptionTypeId: '',
                              toStartDate: localToday(),
                              toEndDate: '',
                              toValue: '',
                            });
                            setTransferPlanPreview(null);
                            setTransferPlanPreviewError(null);
                            setTransferOpen(true);
                          }}
                        >
                          <ArrowRightLeft className="size-4" />
                          {ct('subscriptions.transferPlan')}
                        </Button>
                      )}
                      {active && s.paidAmount > 0 && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-destructive hover:text-destructive"
                          onClick={() => {
                            setRefundSubId(s.id);
                            setRefundStopDate(localToday());
                            setRefundReason('');
                            setRefundNotes('');
                            setRefundPreview(null);
                            setRefundOpen(true);
                          }}
                        >
                          <Undo2 className="size-4" />
                          {ct('subscriptions.refundAction')}
                        </Button>
                      )}
                    </div> : null}
                    {active && !frozen && (canCreateSubscription || canBlockMember) ? (
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-primary/30 bg-primary/5 px-3 py-3">
                        <div>
                          <p className="text-sm font-semibold">{ui('إضافة دعوة / ضيف')}</p>
                          <p className="nums text-xs text-muted-foreground">
                            {invitationSummary.isLoading
                              ? ui('جارٍ تحميل رصيد الدعوات…')
                              : invitationSummary.isError || invitationsRemaining == null
                                ? ui('تعذّر تحميل رصيد الدعوات')
                                : `${ui('الدعوات المتبقية')}: ${toArabicDigits(invitationsRemaining)}`}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          variant="brand"
                          permissionAction={null}
                          disabled={invitationSummary.isLoading || invitationSummary.isError || (invitationsRemaining ?? 0) < 1}
                          onClick={() => {
                            setInviteSubId(s.id);
                            setInviteOpen(true);
                          }}
                        >
                          <TicketPlus className="size-4" />
                          {ui('إضافة دعوة / ضيف')}
                        </Button>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>

            {canSellQuick && memberQuickServices.length > 0 ? (
              <div className="mt-4 space-y-2 border-t border-border/60 pt-4">
                <div className="flex items-center gap-2">
                  <Zap className="size-4 text-primary" />
                  <h3 className="font-semibold">{ui('خدمات سريعة')}</h3>
                  <span className="text-xs text-muted-foreground">{ui('تُسجَّل على العضو')}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {memberQuickServices.map((service) => (
                    <Button
                      key={service.id}
                      variant="outline"
                      size="sm"
                      disabled={saving || !selectedId}
                      onClick={() => openQuickSell(service, selectedId)}
                      className="gap-2"
                    >
                      {service.name}
                      <span className="nums text-primary">{formatMoney(service.price)}</span>
                    </Button>
                  ))}
                </div>
              </div>
            ) : null}

            {canCreateSubscription || canBlockMember ? (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-4">
                {canBlockMember ? (
                  member?.isBlocked ? (
                    <Button
                      variant="outline"
                      disabled={!member || blockSaving}
                      className="min-w-[11rem] gap-2 border-emerald-600/40 text-emerald-700 hover:bg-emerald-500/10 hover:text-emerald-800"
                      onClick={() => void unblockMember()}
                    >
                      <CheckCircle2 className="size-4" />
                      {ui('إلغاء حظر العضو')}
                    </Button>
                  ) : (
                    <Button
                      variant="destructive"
                      disabled={!member || blockSaving}
                      className="min-w-[11rem] gap-2"
                      onClick={() => {
                        setBlockReason('');
                        setBlockOpen(true);
                      }}
                    >
                      <Ban className="size-4" />
                      {ui('حظر العضو')}
                    </Button>
                  )
                ) : <span />}

                {canCreateSubscription ? (
                  <Button
                    variant="brand"
                    disabled={!member || member.isBlocked}
                    className="min-w-[12rem] gap-2"
                    onClick={() => {
                      if (!member) return;
                      setMemberOpen(false);
                      navigate('/club/subscriptions/new', { state: { prefillMember: member } });
                    }}
                  >
                    <Plus className="size-4" />
                    {ct('subscriptions.addNewSubscription')}
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
          <MemberProfileSheet
            member={member}
            open={profileOpen}
            onOpenChange={setProfileOpen}
          />
        </DialogContent>
      </Dialog>

      <Dialog
        open={blockOpen}
        onOpenChange={(open) => {
          if (blockSaving) return;
          setBlockOpen(open);
          if (!open) setBlockReason('');
        }}
      >
        <DialogContent size="md" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Ban className="size-5" />
              {ui('حظر العضو')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
              <p className="font-semibold">{member?.name ?? '—'}</p>
              <p className="mt-1 text-muted-foreground">
                {ui('لن يتمكن العضو من تسجيل الدخول حتى يتم إلغاء الحظر.')}
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="member-block-reason">{ui('سبب الحظر')} *</Label>
              <Textarea
                id="member-block-reason"
                autoFocus
                maxLength={500}
                rows={4}
                value={blockReason}
                onChange={(e) => setBlockReason(e.target.value)}
                placeholder={ui('اكتب سببًا واضحًا يظهر لفريق الاستقبال عند محاولة الدخول...')}
              />
              <p className="text-xs text-muted-foreground">
                {toArabicDigits(blockReason.trim().length)} / {toArabicDigits(500)}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={blockSaving} onClick={() => setBlockOpen(false)}>
              {ui('إلغاء')}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={blockSaving || blockReason.trim().length < 3}
              onClick={() => void submitMemberBlock()}
            >
              <Ban className="size-4" />
              {blockSaving ? ui('جارٍ الحفظ...') : ui('حظر وحفظ السبب')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={overrideOpen} onOpenChange={setOverrideOpen}>
        <DialogContent size="md" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{ui('جلسة سماح / تجاوز')}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            {(entitlement?.latestSubscription ?? entitlement?.activeSubscription)?.endDate ? (
              <p className="rounded-xl border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive nums">
                {ui('تاريخ انتهاء الاشتراك')}:{' '}
                {toArabicDigits(
                  (entitlement?.latestSubscription ?? entitlement?.activeSubscription)?.endDate ?? '',
                )}
                {(entitlement?.latestSubscription ?? entitlement?.activeSubscription)?.subscriptionType
                  ? ` — ${(entitlement?.latestSubscription ?? entitlement?.activeSubscription)?.subscriptionType}`
                  : ''}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {GRACE_REASON_PRESETS.map((reason) => (
                <Button
                  key={reason}
                  type="button"
                  size="sm"
                  variant={overrideReason === reason ? 'brand' : 'outline'}
                  onClick={() => setOverrideReason(reason)}
                >
                  {ui(reason)}
                </Button>
              ))}
            </div>
            <div className="grid gap-2">
              <Label>{ui('سبب السماح (إلزامي)')}</Label>
              <Textarea
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                rows={3}
                placeholder={ui('لماذا تم السماح بالدخول؟')}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOverrideOpen(false)}>
              {ui('إلغاء')}
            </Button>
            <Button
              variant="brand"
              disabled={!overrideReason.trim() || saving}
              onClick={() => void checkIn(overrideSubId ?? undefined, true)}
            >
              {ui('تأكيد جلسة السماح')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={quickSellOpen}
        onOpenChange={(open) => {
          setQuickSellOpen(open);
          if (!open) setQuickSellService(null);
        }}
      >
        <DialogContent size="md" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>
              {ui('بيع سريع')}
              {quickSellService ? ` — ${quickSellService.name}` : ''}
            </DialogTitle>
          </DialogHeader>
          {quickSellService ? (
            <div className="grid gap-3">
              <p className="rounded-xl border bg-muted/30 px-3 py-2 text-sm">
                <span className="text-muted-foreground">{ui('المبلغ')}: </span>
                <span className="nums font-semibold text-primary">
                  {formatMoney(quickSellService.price)}
                </span>
              </p>
              {quickSellMemberId && member ? (
                <p className="text-sm text-muted-foreground">
                  {ui('العضو')}: <span className="font-medium text-foreground">{member.name}</span>
                </p>
              ) : (
                <div className="grid gap-2">
                  <Label>{ui('اسم العميل (اختياري)')}</Label>
                  <Input
                    value={quickSellName}
                    onChange={(e) => setQuickSellName(e.target.value)}
                    placeholder={ui('عميل نقدي')}
                  />
                </div>
              )}
              <ClubPaymentSplitFields
                total={quickSellService.price}
                rows={quickSellRows}
                onChange={setQuickSellRows}
              />
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setQuickSellOpen(false)}>
              {ui('إلغاء')}
            </Button>
            <Button
              variant="brand"
              disabled={!quickSellService || saving}
              onClick={() => void sellQuickService()}
            >
              {ui('تأكيد البيع')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={paymentOpen}
        onOpenChange={(open) => {
          setPaymentOpen(open);
          if (!open) {
            setPaySubId(null);
            setPayMaxRemaining(0);
          }
        }}
      >
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>{ct('subscriptions.paymentTitle')}</DialogTitle>
          </DialogHeader>
          {paymentSub && (
            <SubscriptionPaymentPanel
              value={subscriptionNetValue(paymentSub)}
              paid={paymentSub.paidAmount}
              remaining={payMaxRemaining}
              receipts={subscriptionReceipts}
              loading={loadingSubscriptionReceipts}
            />
          )}
          <ClubPaymentSplitFields
            total={payMaxRemaining}
            rows={payRows}
            onChange={setPayRows}
            onTotalChange={(amount) => setPayAmount(String(amount))}
          />
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setPaymentOpen(false)}>
              {ct('common.cancel')}
            </Button>
            <Button variant="brand" onClick={() => void pay()} disabled={saving}>
              {ct('subscriptions.pay')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={freezeOpen} onOpenChange={setFreezeOpen}>
        <DialogContent size="sm" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{ct('subscriptions.freezeTitle')}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <p className="text-sm text-muted-foreground">{ct('subscriptions.freezePreserveHint')}</p>
            <div className="grid gap-2">
              <Label htmlFor="subscription-freeze-days">{ui('مدة التجميد بالأيام')}</Label>
              <Input id="subscription-freeze-days" type="number" min="1" step="1" inputMode="numeric" aria-invalid={freezeDaysInvalid} value={freezeForm.days}
                aria-describedby="subscription-freeze-days-hint"
                onChange={event => setFreezeForm(form => ({ ...form, days: event.target.value }))} />
              <p id="subscription-freeze-days-hint" className="text-sm text-muted-foreground">{ui('سيب المدة فاضية للتجميد حتى فكّه أو نهاية رصيد التجميد المسموح.')}</p>
            </div>
            <FreezeExpiryPreview endDate={subs?.find(row => row.id === freezeSubId)?.subscriptionEndDate} days={Number(freezeForm.days) || 0} />
            <div className="grid gap-2">
              <Label>{ct('subscriptions.freezeReason')}</Label>
              <Input
                value={freezeForm.reason}
                onChange={(e) => setFreezeForm((f) => ({ ...f, reason: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFreezeOpen(false)}>
              {ct('common.cancel')}
            </Button>
            <Button variant="brand" onClick={() => void submitFreeze()} disabled={freezeDaysInvalid || saving}>
              {saving ? ct('common.saving') : ct('subscriptions.freeze')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SubscriptionNoteDialog
        subscription={noteSub}
        permissionResource={can('club.reception:update') ? 'club.reception' : 'club.subscriptions.list'}
        onOpenChange={(open) => !open && setNoteSub(null)}
        onSaved={() => void refetchSubs()}
      />

      <SubscriptionRenewalDialog
        source={renewSub}
        open={renewOpen}
        onOpenChange={(open) => {
          setRenewOpen(open);
          if (!open) setRenewSubId(null);
        }}
        onSuccess={({ subscription, quote, payments }) => {
          toast.success(
            quote.scheduleMode === 'immediate' || quote.scheduleMode === 'from_today'
              ? ct('subscriptions.renewSuccessNow')
              : ct('subscriptions.renewSuccessScheduled', { date: toArabicDigits(quote.startDate) }),
          );
          const receiptNumber = subscription.receiptNumber || subscription.subscriptionNumber;
          if (shouldPrint('subscriptionPayment', quote.paidAmount, receiptNumber)) {
            runAutoPrintOnce('subscriptionPayment', receiptNumber, () => printThermalFinancialReceiptWithFallback({
              documentNumber: receiptNumber,
              transactionLabel: 'Subscription renewal',
              itemName: subscription.subscriptionType || 'Membership renewal',
              customerName: subscription.customerName,
              memberCode: subscription.memberCode,
              branchName: branches.find((branch) => branch.id === subscription.branchId)?.name,
              collectedAmount: quote.paidAmount,
              payments: payments.map((row) => ({ method: row.method, amount: Number(row.amount) || 0 })),
              operatorName: user?.name,
              subscriptionNumber: subscription.subscriptionNumber,
            }, policy));
          }
          void qc.invalidateQueries({ queryKey: ['me', 'workspace', 'widgets'] });
          void refetchSubs();
          if (selectedId) void refreshEntitlement(selectedId);
        }}
      />

      <Dialog
        open={refundOpen}
        onOpenChange={(open) => {
          setRefundOpen(open);
          if (!open) {
            setRefundSubId(null);
            setRefundPreview(null);
          }
        }}
      >
        <DialogContent size="md" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{ct('subscriptions.refundTitle')}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            {refundSub && (
              <div className="rounded-xl border bg-muted/20 px-3 py-2.5 text-sm">
                <p className="font-medium">
                  {refundSub.subscriptionType ?? '—'} · {refundSub.subscriptionNumber}
                </p>
                <div className="mt-2 grid gap-1 text-xs nums text-muted-foreground sm:grid-cols-2">
                  <p>
                    {ct('subscriptions.paid')}: {formatMoney(refundSub.paidAmount)}
                  </p>
                  <p>
                    {ct('subscriptions.remaining')}: {formatMoney(refundSub.remainingAmount)}
                  </p>
                </div>
                {refundSub.remainingAmount > 0 && (
                  <p className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-sm font-medium text-amber-900 dark:text-amber-100">
                    {ct('subscriptions.refundOutstanding')}: {formatMoney(refundSub.remainingAmount)}
                  </p>
                )}
              </div>
            )}
            <div className="grid gap-2">
              <Label>{ct('subscriptions.refundStopDate')}</Label>
              <Input
                type="date"
                className="nums"
                dir="ltr"
                value={refundStopDate}
                onChange={(e) => setRefundStopDate(e.target.value)}
              />
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>{ct('subscriptions.refundReason')}</Label>
                <select
                  className={selectCls}
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                >
                  <option value="">—</option>
                  <option value="تراجع">{ct('subscriptions.reasonCancel')}</option>
                  <option value="مغادرة">{ct('subscriptions.reasonLeave')}</option>
                  <option value="أخرى">{ct('subscriptions.reasonOther')}</option>
                </select>
              </div>
              <div className="grid gap-2">
                <Label>{ct('subscriptions.refundNotes')}</Label>
                <Input value={refundNotes} onChange={(e) => setRefundNotes(e.target.value)} />
              </div>
            </div>

            {refundPreview && (
              <div className="space-y-3 rounded-2xl border border-primary/25 bg-primary/5 p-4">
                <p className="text-xs text-muted-foreground">
                  {refundPreview.refundBasis === 'sessions'
                    ? ct('subscriptions.refundCalcEquationSessions')
                    : ct('subscriptions.refundCalcEquation')}
                </p>
                <DialogFormSummary
                  items={[
                    {
                      label: ct('subscriptions.originalValue'),
                      value: formatMoney(refundPreview.originalValue),
                    },
                    {
                      label: ct('subscriptions.paid'),
                      value: formatMoney(refundPreview.paidAmount ?? refundSub?.paidAmount ?? 0),
                    },
                    {
                      label: ct('subscriptions.remaining'),
                      value: formatMoney(refundSub?.remainingAmount ?? 0),
                      accent: (refundSub?.remainingAmount ?? 0) > 0 ? 'warning' : undefined,
                    },
                    {
                      label: ct('subscriptions.consumedValue'),
                      value: formatMoney(refundPreview.consumedValue),
                      accent: 'warning',
                    },
                    {
                      label: ct('subscriptions.refundAmount'),
                      value: formatMoney(refundPreview.refundAmount),
                      accent: refundPreview.refundAmount > 0 ? 'success' : 'warning',
                    },
                  ]}
                />
                <div className="grid gap-1 text-sm nums text-muted-foreground">
                  {refundPreview.refundBasis === 'sessions' ? (
                    <p>
                      {ct('subscriptions.consumedSessions')}:{' '}
                      {toArabicDigits(
                        Math.max(
                          0,
                          (refundSub?.sessionsCount ?? 0) - (refundPreview.remainingSessions ?? 0),
                        ),
                      )}{' '}
                      / {toArabicDigits(refundSub?.sessionsCount ?? 0)}
                    </p>
                  ) : (
                    <p>
                      {ct('subscriptions.consumedDays')}: {toArabicDigits(refundPreview.consumedDays)} /{' '}
                      {toArabicDigits(refundPreview.totalDays)} {ct('subscriptions.typeDays')}
                    </p>
                  )}
                  {(refundSub?.remainingAmount ?? 0) > 0 && (
                    <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-sm font-medium text-amber-900 dark:text-amber-100">
                      {ct('subscriptions.refundOwesNote')}: {formatMoney(refundSub!.remainingAmount)}
                    </p>
                  )}
                  {refundPreview.refundAmount > 0 ? (
                    <p className="text-xs">{ct('subscriptions.refundPayoutWarning')}</p>
                  ) : (
                    <p className="text-xs text-amber-700 dark:text-amber-400">
                      {ct('subscriptions.refundNoAmount')}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRefundOpen(false)}>
              {ct('common.cancel')}
            </Button>
            <Button
              variant="brand"
              disabled={saving || !refundPreview}
              onClick={() => void submitRefund()}
            >
              <Undo2 className="size-4" />
              {saving
                ? ct('common.saving')
                : ct(refundPreview && refundPreview.refundAmount <= 0 ? 'subscriptions.refundCloseAction' : 'subscriptions.refundPayoutAction')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={transferOpen}
        onOpenChange={(open) => {
          setTransferOpen(open);
          if (!open) {
            setTransferSubId(null);
            setTransferPlanPreview(null);
            setTransferPlanPreviewError(null);
          }
        }}
      >
        <DialogContent size="md" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{ct('subscriptions.transferPlan')}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            {transferSub && (
              <div className="rounded-xl border bg-muted/20 px-3 py-2.5 text-sm">
                <p className="text-xs text-muted-foreground">{ct('subscriptions.transferCurrentPlan')}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <p className="font-medium">{transferSub.subscriptionType ?? '—'}</p>
                  <span
                    className={
                      transferSub.isLinkedToSessions
                        ? 'inline-flex items-center rounded-md bg-sky-500/10 px-2 py-0.5 text-[11px] font-medium text-sky-800 dark:text-sky-200'
                        : 'inline-flex items-center rounded-md bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-800 dark:text-emerald-200'
                    }
                  >
                    {transferSub.isLinkedToSessions
                      ? ct('packages.kindSessions')
                      : ct('packages.kindSubscription')}
                  </span>
                </div>
                <div className="mt-2 grid gap-1 text-xs nums text-muted-foreground sm:grid-cols-2">
                  <p>
                    {ct('subscriptions.paid')}: {formatMoney(transferSub.paidAmount)}
                  </p>
                  <p>
                    {ct('subscriptions.transferOutstanding')}: {formatMoney(transferSub.remainingAmount)}
                  </p>
                </div>
              </div>
            )}

            {transferPlanPreviewError ? (
              <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-2.5 py-1.5 text-sm text-destructive">
                {transferPlanPreviewError}
              </p>
            ) : null}

            <div className="grid gap-2">
              <Label>{ct('subscriptions.transferToType')}</Label>
              <TransferPlanPicker
                types={transferSubTypes}
                sourceIsSessions={Boolean(transferSub?.isLinkedToSessions)}
                excludeTypeId={transferSub?.subscriptionTypeId}
                value={transferForm.toSubscriptionTypeId}
                onChange={(typeId) =>
                  setTransferForm((f) => ({ ...f, toSubscriptionTypeId: typeId }))
                }
              />
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>{ct('subscriptions.startDate')}</Label>
                <Input
                  type="date"
                  className="nums"
                  dir="ltr"
                  readOnly={transferPlanPreview?.pricingMode === 'price_difference'}
                  value={transferPlanPreview?.pricingMode === 'price_difference' ? transferPlanPreview.toStartDate : transferForm.toStartDate}
                  onChange={(e) => setTransferForm((f) => ({ ...f, toStartDate: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label>{ct('subscriptions.endDate')}</Label>
                <Input type="date" className="nums bg-muted" dir="ltr" value={transferForm.toEndDate} readOnly />
              </div>
            </div>

            {transferForm.toSubscriptionTypeId && transferCanChooseStart ? (
              <PlanTransferStartChoice
                value={transferStartFrom}
                originalStartDate={transferSub?.subscriptionStartDate}
                disabled={saving}
                onChange={(next) => {
                  setTransferStartFrom(next);
                  if (next === 'today') setTransferForm((f) => ({ ...f, toStartDate: localToday() }));
                }}
              />
            ) : null}

            {transferForm.toSubscriptionTypeId && transferTargetValue > 0 ? (
              <PlanTransferDiscountFields
                open={transferOpen}
                grossValue={transferTargetValue}
                value={transferDiscount}
                appliedDiscount={transferPlanPreview?.discountValue}
                requestedDiscount={transferPlanPreview?.requestedDiscountValue}
                disabled={saving}
                onChange={setTransferDiscount}
              />
            ) : null}

            {transferPlanPreview && (
              <div className="space-y-2 rounded-2xl border border-primary/25 bg-primary/5 p-4">
                {transferPlanPreview.pricingMode === 'price_difference' && <p className="text-sm text-muted-foreground">{ct('subscriptions.transferPriceDifferenceHelp')}</p>}
                <DialogFormSummary
                  items={[
                    {
                      label: ct('subscriptions.transferNewPrice'),
                      value: formatMoney(transferPlanPreview.targetValue),
                    },
                    ...(transferPlanPreview.targetSessionsCount != null
                      ? [{
                          label: ct('packages.sessionsCount'),
                          value: toArabicDigits(transferPlanPreview.targetSessionsCount),
                        }]
                      : []),
                    ...(transferPlanPreview.pricingMode !== 'price_difference' && (transferPlanPreview.consumedValue ?? 0) > 0
                      ? [{
                          label: transferPlanPreview.consumedSessions
                            ? `${ui('المستهلك من الخطة القديمة')} (${toArabicDigits(transferPlanPreview.consumedSessions)}${ui(' حصة')})`
                            : ui('المستهلك من الخطة القديمة'),
                          value: formatMoney(transferPlanPreview.consumedValue ?? 0),
                        }]
                      : []),
                    {
                      label: ct(transferPlanPreview.pricingMode === 'price_difference' ? 'subscriptions.transferPaidCredit' : 'subscriptions.transferCredit'),
                      value: formatMoney(transferPlanPreview.transferableCredit),
                      accent: 'success' as const,
                    },
                    ...((transferPlanPreview.discountValue ?? 0) > 0
                      ? [{ label: ui('الخصم'), value: `− ${formatMoney(transferPlanPreview.discountValue ?? 0)}`, accent: 'success' as const }]
                      : []),
                    {
                      label:
                        transferPlanPreview.additionalDue > 0
                          ? ct('subscriptions.transferPayMore')
                          : ct('subscriptions.transferCreditLeft'),
                      value: formatMoney(
                        transferPlanPreview.additionalDue > 0
                          ? transferPlanPreview.additionalDue
                          : transferPlanPreview.refundAmount,
                      ),
                      accent: transferPlanPreview.additionalDue > 0 ? 'warning' as const : 'success' as const,
                    },
                  ]}
                />
                {transferPlanPreview.additionalDue > 0 && (
                  <div className="space-y-3">
                    <ClubPaymentSplitFields
                      total={transferPlanPreview.additionalDue}
                      rows={transferPaymentRows}
                      onChange={setTransferPaymentRows}
                      onTotalChange={(amount) => setTransferPaidAmount(String(amount))}
                      disabled={saving}
                    />
                    <p className="text-sm text-muted-foreground">{ct('subscriptions.transferUnpaidHint')}</p>
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransferOpen(false)}>
              {ct('common.cancel')}
            </Button>
            <Button variant="brand" onClick={() => void saveTransfer()} disabled={saving || !transferPlanPreview}>
              <ArrowRightLeft className="size-4" />
              {saving ? ct('common.saving') : ct('subscriptions.transferPlan')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <GuestInvitationDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        memberId={selectedId}
        preferredSubscriptionId={inviteSubId}
      />
    </div>
  );
}
