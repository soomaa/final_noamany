import {
  Activity,
  AlertTriangle,
  CalendarDays,
  Loader2,
  Lock,
  LogIn,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Repeat,
  ScanLine,
  Search,
  Snowflake,
  Sparkles,
  UsersRound,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import axios from 'axios';
import { MemberAvatar } from '@/components/club/member-avatar';
import { StatusBadge } from '@/components/common/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useBranches } from '@/hooks/use-branches';
import { useClubT } from '@/hooks/use-club-t';
import { usePermission } from '@/hooks/use-permission';
import { api, apiError } from '@/lib/api';
import { formatDateTime } from '@/lib/formatters';
import { toArabicDigits } from '@/lib/utils';
import { useAuth } from '@/store/auth';
import { useLocale } from '@/store/locale';
import type {
  ClubMemberListItem,
  ClubMemberOverview,
  ClubMemberOverviewSubscription,
} from '@/types/club';

type OverviewStatus = 'active' | 'expired' | 'upcoming' | 'frozen';

function checkInError(error: unknown, english: boolean): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as {
      entitlement?: { reasons?: Array<{ severity?: string; messageAr?: string; messageEn?: string }> };
    } | undefined;
    const blockingReason = data?.entitlement?.reasons?.find((reason) => reason.severity === 'block');
    const message = english ? blockingReason?.messageEn : blockingReason?.messageAr;
    if (message) return message;
  }
  return apiError(error);
}

function SubStatusBadge({ status }: { status: OverviewStatus }) {
  const { ui } = useLocale();
  if (status === 'frozen') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-warning/40 bg-warning/15 px-2.5 py-0.5 text-xs font-medium text-warning">
        <Snowflake className="size-3" /> {ui('موقوف')}
      </span>
    );
  }
  if (status === 'active') return <StatusBadge status="active" label={ui('نشط')} />;
  if (status === 'expired') return <StatusBadge status="expired" label={ui('منتهي')} />;
  return <StatusBadge status="info" label={ui('قادم')} />;
}

function MiniStat({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Repeat;
  label: string;
  value: number;
  tone?: 'amber';
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card p-3">
      <span
        className={`flex size-10 shrink-0 items-center justify-center rounded-full ${
          tone === 'amber' ? 'bg-warning/15 text-warning' : 'bg-primary/10 text-primary'
        }`}
      >
        <Icon className="size-5" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-xs text-muted-foreground">{label}</p>
        <p className="nums text-lg font-semibold leading-tight">{toArabicDigits(value)}</p>
      </div>
    </div>
  );
}

function YesNo({ value }: { value: boolean }) {
  const { ui } = useLocale();
  return value ? (
    <span className="font-medium text-success">{ui('نعم')}</span>
  ) : (
    <span className="text-muted-foreground">{ui('لا')}</span>
  );
}

/** Used/total usage rendered left-to-right so the ratio never flips in RTL. */
function Usage({ used, total }: { used: number; total: number | null }) {
  if (total == null) {
    return used > 0 ? (
      <span className="nums" dir="ltr">
        {toArabicDigits(used)}
      </span>
    ) : (
      <span className="text-muted-foreground">—</span>
    );
  }
  return (
    <span className="nums whitespace-nowrap" dir="ltr">
      {toArabicDigits(used)}/{toArabicDigits(total)}
    </span>
  );
}

function dayWord(count: number, ui: (text: string) => string) {
  if (count === 1) return ui('يوم');
  if (count === 2) return ui('يومان');
  if (count >= 3 && count <= 10) return ui('أيام');
  return ui('يوم');
}

