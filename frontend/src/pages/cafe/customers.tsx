import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowDownUp,
  Phone,
  ReceiptText,
  Search,
  ShoppingBasket,
  Users,
} from "lucide-react";
import { GymSalesPageShell } from "@/pages/gym-sales/shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useBranches } from "@/hooks/use-branches";
import { useAuth } from "@/store/auth";
import { useLocale } from "@/store/locale";
import { api } from "@/lib/api";
import { toArabicDigits } from "@/lib/utils";
import type { PaginatedResponse } from "@/components/common/data-table";

type CustomerKind = "customer" | "employee";
type CustomerSort = "spend" | "orders";

interface CustomerRow {
  key: string;
  kind: CustomerKind;
  name: string;
  phone: string | null;
  employeeCode?: number | null;
  orders: number;
  totalSpend: number;
  averageOrder: number;
  firstOrderDate: string | null;
  lastOrderDate: string | null;
}

interface CustomerDetail extends CustomerRow {
  favoriteProducts: Array<{ name: string; quantity: number; spend: number }>;
  ordersHistory: Array<{
    id: number;
    saleNumber: string;
    date: string;
    time: string;
    total: number;
    discount: number;
    itemsCount: number;
  }>;
}

const money = (value: number) =>
  `${toArabicDigits((value ?? 0).toFixed(2))} ج.م`;

