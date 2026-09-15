import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeftRight,
  Banknote,
  Clock3,
  Eye,
  EyeOff,
  LockKeyhole,
  ShieldCheck,
  Square,
  Trash2,
  UserRound,
  WalletCards,
} from "lucide-react";
import { useLocation } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ShiftWastePanel } from "@/components/sales/shift-waste-panel";
import { useBranches } from "@/hooks/use-branches";
import { usePermission } from "@/hooks/use-permission";
import { useCurrentShiftSession } from "@/hooks/use-shift-session";
import { api, apiError } from "@/lib/api";
import { confirmWithPreview } from "@/lib/confirm";
import { formatTime } from "@/lib/formatters";
import { toArabicDigits } from "@/lib/utils";
import { isDryRunResponse } from "@/lib/validators";
import { useAuth } from "@/store/auth";
import { useLocale } from "@/store/locale";
import type { Paginated, WasteRecord } from "@/pages/cafe/waste-types";

interface Shift {
  id: number;
  shiftName: string;
  startTime: string;
  endTime: string;
  color: string;
  branchId?: number | null;
  isActive?: boolean;
  isLastShiftOfDay: boolean;
  responsibleUser?: {
    id: number;
    name: string | null;
    username: string | null;
  } | null;
}

interface ScheduleStatus {
  current: Shift | null;
  next: Shift | null;
  secondsUntilNext: number | null;
  alertActive: boolean;
}

