import { formatDisplayNumber } from '@/lib/number-display';
import { formatMoneyNumber } from '@/lib/formatters';
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarRange,
  Coffee,
  CheckCircle2,
  CircleDollarSign,
  FileStack,
  Handshake,
  History,
  RefreshCw,
  UserRound,
  WalletCards,
} from "lucide-react";
import { toast } from "sonner";
import { Combobox } from "@/components/common/combobox";
import { Button } from "@/components/ui/button";
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
import { useBranches } from "@/hooks/use-branches";
import { usePermission } from "@/hooks/use-permission";
import { usePosEmployeeOptions } from "@/hooks/use-pos-employee-options";
import { api, apiError } from "@/lib/api";
import { localToday } from "@/lib/formatters";
import { toArabicDigits } from "@/lib/utils";
import { useLocale } from "@/store/locale";
import { GymSalesPageShell } from "../gym-sales/shell";

interface PreviewSale {
  id: number;
  saleNumber: string;
  dailyNumber: number;
  saleDate: string;
  saleTime: string;
  amount: number;
  billingCycle: string | null;
  items: Array<{ id?: number; name: string; quantity: number; amount?: number }>;
}

interface Preview {
  accountName: string;
  count: number;
  totalAmount: number;
  sales: PreviewSale[];
}

interface AccountSale extends PreviewSale {
  saleType: "employee" | "partner" | "hospitality";
  billingStatus: "unbilled" | "in_statement" | "settled" | "not_applicable";
  status: "draft" | "completed" | "refunded" | "cancelled";
  totalAmount: number;
  collectedAmount: number;
}

interface Statement {
  id: number;
  statementNumber: string;
  accountType: "employee" | "partner" | "hospitality";
  employeeId: number | null;
  partnerId: number | null;
  accountName: string | null;
  billingCycle: string;
  periodStart: string;
  periodEnd: string;
  totalAmount: number;
  paidAmount: number;
  status: string;
  settlementMethod: string | null;
  paymentMethod: string | null;
  createdBy: number | null;
  settledBy: number | null;
  settledAt: string | null;
  createdAt: string;
  sales: PreviewSale[];
}

function firstDayOfMonth(date: string) {
  return `${date.slice(0, 7)}-01`;
}