export function CafeCustomersPage() {
  const { ui } = useLocale();
  const user = useAuth((state) => state.user);
  const { data: branches = [] } = useBranches();
  const [branchId, setBranchId] = useState("");
  const [kind, setKind] = useState<CustomerKind>("customer");
  const [sortBy, setSortBy] = useState<CustomerSort>("spend");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<CustomerRow | null>(null);
  const effectiveBranchId =
    branchId ||
    (user?.branch && user.branch > 0 ? String(user.branch) : "") ||
    String(branches[0]?.id ?? "");

  useEffect(() => setPage(1), [kind, sortBy, search, effectiveBranchId]);

  const customersQuery = useQuery({
    queryKey: ["cafe-customers", effectiveBranchId, kind, sortBy, search, page],
    queryFn: async () =>
      (
        await api.get<PaginatedResponse<CustomerRow>>(
          "/quick-sales/customers",
          {
            params: {
              branchId: effectiveBranchId,
              kind,
              sortBy,
              search: search.trim() || undefined,
              page,
              pageSize: 20,
            },
          },
        )
      ).data,
    enabled: Boolean(effectiveBranchId),
  });

  const detailQuery = useQuery({
    queryKey: [
      "cafe-customer-detail",
      effectiveBranchId,
      selected?.kind,
      selected?.key,
    ],
    queryFn: async () =>
      (
        await api.get<CustomerDetail>(
          `/quick-sales/customers/${selected!.kind}/${encodeURIComponent(selected!.key)}`,
          { params: { branchId: effectiveBranchId } },
        )
      ).data,
    enabled: Boolean(selected && effectiveBranchId),
  });

  const rows = customersQuery.data?.data ?? [];
  const totalPages = Math.max(
    1,
    Math.ceil((customersQuery.data?.total ?? 0) / 20),
  );
  const top = rows[0];

  return (
    <GymSalesPageShell
      section="sales"
      title={ui("إدارة العملاء")}
      description={ui("قاعدة بيانات مشتريات العملاء والموظفين داخل الفرع")}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <Users className="mb-2 size-5 text-primary" />
            <p className="text-xs text-muted-foreground">
              {ui("إجمالي السجلات")}
            </p>
            <p className="nums mt-1 text-2xl font-black">
              {toArabicDigits(customersQuery.data?.total ?? 0)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <ShoppingBasket className="mb-2 size-5 text-primary" />
            <p className="text-xs text-muted-foreground">
              {ui(sortBy === "spend" ? "الأعلى مشتريات" : "الأكثر طلبًا")}
            </p>
            <p className="mt-1 truncate text-lg font-black">
              {top?.name ?? "—"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <ReceiptText className="mb-2 size-5 text-primary" />
            <p className="text-xs text-muted-foreground">
              {ui("قيمة أعلى سجل")}
            </p>
            <p className="nums mt-1 text-2xl font-black">
              {top
                ? sortBy === "spend"
                  ? money(top.totalSpend)
                  : `${toArabicDigits(top.orders)} ${ui("طلب")}`
                : "—"}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4 overflow-hidden">
        <CardContent className="p-0">
          <div className="flex flex-wrap items-end gap-3 border-b bg-muted/20 p-4">
            <div className="grid min-w-52 grid-cols-2 gap-1 rounded-lg bg-muted p-1">
              <Button
                size="sm"
                variant={kind === "customer" ? "default" : "ghost"}
                onClick={() => setKind("customer")}
              >
                {ui("العملاء")}
              </Button>
              <Button
                size="sm"
                variant={kind === "employee" ? "default" : "ghost"}
                onClick={() => setKind("employee")}
              >
                {ui("الموظفون")}
              </Button>
            </div>
            <div className="grid min-w-64 grid-cols-2 gap-1 rounded-lg bg-muted p-1">
              <Button
                size="sm"
                variant={sortBy === "spend" ? "default" : "ghost"}
                onClick={() => setSortBy("spend")}
              >
                {ui("إجمالي المشتريات")}
              </Button>
              <Button
                size="sm"
                variant={sortBy === "orders" ? "default" : "ghost"}
                onClick={() => setSortBy("orders")}
              >
                {ui("عدد الطلبات")}
              </Button>
            </div>
            <div className="relative min-w-64 flex-1">
              <Search className="absolute start-3 top-2.5 size-4 text-muted-foreground" />
              <Input
                className="ps-9"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={ui(
                  kind === "customer"
                    ? "ابحث بالاسم أو رقم الموبايل…"
                    : "ابحث باسم الموظف أو الكود أو الموبايل…",
                )}
              />
            </div>
            <select
              className="h-10 min-w-40 rounded-md border bg-background px-3 text-sm"
              value={effectiveBranchId}
              onChange={(event) => setBranchId(event.target.value)}
              disabled={branches.length <= 1}
            >
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b bg-muted/30 text-muted-foreground">
                  <th className="p-3 text-start">
                    {ui(kind === "customer" ? "العميل" : "الموظف")}
                  </th>
                  <th className="p-3 text-start">{ui("رقم الموبايل")}</th>
                  <th className="p-3 text-center">{ui("عدد الطلبات")}</th>
                  <th className="p-3 text-center">{ui("إجمالي المشتريات")}</th>
                  <th className="p-3 text-center">{ui("متوسط الطلب")}</th>
                  <th className="p-3 text-center">{ui("آخر طلب")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr
                    key={`${row.kind}-${row.key}`}
                    className="cursor-pointer border-b transition hover:bg-primary/[0.04]"
                    onClick={() => setSelected(row)}
                  >
                    <td className="p-3">
                      <div className="flex items-center gap-3">
                        <Badge variant={index < 3 ? "default" : "secondary"}>
                          #{toArabicDigits((page - 1) * 20 + index + 1)}
                        </Badge>
                        <div>
                          <p className="font-bold">{row.name}</p>
                          {row.employeeCode ? (
                            <p className="nums text-xs text-muted-foreground">
                              {ui("كود")} {toArabicDigits(row.employeeCode)}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td dir="ltr" className="nums p-3 text-start">
                      {row.phone ?? "—"}
                    </td>
                    <td className="nums p-3 text-center font-semibold">
                      {toArabicDigits(row.orders)}
                    </td>
                    <td className="nums p-3 text-center font-semibold">
                      {money(row.totalSpend)}
                    </td>
                    <td className="nums p-3 text-center">
                      {money(row.averageOrder)}
                    </td>
                    <td className="nums p-3 text-center">
                      {row.lastOrderDate
                        ? toArabicDigits(row.lastOrderDate)
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {customersQuery.isLoading ? (
              <p className="p-10 text-center text-muted-foreground">
                {ui("جاري التحميل…")}
              </p>
            ) : null}
            {customersQuery.isError ? (
              <p className="p-10 text-center text-destructive">
                {ui("تعذر تحميل بيانات العملاء")}
              </p>
            ) : null}
            {!customersQuery.isLoading && !customersQuery.isError && !rows.length ? (
              <p className="p-10 text-center text-muted-foreground">
                {ui("لا توجد سجلات مطابقة في هذا الفرع")}
              </p>
            ) : null}
          </div>

          <div className="flex items-center justify-between border-t p-4">
            <p className="text-xs text-muted-foreground">
              {ui("صفحة")} {toArabicDigits(page)} {ui("من")} {" "}
              {toArabicDigits(totalPages)}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((value) => value - 1)}
              >
                {ui("السابق")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((value) => value + 1)}
              >
                {ui("التالي")}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <DialogContent size="xl" className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {detailQuery.data?.name ?? selected?.name ?? ui("ملف العميل")}
            </DialogTitle>
          </DialogHeader>
          {detailQuery.isLoading ? (
            <p className="py-10 text-center text-muted-foreground">
              {ui("جاري تحميل ملف العميل…")}
            </p>
          ) : detailQuery.isError ? (
            <p className="py-10 text-center text-destructive">
              {ui("تعذر تحميل ملف العميل")}
            </p>
          ) : detailQuery.data ? (
            <CustomerProfile detail={detailQuery.data} ui={ui} />
          ) : null}
        </DialogContent>
      </Dialog>
    </GymSalesPageShell>
  );
}

function CustomerProfile({
  detail,
  ui,
}: {
  detail: CustomerDetail;
  ui: (value: string) => string;
}) {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge>{ui(detail.kind === "customer" ? "عميل" : "موظف")}</Badge>
        {detail.phone ? (
          <span
            dir="ltr"
            className="flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-sm"
          >
            <Phone className="size-3.5" />
            {detail.phone}
          </span>
        ) : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Metric
          label={ui("إجمالي المشتريات")}
          value={money(detail.totalSpend)}
        />
        <Metric
          label={ui("عدد الطلبات")}
          value={toArabicDigits(detail.orders)}
        />
        <Metric label={ui("متوسط الطلب")} value={money(detail.averageOrder)} />
      </div>
      <div>
        <h3 className="mb-2 flex items-center gap-2 font-bold">
          <ShoppingBasket className="size-4 text-primary" />
          {ui("المنتجات المفضلة")}
        </h3>
        <div className="grid gap-2 sm:grid-cols-2">
          {detail.favoriteProducts.map((item, index) => (
            <div
              key={`${item.name}-${index}`}
              className="flex items-center justify-between rounded-xl border p-3"
            >
              <div>
                <p className="font-semibold">
                  #{toArabicDigits(index + 1)} {item.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {toArabicDigits(item.quantity)} {ui("وحدة")}
                </p>
              </div>
              <span className="nums font-bold">{money(item.spend)}</span>
            </div>
          ))}
          {!detail.favoriteProducts.length ? (
            <p className="text-sm text-muted-foreground">
              {ui("لا توجد منتجات مسجلة")}
            </p>
          ) : null}
        </div>
      </div>
      <div>
        <h3 className="mb-2 flex items-center gap-2 font-bold">
          <ArrowDownUp className="size-4 text-primary" />
          {ui("سجل الطلبات")}
        </h3>
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[650px] text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="p-3 text-start">{ui("الفاتورة")}</th>
                <th>{ui("التاريخ")}</th>
                <th>{ui("الأصناف")}</th>
                <th>{ui("الخصم")}</th>
                <th>{ui("الإجمالي")}</th>
              </tr>
            </thead>
            <tbody>
              {detail.ordersHistory.map((order) => (
                <tr key={order.id} className="border-b last:border-0">
                  <td className="nums p-3 font-semibold">{order.saleNumber}</td>
                  <td className="nums text-center">
                    {toArabicDigits(order.date)} ·{" "}
                    {toArabicDigits(order.time.slice(0, 5))}
                  </td>
                  <td className="nums text-center">
                    {toArabicDigits(order.itemsCount)}
                  </td>
                  <td className="nums text-center text-rose-600">
                    {money(order.discount)}
                  </td>
                  <td className="nums text-center font-bold">
                    {money(order.total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-muted/20 p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="nums mt-1 text-xl font-black text-primary">{value}</p>
    </div>
  );
}
