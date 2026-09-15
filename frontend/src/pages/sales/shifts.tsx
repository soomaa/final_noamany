import type { ColumnDef } from "@tanstack/react-table";
import {
  AlertTriangle,
  ArrowLeftRight,
  Banknote,
  BarChart3,
  CheckCircle2,
  Clock3,
  Lightbulb,
  Pencil,
  Play,
  Plus,
  ReceiptText,
  Square,
  Trash2,
  UserRound,
  WalletCards,
  Users,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { DataTable } from "@/components/common/data-table";
import { Time12Input } from "@/components/common/time-12-input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useBranches } from "@/hooks/use-branches";
import { useCurrentShiftSession } from "@/hooks/use-shift-session";
import { usePermission } from "@/hooks/use-permission";
import { api, apiError } from "@/lib/api";
import { formatDateTime, formatTime, localToday } from "@/lib/formatters";
import { confirm, confirmWithPreview } from "@/lib/confirm";
import { isDryRunResponse } from "@/lib/validators";
import { clientPaginate, useMutationWithToast } from "@/lib/api-hooks";
import { useListQuery } from "@/lib/use-list-query";
import { formatDigits, toArabicDigits } from "@/lib/utils";
import { useLocale } from "@/store/locale";
import { GymSalesPageShell } from "../gym-sales/shell";
import { indexColumn } from "../inventory/simple-crud-tab";

interface ShiftRow {
  id: number;
  shiftName: string;
  startTime: string;
  endTime: string;
  branchId: number | null;
  isActive: boolean;
  color: string;
  responsibleUserId: number | null;
  isLastShiftOfDay: boolean;
  responsibleUser?: {
    id: number;
    name: string | null;
    username: string | null;
  } | null;
}

interface EligibleUser {
  id: number;
  name: string | null;
  username: string | null;
  jobTitle: string | null;
  department: string | null;
}

interface ShiftSessionRow {
  id: number;
  shiftId: number;
  branchId: number | null;
  status: string;
  openingBalance: number;
  totalSales: number;
  totalCash: number;
  transactionsCount: number;
  expectedClosingBalance: number | null;
  closingBalance: number | null;
  cashDifference: number | null;
  shortageReason?: string | null;
  cashDropAmount: number;
  retainedAmount: number;
  shift?: { shiftName: string };
}

interface ShiftReport {
  summary: {
    sessionsCount: number;
    openSessionsCount: number;
    totalSales: number;
    totalTransactions: number;
    averageTransaction: number;
    totalCash: number;
    totalCard: number;
    totalWallet: number;
    totalTransfer: number;
    totalDiscount: number;
    totalTax: number;
    totalCashDifference: number;
    cashDropAmount: number;
    custodyIssued: number;
    custodyReturned: number;
    pettyExpenses: number;
    mismatchRate: number;
  };
  insights: string[];
  rows: Array<
    ShiftSessionRow & {
      userId: number;
      sessionDate: string;
      startTime: string;
      endTime: string | null;
      user: {
        user_id: number;
        name: string | null;
        username: string | null;
      } | null;
      movements: Record<string, number>;
    }
  >;
}

const SHIFT_TIME_PRESETS = [
  { label: "صباحية", startTime: "08:00:00", endTime: "16:00:00" },
  { label: "مسائية", startTime: "16:00:00", endTime: "00:00:00" },
  { label: "ليلية", startTime: "00:00:00", endTime: "08:00:00" },
] as const;

export function SalesShiftsPage() {
  const { ui, locale } = useLocale();
  const { can } = usePermission();
  const canCreate = can("gym-sales.sales.shifts:create");
  const canUpdate = can("gym-sales.sales.shifts:update");
  const canDelete = can("gym-sales.sales.shifts:delete");
  const queryClient = useQueryClient();
  const { data: branches } = useBranches();
  const [branchFilter, setBranchFilter] = useState("");
  const effectiveBranch = branchFilter || String(branches?.[0]?.id ?? "");
  const today = localToday();
  const [activeTab, setActiveTab] = useState("operations");
  const [reportFilters, setReportFilters] = useState({
    dateFrom: `${today.slice(0, 8)}01`,
    dateTo: today,
    shiftId: "",
    userId: "",
    status: "all",
    difference: "all",
  });

  const { params, setParams } = useListQuery();
  const {
    data: branchShifts = [],
    isLoading: shiftsLoading,
    isError: shiftsError,
    refetch: refetchShifts,
  } = useQuery({
    queryKey: ["shifts", effectiveBranch],
    queryFn: async () => {
      const { data } = await api.get<ShiftRow[]>("/shifts", {
        params: { branchId: effectiveBranch, isActive: true },
      });
      return Array.isArray(data) ? data : [];
    },
    enabled: !!effectiveBranch,
  });
  const shifts = useMemo(
    () => clientPaginate(branchShifts, params),
    [branchShifts, params],
  );
  const shiftOptions = useMemo(
    () => branchShifts.filter((s) => s.isActive),
    [branchShifts],
  );
  const { data: eligibleUsers = [] } = useQuery({
    queryKey: ["shifts", "eligible-users", effectiveBranch],
    queryFn: async () =>
      (
        await api.get<EligibleUser[]>("/shifts/eligible-users", {
          params: { branchId: effectiveBranch },
        })
      ).data,
    enabled: !!effectiveBranch,
  });
  const { data: currentSession } = useCurrentShiftSession(effectiveBranch);
  const currentResponsible = useMemo(
    () =>
      eligibleUsers.find(
        (candidate) => candidate.id === currentSession?.userId,
      ),
    [eligibleUsers, currentSession?.userId],
  );
  const {
    data: report,
    isLoading: reportLoading,
    isError: reportError,
    refetch: refetchReport,
  } = useQuery({
    queryKey: ["shift-sessions", "report", effectiveBranch, reportFilters],
    queryFn: async () =>
      (
        await api.get<ShiftReport>("/shift-sessions/report", {
          params: { branchId: effectiveBranch, ...reportFilters },
        })
      ).data,
    enabled: !!effectiveBranch && activeTab === "reports",
  });

  const [shiftOpen, setShiftOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingShiftId, setEditingShiftId] = useState<number | null>(null);
  const [startShiftId, setStartShiftId] = useState("");
  const [openingBalance, setOpeningBalance] = useState("0");
  const [closeId, setCloseId] = useState<number | null>(null);
  const [closingBalance, setClosingBalance] = useState("");
  const [cashDropAmount, setCashDropAmount] = useState("0");
  const [retainedAmount, setRetainedAmount] = useState("0");
  const [expectedClosingForClose, setExpectedClosingForClose] = useState(0);
  const [closingShortageReason, setClosingShortageReason] = useState("");
  const [newShift, setNewShift] = useState({
    shiftName: "",
    startTime: "08:00:00",
    endTime: "16:00:00",
    branchId: "",
    color: "#3b82f6",
    responsibleUserId: "",
    isLastShiftOfDay: false,
  });
  const [startingSession, setStartingSession] = useState(false);
  const [closingSession, setClosingSession] = useState(false);
  const [creatingShift, setCreatingShift] = useState(false);

  const prepareCloseSession = (session: {
    id: number;
    openingBalance: number;
    totalCash: number;
    expectedClosingBalance: number | null;
  }) => {
    if (!canUpdate) return;
    const expected =
      session.expectedClosingBalance ??
      session.totalCash + session.openingBalance;
    setCloseId(session.id);
    setExpectedClosingForClose(expected);
    setClosingBalance(String(expected));
    setRetainedAmount(String(session.openingBalance));
    setCashDropAmount(String(Math.max(0, expected - session.openingBalance)));
    setClosingShortageReason("");
  };
  const closingShortage = Math.max(
    0,
    expectedClosingForClose - (Number(closingBalance) || 0),
  );

  const deleteMutation = useMutationWithToast(
    (id: number) => api.delete(`/shifts/${id}`),
    { success: ui("تم حذف قالب الوردية"), invalidate: ["shifts"] },
  );

  const deleteShiftTemplate = async (shift: ShiftRow) => {
    if (!canDelete) return;
    const accepted = await confirm({
      title: ui(`حذف قالب «${shift.shiftName}»؟`),
      description: ui(
        "سيختفي القالب من قائمة الورديات ولن يمكن فتح جلسات جديدة منه. سجلات الورديات والمبيعات السابقة ستظل محفوظة.",
      ),
      confirmLabel: ui("حذف القالب"),
      cancelLabel: ui("إلغاء"),
      variant: "destructive",
    });
    if (!accepted) return;
    deleteMutation.mutate(shift.id);
  };

  const shiftColumns = useMemo<ColumnDef<ShiftRow>[]>(
    () => [
      indexColumn(params.page, params.pageSize) as ColumnDef<ShiftRow>,
      {
        accessorKey: "shiftName",
        header: ui("اسم الوردية"),
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <span>{row.original.shiftName}</span>
            {row.original.isLastShiftOfDay ? (
              <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                {ui("آخر وردية")}
              </Badge>
            ) : null}
          </div>
        ),
      },
      {
        accessorKey: "responsibleUser.name",
        header: ui("المسؤول الأساسي"),
        cell: ({ row }) => row.original.responsibleUser?.name ?? ui("غير محدد"),
      },
      {
        accessorKey: "startTime",
        header: ui("من"),
        cell: ({ getValue }) => (
          <span className="nums">{formatTime(getValue() as string)}</span>
        ),
      },
      {
        accessorKey: "endTime",
        header: ui("إلى"),
        cell: ({ getValue }) => (
          <span className="nums">{formatTime(getValue() as string)}</span>
        ),
      },
      {
        id: "actions",
        header: ui("إجراء"),
        cell: ({ row }) => !canUpdate && !canDelete ? null : (
          <div className="flex items-center gap-1">
            {canUpdate ? <Button
              permissionAction="update"
              variant="ghost"
              size="sm"
              onClick={() => {
                const shift = row.original;
                setEditingShiftId(shift.id);
                setNewShift({
                  shiftName: shift.shiftName,
                  startTime: shift.startTime,
                  endTime: shift.endTime,
                  branchId: String(shift.branchId ?? effectiveBranch),
                  color: shift.color,
                  responsibleUserId: String(shift.responsibleUserId ?? ""),
                  isLastShiftOfDay: shift.isLastShiftOfDay,
                });
                setCreateOpen(true);
              }}
            >
              <Pencil className="ms-1 h-3 w-3" />
              {ui("تعديل")}
            </Button> : null}
            {canDelete ? <Button
              permissionAction="delete"
              variant="ghost"
              size="sm"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              disabled={deleteMutation.isPending}
              onClick={() => void deleteShiftTemplate(row.original)}
            >
              <Trash2 className="ms-1 size-3.5" />
              {ui("حذف")}
            </Button> : null}
          </div>
        ),
      },
    ],
    [canDelete, canUpdate, deleteMutation, effectiveBranch, params.page, params.pageSize, ui],
  );

  const startSession = async () => {
    if (!canCreate || !startShiftId || !effectiveBranch || startingSession) return;
    setStartingSession(true);
    try {
      await api.post("/shift-sessions/start", {
        shiftId: Number(startShiftId),
        branchId: Number(effectiveBranch),
        openingBalance: Number(openingBalance) || 0,
      });
      toast.success(ui("تم فتح الوردية"));
      setShiftOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["shift-sessions"] });
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setStartingSession(false);
    }
  };

  const closeSession = async () => {
    if (!canUpdate || !closeId || closingSession) return;
    if (
      Math.abs(
        Number(cashDropAmount) +
          Number(retainedAmount) -
          Number(closingBalance),
      ) > 0.01
    ) {
      toast.error(
        ui("التوريد للخزنة والمتبقي في الدرج يجب أن يساويا الرصيد الفعلي"),
      );
      return;
    }
    if (closingShortage > 0.01 && !closingShortageReason.trim()) {
      toast.error(ui("اكتب سبب عجز النقدية قبل اعتماد إغلاق اليوم"));
      return;
    }
    setClosingSession(true);
    try {
      await confirmWithPreview(
        {
          title: ui("إغلاق اليوم"),
          description: ui(
            "هذه الخطوة لنهاية اليوم فقط، وليست لتسليم وردية إلى وردية",
          ),
          confirmLabel: ui("اعتماد إغلاق اليوم"),
        },
        async () => {
          const { data } = await api.put(
            `/shift-sessions/${closeId}/close?dryRun=true`,
            {
              closingBalance: Number(closingBalance),
              cashDropAmount: Number(cashDropAmount),
              retainedAmount: Number(retainedAmount),
              shortageReason: closingShortageReason.trim() || undefined,
            },
          );
          if (!isDryRunResponse(data))
            throw new Error(ui("تعذّر تحميل المعاينة"));
          return {
            rows: (data.rows ?? []) as {
              label: string;
              before?: string;
              after?: string;
            }[],
            warning: data.warning,
          };
        },
        async () => {
          await api.put(`/shift-sessions/${closeId}/close`, {
            closingBalance: Number(closingBalance),
            cashDropAmount: Number(cashDropAmount),
            retainedAmount: Number(retainedAmount),
            shortageReason: closingShortageReason.trim() || undefined,
          });
          toast.success(ui("تم إغلاق اليوم وتسجيل التوريد في سجل الدرج"));
          setCloseId(null);
          await queryClient.invalidateQueries({ queryKey: ["shift-sessions"] });
        },
      );
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setClosingSession(false);
    }
  };

  const createShift = async () => {
    if ((editingShiftId ? !canUpdate : !canCreate) || creatingShift) return;
    setCreatingShift(true);
    try {
      const payload = {
        shiftName: newShift.shiftName,
        startTime: newShift.startTime,
        endTime: newShift.endTime,
        branchId: newShift.branchId
          ? Number(newShift.branchId)
          : Number(effectiveBranch),
        responsibleUserId: newShift.responsibleUserId
          ? Number(newShift.responsibleUserId)
          : null,
        isLastShiftOfDay: newShift.isLastShiftOfDay,
        color: newShift.color,
      };
      if (editingShiftId) await api.put(`/shifts/${editingShiftId}`, payload);
      else await api.post("/shifts", payload);
      toast.success(
        ui(editingShiftId ? "تم تعديل الوردية" : "تم إنشاء الوردية"),
      );
      setCreateOpen(false);
      setEditingShiftId(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["shifts"] }),
        queryClient.invalidateQueries({ queryKey: ["shift-sessions"] }),
      ]);
      void refetchShifts();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setCreatingShift(false);
    }
  };

  return (
    <GymSalesPageShell
      section="sales"
      title={ui("الورديات")}
      description={ui(
        "تشغيل وتسليم الورديات ومراجعة الأداء وفروق الجرد من مكان واحد",
      )}
      actions={
        <div className="flex gap-2">
          {canCreate ? <Button
            permissionAction="create"
            variant="outline"
            onClick={() => {
              setEditingShiftId(null);
              setNewShift({
                shiftName: "",
                startTime: "08:00:00",
                endTime: "16:00:00",
                branchId: effectiveBranch,
                color: "#3b82f6",
                responsibleUserId: "",
                isLastShiftOfDay: false,
              });
              setCreateOpen(true);
            }}
          >
            <Plus className="ms-1 h-4 w-4" />
            {ui("وردية جديدة")}
          </Button> : null}
          {canCreate ? <Button
            permissionAction="create"
            onClick={() => setShiftOpen(true)}
            disabled={!!currentSession}
          >
            <Play className="ms-1 h-4 w-4" />
            {ui("فتح جلسة")}
          </Button> : null}
        </div>
      }
    >
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-muted/20 p-3">
          <TabsList className="h-11">
            <TabsTrigger value="operations" className="gap-2">
              <Users className="size-4" />
              {ui("تشغيل الورديات")}
            </TabsTrigger>
            <TabsTrigger value="reports" className="gap-2">
              <BarChart3 className="size-4" />
              {ui("تقارير الورديات")}
            </TabsTrigger>
          </TabsList>
          <div className="flex items-center gap-2">
            <Label>{ui("الفرع")}</Label>
            <select
              className="rounded-md border bg-background px-3 py-2 text-sm"
              value={effectiveBranch}
              onChange={(e) => setBranchFilter(e.target.value)}
            >
              {(branches ?? []).map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <TabsContent value="operations" className="mt-0">
          {currentSession ? (
            <section className="mb-6 overflow-hidden rounded-3xl border border-emerald-300 bg-gradient-to-l from-emerald-50 via-background to-background shadow-sm dark:border-emerald-800 dark:from-emerald-950/35">
              <div className="flex flex-col gap-5 p-5 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex min-w-0 items-start gap-4">
                  <span className="relative grid size-14 shrink-0 place-items-center rounded-2xl bg-emerald-600 text-white shadow-lg shadow-emerald-600/20">
                    <Clock3 className="size-6" />
                    <span className="absolute -end-1 -top-1 size-3 rounded-full border-2 border-background bg-emerald-400">
                      <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400 opacity-60" />
                    </span>
                  </span>
                  <div className="min-w-0">
                    <div className="mb-1.5 flex flex-wrap items-center gap-2">
                      <Badge className="gap-1 bg-emerald-600 hover:bg-emerald-600">
                        <CheckCircle2 className="size-3" />
                        {ui("مفتوحة الآن")}
                      </Badge>
                      <span className="text-xs font-medium text-muted-foreground">
                        #{formatDigits(currentSession.id, locale)}
                      </span>
                    </div>
                    <p className="text-xs font-bold text-emerald-700 dark:text-emerald-300">
                      {ui("الوردية الحالية")}
                    </p>
                    <h2 className="mt-0.5 truncate text-2xl font-black text-foreground">
                      {currentSession.shift?.shiftName ?? ui("وردية بدون اسم")}
                    </h2>
                    <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <UserRound className="size-4 text-primary" />
                        <b className="text-foreground">
                          {ui("المسؤول الحالي")}:
                        </b>{" "}
                        {currentResponsible?.name ||
                          currentResponsible?.username ||
                          `#${formatDigits(currentSession.userId, locale)}`}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Clock3 className="size-4 text-primary" />
                        <b className="text-foreground">
                          {ui("وقت الوردية")}:
                        </b>{" "}
                        <span className="nums">
                          {formatTime(currentSession.shift?.startTime, locale)}{" "}
                          — {formatTime(currentSession.shift?.endTime, locale)}
                        </span>
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex shrink-0 flex-col gap-2 sm:flex-row lg:flex-col xl:flex-row">
                  {canUpdate ? <Button
                    permissionAction="update"
                    type="button"
                    size="lg"
                    className="h-12 gap-2 rounded-xl px-5 shadow-md"
                    onClick={() =>
                      window.dispatchEvent(
                        new CustomEvent("noamany:open-shift-switcher"),
                      )
                    }
                  >
                    <ArrowLeftRight className="size-5" />
                    {ui("تسليم وتبديل الشيفت")}
                  </Button> : null}
                  {canUpdate ? <Button
                    permissionAction="update"
                    type="button"
                    size="lg"
                    variant="outline"
                    className="h-12 gap-2 rounded-xl border-amber-300 bg-amber-50 px-5 text-amber-900 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950/25 dark:text-amber-100 dark:hover:bg-amber-950/40"
                    onClick={() => prepareCloseSession(currentSession)}
                  >
                    <Square className="size-4" />
                    {ui("إغلاق اليوم")}
                  </Button> : null}
                </div>
              </div>

              <div className="grid border-t border-emerald-200/80 bg-background/70 sm:grid-cols-2 xl:grid-cols-5 dark:border-emerald-900">
                <div className="flex items-center gap-3 border-b p-4 sm:border-e xl:border-b-0">
                  <span className="grid size-10 place-items-center rounded-xl bg-sky-100 text-sky-700 dark:bg-sky-950/50">
                    <Clock3 className="size-4" />
                  </span>
                  <div>
                    <p className="text-xs text-muted-foreground">
                      {ui("بدأت الجلسة")}
                    </p>
                    <p className="nums mt-0.5 font-black">
                      {formatDateTime(currentSession.startTime, locale)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 border-b p-4 xl:border-b-0 xl:border-e">
                  <span className="grid size-10 place-items-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50">
                    <Banknote className="size-4" />
                  </span>
                  <div>
                    <p className="text-xs text-muted-foreground">
                      {ui("مبيعات الوردية")}
                    </p>
                    <p className="nums mt-0.5 font-black text-emerald-700">
                      {formatDigits(
                        currentSession.totalSales.toFixed(2),
                        locale,
                      )}{" "}
                      EGP
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 border-b p-4 sm:border-e xl:border-b-0">
                  <span className="grid size-10 place-items-center rounded-xl bg-violet-100 text-violet-700 dark:bg-violet-950/50">
                    <ReceiptText className="size-4" />
                  </span>
                  <div>
                    <p className="text-xs text-muted-foreground">
                      {ui("طلبات مكتملة")}
                    </p>
                    <p className="nums mt-0.5 font-black">
                      {formatDigits(currentSession.transactionsCount, locale)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 border-b p-4 xl:border-b-0 xl:border-e">
                  <span className="grid size-10 place-items-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-950/50">
                    <WalletCards className="size-4" />
                  </span>
                  <div>
                    <p className="text-xs text-muted-foreground">
                      {ui("مبيعات نقدية")}
                    </p>
                    <p className="nums mt-0.5 font-black">
                      {formatDigits(
                        currentSession.totalCash.toFixed(2),
                        locale,
                      )}{" "}
                      EGP
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-4 sm:col-span-2 xl:col-span-1">
                  <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
                    <WalletCards className="size-4" />
                  </span>
                  <div>
                    <p className="text-xs text-muted-foreground">
                      {ui("المتوقع في الدرج")}
                    </p>
                    <p className="nums mt-0.5 font-black">
                      {formatDigits(
                        Number(
                          currentSession.expectedClosingBalance ?? 0,
                        ).toFixed(2),
                        locale,
                      )}{" "}
                      EGP
                    </p>
                  </div>
                </div>
              </div>
            </section>
          ) : (
            <section className="mb-6 flex flex-col gap-4 rounded-3xl border border-amber-300 bg-amber-50/70 p-5 sm:flex-row sm:items-center sm:justify-between dark:border-amber-800 dark:bg-amber-950/20">
              <div className="flex items-center gap-3">
                <span className="grid size-12 place-items-center rounded-2xl bg-amber-100 text-amber-700 dark:bg-amber-900/40">
                  <AlertTriangle className="size-5" />
                </span>
                <div>
                  <h3 className="font-black">{ui("لا توجد وردية مفتوحة")}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {ui(
                      "افتح جلسة لبدء تسجيل المبيعات وحركات الدرج على المسؤول الحالي.",
                    )}
                  </p>
                </div>
              </div>
              {canCreate ? <Button permissionAction="create" onClick={() => setShiftOpen(true)}>
                <Play className="ms-1 size-4" />
                {ui("فتح جلسة الآن")}
              </Button> : null}
            </section>
          )}

          <div className="mb-2 mt-6 flex items-end justify-between gap-3">
            <div>
              <h3 className="font-semibold">{ui("قوالب الورديات")}</h3>
              <p className="text-xs text-muted-foreground">
                {ui(
                  "المسؤولون يظهرون من الموظفين المرتبطين بمسمى وظيفي إدارة الكافيه، مع السماح لمدير النظام للطوارئ.",
                )}
              </p>
            </div>
          </div>
          <DataTable
            columns={shiftColumns}
            data={shifts?.data ?? []}
            total={shifts?.total ?? 0}
            page={params.page}
            pageSize={params.pageSize}
            onPageChange={(page) => setParams({ page })}
            isLoading={shiftsLoading}
            isError={shiftsError}
            onRetry={() => void refetchShifts()}
          />
        </TabsContent>

        <TabsContent value="reports" className="mt-0 space-y-5">
          <section className="rounded-2xl border bg-card p-4">
            <div className="mb-3">
              <h3 className="font-bold">{ui("فلاتر التقرير")}</h3>
              <p className="text-xs text-muted-foreground">
                {ui("قارن المسؤولين والورديات وفروق الجرد خلال أي فترة.")}
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
              <div>
                <Label className="text-xs">{ui("من تاريخ")}</Label>
                <Input
                  className="nums mt-1"
                  type="date"
                  value={reportFilters.dateFrom}
                  onChange={(event) =>
                    setReportFilters((value) => ({
                      ...value,
                      dateFrom: event.target.value,
                    }))
                  }
                />
              </div>
              <div>
                <Label className="text-xs">{ui("إلى تاريخ")}</Label>
                <Input
                  className="nums mt-1"
                  type="date"
                  value={reportFilters.dateTo}
                  onChange={(event) =>
                    setReportFilters((value) => ({
                      ...value,
                      dateTo: event.target.value,
                    }))
                  }
                />
              </div>
              <div>
                <Label className="text-xs">{ui("الوردية")}</Label>
                <select
                  className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={reportFilters.shiftId}
                  onChange={(event) =>
                    setReportFilters((value) => ({
                      ...value,
                      shiftId: event.target.value,
                    }))
                  }
                >
                  <option value="">{ui("كل الورديات")}</option>
                  {shiftOptions.map((shift) => (
                    <option key={shift.id} value={shift.id}>
                      {shift.shiftName}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label className="text-xs">{ui("المسؤول")}</Label>
                <select
                  className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={reportFilters.userId}
                  onChange={(event) =>
                    setReportFilters((value) => ({
                      ...value,
                      userId: event.target.value,
                    }))
                  }
                >
                  <option value="">{ui("كل المسؤولين")}</option>
                  {eligibleUsers.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {candidate.name || candidate.username}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label className="text-xs">{ui("الحالة")}</Label>
                <select
                  className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={reportFilters.status}
                  onChange={(event) =>
                    setReportFilters((value) => ({
                      ...value,
                      status: event.target.value,
                    }))
                  }
                >
                  <option value="all">{ui("الكل")}</option>
                  <option value="open">{ui("مفتوحة")}</option>
                  <option value="closed">{ui("مغلقة")}</option>
                  <option value="auto_closed">{ui("مغلقة تلقائياً")}</option>
                </select>
              </div>
              <div>
                <Label className="text-xs">{ui("فرق الجرد")}</Label>
                <select
                  className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={reportFilters.difference}
                  onChange={(event) =>
                    setReportFilters((value) => ({
                      ...value,
                      difference: event.target.value,
                    }))
                  }
                >
                  <option value="all">{ui("الكل")}</option>
                  <option value="balanced">{ui("متطابق")}</option>
                  <option value="shortage">{ui("عجز")}</option>
                  <option value="surplus">{ui("زيادة")}</option>
                </select>
              </div>
            </div>
          </section>

          {reportError ? (
            <div className="flex items-center justify-between rounded-xl border border-destructive/30 bg-destructive/5 p-4">
              <span>{ui("تعذر تحميل تقرير الورديات")}</span>
              <Button variant="outline" onClick={() => void refetchReport()}>
                {ui("إعادة المحاولة")}
              </Button>
            </div>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              {
                label: ui("إجمالي المبيعات"),
                value: report?.summary.totalSales ?? 0,
                icon: Banknote,
                tone: "text-emerald-600",
              },
              {
                label: ui("عدد الجلسات"),
                value: report?.summary.sessionsCount ?? 0,
                icon: Users,
                tone: "text-primary",
                money: false,
              },
              {
                label: ui("متوسط الفاتورة"),
                value: report?.summary.averageTransaction ?? 0,
                icon: BarChart3,
                tone: "text-sky-600",
              },
              {
                label: ui("صافي فرق الجرد"),
                value: report?.summary.totalCashDifference ?? 0,
                icon: AlertTriangle,
                tone:
                  (report?.summary.totalCashDifference ?? 0) < 0
                    ? "text-destructive"
                    : "text-emerald-600",
              },
            ].map((card) => (
              <Card key={card.label}>
                <CardContent className="flex items-center gap-3 p-4">
                  <span className="grid size-10 place-items-center rounded-xl bg-muted">
                    <card.icon className={`size-5 ${card.tone}`} />
                  </span>
                  <div>
                    <p className="text-xs text-muted-foreground">
                      {card.label}
                    </p>
                    <b className={`nums text-xl ${card.tone}`}>
                      {reportLoading
                        ? "…"
                        : toArabicDigits(
                            card.value.toFixed(card.money === false ? 0 : 2),
                          )}
                      {card.money === false ? "" : " EGP"}
                    </b>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid gap-5 xl:grid-cols-[1.1fr_.9fr]">
            <section className="overflow-hidden rounded-2xl border">
              <div className="border-b bg-muted/30 px-4 py-3 font-bold">
                {ui("تفصيل التحصيل والحركات")}
              </div>
              <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-3">
                <div className="bg-card p-4">
                  <span className="text-xs text-muted-foreground">
                    {ui("نقدي")}
                  </span>
                  <b className="nums mt-1 block">
                    {toArabicDigits(
                      (report?.summary.totalCash ?? 0).toFixed(2),
                    )}
                  </b>
                </div>
                <div className="bg-card p-4">
                  <span className="text-xs text-muted-foreground">
                    {ui("بطاقات")}
                  </span>
                  <b className="nums mt-1 block">
                    {toArabicDigits(
                      (report?.summary.totalCard ?? 0).toFixed(2),
                    )}
                  </b>
                </div>
                <div className="bg-card p-4">
                  <span className="text-xs text-muted-foreground">
                    {ui("محفظة")}
                  </span>
                  <b className="nums mt-1 block">
                    {toArabicDigits(
                      (report?.summary.totalWallet ?? 0).toFixed(2),
                    )}
                  </b>
                </div>
                <div className="bg-card p-4">
                  <span className="text-xs text-muted-foreground">
                    {ui("تحويل بنكي")}
                  </span>
                  <b className="nums mt-1 block">
                    {toArabicDigits(
                      (report?.summary.totalTransfer ?? 0).toFixed(2),
                    )}
                  </b>
                </div>
                <div className="bg-card p-4">
                  <span className="text-xs text-muted-foreground">
                    {ui("مصروفات")}
                  </span>
                  <b className="nums mt-1 block text-rose-600">
                    {toArabicDigits(
                      (report?.summary.pettyExpenses ?? 0).toFixed(2),
                    )}
                  </b>
                </div>
                <div className="bg-card p-4">
                  <span className="text-xs text-muted-foreground">
                    {ui("توريد للخزنة")}
                  </span>
                  <b className="nums mt-1 block text-amber-600">
                    {toArabicDigits(
                      (report?.summary.cashDropAmount ?? 0).toFixed(2),
                    )}
                  </b>
                </div>
              </div>
            </section>
            <section className="rounded-2xl border bg-sky-50/50 p-4 dark:bg-sky-950/10">
              <div className="mb-3 flex items-center gap-2">
                <span className="grid size-9 place-items-center rounded-xl bg-sky-100 text-sky-700">
                  <Lightbulb className="size-4" />
                </span>
                <div>
                  <h3 className="font-bold">{ui("رؤى تشغيلية")}</h3>
                  <p className="text-xs text-muted-foreground">
                    {ui("ملخص قابل للتنفيذ من بيانات الفترة")}
                  </p>
                </div>
              </div>
              <ul className="space-y-2">
                {(report?.insights ?? []).map((insight) => (
                  <li
                    key={insight}
                    className="rounded-lg border bg-background/80 p-2.5 text-sm"
                  >
                    {insight}
                  </li>
                ))}
                {!reportLoading && !report?.insights.length ? (
                  <li className="text-sm text-muted-foreground">
                    {ui("لا توجد بيانات كافية لاستخراج رؤى")}
                  </li>
                ) : null}
              </ul>
            </section>
          </div>

          <section className="overflow-hidden rounded-2xl border">
            <div className="border-b bg-muted/30 px-4 py-3 font-bold">
              {ui("سجل الورديات")}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="p-3 text-start">{ui("التاريخ / الوقت")}</th>
                    <th className="text-start">{ui("الوردية")}</th>
                    <th className="text-start">{ui("المسؤول")}</th>
                    <th>{ui("المبيعات")}</th>
                    <th>{ui("النقدي")}</th>
                    <th>{ui("المتوقع")}</th>
                    <th>{ui("الفعلي")}</th>
                    <th>{ui("الفرق")}</th>
                    <th>{ui("الحالة")}</th>
                  </tr>
                </thead>
                <tbody>
                  {(report?.rows ?? []).map((row) => (
                    <tr key={row.id} className="border-b last:border-0">
                      <td className="nums p-3">
                        <b className="block">{row.sessionDate}</b>
                        <span className="text-xs text-muted-foreground">
                          {formatDateTime(row.startTime)}
                        </span>
                      </td>
                      <td>{row.shift?.shiftName ?? `#${row.shiftId}`}</td>
                      <td>
                        {row.user?.name ||
                          row.user?.username ||
                          `#${row.userId}`}
                      </td>
                      <td className="nums text-center">
                        {toArabicDigits(row.totalSales.toFixed(2))}
                      </td>
                      <td className="nums text-center">
                        {toArabicDigits(row.totalCash.toFixed(2))}
                      </td>
                      <td className="nums text-center">
                        {row.expectedClosingBalance == null
                          ? "—"
                          : toArabicDigits(
                              row.expectedClosingBalance.toFixed(2),
                            )}
                      </td>
                      <td className="nums text-center">
                        {row.closingBalance == null
                          ? "—"
                          : toArabicDigits(row.closingBalance.toFixed(2))}
                      </td>
                      <td
                        className={`nums text-center font-bold ${(row.cashDifference ?? 0) < -0.01 ? "text-destructive" : (row.cashDifference ?? 0) > 0.01 ? "text-amber-600" : "text-emerald-600"}`}
                      >
                        {row.cashDifference == null
                          ? "—"
                          : toArabicDigits(row.cashDifference.toFixed(2))}
                      </td>
                      <td className="text-center">
                        <Badge
                          variant={
                            row.status === "open" ? "default" : "secondary"
                          }
                        >
                          {ui(row.status === "open" ? "مفتوحة" : "مغلقة")}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                  {!reportLoading && !report?.rows.length ? (
                    <tr>
                      <td
                        colSpan={9}
                        className="p-10 text-center text-muted-foreground"
                      >
                        {ui("لا توجد ورديات مطابقة للفلاتر")}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        </TabsContent>
      </Tabs>

      <Dialog open={shiftOpen && canCreate} onOpenChange={setShiftOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{ui("فتح جلسة وردية")}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-1">
              <Label>{ui("الوردية")}</Label>
              <select
                className="rounded-md border bg-background px-3 py-2 text-sm"
                value={startShiftId}
                onChange={(e) => setStartShiftId(e.target.value)}
              >
                <option value="">{ui("—")}</option>
                {(shiftOptions ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.shiftName} · {formatTime(s.startTime)}–
                    {formatTime(s.endTime)}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1">
              <Label>{ui("رصيد الافتتاح")}</Label>
              <Input
                className="nums"
                type="number"
                value={openingBalance}
                onChange={(e) => setOpeningBalance(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              permissionAction="create"
              onClick={() => void startSession()}
              disabled={startingSession}
            >
              {ui("فتح")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={closeId != null && canUpdate}
        onOpenChange={(o) => !o && setCloseId(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{ui("إغلاق اليوم")}</DialogTitle>
          </DialogHeader>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/20 dark:text-amber-100">
            <b>{ui("متى أستخدم هذه الشاشة؟")}</b>
            <p className="mt-1 text-xs">
              {ui(
                "استخدمها عند انتهاء آخر وردية في اليوم فقط. للتسليم لموظف أو وردية أخرى استخدم تبديل الشيفت من نقطة البيع؛ هناك يتم الاستلام وتغيير المستخدم في خطوة واحدة.",
              )}
            </p>
          </div>
          <div className="grid gap-1 py-2">
            <Label>{ui("رصيد الإغلاق الفعلي")}</Label>
            <Input
              className="nums"
              type="number"
              value={closingBalance}
              onChange={(e) => setClosingBalance(e.target.value)}
            />
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div>
                <Label>{ui("المسحوب للخزنة")}</Label>
                <Input
                  className="nums mt-1"
                  type="number"
                  min={0}
                  value={cashDropAmount}
                  onChange={(e) => setCashDropAmount(e.target.value)}
                />
              </div>
              <div>
                <Label>{ui("المتبقي في الدرج")}</Label>
                <Input
                  className="nums mt-1"
                  type="number"
                  min={0}
                  value={retainedAmount}
                  onChange={(e) => setRetainedAmount(e.target.value)}
                />
              </div>
            </div>
            {closingShortage > 0.01 ? (
              <div className="mt-3 grid gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3">
                <div className="flex items-center justify-between gap-3">
                  <Label className="font-bold text-destructive">{ui("سبب عجز النقدية")}</Label>
                  <b className="nums text-sm text-destructive">
                    -{toArabicDigits(closingShortage.toFixed(2))} EGP
                  </b>
                </div>
                <Textarea
                  rows={3}
                  value={closingShortageReason}
                  onChange={(event) => setClosingShortageReason(event.target.value)}
                  placeholder={ui("اكتب سبب العجز ليظهر في سجل الخزينة")}
                />
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              permissionAction="update"
              onClick={() => void closeSession()}
              disabled={
                closingSession ||
                (closingShortage > 0.01 && !closingShortageReason.trim())
              }
            >
              {ui("اعتماد إغلاق اليوم")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={createOpen && (editingShiftId ? canUpdate : canCreate)}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) setEditingShiftId(null);
        }}
      >
        <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-2xl overflow-y-auto p-0">
          <DialogHeader className="border-b bg-gradient-to-l from-sky-50 to-background px-6 py-5 text-start dark:from-sky-950/30">
            <div className="flex items-start gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
                {editingShiftId ? (
                  <Pencil className="size-5" />
                ) : (
                  <Plus className="size-5" />
                )}
              </span>
              <div className="min-w-0">
                <DialogTitle>
                  {ui(editingShiftId ? "تعديل الوردية" : "وردية جديدة")}
                </DialogTitle>
                <DialogDescription className="mt-1">
                  {ui(
                    "حدد اسم الوردية ووقت بدايتها ونهايتها والمسؤول الافتراضي عنها.",
                  )}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="grid gap-5 px-6 py-5">
            <div className="grid gap-2">
              <Label htmlFor="shift-name">{ui("اسم الوردية")}</Label>
              <Input
                id="shift-name"
                autoFocus
                placeholder={ui("مثال: الوردية الصباحية")}
                value={newShift.shiftName}
                onChange={(e) =>
                  setNewShift((s) => ({ ...s, shiftName: e.target.value }))
                }
              />
            </div>

            <section className="rounded-2xl border bg-muted/20 p-4">
              <div className="mb-4">
                <h3 className="text-sm font-bold">
                  {ui("ساعات تشغيل الوردية")}
                </h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {ui(
                    "اختر الوقت بنظام 12 ساعة؛ يحفظه النظام تلقائيًا بالصيغة الصحيحة.",
                  )}
                </p>
              </div>
              <div
                className="mb-4 flex flex-wrap gap-2"
                aria-label={ui("أوقات سريعة")}
              >
                {SHIFT_TIME_PRESETS.map((preset) => {
                  const selected =
                    newShift.startTime === preset.startTime &&
                    newShift.endTime === preset.endTime;
                  return (
                    <Button
                      key={preset.label}
                      type="button"
                      size="sm"
                      variant={selected ? "secondary" : "outline"}
                      className={
                        selected
                          ? "border-primary bg-primary/10 text-primary"
                          : "bg-background"
                      }
                      onClick={() =>
                        setNewShift((shift) => ({
                          ...shift,
                          startTime: preset.startTime,
                          endTime: preset.endTime,
                        }))
                      }
                    >
                      <b>{ui(preset.label)}</b>
                      <span className="nums text-xs text-muted-foreground">
                        {formatTime(preset.startTime, locale)} —{" "}
                        {formatTime(preset.endTime, locale)}
                      </span>
                    </Button>
                  );
                })}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border bg-background p-3 shadow-sm">
                  <Label className="mb-2 block text-xs text-muted-foreground">
                    {ui("وقت بداية الوردية")}
                  </Label>
                  <Time12Input
                    aria-label={ui("وقت بداية الوردية")}
                    value={newShift.startTime}
                    onValueChange={(value) =>
                      setNewShift((s) => ({ ...s, startTime: `${value}:00` }))
                    }
                  />
                </div>
                <div className="rounded-xl border bg-background p-3 shadow-sm">
                  <Label className="mb-2 block text-xs text-muted-foreground">
                    {ui("وقت نهاية الوردية")}
                  </Label>
                  <Time12Input
                    aria-label={ui("وقت نهاية الوردية")}
                    value={newShift.endTime}
                    onValueChange={(value) =>
                      setNewShift((s) => ({ ...s, endTime: `${value}:00` }))
                    }
                  />
                </div>
              </div>
            </section>

            <div className="grid gap-2">
              <Label>{ui("المسؤول الافتراضي")}</Label>
              <Select
                value={newShift.responsibleUserId || "unassigned"}
                onValueChange={(value) =>
                  setNewShift((s) => ({
                    ...s,
                    responsibleUserId: value === "unassigned" ? "" : value,
                  }))
                }
              >
                <SelectTrigger className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper" className="max-h-64">
                  <SelectItem value="unassigned">
                    {ui("بدون تعيين — متاح للبديل المؤهل")}
                  </SelectItem>
                  {eligibleUsers.map((candidate) => (
                    <SelectItem key={candidate.id} value={String(candidate.id)}>
                      {candidate.name || candidate.username} ·{" "}
                      {candidate.jobTitle ||
                        candidate.department ||
                        ui("إدارة الكافيه")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs leading-5 text-muted-foreground">
                {ui(
                  "تظهر هنا حسابات الموظفين الذين يحملون مسمى إدارة الكافيه في الموارد البشرية، بالإضافة إلى مدير النظام للطوارئ.",
                )}
              </p>
            </div>

            <div className="flex items-center justify-between gap-4 rounded-xl border border-amber-200 bg-amber-50/70 p-4 dark:border-amber-800 dark:bg-amber-950/20">
              <div className="min-w-0">
                <Label htmlFor="last-shift-of-day" className="font-bold">
                  {ui("هل هي آخر وردية في اليوم؟")}
                </Label>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {ui("عند تفعيلها يظهر إغلاق اليوم في نقطة البيع بدل تسليم وتبديل الشيفت.")}
                </p>
              </div>
              <Switch
                id="last-shift-of-day"
                checked={newShift.isLastShiftOfDay}
                onCheckedChange={(checked) =>
                  setNewShift((shift) => ({ ...shift, isLastShiftOfDay: checked }))
                }
              />
            </div>
          </div>

          <DialogFooter className="border-t bg-muted/20 px-6 py-4 sm:justify-start">
            <Button permissionAction={editingShiftId ? "update" : "create"} onClick={() => void createShift()} disabled={creatingShift}>
              {ui(editingShiftId ? "حفظ التعديلات" : "حفظ الوردية")}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setCreateOpen(false)}
              disabled={creatingShift}
            >
              {ui("إلغاء")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </GymSalesPageShell>
  );
}
