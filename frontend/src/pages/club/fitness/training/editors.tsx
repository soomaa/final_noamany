import { formatDisplayNumber } from '@/lib/number-display';
import { usePlanAutosave, readPlanDraft } from './use-plan-autosave';
import { numericDayInput, savedDayNumber, dayLabel, nextDayNumber, validDayNumber } from './day-number';
import { exerciseLabel, matchesExercise } from './exercise-label';
import { useQuery } from '@tanstack/react-query';
import { catalogImageUrl } from '@/lib/catalog-image';
import { useState, useRef } from "react";
import { ArrowDown, ArrowUp, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, apiError } from "@/lib/api";
import { useLocale } from "@/store/locale";
import { useTrainingAccess } from "@/pages/club/fitness/training/access";
import { useBranches } from "@/hooks/use-branches";
import { useAuth } from "@/store/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MuscleMap } from "@/components/training/muscle-map";
import { trainingPhases, type TrainingPhase, type Exercise, type Muscle, type Plan, type PlanDay, type PlanExercise } from "./model";
import { openWorkoutSheet } from "./workout-sheet";

export function ExerciseEditor({
  exercise,
  muscles,
  onClose,
  onSaved,
  localeOverride,
}: {
  exercise: Exercise | null;
  muscles: Muscle[];
  onClose: () => void;
  onSaved: (exercise: Exercise) => void | Promise<void>;
  localeOverride?: "ar" | "en";
}) {
  const { locale } = useLocale();
  const { base, can } = useTrainingAccess();
  const userId = useAuth(s => s.user?.sub);
  const saving = useRef(false);
  const equipment = useQuery({queryKey:['training-equipment',base,userId],queryFn:async()=> (await api.get<{equipment:Array<{id:number;name:string;imageUrl:string|null}>}>(`${base}/catalog`)).data.equipment ?? []});
  const ar = (localeOverride ?? locale) === "ar";
  const tr = (a: string, e: string) => (ar ? a : e);
  const [form, setForm] = useState<Exercise>(
    exercise ?? {
      key: "",
      name: "",
      kind: "strength",
      primary: [],
      secondary: [],
      instructions: "",
      videoUrl: "",
    },
  );
  const [role, setRole] = useState<"primary" | "secondary">("primary"),
    [busy, setBusy] = useState(false);
  async function save() {
    if (saving.current || !can(form.key ? "club.fitness.strength:update" : "club.fitness.strength:create")) return;
    saving.current = true;
    setBusy(true);
    try {
      const result = await (form.key ? api.put : api.post)(`${base}/exercises`, {
        ...form,
        key: form.key || undefined,
      });
      toast.success(tr("تم حفظ التمرين", "Exercise saved"));
      await onSaved({ ...form, key: result.data.key });
      onClose();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v && !busy) onClose();
      }}
    >
      <DialogContent
        className="training-dialog"
        size="xl"
        aria-describedby={undefined}
      >
        <DialogHeader>
          <DialogTitle>
            {tr("تفاصيل التمرين والعضلات", "Exercise & target muscles")}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-6 overflow-y-auto lg:grid-cols-2">
          <div>
            <div className="mb-4 flex gap-2">
              <Button
                permissionAction={null}
                variant={role === "primary" ? "brand" : "outline"}
                onClick={() => setRole("primary")}
              >
                {tr("أساسية", "Primary")}
              </Button>
              <Button
                permissionAction={null}
                variant={role === "secondary" ? "brand" : "outline"}
                onClick={() => setRole("secondary")}
              >
                {tr("مساعدة", "Assisting")}
              </Button>
            </div>
            <MuscleMap
              muscles={muscles}
              primary={form[role]}
              secondary={form[role === "primary" ? "secondary" : "primary"]}
              onSelect={(id) =>
                setForm((f) => ({
                  ...f,
                  [role]: f[role].includes(id)
                    ? f[role].filter((x) => x !== id)
                    : [...f[role], id],
                  [role === "primary" ? "secondary" : "primary"]: f[
                    role === "primary" ? "secondary" : "primary"
                  ].filter((x) => x !== id),
                }))
              }
            />
          </div>
          <div className="space-y-5">
            <div>
              <Label htmlFor="ex-name">
                {tr("اسم التمرين", "Exercise name")}
              </Label>
              <Input
                id="ex-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <label className="block text-sm">
              {tr("طريقة التسجيل", "Tracking type")}
              <select
                className="mt-2 min-h-11 w-full rounded-lg border bg-background px-3"
                value={form.kind}
                onChange={(e) =>
                  setForm({ ...form, kind: e.target.value as Exercise["kind"] })
                }
              >
                <option value="strength">
                  {tr("وزن وتكرارات", "Weight & reps")}
                </option>
                <option value="timed">{tr("مدة", "Duration")}</option>
                <option value="cardio">
                  {tr("كارديو / Spinning", "Cardio / Spinning")}
                </option>
              </select>
            </label>
            <div>
              <Label htmlFor="ex-instructions">
                {tr("شرح الحركة", "Movement instructions")}
              </Label>
              <Textarea
                id="ex-instructions"
                rows={5}
                value={form.instructions}
                onChange={(e) =>
                  setForm({ ...form, instructions: e.target.value })
                }
              />
            </div>
            <div><Label htmlFor="ex-video">{tr('رابط فيديو الشرح','Instruction video URL')}</Label><Input id="ex-video" type="url" value={form.videoUrl??''} placeholder="https://" onChange={e=>setForm({...form,videoUrl:e.target.value})} /></div>
            <fieldset className="space-y-2"><legend className="mb-2 text-sm font-semibold">{tr('الأجهزة المستخدمة','Equipment used')}</legend>
              {equipment.isError ? <p role="alert" className="text-sm">{tr('تعذر تحميل الأجهزة.','Could not load equipment.')} <button type="button" onClick={()=>void equipment.refetch()}>{tr('إعادة المحاولة','Retry')}</button></p> : equipment.isPending ? <p>{tr('تحميل الأجهزة…','Loading equipment…')}</p> : equipment.data?.length ? <div className="max-h-52 overflow-auto divide-y rounded-lg border">{equipment.data.map(item=><label key={item.id} className="flex min-h-12 items-center gap-3 p-3"><input type="checkbox" checked={(form.equipmentIds??[]).includes(item.id)} onChange={e=>setForm(f=>({...f,equipmentIds:e.target.checked?[...(f.equipmentIds??[]),item.id]:(f.equipmentIds??[]).filter(id=>id!==item.id)}))} />{catalogImageUrl(item.imageUrl)&&<img className="size-10 rounded object-cover" src={catalogImageUrl(item.imageUrl)!} alt="" />}<span>{item.name}</span></label>)}</div> : <p className="text-sm text-muted-foreground">{tr('أضف الأجهزة من إدارة الأجهزة أولًا.','Add machines from Equipment management first.')}</p>}
            </fieldset>
            <p className="text-sm text-muted-foreground">
              {tr(
                "حدد عضلة أساسية واحدة على الأقل. العضلات تظهر للعميل؛ اللون يوضح الاستهداف ولا يقيس نمو العضلة.",
                "Select at least one primary muscle. Selections appear in the member app; color shows targeting, not muscle growth.",
              )}
            </p>
            <Button
              permissionAction={null}
              disabled={busy || !form.name.trim() || !form.primary.length}
              onClick={() => void save()}
            >
              <Save className="size-4" />
              {busy
                ? tr("حفظ…", "Saving…")
                : tr("حفظ التمرين", "Save exercise")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function PlanBuilder({
  initial,
  exercises,
  muscles,
  onExerciseSaved,
  onClose,
  onSaved,
}: {
  initial: Plan | null;
  exercises: Exercise[];
  muscles: Muscle[];
  onExerciseSaved: () => Promise<void>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { locale } = useLocale();
  const { can, base, trainerPortal } = useTrainingAccess();
  const [createExercise, setCreateExercise] = useState(false);
  const user = useAuth((s) => s.user);
  const branches = useBranches();
  const draftKey = `nomany-training-plan-draft:${trainerPortal ? 'coach' : 'admin'}:${user?.sub ?? 'anonymous'}:${initial?.id ?? 'new'}`;
  const restoredDraft = useRef(readPlanDraft(draftKey, initial));
  const [plan, setPlan] = useState<Plan>(() => {
    const source = restoredDraft.current?.plan ?? initial;
    return source ? {...source, days: source.days.map((day, index) => ({...day, name: savedDayNumber(day.name) ?? String(index + 1)}))} : {
      name: "",
      goal: "",
      weeks: 8,
      status: "draft",
      branch_id: user?.branch || undefined,
      days: [
        {
          id: crypto.randomUUID(),
          name: "1",
          reportLocale: locale,
          exercises: [],
        },
      ],
    };
  });
  const [active, setActive] = useState(0),
    [search, setSearch] = useState("");
  const [phase, setPhase] = useState<TrainingPhase>("workout");
  const day = plan.days[active];
  const sectionLocale = plan.days[0].reportLocale ?? locale;
  const ar = sectionLocale === "ar";
  const tr = (a: string, e: string) => (ar ? a : e);
  const changeDay = (value: Partial<PlanDay>) =>
    setPlan((p) => ({
      ...p,
      days: p.days.map((d, i) => (i === active ? { ...d, ...value } : d)),
    }));
  const update = (index: number, patch: Partial<PlanExercise>) =>
    changeDay({
      exercises: day.exercises.map((e, i) =>
        i === index ? { ...e, ...patch } : e,
      ),
    });
  function move(index: number, offset: number) {
    const next = [...day.exercises];
    const target = index + offset;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    changeDay({ exercises: next });
  }
  const autosave = usePlanAutosave(plan, setPlan, draftKey, onSaved, !!restoredDraft.current, restoredDraft.current?.unconfirmed ?? false, base);
  const busy = autosave.state === 'saving';
  const saveText = autosave.state === 'saving' ? tr('جارٍ الحفظ…', 'Saving…')
    : autosave.state === 'saved' ? (plan.id ? tr('تم الحفظ', 'Saved') : tr('حفظ تلقائي', 'Auto-save'))
    : autosave.state === 'pending' ? tr('تغييرات قيد الحفظ…', 'Changes pending…')
    : autosave.state === 'waiting' ? (autosave.localSaved ? tr('المسودة محفوظة على هذا الجهاز. أكمل الحقول المطلوبة للمزامنة.', 'Draft saved on this device. Complete required fields to sync.') : tr('أكمل الحقول المطلوبة للحفظ.', 'Complete required fields to save.'))
    : autosave.state === 'conflict' ? tr('تغيرت النسخة المحفوظة. حمّل مسودتك ثم افتح البرنامج من جديد.', 'The saved version changed. Download your draft, then reopen the program.')
    : autosave.state === 'unconfirmed' ? tr('تعذر تأكيد الحفظ. حمّل مسودتك وراجع قائمة البرامج قبل المحاولة مجددًا.', 'Save could not be confirmed. Download your draft and check Programs before trying again.')
    : tr('تعذر الحفظ. أعد المحاولة.', 'Could not save. Retry.');
  function downloadDraft() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(plan, null, 2)], {type: 'application/json'}));
    const link = document.createElement('a');link.href = url;link.download = 'nomany-workout-draft.json';link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function leave() {
    if (!autosave.dirty() || await autosave.flush()) onClose();
  }
  return (
    <div className="training-workspace space-y-6" lang={sectionLocale} dir={ar ? "rtl" : "ltr"}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">
            {tr("بناء البرنامج", "Program builder")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {tr(
              "كل إسناد يحتفظ بنسخة مستقلة؛ التعديل لا يغير تاريخ العميل.",
              "Assignments keep their own snapshot; edits preserve member history.",
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            permissionAction={null}
            variant="outline"
            disabled={busy}
            onClick={() => {if (autosave.state === "waiting") onClose();else void leave();}}
          >
            {tr("رجوع", "Back")}
          </Button>
          <div className="flex max-w-sm flex-wrap items-center gap-2 text-sm">
            <span role="status" aria-live="polite">{saveText}</span>
            {autosave.state === 'error' && <Button permissionAction={null} variant="outline" onClick={() => void autosave.flush()}>{tr('إعادة المحاولة', 'Retry')}</Button>}
            {(['error', 'conflict', 'unconfirmed'].includes(autosave.state)) && <Button permissionAction={null} variant="outline" onClick={downloadDraft}>{tr('تنزيل المسودة', 'Download draft')}</Button>}
            {(autosave.state === 'conflict' || autosave.state === 'unconfirmed') && <Button permissionAction={null} variant="outline" onClick={onClose}>{tr('عرض البرامج', 'View programs')}</Button>}
            {autosave.state === 'error' && autosave.error != null && <p className="w-full text-xs text-destructive">{apiError(autosave.error)}</p>}
          </div>
        </div>
      </div>
      <div className="rounded-xl border bg-card p-5">
        <label className="block text-sm font-medium" htmlFor="plan-report-language">{tr("لغة خطة التمرين والتقرير", "Workout plan & report language")}</label>
        <select id="plan-report-language" className="mt-2 min-h-11 w-full rounded-lg border bg-background px-3 sm:max-w-xs" value={sectionLocale} onChange={event => setPlan({...plan, days: plan.days.map(d => ({...d, reportLocale: event.target.value as 'ar' | 'en'}))})}>
          <option value="ar">العربية</option><option value="en">English</option>
        </select>
        <p className="mt-2 text-sm text-muted-foreground">{tr("تُحفظ اللغة مع الخطة وتُستخدم في عرضها وتقريرها. اكتب أسماء الحركات والملاحظات باللغة المختارة.", "Saved with the plan and used for its section and report. Write movement names and notes in the selected language.")}</p>
      </div>
      <div className="grid gap-4 rounded-xl border bg-card p-5 md:grid-cols-2 xl:grid-cols-4">
        <div>
          <Label htmlFor="plan-name">
            {tr("اسم البرنامج", "Program name")}
          </Label>
          <Input
            id="plan-name"
            value={plan.name}
            onChange={(e) => setPlan({ ...plan, name: e.target.value })}
          />
        </div>
        <div>
          <Label htmlFor="plan-goal">{tr("الهدف", "Goal")}</Label>
          <Input
            id="plan-goal"
            value={plan.goal ?? ""}
            onChange={(e) => setPlan({ ...plan, goal: e.target.value })}
          />
        </div>
        <div>
          <Label htmlFor="plan-weeks">{tr("المدة بالأسابيع", "Weeks")}</Label>
          <Input
            id="plan-weeks"
            type="number"
            min={1}
            max={104}
            value={plan.weeks}
            onChange={(e) =>
              setPlan({ ...plan, weeks: Number(e.target.value) })
            }
          />
        </div>
        <div>
          <Label htmlFor="plan-branch">{tr("الفرع", "Branch")}</Label>
          <select
            id="plan-branch"
            className="mt-2 min-h-11 w-full rounded-lg border bg-background px-3"
            value={plan.branch_id ?? ""}
            onChange={(e) =>
              setPlan({ ...plan, branch_id: Number(e.target.value) })
            }
          >
            <option value="">{tr("اختار الفرع", "Select branch")}</option>
            {branches.data?.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <label className="text-sm">
          {tr("حالة البرنامج", "Status")}
          <select
            className="mt-2 min-h-11 w-full rounded-lg border bg-background px-3"
            value={plan.status}
            onChange={(e) => setPlan({ ...plan, status: e.target.value })}
          >
            <option value="draft">
              {tr("مسودة / تخصيص كابتن", "Draft / coach program")}
            </option>
            {!trainerPortal && [1, 3].includes(user?.level ?? 0) && (
              <option value="published">
                {tr("معتمد للنادي", "Club approved")}
              </option>
            )}
          </select>
        </label>
      </div>
      <div
        className="flex flex-wrap gap-2"
        aria-label={tr("أيام البرنامج", "Program days")}
      >
        {plan.days.map((d, i) => (
          <Button
            permissionAction={null}
            key={d.id}
            variant={active === i ? "brand" : "outline"}
            onClick={() => setActive(i)}
            aria-pressed={active === i}
          >
            {dayLabel(d, sectionLocale)}
          </Button>
        ))}
        <Button
          permissionAction={null}
          variant="outline"
          disabled={plan.days.length >= 14}
          onClick={() => {
            setPlan({
              ...plan,
              days: [
                ...plan.days,
                {
                  id: crypto.randomUUID(),
                  name: nextDayNumber(plan.days),
                  reportLocale: sectionLocale,
                  exercises: [],
                },
              ],
            });
            setActive(plan.days.length);
          }}
        >
          <Plus className="size-4" />
          {tr("إضافة يوم", "Add day")}
        </Button>
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-[270px_minmax(0,1fr)]">
        <aside className="space-y-4 rounded-xl border bg-card p-4 lg:sticky lg:top-4">
          <h3 className="font-semibold">{tr("أضف حركة للحصة", "Add a movement")}</h3>
          <label className="block text-sm">{tr("مرحلة الحصة", "Session phase")}
            <select className="mt-2 min-h-11 w-full rounded-lg border bg-background px-3" value={phase} onChange={e => setPhase(e.target.value as TrainingPhase)}>
              {trainingPhases.map(p => <option key={p.id} value={p.id}>{ar ? p.ar : p.en}</option>)}
            </select>
          </label>
          {can('club.fitness.strength:create') && <Button permissionAction={null} type="button" variant="outline" className="w-full" onClick={() => setCreateExercise(true)}><Plus className="size-4" />{tr('تمرين جديد', 'New exercise')}</Button>}
          <Input aria-label={tr("ابحث عن تمرين", "Search exercises")} value={search} onChange={e => setSearch(e.target.value)} placeholder={tr("ابحث في مكتبة التمارين…", "Search exercise library…")} />
          <div className="max-h-72 space-y-1 overflow-y-auto lg:max-h-[480px]">
            {exercises.filter(e => matchesExercise(e, search, sectionLocale)).map(e => <button type="button" key={e.key} disabled={day.exercises.length >= 40}
              onClick={() => changeDay({exercises: [...day.exercises, {...e, rowId: crypto.randomUUID(), phase, sets: phase === 'workout' ? 3 : 1, reps: e.kind === 'strength' ? 10 : 0, seconds: e.kind === 'strength' ? 0 : 60, rest: phase === 'workout' ? 60 : 30, note: '', load: null, loadMode: 'kg'}]})}
              className="flex min-h-12 w-full items-center justify-between gap-3 rounded-lg p-3 text-start text-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40">
              <span>{exerciseLabel(e, sectionLocale)}</span><Plus className="size-4 shrink-0" />
            </button>)}
            {!exercises.filter(e => matchesExercise(e, search, sectionLocale)).length && <p className="p-3 text-sm text-muted-foreground">{tr("لا توجد نتائج. أضف تمرينًا جديدًا أو جرّب اسمًا آخر.", "No results. Create a new exercise or try another name.")}</p>}
          </div>
          <p className="text-xs text-muted-foreground">{tr("يمكن تكرار الحركة في أكثر من مرحلة، ولكل مرة تسجيل مستقل.", "A movement can appear in multiple phases, with separate logging.")}</p>
        </aside>
        <section className="min-w-0 space-y-6">
          <div className="rounded-xl border bg-card p-5">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-lg font-semibold">{tr("تفاصيل الحصة", "Session details")}</h3>
              <Button permissionAction={null} variant="outline" onClick={() => openWorkoutSheet(plan, {locale: sectionLocale, dayId: day.id})}>{tr("معاينة ورقة الحصة", "Preview workout sheet")}</Button>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="text-sm"><div className="flex items-center gap-3"><label htmlFor="plan-day-number" className="font-medium">{tr("اليوم", "Day")}</label><Input id="plan-day-number" className="h-11 w-20 text-center text-base" type="text" inputMode="numeric" pattern="[0-9]*" dir="ltr" required value={day.name} aria-invalid={!validDayNumber(day.name) || plan.days.some(d => d.id !== day.id && Number(d.name) === Number(day.name))} aria-describedby="plan-day-number-help" onChange={e => {const number = numericDayInput(e.target.value); if (number !== null) changeDay({name: number});}} /></div><p id="plan-day-number-help" className="mt-2 text-xs text-muted-foreground">{!validDayNumber(day.name) ? tr("أدخل رقمًا صحيحًا أكبر من صفر.", "Enter a whole number greater than zero.") : plan.days.some(d => d.id !== day.id && Number(d.name) === Number(day.name)) ? tr("رقم اليوم مستخدم بالفعل. اختر رقمًا آخر.", "This day number is already used. Choose another number.") : null}</p></div>
              <label className="text-sm">{tr("نوع التدريب", "Exercise type")}<Input className="mt-2" placeholder={tr("مثال: قوة · تحكم · لياقة", "e.g. Strength · Control · Fitness")} value={day.exerciseType ?? ''} onChange={e => changeDay({exerciseType: e.target.value})} /></label>
              <label className="text-sm">{tr("تاريخ الحصة · اختياري", "Session date · optional")}<Input className="mt-2" type="date" value={day.date ?? ''} onChange={e => changeDay({date: e.target.value || null})} /></label>
              <div className="flex items-end"><Button permissionAction={null} variant="outline" disabled={plan.days.length === 1} onClick={() => {setPlan({...plan, days: plan.days.filter((_, i) => i !== active)});setActive(0);}}><Trash2 className="size-4" />{tr("حذف اليوم", "Remove day")}</Button></div>
            </div>
          </div>
          {trainingPhases.map((p, phaseIndex) => {
            const rows = day.exercises.map((e, i) => ({e, i})).filter(({e}) => (e.phase ?? 'workout') === p.id);
            const warm = day.warmup ?? {equipment: '', seconds: 0, note: ''};
            return <section key={p.id} className="overflow-hidden rounded-xl border bg-card">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/40 px-5 py-4">
                <div className="flex items-center gap-3"><span className="text-sm tabular-nums text-muted-foreground">0{formatDisplayNumber(phaseIndex + 1)}</span><h3 className="text-lg font-semibold">{ar ? p.ar : p.en}</h3><span className="text-sm text-muted-foreground">{formatDisplayNumber(rows.length)}</span></div>
                <Button permissionAction={null} variant={phase === p.id ? 'brand' : 'outline'} onClick={() => {setPhase(p.id); document.querySelector<HTMLInputElement>('[aria-label="' + tr('ابحث عن تمرين', 'Search exercises') + '"]')?.focus();}}><Plus className="size-4" />{tr("أضف حركة", "Add movement")}</Button>
              </div>
              {p.id === 'warmup' && <div className="grid gap-4 border-b p-5 md:grid-cols-2">
                <label className="text-sm">{tr("معدات الإحماء", "Warm-up equipment")}<Input className="mt-2" value={warm.equipment} onChange={e => changeDay({warmup: {...warm, equipment: e.target.value}})} /></label>
                <label className="text-sm">{tr("إجمالي وقت الإحماء / ثانية", "Total warm-up / seconds")}<Input className="mt-2" type="number" min={0} max={3600} value={warm.seconds} onChange={e => changeDay({warmup: {...warm, seconds: Number(e.target.value)}})} /></label>
                <label className="text-sm md:col-span-2">{tr("ملاحظات الإحماء", "Warm-up notes")}<Textarea rows={2} maxLength={1000} className="mt-2" value={warm.note} onChange={e => changeDay({warmup: {...warm, note: e.target.value}})} /></label>
              </div>}
              {!rows.length && <p className="px-5 py-8 text-sm text-muted-foreground">{tr("أضف الحركات المطلوبة لهذه المرحلة من المكتبة.", "Add the movements needed for this phase from the library.")}</p>}
              <div className="divide-y">{rows.map(({e, i}, rowIndex) => <div key={e.rowId ?? e.key} className="p-5">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <h4 className="font-semibold">{formatDisplayNumber(rowIndex + 1)}. {exerciseLabel(e, sectionLocale)}</h4>
                  <div className="flex gap-1">
                    <Button permissionAction={null} size="icon" variant="ghost" aria-label={tr("لأعلى", "Move up")} disabled={rowIndex === 0} onClick={() => move(i, rows[rowIndex-1].i - i)}><ArrowUp className="size-4" /></Button>
                    <Button permissionAction={null} size="icon" variant="ghost" aria-label={tr("لأسفل", "Move down")} disabled={rowIndex === rows.length - 1} onClick={() => move(i, rows[rowIndex+1].i - i)}><ArrowDown className="size-4" /></Button>
                    <Button permissionAction={null} size="icon" variant="ghost" aria-label={tr("حذف التمرين", "Remove exercise")} onClick={() => changeDay({exercises: day.exercises.filter((_, n) => n !== i)})}><Trash2 className="size-4" /></Button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                  {(['sets', 'reps', 'rest', ...(p.id !== 'workout' || e.kind !== 'strength' || e.seconds > 0 ? ['seconds' as const] : [])] as const).map(field => <label key={field} className="text-sm">{{sets: tr('المجموعات', 'Sets'), reps: tr('التكرارات', 'Reps'), rest: tr('الراحة / ثانية', 'Rest / sec'), seconds: tr('الوقت / ثانية', 'Time / sec')}[field]}
                    <Input className="mt-2" type="number" min={field === 'sets' || (field === 'reps' && e.kind === 'strength') || (field === 'seconds' && e.kind !== 'strength') ? 1 : 0} max={field === 'sets' ? 30 : field === 'rest' ? 1800 : field === 'reps' ? 1000 : 86400} value={e[field]} onChange={event => update(i, {[field]: Number(event.target.value)})} />
                  </label>)}
                  {p.id === 'workout' ? <>
                    <label className="text-sm">{tr("نوع الحمل", "Load unit")}<select className="mt-2 min-h-11 w-full rounded-lg border bg-background px-3" value={e.loadMode ?? 'kg'} onChange={event => update(i, {loadMode: event.target.value as 'kg' | 'percent1rm', load: null})}><option value="kg">{tr("وزن / كجم", "Weight / kg")}</option><option value="percent1rm">% 1RM</option></select></label>
                    <label className="text-sm">{tr("الحمل المخطط · اختياري", "Planned load · optional")}<Input className="mt-2" type="number" min={0} max={e.loadMode === 'percent1rm' ? 100 : 1000} step="0.5" placeholder="—" value={e.load ?? ''} onChange={event => update(i, {load: event.target.value === '' ? null : Number(event.target.value)})} /></label>
                  </> : null}
                  {!ar && <label className="col-span-2 text-sm xl:col-span-4">{tr("اسم الحركة في التقرير · اختياري", "Movement name in report · optional")}<Input className="mt-2" maxLength={150} placeholder={exerciseLabel(e, sectionLocale)} value={e.reportName ?? ''} onChange={event => update(i, {reportName: event.target.value})} /></label>}
                  <label className="col-span-2 text-sm xl:col-span-4">{tr("توجيه الكابتن", "Coach note")}<Textarea rows={2} maxLength={1000} className="mt-2" value={e.note} onChange={event => update(i, {note: event.target.value})} /></label>
                  <details className="col-span-2 xl:col-span-4" open={p.id !== 'workout' && e.load != null ? true : undefined}>
                    <summary className="min-h-11 cursor-pointer py-3 text-sm text-muted-foreground">{tr("تفاصيل إضافية · اختياري", "Additional details · optional")}</summary>
                    <div className="grid grid-cols-2 gap-3 pb-2">
                      {ar && <label className="col-span-2 text-sm">{tr("اسم الحركة في التقرير · اختياري", "Movement name in report · optional")}<Input className="mt-2" maxLength={150} placeholder={exerciseLabel(e, sectionLocale)} value={e.reportName ?? ''} onChange={event => update(i, {reportName: event.target.value})} /></label>}
                      {p.id === 'workout' && e.kind === 'strength' && e.seconds === 0 && <label className="text-sm">{tr('الوقت / ثانية', 'Time / sec')}<Input className="mt-2" type="number" min={0} max={86400} value={e.seconds} onChange={event => update(i, {seconds: Number(event.target.value)})} /></label>}
                      {p.id !== 'workout' && <><label className="text-sm">{tr("نوع الحمل", "Load unit")}<select className="mt-2 min-h-11 w-full rounded-lg border bg-background px-3" value={e.loadMode ?? 'kg'} onChange={event => update(i, {loadMode: event.target.value as 'kg' | 'percent1rm', load: null})}><option value="kg">{tr("وزن / كجم", "Weight / kg")}</option><option value="percent1rm">% 1RM</option></select></label><label className="text-sm">{tr("الحمل المخطط · اختياري", "Planned load · optional")}<Input className="mt-2" type="number" min={0} max={e.loadMode === 'percent1rm' ? 100 : 1000} step="0.5" placeholder="—" value={e.load ?? ''} onChange={event => update(i, {load: event.target.value === '' ? null : Number(event.target.value)})} /></label></>}
                    </div>
                  </details>
                </div>
              </div>)}</div>
            </section>;
          })}
        </section>
      </div>
      {createExercise && <ExerciseEditor exercise={null} muscles={muscles} localeOverride={sectionLocale} onClose={() => setCreateExercise(false)} onSaved={async exercise => { await onExerciseSaved(); setSearch(exerciseLabel(exercise, sectionLocale)); }} />}
    </div>
  );
}