export function PosShiftSwitcher({ actions }: { actions?: ReactNode }) {
  const location = useLocation();
  const qc = useQueryClient();
  const { ui } = useLocale();
  const { can } = usePermission();
  const canCreateShift = can('gym-sales.sales.shifts:create');
  const canUpdateShift = can('gym-sales.sales.shifts:update');
  const canViewWaste = can('club.cafe.waste:view');
  const canCreateWaste = can('club.cafe.waste:create');
  const user = useAuth((state) => state.user);
  const switchPosUser = useAuth((state) => state.switchPosUser);
  const { data: branches = [] } = useBranches();
  const isPos = location.pathname.startsWith("/sales/");
  const branchId = user?.branch || branches[0]?.id || undefined;
  const { data: current, refetch: refetchCurrent } =
    useCurrentShiftSession(branchId);
  const { data: shifts = [] } = useQuery({
    queryKey: ["shifts", branchId],
    queryFn: async () =>
      (
        await api.get<Shift[]>("/shifts", {
          params: { branchId, isActive: true },
        })
      ).data,
    enabled: isPos && !!branchId,
  });
  const { data: schedule } = useQuery({
    queryKey: ["shifts", "schedule-status", branchId],
    queryFn: async () =>
      (
        await api.get<ScheduleStatus>("/shifts/schedule-status", {
          params: branchId ? { branchId } : undefined,
        })
      ).data,
    enabled: isPos,
    refetchInterval: 30_000,
  });
  const [nowTick, setNowTick] = useState(0);
  const [open, setOpen] = useState(false);
  const [startOpen, setStartOpen] = useState(false);
  const [startShiftId, setStartShiftId] = useState("");
  const [startOpeningBalance, setStartOpeningBalance] = useState("0");
  const [startNotes, setStartNotes] = useState("");
  const [starting, setStarting] = useState(false);
  const [targetShiftId, setTargetShiftId] = useState("");
  const [closingBalance, setClosingBalance] = useState("0");
  const [transferAmount, setTransferAmount] = useState("0");
  const [cashDropAmount, setCashDropAmount] = useState("0");
  const [lastAllocationEdited, setLastAllocationEdited] = useState<
    "transfer" | "drop"
  >("transfer");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [notes, setNotes] = useState("");
  const [shortageReason, setShortageReason] = useState("");
  const [endDayOpen, setEndDayOpen] = useState(false);
  const [endDayClosingBalance, setEndDayClosingBalance] = useState("0");
  const [endDayCashDropAmount, setEndDayCashDropAmount] = useState("0");
  const [endDayRetainedAmount, setEndDayRetainedAmount] = useState("0");
  const [endDayShortageReason, setEndDayShortageReason] = useState("");
  const [closingDay, setClosingDay] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [handoverTab, setHandoverTab] = useState<'handover' | 'waste'>('handover');

  const shiftWasteQuery = useQuery({
    queryKey: ['cafe-waste', 'records', 'shift', current?.id],
    queryFn: async () => (await api.get<Paginated<WasteRecord>>('/cafe-waste/records', {
      params: {
        branchId,
        shiftSessionId: current?.id,
        page: 1,
        pageSize: 100,
      },
    })).data,
    enabled: open && canViewWaste && !!branchId && !!current?.id,
  });

  useEffect(() => {
    const timer = window.setInterval(
      () => setNowTick((value) => value + 1),
      1000,
    );
    return () => window.clearInterval(timer);
  }, []);

  const secondsUntilNext = useMemo(() => {
    if (schedule?.secondsUntilNext == null) return null;
    return Math.max(0, schedule.secondsUntilNext - (nowTick % 30));
  }, [nowTick, schedule?.secondsUntilNext]);

  const countdown =
    secondsUntilNext == null
      ? ""
      : `${Math.floor(secondsUntilNext / 60)}:${String(secondsUntilNext % 60).padStart(2, "0")}`;

  const nextShiftOptions = useMemo(
    () =>
      shifts.filter(
        (shift) => shift.isActive !== false && shift.id !== current?.shiftId,
      ),
    [current?.shiftId, shifts],
  );
  const bannerNextShift = useMemo(() => {
    if (schedule?.next && schedule.next.id !== current?.shiftId)
      return schedule.next;
    return nextShiftOptions[0] ?? null;
  }, [current?.shiftId, nextShiftOptions, schedule?.next]);
  const currentIsLastShift = current?.shift?.isLastShiftOfDay === true;
  const expectedDrawerBalance = Number(
    current?.expectedClosingBalance ?? current?.openingBalance ?? 0,
  );
  const handoverShortage = Math.max(
    0,
    expectedDrawerBalance - (Number(closingBalance) || 0),
  );
  const endDayShortage = Math.max(
    0,
    expectedDrawerBalance - (Number(endDayClosingBalance) || 0),
  );

  const prepareDialog = async () => {
    if (preparing) return;
    setPreparing(true);
    try {
      // The drawer handover must start from a fresh session snapshot, not a
      // cached balance left over from a switch in another tab.
      const refreshed = await refetchCurrent();
      const activeSession = refreshed.data;
      if (!activeSession) {
        if (!canCreateShift) return;
        const suggestedShift =
          shifts.find((shift) => shift.id === schedule?.current?.id) ??
          shifts[0];
        if (!suggestedShift) {
          toast.error(ui("لا توجد وردية نشطة متاحة للفتح في هذا الفرع"));
          return;
        }
        setStartShiftId(String(suggestedShift.id));
        setStartOpeningBalance("0");
        setStartNotes("");
        setStartOpen(true);
        return;
      }
      if (!canUpdateShift) return;
      const availableShifts = shifts.filter(
        (shift) =>
          shift.isActive !== false && shift.id !== activeSession.shiftId,
      );
      const physical = Number(
        activeSession.expectedClosingBalance ??
          activeSession.openingBalance ??
          0,
      );
      const float = Math.min(
        physical,
        Number(activeSession.openingBalance ?? 0),
      );
      const scheduledNext = availableShifts.find(
        (shift) => shift.id === schedule?.next?.id,
      );
      const target = scheduledNext ?? availableShifts[0];
      setTargetShiftId(target ? String(target.id) : "");
      setClosingBalance(physical.toFixed(2));
      setTransferAmount(float.toFixed(2));
      setCashDropAmount(Math.max(0, physical - float).toFixed(2));
      setLastAllocationEdited("transfer");
      setUsername(
        target?.responsibleUser?.username ??
          schedule?.next?.responsibleUser?.username ??
          "",
      );
      setPassword("");
      setShowPassword(false);
      setNotes("");
      setShortageReason("");
      setHandoverTab('handover');
      setOpen(true);
    } catch (error) {
      toast.error(apiError(error, ui("تعذر تحميل رصيد الوردية الحالي")));
    } finally {
      setPreparing(false);
    }
  };

  const prepareEndDayDialog = async () => {
    if (!canUpdateShift || preparing) return;
    setPreparing(true);
    try {
      const refreshed = await refetchCurrent();
      const activeSession = refreshed.data;
      if (!activeSession) {
        toast.info(ui("لا توجد وردية مفتوحة لإغلاقها"));
        return;
      }
      const actual = Number(
        activeSession.expectedClosingBalance ?? activeSession.openingBalance ?? 0,
      );
      const retained = Math.min(actual, Number(activeSession.openingBalance ?? 0));
      setEndDayClosingBalance(actual.toFixed(2));
      setEndDayRetainedAmount(retained.toFixed(2));
      setEndDayCashDropAmount(Math.max(0, actual - retained).toFixed(2));
      setEndDayShortageReason("");
      setEndDayOpen(true);
    } catch (error) {
      toast.error(apiError(error, ui("تعذر تحميل رصيد الوردية الحالي")));
    } finally {
      setPreparing(false);
    }
  };

  useEffect(() => {
    const openFromShiftDashboard = () => void prepareDialog();
    window.addEventListener(
      "noamany:open-shift-switcher",
      openFromShiftDashboard,
    );
    return () =>
      window.removeEventListener(
        "noamany:open-shift-switcher",
        openFromShiftDashboard,
      );
  }, [
    preparing,
    refetchCurrent,
    schedule?.next?.id,
    schedule?.next?.responsibleUser?.username,
    shifts,
    ui,
  ]);

  const startShiftFromPos = async () => {
    if (!canCreateShift || !startShiftId || !branchId || starting) return;
    setStarting(true);
    try {
      await api.post("/shift-sessions/start", {
        shiftId: Number(startShiftId),
        branchId: Number(branchId),
        openingBalance: Number(startOpeningBalance) || 0,
        notes: startNotes.trim() || undefined,
      });
      setStartOpen(false);
      await Promise.all([
        refetchCurrent(),
        qc.invalidateQueries({ queryKey: ["shift-sessions"] }),
        qc.invalidateQueries({ queryKey: ["shifts", "schedule-status"] }),
      ]);
      toast.success(
        ui(`تم فتح الوردية باسم ${user?.name ?? "المستخدم الحالي"}`),
      );
    } catch (error) {
      toast.error(apiError(error, ui("تعذر فتح الوردية")));
    } finally {
      setStarting(false);
    }
  };

  const updateClosing = (value: string) => {
    setClosingBalance(value);
    const total = Math.max(0, Number(value) || 0);
    if (lastAllocationEdited === "drop") {
      const drop = Math.min(total, Math.max(0, Number(cashDropAmount) || 0));
      setCashDropAmount(drop.toFixed(2));
      setTransferAmount((total - drop).toFixed(2));
      return;
    }
    const transfer = Math.min(total, Math.max(0, Number(transferAmount) || 0));
    setTransferAmount(transfer.toFixed(2));
    setCashDropAmount((total - transfer).toFixed(2));
  };
  const updateTransfer = (value: string) => {
    const total = Math.max(0, Number(closingBalance) || 0);
    const entered = Math.max(0, Number(value) || 0);
    const transfer = Math.min(total, entered);
    setLastAllocationEdited("transfer");
    setTransferAmount(entered > total ? total.toFixed(2) : value);
    setCashDropAmount((total - transfer).toFixed(2));
  };
  const updateCashDrop = (value: string) => {
    const total = Math.max(0, Number(closingBalance) || 0);
    const entered = Math.max(0, Number(value) || 0);
    const drop = Math.min(total, entered);
    setLastAllocationEdited("drop");
    setCashDropAmount(entered > total ? total.toFixed(2) : value);
    setTransferAmount((total - drop).toFixed(2));
  };

  const updateEndDayClosing = (value: string) => {
    const total = Math.max(0, Number(value) || 0);
    const retained = Math.min(total, Math.max(0, Number(endDayRetainedAmount) || 0));
    setEndDayClosingBalance(value);
    setEndDayRetainedAmount(retained.toFixed(2));
    setEndDayCashDropAmount((total - retained).toFixed(2));
  };

  const updateEndDayCashDrop = (value: string) => {
    const total = Math.max(0, Number(endDayClosingBalance) || 0);
    const drop = Math.min(total, Math.max(0, Number(value) || 0));
    setEndDayCashDropAmount(Number(value) > total ? total.toFixed(2) : value);
    setEndDayRetainedAmount((total - drop).toFixed(2));
  };

  const updateEndDayRetained = (value: string) => {
    const total = Math.max(0, Number(endDayClosingBalance) || 0);
    const retained = Math.min(total, Math.max(0, Number(value) || 0));
    setEndDayRetainedAmount(Number(value) > total ? total.toFixed(2) : value);
    setEndDayCashDropAmount((total - retained).toFixed(2));
  };

  const closeDay = async () => {
    if (!canUpdateShift || !current || closingDay) return;
    const closing = Number(endDayClosingBalance) || 0;
    const drop = Number(endDayCashDropAmount) || 0;
    const retained = Number(endDayRetainedAmount) || 0;
    if (Math.abs(drop + retained - closing) > 0.01) {
      toast.error(ui("المسحوب للخزنة والمتبقي في الدرج يجب أن يساويا رصيد الإغلاق"));
      return;
    }
    if (endDayShortage > 0.01 && !endDayShortageReason.trim()) {
      toast.error(ui("اكتب سبب عجز النقدية قبل اعتماد إغلاق اليوم"));
      return;
    }

    setClosingDay(true);
    try {
      await confirmWithPreview(
        {
          title: ui("إغلاق اليوم"),
          description: ui("سيتم إغلاق آخر وردية وتسجيل توريد النقدية في سجل الدرج."),
          confirmLabel: ui("اعتماد إغلاق اليوم"),
        },
        async () => {
          const { data } = await api.put(`/shift-sessions/${current.id}/close?dryRun=true`, {
            closingBalance: closing,
            cashDropAmount: drop,
            retainedAmount: retained,
            shortageReason: endDayShortageReason.trim() || undefined,
          });
          if (!isDryRunResponse(data)) throw new Error(ui("تعذّر تحميل المعاينة"));
          return { rows: data.rows, warning: data.warning };
        },
        async () => {
          await api.put(`/shift-sessions/${current.id}/close`, {
            closingBalance: closing,
            cashDropAmount: drop,
            retainedAmount: retained,
            shortageReason: endDayShortageReason.trim() || undefined,
          });
          setEndDayOpen(false);
          await Promise.all([
            refetchCurrent(),
            qc.invalidateQueries({ queryKey: ["shift-sessions"] }),
            qc.invalidateQueries({ queryKey: ["shifts", "schedule-status"] }),
          ]);
          toast.success(ui("تم إغلاق اليوم وتسجيل التوريد في سجل الدرج"));
        },
      );
    } catch (error) {
      toast.error(apiError(error, ui("تعذر إغلاق اليوم")));
    } finally {
      setClosingDay(false);
    }
  };

  const submit = async () => {
    if (!canUpdateShift || !targetShiftId || !username.trim() || !password || saving) return;
    if (handoverShortage > 0.01 && !shortageReason.trim()) {
      toast.error(ui("اكتب سبب عجز النقدية قبل تسليم الدرج"));
      return;
    }
    setSaving(true);
    try {
      const { data } = await api.post("/shift-sessions/switch", {
        targetShiftId: Number(targetShiftId),
        branchId,
        username: username.trim(),
        password,
        closingBalance: Number(closingBalance) || 0,
        transferAmount: Number(transferAmount) || 0,
        cashDropAmount: Number(cashDropAmount) || 0,
        notes: notes.trim() || undefined,
        shortageReason: shortageReason.trim() || undefined,
      });
      await switchPosUser(data.accessToken, data.user);
      await Promise.all([
        refetchCurrent(),
        qc.invalidateQueries({ queryKey: ["shift-sessions"] }),
        qc.invalidateQueries({ queryKey: ["shifts", "schedule-status"] }),
      ]);
      setOpen(false);
      toast.success(
        ui(
          `تم تسليم الوردية إلى ${data.user?.name ?? username} مع بقاء الطلب الحالي كما هو`,
        ),
      );
    } catch (error) {
      toast.error(apiError(error, ui("تعذر تبديل الوردية")));
    } finally {
      setSaving(false);
    }
  };

  if (!isPos) return null;

  return (
    <>
      <section className="relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-l from-primary/[0.11] via-card to-card p-4 shadow-[0_14px_40px_-28px_rgba(27,123,190,.7)] sm:p-5">
        <div className="pointer-events-none absolute -end-12 -top-14 size-40 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20">
              {currentIsLastShift ? <Square className="size-5" /> : <ArrowLeftRight className="size-5" />}
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-black text-foreground">
                  {ui(currentIsLastShift ? "إغلاق اليوم" : "تبديل الشيفت")}
                </h2>
                <span
                  className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${current ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-400/15 dark:text-emerald-200" : "bg-amber-100 text-amber-800 dark:bg-amber-400/15 dark:text-amber-200"}`}
                >
                  {current ? ui("الوردية مفتوحة") : ui("لا توجد وردية مفتوحة")}
                </span>
              </div>
              {current ? (
                <p className="mt-1 text-sm text-muted-foreground">
                  <b className="text-foreground">{current.shift?.shiftName}</b>
                  <span className="mx-2 text-border">•</span>
                  {ui("المسؤول الحالي")}:{" "}
                  <b className="text-foreground">
                    {user?.name ?? ui("المستخدم الحالي")}
                  </b>
                  {current.shift ? (
                    <>
                      <span className="mx-2 text-border">•</span>
                      <span className="nums">
                        {formatTime(current.shift.startTime)} –{" "}
                        {formatTime(current.shift.endTime)}
                      </span>
                    </>
                  ) : null}
                </p>
              ) : (
                <p className="mt-1 text-sm text-muted-foreground">
                  {ui(
                    "ابدأ وردية لتسجيل المبيعات وحركات الدرج باسم المسؤول الحالي.",
                  )}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            {!currentIsLastShift && bannerNextShift ? (
              <div className="flex min-h-11 items-center gap-2 rounded-xl border border-primary/15 bg-background/80 px-3 text-xs shadow-sm">
                <Clock3 className="size-4 text-primary" />
                <span className="text-muted-foreground">
                  {ui("الوردية القادمة")}
                </span>
                <b>{bannerNextShift.shiftName}</b>
                {schedule?.alertActive &&
                schedule.next?.id === bannerNextShift.id ? (
                  <span className="nums rounded-lg bg-amber-100 px-2 py-1 font-black text-amber-800 dark:bg-amber-400/15 dark:text-amber-200">
                    {toArabicDigits(countdown)}
                  </span>
                ) : null}
              </div>
            ) : null}
            {(current ? canUpdateShift : canCreateShift) ? <Button
              permissionAction={current ? 'update' : 'create'}
              type="button"
              className="h-11 gap-2 rounded-xl px-5 shadow-lg shadow-primary/15"
              disabled={preparing}
              onClick={() => void (currentIsLastShift ? prepareEndDayDialog() : prepareDialog())}
            >
              {currentIsLastShift ? <Square className="size-4" /> : <ArrowLeftRight className="size-4" />}
              {preparing
                ? ui("جاري مراجعة رصيد الدرج…")
                : current
                  ? ui(currentIsLastShift ? "إغلاق اليوم" : "تسليم وتبديل الشيفت")
                  : ui("فتح وردية")}
            </Button> : null}
            {actions ? (
              <div className="flex items-center gap-2">
                {actions}
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <Dialog open={canCreateShift && startOpen} onOpenChange={setStartOpen}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>{ui("فتح وردية من نقطة البيع")}</DialogTitle>
            <DialogDescription>
              {ui("اختر الوردية ورصيد افتتاح الدرج. سيتم تسجيل المسؤول باسم المستخدم الحالي تلقائياً.")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 dark:border-emerald-800 dark:bg-emerald-950/20">
              <span className="flex size-10 items-center justify-center rounded-xl bg-background text-emerald-700">
                <UserRound className="size-5" />
              </span>
              <div>
                <p className="text-xs text-muted-foreground">{ui("المسؤول المستلم")}</p>
                <p className="font-bold">{user?.name ?? ui("المستخدم الحالي")}</p>
              </div>
            </div>
            <div className="grid gap-2">
              <Label>{ui("الوردية")}</Label>
              <select
                className="h-11 rounded-xl border bg-background px-3 text-sm"
                value={startShiftId}
                onChange={(event) => setStartShiftId(event.target.value)}
              >
                {shifts.map((shift) => (
                  <option key={shift.id} value={shift.id}>
                    {shift.shiftName} · {formatTime(shift.startTime)}–{formatTime(shift.endTime)}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <Label>{ui("رصيد افتتاح الدرج")}</Label>
              <Input
                className="nums h-11"
                type="number"
                min={0}
                step="0.01"
                value={startOpeningBalance}
                onChange={(event) => setStartOpeningBalance(event.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label>{ui("ملاحظات الافتتاح")}</Label>
              <Input
                value={startNotes}
                onChange={(event) => setStartNotes(event.target.value)}
                placeholder={ui("اختياري")}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStartOpen(false)} disabled={starting}>
              {ui("إلغاء")}
            </Button>
            <Button permissionAction="create" onClick={() => void startShiftFromPos()} disabled={starting || !startShiftId}>
              {starting ? ui("جاري فتح الوردية…") : ui("فتح الوردية")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={canUpdateShift && endDayOpen} onOpenChange={setEndDayOpen}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <Square className="size-6 text-amber-600" />
              {ui("إغلاق اليوم")}
            </DialogTitle>
            <DialogDescription>
              {ui("هذه آخر وردية في اليوم. راجع النقدية وحدد المسحوب للخزنة والمتبقي في الدرج.")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-xl border bg-muted/20 p-3 text-sm">
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">{ui("الرصيد المتوقع في الدرج")}</span>
                <b className="nums">{toArabicDigits(Number(current?.expectedClosingBalance ?? 0).toFixed(2))} EGP</b>
              </div>
            </div>
            <div className="grid gap-2">
              <Label>{ui("رصيد الإغلاق الفعلي")}</Label>
              <Input
                className="nums h-12 text-base font-black"
                type="number"
                min={0}
                step="0.01"
                value={endDayClosingBalance}
                onChange={(event) => updateEndDayClosing(event.target.value)}
              />
            </div>
            {endDayShortage > 0.01 ? (
              <div className="grid gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3">
                <div className="flex items-center justify-between gap-3">
                  <Label className="font-bold text-destructive">{ui("سبب عجز النقدية")}</Label>
                  <b className="nums text-sm text-destructive">
                    -{toArabicDigits(endDayShortage.toFixed(2))} EGP
                  </b>
                </div>
                <Textarea
                  rows={3}
                  value={endDayShortageReason}
                  onChange={(event) => setEndDayShortageReason(event.target.value)}
                  placeholder={ui("اكتب سبب العجز ليظهر في سجل الخزينة")}
                />
                <p className="text-xs text-destructive">{ui("هذا الحقل مطلوب لأن الرصيد الفعلي أقل من المتوقع.")}</p>
              </div>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-2 rounded-xl border border-amber-200 bg-amber-50/70 p-3 dark:border-amber-800 dark:bg-amber-950/20">
                <Label>{ui("المسحوب للخزنة")}</Label>
                <Input
                  className="nums bg-background"
                  type="number"
                  min={0}
                  step="0.01"
                  value={endDayCashDropAmount}
                  onChange={(event) => updateEndDayCashDrop(event.target.value)}
                />
              </div>
              <div className="grid gap-2 rounded-xl border p-3">
                <Label>{ui("المتبقي في الدرج")}</Label>
                <Input
                  className="nums"
                  type="number"
                  min={0}
                  step="0.01"
                  value={endDayRetainedAmount}
                  onChange={(event) => updateEndDayRetained(event.target.value)}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEndDayOpen(false)} disabled={closingDay}>
              {ui("إلغاء")}
            </Button>
            <Button
              permissionAction="update"
              onClick={() => void closeDay()}
              disabled={
                closingDay ||
                (endDayShortage > 0.01 && !endDayShortageReason.trim())
              }
            >
              {closingDay ? ui("جاري الإغلاق…") : ui("اعتماد إغلاق اليوم")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={canUpdateShift && open} onOpenChange={(next) => {
        setOpen(next);
        if (!next) setHandoverTab('handover');
      }}>
        <DialogContent size="form" className="h-[calc(100dvh-1rem)] max-h-[calc(100dvh-1rem)] gap-4 p-4 sm:h-auto sm:max-h-[92vh] sm:p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <ArrowLeftRight className="size-6 text-primary" />
              {ui("تسليم وتبديل الشيفت")}
            </DialogTitle>
            <DialogDescription>
              {ui(
                "خطوتان واضحتان: وزّع نقدية الدرج، ثم سجّل دخول مسؤول الوردية الجديدة. سلة الطلب ستبقى كما هي.",
              )}
            </DialogDescription>
          </DialogHeader>

          <Tabs value={handoverTab} onValueChange={(value) => setHandoverTab(value as 'handover' | 'waste')} dir="rtl" className="min-h-0">
            <TabsList className="h-auto w-full justify-start gap-1 p-1 sm:w-fit" aria-label={ui('أقسام تسليم الشيفت')}>
              <TabsTrigger value="handover" className="min-h-10 gap-2 px-4">
                <ArrowLeftRight className="size-4" />{ui('تسليم الشيفت')}
              </TabsTrigger>
              {canViewWaste ? (
                <TabsTrigger value="waste" className="min-h-10 gap-2 px-4">
                  <Trash2 className="size-4" />{ui('هالك الشيفت')}
                  <span className="nums min-w-6 rounded-full bg-rose-100 px-1.5 py-0.5 text-[11px] font-black text-rose-700 dark:bg-rose-500/15 dark:text-rose-200">
                    {toArabicDigits(shiftWasteQuery.data?.total ?? 0)}
                  </span>
                </TabsTrigger>
              ) : null}
            </TabsList>

            <TabsContent value="handover" className="mt-4 space-y-6">
          <div className="grid gap-4 lg:grid-cols-2">
            <section className="space-y-4 rounded-2xl border border-primary/15 bg-primary/[0.025] p-4">
              <div className="flex items-center gap-2 font-bold">
                <span className="flex size-7 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">
                  ١
                </span>
                <WalletCards className="size-4 text-primary" />
                {ui("تسليم الدرج")}
              </div>
              <div className="rounded-xl border bg-background p-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    {ui("المتوقع في الدرج")}
                  </span>
                  <b className="nums">
                    {toArabicDigits(
                      Number(current?.expectedClosingBalance ?? 0).toFixed(2),
                    )}{" "}
                    EGP
                  </b>
                </div>
                <div className="mt-1 flex justify-between">
                  <span className="text-muted-foreground">
                    {ui("مبيعات نقدية")}
                  </span>
                  <b className="nums">
                    {toArabicDigits(Number(current?.totalCash ?? 0).toFixed(2))}{" "}
                    EGP
                  </b>
                </div>
              </div>
              <div className="grid gap-2">
                <Label className="font-bold">
                  {ui("إجمالي النقدية الفعلية بعد العد")}
                </Label>
                <div className="relative">
                  <Input
                    className="nums h-12 pe-16 text-base font-black"
                    type="number"
                    min={0}
                    step="0.01"
                    value={closingBalance}
                    onChange={(event) => updateClosing(event.target.value)}
                  />
                  <span className="pointer-events-none absolute end-4 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">
                    EGP
                  </span>
                </div>
              </div>
              {handoverShortage > 0.01 ? (
                <div className="grid gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <Label className="font-bold text-destructive">{ui("سبب عجز النقدية")}</Label>
                    <b className="nums text-sm text-destructive">
                      -{toArabicDigits(handoverShortage.toFixed(2))} EGP
                    </b>
                  </div>
                  <Textarea
                    rows={3}
                    value={shortageReason}
                    onChange={(event) => setShortageReason(event.target.value)}
                    placeholder={ui("اكتب سبب العجز ليظهر في سجل الخزينة")}
                  />
                  <p className="text-xs text-destructive">{ui("لن يتم تسليم الدرج قبل كتابة السبب.")}</p>
                </div>
              ) : null}
              <div className="space-y-2.5">
                <div className="rounded-xl border border-sky-200 bg-sky-50/80 p-3 dark:border-sky-400/20 dark:bg-sky-400/10">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <Label className="font-bold text-sky-950 dark:text-sky-100">
                        {ui("المبلغ المسلم للشيفت التالي")}
                      </Label>
                      <p className="mt-0.5 text-[11px] text-sky-800/70 dark:text-sky-100/65">
                        {ui("يصبح رصيد افتتاح الوردية الجديدة")}
                      </p>
                    </div>
                    <ArrowLeftRight className="size-5 text-sky-600" />
                  </div>
                  <div className="relative mt-2">
                    <Input
                      className="nums h-11 border-sky-200 bg-background pe-16 font-black dark:border-sky-400/20"
                      type="number"
                      min={0}
                      max={Number(closingBalance) || 0}
                      step="0.01"
                      value={transferAmount}
                      onChange={(event) => updateTransfer(event.target.value)}
                    />
                    <span className="pointer-events-none absolute end-4 top-1/2 -translate-y-1/2 text-xs font-bold text-sky-700">
                      EGP
                    </span>
                  </div>
                </div>
                <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-3 dark:border-amber-400/20 dark:bg-amber-400/10">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <Label className="font-bold text-amber-950 dark:text-amber-100">
                        {ui("المبلغ المسحوب للخزنة")}
                      </Label>
                      <p className="mt-0.5 text-[11px] text-amber-800/70 dark:text-amber-100/65">
                        {ui("يُسجل كتوريد نقدي خارج الدرج")}
                      </p>
                    </div>
                    <Banknote className="size-5 text-amber-600" />
                  </div>
                  <div className="relative mt-2">
                    <Input
                      className="nums h-11 border-amber-200 bg-background pe-16 font-black dark:border-amber-400/20"
                      type="number"
                      min={0}
                      max={Number(closingBalance) || 0}
                      step="0.01"
                      value={cashDropAmount}
                      onChange={(event) => updateCashDrop(event.target.value)}
                    />
                    <span className="pointer-events-none absolute end-4 top-1/2 -translate-y-1/2 text-xs font-bold text-amber-700">
                      EGP
                    </span>
                  </div>
                </div>
                <div className="flex items-center justify-between rounded-xl bg-background px-3 py-2 text-xs ring-1 ring-border">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <ShieldCheck className="size-4 text-emerald-600" />
                    {ui("التوزيع متوازن تلقائياً")}
                  </span>
                  <b className="nums">
                    {toArabicDigits(Number(transferAmount || 0).toFixed(2))} +{" "}
                    {toArabicDigits(Number(cashDropAmount || 0).toFixed(2))} ={" "}
                    {toArabicDigits(Number(closingBalance || 0).toFixed(2))} EGP
                  </b>
                </div>
              </div>
            </section>

            <section className="space-y-4 rounded-2xl border p-4">
              <div className="flex items-center gap-2 font-bold">
                <span className="flex size-7 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">
                  ٢
                </span>
                <LockKeyhole className="size-4 text-primary" />
                {ui("تسجيل دخول المسؤول الجديد")}
              </div>
              <div>
                <Label className="font-bold">{ui("الوردية القادمة")}</Label>
                <select
                  className="mt-1.5 h-12 w-full rounded-xl border bg-background px-3 text-sm font-semibold shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
                  value={targetShiftId}
                  disabled={!nextShiftOptions.length}
                  onChange={(event) => {
                    const value = event.target.value;
                    setTargetShiftId(value);
                    const selected = nextShiftOptions.find(
                      (shift) => String(shift.id) === value,
                    );
                    if (selected?.responsibleUser?.username)
                      setUsername(selected.responsibleUser.username);
                  }}
                >
                  {!nextShiftOptions.length ? (
                    <option value="">
                      {ui("لا توجد وردية أخرى نشطة لهذا الفرع")}
                    </option>
                  ) : null}
                  {nextShiftOptions.map((shift) => (
                    <option key={shift.id} value={shift.id}>
                      {shift.shiftName} · {formatTime(shift.startTime)}–
                      {formatTime(shift.endTime)}
                    </option>
                  ))}
                </select>
                {!nextShiftOptions.length ? (
                  <p className="mt-1.5 text-xs text-amber-700 dark:text-amber-300">
                    {ui("أضف أو فعّل وردية أخرى من شاشة إدارة الورديات أولًا.")}
                  </p>
                ) : null}
              </div>
              <div className="rounded-2xl border bg-muted/20 p-3.5">
                <div className="mb-3">
                  <p className="font-bold">{ui("بيانات المستخدم المستلم")}</p>
                  <p className="text-xs text-muted-foreground">
                    {ui(
                      "أدخل حساب الموظف الذي سيُسجل باسمه كل بيع بعد التبديل.",
                    )}
                  </p>
                </div>
                <div>
                  <Label>{ui("اسم المستخدم")}</Label>
                  <div className="relative mt-1.5">
                    <UserRound className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      className="h-11 ps-10"
                      autoComplete="username"
                      placeholder={ui("اسم مستخدم مسؤول الوردية")}
                      value={username}
                      onChange={(event) => setUsername(event.target.value)}
                    />
                  </div>
                </div>
                <div className="mt-3">
                  <Label>{ui("كلمة السر")}</Label>
                  <div className="relative mt-1.5">
                    <LockKeyhole className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      className="h-11 ps-10 pe-11"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      placeholder={ui("كلمة سر المستخدم الجديد")}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") void submit();
                      }}
                    />
                    <button
                      type="button"
                      className="absolute end-2 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                      onClick={() => setShowPassword((value) => !value)}
                      aria-label={
                        showPassword
                          ? ui("إخفاء كلمة السر")
                          : ui("إظهار كلمة السر")
                      }
                    >
                      {showPassword ? (
                        <EyeOff className="size-4" />
                      ) : (
                        <Eye className="size-4" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
              <div>
                <Label>{ui("ملاحظات التسليم")}</Label>
                <Input
                  className="mt-1.5 h-11"
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder={ui("اختياري: فرق نقدية، عهدة معلقة…")}
                />
              </div>
              <p className="flex items-start gap-2 rounded-xl bg-emerald-50 px-3 py-2.5 text-xs text-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-200">
                <ShieldCheck className="mt-0.5 size-4 shrink-0" />
                {ui(
                  "سيتم التحقق من المستخدم وتسجيل كل العمليات التالية باسمه بدون تسجيل خروج أو فقدان الطلب الحالي.",
                )}
              </p>
            </section>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {ui("إلغاء")}
            </Button>
            <Button
              permissionAction="update"
              onClick={() => void submit()}
              disabled={
                saving ||
                !targetShiftId ||
                !username.trim() ||
                !password ||
                (handoverShortage > 0.01 && !shortageReason.trim())
              }
            >
              {saving
                ? ui("جاري التبديل…")
                : ui("اعتماد التسليم وتبديل المستخدم")}
            </Button>
          </DialogFooter>
            </TabsContent>

            {canViewWaste && branchId && current?.id ? (
              <TabsContent value="waste" className="mt-4">
                <ShiftWastePanel
                  branchId={Number(branchId)}
                  shiftSessionId={current.id}
                  records={shiftWasteQuery.data?.data ?? []}
                  isLoading={shiftWasteQuery.isLoading}
                  isError={shiftWasteQuery.isError}
                  error={shiftWasteQuery.error}
                  canCreate={canCreateWaste}
                  onRetry={() => void shiftWasteQuery.refetch()}
                  onReturnToHandover={() => setHandoverTab('handover')}
                />
              </TabsContent>
            ) : null}
          </Tabs>
        </DialogContent>
      </Dialog>
    </>
  );
}