export function SalesSettlementsPage() {
  const { ui } = useLocale();
  const { can } = usePermission();
  const canCreate = can('gym-sales.sales.settlements:create');
  const canUpdate = can('gym-sales.sales.settlements:update');
  const qc = useQueryClient();
  const today = localToday();
  const { data: branches = [] } = useBranches();
  const { data: employees = [] } = usePosEmployeeOptions();
  const { data: partners = [] } = useQuery({
    queryKey: ["cafe-partners"],
    queryFn: async () =>
      (
        await api.get<
          Array<{
            id: number;
            partnerCode: string;
            name: string;
            phone: string | null;
            phones: Array<{ phone: string }>;
            isActive: boolean;
          }>
        >("/cafe-products/partners/list")
      ).data.filter((partner) => partner.isActive),
  });
  const [accountType, setAccountType] = useState<"employee" | "partner" | "hospitality">(
    "employee",
  );
  const [accountId, setAccountId] = useState("");
  // Collection is monthly only: one statement per account gathers every deferred invoice of the
  // period (legacy "daily" invoices included), so nothing is left out of the statement.
  const billingCycle = "monthly" as const;
  const [periodStart, setPeriodStart] = useState(() => firstDayOfMonth(today));
  const [periodEnd, setPeriodEnd] = useState(today);
  const [branchId, setBranchId] = useState("");
  const [selected, setSelected] = useState<number[]>([]);
  const [creating, setCreating] = useState(false);
  const [settleTarget, setSettleTarget] = useState<Statement | null>(null);
  const [settlementMethod, setSettlementMethod] = useState<
    "direct_payment" | "payroll_deduction" | "profit_share_deduction" | "partner_account"
  >("direct_payment");
  const [paymentMethod, setPaymentMethod] = useState<
    "cash" | "card" | "wallet" | "transfer"
  >("cash");
  const [targetPartnerId, setTargetPartnerId] = useState("");
  const accountActive = accountType === "hospitality" || Boolean(accountId);
  const [settling, setSettling] = useState(false);

  const accountOptions =
    accountType === "employee"
      ? employees.map((employee) => ({
          value: String(employee.value),
          label: employee.label,
        }))
      : partners.map((partner) => {
          const phoneNumbers =
            partner.phones?.map((item) => item.phone).filter(Boolean) ??
            (partner.phone ? [partner.phone] : []);
          return {
            value: String(partner.id),
            label: partner.name,
            description: [partner.partnerCode, phoneNumbers[0]]
              .filter(Boolean)
              .join(" · "),
            searchText: [
              partner.name,
              partner.partnerCode,
              ...phoneNumbers,
            ].join(" "),
          };
        });

  const previewQuery = useQuery({
    queryKey: [
      "billing-statements",
      "preview",
      accountType,
      accountId,
      billingCycle,
      periodStart,
      periodEnd,
      branchId,
    ],
    queryFn: async () =>
      (
        await api.get<Preview>("/billing-statements/preview", {
          params: {
            accountType,
            accountId: accountType === "hospitality" ? undefined : accountId,
            billingCycle,
            periodStart,
            periodEnd,
            branchId: branchId || undefined,
          },
        })
      ).data,
    enabled: accountActive,
  });
  const preview = previewQuery.data;

  const historyQuery = useQuery({
    queryKey: [
      "billing-account-sales",
      accountType,
      accountId,
      periodStart,
      periodEnd,
      branchId,
    ],
    queryFn: async () =>
      (
        await api.get<{ data: AccountSale[] }>("/quick-sales", {
          params: {
            saleType: accountType,
            employeeId: accountType === "employee" ? accountId : undefined,
            partnerId: accountType === "partner" ? accountId : undefined,
            status: "all",
            dateFrom: periodStart,
            dateTo: periodEnd,
            branchId: branchId || undefined,
            pageSize: 200,
          },
        })
      ).data,
    enabled: accountActive,
  });

  const statementsQuery = useQuery({
    queryKey: ["billing-statements", "list", accountType, accountId, branchId],
    queryFn: async () =>
      (
        await api.get<{ data: Statement[] }>("/billing-statements", {
          params: {
            accountType,
            accountId: accountId || undefined,
            branchId: branchId || undefined,
            pageSize: 100,
          },
        })
      ).data,
    enabled: accountActive,
  });

  useEffect(() => {
    setSelected(preview?.sales.map((sale) => sale.id) ?? []);
  }, [preview]);

  const historyRows = (historyQuery.data?.data ?? []).filter(
    (sale) => sale.status !== "draft",
  );
  const completedRows = historyRows.filter(
    (sale) => sale.status === "completed",
  );
  const totals = useMemo(
    () => ({
      purchases: completedRows.reduce((sum, sale) => sum + sale.totalAmount, 0),
      outstanding: completedRows
        .filter((sale) =>
          ["unbilled", "in_statement", ...(sale.saleType === "hospitality" ? ["not_applicable"] : [])].includes(sale.billingStatus),
        )
        .reduce((sum, sale) => sum + sale.totalAmount, 0),
      settled: completedRows
        .filter((sale) => sale.billingStatus === "settled")
        .reduce((sum, sale) => sum + sale.totalAmount, 0),
    }),
    [completedRows],
  );
  const selectedTotal = useMemo(
    () =>
      (preview?.sales ?? [])
        .filter((sale) => selected.includes(sale.id))
        .reduce((sum, sale) => sum + sale.amount, 0),
    [preview, selected],
  );

  const changeAccountType = (type: "employee" | "partner" | "hospitality") => {
    setAccountType(type);
    setAccountId("");
    setSelected([]);
  };

  const createStatement = async () => {
    if (!canCreate || !preview?.sales.length || !selected.length || creating) return;
    setCreating(true);
    try {
      await api.post("/billing-statements", {
        accountType,
        accountId: accountType === "hospitality" ? undefined : Number(accountId),
        billingCycle,
        periodStart,
        periodEnd,
        branchId: branchId ? Number(branchId) : undefined,
        saleIds: selected,
      });
      toast.success(ui("تم إصدار كشف الحساب وتسجيله في سجل كل فاتورة"));
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["billing-statements"] }),
        qc.invalidateQueries({ queryKey: ["billing-account-sales"] }),
      ]);
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setCreating(false);
    }
  };

  const settle = async () => {
    if (!canUpdate || !settleTarget || settling || (settlementMethod === "partner_account" && !targetPartnerId)) return;
    setSettling(true);
    try {
      await api.post(`/billing-statements/${settleTarget.id}/settle`, {
        settlementMethod,
        partnerId: settlementMethod === "partner_account" ? Number(targetPartnerId) : undefined,
        paymentMethod:
          settlementMethod === "direct_payment" ? paymentMethod : undefined,
      });
      toast.success(ui(settlementMethod === "partner_account" ? "تم تحميل قيمة الضيافة على حساب الشريك دون تحصيل" : "تمت التسوية والترحيل المحاسبي وتحديث سجل الفواتير"));
      setSettleTarget(null);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["billing-statements"] }),
        qc.invalidateQueries({ queryKey: ["billing-account-sales"] }),
        qc.invalidateQueries({ queryKey: ["quick-sales"] }),
        qc.invalidateQueries({ queryKey: ["shift-sessions"] }),
        qc.invalidateQueries({ queryKey: ["shift-close-report"] }),
        ...["finance", "revenues", "cafe-dashboard", "cafe-reports"].map(key => qc.invalidateQueries({ queryKey: [key] })),
      ]);
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setSettling(false);
    }
  };

  const billingStatusLabel = (sale: AccountSale) => {
    if (sale.status === "refunded") return ui("مستردة");
    if (sale.status === "cancelled") return ui("ملغاة");
    if (sale.saleType === "hospitality" && sale.billingStatus === "not_applicable") return ui("ضيافة غير مجمعة");
    if (sale.billingStatus === "unbilled") return ui("غير مجمعة");
    if (sale.billingStatus === "in_statement") return ui("ضمن كشف مستحق");
    if (sale.saleType === "hospitality") return ui("تمت تسوية الضيافة");
    if (sale.billingCycle === "immediate") return ui("مدفوعة فورًا");
    return ui("تمت التسوية");
  };

  const billingStatusClass = (sale: AccountSale) => {
    if (["refunded", "cancelled"].includes(sale.status))
      return "bg-rose-50 text-rose-700";
    if (sale.saleType === "hospitality" && sale.billingStatus === "not_applicable") return "bg-amber-50 text-amber-800";
    if (sale.billingStatus === "unbilled") return "bg-amber-50 text-amber-800";
    if (sale.billingStatus === "in_statement") return "bg-sky-50 text-sky-700";
    return "bg-emerald-50 text-emerald-700";
  };

  const cycleLabel = (cycle: string | null) =>
    cycle === "daily"
      ? ui("يومي")
      : cycle === "monthly"
        ? ui("شهري")
        : ui("دفع فوري");

  const settlementLabel = (statement: Statement) => {
    if (statement.status !== "settled") return ui(statement.partnerId && statement.accountType === "hospitality" ? "على حساب شريك — مستحق" : "لم تسوَّ بعد");
    if (statement.settlementMethod === "payroll_deduction")
      return ui("خصم من الراتب");
    if (statement.settlementMethod === "profit_share_deduction")
      return ui("خصم من أرباح الشريك");
    return ui("دفع مباشر");
  };

  return (
    <GymSalesPageShell
      section="sales"
      title={ui("فواتير الموظفين والشركاء والضيافة")}
      description={ui(
        "دفتر مستقل لكل حساب يعرض الفواتير المدفوعة والمؤجلة، ثم يجمعها شهريًا ويسجل كل خطوة للمراجعة.",
      )}
    >
      {accountActive && (previewQuery.isError || historyQuery.isError || statementsQuery.isError) && <div role="alert" className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
        <p>{ui("تعذر تحميل بيانات التسويات. أعد المحاولة قبل إصدار أو تسوية كشف.")}</p>
        <Button variant="outline" className="mt-2" onClick={() => { void previewQuery.refetch(); void historyQuery.refetch(); void statementsQuery.refetch(); }}>{ui("إعادة المحاولة")}</Button>
      </div>}
      <Card className="mb-5 overflow-hidden border-primary/15">
        <CardContent className="grid gap-4 p-5 lg:grid-cols-[1fr_1.4fr]">
          <div className="space-y-4">
            <div className="flex flex-wrap gap-1 rounded-xl bg-muted p-1">
              <Button
                type="button"
                variant={accountType === "employee" ? "default" : "ghost"}
                aria-pressed={accountType === "employee"} onClick={() => changeAccountType("employee")}
              >
                <UserRound className="me-2 size-4" />
                {ui("فواتير الموظفين")}
              </Button>
              <Button
                type="button"
                variant={accountType === "partner" ? "default" : "ghost"}
                aria-pressed={accountType === "partner"} onClick={() => changeAccountType("partner")}
              >
                <Handshake className="me-2 size-4" />
                {ui("فواتير الشركاء")}
              </Button>
              <Button type="button" variant={accountType === "hospitality" ? "default" : "ghost"} aria-pressed={accountType === "hospitality"} onClick={() => changeAccountType("hospitality")}>
                <Coffee className="me-2 size-4" />{ui("فواتير الضيافة")}
              </Button>
            </div>
            {accountType === "hospitality" ? <p className="text-sm leading-6 text-muted-foreground">{ui("حدد الفترة وفواتير الضيافة، ثم أصدر كشفًا لتحصيل قيمته أو تحميله على حساب شريك. قيمة التسوية هي إجمالي الفواتير المعروض.")}</p> : <div>
              <Label>
                {ui(accountType === "employee" ? "الموظف" : "الشريك")}
              </Label>
              <div className="mt-1">
                <Combobox
                  value={accountId}
                  onValueChange={setAccountId}
                  options={accountOptions}
                  placeholder={ui("اختر الحساب لعرض فواتيره")}
                  searchPlaceholder={ui(
                    accountType === "employee"
                      ? "ابحث باسم الموظف أو كوده…"
                      : "ابحث باسم الشريك أو الكود أو الهاتف…",
                  )}
                  emptyText={ui("لا توجد نتيجة مطابقة")}
                />
              </div>
            </div>}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>{ui("دورة التجميع")}</Label>
                <p className="mt-1 flex h-10 items-center rounded-md border bg-muted/40 px-3 text-sm font-semibold">
                  {ui("شهري")}
                </p>
              </div>
              <div>
                <Label>{ui("الفرع")}</Label>
                <select
                  className="mt-1 h-10 w-full rounded-md border bg-background px-3"
                  value={branchId}
                  onChange={(event) => setBranchId(event.target.value)}
                >
                  <option value="">{ui("كل الفروع")}</option>
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>{ui("من")}</Label>
                <Input
                  className="nums mt-1"
                  type="date"
                  value={periodStart}
                  onChange={(event) => setPeriodStart(event.target.value)}
                />
              </div>
              <div>
                <Label>{ui("إلى")}</Label>
                <Input
                  className="nums mt-1"
                  type="date"
                  value={periodEnd}
                  onChange={(event) => setPeriodEnd(event.target.value)}
                />
              </div>
            </div>
          </div>

          {accountActive ? (
            <div className="grid content-start gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border bg-sky-50/60 p-4">
                <WalletCards className="mb-3 size-5 text-sky-700" />
                <p className="text-xs text-muted-foreground">
                  {ui("إجمالي المشتريات")}
                </p>
                <b className="nums mt-1 block text-xl">
                  {formatMoneyNumber(totals.purchases)} EGP
                </b>
              </div>
              <div className="rounded-2xl border bg-amber-50/70 p-4">
                <CircleDollarSign className="mb-3 size-5 text-amber-700" />
                <p className="text-xs text-muted-foreground">
                  {ui("المبلغ المستحق")}
                </p>
                <b className="nums mt-1 block text-xl text-amber-800">
                  {formatMoneyNumber(totals.outstanding)} EGP
                </b>
              </div>
              <div className="rounded-2xl border bg-emerald-50/70 p-4">
                <CheckCircle2 className="mb-3 size-5 text-emerald-700" />
                <p className="text-xs text-muted-foreground">
                  {ui("مدفوع / مسوّى")}
                </p>
                <b className="nums mt-1 block text-xl text-emerald-800">
                  {formatMoneyNumber(totals.settled)} EGP
                </b>
              </div>
              <div className="sm:col-span-3 flex items-center justify-between rounded-xl border border-primary/15 bg-primary/[0.035] px-4 py-3">
                <div>
                  <p className="font-bold">{preview?.accountName}</p>
                  <p className="text-xs text-muted-foreground">
                    {toArabicDigits(historyRows.length)}{" "}
                    {ui("فاتورة ظاهرة في الفترة")}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    void historyQuery.refetch();
                    void previewQuery.refetch();
                  }}
                >
                  <RefreshCw className="me-2 size-4" />
                  {ui("تحديث")}
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid min-h-56 place-items-center rounded-2xl border border-dashed text-center text-muted-foreground">
              <div>
                <UserRound className="mx-auto mb-3 size-12 opacity-25" />
                <p>{ui("اختر موظفًا أو شريكًا لفتح دفتر فواتيره")}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {accountActive ? (
        <section className="mb-5 overflow-hidden rounded-2xl border">
          <div className="flex items-center justify-between border-b bg-muted/30 px-4 py-3">
            <div>
              <p className="flex items-center gap-2 font-bold">
                <History className="size-4 text-primary" />
                {ui("كل فواتير الحساب")}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {ui(
                  "المدفوع فورًا والمؤجل والمجمّع والمسوى يظهر هنا ولا يختفي.",
                )}
              </p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px] text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="p-3 text-start">{ui("الفاتورة")}</th>
                  <th className="p-3 text-start">{ui("الطلب الفعلي")}</th>
                  <th>{ui("التاريخ")}</th>
                  <th>{ui("الدورة")}</th>
                  <th>{ui("الإجمالي")}</th>
                  <th>{ui("المحصّل")}</th>
                  <th>{ui("الحالة")}</th>
                </tr>
              </thead>
              <tbody>
                {historyRows.map((sale) => (
                  <tr key={sale.id} className="border-b last:border-0">
                    <td className="p-3">
                      <b>#{toArabicDigits(sale.dailyNumber)}</b>
                      <span className="ms-2 text-xs text-muted-foreground">
                        {sale.saleNumber}
                      </span>
                    </td>
                    <td className="min-w-64 p-3">
                      <ItemsEvidence items={sale.items} emptyLabel={ui("لا توجد أصناف مسجلة")} />
                    </td>
                    <td className="nums text-center">
                      {sale.saleDate} · {sale.saleTime}
                    </td>
                    <td className="text-center">
                      {sale.saleType === "hospitality" ? ui("ضيافة") : cycleLabel(sale.billingCycle)}
                    </td>
                    <td className="nums text-center font-bold">
                      {formatMoneyNumber(sale.totalAmount)}
                    </td>
                    <td className="nums text-center">
                      {formatMoneyNumber(sale.collectedAmount)}
                    </td>
                    <td className="p-2 text-center">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs ${billingStatusClass(sale)}`}
                      >
                        {billingStatusLabel(sale)}
                      </span>
                    </td>
                  </tr>
                ))}
                {!historyRows.length ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="p-8 text-center text-muted-foreground"
                    >
                      {historyQuery.isFetching
                        ? ui("جاري تحميل الفواتير…")
                        : ui("لا توجد فواتير لهذا الحساب في الفترة المحددة")}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {accountActive ? (
        <div className="mb-5 grid gap-4 xl:grid-cols-[1.15fr_.85fr]">
          <Card>
            <CardContent className="p-5">
              <div className="mb-4 flex items-center justify-between rounded-2xl bg-primary/[0.06] p-4">
                <div>
                  <p className="font-black">{ui("فواتير جاهزة للتجميع")}</p>
                  <p className="text-xs text-muted-foreground">
                    {toArabicDigits(preview?.count ?? 0)}{" "}
                    {ui("فاتورة غير مسواة")}
                    {" · "}
                    {cycleLabel(billingCycle)}
                  </p>
                </div>
                <div className="text-end">
                  <p className="nums text-2xl font-black text-primary">
                    {formatMoneyNumber(selectedTotal)} EGP
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {ui("الإجمالي المختار")}
                  </p>
                </div>
              </div>
              {preview?.sales.length ? (
                <>
                  <div className="max-h-64 divide-y overflow-y-auto rounded-xl border">
                    {preview.sales.map((sale) => (
                      <label
                        key={sale.id}
                        className="flex cursor-pointer items-center gap-3 p-3 hover:bg-muted/30"
                      >
                        <input
                          type="checkbox"
                          checked={selected.includes(sale.id)}
                          onChange={(event) =>
                            setSelected((ids) =>
                              event.target.checked
                                ? [...ids, sale.id]
                                : ids.filter((id) => id !== sale.id),
                            )
                          }
                        />
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold">
                            #{toArabicDigits(sale.dailyNumber)} ·{" "}
                            {sale.saleNumber}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {sale.items
                              .map((item) => `${item.name} × ${formatDisplayNumber(item.quantity)}`)
                              .join("، ")}
                          </p>
                        </div>
                        <b className="nums">
                          {formatMoneyNumber(sale.amount)}
                        </b>
                      </label>
                    ))}
                  </div>
                  {canCreate ? <Button
                    permissionAction="create"
                    className="mt-4 w-full"
                    onClick={() => void createStatement()}
                    disabled={creating || !selected.length || previewQuery.isFetching || previewQuery.isError}
                  >
                    <FileStack className="me-2 size-4" />
                    {creating ? ui("جاري الإصدار…") : ui("إصدار كشف مجمع")}
                  </Button> : null}
                </>
              ) : (
                <div className="grid min-h-44 place-items-center rounded-xl border border-dashed text-center text-muted-foreground">
                  <div>
                    <CheckCircle2 className="mx-auto mb-2 size-10 opacity-25" />
                    <p>{ui("لا توجد فواتير غير مجمعة لهذه الدورة والفترة")}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-primary/15">
            <CardContent className="space-y-3 p-5">
              <p className="flex items-center gap-2 font-bold">
                <CalendarRange className="size-4 text-primary" />
                {ui("كيف تعمل الدورة؟")}
              </p>
              <p className="text-sm leading-7 text-muted-foreground">
                {ui(
                  "تظهر كل الفواتير المؤجلة غير المجمعة للحساب في الفترة المحددة (من أول الشهر افتراضيًا)، ومعاها الفواتير القديمة المسجلة «يومي»، ثم تصدر كشفًا شهريًا واحدًا قابلًا للتسوية.",
                )}
              </p>
              <div className="rounded-xl border bg-muted/30 p-3 text-xs leading-6 text-muted-foreground">
                {ui(
                  "إصدار الكشف لا يعني التحصيل. التسوية خطوة منفصلة، وتُسجل طريقة الدفع أو الخصم والمستخدم والتوقيت داخل السجل المحاسبي وسجل كل فاتورة.",
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {accountActive ? (
        <section className="overflow-hidden rounded-2xl border">
          <div className="border-b bg-muted/30 px-4 py-3 font-bold">
            {ui("كشوف الحساب الصادرة لهذا الحساب")}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="p-3 text-start">{ui("رقم الكشف")}</th>
                  <th className="p-3 text-start">{ui("الفواتير والطلبات")}</th>
                  <th>{ui("الفترة")}</th>
                  <th>{ui("الإجمالي")}</th>
                  <th>{ui("الدورة")}</th>
                  <th>{ui("الحالة")}</th>
                  <th>{ui("أثر التدقيق")}</th>
                  <th>{ui("التسوية")}</th>
                </tr>
              </thead>
              <tbody>
                {(statementsQuery.data?.data ?? []).map((statement) => (
                  <tr key={statement.id} className="border-b last:border-0">
                    <td className="p-3 font-semibold">
                      {statement.statementNumber}
                      {statement.accountType === "hospitality" && <span className="mt-1 block text-xs font-normal text-muted-foreground">{ui("ضيافة المكان")}{statement.partnerId ? ` · ${statement.accountName || partners.find(p => p.id === statement.partnerId)?.name || `#${statement.partnerId}`}` : ''}</span>}
                    </td>
                    <td className="min-w-72 p-3">
                      <div className="max-h-36 space-y-2 overflow-y-auto pe-1">
                        {(statement.sales ?? []).map((sale) => (
                          <article key={sale.id} className="rounded-xl border bg-muted/20 p-2.5">
                            <div className="mb-1.5 flex items-center justify-between gap-2">
                              <b className="nums text-xs">#{toArabicDigits(sale.dailyNumber)} · {sale.saleNumber}</b>
                              <span className="nums text-xs font-bold">{formatMoneyNumber(sale.amount)} EGP</span>
                            </div>
                            <ItemsEvidence items={sale.items} emptyLabel={ui("لا توجد أصناف مسجلة")} />
                          </article>
                        ))}
                      </div>
                    </td>
                    <td className="nums text-center">
                      {statement.periodStart} — {statement.periodEnd}
                    </td>
                    <td className="nums text-center font-bold">
                      {formatMoneyNumber(statement.totalAmount)}
                    </td>
                    <td className="text-center">
                      {cycleLabel(statement.billingCycle)}
                    </td>
                    <td className="text-center">
                      <span
                        className={`rounded-full px-2 py-1 text-xs ${
                          statement.status === "settled"
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-amber-50 text-amber-800"
                        }`}
                      >
                        {statement.status === "settled"
                          ? ui("تمت التسوية")
                          : statement.accountType === "hospitality" && statement.partnerId ? ui("على حساب شريك — مستحق") : ui("مستحق")}
                      </span>
                    </td>
                    <td className="text-center text-xs text-muted-foreground">
                      <span>
                        {ui("إنشاء")}: #{statement.createdBy ?? "—"}
                      </span>
                      {statement.settledAt ? (
                        <span className="ms-2">
                          {ui("آخر إجراء")}: #{statement.settledBy ?? "—"}
                          <time className="nums mt-1 block" dateTime={statement.settledAt}>{new Date(statement.settledAt).toLocaleString()}</time>
                        </span>
                      ) : null}
                    </td>
                    <td className="p-2 text-center">
                      {canUpdate && statement.status === "issued" ? (
                        <Button
                          permissionAction="update"
                          size="sm"
                          onClick={() => {
                            setSettleTarget(statement);
                            setSettlementMethod("direct_payment");
                            setTargetPartnerId("");
                          }}
                        >
                          {ui("تسوية الآن")}
                        </Button>
                      ) : (
                        <span className="text-xs font-semibold text-emerald-700">
                          {settlementLabel(statement)}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
                {!statementsQuery.data?.data?.length ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="p-8 text-center text-muted-foreground"
                    >
                      {ui("لم تصدر كشوف لهذا الحساب بعد")}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <Dialog
        open={canUpdate && Boolean(settleTarget)}
        onOpenChange={(open) => !open && setSettleTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{ui("تسوية كشف الحساب")}</DialogTitle>
            <DialogDescription>
              {settleTarget?.statementNumber} ·{" "}
              {formatMoneyNumber((settleTarget?.totalAmount ?? 0))} EGP
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <section className="rounded-2xl border bg-muted/25 p-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <h3 className="text-sm font-black">{ui("الطلبات التي تتم تسويتها")}</h3>
                <span className="text-xs text-muted-foreground">{toArabicDigits(settleTarget?.sales?.length ?? 0)} {ui("فاتورة")}</span>
              </div>
              <div className="max-h-52 space-y-2 overflow-y-auto pe-1">
                {(settleTarget?.sales ?? []).map((sale) => (
                  <article key={sale.id} className="rounded-xl border bg-background p-3">
                    <div className="flex items-center justify-between gap-2"><b className="nums">#{toArabicDigits(sale.dailyNumber)} · {sale.saleNumber}</b><b className="nums">{formatMoneyNumber(sale.amount)} EGP</b></div>
                    <p className="nums mt-1 text-xs text-muted-foreground">{sale.saleDate} · {sale.saleTime}</p>
                    <div className="mt-2"><ItemsEvidence items={sale.items} emptyLabel={ui("لا توجد أصناف مسجلة")} /></div>
                  </article>
                ))}
              </div>
            </section>
            <div>
              <Label htmlFor="hospitality-settlement-method">{ui("طريقة التسوية")}</Label>
              <select
                className="mt-1 h-10 w-full rounded-md border bg-background px-3"
                id="hospitality-settlement-method"
                value={settlementMethod}
                onChange={(event) =>
                  setSettlementMethod(
                    event.target.value as typeof settlementMethod,
                  )
                }
              >
                <option value="direct_payment">{ui("دفع مباشر")}</option>
                {settleTarget?.accountType === "hospitality" && !settleTarget.partnerId && <option value="partner_account">{ui("على حساب شريك")}</option>}
                {(settleTarget?.accountType === "partner" || (settleTarget?.accountType === "hospitality" && settleTarget.partnerId)) && (
                  <option value="profit_share_deduction">
                    {ui("خصم من نسبة أرباح الشريك")}
                  </option>
                )}
              </select>
            </div>
            {settlementMethod === "partner_account" && <div className="space-y-2">
              <Label htmlFor="hospitality-partner">{ui("الشريك الذي يتحمل القيمة")}</Label>
              <Combobox id="hospitality-partner" aria-label={ui("الشريك الذي يتحمل القيمة")} value={targetPartnerId} onValueChange={setTargetPartnerId} options={partners.map(partner => ({ value: String(partner.id), label: partner.name }))} placeholder={ui("اختر الشريك")} searchPlaceholder={ui("ابحث باسم الشريك")} emptyText={ui("لا يوجد شريك نشط مطابق")} />
              <p className="text-sm leading-6 text-muted-foreground">{ui("ستضاف القيمة إلى مستحقات الشريك، ويمكن تحصيلها لاحقًا من تبويب فواتير الشركاء.")}</p>
            </div>}
            {settleTarget?.accountType === 'employee' && <p className="text-sm leading-6 text-muted-foreground">{ui('خصم الحساب من المرتب بيتحدد من صفحة المرتبات الشهرية داخل بيانات الموظف. هنا للتحصيل المباشر فقط.')}</p>}
            {settlementMethod === "direct_payment" ? (
              <div>
                <Label htmlFor="hospitality-payment-method">{ui("وسيلة الدفع")}</Label>
                <select
                  className="mt-1 h-10 w-full rounded-md border bg-background px-3"
                  id="hospitality-payment-method"
                  value={paymentMethod}
                  onChange={(event) =>
                    setPaymentMethod(event.target.value as typeof paymentMethod)
                  }
                >
                  <option value="cash">{ui("نقدي")}</option>
                  <option value="card">{ui("بطاقة")}</option>
                  <option value="wallet">{ui("محفظة")}</option>
                  <option value="transfer">
                    {ui("حساب بنكي / إنستا باي")}
                  </option>
                </select>
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSettleTarget(null)}>
              {ui("إلغاء")}
            </Button>
            <Button permissionAction="update" onClick={() => void settle()} disabled={settling || (settlementMethod === "partner_account" && !targetPartnerId)}>
              {settling ? ui("جاري الترحيل…") : ui(settlementMethod === "partner_account" ? "تأكيد التحميل على الشريك" : "اعتماد التسوية")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </GymSalesPageShell>
  );
}

function ItemsEvidence({
  items,
  emptyLabel,
}: {
  items: Array<{ id?: number; name: string; quantity: number; amount?: number }>;
  emptyLabel: string;
}) {
  if (!items?.length) return <span className="text-xs text-muted-foreground">{emptyLabel}</span>;
  return <ul className="space-y-1 text-xs">{items.map((item, index) => <li key={item.id ?? `${item.name}-${index}`} className="flex items-baseline justify-between gap-3"><span className="min-w-0 break-words font-semibold">{item.name} × {toArabicDigits(item.quantity)}</span>{item.amount != null ? <span className="nums shrink-0 text-muted-foreground">{formatMoneyNumber(item.amount)}</span> : null}</li>)}</ul>;
}
