import {
  CalendarDays,
  Clock3,
  CreditCard,
  History,
  Loader2,
  LogIn,
  RefreshCw,
} from "lucide-react";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MemberAvatar } from "@/components/club/member-avatar";
import { memberAvatarUrl } from "@/lib/member-photo";
import { StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api, apiError } from "@/lib/api";
import { formatDate, formatDateTime, formatTimeFromDate } from "@/lib/formatters";
import { cn, toArabicDigits, formatDigits } from "@/lib/utils";
import { useLocale } from "@/store/locale";
import type { ClubMemberListItem } from "@/types/club";

export type MemberProfileSubject = Pick<
  ClubMemberListItem,
  "id" | "name" | "memberCode" | "phone" | "profilePicture" | "branchId"
>;

interface ProfileSubscription {
  id: number;
  subscriptionNumber: string;
  subscriptionType: string | null;
  status: "active" | "expired" | "upcoming" | "frozen";
  startDate: string;
  endDate: string;
  projectedEndDate?: string | null;
  totalDays: number;
  elapsedDays: number;
  remainingDays: number;
  isLinkedToSessions: boolean;
  sessionsCount: number | null;
  sessionsUsed: number;
  sessionsRemaining: number | null;
  attendanceDays: number;
  attendanceEntries: number;
  lastAttendanceDate: string | null;
  isRenewal: boolean;
}

interface ProfileAttendance {
  id: number;
  subscriptionId: number | null;
  attendanceDate: string;
  checkInTime: string;
  checkOutTime: string | null;
  duration: number | null;
  status: string;
}

interface ProfileLockerHandoff {
  id: number;
  lockerNumber: string;
  assignedAt: string;
  releasedAt: string | null;
}

interface MemberProfileSummary {
  member: ClubMemberListItem;
  totals: {
    subscriptions: number;
    renewals: number;
    attendanceDays: number;
    attendanceEntries: number;
    lastAttendanceDate: string | null;
  };
  subscriptions: ProfileSubscription[];
  recentAttendance: ProfileAttendance[];
  lockerHandoffs?: ProfileLockerHandoff[];
}

/**
 * Big member photo for identity checks at the desk. Rendered only when the member
 * actually has one, so a missing or placeholder picture leaves no empty frame.
 */
function MemberIdentityPhoto({
  name,
  profilePicture,
}: {
  name?: string | null;
  profilePicture?: string | null;
}) {
  const url = memberAvatarUrl(profilePicture);
  const [failed, setFailed] = useState(false);
  if (!url || failed) return null;

  return (
    <figure className="overflow-hidden rounded-2xl border bg-muted/30">
      <img
        src={url}
        alt={name ?? ""}
        onError={() => setFailed(true)}
        className="max-h-[46vh] w-full object-contain"
      />
    </figure>
  );
}

function metricProgress(value: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((value / total) * 100)));
}

function SummaryMetric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof CreditCard;
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-2xl border bg-card p-3 shadow-sm">
      <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="size-4 text-primary" />
        <span>{label}</span>
      </div>
      <p className="nums text-xl font-bold text-foreground">
        {toArabicDigits(value)}
      </p>
    </div>
  );
}