/** Remaining days for active subscriptions, elapsed days for expired ones. */
function SubscriptionDuration({ sub }: { sub: ClubMemberOverviewSubscription }) {
  const { ui } = useLocale();
  if (sub.status === 'active' && sub.daysRemaining != null) {
    return (
      <span className="nums whitespace-nowrap font-medium text-success">
        {ui('متبقي')} {toArabicDigits(sub.daysRemaining)} {dayWord(sub.daysRemaining, ui)}
      </span>
    );
  }
  if (sub.status === 'expired' && sub.daysOverdue != null) {
    return (
      <span className="nums whitespace-nowrap text-muted-foreground">
        {ui('انتهى منذ')} {toArabicDigits(sub.daysOverdue)} {dayWord(sub.daysOverdue, ui)}
      </span>
    );
  }
  if (sub.status === 'upcoming' && sub.daysUntilStart != null) {
    return (
      <span className="nums whitespace-nowrap text-primary">
        {ui('يبدأ بعد')} {toArabicDigits(sub.daysUntilStart)} {dayWord(sub.daysUntilStart, ui)}
      </span>
    );
  }
  if (sub.status === 'frozen' && sub.activeFreeze) {
    const days = sub.activeFreeze.actualDays ?? sub.activeFreeze.plannedDays;
    return (
      <span className="nums whitespace-nowrap text-warning">
        {ui('موقوف')} {toArabicDigits(days)} {dayWord(days, ui)}
      </span>
    );
  }
  return <span className="text-muted-foreground">—</span>;
}

export type MemberLookupMode = 'attendance' | 'spa' | 'class';

export interface MemberAttendanceLookupProps {
  /**
   * Opens the member edit form in place. When omitted (e.g. on the barcode desk) the edit action
   * deep-links into the members management page instead.
   */
  onEditMember?: (member: ClubMemberListItem) => void;
  /** Which desk this lookup serves. The confirm button and balance banner follow the mode. */
  mode?: MemberLookupMode;
  autoCheckIn?: boolean;
}

/**
 * Reception lookup with automatic normal entry at the barcode desk and separate service actions.
 */
