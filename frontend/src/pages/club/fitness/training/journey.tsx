import { formatDisplayNumber } from '@/lib/number-display';
import {PlannedDayHistory, RecordedSession} from './history';
import {bodyFields} from '@/components/training/body-model';
import { dayLabel,savedDayNumber } from './day-number';
import { exerciseLabel, matchesExercise } from './exercise-label';
import { WorkoutDay, openWorkoutSheet } from "./workout-sheet";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  Activity,
  ArrowRightLeft,
  Dumbbell,
  Plus,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { api, apiError } from "@/lib/api";
import { useAuth } from "@/store/auth";
import { useLocale } from "@/store/locale";
import { useTrainingAccess } from "@/pages/club/fitness/training/access";
import { PageHeader } from "@/components/common/page-header";
import { TrainerMemberPicker } from "@/components/training/trainer-member-picker";
import { MemberSearchCombobox } from "@/components/club/member-search-combobox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { MuscleMap } from "@/components/training/muscle-map";
import { ExercisePreview } from "@/components/training/exercise-preview";
import {
  MemberMuscleOverview,
  MuscleLegend,
} from "@/components/training/muscle-overview";
import { BodyMeasurementsPanel } from "@/components/training/body-measurements";
import { PhotoComparison } from "@/components/training/photo-comparison";
import { localToday } from "@/lib/formatters";
import type { ClubMemberListItem } from "@/types/club";
import type {
  Exercise,
  Journey,
  Muscle,
  Plan,
  PlanDay,
  Session,
} from "./model";
import { ExerciseTrends } from "@/components/training/exercise-trends";
import { ExerciseEditor, PlanBuilder } from "./editors";

