import {
  Download,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/page-header";
import { ErrorState } from "@/components/common/states";
import { MemberSearchCombobox } from "@/components/club/member-search-combobox";
import { GroupDiscountNotice } from "@/components/club/group-discount-notice";
import { groupPlansError, MemberGroupPlansEditor, newGroupPlanDraft, type GroupPlanDraft } from "@/components/club/member-group-plans-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePermission } from "@/hooks/use-permission";
import { api, apiError } from "@/lib/api";
import { confirm } from "@/lib/confirm";
import { downloadBlob } from "@/lib/export";
import { formatMoney } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { useLocale } from "@/store/locale";
import type { ClubMemberGroup, ClubMemberListItem } from "@/types/club";

// Noamany runs in Egypt only: national-ID and currency wording need no per-gym localisation.
const localizeNationalId = (label: string) => label;
const localizeCurrency = (label: string) => label;

interface GroupRow {
  id: number;
  name: string;
  category: string;
  branch_id: number | null;
  max_members: number;
  current_members: number;
  is_active: boolean;
  discount_type: string;
  discount_amount: number;
  plans?: Array<{ subscriptionTypeId: number; name: string; discountType: 'percentage' | 'fixed'; discountValue: number }>;
  discountedSubscriptions: number;
  totalDiscount: number;
}
interface GroupMember {
  id: number;
  memberCode: string;
  name: string;
  phone: string | null;
  cardNumber: string | null;
  groupEmployeeNumber?: string | null;
  joinedAt: string;
}
interface DiscountRow {
  id: number;
  subscriptionNumber: string;
  memberCode: string | null;
  memberName: string | null;
  subscriptionType: string | null;
  registrationDate: string;
  grossValue: number;
  discountValue: number;
  netValue: number;
  paidAmount: number;
  remainingAmount: number;
  groupDiscount: ClubMemberGroup | null;
}
interface Page<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}
const emptyForm = {
  name: "",
  category: "",
  maxMembers: "",
  /** "all" = the default rule only; "plans" = the default rule plus customised packages. */
  discountScope: "all" as "plans" | "all",
  plans: [newGroupPlanDraft()] as GroupPlanDraft[],
  discountType: "none",
  discountAmount: "",
};

const groupPrimaryActionClass =
  "bg-accent-foreground text-card hover:bg-accent-foreground/90 dark:bg-primary dark:text-primary-foreground dark:hover:bg-primary/90";