export function MemberAttendanceLookup({ onEditMember, mode = 'attendance', autoCheckIn = false }: MemberAttendanceLookupProps) {
  const ct = useClubT();
  const { ui, locale } = useLocale();
  const { can } = usePermission();
  const { user } = useAuth();
  const { data: branches } = useBranches();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const inputRef = useRef<HTMLInputElement>(null);
  const lookupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lookupControllerRef = useRef<AbortController | null>(null);
  const lookupRequestRef = useRef(0);
  const mutationRef = useRef(false);
  const [code, setCode] = useState('');
  const [committedCode, setCommittedCode] = useState<string | null>(null);
  const [overview, setOverview] = useState<ClubMemberOverview | null>(null);
  const [searching, setSearching] = useState(false);
  const [checkingIn, setCheckingIn] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const canConfirm =
    mode === 'spa'
      ? can('club.fitness:create')
      : mode === 'class'
        ? can('club.fitness:update') || can('club.subscriptions.special:update')
        : can('club.members.attendance:create') || can('club.reception:create');
  const canAddSubscription =
    can('club.subscriptions:create') ||
    can('club.subscriptions.list:create') ||
    can('club.subscriptions.new:create') ||
    can('club.reception:create');
  const canEditMember = can('club.members:update');

  const branchNameById = (id: number | null | undefined) => {
    if (id == null) return '—';
    const name = branches?.find((b) => b.id === id)?.name?.trim();
    if (name) return name;
    if (user?.branch === id && user?.branch_name?.trim()) {
      return user.branch_name.trim();
    }
    return `${ui('فرع رقم')} ${toArabicDigits(id)}`;
  };

  const branchName = overview ? branchNameById(overview.member.branchId) : '—';

  const spaRemainingTotal = overview
    ? overview.subscriptions.reduce(
        (sum, s) =>
          sum + (s.isLinkedToSpa && s.spaCount != null ? Math.max(0, s.spaCount - s.spaUsed) : 0),
        0,
      )
    : 0;
  const sessionsRemainingTotal = overview
    ? overview.subscriptions.reduce(
        (sum, s) =>
          sum +
          (s.isLinkedToSessions && s.sessionsCount != null
            ? Math.max(0, s.sessionsCount - (s.sessionsUsed ?? 0))
            : 0),
        0,
      )
    : 0;
  const lastFreeze = overview?.freezes[0] ?? null;

  const cancelPendingLookup = () => {
    if (lookupTimerRef.current) clearTimeout(lookupTimerRef.current);
    lookupTimerRef.current = null;
    lookupControllerRef.current?.abort();
    lookupControllerRef.current = null;
    lookupRequestRef.current += 1;
  };

  useEffect(() => () => {
    if (lookupTimerRef.current) clearTimeout(lookupTimerRef.current);
    lookupControllerRef.current?.abort();
    lookupRequestRef.current += 1;
  }, []);

  useEffect(() => {
    if (!checkingIn) inputRef.current?.focus();
  }, [checkingIn]);

  const lookup = async (rawCode: string, notifyError = false) => {
    const value = rawCode.trim();
    cancelPendingLookup();
    if (!value) {
      if (notifyError) toast.error(ui('أدخل كود العضو'));
      setSearching(false);
      return;
    }
    const requestId = lookupRequestRef.current;
    const controller = new AbortController();
    lookupControllerRef.current = controller;
    setSearching(true);
    setNotFound(false);
    setErrorMessage(null);
    try {
      const { data } = await api.get<ClubMemberOverview>('/club-attendance/member-overview', {
        params: { code: value },
        signal: controller.signal,
      });
      if (requestId !== lookupRequestRef.current) return;
      setOverview(data);
      setCommittedCode(value);
      if (autoCheckIn && mode === 'attendance') {
        setCode('');
        if (canConfirm && !mutationRef.current) {
          mutationRef.current = true;
          setCheckingIn(true);
          try {
            await api.post('/club-attendance/check-in', {
              memberId: data.member.id, attendanceType: 'normal', consumeSession: false,
              ...(user?.branch ? { branchId: user.branch } : {}),
            });
            toast.success(ct('members.checkInNamed', { name: data.member.name }));
            void qc.invalidateQueries({ queryKey: ['club-attendance'] });
            void qc.invalidateQueries({ queryKey: ['barcode-scan-times'] });
            await refresh(value, data.member.id);
          } catch (error) {
            toast.error(checkInError(error, locale === 'en'));
          } finally {
            mutationRef.current = false;
            setCheckingIn(false);
            inputRef.current?.focus();
          }
        }
      }
    } catch (error) {
      if (controller.signal.aborted || requestId !== lookupRequestRef.current) return;
      const message = apiError(error);
      setOverview(null);
      setCommittedCode(null);
      setNotFound(true);
      setErrorMessage(message);
      if (notifyError) toast.error(message);
    } finally {
      if (requestId === lookupRequestRef.current) {
        lookupControllerRef.current = null;
        setSearching(false);
      }
    }
  };

  const handleCodeChange = (value: string) => {
    setCode(value);
    cancelPendingLookup();
    setSearching(false);
    setNotFound(false);
    setErrorMessage(null);
    if (value.trim()) {
      lookupTimerRef.current = setTimeout(() => void lookup(value), 450);
    }
  };

  const refresh = async (value: string, memberId: number) => {
    try {
      const { data } = await api.get<ClubMemberOverview>('/club-attendance/member-overview', {
        params: { code: value },
      });
      setOverview((current) => current?.member.id === memberId ? data : current);
    } catch {
      /* keep the previously loaded profile */
    }
  };

  const handleConfirm = async () => {
    if (!overview || !canConfirm || mutationRef.current) return;
    mutationRef.current = true;
    setCheckingIn(true);
    try {
      if (mode === 'spa') {
        const { data } = await api.post<{ member?: { name?: string }; remaining?: number }>(
          '/club-spa-attendance/barcode-check-in',
          { memberCode: overview.member.memberCode },
        );
        toast.success(
          `${ui('تم تسجيل زيارة السبا للعضو')} ${data.member?.name ?? overview.member.name} — ${ui('المتبقي')}: ${toArabicDigits(data.remaining ?? 0)}`,
        );
        void qc.invalidateQueries({ queryKey: ['club-spa-attendance'] });
      } else if (mode === 'class') {
        const { data } = await api.post<{ member?: { name?: string } }>(
          '/club-classes/barcode-check-in',
          { memberCode: overview.member.memberCode },
        );
        toast.success(
          `${ui('تم تسجيل حضور الحصة للعضو')} ${data.member?.name ?? overview.member.name}`,
        );
        void qc.invalidateQueries({ queryKey: ['club-classes'] });
      } else {
        await api.post('/club-attendance/check-in', {
          memberId: overview.member.id,
          consumeSession: false,
          attendanceType: 'normal',
          ...(user?.branch ? { branchId: user.branch } : {}),
        });
        toast.success(ct('members.checkInNamed', { name: overview.member.name }));
        void qc.invalidateQueries({ queryKey: ['club-attendance'] });
      }
      if (committedCode) await refresh(committedCode, overview.member.id);
      setCode('');
    } catch (error) {
      toast.error(checkInError(error, locale === 'en'));
    } finally {
      mutationRef.current = false;
      setCheckingIn(false);
      inputRef.current?.focus();
    }
  };

  const handleServiceAttendance = async (subscription: ClubMemberOverviewSubscription, attendanceType: 'class' | 'spa' | 'inbody') => {
    if (!overview || mutationRef.current) return;
    mutationRef.current = true;
    setCheckingIn(true);
    try {
      await api.post('/club-attendance/service-check-in', {
        memberId: overview.member.id, subscriptionId: subscription.id, attendanceType,
      });
      toast.success(ui(attendanceType === 'class' ? 'تم تسجيل حضور الحصة' : attendanceType === 'spa' ? 'تم تسجيل حضور السبا' : 'تم تسجيل حضور الإنبودي'));
      for (const key of ['club-attendance', 'barcode-scan-times', 'club-classes', 'club-spa-attendance', 'club-subscriptions', 'club-inbody']) {
        void qc.invalidateQueries({ queryKey: [key] });
      }
      if (committedCode) await refresh(committedCode, overview.member.id);
    } catch (error) {
      toast.error(checkInError(error, locale === 'en'));
    } finally {
      mutationRef.current = false;
      setCheckingIn(false);
      inputRef.current?.focus();
    }
  };

  const serviceButton = (subscription: ClubMemberOverviewSubscription, type: 'class' | 'spa' | 'inbody', used: number, total: number | null) => {
    const permitted = can('club.members.attendance:create') || can('club.reception:create') || (type === 'class'
      ? can('club.fitness:update') || can('club.subscriptions.special:update')
      : can('club.fitness:create'));
    if (!permitted || total == null || total <= 0) return null;
    const label = ui(type === 'class' ? 'تسجيل حضور الحصص' : type === 'spa' ? 'تسجيل حضور السبا' : 'تسجيل حضور الإنبودي');
    const Icon = type === 'class' ? UsersRound : type === 'spa' ? Sparkles : Activity;
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex">
            <Button size="icon" variant="outline" className="size-8 shrink-0 text-primary" aria-label={label}
              disabled={checkingIn || searching || subscription.status !== 'active' || used >= total}
              onClick={() => void handleServiceAttendance(subscription, type)}>
              {checkingIn ? <Loader2 className="size-4 animate-spin" /> : <Icon className="size-4" />}
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent side="top">{label}</TooltipContent>
      </Tooltip>
    );
  };

  const reset = () => {
    cancelPendingLookup();
    setSearching(false);
    setOverview(null);
    setCommittedCode(null);
    setNotFound(false);
    setErrorMessage(null);
    setCode('');
    inputRef.current?.focus();
  };

  return (
    <TooltipProvider delayDuration={150}>
    <div className="space-y-4">
      <section className="relative overflow-hidden rounded-2xl border border-primary/20 bg-card p-4 shadow-sm md:p-5">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-brand-gradient" />
        <h3 className="mb-3 flex items-center gap-2 font-medium">
          <ScanLine className="size-4 text-primary" /> {ct('members.barcodeTitle')}
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[16rem] flex-1">
            <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-muted-foreground" />
            <Input
              ref={inputRef}
              className="nums ps-9 font-mono"
              dir="ltr"
              placeholder={ct('members.barcodePlaceholder')}
              value={code}
              autoFocus
              disabled={checkingIn}
              onChange={(event) => handleCodeChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void lookup(event.currentTarget.value, true);
                }
              }}
            />
          </div>
          <Button variant="brand" onClick={() => void lookup(code, true)} disabled={searching || checkingIn}>
            {searching ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
            {ui('عرض بيانات العضو')}
          </Button>
          {overview && (
            <Button variant="ghost" onClick={reset}>
              <X className="size-4" /> {ui('إغلاق')}
            </Button>
          )}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {mode === 'spa'
            ? ui('اكتب كود العضو أو امسحه لعرض رصيد السبا تلقائيًا، ثم اضغط «تسجيل زيارة السبا» لتأكيد الدخول.')
            : mode === 'class'
              ? ui('اكتب كود العضو أو امسحه لعرض الحصص المتبقية تلقائيًا، ثم اضغط «تسجيل حضور الحصة» لتأكيد الدخول.')
              : autoCheckIn ? ui('امسح باركود العضو لتسجيل دخوله تلقائيًا. تظل بياناته ظاهرة حتى اسكان العضو التالي.') : ui('اكتب كود العضو أو امسحه لعرض بياناته تلقائيًا قبل تسجيل الدخول.')}
        </p>
      </section>

      {notFound && !overview && (
        <div className="flex items-start gap-2 rounded-xl border border-dashed border-destructive/40 bg-destructive/5 p-4 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
          <div className="min-w-0">
            <p className="font-medium text-destructive">{ct('members.noMemberFound')}</p>
            <p className="mt-1 break-words text-xs text-muted-foreground">
              {ui('الكود المُدخل')}: <span className="nums font-mono" dir="ltr">{code.trim()}</span>
              {errorMessage ? ` — ${errorMessage}` : ''}
            </p>
          </div>
        </div>
      )}

      {overview && (
        <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
          {overview && mode !== 'attendance' && (
            <div className="flex items-center gap-2 border-b bg-primary/5 px-4 py-2.5 text-sm md:px-5">
              {mode === 'spa' ? (
                <>
                  <Sparkles className="size-4 shrink-0 text-primary" />
                  <span>
                    {ui('إجمالي رصيد السبا المتبقي')}:{' '}
                    <b className="nums">{toArabicDigits(spaRemainingTotal)}</b>{' '}
                    {spaRemainingTotal === 1
                      ? ui('زيارة')
                      : spaRemainingTotal === 2
                        ? ui('زيارتان')
                        : spaRemainingTotal >= 3 && spaRemainingTotal <= 10
                          ? ui('زيارات')
                          : ui('زيارة')}
                  </span>
                </>
              ) : (
                <>
                  <UsersRound className="size-4 shrink-0 text-primary" />
                  <span>
                    {ui('إجمالي الحصص المتبقية')}:{' '}
                    <b className="nums">{toArabicDigits(sessionsRemainingTotal)}</b>{' '}
                    {sessionsRemainingTotal === 1
                      ? ui('حصة')
                      : sessionsRemainingTotal === 2
                        ? ui('حصتان')
                        : sessionsRemainingTotal >= 3 && sessionsRemainingTotal <= 10
                          ? ui('حصص')
                          : ui('حصة')}
                  </span>
                </>
              )}
            </div>
          )}

          <div className="grid gap-3 border-b p-4 sm:grid-cols-2 lg:grid-cols-4">
            <MiniStat icon={Repeat} label={ui('إجمالي الاشتراكات')} value={overview.subscriptionCount} />
            <MiniStat icon={Lock} label={ui('اشتراكات اللوكر')} value={overview.lockerSubscriptionCount} />
            <MiniStat icon={Snowflake} label={ui('أيام الوقف')} value={overview.suspendedDays} tone="amber" />
            <MiniStat
              icon={AlertTriangle}
              label={ui('اشتراكات موقوفة')}
              value={overview.frozenCount}
              tone={overview.frozenCount > 0 ? 'amber' : undefined}
            />
          </div>

          <div className="grid items-start gap-4 p-4 xl:grid-cols-[minmax(0,1fr)_18rem] 2xl:grid-cols-[minmax(0,1fr)_20rem]">
            <aside className="min-w-0 space-y-4 xl:order-2">
              <div className="rounded-2xl border bg-card p-4">
                <div className="flex flex-col items-center gap-2 text-center">
                  <MemberAvatar
                    name={overview.member.name}
                    profilePicture={overview.member.profilePicture}
                    size="xl"
                    className="ring-2 ring-primary/30 shadow-md"
                  />
                  <h3 className="text-lg font-semibold leading-tight">{overview.member.name}</h3>
                  {overview.member.isBlocked ? (
                    <StatusBadge status="blocked" label={ui('محظور')} />
                  ) : overview.member.isActive ? (
                    <StatusBadge status="active" label={ui('نشط')} />
                  ) : (
                    <StatusBadge status="suspended" label={ui('غير نشط')} />
                  )}
                </div>
                <dl className="mt-4 space-y-2.5 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-muted-foreground">{ui('كود العضو')}</dt>
                    <dd className="nums font-mono" dir="ltr">
                      {overview.member.memberCode}
                    </dd>
                  </div>
                  {overview.member.phone && (
                    <div className="flex items-center justify-between gap-2">
                      <dt className="flex items-center gap-1 text-muted-foreground">
                        <Phone className="size-3.5" />
                        {ui('الموبايل')}
                      </dt>
                      <dd className="nums">{toArabicDigits(overview.member.phone)}</dd>
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-2">
                    <dt className="flex items-center gap-1 text-muted-foreground">
                      <MapPin className="size-3.5" />
                      {ui('الفرع')}
                    </dt>
                    <dd>{branchName}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-muted-foreground">{ui('النوع')}</dt>
                    <dd>
                      {overview.member.gender === 'male' ? ct('common.male') : ct('common.female')}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <dt className="flex items-center gap-1 text-muted-foreground">
                      <CalendarDays className="size-3.5" />
                      {ui('آخر دخول')}
                    </dt>
                    <dd className="nums">
                      {overview.member.lastCheckIn
                        ? formatDateTime(overview.member.lastCheckIn)
                        : ui('لم يحضر بعد')}
                    </dd>
                  </div>
                </dl>
              </div>

              <div className="rounded-2xl border bg-card p-4">
                <h4 className="flex items-center gap-2 text-sm font-semibold">
                  <Snowflake className="size-4 text-primary" /> {ui('آخر وقف')}
                </h4>
                {lastFreeze ? (
                  <div className="mt-3 space-y-2.5 text-sm">
                    <div>
                      <p className="font-medium">
                        {lastFreeze.subscriptionType ?? ui('اشتراك')}
                      </p>
                      {lastFreeze.subscriptionNumber && (
                        <p className="nums font-mono text-xs text-muted-foreground" dir="ltr">
                          {lastFreeze.subscriptionNumber}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground">{ui('من تاريخ')}</span>
                      <span className="nums">{toArabicDigits(lastFreeze.startDate)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground">{ui('إلى تاريخ')}</span>
                      <span className="nums">
                        {lastFreeze.endDate ? toArabicDigits(lastFreeze.endDate) : ui('مستمر')}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground">{ui('عدد الأيام')}</span>
                      <span className="nums">
                        {toArabicDigits(lastFreeze.actualDays ?? lastFreeze.plannedDays)}{' '}
                        {dayWord(lastFreeze.actualDays ?? lastFreeze.plannedDays, ui)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground">{ui('الحالة')}</span>
                      <StatusBadge
                        status={lastFreeze.isActive ? 'active' : 'expired'}
                        label={lastFreeze.isActive ? ui('نشط') : ui('منتهي')}
                      />
                    </div>
                  </div>
                ) : (
                  <p className="mt-3 rounded-xl border border-dashed p-3 text-center text-xs text-muted-foreground">
                    {ui('لا يوجد وقف مسجل لهذا العضو')}
                  </p>
                )}
              </div>
            </aside>
            <div className="min-w-0 space-y-6">
            <div className="space-y-2">
              <h4 className="flex items-center gap-2 text-sm font-semibold">
                <Repeat className="size-4 text-primary" /> {ui('الاشتراكات بالتفصيل')}
                <span className="text-xs font-normal text-muted-foreground">
                  ({ui('النشطة أولاً')})
                </span>
              </h4>
              {overview.subscriptions.length === 0 ? (
                <p className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">
                  {ui('لا توجد اشتراكات لهذا العضو')}
                </p>
              ) : (
                <div className="overflow-x-auto rounded-xl border">
                  <table className="w-full min-w-[62rem] border-collapse text-sm">
                    <thead>
                      <tr className="bg-muted/40 text-xs text-muted-foreground">
                        <th className="whitespace-nowrap px-3 py-2 text-start font-medium">{ui('الاشتراك')}</th>
                        <th className="whitespace-nowrap px-3 py-2 text-start font-medium">{ui('البداية')}</th>
                        <th className="whitespace-nowrap px-3 py-2 text-start font-medium">{ui('النهاية')}</th>
                        <th className="whitespace-nowrap px-3 py-2 text-start font-medium">{ui('الحالة')}</th>
                        <th className="whitespace-nowrap px-3 py-2 text-start font-medium">{ui('المدة')}</th>
                        <th className="whitespace-nowrap px-3 py-2 text-start font-medium">{ui('مرتبط بحصص؟')}</th>
                        <th className="whitespace-nowrap px-3 py-2 text-start font-medium">{ui('الحصص')}</th>
                        <th className="whitespace-nowrap px-3 py-2 text-start font-medium">{ui('مرتبط بسبا؟')}</th>
                        <th className="whitespace-nowrap px-3 py-2 text-start font-medium">{ui('السبا')}</th>
                        <th className="whitespace-nowrap px-3 py-2 text-start font-medium">{ui('الإنبودي')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {[...overview.subscriptions]
                        .sort((a, b) => Number(b.status === 'active') - Number(a.status === 'active'))
                        .slice(0, 5)
                        .map((subscription) => (
                        <tr
                          key={subscription.id}
                          className={
                            subscription.status === 'active'
                              ? 'bg-emerald-100/85 hover:bg-emerald-200/85 dark:bg-emerald-950/35 dark:hover:bg-emerald-950/50'
                              : subscription.status === 'expired'
                                ? 'bg-red-100/85 hover:bg-red-200/85 dark:bg-red-950/35 dark:hover:bg-red-950/50'
                                : undefined
                          }
                        >
                          <td className="px-3 py-2">
                            <p className="font-medium">
                              {subscription.subscriptionTypeName ?? ui('اشتراك')}
                            </p>
                            <p className="nums font-mono text-xs text-muted-foreground" dir="ltr">
                              {subscription.subscriptionNumber}
                            </p>
                          </td>
                          <td className="nums whitespace-nowrap px-3 py-2">
                            {toArabicDigits(subscription.startDate)}
                          </td>
                          <td className="nums whitespace-nowrap px-3 py-2">
                            {toArabicDigits(subscription.endDate)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2">
                            <SubStatusBadge status={subscription.status} />
                          </td>
                          <td className="whitespace-nowrap px-3 py-2">
                            <SubscriptionDuration sub={subscription} />
                          </td>
                          <td className="whitespace-nowrap px-3 py-2">
                            <YesNo value={subscription.isLinkedToSessions} />
                          </td>
                          <td className="whitespace-nowrap px-3 py-2">
                            {subscription.isLinkedToSessions ? (
                              <div className="flex items-center gap-2">
                              <Usage
                                used={subscription.sessionsUsed ?? 0}
                                total={subscription.sessionsCount}
                              />
                              {serviceButton(subscription, 'class', subscription.sessionsUsed ?? 0, subscription.sessionsCount)}
                              </div>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2">
                            <YesNo value={subscription.isLinkedToSpa} />
                          </td>
                          <td className="whitespace-nowrap px-3 py-2">
                            {subscription.isLinkedToSpa ? (
                              <div className="flex items-center gap-2">
                              <Usage used={subscription.spaUsed} total={subscription.spaCount} />
                              {serviceButton(subscription, 'spa', subscription.spaUsed, subscription.spaCount)}
                              </div>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2">
                            <div className="flex items-center gap-2">
                            <Usage used={subscription.inbodyUsed} total={subscription.inbodyCount} />
                            {serviceButton(subscription, 'inbody', subscription.inbodyUsed, subscription.inbodyCount)}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <h4 className="flex items-center gap-2 text-sm font-semibold">
                <Lock className="size-4 text-primary" /> {ui('اشتراكات اللوكر')}
              </h4>
              {overview.lockerSubscriptions.length === 0 ? (
                <p className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">
                  {ui('لا توجد اشتراكات لوكر لهذا العضو')}
                </p>
              ) : (
                <div className="overflow-x-auto rounded-xl border">
                  <table className="w-full min-w-[52rem] border-collapse text-sm">
                    <thead>
                      <tr className="bg-muted/40 text-xs text-muted-foreground">
                        <th className="whitespace-nowrap px-3 py-2 text-start font-medium">{ui('الفرع')}</th>
                        <th className="whitespace-nowrap px-3 py-2 text-start font-medium">{ui('نوع الاشتراك')}</th>
                        <th className="whitespace-nowrap px-3 py-2 text-start font-medium">{ui('تاريخ البداية')}</th>
                        <th className="whitespace-nowrap px-3 py-2 text-start font-medium">{ui('تاريخ النهاية')}</th>
                        <th className="whitespace-nowrap px-3 py-2 text-start font-medium">{ui('رقم المفتاح')}</th>
                        <th className="whitespace-nowrap px-3 py-2 text-start font-medium">{ui('حالة الاشتراك')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {overview.lockerSubscriptions.map((locker) => (
                        <tr key={locker.id}>
                          <td className="whitespace-nowrap px-3 py-2">
                            {branchNameById(locker.branchId)}
                          </td>
                          <td className="px-3 py-2">
                            <p className="font-medium">
                              {locker.subscriptionTypeName ?? ui('اشتراك لوكر')}
                            </p>
                            <p className="nums font-mono text-xs text-muted-foreground" dir="ltr">
                              {locker.subscriptionNumber}
                            </p>
                          </td>
                          <td className="nums whitespace-nowrap px-3 py-2">
                            {toArabicDigits(locker.startDate)}
                          </td>
                          <td className="nums whitespace-nowrap px-3 py-2">
                            {toArabicDigits(locker.endDate)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2">
                            {locker.lockerNumber ? (
                              <span className="nums font-mono" dir="ltr">
                                {locker.lockerNumber}
                              </span>
                            ) : (
                              `#${locker.id}`
                            )}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2">
                            <SubStatusBadge status={locker.status} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 border-t bg-muted/20 p-4">
            {canAddSubscription && (
              <Button
                variant="outline"
                onClick={() =>
                  navigate('/club/subscriptions/new', { state: { prefillMember: overview.member } })
                }
              >
                <Plus className="size-4" /> {ui('إضافة اشتراك')}
              </Button>
            )}
            {canEditMember && (
              <Button
                variant="outline"
                onClick={() => {
                  if (onEditMember) onEditMember(overview.member);
                  else navigate(`/club/members?edit=${overview.member.id}`);
                }}
              >
                <Pencil className="size-4" /> {ui('تعديل بيانات العضو')}
              </Button>
            )}
            {canConfirm && !(autoCheckIn && mode === 'attendance') && (
              <Button variant="brand" onClick={() => void handleConfirm()} disabled={checkingIn}>
                {checkingIn ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : mode === 'spa' ? (
                  <Sparkles className="size-4" />
                ) : mode === 'class' ? (
                  <UsersRound className="size-4" />
                ) : (
                  <LogIn className="size-4" />
                )}
                {mode === 'spa'
                  ? ui('تسجيل زيارة السبا')
                  : mode === 'class'
                    ? ui('تسجيل حضور الحصة')
                    : ct('members.checkIn')}
              </Button>
            )}
          </div>
        </section>
      )}
    </div>
    </TooltipProvider>
  );
}