export function TrainingJourneyPage() {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const tr = (a: string, e: string) => (ar ? a : e);
  const { can, base, trainerPortal } = useTrainingAccess();
  const user = useAuth((s) => s.user);
  const [tab, setTab] = useState("history"),
    [member, setMember] = useState<ClubMemberListItem | null>(null),
    [search, setSearch] = useState("");
  const [editExercise, setEditExercise] = useState<Exercise | null | undefined>(
      undefined,
    ),
    [editPlan, setEditPlan] = useState<Plan | null | undefined>(undefined);
  const [previewExercise, setPreviewExercise] = useState<Exercise | null>(null);
  const [libraryExerciseKey, setLibraryExerciseKey] = useState("");
  const [action, setAction] = useState<"assign" | "handover" | "metric" | null>(
      null,
    ),
    [planId, setPlanId] = useState(""),
    [trainerId, setTrainerId] = useState(""),
    [start, setStart] = useState(localToday()),
    [note, setNote] = useState(""),
    [busy, setBusy] = useState(false);
  const [metric, setMetric] = useState({
    testKey: "waist",
    label: tr("محيط الوسط", "Waist circumference"),
    unit: "cm",
    protocol: tr(
      "قياس محيط الوسط بشريط في نفس الوضع",
      "Tape measurement at the waist in the same posture",
    ),
    side: "both",
    value: "",
    date: localToday(),
  });
  const [olderSessions, setOlderSessions] = useState<Session[]>([]),
    [historyCursor, setHistoryCursor] = useState<string | null | undefined>(
      undefined,
    ),
    [historyVisible, setHistoryVisible] = useState(30),
    [loadingHistory, setLoadingHistory] = useState(false);
  useEffect(() => {
    setOlderSessions([]);
    setHistoryCursor(undefined);
    setHistoryVisible(30);
    setLoadingHistory(false);
    setSelectedSession(null);
    setAction(null);
  }, [member?.id]);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null),
    [sessionNote, setSessionNote] = useState("");
  const catalog = useQuery({
    queryKey: ["training-catalog", base, user?.sub],
    queryFn: async () =>
      (
        await api.get<{ muscles: Muscle[]; exercises: Exercise[] }>(
          `${base}/catalog`,
        )
      ).data,
  });
  const plans = useQuery({
    queryKey: ["training-plans", base, user?.sub],
    queryFn: async () => (await api.get<Plan[]>(`${base}/plans`)).data,
  });
  const journey = useQuery({
    queryKey: ["training-journey", base, user?.sub, member?.id],
    enabled: !!member,
    refetchInterval: 15000,
    queryFn: async () =>
      (await api.get<Journey>(`${base}/members/${member!.id}`)).data,
  });
  const trainers = useQuery({
    queryKey: ["training-trainers", base, user?.sub, member?.id],
    enabled: !!member && (action === "assign" || action === "handover"),
    queryFn: async () => {
      const data = (
        await api.get(`${base}/trainers`, {
          params: { memberId: member?.id },
        })
      ).data;
      return (data.data ?? data) as { id: number; name: string }[];
    },
  });
  const muscles = catalog.data?.muscles ?? [],
    exercises = catalog.data?.exercises ?? [],
    data = journey.data;
  const currentMemberId = useRef(member?.id);
  currentMemberId.current = member?.id;
  const operationBusy = useRef(false);
  const planLocale = data?.assignment?.snapshot.days[0]?.reportLocale ?? locale;
  const planText = (a: string, e: string) => planLocale === "ar" ? a : e;
  const libraryExercises = exercises.filter((e) =>
    matchesExercise(e, search, locale),
  );
  const libraryExercise =
    libraryExercises.find((e) => e.key === libraryExerciseKey) ??
    libraryExercises[0];
  const sessionHistory = [...(data?.sessions ?? []), ...olderSessions].filter(
    (s, i, all) => all.findIndex((x) => x.id === s.id) === i,
  );
  async function olderHistory() {
    if (!member || !data || loadingHistory) return;
    const requestedMemberId = member.id;
    setLoadingHistory(true);
    try {
      if (historyVisible >= sessionHistory.length) {
        const cursor =
          historyCursor === undefined ? data.nextSessionCursor : historyCursor;
        if (cursor) {
          const page = (
            await api.get<{ sessions: Session[]; nextCursor: string | null }>(
              `${base}/members/${member.id}/sessions`,
              { params: { cursor } },
            )
          ).data;
          if (currentMemberId.current !== requestedMemberId) return;
          setOlderSessions((old) => [...old, ...page.sessions]);
          setHistoryCursor(page.nextCursor);
        }
      }
      if (currentMemberId.current === requestedMemberId) setHistoryVisible((v) => v + 30);
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      if (currentMemberId.current === requestedMemberId) setLoadingHistory(false);
    }
  }
  async function submit() {
    if (!member || !action || operationBusy.current) return;
    const permission = action === "assign" ? "club.fitness.programs:create" : action === "handover" ? "club.fitness.programs:update" : "club.fitness.assessments:create";
    if (!can(permission)) return;
    operationBusy.current = true;
    setBusy(true);
    try {
      if (action === "assign")
        await api.post(`${base}/members/${member.id}/assign`, {
          planId: Number(planId),
          trainerId: trainerId ? Number(trainerId) : null,
          startDate: start,
        });
      else if (action === "handover")
        await api.post(`${base}/members/${member.id}/handover`, {
          trainerId: Number(trainerId),
          note,
        });
      else
        await api.post(`${base}/members/${member.id}/metrics`, {
          ...metric,
          value: Number(metric.value),
        });
      await journey.refetch();
      setAction(null);
      toast.success(tr("تم الحفظ", "Saved"));
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      operationBusy.current = false;
      setBusy(false);
    }
  }
  function newSession(day: PlanDay) {
    if (!data?.assignment) return;
    setSessionNote("");
    setSelectedSession({
      id: crypto.randomUUID(),
      revision: 0,
      assignment_id: data.assignment.id,
      day_id: day.id,
      date: localToday(),
      status: "in_progress",
      note: "",
      author: "",
      entries: day.exercises.map((e) => ({
        ...e,
        skipped: false,
        coachNote: e.note,
        note: "",
        sets: Array.from({ length: e.sets }, () => ({
          weight: 0,
          reps: e.reps,
          seconds: e.seconds,
          done: false,
        })),
      })),
    });
  }
  const canEditSession =
    selectedSession?.revision === 0
      ? can("club.fitness.progress:create")
      : can("club.fitness.progress:update");
  async function saveSession() {
    if (!member || !selectedSession || !canEditSession || operationBusy.current) return;
    operationBusy.current = true;
    setBusy(true);
    try {
      await (selectedSession.revision === 0 ? api.post : api.put)(
        `${base}/members/${member.id}/sessions`,
        {
          ...selectedSession,
          assignmentId: selectedSession.assignment_id,
          dayId: selectedSession.day_id,
          note: sessionNote,
        },
      );
      setSelectedSession(null);
      await journey.refetch();
      toast.success(tr("تم حفظ الحصة", "Session saved"));
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      operationBusy.current = false;
      setBusy(false);
    }
  }
  if (editPlan !== undefined)
    return (
      <PlanBuilder
        initial={editPlan}
        exercises={exercises}
        muscles={muscles}
        onExerciseSaved={async () => { await catalog.refetch(); }}
        onClose={() => setEditPlan(undefined)}
        onSaved={() => void plans.refetch()}
      />
    );
  return (
    <div className="training-workspace space-y-6">
      <PageHeader
        title={tr("مساحة التدريب", "Training workspace")}
        actions={!trainerPortal &&
          <Link
            className="text-sm text-primary underline underline-offset-4"
            to="?legacy=1"
          >
            {tr("البرامج السابقة", "Legacy programs")}
          </Link>
        }
      />
      <p className="max-w-3xl text-muted-foreground">
        {tr(
          "من أول خطة لآخر مجموعة. برنامج واضح للعميل، وتاريخ متصل لكل كابتن.",
          "From the first plan to the last set. Clear member programs and a continuous coaching history.",
        )}
      </p>
      <nav
        className="mx-auto grid w-full max-w-4xl grid-cols-2 gap-1 rounded-xl bg-muted/60 p-1.5 lg:flex lg:w-fit lg:justify-center"
        aria-label={tr("مساحة التدريب", "Training workspace")}
      >
        {[
          ["history", tr("المتابعة والسجل", "History"), Activity],
          ["measurements", tr("المقاسات والهدف", "Measurements & target"), Activity],
          [
            "library",
            tr("مكتبة العضلات والتمارين", "Exercise & muscle library"),
            Dumbbell,
          ],
          ["plans", tr("البرامج", "Programs"), Dumbbell],
        ].map(([key, label, Icon]) => {
          const I = Icon as typeof Activity;
          return (
            <Button
              permissionAction={null}
              key={String(key)}
              variant={tab === key ? "brand" : "ghost"}
              className="h-auto min-h-12 whitespace-normal px-3 py-3 text-center leading-relaxed lg:px-5"
              aria-pressed={tab === key}
              onClick={() => setTab(String(key))}
            >
              <I className="size-4" />
              {String(label)}
            </Button>
          );
        })}
      </nav>
      {(catalog.isError || plans.isError) && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 rounded-xl bg-muted p-5"
        >
          <span>
            {tr(
              "تعذر تحميل مساحة التدريب.",
              "Unable to load the training workspace.",
            )}
          </span>
          <Button
            permissionAction={null}
            variant="outline"
            onClick={() => {
              void catalog.refetch();
              void plans.refetch();
            }}
          >
            <RefreshCw className="size-4" />
            {tr("إعادة المحاولة", "Retry")}
          </Button>
        </div>
      )}
      {tab === "library" && (
        <>
          <div className="flex flex-wrap gap-3">
            <Input
              className="max-w-md"
              aria-label={tr("بحث التمارين", "Search exercises")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={tr("ابحث عن تمرين…", "Search exercises…")}
            />
            {can('club.subscriptions.special:create') && <Button asChild variant="outline" permissionAction={null}><Link to="/club/packages/settings?tab=special"><Plus className="size-4" />{tr('إضافة كلاس', 'Add class')}</Link></Button>}
            {can("club.fitness.strength:create") && (
              <Button
                permissionAction={null}
                onClick={() => setEditExercise(null)}
              >
                <Plus className="size-4" />
                {tr("تمرين جديد", "New exercise")}
              </Button>
            )}
          </div>
          <div className="grid gap-5 md:grid-cols-[minmax(260px,340px)_1fr]">
            <aside className="rounded-xl border bg-card p-5">
              <h2 className="text-lg font-semibold">
                {tr("عضلات التمرين", "Exercise muscles")}
              </h2>
              {libraryExercise && (
                <label className="my-4 block space-y-2 text-sm">
                  <span>
                    {tr(
                      "اختر تمرينًا لعرض عضلاته",
                      "Choose an exercise to view its muscles",
                    )}
                  </span>
                  <select
                    className="h-11 w-full min-w-0 rounded-md border bg-background px-3"
                    value={libraryExercise.key}
                    onChange={(e) => setLibraryExerciseKey(e.target.value)}
                  >
                    {libraryExercises.map((e) => (
                      <option key={e.key} value={e.key}>
                        {exerciseLabel(e, locale)}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <MuscleMap
                muscles={muscles}
                primary={libraryExercise?.primary}
                secondary={libraryExercise?.secondary}
              />
              <p className="mt-4 text-sm text-muted-foreground">
                {tr(
                  "الأحمر للعضلات الأساسية، والأحمر الفاتح للمساعدة. العرض متاح دون صلاحية التعديل.",
                  "Red marks primary muscles and lighter red marks assisting muscles. Viewing does not require edit permission.",
                )}
              </p>
              {libraryExercise && (
                <div className="mt-4">
                  <MuscleLegend exercise={libraryExercise} muscles={muscles} />
                </div>
              )}
            </aside>
            <div className="divide-y rounded-xl border bg-card">
              {catalog.isLoading ? (
                <p className="p-6" role="status">
                  {tr("تحميل التمارين…", "Loading exercises…")}
                </p>
              ) : (
                libraryExercises.map((e) => (
                  <div
                    key={e.key}
                    className="flex flex-wrap items-center justify-between gap-3 p-5"
                  >
                    <div>
                      <h3 className="font-semibold">{exerciseLabel(e, locale)}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {e.primary
                          .map((id) => muscles.find((m) => m.id === id))
                          .map((m) => (ar ? m?.ar : m?.en))
                          .join(" · ") ||
                          tr("لم تحدد العضلات بعد", "Muscles not configured")}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        permissionAction={null}
                        variant="outline"
                        onClick={() => {
                          setLibraryExerciseKey(e.key);
                          setPreviewExercise(e);
                        }}
                      >
                        {tr("عرض التفاصيل والعضلات", "View details & muscles")}
                      </Button>
                      {can("club.fitness.strength:update") && (!trainerPortal || e.editable) && (
                        <Button
                          permissionAction={null}
                          variant="outline"
                          onClick={() => setEditExercise(e)}
                        >
                          {tr("تعديل التمرين", "Edit exercise")}
                        </Button>
                      )}
                    </div>
                  </div>
                ))
              )}
              {!catalog.isLoading &&
                !catalog.isError &&
                !libraryExercises.length && (
                  <p className="p-6 text-muted-foreground">
                    {tr(
                      "لا توجد تمارين مطابقة. جرّب كلمة أخرى أو أضف تمرينًا.",
                      "No matching exercises. Try another search or add an exercise.",
                    )}
                  </p>
                )}
            </div>
          </div>
        </>
      )}
      {tab === "plans" && (
        <>
          <div className="flex justify-between gap-3">
            <h2 className="text-xl font-semibold">
              {tr("البرامج والإصدارات", "Programs & versions")}
            </h2>
            {can("club.fitness.programs:create") && (
              <Button
                permissionAction={null}
                disabled={!catalog.data}
                onClick={() => setEditPlan(null)}
              >
                <Plus className="size-4" />
                {tr("بناء برنامج", "Build program")}
              </Button>
            )}
          </div>
          {plans.isLoading ? (
            <p role="status">{tr("تحميل البرامج…", "Loading programs…")}</p>
          ) : !plans.data?.length ? (
            <div className="rounded-xl border border-dashed p-10">
              <h3 className="font-semibold">
                {tr("ابدأ بأول برنامج للنادي", "Build your first club program")}
              </h3>
              <p className="mt-2 text-muted-foreground">
                {tr(
                  "حدد عضلات التمارين، ثم رتب الأيام والمجموعات.",
                  "Configure exercise muscles, then arrange days and sets.",
                )}
              </p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {plans.data.map((p) => (
                <article key={p.id} className="rounded-xl border bg-card p-6">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-lg font-semibold">{p.name}</h3>
                    <span className="rounded-md bg-muted px-2 py-1 text-xs">
                      {p.status === "published"
                        ? tr("معتمد", "Approved")
                        : tr("مسودة", "Draft")}
                    </span>
                  </div>
                  <p className="mt-3 text-sm text-muted-foreground">{p.goal}</p>
                  <p className="my-5 text-sm">
                    {formatDisplayNumber(p.days.length)} {tr("أيام", "days")} · {formatDisplayNumber(p.weeks)}{" "}
                    {tr("أسابيع", "weeks")} · {tr("إصدار", "version")}{" "}
                    {formatDisplayNumber(p.revision)}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button permissionAction={null} variant="outline" onClick={() => openWorkoutSheet(p, {locale})}>
                      {tr("معاينة ورقة البرنامج", "Preview program sheet")}
                    </Button>
                    {can("club.fitness.programs:update") &&
                      ((!trainerPortal && [1, 3].includes(user?.level ?? 0)) ||
                        (p.status === "draft" &&
                          p.created_by === user?.sub)) && (
                        <Button
                          permissionAction={null}
                          variant="outline"
                          onClick={() => setEditPlan(p)}
                        >
                          {tr("فتح البرنامج", "Open program")}
                        </Button>
                      )}
                    {can("club.fitness.programs:create") && (
                      <Button
                        permissionAction={null}
                        variant="outline"
                        onClick={() =>
                          setEditPlan({
                            ...p,
                            id: undefined,
                            revision: undefined,
                            status: "draft",
                            name: `${p.name} — ${tr("نسخة", "copy")}`,
                          })
                        }
                      >
                        {tr("نسخة مخصصة", "Customize copy")}
                      </Button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </>
      )}
      {(tab === "history" || tab === "measurements") && (
        <>
          <div className="max-w-xl">
            <label
              htmlFor="training-member"
              className="mb-2 block text-sm font-medium"
            >
              {tr("العميل", "Member")}
            </label>
            {trainerPortal ? <TrainerMemberPicker member={member} onSelect={setMember} /> : <MemberSearchCombobox
              id="training-member"
              selectedMember={member}
              onSelect={setMember}
              onClear={() => setMember(null)}
            />}
          </div>
          {!member ? (
            <div className="grid items-center gap-6 rounded-xl border bg-card p-6 md:grid-cols-[240px_1fr]">
              <MuscleMap muscles={muscles} compact />
              <div>
                <h2 className="text-2xl font-semibold">
                  {tr("كل عميل له رحلة", "Every member has a journey")}
                </h2>
                <p className="mt-3 max-w-lg text-muted-foreground">
                  {tr(
                    "اختار العميل لعرض برنامجه، أداء كل مجموعة، تقييماته، وصوره المشتركة.",
                    "Select a member to see their program, individual sets, assessments and shared photos.",
                  )}
                </p>
              </div>
            </div>
          ) : journey.isLoading ? (
            <p role="status">
              {tr("تحميل رحلة العميل…", "Loading member journey…")}
            </p>
          ) : journey.isError ? (
            <div role="alert">
              <p>{apiError(journey.error)}</p>
              <Button
                permissionAction={null}
                variant="outline"
                onClick={() => void journey.refetch()}
              >
                {tr("إعادة المحاولة", "Retry")}
              </Button>
            </div>
          ) : (
            data && (
              <>
                <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
                  <section className="space-y-6">
                    {tab === "history" && <div className="rounded-xl border bg-card p-6" lang={planLocale} dir={planLocale === "ar" ? "rtl" : "ltr"}>
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                          <h2 className="text-2xl font-bold">
                            {data.assignment?.snapshot.name ??
                              planText("لم يُسند برنامج بعد", "No program assigned")}
                          </h2>
                          <p className="mt-2 text-muted-foreground">
                            {data.assignment?.snapshot.goal}
                          </p>
                          <p className="mt-3 text-sm">
                            {data.trainer?.name ??
                              planText("بدون كابتن محدد", "No coach assigned")}
                            {data.assignment &&
                              ` · ${planText("إصدار", "Version")} ${formatDisplayNumber(data.assignment.plan_revision)} · ${data.assignment.start_date}`}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {can("club.fitness.programs:create") && (
                            <Button
                              permissionAction={null}
                              onClick={() => {
                                setAction("assign");
                                setTrainerId(trainerPortal ? String(user?.trainer_id ?? "") : "");
                              }}
                            >
                              {planText("إسناد برنامج", "Assign program")}
                            </Button>
                          )}
                          {data.assignment &&
                            can("club.fitness.programs:update") && (
                              <Button
                                permissionAction={null}
                                variant="outline"
                                onClick={() => {
                                  setAction("handover");
                                  setTrainerId("");
                                  setNote("");
                                }}
                              >
                                <ArrowRightLeft className="size-4" />
                                {planText("تسليم المتابعة", "Coach handover")}
                              </Button>
                            )}
                        </div>
                      </div>
                      {data.assignment && (
                        <PlannedDayHistory assignment={data.assignment} sessions={sessionHistory} memberName={member.name} trainerName={data.trainer?.name} locale={locale} onExercise={setPreviewExercise} />
                      )}
                    </div>}
                    {tab === "measurements" && <BodyMeasurementsPanel
                      key={`${base}:${user?.sub}:${member.id}`}
                      memberId={member.id}
                      memberName={member.name}
                      body={data.body}
                      onReload={async () =>
                        (await journey.refetch()).data?.body
                      }
                    />}
                    {tab === "history" && <section className="rounded-xl border bg-card p-6">
                      <h2 className="text-xl font-semibold">
                        {tr("سجل الأداء", "Performance history")}
                      </h2>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {tr(
                          "كل مجموعة محفوظة بتاريخها. الحضور وتسجيل التمرين مؤشرات مستقلة.",
                          "Every set keeps its date. Attendance and workout logging are separate measures.",
                        )}
                      </p>
                      {data.assignment &&
                        can("club.fitness.progress:create") && (
                          <Button
                            permissionAction={null}
                            className="mt-4"
                            onClick={() =>
                              newSession(data.assignment!.snapshot.days[0])
                            }
                          >
                            <Plus className="size-4" />
                            {tr("تسجيل حصة", "Record session")}
                          </Button>
                        )}
                      <div className="mt-5 divide-y">
                        {!data.sessions.length ? (
                          <p className="py-6 text-muted-foreground">
                            {tr(
                              "لم تُسجل حصص بعد.",
                              "No sessions recorded yet.",
                            )}
                          </p>
                        ) : (
                          sessionHistory.slice(0, historyVisible).map((s) => (
                            <RecordedSession key={s.id} session={s} day={s.assignment_id === data.assignment?.id ? data.assignment.snapshot.days.map((d,index)=>({...d,name:savedDayNumber(d.name)??String(index+1)})).find(d => d.id === s.day_id) : undefined} memberName={member.name} trainerName={data.trainer?.name} locale={locale} canEdit={can("club.fitness.progress:update")} onEdit={() => {setSelectedSession(structuredClone(s));setSessionNote(s.note ?? "");}} />
                          ))
                        )}
                      </div>
                      {(sessionHistory.length > historyVisible ||
                        (historyCursor === undefined
                          ? data.nextSessionCursor
                          : historyCursor)) && (
                        <Button
                          permissionAction={null}
                          className="mt-4"
                          variant="outline"
                          disabled={loadingHistory}
                          onClick={() => void olderHistory()}
                        >
                          {loadingHistory
                            ? tr("تحميل…", "Loading…")
                            : tr("حصص أقدم", "Older sessions")}
                        </Button>
                      )}
                    </section>}
                    {tab === "history" && <section className="rounded-xl border bg-card p-6">
                      <ExerciseTrends sessions={sessionHistory} />
                    </section>}
                    {tab === "measurements" && <section className="rounded-xl border bg-card p-6">
                      <div className="flex flex-wrap justify-between gap-3">
                        <h2 className="text-xl font-semibold">
                          {tr(
                            "القياسات والتقييمات",
                            "Measurements & assessments",
                          )}
                        </h2>
                        {can("club.fitness.assessments:create") && (
                          <Button
                            permissionAction={null}
                            variant="outline"
                            onClick={() => {
                              const previous = data.metrics.find(
                                (m) => m.test_key === "waist",
                              );
                              setMetric({
                                testKey: previous?.test_key ?? "waist",
                                label:
                                  previous?.label ??
                                  tr("محيط الوسط", "Waist circumference"),
                                unit: previous?.unit ?? "cm",
                                protocol:
                                  previous?.protocol ??
                                  "قياس محيط الوسط بشريط في نفس الوضع",
                                side: previous?.side ?? "both",
                                value: "",
                                date: localToday(),
                              });
                              setAction("metric");
                            }}
                          >
                            <Plus className="size-4" />
                            {tr("تسجيل قياس", "Record metric")}
                          </Button>
                        )}
                      </div>
                      <div className="mt-4 divide-y">
                        {data.metrics.map((m) => (
                          <div
                            key={m.id}
                            className="flex flex-wrap justify-between gap-2 py-3"
                          >
                            <div>
                              {m.label}
                              <p className="mt-1 text-xs text-muted-foreground">
                                {m.date} ·{" "}
                                {m.side === "left"
                                  ? tr("يسار", "Left")
                                  : m.side === "right"
                                    ? tr("يمين", "Right")
                                    : tr("كلاهما", "Both")}{" "}
                                · {m.protocol}
                              </p>
                            </div>
                            <strong className="tabular-nums">
                              {formatDisplayNumber(m.value)} {m.unit}
                            </strong>
                          </div>
                        ))}
                        {!data.metrics.length && (
                          <p className="py-5 text-muted-foreground">
                            {tr(
                              "لا توجد قياسات. سجل الوحدة وطريقة الاختبار لإتاحة مقارنة صحيحة.",
                              "No metrics yet. Record units and protocol for a valid comparison.",
                            )}
                          </p>
                        )}
                      </div>
                    </section>}
                    {tab === "history" && <section className="rounded-xl border bg-card p-6"><h2 className="text-xl font-semibold">{tr("تقدم المقاسات", "Measurement progress")}</h2><p className="mt-2 text-sm text-muted-foreground">{data.body?.checkins[0]?.date ?? tr("لم تُسجل مقاسات بعد", "No measurements recorded yet")}</p><dl className="mt-4 grid gap-4 sm:grid-cols-3">{bodyFields.filter(f => ["weight", "waist", "hips"].includes(f.key)).map(f => {const current=data.body?.checkins[0]?.measurements[f.key],first=data.body?.baseline?.measurements[f.key];return <div key={f.key}><dt className="text-sm text-muted-foreground">{ar?f.ar:f.en}</dt><dd className="mt-1 font-semibold tabular-nums">{current ?? "—"} {f.unit}</dd>{current != null && first != null && <dd className="mt-1 text-sm tabular-nums">{tr("من البداية", "From baseline")}: {formatDisplayNumber(Math.round((current-first)*10)/10)} {f.unit}</dd>}</div>})}</dl><Button permissionAction={null} variant="outline" className="mt-5" onClick={()=>setTab("measurements")}>{tr("فتح المقاسات والهدف", "Open measurements & target")}</Button></section>}
                    {tab === "history" && ((!trainerPortal && [1, 3].includes(user?.level ?? 0)) ||
                      user?.is_trainer) && (
                      <details className="rounded-xl border bg-card p-6"><summary className="cursor-pointer py-2 font-semibold">{tr("صور التقدم والمقارنة", "Progress photos & comparison")} · {formatDisplayNumber(data.photos.length)}</summary><div className="mt-4">
                        <PhotoComparison
                          key={member.id}
                          photos={data.photos}
                          memberId={member.id}
                        />
                      </div></details>
                    )}
                  </section>
                  <aside className="space-y-6">
                    {tab === "history" && <MemberMuscleOverview
                      key={`${member.id}-${data.assignment?.id ?? "none"}`}
                      plan={data.assignment?.snapshot}
                      counts={data.muscleSets}
                      muscles={muscles}
                    />}
                    <section className="rounded-xl border bg-card p-5">
                      <h2 className="font-semibold">
                        {tr("محطات الرحلة", "Journey timeline")}
                      </h2>
                      <ol className="mt-4 space-y-5">
                        {data.events.map((e) => (
                          <li key={e.id}>
                            <p className="whitespace-pre-wrap text-sm">
                              {e.note}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {e.created_at.slice(0, 10)}
                            </p>
                          </li>
                        ))}
                      </ol>
                    </section>
                  </aside>
                </div>
              </>
            )
          )}
        </>
      )}
      {editExercise !== undefined && (
        <ExerciseEditor
          exercise={editExercise}
          muscles={muscles}
          onClose={() => setEditExercise(undefined)}
          onSaved={() => void catalog.refetch()}
        />
      )}
      {previewExercise && (
        <ExercisePreview
          exercise={previewExercise}
          onEdit={can('club.fitness.strength:update') && (!trainerPortal || previewExercise?.editable) ? () => {setEditExercise(previewExercise);setPreviewExercise(null);} : undefined}
          muscles={muscles}
          onClose={() => setPreviewExercise(null)}
        />
      )}
      <Dialog
        open={!!action}
        onOpenChange={(v) => {
          if (!v && !busy) setAction(null);
        }}
      >
        <DialogContent
          className="training-dialog"
          size="md"
          aria-describedby={undefined}
        >
          <DialogHeader>
            <DialogTitle>
              {action === "assign"
                ? tr("إسناد نسخة للعميل", "Assign member snapshot")
                : action === "handover"
                  ? tr("تسليم المتابعة", "Coach handover")
                  : tr("تسجيل قياس", "Record metric")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {action === "assign" && (
              <>
                <label className="block text-sm">
                  {tr("البرنامج", "Program")}
                  <select
                    className="mt-2 min-h-11 w-full rounded-lg border bg-background px-3"
                    value={planId}
                    onChange={(e) => setPlanId(e.target.value)}
                  >
                    <option value="">
                      {tr("اختار البرنامج", "Select program")}
                    </option>
                    {plans.data
                      ?.filter((p) => p.branch_id === member?.branchId)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} · v{formatDisplayNumber(p.revision)}
                        </option>
                      ))}
                  </select>
                </label>
                <label className="block text-sm">
                  {tr("تاريخ البداية", "Start date")}
                  <Input
                    type="date"
                    value={start}
                    onChange={(e) => setStart(e.target.value)}
                  />
                </label>
                <p className="text-sm text-muted-foreground">
                  {tr(
                    "يستبدل البرنامج النشط، ويحتفظ بكل الحصص السابقة.",
                    "Replaces the active program and preserves past sessions.",
                  )}
                </p>
              </>
            )}
            {(action === "assign" || action === "handover") && (
              <>
                <label className="block text-sm">
                  {tr("الكابتن", "Coach")}
                  <select
                    className="mt-2 min-h-11 w-full rounded-lg border bg-background px-3"
                    disabled={trainerPortal && action === "assign"}
                    value={trainerId}
                    onChange={(e) => setTrainerId(e.target.value)}
                  >
                    <option value="">
                      {tr("اختار الكابتن", "Select coach")}
                    </option>
                    {trainers.data?.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </label>
                {trainers.isError && (
                  <p role="alert">
                    {tr(
                      "تعذر تحميل الكباتن. أعد فتح النافذة للمحاولة.",
                      "Unable to load coaches. Reopen to retry.",
                    )}
                  </p>
                )}
              </>
            )}
            {action === "handover" && (
              <label className="block text-sm">
                {tr("ملاحظة التسليم للفريق", "Team handover note")}
                <Textarea
                  className="mt-2"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </label>
            )}
            {action === "metric" && (
              <>
                <label className="block text-sm">
                  {tr("الاختبار", "Test")}
                  <select
                    className="mt-2 min-h-11 w-full rounded-lg border bg-background px-3"
                    value={
                      metric.testKey.startsWith("custom:")
                        ? "new"
                        : metric.testKey
                    }
                    onChange={(e) => {
                      const key = e.target.value;
                      if (key === "new")
                        setMetric({
                          ...metric,
                          testKey: `custom:${crypto.randomUUID()}`,
                          label: "",
                          unit: "",
                          protocol: "",
                        });
                      else {
                        const previous = data?.metrics.find(
                          (m) => m.test_key === key,
                        );
                        setMetric({
                          ...metric,
                          testKey: key,
                          label:
                            previous?.label ??
                            tr("محيط الوسط", "Waist circumference"),
                          unit: previous?.unit ?? "cm",
                          protocol:
                            previous?.protocol ??
                            "قياس محيط الوسط بشريط في نفس الوضع",
                          side: previous?.side ?? "both",
                        });
                      }
                    }}
                  >
                    <option value="waist">
                      {tr("محيط الوسط", "Waist circumference")}
                    </option>
                    {data?.metrics
                      .filter(
                        (m, i, all) =>
                          m.test_key !== "waist" &&
                          all.findIndex((x) => x.test_key === m.test_key) === i,
                      )
                      .map((m) => (
                        <option key={m.test_key} value={m.test_key}>
                          {m.label}
                        </option>
                      ))}
                    <option value="new">
                      {tr("اختبار جديد / Mobility", "New test / Mobility")}
                    </option>
                  </select>
                </label>
                {(["label", "unit", "protocol", "value", "date"] as const).map(
                  (f, i) => (
                    <label key={f} className="block text-sm">
                      {
                        [
                          tr("اسم القياس", "Metric label"),
                          tr("الوحدة", "Unit"),
                          tr("طريقة القياس", "Measurement protocol"),
                          tr("القيمة", "Value"),
                          tr("التاريخ", "Date"),
                        ][i]
                      }
                      <Input
                        className="mt-2"
                        type={
                          f === "value"
                            ? "number"
                            : f === "date"
                              ? "date"
                              : "text"
                        }
                        step={f === "value" ? "any" : undefined}
                        value={metric[f]}
                        onChange={(e) =>
                          setMetric({ ...metric, [f]: e.target.value })
                        }
                      />
                    </label>
                  ),
                )}
                <label className="block text-sm">
                  {tr("الجانب", "Side")}
                  <select
                    className="mt-2 min-h-11 w-full rounded-lg border bg-background px-3"
                    value={metric.side}
                    onChange={(e) =>
                      setMetric({ ...metric, side: e.target.value })
                    }
                  >
                    {["both", "left", "right"].map((v, i) => (
                      <option key={v} value={v}>
                        {ar ? ["كلاهما", "يسار", "يمين"][i] : v}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}
            <Button
              permissionAction={null}
              disabled={
                busy ||
                (action === "assign" && !planId) ||
                (action === "handover" && (!trainerId || !note.trim())) ||
                (action === "metric" &&
                  (!metric.value ||
                    !metric.label.trim() ||
                    !metric.unit.trim() ||
                    !metric.protocol.trim()))
              }
              onClick={() => void submit()}
            >
              {busy ? tr("حفظ…", "Saving…") : tr("حفظ", "Save")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!selectedSession}
        onOpenChange={(v) => {
          if (!v && !busy) setSelectedSession(null);
        }}
      >
        <DialogContent
          className="training-dialog"
          size="lg"
          aria-describedby={undefined}
        >
          <DialogHeader>
            <DialogTitle>
              {tr("تفاصيل الحصة", "Session detail")} · {selectedSession?.date}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-5">
            {selectedSession?.revision === 0 && (
              <label className="block text-sm">
                {tr("تاريخ الحصة", "Session date")}
                <Input
                  type="date"
                  max={localToday()}
                  min={data?.assignment?.start_date}
                  value={selectedSession.date}
                  onChange={(e) =>
                    setSelectedSession((old) =>
                      old ? { ...old, date: e.target.value } : old,
                    )
                  }
                />
              </label>
            )}
            {selectedSession?.revision === 0 && (
              <label className="block text-sm">
                {tr("يوم البرنامج", "Program day")}
                <select
                  className="mt-2 min-h-11 w-full rounded-lg border bg-background px-3"
                  value={selectedSession.day_id ?? ""}
                  onChange={(e) => {
                    const day = data?.assignment?.snapshot.days.find(
                      (d) => d.id === e.target.value,
                    );
                    if (day) newSession(day);
                  }}
                >
                  {data?.assignment?.snapshot.days.map((d) => (
                    <option key={d.id} value={d.id}>
                      {dayLabel(d, d.reportLocale ?? locale)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="block text-sm">
              {tr("حالة الحصة", "Session status")}
              <select
                disabled={!canEditSession}
                className="mt-2 min-h-11 w-full rounded-lg border bg-background px-3"
                value={selectedSession?.status ?? "in_progress"}
                onChange={(e) =>
                  setSelectedSession((old) =>
                    old ? { ...old, status: e.target.value } : old,
                  )
                }
              >
                <option value="in_progress">
                  {tr("جارية", "In progress")}
                </option>
                <option value="completed">{tr("مكتملة", "Completed")}</option>
              </select>
            </label>

            {selectedSession?.entries.map((e, i) => (
              <div key={e.key}>
                <h3 className="mb-2 font-semibold">
                  {exerciseLabel(e, locale)}
                  {e.skipped && ` · ${tr("تم تخطيه", "Skipped")}`}
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr>
                        <th>{tr("المجموعة", "Set")}</th>
                        {e.kind === "strength" ? (
                          <>
                            <th>{tr("كجم", "kg")}</th>
                            <th>{tr("تكرار", "Reps")}</th>
                          </>
                        ) : (
                          <th>{tr("ثانية", "Seconds")}</th>
                        )}
                        <th>{tr("تمت", "Done")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {e.sets.map((s, n) => (
                        <tr key={n}>
                          <td className="p-2">{formatDisplayNumber(n + 1)}</td>
                          {(
                            (e.kind === "strength"
                              ? ["weight", "reps"]
                              : ["seconds"]) as (
                              | "weight"
                              | "reps"
                              | "seconds"
                            )[]
                          ).map((f) => (
                            <td key={f} className="p-1">
                              <Input
                                aria-label={`${exerciseLabel(e, locale)} ${formatDisplayNumber(n + 1)} ${f === "weight" ? tr("كجم", "kg") : f === "reps" ? tr("تكرارات", "Reps") : tr("ثواني", "Seconds")}`}
                                className="min-w-20"
                                type="number"
                                min={0}
                                disabled={!canEditSession}
                                step={f === "weight" ? "any" : 1}
                                value={s[f]}
                                onChange={(event) =>
                                  setSelectedSession((old) =>
                                    old
                                      ? {
                                          ...old,
                                          entries: old.entries.map((ex, ei) =>
                                            ei === i
                                              ? {
                                                  ...ex,
                                                  sets: ex.sets.map(
                                                    (set, si) =>
                                                      si === n
                                                        ? {
                                                            ...set,
                                                            [f]: Number(
                                                              event.target
                                                                .value,
                                                            ),
                                                          }
                                                        : set,
                                                  ),
                                                }
                                              : ex,
                                          ),
                                        }
                                      : old,
                                  )
                                }
                              />
                            </td>
                          ))}
                          <td>
                            <input
                              type="checkbox"
                              className="size-5"
                              aria-label={`${tr("إتمام المجموعة", "Complete set")} ${formatDisplayNumber(n + 1)} ${exerciseLabel(e, locale)}`}
                              disabled={!canEditSession}
                              checked={s.done}
                              onChange={(event) =>
                                setSelectedSession((old) =>
                                  old
                                    ? {
                                        ...old,
                                        entries: old.entries.map((ex, ei) =>
                                          ei === i
                                            ? {
                                                ...ex,
                                                sets: ex.sets.map((set, si) =>
                                                  si === n
                                                    ? {
                                                        ...set,
                                                        done: event.target
                                                          .checked,
                                                      }
                                                    : set,
                                                ),
                                              }
                                            : ex,
                                        ),
                                      }
                                    : old,
                                )
                              }
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
            <label className="block text-sm">
              {tr(
                "ملاحظة الحصة — تظهر للعميل",
                "Session note — visible to member",
              )}
              <Textarea
                className="mt-2"
                disabled={!canEditSession}
                value={sessionNote}
                onChange={(e) => setSessionNote(e.target.value)}
              />
            </label>
            {canEditSession && (
              <Button
                permissionAction={null}
                disabled={busy}
                onClick={() => void saveSession()}
              >
                {tr("حفظ الحصة", "Save session")}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