export function ClubMemberGroupsPage() {
  const { locale } = useLocale();
  const text = (ar: string, en: string) => (locale === "ar" ? ar : en);
  const numbers = new Intl.NumberFormat(locale === "ar" ? "ar-EG" : "en-GB");
  const { can } = usePermission();
  const canCreate = can("club.members.groups:create");
  const canUpdate = can("club.members.groups:update");
  const canDelete = can("club.members.groups:delete");
  const canExport = can("club.members.groups:export");
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const invalidDates = !!dateFrom && !!dateTo && dateFrom > dateTo;
  const filters = {
    search: search.trim() || undefined,
    includeInactive: String(includeInactive),
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  };
  const groupsQuery = useQuery({
    queryKey: ["club-member-groups", filters],
    queryFn: async ({ signal }) =>
      (
        await api.get<GroupRow[]>("/club-member-groups", {
          params: filters,
          signal,
        })
      ).data,
    enabled: !invalidDates,
  });
  const groups = groupsQuery.data ?? [];
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selected = groups.find((group) => group.id === selectedId) ?? null;
  useEffect(() => {
    if (
      groupsQuery.data &&
      !groupsQuery.data.some((group) => group.id === selectedId)
    ) {
      setSelectedId(groupsQuery.data[0]?.id ?? null);
    }
  }, [groupsQuery.data, selectedId]);
  const [tab, setTab] = useState("members");
  const [memberSearch, setMemberSearch] = useState("");
  const [memberPage, setMemberPage] = useState(1);
  const [discountPage, setDiscountPage] = useState(1);
  const [pendingMembers, setPendingMembers] = useState<ClubMemberListItem[]>(
    [],
  );
  useEffect(() => {
    setMemberPage(1);
    setDiscountPage(1);
    setMemberSearch("");
    setPendingMembers([]);
  }, [selectedId]);
  useEffect(() => {
    setDiscountPage(1);
  }, [dateFrom, dateTo]);
  const membersQuery = useQuery({
    queryKey: [
      "club-member-groups",
      selectedId,
      "members",
      memberPage,
      memberSearch,
    ],
    queryFn: async ({ signal }) =>
      (
        await api.get<Page<GroupMember>>(
          `/club-member-groups/${selectedId}/members`,
          {
            params: {
              page: memberPage,
              pageSize: 20,
              search: memberSearch || undefined,
            },
            signal,
          },
        )
      ).data,
    enabled: selectedId != null && tab === "members",
  });
  const discountsQuery = useQuery({
    queryKey: [
      "club-member-groups",
      selectedId,
      "discounts",
      discountPage,
      dateFrom,
      dateTo,
    ],
    queryFn: async ({ signal }) =>
      (
        await api.get<Page<DiscountRow>>(
          `/club-member-groups/${selectedId}/discounts`,
          {
            params: {
              page: discountPage,
              pageSize: 20,
              dateFrom: dateFrom || undefined,
              dateTo: dateTo || undefined,
            },
            signal,
          },
        )
      ).data,
    enabled: selectedId != null && tab === "discounts" && !invalidDates,
  });
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [formError, setFormError] = useState("");
  const refresh = async () => {
    await Promise.all(
      ["club-member-groups", "club-members", "club-private-subscriptions"].map(
        (key) => qc.invalidateQueries({ queryKey: [key] }),
      ),
    );
  };
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (editId ? !canUpdate : !canCreate) return;
    const amount = Number(form.discountAmount);
    if (!form.name.trim()) {
      setFormError(text("اكتب اسم المجموعة.", "Enter a group name."));
      return;
    }
    const plansError = form.discountScope === "plans" ? groupPlansError(form.plans, text) : null;
    if (plansError) {
      setFormError(plansError);
      return;
    }
    if (
      form.discountType !== "none" &&
      (!Number.isFinite(amount) ||
        amount <= 0 ||
        (form.discountType === "percentage" && amount > 100))
    ) {
      setFormError(
        text(
          "اكتب خصمًا أكبر من صفر، والنسبة لا تتجاوز 100%.",
          "Enter a positive discount; percentages cannot exceed 100%.",
        ),
      );
      return;
    }
    setSaving(true);
    setFormError("");
    try {
      const body = {
        name: form.name.trim(),
        category: form.category.trim() || undefined,
        maxMembers: Number(form.maxMembers) || 0,
        discountType: form.discountType,
        discountAmount: form.discountType === "none" ? 0 : amount,
        plans: form.discountScope === "plans"
          ? form.plans.map((plan) => ({ subscriptionTypeId: Number(plan.subscriptionTypeId), discountType: plan.discountType, discountValue: Number(plan.discountValue) }))
          : [],
      };
      const response = editId
        ? await api.put<GroupRow>(`/club-member-groups/${editId}`, body)
        : await api.post<GroupRow>("/club-member-groups", body);
      setOpen(false);
      await refresh();
      setSelectedId(response.data.id);
      setTab("members");
      toast.success(text("تم حفظ المجموعة.", "Group saved."));
    } catch (error) {
      setFormError(apiError(error));
    } finally {
      setSaving(false);
    }
  };
  const openCreate = () => {
    setEditId(null);
    setForm(emptyForm);
    setFormError("");
    setOpen(true);
  };
  const openEdit = (group: GroupRow) => {
    setEditId(group.id);
    setForm({
      name: group.name,
      category: group.category,
      maxMembers: group.max_members ? String(group.max_members) : "",
      discountScope: group.plans?.length ? "plans" : "all",
      plans: group.plans?.length
        ? group.plans.map((plan) => ({ ...newGroupPlanDraft(), subscriptionTypeId: String(plan.subscriptionTypeId), discountType: plan.discountType, discountValue: String(plan.discountValue) }))
        : [newGroupPlanDraft()],
      discountType: group.discount_type,
      discountAmount: String(group.discount_amount || ""),
    });
    setFormError("");
    setOpen(true);
  };
  const archive = async (group: GroupRow) => {
    if (
      !canDelete ||
      busy ||
      !(await confirm({
        title: text("أرشفة المجموعة؟", "Archive this group?"),
        description: text(
          "يتوقف خصمها للاشتراكات والتجديدات التالية. يظل سجل الخصومات السابقة متاحًا في التقارير.",
          "Stops future group discounts and keeps its past discount history available in reports.",
        ),
        variant: "destructive",
      }))
    )
      return;
    setBusy(true);
    try {
      await api.delete(`/club-member-groups/${group.id}`);
      await refresh();
      toast.success(text("تمت أرشفة المجموعة.", "Group archived."));
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setBusy(false);
    }
  };
  const addMembers = async () => {
    if (!canUpdate || !selected?.is_active || busy || !pendingMembers.length)
      return;
    setBusy(true);
    try {
      const { data } = await api.post<{ added: number }>(
        `/club-member-groups/${selected.id}/members`,
        { memberIds: pendingMembers.map((member) => member.id) },
      );
      setPendingMembers([]);
      await refresh();
      toast.success(
        `${text("تمت إضافة", "Added")} ${numbers.format(data.added)} ${text("عضو.", "members.")}`,
      );
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setBusy(false);
    }
  };
  const removeMember = async (member: GroupMember) => {
    if (
      !canDelete ||
      !selected?.is_active ||
      busy ||
      !(await confirm({
        title: text(
          "إزالة العضو من المجموعة؟",
          "Remove this member from the group?",
        ),
        description: member.name,
      }))
    )
      return;
    setBusy(true);
    try {
      await api.delete(
        `/club-member-groups/${selected.id}/members/${member.id}`,
      );
      await refresh();
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setBusy(false);
    }
  };
  const exportGroups = async (groupId?: number) => {
    if (!canExport || exporting || invalidDates) return;
    setExporting(true);
    try {
      const { data } = await api.get<Blob>("/club-member-groups/export", {
        params: { ...filters, groupId },
        responseType: "blob",
      });
      downloadBlob(data, `member-groups${groupId ? `-${groupId}` : ""}.xlsx`);
      toast.success(
        text(
          "تم تنزيل التقرير بكل الصفوف.",
          "Downloaded the report with all rows.",
        ),
      );
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setExporting(false);
    }
  };
  const paging = (
    page: number,
    total: number,
    setPage: (page: number) => void,
  ) =>
    total > 20 && (
      <div className="flex flex-wrap items-center justify-between gap-3 border-t p-4 text-sm">
        <span>
          {text("الصفحة", "Page")} {numbers.format(page)} /{" "}
          {numbers.format(Math.ceil(total / 20))} · {numbers.format(total)}{" "}
          {text("سجل", "records")}
        </span>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            {text("السابق", "Previous")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={page * 20 >= total}
            onClick={() => setPage(page + 1)}
          >
            {text("التالي", "Next")}
          </Button>
        </div>
      </div>
    );
  const rule = (group: GroupRow) => {
    const base = group.discount_type === "percentage"
      ? `${numbers.format(group.discount_amount)}%`
      : group.discount_type === "fixed"
        ? formatMoney(group.discount_amount)
        : text("بدون خصم", "No discount");
    if (!group.plans?.length) return base;
    const custom = group.plans.map((plan) => `${plan.name}: ${plan.discountType === "percentage" ? `${numbers.format(plan.discountValue)}%` : formatMoney(plan.discountValue)}`).join(" · ");
    return group.discount_type === "none" ? custom : `${text("الافتراضي", "Default")}: ${base} · ${custom}`;
  };
  return (
    <div className="space-y-6">
      <PageHeader
        title={text("مجموعات الأعضاء", "Member groups")}
        description={text(
          "أضف الأعضاء، واضبط خصم كل مجموعة، وتابع قيمته الفعلية على الاشتراكات.",
          "Add members, set each group’s discount, and track the actual discounts applied to subscriptions.",
        )}
        actions={
          <div className="flex flex-wrap gap-2">
            {canExport && (
              <Button
                variant="outline"
                disabled={exporting || invalidDates || !groups.length}
                onClick={() => void exportGroups()}
              >
                {exporting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Download className="size-4" />
                )}
                {text("تصدير Excel", "Export Excel")}
              </Button>
            )}
            {canCreate && (
              <Button
                variant="secondary"
                className={groupPrimaryActionClass}
                onClick={openCreate}
              >
                <Plus className="size-4" />
                {text("مجموعة جديدة", "New group")}
              </Button>
            )}
          </div>
        }
      />
      <div className="flex flex-wrap items-end gap-4 rounded-xl border bg-card p-4">
        <div className="grid min-w-48 flex-1 gap-2">
          <Label htmlFor="groups-search">
            {text("البحث في المجموعات", "Search groups")}
          </Label>
          <Input
            id="groups-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={text("اسم المجموعة", "Group name")}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="groups-from">
            {text("الخصومات من", "Discounts from")}
          </Label>
          <Input
            id="groups-from"
            type="date"
            dir="ltr"
            value={dateFrom}
            onChange={(event) => setDateFrom(event.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="groups-to">{text("إلى", "To")}</Label>
          <Input
            id="groups-to"
            type="date"
            dir="ltr"
            value={dateTo}
            onChange={(event) => setDateTo(event.target.value)}
          />
        </div>
        <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4 accent-primary"
            checked={includeInactive}
            onChange={(event) => setIncludeInactive(event.target.checked)}
          />
          {text("عرض المؤرشفة", "Include archived")}
        </label>
        {(search || dateFrom || dateTo) && (
          <Button
            variant="ghost"
            onClick={() => {
              setSearch("");
              setDateFrom("");
              setDateTo("");
            }}
          >
            {text("مسح الفلاتر", "Clear filters")}
          </Button>
        )}
      </div>
      {invalidDates && (
        <p role="alert" className="text-sm text-destructive">
          {text(
            "تاريخ البداية يجب أن يسبق تاريخ النهاية.",
            "The start date must be before the end date.",
          )}
        </p>
      )}
      {invalidDates ? null : groupsQuery.isError ? (
        <ErrorState
          message={apiError(groupsQuery.error)}
          onRetry={() => void groupsQuery.refetch()}
        />
      ) : groupsQuery.isLoading ? (
        <p role="status" className="py-10 text-center text-muted-foreground">
          {text("جاري تحميل المجموعات…", "Loading groups…")}
        </p>
      ) : !groups.length ? (
        <div className="rounded-xl border bg-card px-6 py-12 text-center">
          <Users className="mx-auto mb-4 size-8 text-muted-foreground" />
          <h2 className="text-lg font-semibold">
            {text("لا توجد مجموعات مطابقة", "No matching groups")}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {text(
              "ابدأ بمجموعة جديدة ثم أضف أعضاءها بالبحث.",
              "Create a group, then search for its members.",
            )}
          </p>
          {canCreate && (
            <Button
              className={cn("mt-5", groupPrimaryActionClass)}
              variant="secondary"
              onClick={openCreate}
            >
              {text("إنشاء مجموعة", "Create group")}
            </Button>
          )}
        </div>
      ) : (
        <div className="grid min-w-0 gap-5 lg:grid-cols-[18rem_minmax(0,1fr)]">
          <div className="min-w-0">
            <div className="grid gap-2 lg:hidden">
              <Label htmlFor="selected-group">
                {text("المجموعة", "Group")}
              </Label>
              <select
                id="selected-group"
                className="h-11 rounded-md border bg-background px-3 text-base"
                value={selectedId ?? ""}
                onChange={(event) => setSelectedId(Number(event.target.value))}
              >
                {groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name} · {numbers.format(group.current_members)}{" "}
                    {text("عضو", "members")}
                  </option>
                ))}
              </select>
            </div>
            <nav
              aria-label={text("المجموعات", "Groups")}
              className="hidden max-h-[42rem] space-y-2 overflow-y-auto lg:block"
            >
              {groups.map((group) => (
                <button
                  key={group.id}
                  type="button"
                  aria-current={selectedId === group.id ? "true" : undefined}
                  onClick={() => setSelectedId(group.id)}
                  className={cn(
                    "w-full rounded-xl border p-4 text-start transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    selectedId === group.id
                      ? "border-primary/40 bg-primary/5"
                      : "bg-card hover:bg-muted",
                  )}
                >
                  <p className="break-words font-semibold">
                    {group.name}
                    {!group.is_active && (
                      <span className="ms-2 text-sm font-normal text-muted-foreground">
                        {text("مؤرشفة", "Archived")}
                      </span>
                    )}
                  </p>
                  <p className="mt-2 flex flex-wrap justify-between gap-2 text-sm text-muted-foreground">
                    <span>
                      {numbers.format(group.current_members)}{" "}
                      {text("عضو", "members")}
                    </span>
                    <span className="nums text-accent-foreground dark:text-primary">
                      {rule(group)}
                    </span>
                  </p>
                  <p className="mt-3 border-t pt-3 text-sm">
                    {text("خصومات الفترة", "Period discounts")}{" "}
                    <b className="nums">{formatMoney(group.totalDiscount)}</b>
                  </p>
                </button>
              ))}
            </nav>
          </div>
          {selected && (
            <section
              className="min-w-0 overflow-hidden rounded-xl border bg-card"
              aria-label={selected.name}
            >
              <div className="space-y-4 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="break-words text-xl font-semibold">
                      {selected.name}
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {selected.category} ·{" "}
                      {numbers.format(selected.current_members)}{" "}
                      {text("عضو", "members")}
                      {selected.max_members > 0 &&
                        ` / ${numbers.format(selected.max_members)}`}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {canExport && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={exporting || invalidDates}
                        onClick={() => void exportGroups(selected.id)}
                      >
                        <Download className="size-4" />
                        {text("تقرير المجموعة", "Group report")}
                      </Button>
                    )}
                    {canUpdate && selected.is_active && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openEdit(selected)}
                      >
                        <Pencil className="size-4" />
                        {text("تعديل", "Edit")}
                      </Button>
                    )}
                    {canDelete && selected.is_active && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => void archive(selected)}
                      >
                        {text("أرشفة", "Archive")}
                      </Button>
                    )}
                  </div>
                </div>
                <GroupDiscountNotice
                  group={{
                    id: selected.id,
                    name: selected.name,
                    discountType: selected.discount_type,
                    discountAmount: selected.discount_amount,
                  }}
                />
                <p className="text-sm text-muted-foreground">
                  {text(
                    "إجمالي خصومات الفترة",
                    "Total discounts for this period",
                  )}
                  :{" "}
                  <b className="nums text-foreground">
                    {formatMoney(selected.totalDiscount)}
                  </b>{" "}
                  · {numbers.format(selected.discountedSubscriptions)}{" "}
                  {text(
                    "اشتراك. التاريخ حسب يوم تسجيل الاشتراك.",
                    "subscriptions. Dates refer to subscription registration.",
                  )}
                </p>
              </div>
              <Tabs value={tab} onValueChange={setTab}>
                <TabsList className="mx-5 mb-4">
                  <TabsTrigger value="members">
                    {text("الأعضاء", "Members")}
                  </TabsTrigger>
                  <TabsTrigger value="discounts">
                    {text("سجل الخصومات", "Discount history")}
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="members" className="mt-0">
                  {canUpdate && selected.is_active && (
                    <div className="space-y-3 border-y bg-muted/20 p-5">
                      <Label htmlFor="group-member-picker">
                        {text(
                          "إضافة أعضاء للمجموعة",
                          "Add members to the group",
                        )}
                      </Label>
                      <MemberSearchCombobox
                        id="group-member-picker"
                        branchId={selected.branch_id ?? undefined}
                        selectedMember={null}
                        onClear={() => undefined}
                        disabled={busy || pendingMembers.length >= 200}
                        resetOnSelect
                        excludedMemberIds={pendingMembers.map(
                          (member) => member.id,
                        )}
                        onSelect={(member) => {
                          if (member.group?.id === selected.id) {
                            toast.info(
                              text(
                                "العضو موجود بالفعل في هذه المجموعة.",
                                "This member is already in the group.",
                              ),
                            );
                            return;
                          }
                          if (member.group && member.group.id !== selected.id) {
                            toast.error(
                              `${text("العضو مرتبط بالمجموعة", "Member belongs to group")}: ${member.group.name}`,
                            );
                            return;
                          }
                          setPendingMembers((current) =>
                            current.some((item) => item.id === member.id)
                              ? current
                              : [...current, member],
                          );
                        }}
                      />
                      <p className="text-sm text-muted-foreground">
                        {localizeNationalId(text(
                          "ابحث بكود العضو أولاً، أو الاسم أو الموبايل أو الرقم القومي. اختر أكثر من عضو ثم أضفهم معًا.",
                          "Search by member code first, or by name, phone, or national ID. Select several members, then add them together.",
                        ))}
                      </p>
                      {pendingMembers.length > 0 && (
                        <>
                          <ul className="flex max-h-40 flex-wrap gap-2 overflow-y-auto">
                            {pendingMembers.map((member) => (
                              <li
                                key={member.id}
                                className="flex min-w-0 items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm"
                              >
                                <span className="break-words">
                                  {member.name} ·{" "}
                                  <bdi className="nums">
                                    {member.memberCode}
                                  </bdi>
                                </span>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="size-7 shrink-0"
                                  aria-label={`${text("إلغاء اختيار", "Deselect")} ${member.name}`}
                                  disabled={busy}
                                  onClick={() =>
                                    setPendingMembers((current) =>
                                      current.filter(
                                        (item) => item.id !== member.id,
                                      ),
                                    )
                                  }
                                >
                                  <X className="size-4" />
                                </Button>
                              </li>
                            ))}
                          </ul>
                          <Button
                            variant="secondary"
                            className={groupPrimaryActionClass}
                            disabled={busy}
                            onClick={() => void addMembers()}
                          >
                            {busy ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              <Plus className="size-4" />
                            )}
                            {text("إضافة", "Add")}{" "}
                            {numbers.format(pendingMembers.length)}{" "}
                            {text("عضو للمجموعة", "members to group")}
                          </Button>
                        </>
                      )}
                    </div>
                  )}
                  <div className="p-5">
                    <Label
                      htmlFor="existing-members-search"
                      className="sr-only"
                    >
                      {text(
                        "البحث داخل أعضاء المجموعة",
                        "Search group members",
                      )}
                    </Label>
                    <div className="relative">
                      <Search className="absolute start-3 top-3 size-4 text-muted-foreground" />
                      <Input
                        id="existing-members-search"
                        className="ps-9"
                        value={memberSearch}
                        placeholder={text(
                          "البحث داخل أعضاء المجموعة…",
                          "Search group members…",
                        )}
                        onChange={(event) => {
                          setMemberSearch(event.target.value);
                          setMemberPage(1);
                        }}
                      />
                    </div>
                  </div>
                  {membersQuery.isError ? (
                    <div className="px-5 pb-5">
                      <ErrorState
                        message={apiError(membersQuery.error)}
                        onRetry={() => void membersQuery.refetch()}
                      />
                    </div>
                  ) : membersQuery.isLoading ? (
                    <p role="status" className="p-6">
                      {text("جاري تحميل الأعضاء…", "Loading members…")}
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-start text-sm">
                        <caption className="sr-only">
                          {text("أعضاء المجموعة", "Group members")}
                        </caption>
                        <thead className="bg-muted/40">
                          <tr>
                            {[
                              text("العضو", "Member"),
                              text("الموبايل", "Phone"),
                              localizeNationalId(text("الرقم القومي", "National ID")),
                              text("الرقم الوظيفي", "Employee no."),
                              text("الإجراء", "Action"),
                            ].map((label) => (
                              <th
                                key={label}
                                scope="col"
                                className="whitespace-nowrap px-5 py-3 text-start font-medium"
                              >
                                {label}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {membersQuery.data?.data.map((member) => (
                            <tr key={member.id} className="border-t">
                              <td className="px-5 py-3">
                                <p className="min-w-36 font-medium">
                                  {member.name}
                                </p>
                                <bdi className="nums text-muted-foreground">
                                  {member.memberCode}
                                </bdi>
                              </td>
                              <td className="nums whitespace-nowrap px-5 py-3">
                                <bdi>{member.phone ?? "—"}</bdi>
                              </td>
                              <td className="nums whitespace-nowrap px-5 py-3">
                                <bdi>{member.cardNumber ?? "—"}</bdi>
                              </td>
                              <td className="nums whitespace-nowrap px-5 py-3">
                                <bdi>{member.groupEmployeeNumber || "—"}</bdi>
                              </td>
                              <td className="px-5 py-3">
                                {canDelete && selected.is_active && (
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    disabled={busy}
                                    aria-label={`${text("إزالة", "Remove")} ${member.name}`}
                                    title={text(
                                      "إزالة من المجموعة",
                                      "Remove from group",
                                    )}
                                    onClick={() => void removeMember(member)}
                                  >
                                    <Trash2 className="size-4 text-destructive" />
                                  </Button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {membersQuery.data?.total === 0 && (
                        <p className="p-8 text-center text-muted-foreground">
                          {memberSearch
                            ? text(
                                "لا يوجد أعضاء مطابقون للبحث.",
                                "No matching members.",
                              )
                            : text(
                                "المجموعة لا تحتوي على أعضاء بعد. استخدم البحث لإضافتهم.",
                                "This group has no members yet. Use search to add them.",
                              )}
                        </p>
                      )}
                    </div>
                  )}
                  {paging(
                    memberPage,
                    membersQuery.data?.total ?? 0,
                    setMemberPage,
                  )}
                </TabsContent>
                <TabsContent value="discounts" className="mt-0">
                  {discountsQuery.isError ? (
                    <div className="p-5">
                      <ErrorState
                        message={apiError(discountsQuery.error)}
                        onRetry={() => void discountsQuery.refetch()}
                      />
                    </div>
                  ) : discountsQuery.isLoading ? (
                    <p role="status" className="p-6">
                      {text(
                        "جاري تحميل سجل الخصومات…",
                        "Loading discount history…",
                      )}
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <caption className="sr-only">
                          {text(
                            "خصومات المجموعة المحفوظة وقت تسجيل الاشتراك",
                            "Group discounts saved when subscriptions were created",
                          )}
                        </caption>
                        <thead className="bg-muted/40">
                          <tr>
                            {[
                              text("الاشتراك / العضو", "Subscription / member"),
                              text("التسجيل", "Registration"),
                              text("القاعدة المحفوظة", "Saved rule"),
                              text("قبل الخصم", "Gross"),
                              text("الخصم الفعلي", "Actual discount"),
                              text("الصافي", "Net"),
                              text("المدفوع", "Paid"),
                              text("المتبقي", "Remaining"),
                            ].map((label) => (
                              <th
                                key={label}
                                scope="col"
                                className="whitespace-nowrap px-4 py-3 text-start font-medium"
                              >
                                {label}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {discountsQuery.data?.data.map((row) => (
                            <tr key={row.id} className="border-t">
                              <td className="min-w-48 px-4 py-3">
                                <p className="font-medium">
                                  {row.memberName} · <bdi>{row.memberCode}</bdi>
                                </p>
                                <p className="text-muted-foreground">
                                  {row.subscriptionType} ·{" "}
                                  <bdi>{row.subscriptionNumber}</bdi>
                                </p>
                              </td>
                              <td className="nums whitespace-nowrap px-4 py-3">
                                {row.registrationDate}
                              </td>
                              <td className="whitespace-nowrap px-4 py-3">
                                {row.groupDiscount?.discountType ===
                                "percentage"
                                  ? `${numbers.format(row.groupDiscount.discountAmount)}%`
                                  : formatMoney(
                                      row.groupDiscount?.discountAmount ?? 0,
                                    )}
                              </td>
                              {[
                                row.grossValue,
                                row.discountValue,
                                row.netValue,
                                row.paidAmount,
                                row.remainingAmount,
                              ].map((value, index) => (
                                <td
                                  key={index}
                                  className={cn(
                                    "nums whitespace-nowrap px-4 py-3",
                                    index === 1 &&
                                      "font-medium text-accent-foreground dark:text-primary",
                                  )}
                                >
                                  {formatMoney(value)}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {discountsQuery.data?.total === 0 && (
                        <p className="p-8 text-center text-muted-foreground">
                          {text(
                            "لا توجد خصومات مسجلة في هذه الفترة. تظهر هنا الاشتراكات والتجديدات الجديدة التي طبّق عليها خصم المجموعة.",
                            "No recorded discounts for this period. New subscriptions and renewals using the group discount appear here.",
                          )}
                        </p>
                      )}
                    </div>
                  )}
                  {paging(
                    discountPage,
                    discountsQuery.data?.total ?? 0,
                    setDiscountPage,
                  )}
                </TabsContent>
              </Tabs>
            </section>
          )}
        </div>
      )}
      <Dialog open={open} onOpenChange={(value) => !saving && setOpen(value)}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>
              {editId
                ? text("تعديل المجموعة والخصم", "Edit group and discount")
                : text("مجموعة جديدة", "New group")}
            </DialogTitle>
            <DialogDescription>
              {text(
                "يُحفظ الخصم على كل اشتراك جديد أو تجديد. تغيير هذه القاعدة لا يغيّر أي اشتراك أو تجديد مجدول محفوظ بالفعل.",
                "The discount is saved on each new subscription or renewal. Changing the rule does not change existing subscriptions or saved queued renewals.",
              )}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={(event) => void save(event)} className="space-y-5">
            <div className="grid gap-2">
              <Label htmlFor="group-name">
                {text("اسم المجموعة", "Group name")}
              </Label>
              <Input
                id="group-name"
                required
                maxLength={200}
                autoFocus
                value={form.name}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="group-category">
                  {text("التصنيف (اختياري)", "Category (optional)")}
                </Label>
                <Input
                  id="group-category"
                  maxLength={100}
                  value={form.category}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      category: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="group-capacity">
                  {text("الحد الأقصى للأعضاء", "Member limit")}
                </Label>
                <Input
                  id="group-capacity"
                  type="number"
                  min={0}
                  step={1}
                  value={form.maxMembers}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      maxMembers: event.target.value,
                    }))
                  }
                />
                <p className="text-sm text-muted-foreground">
                  {text(
                    "اتركه فارغًا لعدد غير محدود.",
                    "Leave blank for unlimited members.",
                  )}
                </p>
              </div>
            </div>
            <fieldset className="space-y-3">
              <legend className="mb-1 font-medium">
                {text("خصم المجموعة", "Group discount")}
              </legend>
              <p className="text-sm text-muted-foreground">
                {text(
                  "الخصم الافتراضي بيتطبق تلقائي على كل الباقات. لو عايز باقة معينة بخصم مختلف فعّل التخصيص تحت.",
                  "The default discount applies automatically to every package. Turn on customisation below to give specific packages a different discount.",
                )}
              </p>
              <p className="text-sm font-medium">{text("الخصم الافتراضي على كل الباقات", "Default discount on all packages")}</p>
              <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {[
                  ["none", text("بدون خصم", "No discount")],
                  ["percentage", text("نسبة مئوية", "Percentage")],
                  ["fixed", localizeCurrency(text("مبلغ بالجنيه", "Amount in EGP"))],
                ].map(([value, label]) => (
                  <label
                    key={value}
                    className={cn(
                      "flex min-h-11 cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm",
                      form.discountType === value &&
                        "border-primary bg-primary/5",
                    )}
                  >
                    <input
                      type="radio"
                      name="group-discount-type"
                      value={value}
                      checked={form.discountType === value}
                      onChange={() =>
                        setForm((current) => ({
                          ...current,
                          discountType: value,
                        }))
                      }
                      className="accent-primary"
                    />
                    {label}
                  </label>
                ))}
              </div>
              {form.discountType !== "none" && (
                <div className="grid gap-2">
                  <Label htmlFor="group-discount-amount">
                    {form.discountType === "percentage"
                      ? text("النسبة %", "Percentage %")
                      : localizeCurrency(text(
                          "قيمة الخصم بالجنيه لكل اشتراك",
                          "Discount in EGP per subscription",
                        ))}
                  </Label>
                  <Input
                    id="group-discount-amount"
                    className="nums"
                    type="number"
                    min={0.01}
                    max={form.discountType === "percentage" ? 100 : 99999999.99}
                    step="0.01"
                    required
                    value={form.discountAmount}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        discountAmount: event.target.value,
                      }))
                    }
                  />
                  <p className="text-sm text-muted-foreground">
                    {text(
                      "الخصم لا يتجاوز سعر الباقة، ويُطبّق مرة واحدة على كل اشتراك.",
                      "The discount is capped at the package price and applied once per subscription.",
                    )}
                  </p>
                </div>
              )}
            </div>
              <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md border px-3 py-2.5 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5 size-4 accent-primary"
                  checked={form.discountScope === "plans"}
                  onChange={(event) => setForm((current) => ({ ...current, discountScope: event.target.checked ? "plans" : "all" }))}
                />
                <span className="grid gap-0.5">
                  <span className="font-medium">{text("تخصيص خصم لباقات معينة", "Customise the discount for specific packages")}</span>
                  <span className="text-muted-foreground">
                    {text(
                      "كل باقة تختارها هنا تاخد الخصم بتاعها (نسبة أو مبلغ)، والباقي ياخد الخصم الافتراضي. عايز الخصم على الباقات دي بس؟ خلّي الافتراضي «بدون خصم».",
                      "Each package here gets its own discount (percent or amount); the rest use the default. Want the discount on these packages only? Set the default to «No discount».",
                    )}
                  </span>
                </span>
              </label>
              {form.discountScope === "plans" ? (
                <MemberGroupPlansEditor plans={form.plans} onChange={(plans) => setForm((current) => ({ ...current, plans }))} />
              ) : null}
            </fieldset>
            {formError && (
              <p role="alert" className="text-sm text-destructive">
                {formError}
              </p>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                onClick={() => setOpen(false)}
              >
                {text("إلغاء", "Cancel")}
              </Button>
              <Button
                type="submit"
                variant="secondary"
                className={groupPrimaryActionClass}
                disabled={saving}
              >
                {saving && <Loader2 className="size-4 animate-spin" />}
                {text("حفظ المجموعة", "Save group")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
