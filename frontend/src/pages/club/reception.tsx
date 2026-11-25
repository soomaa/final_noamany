import {
  AlertTriangle,
  ArrowRightLeft,
  Ban,
  Building2,
  CheckCircle2,
  Clock3,
  Copy,
  CreditCard,
  Eye,
  EyeOff,
  FileText,
  LogIn,
  LockKeyhole,
  Pencil,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  Snowflake,
  Sun,
  Undo2,
  Trash2,
  XCircle,
  X as XIcon,
  Zap,
} from 'lucide-react';
import { MaskedPhone } from '@/components/club/masked-phone';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Maximize2, Minimize2 } from 'lucide-react';
import { MemberAvatar } from '@/components/club/member-avatar';
import { BlockedMemberBanner } from '@/components/club/blocked-member-flag';
import { ClubMemberSearchHits, exactCodeHit, normalizeScannedCode, preferredSearchHit, searchClubMembersUniversal } from '@/components/club/club-member-search';
import { ReceptionMemberProfile } from '@/components/club/reception-member-profile';
import { ReceptionMemberAttachments, ReceptionMemberEditForm, ReceptionMemberPhotoEdit } from '@/components/club/reception-member-edit';
import { ReceptionMemberWhatsApp } from '@/components/club/reception-member-whatsapp';
import { WhatsAppIcon } from '@/components/club/whatsapp-icon';
import { playEntrySound, prepareEntrySound } from '@/lib/entry-sounds';
import { isExpiryRefusal } from '@/lib/entry-voice';
import { CameraScanButton } from '@/components/club/camera-barcode-scanner';
import { EntrySoundSettings } from '@/components/club/entry-sound-settings';
import { StaffInvitationButton } from '@/components/club/staff-invitation-dialog';
import { useSaveAndWhatsApp } from '@/hooks/use-whatsapp-templates';
import { messageAmount } from '@/lib/whatsapp-message';
import { ReceptionServiceAllowances } from '@/components/club/reception-service-allowances';
import type { ClubPaymentMethod } from '@/components/club/club-payment-method-select';
import {
  buildClubPaymentSplit,
  ClubPaymentSplitFields,
  singlePaymentRow,
  type ClubPaymentSplitRow,
} from '@/components/club/club-payment-split-fields';
import { ReceptionDailyAttendanceTable } from '@/components/club/reception-daily-attendance-table';
import {
  AttendanceSummaryCards,
  useClubAttendanceStatistics,
} from '@/components/club/attendance-summary-cards';
import { TransferPlanPicker } from '@/components/club/transfer-plan-picker';
import { PageHeader } from '@/components/common/page-header';
import { FieldWrapper } from '@/components/common/form-fields';
import {
  SubscriptionPaymentPanel,
  subscriptionNetValue,
  type SubscriptionPaymentReceiptRow,
} from '@/components/club/subscription-payment-panel';
import { WorkspaceWidgets } from '@/components/workspace/workspace-widgets';
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
import { SubscriptionPurgeDialog, useCanPurgeSubscription } from '@/components/club/subscription-purge-dialog';
import { FreezeBalance, freezeDays } from '@/components/club/freeze-balance';
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
import { formatDateTime, formatMoney, localToday } from '@/lib/formatters';
import { subscriptionTypesForBranch } from '@/lib/club-subscription-branches';
import { cn, toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';
import { useAuth } from '@/store/auth';
import type { ClubMemberOverview, ClubSubscriptionListItem, ClubSubscriptionType } from '@/types/club';
import type {
  CheckInResponse,
  ClubSearchHit,
  EntitlementReason,
  EntitlementResult,
} from '@/types/gym-ops';
import type { ClubQuickServiceRow } from './reception-quick-services';
import { SearchableSelect } from '@/components/common/searchable-select';

const GRACE_REASON_PRESETS = [
  'جلسة سماح بعد انتهاء الاشتراك',
  'تجديد قيد الإجراء',
  'موافقة الإدارة',
] as const;
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


/** Calendar days from today to a YYYY-MM-DD day (negative = in the past). */
function daysUntil(day: string): number {
  const d = Date.parse(`${day}T12:00:00`);
  const now = new Date();
  const today = Date.parse(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}T12:00:00`);
  return Number.isNaN(d) ? 0 : Math.round((d - today) / 86_400_000);
}

/**
 * «مجمّد منذ ١١ يوم · يرجع بعد ٤ أيام» (client, 22 Nov): how long the member has been stopped,
 * not the start date, and when he is back.
 */
function frozenLabel(freeze: { startDate: string; plannedEndDate: string | null } | null | undefined): string {
  if (!freeze) return 'مجمّد';
  const since = -daysUntil(freeze.startDate);
  const head = since <= 0 ? 'مجمّد من النهارده' : `مجمّد منذ ${toArabicDigits(since)} ${since === 1 ? 'يوم' : since <= 10 ? 'أيام' : 'يوم'}`;
  const back = freeze.plannedEndDate ? daysUntil(freeze.plannedEndDate) : null;
  return back != null && back > 0 ? `${head} · يرجع بعد ${toArabicDigits(back)} ${back === 1 ? 'يوم' : back <= 10 ? 'أيام' : 'يوم'}` : head;
}

/** «السبت ١ نوفمبر» (+ the year when it is not this year) for a YYYY-MM-DD day. */
function formatDayLabel(day: string): string {
  const d = new Date(`${day}T12:00:00`);
  if (Number.isNaN(d.getTime())) return day;
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString('ar-EG', { weekday: 'short', day: 'numeric', month: 'long', ...(sameYear ? {} : { year: 'numeric' }) });
}

/** Whole calendar days between a check-in time and today (0 = today). */
function daysSince(iso: string): number {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return 0;
  const a = new Date(then.getFullYear(), then.getMonth(), then.getDate()).getTime();
  const now = new Date();
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.max(0, Math.round((b - a) / 86400000));
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
  const endDate = latest?.endDate;

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



function isExpiredLikeSubscription(s: ClubSubscriptionListItem) {
  const st = String(s.status ?? '').toLowerCase();
  if (st === 'expired') return true;
  const end = String(s.subscriptionEndDate ?? '');
  if (end && end < localToday() && !end.startsWith('2099')) return true;
  if (s.isLinkedToSessions) {
    const remaining = Math.max(0, (s.sessionsCount ?? 0) - (s.sessionsUsed ?? 0));
    if ((s.sessionsCount ?? 0) > 0 && remaining <= 0) return true;
  }
  return false;
}


export function ClubReceptionPage() {
  const { ui } = useLocale();
  const ct = useClubT();
  const { can } = usePermission();
  const { user } = useAuth();
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
    can('club.subscriptions:create') ||
    can('club.subscriptions.list:create') ||
    can('club.subscriptions.new:create');
  const canUpdateSubscription =
    can('club.reception:update') ||
    can('club.subscriptions:update') ||
    can('club.subscriptions.list:update');
  // «حذف (اتعمل بالغلط)»: the subscriptions delete grant only (reception's own grant is not enough).
  const canPurgeSubscription = useCanPurgeSubscription();
  const canBlockMember =
    can('club.members:update') ||
    can('club.reception:update');
  // Photo and data edits from the member screen follow the members screen's own edit right.
  const canEditMember = can('club.members:update');
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const inputRef = useRef<HTMLInputElement>(null);
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
      || `${ui('فرع رقم')} ${toArabicDigits(activeReceptionBranchId)}`
    : ui('كل الفروع');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [memberOpen, setMemberOpen] = useState(false);
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
  const [profileOpen, setProfileOpen] = useState(false);
  const [editingMember, setEditingMember] = useState(false);
  const entitlementRequestRef = useRef(0);
  const selectedIdRef = useRef<number | null>(null);
  const profileRef = useRef<HTMLDivElement | null>(null);
  const [freezeOpen, setFreezeOpen] = useState(false);
  const [editingFreeze, setEditingFreeze] = useState(false);
  const [freezeSubId, setFreezeSubId] = useState<number | null>(null);
  const [freezeForm, setFreezeForm] = useState({ startDate: localToday(), endDate: localToday(), reason: '' });
  const [renewOpen, setRenewOpen] = useState(false);
  const [renewSubId, setRenewSubId] = useState<number | null>(null);
  // «حفظ وإرسال واتساب» on renewal, like the subscriptions screen.
  const saveAndWhatsApp = useSaveAndWhatsApp();
  const [renewForm, setRenewForm] = useState({ paidAmount: '' });
  const [renewRows, setRenewRows] = useState<ClubPaymentSplitRow[]>(singlePaymentRow());
  const [refundOpen, setRefundOpen] = useState(false);
  const [purgeSubId, setPurgeSubId] = useState<number | null>(null);
  const [refundSubId, setRefundSubId] = useState<number | null>(null);
  const [refundStopDate, setRefundStopDate] = useState(localToday());
  const [refundReason, setRefundReason] = useState('');
  const [refundNotes, setRefundNotes] = useState('');
  const [refundPreview, setRefundPreview] = useState<RefundPreview | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferSubId, setTransferSubId] = useState<number | null>(null);
  const [transferForm, setTransferForm] = useState({
    toSubscriptionTypeId: '',
    toStartDate: localToday(),
    toEndDate: '',
    toValue: '',
  });
  const [transferPlanPreview, setTransferPlanPreview] = useState<{
    transferableCredit: number;
    targetValue: number;
    creditApplied: number;
    refundAmount: number;
    additionalDue: number;
    toEndDate: string;
    targetSessionsCount: number | null;
  } | null>(null);
  const [transferPlanPreviewError, setTransferPlanPreviewError] = useState<string | null>(null);
  const [blockOpen, setBlockOpen] = useState(false);
  const [blockReason, setBlockReason] = useState('');
  const [blockSaving, setBlockSaving] = useState(false);
  const [saving, setSaving] = useState(false);

  const { data: subTypes } = useArrayResource<ClubSubscriptionType>('club-subscription-types');

  useEffect(() => {
    setSelectedId(null);
    setMemberOpen(false);
    setEntitlement(null);
    setQuery('');
  }, [effectiveReceptionBranch]);

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

  const { data: quickServices = [] } = useQuery({
    queryKey: ['club-quick-services', 'catalog', effectiveReceptionBranch || 'all'],
    queryFn: async () => {
      const { data } = await api.get<ClubQuickServiceRow[]>('/club-quick-services/catalog', {
        params: { branchId: effectiveReceptionBranch || undefined },
      });
      return data;
    },
    enabled: canSellQuick || canManageQuick,
  });

  const today = localToday();
  const { data: todayAttendanceStats } = useClubAttendanceStatistics(
    { startDate: today, endDate: today, branch: effectiveReceptionBranch || undefined },
    { refetchInterval: 60_000 },
  );

  const { data: searchResult, isFetching: searching } = useQuery({
    queryKey: ['club-universal-search', effectiveReceptionBranch || 'all', query],
    enabled: query.trim().length >= 2 && !memberOpen,
    queryFn: () => searchClubMembersUniversal(query, { withEntitlement: true, branchId: effectiveReceptionBranch || undefined }),
  });

  const { data: overview, refetch: refetchOverview, isPending: loadingOverview, isFetching: loadingMember, isError: overviewError, error: profileError } = useQuery({
    queryKey: ['club-reception-profile', effectiveReceptionBranch || 'all', selectedId],
    enabled: selectedId != null && memberOpen,
    queryFn: async () => (await api.get<ClubMemberOverview>('/club-attendance/member-overview', {
      params: { memberId: selectedId },
    })).data,
  });
  const member = overview?.member;
  const refetchMember = refetchOverview;

  const { data: subs, refetch: reloadSubs, isFetching: loadingSubs } = useQuery({
    queryKey: ['club-reception-subs', effectiveReceptionBranch || 'all', selectedId],
    enabled: selectedId != null,
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

  const refetchSubs = () => {
    void refetchOverview();
    return reloadSubs();
  };

  /** Active / frozen first; expired (and exhausted sessions) sink to the bottom. */
  const sortedSubs = useMemo(() => {
    const list = [...(subs ?? [])];
    // Running basic membership first, then running private / sessions / class plans under it, then
    // frozen, upcoming and finally the expired ones (client, 22 Nov).
    const rank = (s: ClubSubscriptionListItem) => {
      if (isExpiredLikeSubscription(s)) return 4;
      const st = String(s.status ?? '').toLowerCase();
      if (st === 'upcoming') return 3;
      if (st === 'frozen') return 2;
      if (s.isLinkedToSessions || s.isSpecial || s.specialClassTypeId != null || s.privatePackageId != null) return 1;
      return 0; // active basic membership
    };
    list.sort((a, b) => {
      const diff = rank(a) - rank(b);
      if (diff !== 0) return diff;
      return (b.id ?? 0) - (a.id ?? 0);
    });
    return list;
  }, [subs]);

  /** Reception alert: no usable active subscription (all expired / empty). */
  const hasExpiredSubscriptionAlert = useMemo(() => {
    if (!subs || loadingSubs) return false;
    if (subs.length === 0) return true;
    const hasUsable = subs.some((s) => {
      const st = String(s.status ?? '').toLowerCase();
      return (st === 'active' || st === 'frozen') && !isExpiredLikeSubscription(s);
    });
    return !hasUsable;
  }, [subs, loadingSubs]);

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

  const renewNetValue = renewSub ? subscriptionNetValue(renewSub) : 0;
  const renewPaidNow = Math.max(0, Number(renewForm.paidAmount) || 0);
  const renewRemaining = Math.max(0, renewNetValue - renewPaidNow);

  useEffect(() => {
    if (!transferOpen || !transferSubId || !transferForm.toSubscriptionTypeId || !transferForm.toStartDate) {
      setTransferPlanPreview(null);
      setTransferPlanPreviewError(null);
      return;
    }
    const type = (subTypes ?? []).find((t) => t.id === Number(transferForm.toSubscriptionTypeId));
    if (!type) return;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const { data } = await api.post<{
            transferableCredit: number;
            targetValue: number;
            creditApplied: number;
            refundAmount: number;
            additionalDue: number;
            toEndDate: string;
            targetSessionsCount: number | null;
          }>('/club-subscription-transfers/preview', {
            subscriptionId: transferSubId,
            toSubscriptionTypeId: Number(transferForm.toSubscriptionTypeId),
            toStartDate: transferForm.toStartDate,
          });
          setTransferPlanPreview(data);
          setTransferPlanPreviewError(null);
          setTransferForm((f) => ({
            ...f,
            toEndDate: data.toEndDate,
            toValue: String(data.targetValue),
          }));
        } catch (e) {
          setTransferPlanPreview(null);
          setTransferPlanPreviewError(apiError(e));
          setTransferForm((f) => ({
            ...f,
            // The start day counts, matching the server's plan-transfer end date.
            toEndDate: addDaysLocal(
              f.toStartDate,
              Math.max(1, type.days > 0 ? type.days : type.isLinkedToSessions ? 30 : 0) - 1,
            ),
            toValue: String(type.price),
          }));
        }
      })();
    }, 250);
    return () => window.clearTimeout(timer);
  }, [transferOpen, transferSubId, transferForm.toSubscriptionTypeId, transferForm.toStartDate, subTypes]);

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
            { subscriptionId: refundSubId, stopDate: refundStopDate, branchId: activeReceptionBranchId ?? undefined },
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

  const refreshEntitlement = async (memberId: number, branchId?: number): Promise<EntitlementResult | null> => {
    // Scanning the next card while this reply is on its way: a late answer must not land on it.
    const request = ++entitlementRequestRef.current;
    try {
      const { data } = await api.get<EntitlementResult>('/club/entitlement/validate', {
        params: { memberId, branchId: branchId ?? member?.branchId ?? undefined },
      });
      if (request !== entitlementRequestRef.current) return null;
      setEntitlement(data);
      return data;
    } catch {
      if (request === entitlementRequestRef.current) setEntitlement(null);
      return null;
    }
  };

  const selectMember = async (hit: ClubSearchHit) => {
    selectedIdRef.current = hit.id;
    setSelectedId(hit.id);
    setEditingMember(false);
    setQuery(hit.memberCode);
    setMemberOpen(true);
    return refreshEntitlement(hit.id, hit.branchId);
  };

  const closeMemberPanel = (open: boolean) => {
    setMemberOpen(open);
    if (!open) {
        setProfileOpen(false);
      setEditingMember(false);
      selectedIdRef.current = null;
      setSelectedId(null);
      setEntitlement(null);
      setBlockOpen(false);
      setBlockReason('');
      setQuery('');
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  };

  const refreshMemberAfterBlockChange = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['club-reception-member'] }),
      qc.invalidateQueries({ queryKey: ['club-reception-profile'] }),
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

  const runSearch = async (raw?: string) => {
    // A scanner on the Arabic keyboard layout types «لآ18580» for B18580: read it back as the code.
    const source = raw ?? query;
    const q = normalizeScannedCode(source);
    if (q.length < 2) {
      toast.error(ct('members.enterCode'));
      return;
    }
    if (q !== source.trim() || raw != null) setQuery(q);
    try {
      const data = await searchClubMembersUniversal(q, { withEntitlement: true, branchId: effectiveReceptionBranch || undefined });
      const hit = preferredSearchHit(data, q);
      if (hit) {
        const scanned = exactCodeHit(data, q)?.id === hit.id;
        const ent = await selectMember(hit);
        // Display only (client voice note, 22 Nov): the check-in itself is done by the barcode
        // check-in screen on its own device; this screen shows the member until the next scan.
        // A scanned card sounds its result (مقبول / مرفوض / الاشتراك منتهي) so reception notices.
        if (scanned && ent) {
          void playEntrySound(ent.allowed ? 'granted' : isExpiryRefusal(ent.reasons) ? 'expired' : 'rejected');
        }
      } else {
        toast.error(ct('members.noMemberFound'));
        if (raw != null) void playEntrySound('rejected');
      }
    } catch (error) {
      toast.error(apiError(error));
    }
  };

  // A card scanned while focus is not in a text box (member screen open, a button focused…) still
  // reaches reception: a burst of keys a few ms apart ending in Enter (or a short pause) is a scan.
  // It closes the current member and opens the scanned one. Typing in any input is left alone.
  const runSearchRef = useRef(runSearch);
  runSearchRef.current = runSearch;
  const closePanelRef = useRef(closeMemberPanel);
  closePanelRef.current = closeMemberPanel;

  // A card scanned with the topbar camera on another page lands here as `?scan=<code>`.
  const scanParam = searchParams.get('scan');
  useEffect(() => {
    if (!scanParam) return;
    const next = new URLSearchParams(searchParams);
    next.delete('scan');
    setSearchParams(next, { replace: true });
    closePanelRef.current(false);
    void runSearchRef.current(scanParam);
    // Runs once per scanned code; the param is removed straight away.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanParam]);
  useEffect(() => {
    let buffer = '';
    let last = 0;
    let timer: number | undefined;
    const finish = () => {
      const code = buffer;
      buffer = '';
      if (code.length < 4) return;
      closePanelRef.current(false);
      void runSearchRef.current(code);
    };
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const now = Date.now();
      if (e.key === 'Enter' || e.key === 'Tab') {
        if (buffer.length >= 4 && now - last < 300) {
          e.preventDefault();
          e.stopPropagation();
          window.clearTimeout(timer);
          finish();
        } else buffer = '';
        return;
      }
      if (e.key.length !== 1) return;
      if (now - last > 120) buffer = ''; // a person typing, not a scanner
      buffer += e.key;
      last = now;
      window.clearTimeout(timer);
      timer = window.setTimeout(finish, 260);
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      window.clearTimeout(timer);
    };
  }, []);

  const openGrace = (subscriptionId?: number | null) => {
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
    if (!selectedId || !canCheckIn) return;
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
        ? `${data.classAttendance.className} — ${data.classAttendance.trainerName}${data.classAttendance.hallName ? ` — ${data.classAttendance.hallName}` : ''}`
        : '';
      toast.success([base, classDetail, detail].filter(Boolean).join(' — '));
      setOverrideOpen(false);
      setOverrideReason('');
      setOverrideSubId(null);
      void qc.invalidateQueries({ queryKey: ['club-recent-checkins'] });
      void qc.invalidateQueries({ queryKey: ['club-attendance', 'statistics'] });
      void refetchSubs();
      void refetchOverview();
    } catch (e) {
      const err = e as { response?: { data?: { entitlement?: EntitlementResult } } };
      const deniedEntitlement = err.response?.data?.entitlement;
      if (deniedEntitlement) setEntitlement(deniedEntitlement);
      if (!force && deniedEntitlement && deniedEntitlement.allowed === false) {
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
    if (!freezeSubId || !canUpdateSubscription) return;
    setSaving(true);
    try {
      if (editingFreeze) {
        await api.patch(`/club-subscriptions/${freezeSubId}/freeze`, {
          freezeEndDate: freezeForm.endDate,
          reason: freezeForm.reason.trim() || undefined,
        });
      } else {
        await api.post(`/club-subscriptions/${freezeSubId}/freeze`, {
          freezeStartDate: freezeForm.startDate,
          freezeEndDate: freezeForm.endDate,
          reason: freezeForm.reason.trim() || undefined,
        });
      }
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

  const submitRenew = async () => {
    if (!renewSubId || !canUpdateSubscription) return;
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
      const { data: renewed } = await api.patch<{ subscription?: { id: number } }>(`/club-subscriptions/${renewSubId}/renew`, body);
      saveAndWhatsApp.target(renewed?.subscription?.id ?? renewSubId, body.paidAmount ? { payment_amount: messageAmount(body.paidAmount) } : {});
      toast.success(ct('common.success'));
      setRenewOpen(false);
      void qc.invalidateQueries({ queryKey: ['me', 'workspace', 'widgets'] });
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
    if (!canUpdateSubscription || !refundSubId || !refundPreview || refundPreview.refundAmount <= 0) return;
    setSaving(true);
    try {
      const ok = await confirmWithPreview(
        {
          title: ct('subscriptions.refundTitle'),
          description: ct('subscriptions.refundPayoutDesc'),
          confirmLabel: ct('subscriptions.refundPayoutAction'),
          variant: 'destructive',
        },
        async () => {
          const { data } = await api.post('/club-subscription-refunds?dryRun=true', {
            subscriptionId: refundSubId,
            branchId: activeReceptionBranchId ?? undefined,
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
            branchId: activeReceptionBranchId ?? undefined,
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
      toast.error(transferPlanPreviewError || 'تعذر حساب التحويل — راجع شاشة الاشتراكات');
      return;
    }
    if (transferPlanPreview.additionalDue > 0) {
      toast.error(
        `فرق التحويل المطلوب ${formatMoney(transferPlanPreview.additionalDue)} — حصّله من شاشة الاشتراكات`,
      );
      return;
    }
    setSaving(true);
    try {
      await api.post('/club-subscription-transfers', {
        subscriptionId: transferSubId,
        toSubscriptionTypeId: Number(transferForm.toSubscriptionTypeId),
        toStartDate: transferForm.toStartDate,
        additionalPaidAmount: 0,
        refundPaymentMethod:
          transferPlanPreview.refundAmount > 0 ? 'cash' : undefined,
      });
      toast.success(
        transferPlanPreview.refundAmount > 0
          ? `تم التحويل ورد ${formatMoney(transferPlanPreview.refundAmount)}`
          : 'تم تحويل الخطة وإنشاء الاشتراك الجديد',
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

  // Active (and frozen) subscriptions sit beside the member photo with their actions;
  // expired and other subscriptions stay in the section below.
  const isCurrentSubscription = (s: ClubSubscriptionListItem) =>
    s.status === 'frozen' || (s.status === 'active' && !isExpiredLikeSubscription(s));

  // Ended subscriptions reception chose to hide (X on the card), kept on this device.
  // Ended subscriptions stay hidden until reception asks for them (reset for every member).
  const [showExpired, setShowExpired] = useState(false);
  useEffect(() => { setShowExpired(false); }, [member?.id]);
  const expiredCount = sortedSubs.filter((sub) => isExpiredLikeSubscription(sub)).length;
  const visibleSubs = showExpired ? sortedSubs : sortedSubs.filter((sub) => !isExpiredLikeSubscription(sub));

  const renderSubscriptionCard = (s: ClubSubscriptionListItem) => {
    const sessions = !!s.isLinkedToSessions;
    const remainingSessions = Math.max(0, (s.sessionsCount ?? 0) - (s.sessionsUsed ?? 0));
    const daysRemaining = Math.max(
      0,
      Math.round((Date.parse(s.subscriptionEndDate) - Date.parse(localToday())) / 86_400_000),
    );
    const status = s.status as string;
    const active = status === 'active';
    const frozen = status === 'frozen';
    const activeFreeze = s.activeFreeze;
    const expired = isExpiredLikeSubscription(s);
    return (
      <div
        key={s.id}
        className={cn(
          'relative rounded-2xl border p-4 shadow-sm',
          // The whole card says the state at a glance (client, 22 Nov — like the old system):
          // running = green, frozen = yellow, ended = red (ended ones stay hidden until asked for).
          expired
            ? 'border-red-300 bg-red-50 dark:border-red-500/40 dark:bg-red-500/10'
            : frozen
              ? 'border-amber-300 bg-amber-50 dark:border-amber-500/40 dark:bg-amber-500/10'
              : active
                ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-500/40 dark:bg-emerald-500/10'
                : 'bg-gradient-to-br from-card to-muted/20',
        )}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-2">
            <p className="text-base font-semibold">
              {s.subscriptionType ?? '—'}
            </p>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {!expired ? (
                <span className={cn('rounded-full px-2.5 py-1 font-semibold',
                  s.privatePackageId != null || (s.isSpecial && !s.specialClassTypeId) ? 'bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-200'
                    : sessions || s.specialClassTypeId ? 'bg-sky-500/10 text-sky-700 dark:text-sky-200'
                      : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-200')}>
                  {s.privatePackageId != null || (s.isSpecial && !s.specialClassTypeId) ? ui('برايفت') : sessions || s.specialClassTypeId ? ui('حصص') : ui('اشتراك أساسي')}
                </span>
              ) : null}
              {s.specialClassTypeId ? <span className="rounded-full bg-violet-500/10 px-2.5 py-1 text-violet-700 dark:text-violet-200">اشتراك خاص · حضور تلقائي حسب الجدول</span> : null}
              {sessions ? (
                <span className={cn('rounded-full px-2.5 py-1 nums', expired ? 'bg-muted text-muted-foreground' : 'bg-primary/10 text-primary')}>
                  {ui('حصص')}: {toArabicDigits(remainingSessions)} {ui('متبقّية')}
                </span>
              ) : !expired ? (
                <span className="rounded-full bg-primary/10 px-2.5 py-1 text-primary nums">
                  {ui('متبقّي')} {toArabicDigits(daysRemaining)} {ui('يوم')}
                </span>
              ) : null}
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
                label={expired ? ui('منتهي') : frozen ? frozenLabel(activeFreeze) : undefined}
                className={expired ? 'border-red-200 bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-200' : frozen ? 'border-amber-300 bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-200' : undefined}
              />
              <span className="rounded-full bg-muted px-2.5 py-1 nums text-muted-foreground">
                {ui('المبلغ المدفوع')}: {formatMoney(s.paidAmount)}
              </span>
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
              {/* Say what the button does: the gym entry, or attending one session of this plan. */}
              {checkingSubId === s.id
                ? ct('common.saving')
                : s.privatePackageId != null || (s.isSpecial && !s.specialClassTypeId)
                  ? ui('تحضير حصة برايفت')
                  : s.specialClassTypeId
                    ? ui('تحضير الكلاس')
                    : sessions
                      ? ui('تحضير حصة')
                      : ui('تسجيل دخول الجيم')}
            </Button>
          )}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-border/60 pt-3">
          <div>
            <p className="text-xs text-muted-foreground">{ui('تاريخ بداية الاشتراك')}</p>
            <p className="mt-1 text-lg font-bold nums">{toArabicDigits(s.subscriptionStartDate)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{ui('تاريخ الانتهاء')}</p>
            <p className="mt-1 text-lg font-bold nums">{toArabicDigits(s.subscriptionEndDate)}</p>
          </div>
        </div>

        {/* All subscription actions on one row; compact buttons, sideways scroll only on narrow screens. */}
        {canUpdateSubscription || canPurgeSubscription ? <div className="mt-4 flex flex-nowrap gap-1.5 overflow-x-auto border-t border-border/60 pt-3 [&>button]:h-8 [&>button]:shrink-0 [&>button]:gap-1 [&>button]:whitespace-nowrap [&>button]:px-2.5 [&>button]:text-xs [&>button_svg]:size-3.5">
          {canUpdateSubscription ? <>
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
                setEditingFreeze(false);
                setFreezeForm({ startDate: localToday(), endDate: localToday(), reason: '' });
                setFreezeOpen(true);
              }}
            >
              <Snowflake className="size-4" />
              {ct('subscriptions.freeze')}
            </Button>
          )}
          {frozen && (
            <>
              {activeFreeze ? <Button size="sm" variant="outline" disabled={saving} onClick={() => {
                setFreezeSubId(s.id);
                setEditingFreeze(true);
                setFreezeForm({ startDate: activeFreeze.startDate, endDate: activeFreeze.plannedEndDate ?? activeFreeze.startDate, reason: activeFreeze.reason ?? '' });
                setFreezeOpen(true);
              }}><Snowflake className="size-4" /> تعديل الإيقاف</Button> : null}
              <Button size="sm" variant="outline" disabled={saving} onClick={() => void unfreeze(s.id)}>
                <Sun className="size-4" />
                {ct('subscriptions.unfreeze')}
              </Button>
            </>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setRenewSubId(s.id);
              const net = subscriptionNetValue(s);
              setRenewForm({ paidAmount: String(net) });
              setRenewRows(
                singlePaymentRow(
                  (s.paymentMethod as ClubPaymentMethod) || 'cash',
                  net,
                ),
              );
              setRenewOpen(true);
            }}
          >
            <RefreshCw className="size-4" />
            {ct('subscriptions.renew')}
          </Button>
          {active && !frozen && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setTransferSubId(s.id);
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
          {active && !frozen && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => navigate(CR.subscriptions.memberTransfer, {
                state: { transferSubscriptionId: s.id, memberSearch: member?.memberCode ?? '' },
              })}
            >
              <ArrowRightLeft className="size-4" />
              {ui('تحويل العضوية لعضو آخر')}
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
          </> : null}
          {canPurgeSubscription && (
            <Button
              size="sm"
              variant="outline"
              className="text-destructive hover:text-destructive"
              onClick={() => setPurgeSubId(s.id)}
            >
              <Trash2 className="size-4" />
              {ui('حذف (اتعمل بالغلط)')}
            </Button>
          )}
        </div> : null}

        {isCurrentSubscription(s) && selectedId != null ? (
          <ReceptionServiceAllowances
            part="invitation"
            memberId={selectedId}
            subscription={overview?.subscriptions.find((row) => row.id === s.id)}
            canUse={canCheckIn && !member?.isBlocked}
            onRecorded={() => void refetchSubs()}
          />
        ) : null}
      </div>
    );
  };

  const hits = searchResult?.hits ?? [];
  const showHits = !memberOpen && query.trim().length >= 2 && hits.length > 0;

  return (
    <div
      className={
        tabletMode
          ? 'reception-tablet-shell mx-auto min-h-[calc(100vh-4rem)] max-w-5xl space-y-6 p-4 md:p-8'
          : 'mx-auto max-w-5xl space-y-6'
      }
    >
      <div className="flex items-start justify-between gap-4">
        <PageHeader
          title={ui('الاستقبال')}
          description={ui('ابحث عن العضو — تفتح بطاقته مع الاشتراكات والإجراءات فورًا')}
        />
        <Button
          variant="outline"
          size="icon"
          onClick={toggleTablet}
          title={tabletMode ? ui('وضع عادي') : ui('وضع تابلت')}
        >
          {tabletMode ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
        </Button>
      </div>

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
          <div className="w-full sm:max-w-sm">
            <Label className="mb-1.5 block text-xs text-muted-foreground">{ui('الفرع المعروض')}</Label>
            {isSystemAdmin ? (
              <SearchableSelect
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
              </SearchableSelect>
            ) : (
              <div className="flex h-11 items-center gap-2 rounded-xl border border-primary/20 bg-muted/45 px-3 text-sm font-semibold">
                <Building2 className="size-4 text-primary" />
                <span className="min-w-0 flex-1 truncate">{activeReceptionBranchName}</span>
                <LockKeyhole className="size-4 text-muted-foreground" />
              </div>
            )}
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2 rounded-xl bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
          <CheckCircle2 className="size-4 text-primary" />
          <span>{ui('البيانات المعروضة الآن')}:</span>
          <strong className="text-foreground">{activeReceptionBranchName}</strong>
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
            {ui('اكتب الاسم أو الموبايل أو الكود أو الباركود ثم Enter')}
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={inputRef}
              className={cn(tabletMode ? 'h-16 ps-12 text-xl' : 'h-14 ps-11 text-lg', 'rounded-2xl')}
              placeholder={ui('اسم · موبايل · كود · باركود · رقم قومي')}
              value={query}
              onChange={(e) => {
                if (memberOpen) { setMemberOpen(false); setSelectedId(null); setEntitlement(null); }
                setQuery(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                prepareEntrySound();
                void runSearch();
              }}
              autoFocus
            />
          </div>
          <div className="flex gap-2 sm:contents">
            {/* No USB scanner, or the power is out: scan the card with the branch phone's camera. */}
            <CameraScanButton
              showLabel
              closeOnDetect
              title={ui('مسح كارت العضو بالكاميرا')}
              className={cn('flex-1 rounded-2xl sm:flex-none', tabletMode ? 'h-16' : 'h-14')}
              onDetected={(code) => {
                closeMemberPanel(false);
                void runSearch(code);
              }}
            />
            <EntrySoundSettings className={cn('rounded-2xl', tabletMode ? 'size-16' : 'size-14')} />
            {/* A guest who came through an employee's invitation code → a sales lead credited to that code. */}
            <StaffInvitationButton iconOnly defaultBranchId={activeReceptionBranchId ?? null} className={cn('rounded-2xl px-0', tabletMode ? 'size-16' : 'size-14')} />
          </div>
          <Button
            variant="brand"
            size="lg"
            className={cn('rounded-2xl px-8', tabletMode ? 'h-16' : 'h-14')}
            onClick={() => void runSearch()}
            disabled={searching}
          >
            <Search className="size-5" /> {ui('بحث')}
          </Button>
        </div>

        {showHits && (
          <ClubMemberSearchHits
            hits={hits}
            onSelect={(h) => void selectMember(h)}
            branchLabel={isSystemAdmin && !effectiveReceptionBranch
              ? (h) => branches.find((branch) => branch.id === h.branchId)?.name?.trim() || `${ui('فرع رقم')} ${toArabicDigits(h.branchId)}`
              : undefined}
          />
        )}


      </div>

      {/* Member screen: one dialog with the photo beside every subscription and its actions
          (check-in, InBody / SPA, freeze, renew, transfer, refund), so reception never needs
          the separate check-in page. */}
      <Dialog open={memberOpen && selectedId != null} onOpenChange={(open) => { if (!open) closeMemberPanel(false); }}>
        <DialogContent
          size="xl"
          className="max-h-[94vh] gap-4 overflow-y-auto sm:max-w-[min(92vw,85rem)]"
          aria-describedby={undefined}
        >
          <div className="grid min-w-0 grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_18rem] lg:gap-x-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
            {/* A large photo filling the card, pinned to the top of the visible area beside the
                subscriptions: centred on the whole column it slid out of view when a member had
                many old subscriptions (client, 21 Nov 2026). */}
            <aside className="w-full min-w-0 self-start overflow-hidden rounded-2xl border bg-card pt-4 lg:sticky lg:top-0 lg:z-10 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:pt-0">
              {/* A tall photo filling the whole column (client video, 22 Nov: the 4:3 box left a portrait
                  photo as a thin strip in the middle). */}
              <div className="relative mx-auto w-48 overflow-hidden rounded-lg bg-muted/20 sm:w-56 lg:w-full lg:rounded-none">
                <MemberAvatar
                  name={member?.name}
                  profilePicture={member?.profilePicture}
                  size="portrait"
                  className="aspect-[4/5] rounded-none object-cover object-top text-4xl ring-0 lg:text-7xl"
                />
                {/* Change the photo from the photo itself (client, 24 Nov). */}
                {member && canEditMember ? (
                  <ReceptionMemberPhotoEdit
                    key={member.id}
                    memberId={member.id}
                    className="absolute end-2 top-2"
                    onSaved={() => { void refetchMember(); void qc.invalidateQueries({ queryKey: ['club-members'] }); }}
                  />
                ) : null}
              </div>
              <div className="space-y-2 px-4 pb-4 pt-3 text-center">
                <DialogTitle className="break-words text-xl leading-tight sm:text-2xl">
                  {member?.name ?? ui('جاري التحميل…')}
                </DialogTitle>
                <p className="flex items-center justify-center gap-1 text-lg font-medium">
                  <bdi dir="ltr" className="nums select-all break-all">{member?.memberCode ?? '—'}</bdi>
                  {member?.memberCode ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      aria-label={ui('نسخ كود العضو')}
                      title={ui('نسخ كود العضو')}
                      onClick={() => {
                        void navigator.clipboard?.writeText(member.memberCode).then(
                          () => toast.success(ui('تم نسخ كود العضو')),
                          () => toast.error(ui('تعذر النسخ')),
                        );
                      }}
                    >
                      <Copy className="size-4" />
                    </Button>
                  ) : null}
                </p>
                {member?.phone ? (
                  <p className="flex items-center justify-center gap-1.5 text-lg">
                    <Phone className="size-4 text-muted-foreground" aria-hidden="true" />
                    <MaskedPhone value={member.phone} memberId={member.id} copyable />
                    <ReceptionMemberWhatsApp
                      key={member.id}
                      member={member}
                      subscriptionBranch={effectiveReceptionBranch || undefined}
                      overviewSubscriptions={overview?.subscriptions}
                    />
                  </p>
                ) : null}
                {member ? (
                  <StatusBadge status={member.isBlocked ? 'blocked' : member.isActive ? 'active' : 'suspended'} label={member.isBlocked ? ui('محظور') : undefined} />
                ) : null}
                {member?.isBlocked && member.blockReason ? (
                  <p className="rounded-xl bg-destructive/10 p-2 text-sm text-destructive">{ui('سبب الحظر')}: {member.blockReason}</p>
                ) : null}
                {member ? (
                  <Button
                    variant={profileOpen ? 'secondary' : 'outline'}
                    className="mt-1 w-full gap-2"
                    aria-expanded={profileOpen}
                    onClick={() => {
                      const next = !profileOpen;
                      setProfileOpen(next);
                      if (next) window.setTimeout(() => profileRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
                    }}
                  >
                    <FileText className="size-4" />
                    {profileOpen ? ui('إخفاء بيانات العضو') : ui('عرض بيانات العضو وسجلاته')}
                  </Button>
                ) : null}
              </div>
              {/* Under the photo (client, 22 Nov): when the member last came, an active freeze and the
                  locker subscriptions; the subscriptions themselves stay on the other side. */}
              {member ? (
                <div className="space-y-2 border-t px-4 py-3 text-start text-sm">
                  <div className="flex items-start gap-2 rounded-xl bg-muted/40 px-3 py-2">
                    <Clock3 className="mt-0.5 size-4 shrink-0 text-primary" />
                    {member.lastCheckIn ? (
                      <div className="min-w-0">
                        {(() => {
                          // A scan checks the member in at once, so «last entry» is nearly always today;
                          // reception wants the visit before that too (client, 22 Nov: "آخر مرة ضرب الباركود").
                          const cameToday = daysSince(member.lastCheckIn) <= 0;
                          const before = cameToday ? member.previousCheckIn ?? null : member.lastCheckIn;
                          const days = before ? daysSince(before) : null;
                          return (
                            <>
                              {cameToday ? <p className="font-semibold">{ui('حضر النهارده')}</p> : null}
                              <p className={cn('font-semibold', cameToday && 'mt-0.5 text-sm')}>
                                {days == null
                                  ? ui('أول زيارة له')
                                  : `${ui('آخر مرة ضرب الباركود')}: ${days <= 1 ? ui('امبارح') : `${ui('من')} ${toArabicDigits(days)} ${ui('يوم')}`}`}
                              </p>
                              {before ? <p className="nums text-xs text-muted-foreground">{formatDateTime(before)}</p> : null}
                            </>
                          );
                        })()}
                      </div>
                    ) : (
                      <p className="text-muted-foreground">{ui('لا يوجد حضور مسجل')}</p>
                    )}
                  </div>
                  {/* SPA / InBody of the running subscriptions, with their buttons, then the lockers, then a freeze
                      (client, 22 + 24 Nov: subscriptions on one side, services on the other). */}
                  {selectedId != null ? sortedSubs.filter(isCurrentSubscription).map((s) => (
                    <ReceptionServiceAllowances
                      key={`svc-${s.id}`}
                      part="services"
                      memberId={selectedId}
                      subscription={overview?.subscriptions.find((row) => row.id === s.id)}
                      canUse={canCheckIn && !member?.isBlocked}
                      onRecorded={() => { void refetchSubs(); void refetchOverview(); }}
                    />
                  )) : null}
                  {(() => {
                    const lockers = (overview?.lockerSubscriptions ?? []).filter((l) => l.status === 'active' || l.status === 'upcoming' || l.status === 'frozen');
                    if (!lockers.length) return null;
                    return (
                      <div className="space-y-1.5 rounded-xl border px-3 py-2">
                        <p className="flex items-center gap-1.5 font-semibold"><LockKeyhole className="size-4 text-primary" />{ui('اشتراكات اللوكر')}</p>
                        {lockers.map((l) => (
                          <div key={l.id} className="flex flex-wrap items-center justify-between gap-1 text-xs">
                            <span>{ui('لوكر')} <b className="nums">{toArabicDigits(l.lockerNumber ?? '—')}</b>{l.subscriptionTypeName ? ` · ${l.subscriptionTypeName}` : ''}</span>
                            <span className="nums text-muted-foreground">{ui('حتى')} {toArabicDigits(l.endDate)}</span>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                  {(() => {
                    // Only a freeze that is running (back day still ahead) or booked for later shows;
                    // an ended one is gone (client, 22 Nov).
                    const today = localToday();
                    const freeze = overview?.freezes.find((f) => f.isActive && (!f.endDate || f.endDate > today))
                      ?? overview?.freezes.find((f) => !f.isActive && f.actualDays == null && f.startDate > today);
                    if (!freeze) return null;
                    const booked = !freeze.isActive;
                    const days = freeze.actualDays ?? freeze.plannedDays;
                    const left = booked ? daysUntil(freeze.startDate) : freeze.endDate ? daysUntil(freeze.endDate) : null;
                    const reason = freeze.reason && /[\p{L}]{2,}/u.test(freeze.reason) ? freeze.reason : null;
                    return (
                      <div className="overflow-hidden rounded-xl border border-amber-400/50 bg-amber-50 dark:bg-amber-500/10">
                        <div className="flex items-center gap-2 bg-amber-100 dark:bg-amber-500/20 px-3 py-2">
                          <Snowflake className="size-4 shrink-0 text-amber-600" />
                          <b className="text-amber-900 dark:text-amber-200">{booked ? ui('إيقاف محجوز') : ui('الاشتراك موقوف')}</b>
                          <span className="nums ms-auto rounded-full bg-amber-500 px-2 py-0.5 text-xs font-semibold text-white">{toArabicDigits(days)} {ui('يوم')}</span>
                        </div>
                        <div className="space-y-2 px-3 py-2.5">
                          <p className="truncate text-xs text-muted-foreground">{freeze.subscriptionType || ui('اشتراك')}</p>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="rounded-lg bg-background px-2.5 py-1.5">
                              <p className="text-[11px] text-muted-foreground">{ui('من')}</p>
                              <p className="nums text-sm font-semibold">{formatDayLabel(freeze.startDate)}</p>
                            </div>
                            <div className="rounded-lg bg-background px-2.5 py-1.5">
                              <p className="text-[11px] text-muted-foreground">{ui('يرجع يوم')}</p>
                              <p className="nums text-sm font-semibold">{freeze.endDate ? formatDayLabel(freeze.endDate) : '—'}</p>
                            </div>
                          </div>
                          {left != null && left > 0 ? (
                            <p className="nums text-xs font-medium text-amber-800 dark:text-amber-300">
                              {booked ? `${ui('يبدأ بعد')} ${toArabicDigits(left)} ${ui('يوم')}` : `${ui('باقي')} ${toArabicDigits(left)} ${ui('يوم على رجوعه')}`}
                            </p>
                          ) : null}
                          {reason ? <p className="text-xs text-muted-foreground">{ui('السبب')}: {reason}</p> : null}
                        </div>
                      </div>
                    );
                  })()}
                  {(() => {
                    // Sessions left on running plans and money still owed (InBody / SPA have their own block below).
                    const running = (overview?.subscriptions ?? []).filter((s) => s.status === 'active' || s.status === 'frozen');
                    const sessionsLeft = running.reduce((n, s) => n + (s.isLinkedToSessions ? Math.max(0, (s.sessionsCount ?? 0) - (s.sessionsUsed ?? 0)) : 0), 0);
                    const owed = running.reduce((n, s) => n + (s.remainingAmount ?? 0), 0);
                    if (sessionsLeft <= 0 && owed <= 0) return null;
                    return (
                      <div className="space-y-1.5 rounded-xl border px-3 py-2">
                        {sessionsLeft > 0 ? (
                          <span className="inline-block rounded-full bg-primary/10 px-2.5 py-0.5 text-xs text-primary">{ui('حصص')}: <b className="nums">{toArabicDigits(sessionsLeft)}</b> {ui('متبقّية')}</span>
                        ) : null}
                        {owed > 0 ? <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">{ui('مبلغ متبقي على الاشتراكات')}: <span className="nums">{formatMoney(owed)}</span></p> : null}
                      </div>
                    );
                  })()}
                </div>
              ) : null}
            </aside>

            <DialogHeader className="min-w-0 space-y-3 text-start lg:col-start-1 lg:row-start-1">
              <div className="flex items-center justify-end gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  aria-label={ui('تحديث')}
                  title={ui('تحديث')}
                  disabled={loadingMember || loadingSubs}
                  onClick={() => {
                    void refetchSubs();
                    if (selectedId) void refreshEntitlement(selectedId);
                  }}
                >
                  <RefreshCw className={cn('size-4', (loadingMember || loadingSubs) && 'animate-spin')} />
                </Button>
              </div>
              {member?.isBlocked ? <BlockedMemberBanner reason={member.blockReason} className="text-base" /> : null}
              {entitlement ? (
                <EntitlementBanner entitlement={entitlement} canGrace={false} onGrace={() => openGrace()} />
              ) : null}
            </DialogHeader>

            <div className="min-w-0 space-y-3 lg:col-start-1 lg:row-start-2">
              {loadingOverview ? <p role="status" className="text-sm text-muted-foreground">{ui('جاري تحميل سجلات العضو…')}</p> : null}
              {overviewError ? (
                <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-destructive/30 p-3 text-sm text-destructive">
                  <span>{ui('تعذر تحميل بروفايل العضو')}: {apiError(profileError)}</span>
                  <Button size="sm" variant="outline" onClick={() => void refetchOverview()}>{ui('إعادة المحاولة')}</Button>
                </div>
              ) : null}

              <div
                className="flex flex-wrap items-center gap-2 rounded-xl px-1 py-2"
              >
                <CreditCard className="size-4 text-primary" />
                <h3 className="font-semibold">{ct('subscriptions.tabSubs')}</h3>
                <span className="nums text-sm text-muted-foreground">({toArabicDigits(sortedSubs.length - expiredCount)})</span>
                {/* Ended subscriptions are hidden by default; one clear switch shows them (client, 22 Nov). */}
                {expiredCount > 0 ? (
                  <Button
                    variant={showExpired ? 'secondary' : 'outline'}
                    size="sm"
                    className="mx-auto h-9 gap-2 rounded-full px-4"
                    aria-pressed={showExpired}
                    onClick={() => setShowExpired((value) => !value)}
                  >
                    {showExpired ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    {showExpired ? ui('إخفاء الاشتراكات المنتهية') : ui('إظهار الاشتراكات المنتهية')}
                    <span className="nums rounded-full bg-muted px-2 py-0.5 text-xs">{toArabicDigits(expiredCount)}</span>
                  </Button>
                ) : null}
                {canCreateSubscription && member ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="ms-auto gap-2"
                    disabled={member.isBlocked}
                    onClick={() => {
                      setMemberOpen(false);
                      navigate('/club/subscriptions/new', { state: { prefillMember: member } });
                    }}
                  >
                    <Plus className="size-4" />
                    {ct('subscriptions.addNewSubscription')}
                  </Button>
                ) : null}
              </div>

              {loadingSubs && sortedSubs.length === 0 ? <p role="status" className="text-sm text-muted-foreground">{ui('جاري التحميل…')}</p> : null}
              {!loadingSubs && sortedSubs.length === 0 ? (
                <div className="rounded-2xl border border-dashed bg-muted/20 px-4 py-10 text-center text-sm text-muted-foreground">
                  {ui('لا توجد اشتراكات')}
                </div>
              ) : null}
              {!loadingSubs && sortedSubs.length > 0 && visibleSubs.length === 0 ? (
                <div className="rounded-2xl border border-dashed bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
                  {ui('لا يوجد اشتراك جاري — الاشتراكات المنتهية مخفية')}
                </div>
              ) : null}
              <div className="grid gap-3">{visibleSubs.map(renderSubscriptionCard)}</div>

              {canSellQuick && memberQuickServices.length > 0 ? (
                <div className="space-y-2 border-t border-border/60 pt-4">
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

              {/* «عرض بيانات العضو وسجلاته» under the name opens every detail and record here, below
                  the subscriptions, on the same screen (client, 22 Nov). */}
              {member && profileOpen ? (
                <div ref={profileRef} className="scroll-mt-4 space-y-4 border-t border-border/60 pt-4">
                  <div className="flex items-center gap-2">
                    <FileText className="size-4 text-primary" />
                    <h3 className="font-semibold">{ui('بيانات العضو وسجلاته')}</h3>
                    {canEditMember && !editingMember ? (
                      <Button size="sm" variant="outline" className="ms-auto gap-1.5" onClick={() => setEditingMember(true)}>
                        <Pencil className="size-4" />
                        {ui('تعديل البيانات')}
                      </Button>
                    ) : null}
                  </div>
                  {canEditMember && editingMember ? (
                    <ReceptionMemberEditForm
                      key={member.id}
                      member={member}
                      onCancel={() => setEditingMember(false)}
                      onSaved={() => {
                        setEditingMember(false);
                        void refetchMember();
                        void qc.invalidateQueries({ queryKey: ['club-members'] });
                      }}
                    />
                  ) : (
                    <ReceptionMemberProfile member={member} overview={overview} branches={branches} section="details" />
                  )}
                  <ReceptionMemberAttachments key={`att-${member.id}`} memberId={member.id} canEdit={canEditMember} />
                  <ReceptionMemberProfile member={member} overview={overview} branches={branches} section="records" />
                </div>
              ) : null}

              {canBlockMember && member ? (
                <div className="flex justify-end border-t border-border/60 pt-4">
                  {member.isBlocked ? (
                    <Button
                      variant="outline"
                      disabled={blockSaving}
                      className="min-w-[11rem] gap-2 border-emerald-600/40 text-emerald-700 hover:bg-emerald-500/10 hover:text-emerald-800"
                      onClick={() => void unblockMember()}
                    >
                      <CheckCircle2 className="size-4" />
                      {ui('إلغاء حظر العضو')}
                    </Button>
                  ) : (
                    <Button
                      variant="destructive"
                      disabled={blockSaving}
                      className="min-w-[11rem] gap-2"
                      onClick={() => {
                        setBlockReason('');
                        setBlockOpen(true);
                      }}
                    >
                      <Ban className="size-4" />
                      {ui('حظر العضو')}
                    </Button>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        </DialogContent>
      </Dialog>

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
                        || `${ui('فرع رقم')} ${toArabicDigits(service.branchId)}`}
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
        branches={branches}
        showBranch={isSystemAdmin}
        onOpenMember={(code) => {
          // Same as scanning the card: opens the member (an already checked-in visit is only reported).
          closeMemberPanel(false);
          void runSearch(code);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
      />


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
            <DialogTitle>{editingFreeze ? 'تعديل الإيقاف' : ct('subscriptions.freezeTitle')}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <p className="text-sm text-muted-foreground">{ct('subscriptions.freezePreserveHint')}</p>
            <FreezeBalance subscriptionId={freezeOpen ? freezeSubId : null} requestedDays={editingFreeze ? undefined : freezeDays(freezeForm.startDate, freezeForm.endDate)} onChanged={() => { void refetchSubs(); void refetchOverview(); if (selectedId) void refreshEntitlement(selectedId); }} />
            <div className="grid grid-cols-2 gap-3">
              {/* Start date + number of days; the end date follows and is read-only (client, 22 Nov). */}
              <div className="grid gap-2"><Label>بداية الإيقاف</Label><Input type="date" className="nums" disabled={editingFreeze} min={addDaysLocal(localToday(), -30)} max={addDaysLocal(localToday(), 90)} value={freezeForm.startDate} onChange={(e) => setFreezeForm((f) => {
                const days = freezeDays(f.startDate, f.endDate) ?? 0;
                return { ...f, startDate: e.target.value, endDate: e.target.value ? addDaysLocal(e.target.value, days) : f.endDate };
              })} /></div>
              <div className="grid gap-2"><Label>عدد أيام الإيقاف</Label><Input type="number" inputMode="numeric" min={1} step={1} className="nums" autoFocus placeholder="مثال: 5" value={freezeDays(freezeForm.startDate, freezeForm.endDate) ?? ''} onChange={(e) => {
                const days = Math.max(0, Math.floor(Number(e.target.value) || 0));
                setFreezeForm((f) => ({ ...f, endDate: addDaysLocal(f.startDate, days) }));
              }} /></div>
              <div className="col-span-2 grid gap-2"><Label>نهاية الإيقاف — بيرجع يدخل من اليوم ده</Label><Input type="date" className="nums bg-muted" readOnly tabIndex={-1} value={freezeForm.endDate} /></div>
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
            <Button variant="outline" onClick={() => setFreezeOpen(false)}>
              {ct('common.cancel')}
            </Button>
            <Button variant="brand" onClick={() => void submitFreeze()} disabled={saving}>
              {saving ? ct('common.saving') : editingFreeze ? 'حفظ التعديل' : ct('subscriptions.freeze')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={renewOpen}
        onOpenChange={(open) => {
          setRenewOpen(open);
          if (!open) setRenewSubId(null);
        }}
      >
        <DialogContent size="md" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{ct('subscriptions.renewTitle')}</DialogTitle>
          </DialogHeader>
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
              onChange={setRenewRows}
              onTotalChange={(paidAmount) =>
                setRenewForm({ paidAmount: String(paidAmount) })
              }
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenewOpen(false)}>
              {ct('common.cancel')}
            </Button>
            <Button variant="brand" onClick={() => void submitRenew()} disabled={saving}>
              {saving ? ct('common.saving') : ct('subscriptions.renew')}
            </Button>
            <Button
              variant="outline"
              className="border-emerald-500/40 text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-300"
              onClick={() => void saveAndWhatsApp.run('renewal', submitRenew, member?.phone ?? null)}
              disabled={saving}
            >
              <WhatsAppIcon className="size-4" />
              حفظ وإرسال واتساب
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SubscriptionPurgeDialog
        subscriptionId={purgeSubId}
        onOpenChange={(open) => !open && setPurgeSubId(null)}
        onPurged={() => {
          void refetchSubs();
          void refetchMember();
          if (selectedId) void refreshEntitlement(selectedId, member?.branchId);
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
                <SearchableSelect
                  className={selectCls}
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                >
                  <option value="">—</option>
                  <option value="تراجع">{ct('subscriptions.reasonCancel')}</option>
                  <option value="مغادرة">{ct('subscriptions.reasonLeave')}</option>
                  <option value="أخرى">{ct('subscriptions.reasonOther')}</option>
                </SearchableSelect>
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
              disabled={saving || !refundPreview || refundPreview.refundAmount <= 0}
              onClick={() => void submitRefund()}
            >
              <Undo2 className="size-4" />
              {saving ? ct('common.saving') : ct('subscriptions.refundPayoutAction')}
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
                    {ct('subscriptions.remaining')}: {formatMoney(transferSub.remainingAmount)}
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
                  value={transferForm.toStartDate}
                  onChange={(e) => setTransferForm((f) => ({ ...f, toStartDate: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label>{ct('subscriptions.endDate')}</Label>
                <Input type="date" className="nums bg-muted" dir="ltr" value={transferForm.toEndDate} readOnly />
              </div>
            </div>

            {transferPlanPreview && (
              <div className="space-y-2 rounded-2xl border border-primary/25 bg-primary/5 p-4">
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
                    {
                      label: ct('subscriptions.transferCredit'),
                      value: formatMoney(transferPlanPreview.transferableCredit),
                      accent: 'success' as const,
                    },
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
                  <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-sm font-medium text-amber-900 dark:text-amber-100">
                    حصّل فرق التحويل من شاشة الاشتراكات: {formatMoney(transferPlanPreview.additionalDue)}
                  </p>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransferOpen(false)}>
              {ct('common.cancel')}
            </Button>
            <Button variant="brand" onClick={() => void saveTransfer()} disabled={saving}>
              <ArrowRightLeft className="size-4" />
              {saving ? ct('common.saving') : ct('subscriptions.transferPlan')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