function ProfileSubscriptionCard({
  subscription,
}: {
  subscription: ProfileSubscription;
}) {
  const { ui } = useLocale();
  const exhausted =
    subscription.isLinkedToSessions &&
    subscription.sessionsCount != null &&
    subscription.sessionsRemaining === 0;
  const progress = subscription.isLinkedToSessions
    ? metricProgress(subscription.sessionsUsed, subscription.sessionsCount ?? 0)
    : metricProgress(subscription.elapsedDays, subscription.totalDays);

  return (
    <article className="space-y-4 rounded-2xl border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="font-semibold">
              {subscription.subscriptionType ?? "—"}
            </h4>
            {subscription.isRenewal ? (
              <span className="rounded-full bg-sky-500/10 px-2 py-0.5 text-xs font-medium text-sky-700 dark:text-sky-200">
                {ui("تجديد")}
              </span>
            ) : null}
          </div>
          <p className="nums mt-1 text-xs text-muted-foreground">
            {subscription.subscriptionNumber}
          </p>
        </div>
        <StatusBadge
          status={
            exhausted || subscription.status === "expired"
              ? "expired"
              : subscription.status === "active"
                ? "active"
                : subscription.status === "frozen"
                  ? "info"
                  : "pending"
          }
          label={
            exhausted
              ? ui("الحصص منتهية")
              : subscription.status === "frozen"
                ? ui("مجمّد")
                : undefined
          }
        />
      </div>

      <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
        <div className="rounded-xl bg-muted/55 p-2.5">
          <p className="text-xs text-muted-foreground">{ui("من")}</p>
          <p className="nums mt-1 font-medium">
            {formatDate(subscription.startDate)}
          </p>
        </div>
        <div className="rounded-xl bg-muted/55 p-2.5">
          <p className="text-xs text-muted-foreground">{subscription.projectedEndDate ? ui("الانتهاء بعد التجميد") : ui("إلى")}</p>
          <p className="nums mt-1 font-medium">
            {formatDate(subscription.projectedEndDate || subscription.endDate)}
          </p>
        </div>
        <div className="rounded-xl bg-muted/55 p-2.5">
          <p className="text-xs text-muted-foreground">{ui("أيام الحضور")}</p>
          <p className="nums mt-1 font-semibold">
            {toArabicDigits(subscription.attendanceDays)}
          </p>
        </div>
        <div className="rounded-xl bg-muted/55 p-2.5">
          <p className="text-xs text-muted-foreground">{ui("مرات الدخول")}</p>
          <p className="nums mt-1 font-semibold">
            {toArabicDigits(subscription.attendanceEntries)}
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          {subscription.isLinkedToSessions ? (
            <>
              <span>
                {ui("استخدم")}{" "}
                <b className="nums">
                  {toArabicDigits(subscription.sessionsUsed)}
                </b>{" "}
                {ui("من")}{" "}
                <b className="nums">
                  {toArabicDigits(subscription.sessionsCount ?? 0)}
                </b>{" "}
                {ui("حصة")}
              </span>
              <span className="nums font-semibold text-primary">
                {toArabicDigits(subscription.sessionsRemaining ?? 0)}{" "}
                {ui("متبقية")}
              </span>
            </>
          ) : (
            <>
              <span>
                {ui("مرّ")}{" "}
                <b className="nums">
                  {toArabicDigits(subscription.elapsedDays)}
                </b>{" "}
                {ui("من")}{" "}
                <b className="nums">{toArabicDigits(subscription.totalDays)}</b>{" "}
                {ui("يوم")}
              </span>
              <span className="nums font-semibold text-primary">
                {toArabicDigits(subscription.remainingDays)} {ui("يوم متبقٍ")}
              </span>
            </>
          )}
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div
            role="progressbar"
            aria-label={
              subscription.isLinkedToSessions
                ? ui("الحصص المستخدمة")
                : ui("المدة المنقضية من الاشتراك")
            }
            aria-valuemin={0}
            aria-valuemax={
              subscription.isLinkedToSessions
                ? (subscription.sessionsCount ?? 0)
                : subscription.totalDays
            }
            aria-valuenow={
              subscription.isLinkedToSessions
                ? subscription.sessionsUsed
                : subscription.elapsedDays
            }
            className={cn(
              "h-full rounded-full bg-primary transition-[width]",
              exhausted && "bg-destructive",
            )}
            style={{ width: `${progress}%` }}
          />
        </div>
        {subscription.lastAttendanceDate ? (
          <p className="text-xs text-muted-foreground">
            {ui("آخر حضور في هذا الاشتراك")}:{" "}
            <span className="nums">
              {formatDate(subscription.lastAttendanceDate)}
            </span>
          </p>
        ) : null}
      </div>
    </article>
  );
}

