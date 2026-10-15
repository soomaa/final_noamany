import {
  AlertTriangle,
  ArrowRightLeft,
  CheckCircle2,
  CreditCard,
  LogIn,
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
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Maximize2, Minimize2 } from 'lucide-react';
import { MemberAvatar } from '@/components/club/member-avatar';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useClubT } from '@/hooks/use-club-t';
import { usePermission } from '@/hooks/use-permission';
import { api, apiError } from '@/lib/api';
import { useArrayResource } from '@/lib/api-hooks';
import { CLUB_ROUTES as CR } from '@/lib/club-routes';
import { confirm, confirmWithPreview } from '@/lib/confirm';
import { formatMoney, localToday } from '@/lib/formatters';
import { cn, toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';
import type { ClubMemberListItem, ClubSubscriptionListItem, ClubSubscriptionType } from '@/types/club';
import type {
  CheckInResponse,
  ClubSearchHit,
  EntitlementReason,
  EntitlementResult,
  RecentCheckIn,
} from '@/types/gym-ops';
import type { ClubQuickServiceRow } from './reception-quick-services';

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
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const inputRef = useRef<HTMLInputElement>(null);
  const tabletMode = searchParams.get('tablet') === '1';
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
  const [freezeOpen, setFreezeOpen] = useState(false);
  const [freezeSubId, setFreezeSubId] = useState<number | null>(null);
  const [freezeForm, setFreezeForm] = useState({ reason: '' });
  const [renewOpen, setRenewOpen] = useState(false);
  const [renewSubId, setRenewSubId] = useState<number | null>(null);
  const [renewForm, setRenewForm] = useState({ paidAmount: '' });
  const [renewRows, setRenewRows] = useState<ClubPaymentSplitRow[]>(singlePaymentRow());
  const [refundOpen, setRefundOpen] = useState(false);
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
  const [transferCreditPreview, setTransferCreditPreview] = useState<RefundPreview | null>(null);
  const [saving, setSaving] = useState(false);

  const { data: subTypes } = useArrayResource<ClubSubscriptionType>('club-subscription-types');

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
    queryKey: ['club-recent-checkins'],
    queryFn: async () => {
      const { data } = await api.get<RecentCheckIn[]>('/club/search/recent-checkins', { params: { limit: 20 } });
      return data;
    },
    refetchInterval: 60_000,
  });

  const { data: quickServices = [] } = useQuery({
    queryKey: ['club-quick-services', 'catalog'],
    queryFn: async () => {
      const { data } = await api.get<ClubQuickServiceRow[]>('/club-quick-services/catalog');
      return data;
    },
    enabled: canSellQuick || canManageQuick,
  });

  const today = localToday();
  const { data: todayAttendanceStats } = useClubAttendanceStatistics(
    { startDate: today, endDate: today },
    { refetchInterval: 60_000 },
  );

  const { data: searchResult, isFetching: searching } = useQuery({
    queryKey: ['club-universal-search', query],
    enabled: query.trim().length >= 2 && !memberOpen,
    queryFn: async () => {
      const { data } = await api.get<{
        hits: ClubSearchHit[];
        entitlement: EntitlementResult | null;
        topMatch: ClubSearchHit | null;
      }>('/club/search', { params: { q: query.trim(), withEntitlement: true } });
      return data;
    },
  });

  const { data: member, refetch: refetchMember, isFetching: loadingMember } = useQuery({
    queryKey: ['club-reception-member', selectedId],
    enabled: selectedId != null,
    queryFn: async () => {
      const { data: m } = await api.get(`/club-members/${selectedId}`);
      return m as ClubMemberListItem;
    },
  });

  const { data: subs, refetch: refetchSubs, isFetching: loadingSubs } = useQuery({
    queryKey: ['club-reception-subs', selectedId],
    enabled: selectedId != null,
    queryFn: async () => {
      const { data: list } = await api.get<{ data: ClubSubscriptionListItem[] }>('/club-subscriptions', {
        params: { memberId: selectedId, pageSize: 50 },
      });
      return list.data;
    },
  });

  /** Active / frozen first; expired (and exhausted sessions) sink to the bottom. */
  const sortedSubs = useMemo(() => {
    const list = [...(subs ?? [])];
    const rank = (s: ClubSubscriptionListItem) => {
      if (isExpiredLikeSubscription(s)) return 3;
      const st = String(s.status ?? '').toLowerCase();
      if (st === 'upcoming') return 2;
      if (st === 'frozen') return 1;
      return 0; // active
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

  const transferTargetType = useMemo(
    () =>
      transferForm.toSubscriptionTypeId
        ? (subTypes ?? []).find((t) => t.id === Number(transferForm.toSubscriptionTypeId)) ?? null
        : null,
    [transferForm.toSubscriptionTypeId, subTypes],
  );

  const renewNetValue = renewSub ? subscriptionNetValue(renewSub) : 0;
  const renewPaidNow = Math.max(0, Number(renewForm.paidAmount) || 0);
  const renewRemaining = Math.max(0, renewNetValue - renewPaidNow);

  const transferNewPrice = Number(transferForm.toValue) || transferTargetType?.price || 0;
  const transferPaid = transferSub?.paidAmount ?? 0;
  const transferOutstanding = transferSub?.remainingAmount ?? 0;
  const transferCredit = transferCreditPreview?.refundAmount ?? 0;
  const transferDiff = transferNewPrice - transferCredit;
  /** After plan change, receipts stay — so due ≈ new price − already paid. */
  const transferDueAfter = Math.max(0, Math.round((transferNewPrice - transferPaid) * 100) / 100);

  useEffect(() => {
    if (!transferOpen || !transferForm.toSubscriptionTypeId || !transferForm.toStartDate) return;
    const type = (subTypes ?? []).find((t) => t.id === Number(transferForm.toSubscriptionTypeId));
    if (!type) return;
    setTransferForm((f) => ({
      ...f,
      toEndDate: addDaysLocal(
        f.toStartDate,
        type.days > 0 ? type.days : type.isLinkedToSessions ? 30 : 0,
      ),
      toValue: String(type.price),
    }));
  }, [transferOpen, transferForm.toSubscriptionTypeId, transferForm.toStartDate, subTypes]);

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
      setTransferCreditPreview(null);
      return;
    }
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const { data } = await api.post<{ preview?: RefundPreview } & RefundPreview>(
            '/club-subscription-refunds?dryRun=true',
            { subscriptionId: transferSubId, stopDate: localToday() },
          );
          const p = (data as { preview?: RefundPreview }).preview ?? data;
          if (p && typeof p === 'object' && 'refundAmount' in p) {
            setTransferCreditPreview(p as RefundPreview);
          } else {
            setTransferCreditPreview(null);
          }
        } catch {
          // No refundable credit (unpaid / exhausted) — still allow transfer with 0 credit.
          setTransferCreditPreview(null);
        }
      })();
    }, 200);
    return () => window.clearTimeout(timer);
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

  const refreshEntitlement = async (memberId: number) => {
    try {
      const { data } = await api.get<EntitlementResult>('/club/entitlement/validate', {
        params: { memberId },
      });
      setEntitlement(data);
    } catch {
      setEntitlement(null);
    }
  };

  const selectMember = async (hit: ClubSearchHit) => {
    setSelectedId(hit.id);
    setQuery(hit.memberCode);
    setMemberOpen(true);
    await refreshEntitlement(hit.id);
  };

  const closeMemberPanel = (open: boolean) => {
    setMemberOpen(open);
    if (!open) {
      setSelectedId(null);
      setEntitlement(null);
      setQuery('');
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  };

  const runSearch = async () => {
    const q = query.trim();
    if (q.length < 2) {
      toast.error(ct('members.enterCode'));
      return;
    }
    if (searchResult?.topMatch) {
      await selectMember(searchResult.topMatch);
      return;
    }
    if (searchResult?.hits?.[0]) {
      await selectMember(searchResult.hits[0]);
      return;
    }
    toast.error(ct('members.noMemberFound'));
  };

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
        ...split.payload,
      });
      toast.success(
        `${ui('تم البيع')}: ${data.service.name} — ${formatMoney(data.receipt.amount)} (${data.receipt.receiptNumber})`,
      );
      setQuickSellOpen(false);
      setQuickSellService(null);
      setQuickSellMemberId(null);
      void qc.invalidateQueries({ queryKey: ['club-receipts'] });
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
      await api.post(`/club-subscriptions/${freezeSubId}/freeze`, {
        reason: freezeForm.reason.trim() || undefined,
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
      await api.patch(`/club-subscriptions/${renewSubId}/renew`, body);
      toast.success(ct('common.success'));
      setRenewOpen(false);
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
    if (
      Boolean(transferSub?.isLinkedToSessions) !== Boolean(transferTargetType?.isLinkedToSessions)
    ) {
      toast.error(ct('subscriptions.transferKindMismatch'));
      return;
    }
    if (!transferForm.toEndDate) {
      toast.error(ct('members.fillRequired'));
      return;
    }
    setSaving(true);
    try {
      await api.post('/club-subscription-transfers', {
        subscriptionId: transferSubId,
        toSubscriptionTypeId: Number(transferForm.toSubscriptionTypeId),
        toStartDate: transferForm.toStartDate,
        toEndDate: transferForm.toEndDate,
      });
      toast.success(ct('common.success'));
      setTransferOpen(false);
      void refetchSubs();
      if (selectedId) await refreshEntitlement(selectedId);
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
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

      {!tabletMode && <WorkspaceWidgets />}

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
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void runSearch()}
              autoFocus
            />
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
                    {h.phone ? ` · ${toArabicDigits(h.phone)}` : ''}
                  </p>
                </div>
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
                  {r.memberName}
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
                </button>
              ))}
            </div>
          )}
        </div>
      ) : null}

      <AttendanceSummaryCards statistics={todayAttendanceStats} />

      <ReceptionDailyAttendanceTable />

      <Dialog open={memberOpen} onOpenChange={closeMemberPanel}>
        <DialogContent size="xl" className="gap-4" aria-describedby={undefined}>
          <DialogHeader className="space-y-4 text-start">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-center gap-4">
                <MemberAvatar
                  name={member?.name}
                  profilePicture={member?.profilePicture}
                  size="lg"
                  className="size-16 text-xl"
                />
                <div className="space-y-1">
                  <DialogTitle className="text-2xl leading-tight">
                    {member?.name ?? ui('جاري التحميل…')}
                  </DialogTitle>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                    <span className="font-mono nums">{member?.memberCode}</span>
                    {member?.phone && (
                      <span className="inline-flex items-center gap-1 nums">
                        <Phone className="size-3.5" />
                        {toArabicDigits(member.phone)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
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
            {entitlement && (
              <EntitlementBanner
                entitlement={entitlement}
                canGrace={canCheckIn}
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
                  Math.round((Date.parse(s.subscriptionEndDate) - Date.parse(localToday())) / 86_400_000),
                );
                const status = s.status as string;
                const active = status === 'active';
                const frozen = status === 'frozen';
                const expired = isExpiredLikeSubscription(s);
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
                          {s.specialClassTypeId ? <span className="rounded-full bg-violet-500/10 px-2.5 py-1 text-violet-700 dark:text-violet-200">اشتراك خاص · حضور تلقائي حسب الجدول</span> : null}
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
                                {ui('ينتهي')} {toArabicDigits(s.subscriptionEndDate)}
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
                      {canCheckIn && expired && (
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
                            setFreezeForm({ reason: '' });
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
                            setTransferCreditPreview(null);
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
                  </div>
                );
              })}
            </div>

            {canSellQuick && quickServices.length > 0 ? (
              <div className="mt-4 space-y-2 border-t border-border/60 pt-4">
                <div className="flex items-center gap-2">
                  <Zap className="size-4 text-primary" />
                  <h3 className="font-semibold">{ui('خدمات سريعة')}</h3>
                  <span className="text-xs text-muted-foreground">{ui('تُسجَّل على العضو')}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {quickServices.map((service) => (
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

            {canCreateSubscription ? <div className="mt-4 flex justify-end border-t border-border/60 pt-4">
              <Button
                variant="brand"
                disabled={!member}
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
            </div> : null}
          </div>
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
              {saving ? ct('common.saving') : ct('subscriptions.freeze')}
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
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
            setTransferCreditPreview(null);
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
                    {ct('subscriptions.paid')}: {formatMoney(transferPaid)}
                  </p>
                  <p>
                    {ct('subscriptions.remaining')}: {formatMoney(transferOutstanding)}
                  </p>
                </div>
                {transferOutstanding > 0 && (
                  <p className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-sm font-medium text-amber-900 dark:text-amber-100">
                    {ct('subscriptions.transferOutstanding')}: {formatMoney(transferOutstanding)}
                  </p>
                )}
              </div>
            )}

            {transferCreditPreview && (
              <div className="space-y-2 rounded-2xl border border-amber-500/25 bg-amber-500/5 p-4">
                <p className="text-xs text-muted-foreground">{ct('subscriptions.transferBalanceHint')}</p>
                <DialogFormSummary
                  items={[
                    {
                      label: ct('subscriptions.originalValue'),
                      value: formatMoney(transferCreditPreview.originalValue),
                    },
                    {
                      label: ct('subscriptions.paid'),
                      value: formatMoney(transferCreditPreview.paidAmount ?? transferPaid),
                    },
                    {
                      label: ct('subscriptions.consumedValue'),
                      value: formatMoney(transferCreditPreview.consumedValue),
                      accent: 'warning',
                    },
                    {
                      label: ct('subscriptions.transferCredit'),
                      value: formatMoney(transferCreditPreview.refundAmount),
                      accent: 'success',
                    },
                  ]}
                />
                <p className="text-xs nums text-muted-foreground">
                  {transferCreditPreview.refundBasis === 'sessions' ? (
                    <>
                      {ct('subscriptions.consumedSessions')}:{' '}
                      {toArabicDigits(
                        Math.max(
                          0,
                          (transferSub?.sessionsCount ?? 0) -
                            (transferCreditPreview.remainingSessions ?? 0),
                        ),
                      )}{' '}
                      / {toArabicDigits(transferSub?.sessionsCount ?? 0)}
                    </>
                  ) : (
                    <>
                      {ct('subscriptions.consumedDays')}: {toArabicDigits(transferCreditPreview.consumedDays)} /{' '}
                      {toArabicDigits(transferCreditPreview.totalDays)}
                    </>
                  )}
                </p>
              </div>
            )}

            <div className="grid gap-2">
              <Label>{ct('subscriptions.transferToType')}</Label>
              <TransferPlanPicker
                types={subTypes ?? []}
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

            {transferTargetType && (
              <div className="space-y-2 rounded-2xl border border-primary/25 bg-primary/5 p-4">
                <DialogFormSummary
                  items={[
                    {
                      label: ct('subscriptions.transferNewPrice'),
                      value: formatMoney(transferNewPrice),
                    },
                    {
                      label: ct('subscriptions.paid'),
                      value: formatMoney(transferPaid),
                    },
                    {
                      label: ct('subscriptions.transferCredit'),
                      value: formatMoney(transferCredit),
                      accent: 'success',
                    },
                    {
                      label:
                        transferDiff > 0
                          ? ct('subscriptions.transferPayMore')
                          : ct('subscriptions.transferCreditLeft'),
                      value: formatMoney(Math.abs(transferDiff)),
                      accent: transferDiff > 0 ? 'warning' : 'success',
                    },
                    {
                      label: ct('subscriptions.transferDueAfter'),
                      value: formatMoney(transferDueAfter),
                      accent: transferDueAfter > 0 ? 'warning' : 'success',
                    },
                  ]}
                />
                {transferDueAfter > 0 && (
                  <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-sm font-medium text-amber-900 dark:text-amber-100">
                    {ct('subscriptions.transferOwesBanner')}: {formatMoney(transferDueAfter)}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">{ct('subscriptions.transferNoCashNote')}</p>
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
