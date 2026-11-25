import { BadgePercent } from "lucide-react";
import { formatMoney } from "@/lib/formatters";
import { memberGroupDiscountValue } from "@/lib/member-group-discount";
import { useLocale } from "@/store/locale";
import type { ClubMemberGroup } from "@/types/club";

export function GroupDiscountNotice({
  group,
  grossValue,
  historical = false,
  compact = false,
}: {
  group?: ClubMemberGroup | null;
  grossValue?: number;
  historical?: boolean;
  compact?: boolean;
}) {
  const { locale } = useLocale();
  const text = (ar: string, en: string) => (locale === "ar" ? ar : en);
  if (!group) return null;
  const rule =
    group.discountType === "percentage"
      ? `${group.discountAmount}%`
      : group.discountType === "fixed"
        ? formatMoney(group.discountAmount)
        : text("بدون خصم", "No discount");
  const applied = historical
    ? (group.appliedValue ?? 0)
    : grossValue != null
      ? memberGroupDiscountValue(grossValue, group)
      : null;
  return (
    <div
      className={
        compact
          ? "flex flex-wrap items-center gap-1.5 text-sm text-accent-foreground dark:text-primary"
          : "space-y-2 rounded-xl border border-primary/25 bg-primary/5 p-4 text-sm"
      }
    >
      <p className="flex min-w-0 flex-wrap items-center gap-2 font-medium">
        <BadgePercent className="size-4 shrink-0" />
        <span className="break-words">
          {text("المجموعة", "Group")}: {group.name}
        </span>
        <span className="nums">· {rule}</span>
        {applied != null && (
          <span className="nums">
            · {text("الخصم", "Discount")}: {formatMoney(applied)}
          </span>
        )}
      </p>
      {!compact && (
        <p className="text-muted-foreground">
          {historical
            ? text(
                "الخصم المحفوظ وقت تسجيل الاشتراك؛ تغيير إعدادات المجموعة لا يغيّره.",
                "Saved when this subscription was created; changing the group does not change it.",
              )
            : grossValue == null
              ? text(
                  "يُطبّق تلقائيًا على كل اشتراك جديد وتجديد، دون جمعه مع خصم آخر. الاشتراكات المحفوظة تحتفظ بخصمها الأصلي.",
                  "Applied automatically to every new subscription and renewal without combining discounts. Saved subscriptions keep their original discount.",
                )
              : text(
                  "يُطبّق تلقائيًا على هذه الباقة، دون جمعه مع خصم آخر. أي تعديل لاحق يسري على الاشتراكات والتجديدات التالية.",
                  "Applied automatically to this package without combining discounts. Later changes apply to subsequent subscriptions and renewals.",
                )}
        </p>
      )}
    </div>
  );
}
