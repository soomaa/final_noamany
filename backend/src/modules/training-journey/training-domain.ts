import { BadRequestException } from "@nestjs/common";
export const MUSCLES = [
  { id: "chest", ar: "الصدر", en: "Chest" },
  { id: "shoulders", ar: "الكتف", en: "Shoulders" },
  { id: "biceps", ar: "البايسبس", en: "Biceps" },
  { id: "triceps", ar: "الترايسبس", en: "Triceps" },
  { id: "forearms", ar: "الساعد", en: "Forearms" },
  { id: "abs", ar: "البطن", en: "Abdominals" },
  { id: "obliques", ar: "جانبي البطن", en: "Obliques" },
  { id: "quads", ar: "الفخذ الأمامي", en: "Quadriceps" },
  { id: "adductors", ar: "الفخذ الداخلي", en: "Adductors" },
  { id: "hamstrings", ar: "الفخذ الخلفي", en: "Hamstrings" },
  { id: "glutes", ar: "الأرداف", en: "Glutes" },
  { id: "calves", ar: "الساق", en: "Lower legs" },
  { id: "lats", ar: "الظهر الجانبي", en: "Lats" },
  { id: "traps", ar: "الترابيس", en: "Trapezius" },
  { id: "upper_back", ar: "أعلى الظهر", en: "Upper back" },
  { id: "lower_back", ar: "أسفل الظهر", en: "Lower back" },
];
export function object(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v))
    throw new BadRequestException("بيانات غير صالحة");
  return v as Record<string, unknown>;
}
export function text(v: unknown, max = 500, required = false): string {
  if (v != null && typeof v !== "string")
    throw new BadRequestException("النص غير صالح");
  const s = String(v ?? "").trim();
  if (s.length > max || (required && !s))
    throw new BadRequestException("راجع الحقول المطلوبة وطول النص");
  return s;
}
export function number(
  v: unknown,
  min: number,
  max: number,
  integer = false,
): number {
  if (v == null || v === "" || typeof v === "boolean")
    throw new BadRequestException("القيمة الرقمية مطلوبة");
  const n = Number(v);
  if (
    !Number.isFinite(n) ||
    n < min ||
    n > max ||
    (integer && !Number.isInteger(n))
  )
    throw new BadRequestException("القيمة الرقمية خارج النطاق");
  return n;
}
export function date(v: unknown): string {
  const s = text(v, 10, true);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(s) ||
    !Number.isFinite(Date.parse(s)) ||
    new Date(s).toISOString().slice(0, 10) !== s
  )
    throw new BadRequestException("تاريخ غير صالح");
  return s;
}
export function muscles(v: unknown): string[] {
  if (
    !Array.isArray(v) ||
    v.length > MUSCLES.length ||
    v.some((x) => !MUSCLES.some((m) => m.id === x))
  )
    throw new BadRequestException("اختيار العضلات غير صالح");
  return [...new Set(v)] as string[];
}
export function video(v: unknown): string | null {
  const s = text(v, 1000);
  if (!s) return null;
  try {
    const u = new URL(s);
    if (u.protocol !== "https:") throw new Error();
    return u.href;
  } catch {
    throw new BadRequestException("رابط الفيديو يجب أن يبدأ بـ https://");
  }
}
export interface Exercise {
  equipmentIds?: number[];
  equipment?: Array<{ id: number; name: string; imageUrl: string | null; branchId: number }>;
  key: string;
  rowId?: string;
  coachNote?: string;
  name: string;
  kind: string;
  primary: string[];
  secondary: string[];
  instructions: string;
  videoUrl: string | null;
}
export const PHASES = ['warmup', 'workout', 'skill', 'cooldown'] as const;
export type TrainingPhase = typeof PHASES[number];
export function prescription(raw: Record<string, unknown>) {
  const phase = text(raw.phase ?? 'workout', 20);
  if (!(PHASES as readonly string[]).includes(phase)) throw new BadRequestException('مرحلة الحصة غير صالحة');
  const loadMode = text(raw.loadMode ?? 'kg', 10);
  if (!['kg', 'percent1rm'].includes(loadMode)) throw new BadRequestException('وحدة الحمل غير صالحة');
  const load = raw.load == null || raw.load === '' ? null : number(raw.load, 0, loadMode === 'kg' ? 1000 : 100);
  return {phase: phase as TrainingPhase, loadMode: loadMode as 'kg' | 'percent1rm', load};
}
export interface PlanExercise extends Exercise {
  reportName?: string;
  phase?: TrainingPhase;
  loadMode?: 'kg' | 'percent1rm';
  load?: number | null;
  sets: number;
  reps: number;
  seconds: number;
  rest: number;
  note: string;
}
export function reportLocale(value: unknown): "ar" | "en" | undefined {
  if (value == null) return undefined;
  if (value !== "ar" && value !== "en") throw new BadRequestException("لغة خطة التمرين غير صالحة");
  return value;
}
export interface PlanDay {
  reportLocale?: "ar" | "en";
  id: string;
  name: string;
  exerciseType?: string;
  date?: string | null;
  warmup?: { equipment: string; seconds: number; note: string };
  exercises: PlanExercise[];
}
export interface SetEntry {
  weight: number;
  reps: number;
  seconds: number;
  done: boolean;
}
export interface SessionEntry extends Exercise {
  sets: SetEntry[];
  skipped: boolean;
  note: string;
}
export function validateEntries(
  v: unknown,
  exercises: Exercise[],
): SessionEntry[] {
  if (!Array.isArray(v) || v.length > 40)
    throw new BadRequestException("تمارين الحصة غير صالحة");
  const seen = new Set<string>();
  return v.map((raw) => {
    const e = object(raw);
    const ex = exercises.find((x) => x.key === e.key && (x.rowId ?? x.key) === (e.rowId ?? e.key));
    if (!ex || seen.has(ex.rowId ?? ex.key))
      throw new BadRequestException("التمرين غير موجود في خطة الحصة أو مكرر");
    seen.add(ex.rowId ?? ex.key);
    if (
      !Array.isArray(e.sets) ||
      e.sets.length > 30 ||
      typeof e.skipped !== "boolean"
    )
      throw new BadRequestException("المجموعات غير صالحة");
    return {
      ...ex,
      coachNote: ex.coachNote ?? ("note" in ex ? text(ex.note, 1000) : ""),
      note: text(e.note, 1000),
      skipped: e.skipped,
      sets: e.sets.map((s) => {
        const row = object(s);
        if (typeof row.done !== "boolean")
          throw new BadRequestException("حالة المجموعة غير صالحة");
        return {
          weight: number(row.weight, 0, 1000),
          reps: number(
            row.reps,
            row.done && ex.kind === "strength" ? 1 : 0,
            1000,
            true,
          ),
          seconds: number(
            row.seconds,
            row.done && ex.kind !== "strength" ? 1 : 0,
            86400,
            true,
          ),
          done: row.done,
        };
      }),
    };
  });
}
export function heatmap(entries: SessionEntry[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const e of entries) {
    if (e.skipped) continue;
    const count = e.sets.filter((s) => s.done).length;
    for (const id of e.primary) result[id] = (result[id] ?? 0) + count;
  }
  return result;
}