export function MemberProfileSheet({
  member,
  open,
  onOpenChange,
}: {
  member: MemberProfileSubject | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { ui, locale } = useLocale();
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["club-member-profile-summary", member?.id],
    enabled: open && member != null,
    refetchInterval: open ? 10_000 : false,
    refetchIntervalInBackground: false,
    queryFn: async () => {
      const { data: result } = await api.get<MemberProfileSummary>(
        `/club-members/${member!.id}/profile-summary`,
      );
      return result;
    },
  });
  const currentSubscription = data?.subscriptions.find(
    (subscription) =>
      subscription.status === "active" || subscription.status === "frozen",
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="start"
        className="w-full overflow-y-auto p-0 sm:max-w-2xl"
      >
        <SheetHeader className="sticky top-0 z-10 border-b bg-card/95 px-5 py-5 pe-12 backdrop-blur">
          <div className="flex items-center gap-3">
            <MemberAvatar
              name={member?.name}
              profilePicture={member?.profilePicture}
              size="lg"
              className="size-14 text-lg"
            />
            <div className="min-w-0 flex-1">
              <SheetTitle className="truncate text-xl">
                {member?.name ?? ui("ملف العضو")}
              </SheetTitle>
              <SheetDescription className="nums mt-1 flex flex-wrap gap-x-3 gap-y-1">
                <span>{member?.memberCode}</span>
                {member?.phone ? (
                  <span>{formatDigits(member.phone)}</span>
                ) : null}
              </SheetDescription>
            </div>
            <Button
              variant="ghost"
              size="icon"
              aria-label={ui("تحديث البيانات")}
              disabled={isFetching}
              onClick={() => void refetch()}
            >
              <RefreshCw
                className={cn("size-4", isFetching && "animate-spin")}
              />
            </Button>
          </div>
        </SheetHeader>

        <div className="space-y-5 p-5">
          {isLoading ? (
            <div className="flex min-h-72 items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
              {ui("جاري تحميل تفاصيل العضو…")}
            </div>
          ) : isError ? (
            <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-5 text-center">
              <p className="text-sm text-destructive">{apiError(error)}</p>
              <Button
                className="mt-3"
                variant="outline"
                onClick={() => void refetch()}
              >
                {ui("إعادة المحاولة")}
              </Button>
            </div>
          ) : data ? (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <SummaryMetric
                  icon={CreditCard}
                  label={ui("الاشتراكات")}
                  value={data.totals.subscriptions}
                />
                <SummaryMetric
                  icon={History}
                  label={ui("التجديدات المسجلة")}
                  value={data.totals.renewals}
                />
                <SummaryMetric
                  icon={CalendarDays}
                  label={ui("أيام الحضور")}
                  value={data.totals.attendanceDays}
                />
                <SummaryMetric
                  icon={LogIn}
                  label={ui("مرات الدخول")}
                  value={data.totals.attendanceEntries}
                />
              </div>

              <Tabs defaultValue="summary" dir="rtl">
                <TabsList className="grid h-auto w-full grid-cols-2 sm:grid-cols-4">
                  <TabsTrigger value="summary">{ui("الملخص")}</TabsTrigger>
                  <TabsTrigger value="subscriptions">
                    {ui("الاشتراكات")}
                  </TabsTrigger>
                  <TabsTrigger value="attendance">{ui("الحضور")}</TabsTrigger>
                  <TabsTrigger value="lockers">{ui("اللوكر")}</TabsTrigger>
                </TabsList>

                <TabsContent value="summary" className="space-y-3">
                  <h3 className="font-semibold">{ui("الاشتراك الحالي")}</h3>
                  {currentSubscription ? (
                    <ProfileSubscriptionCard
                      subscription={currentSubscription}
                    />
                  ) : (
                    <p className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                      {ui("لا توجد اشتراكات مسجلة")}
                    </p>
                  )}
                  {data.totals.lastAttendanceDate ? (
                    <div className="flex items-center gap-2 rounded-xl border bg-muted/35 p-3 text-sm">
                      <Clock3 className="size-4 text-primary" />
                      <span>{ui("آخر يوم حضور")}</span>
                      <span className="nums ms-auto font-semibold">
                        {formatDate(data.totals.lastAttendanceDate)}
                      </span>
                    </div>
                  ) : null}

                  {/* Large identity photo — reception matches the face at the desk against
                      this, so it fills the space left below the summary cards. */}
                  <MemberIdentityPhoto
                    name={member?.name}
                    profilePicture={member?.profilePicture}
                  />
                </TabsContent>

                <TabsContent value="subscriptions" className="space-y-3">
                  {data.subscriptions.map((subscription) => (
                    <ProfileSubscriptionCard
                      key={subscription.id}
                      subscription={subscription}
                    />
                  ))}
                  {!data.subscriptions.length ? (
                    <p className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                      {ui("لا توجد اشتراكات مسجلة")}
                    </p>
                  ) : null}
                </TabsContent>

                <TabsContent value="attendance" className="space-y-2">
                  {data.totals.attendanceEntries >
                  data.recentAttendance.length ? (
                    <p className="text-xs text-muted-foreground">
                      {ui(
                        "يُعرض آخر 100 دخول، بينما الأرقام الإجمالية تشمل سجل الحضور كاملًا.",
                      )}
                    </p>
                  ) : null}
                  {data.recentAttendance.map((row) => (
                    <div
                      key={row.id}
                      className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-3 text-sm"
                    >
                      <div className="min-w-[8rem]">
                        <p className="nums font-semibold">
                          {formatDate(row.attendanceDate)}
                        </p>
                        <p className="nums text-xs text-muted-foreground">
                          {formatTimeFromDate(row.checkInTime)}
                        </p>
                      </div>
                      <div className="ms-auto text-end">
                        <p className="nums">
                          {row.duration != null
                            ? `${toArabicDigits(row.duration)} ${ui("دقيقة")}`
                            : ui("داخل الجيم الآن")}
                        </p>
                        {row.checkOutTime ? (
                          <p className="nums text-xs text-muted-foreground">
                            {ui("الخروج")}:{" "}
                            {formatTimeFromDate(row.checkOutTime)}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  ))}
                  {!data.recentAttendance.length ? (
                    <p className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                      {ui("لا يوجد حضور مسجل")}
                    </p>
                  ) : null}
                </TabsContent>

                <TabsContent value="lockers" className="space-y-2">
                  {(data.lockerHandoffs ?? []).map((row) => (
                    <div
                      key={row.id}
                      className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-3 text-sm"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold">
                          {ui("لوكر رقم")}{" "}
                          <span className="nums">{row.lockerNumber}</span>
                        </p>
                        <p className="nums text-xs text-muted-foreground">
                          {ui("استلم الساعة")}{" "}
                          {formatDateTime(row.assignedAt, locale === "en" ? "en" : "ar", { seconds: true })}
                        </p>
                      </div>
                      <p className="nums text-end text-xs text-muted-foreground">
                        {row.releasedAt
                          ? `${ui("سلّم الساعة")} ${formatDateTime(row.releasedAt, locale === "en" ? "en" : "ar", { seconds: true })}`
                          : ui("لسه معاه")}
                      </p>
                    </div>
                  ))}
                  {!(data.lockerHandoffs ?? []).length ? (
                    <p className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                      {ui("مفيش لوكر متسجل للعضو")}
                    </p>
                  ) : null}
                </TabsContent>
              </Tabs>
            </>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
