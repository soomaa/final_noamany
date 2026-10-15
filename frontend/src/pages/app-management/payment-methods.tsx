import {
  AlertTriangle,
  Building2,
  CreditCard,
  Globe2,
  Pencil,
  Plus,
  Trash2,
  Wallet,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { EmptyState, ErrorState } from "@/components/common/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useBranches } from "@/hooks/use-branches";
import { usePermission } from "@/hooks/use-permission";
import { api, apiError } from "@/lib/api";
import { useArrayResource } from "@/lib/api-hooks";
import { confirm } from "@/lib/confirm";
import { toArabicDigits, formatDigits } from "@/lib/utils";
import { AppManagementShell } from "./app-shell";
import { useAuth } from "@/store/auth";
import { useLocale } from '@/store/locale';
import { uiStatic } from '@/lib/ui-static';

const PERMISSION_RESOURCE = "app-management.payment-methods";
const PROVIDERS = [
  "vodafone_cash",
  "instapay",
  "etisalat_cash",
  "orange_cash",
  "we_pay",
  "bank_transfer",
  "other",
] as const;
type Provider = (typeof PROVIDERS)[number];
type PaymentMethodRow = {
  id: number;
  provider: Provider;
  label: string;
  value: string;
  instructions: string | null;
  sortOrder: number;
  isActive: boolean;
  branchId: number | null;
  branchName: string | null;
};
type PaymentMethodForm = {
  provider: Provider;
  label: string;
  value: string;
  instructions: string;
  sortOrder: string;
  isActive: boolean;
  branchId: string;
};

const labels: Record<Provider, string> = {
  vodafone_cash: uiStatic("فودافون كاش"),
  instapay: uiStatic("إنستاباي"),
  etisalat_cash: uiStatic("اتصالات كاش"),
  orange_cash: uiStatic("أورانج كاش"),
  we_pay: uiStatic("وي باي"),
  bank_transfer: uiStatic("تحويل بنكي"),
  other: uiStatic("وسيلة أخرى"),
};
const emptyForm = (): PaymentMethodForm => ({
  provider: "vodafone_cash",
  label: labels.vodafone_cash,
  value: "",
  instructions: "",
  sortOrder: "0",
  isActive: true,
  branchId: "all",
});

export function AppPaymentMethodsPage() {
  const { ui } = useLocale();
  const { can } = usePermission();
  const { user } = useAuth();
  const isAdmin = user?.level === 1;
  const canCreate = can(`${PERMISSION_RESOURCE}:create`);
  const canUpdate = can(`${PERMISSION_RESOURCE}:update`);
  const canDelete = can(`${PERMISSION_RESOURCE}:delete`);
  const { data: branches } = useBranches();
  const {
    data: methods,
    isLoading,
    isError,
    refetch,
  } = useArrayResource<PaymentMethodRow>("app/payment-methods/manage");
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<PaymentMethodForm>(emptyForm);

  const groups = useMemo(() => {
    const ordered = [...(methods ?? [])].sort(
      (a, b) => a.sortOrder - b.sortOrder || a.id - b.id,
    );
    const map = new Map<
      string,
      { branchId: number | null; title: string; rows: PaymentMethodRow[] }
    >();
    for (const row of ordered) {
      const key = row.branchId == null ? "all" : String(row.branchId);
      const group = map.get(key) ?? {
        branchId: row.branchId,
        title:
          row.branchId == null
            ? ui("كل الفروع")
            : (row.branchName ?? `${ui('فرع ')}${formatDigits(row.branchId)}`),
        rows: [],
      };
      group.rows.push(row);
      map.set(key, group);
    }
    // «كل الفروع» first, then each branch — the order members' fallback actually follows.
    return [...map.values()].sort(
      (a, b) => (a.branchId == null ? -1 : b.branchId == null ? 1 : 0),
    );
  }, [methods]);

  // A branch-only number is invisible to every other branch: the member endpoint returns that
  // branch's rows when it has any, and otherwise falls back to the global rows. With no global
  // row, members of the remaining branches see no number at all — surface that here.
  const hasGlobalMethod = (methods ?? []).some((row) => row.branchId == null && row.isActive);
  const coveredBranchIds = new Set(
    (methods ?? []).filter((row) => row.branchId != null && row.isActive).map((row) => row.branchId),
  );
  const uncoveredBranches = (branches ?? []).filter(
    (branch) => branch.name && !coveredBranchIds.has(branch.id),
  );
  const showCoverageWarning =
    !hasGlobalMethod && coveredBranchIds.size > 0 && uncoveredBranches.length > 0;

  const openCreate = () => {
    setEditId(null);
    setForm(
      isAdmin
        ? emptyForm()
        : { ...emptyForm(), branchId: user?.branch ? String(user.branch) : "" },
    );
    setOpen(true);
  };
  const openEdit = (row: PaymentMethodRow) => {
    setEditId(row.id);
    setForm({
      provider: row.provider,
      label: row.label,
      value: row.value,
      instructions: row.instructions ?? "",
      sortOrder: String(row.sortOrder),
      isActive: row.isActive,
      branchId: row.branchId == null ? "all" : String(row.branchId),
    });
    setOpen(true);
  };
  const save = async () => {
    if (editId ? !canUpdate : !canCreate) return;
    if (!form.value.trim()) {
      toast.error(ui("اسم الوسيلة والرقم أو العنوان مطلوبان"));
      return;
    }
    if (!isAdmin && !form.branchId) {
      toast.error(ui("لا يوجد فرع مسند لهذا المستخدم"));
      return;
    }
    const sortOrder = Number(form.sortOrder || 0);
    if (!Number.isInteger(sortOrder) || sortOrder < 0) {
      toast.error(ui("ترتيب العرض يجب أن يكون رقمًا صحيحًا"));
      return;
    }
    setSaving(true);
    try {
      const payload = {
        provider: form.provider,
        // A blank name falls back to the provider's name.
        label: form.label.trim() || labels[form.provider],
        value: form.value.trim(),
        instructions: form.instructions.trim() || undefined,
        sortOrder,
        isActive: form.isActive,
        branchId: form.branchId === "all" ? null : Number(form.branchId),
      };
      if (editId) await api.put(`/app/payment-methods/${editId}`, payload);
      else await api.post("/app/payment-methods", payload);
      toast.success(ui("تم حفظ وسيلة الدفع"));
      setOpen(false);
      void refetch();
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setSaving(false);
    }
  };
  const remove = async (row: PaymentMethodRow) => {
    if (
      !canDelete ||
      !(await confirm({
        title: `${ui('حذف ')}${row.label}${ui('؟')}`,
        description: ui("لن تظهر هذه الوسيلة في تطبيق الأعضاء بعد الحذف."),
        variant: "destructive",
      }))
    )
      return;
    try {
      await api.delete(`/app/payment-methods/${row.id}`);
      toast.success(ui("تم حذف وسيلة الدفع"));
      void refetch();
    } catch (error) {
      toast.error(apiError(error));
    }
  };

  return (
    <AppManagementShell
      title={ui('وسائل الدفع')}
      description={ui('بيانات التحويل التي تظهر للأعضاء، افتراضيًا لكل الفروع أو مخصصة لفرع واحد.')}
      actions={
        canCreate ? (
          <Button
            permissionResource={PERMISSION_RESOURCE}
            permissionAction="create"
            variant="brand"
            onClick={openCreate}
          >
            <Plus className="size-4" /> {ui('إضافة وسيلة دفع')}
          </Button>
        ) : undefined
      }
    >
      {showCoverageWarning ? (
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600" />
          <div className="space-y-1 text-sm">
            <p className="font-semibold">{ui('لا يوجد رقم افتراضي لكل الفروع')}</p>
            <p className="text-muted-foreground">
              {ui('الأرقام الحالية مخصصة لفروع بعينها، فأعضاء هذه الفروع لن يروا أي رقم في التطبيق:')}{' '}
              <span className="font-medium text-foreground">
                {uncoveredBranches.map((branch) => branch.name).join('، ')}
              </span>
            </p>
            <p className="text-muted-foreground">
              {ui('أضف وسيلة دفع واختر «كل الفروع (افتراضي)» لتغطيتهم جميعًا.')}
            </p>
          </div>
        </div>
      ) : null}
      {isError ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="h-36 animate-pulse rounded-xl bg-muted" />
          <div className="h-36 animate-pulse rounded-xl bg-muted" />
        </div>
      ) : !groups.length ? (
        <EmptyState
          icon={Wallet}
          title={ui('لا توجد وسائل دفع')}
          description={ui('أضف رقم محفظة أو عنوان تحويل ليظهر للأعضاء عند الدفع.')}
          action={
            canCreate ? (
              <Button variant="brand" onClick={openCreate}>
                <Plus className="size-4" /> {ui('إضافة وسيلة دفع')}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-5">
          {groups.map((group) => (
            <Card key={group.branchId ?? "all"}>
              <CardHeader className="border-b bg-muted/20">
                <CardTitle className="flex items-center gap-2 text-base">
                  {group.branchId == null ? (
                    <Globe2 className="size-5 text-primary" />
                  ) : (
                    <Building2 className="size-5 text-primary" />
                  )}
                  <span className="min-w-0 break-words">{group.title}</span>
                  <Badge variant="outline">
                    {group.branchId == null ? ui("افتراضي") : ui("خاص بالفرع")}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
                {group.rows.map((row) => {
                  const editable = isAdmin || row.branchId != null;
                  return (
                    <article
                      key={row.id}
                      className="flex min-w-0 flex-col gap-3 rounded-xl border bg-background p-4"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="break-words font-medium">{row.label}</p>
                          <p
                            className="mt-1 break-all text-sm font-semibold nums"
                            dir="ltr"
                          >
                            {row.value}
                          </p>
                        </div>
                        <CreditCard className="size-5 shrink-0 text-primary" />
                      </div>
                      {row.instructions ? (
                        <p className="break-words text-xs text-muted-foreground">
                          {row.instructions}
                        </p>
                      ) : null}
                      <div className="mt-auto flex items-center justify-between gap-2">
                        <Badge variant={row.isActive ? "success" : "secondary"}>
                          {row.isActive ? ui("مفعّلة") : ui("موقوفة")}
                        </Badge>
                        {editable && (canUpdate || canDelete) ? (
                          <div className="flex gap-1">
                            {canUpdate ? (
                              <Button
                                permissionResource={PERMISSION_RESOURCE}
                                permissionAction="update"
                                variant="ghost"
                                size="icon"
                                aria-label={ui('تعديل وسيلة الدفع')}
                                onClick={() => openEdit(row)}
                              >
                                <Pencil className="size-4" />
                              </Button>
                            ) : null}
                            {canDelete ? (
                              <Button
                                permissionResource={PERMISSION_RESOURCE}
                                permissionAction="delete"
                                variant="ghost"
                                size="icon"
                                aria-label={ui('حذف وسيلة الدفع')}
                                onClick={() => void remove(row)}
                              >
                                <Trash2 className="size-4 text-destructive" />
                              </Button>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </article>
                  );
                })}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          size="lg"
          className="max-h-[90vh] overflow-y-auto"
          aria-describedby={undefined}
        >
          <DialogHeader>
            <DialogTitle>
              {editId ? ui("تعديل وسيلة دفع") : ui("إضافة وسيلة دفع")}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>{ui('نوع الوسيلة')}</Label>
              <select
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={form.provider}
                onChange={(event) => {
                  const provider = event.target.value as Provider;
                  // Keep the label in step with the provider until staff type their own wording.
                  setForm((current) => {
                    const autoLabel =
                      !current.label.trim() ||
                      Object.values(labels).includes(current.label.trim());
                    return {
                      ...current,
                      provider,
                      label: autoLabel ? labels[provider] : current.label,
                    };
                  });
                }}
              >
                {PROVIDERS.map((provider) => (
                  <option key={provider} value={provider}>
                    {labels[provider]}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <Label>{ui('الاسم المعروض')}</Label>
              <Input
                value={form.label}
                maxLength={120}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    label: event.target.value,
                  }))
                }
              />
            </div>
            <div className="grid gap-2">
              <Label>{ui('الرقم أو عنوان التحويل')}</Label>
              <Input
                dir="ltr"
                className="nums"
                maxLength={160}
                value={form.value}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    value: event.target.value,
                  }))
                }
              />
            </div>
            <div className="grid gap-2">
              <Label>{ui('الفرع')}</Label>
              <select
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={form.branchId}
                disabled={!isAdmin && !!user?.branch}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    branchId: event.target.value,
                  }))
                }
              >
                {isAdmin ? (
                  <option value="all">{ui('كل الفروع (افتراضي)')}</option>
                ) : null}
                {(branches ?? []).map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <Label>{ui('ترتيب العرض')}</Label>
              <Input
                type="number"
                min={0}
                step={1}
                className="nums"
                value={form.sortOrder}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    sortOrder: event.target.value,
                  }))
                }
              />
            </div>
            <div className="flex items-center justify-between gap-3 rounded-xl border p-3">
              <div>
                <Label htmlFor="payment-method-active">{ui('مفعّلة')}</Label>
                <p className="mt-1 text-xs text-muted-foreground">
                  {ui("تظهر الآن في تطبيق الأعضاء.")}
                </p>
              </div>
              <Switch
                id="payment-method-active"
                checked={form.isActive}
                onCheckedChange={(isActive) =>
                  setForm((current) => ({ ...current, isActive }))
                }
              />
            </div>
            <div className="grid gap-2 sm:col-span-2">
              <Label>{ui('تعليمات للعضو')}</Label>
              <Textarea
                rows={3}
                value={form.instructions}
                placeholder={ui('مثال: أرسل صورة إيصال التحويل إلى الاستقبال')}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    instructions: event.target.value,
                  }))
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {ui("إلغاء")}
            </Button>
            <Button
              permissionResource={PERMISSION_RESOURCE}
              permissionAction={editId ? "update" : "create"}
              variant="brand"
              disabled={saving}
              onClick={() => void save()}
            >
              {ui("حفظ")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppManagementShell>
  );
}