export const BODY_FIELDS = {
  height: { min: 80, max: 250 },
  weight: { min: 20, max: 400 },
  chest: { min: 30, max: 250 },
  waist: { min: 20, max: 250 },
  hips: { min: 30, max: 250 },
  arm: { min: 10, max: 100 },
  thigh: { min: 15, max: 150 },
  calf: { min: 10, max: 100 },
} as const;
export type BodyMeasurements = Partial<
  Record<keyof typeof BODY_FIELDS, number>
>;
export function bodyMeasurements(
  raw: unknown,
  target = false,
): BodyMeasurements {
  const values = object(raw);
  const result: BodyMeasurements = {};
  for (const [key, value] of Object.entries(values)) {
    if (!Object.prototype.hasOwnProperty.call(BODY_FIELDS, key) || (target && key === "height"))
      throw new BadRequestException(
        "نوع القياس غير صالح؛ الطول ليس هدفًا تدريبيًا",
      );
    const field = key as keyof typeof BODY_FIELDS;
    const { min, max } = BODY_FIELDS[field];
    result[field] = Math.round(number(value, min, max) * 10) / 10;
  }
  if (!Object.keys(result).length)
    throw new BadRequestException("أدخل قياسًا واحدًا على الأقل");
  return result;
}

/** Members log actual results; the assignment keeps the coach's prescription. */
export function validateMemberCompletion(entries: SessionEntry[], baseline: SessionEntry[]) {
  if (entries.length !== baseline.length) throw new BadRequestException('العضو يحدد المنجز فقط ولا يغيّر تمارين الخطة');
  for (const entry of entries) {
    const saved = baseline.find(e => (e.rowId ?? e.key) === (entry.rowId ?? entry.key));
    if (!saved || entry.sets.length !== saved.sets.length)
      throw new BadRequestException('لا يمكن تغيير التمارين أو عدد مجموعات الخطة');
  }
}
