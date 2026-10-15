import { useSearchParams } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/store/auth";
import { useLocale } from "@/store/locale";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ClubMemberListItem } from "@/types/club";
export function TrainerMemberPicker({
  member,
  onSelect,
}: {
  member: ClubMemberListItem | null;
  onSelect: (value: ClubMemberListItem | null) => void;
}) {
  const { locale } = useLocale();
  const userId = useAuth((s) => s.user?.sub);
  const [params] = useSearchParams();
  const [search, setSearch] = useState(() => params.get("code") ?? "");
  const [term, setTerm] = useState(search);
  const initialSelection = useRef(false);
  useEffect(() => {
    const timer = setTimeout(() => setTerm(search), 250);
    return () => clearTimeout(timer);
  }, [search]);
  const tr = (a: string, e: string) => (locale === "ar" ? a : e);
  const members = useQuery({
    queryKey: ["trainer-training-members", userId, term],
    queryFn: async () =>
      (
        await api.get<
          Pick<ClubMemberListItem, "id" | "name" | "memberCode" | "branchId">[]
        >("/trainer-portal/training/members", { params: { search: term } })
      ).data,
  });
  useEffect(() => {
    if (initialSelection.current || !members.data) return;
    initialSelection.current = true;
    const requested = Number(params.get("member"));
    const found = members.data.find((m) => m.id === requested);
    if (found) onSelect(found as ClubMemberListItem);
  }, [members.data, params, onSelect]);
  return (
    <div className="space-y-3">
      <Input
        aria-label={tr("ابحث بين عملائك", "Search your clients")}
        placeholder={tr(
          "ابحث بالاسم أو كود العضو…",
          "Search by name or member code…",
        )}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <select
        id="training-member"
        className="min-h-11 w-full rounded-lg border bg-background px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        value={member?.id ?? ""}
        onChange={(e) => {
          const next = members.data?.find(
            (m) => m.id === Number(e.target.value),
          );
          onSelect(next ? (next as ClubMemberListItem) : null);
        }}
      >
        <option value="">
          {tr("اختار من عملائك", "Select one of your clients")}
        </option>
        {member && !members.data?.some((m) => m.id === member.id) && (
          <option value={member.id}>
            {member.name} · {member.memberCode}
          </option>
        )}
        {members.data?.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name} · {m.memberCode}
          </option>
        ))}
      </select>
      <p role={members.isError ? "alert" : "status"} className="text-sm text-muted-foreground">
        {members.isLoading
          ? tr("جارٍ تحميل عملائك…", "Loading your clients…")
          : members.isError
            ? tr("تعذر تحميل العملاء.", "Could not load your clients.")
            : !members.data?.length
              ? tr(
                  "لا يوجد عملاء مطابقون. اربط العضو بمدرب أو أسند له اشتراك تدريب أو برنامجًا من الإدارة.",
                  "No matching clients. Administration can link a member to a coach or assign a personal training subscription or program.",
                )
              : tr(
                  "تعرض القائمة العملاء المسندين إليك فقط.",
                  "Only your assigned clients appear here.",
                )}
      </p>
      {members.isError && (
        <Button
          permissionAction={null}
          variant="outline"
          onClick={() => void members.refetch()}
        >
          {tr("إعادة المحاولة", "Retry")}
        </Button>
      )}
    </div>
  );
}
