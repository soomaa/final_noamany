export interface Muscle {
  id: string;
  ar: string;
  en: string;
}
export interface Exercise {
  equipmentIds?: number[];
  equipment?: Array<{ id: number; name: string; imageUrl: string | null; branchId: number }>;
  editable?: boolean;
  key: string;
  rowId?: string;
  coachNote?: string;
  name: string;
  kind: "strength" | "timed" | "cardio";
  primary: string[];
  secondary: string[];
  instructions: string;
  videoUrl: string | null;
}
export const trainingPhases = [
  {id: 'warmup', ar: 'الإحماء', en: 'Warm-up'},
  {id: 'workout', ar: 'التمرين الأساسي', en: 'Workout'},
  {id: 'skill', ar: 'المهارات واللياقة', en: 'Skill development · Fitness'},
  {id: 'cooldown', ar: 'التهدئة', en: 'Cool-down'},
] as const;
export type TrainingPhase = typeof trainingPhases[number]['id'];
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
export interface PlanDay {
  reportLocale?: "ar" | "en";
  id: string;
  name: string;
  exerciseType?: string;
  date?: string | null;
  warmup?: {equipment: string; seconds: number; note: string};
  exercises: PlanExercise[];
}
export interface Plan {
  created_by?: number;
  id?: number;
  name: string;
  goal: string;
  weeks: number;
  revision?: number;
  status: string;
  branch_id?: number;
  days: PlanDay[];
}
export interface Entry extends Exercise {
  skipped: boolean;
  note: string;
  sets: { weight: number; reps: number; seconds: number; done: boolean }[];
}
export interface Session {
  id: string;
  revision: number;
  assignment_id: number | null;
  day_id: string | null;
  date: string;
  status: string;
  entries: Entry[];
  note: string;
  author: string;
}
export interface Photo {
  id: string;
  date: string;
  angle: string;
  shared_with_coach: boolean;
}
export interface Metric {
  id: number;
  date: string;
  label: string;
  test_key: string;
  value: number;
  unit: string;
  side: string;
  protocol: string;
}
export interface Journey {
  body?: import("@/components/training/body-model").BodyJourney;
  assignment: {
    id: number;
    plan_revision: number;
    snapshot: Plan;
    start_date: string;
  } | null;
  trainer: { id: number; name: string } | null;
  sessions: Session[];
  photos: Photo[];
  metrics: Metric[];
  events: {
    id: number;
    note: string;
    kind: string;
    created_at: string;
    author: string;
  }[];
  muscleSets: Record<string, number>;
  historyLimit: number;
  nextSessionCursor: string | null;
}
export function muscleCounts(sessions: Session[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const s of sessions)
    for (const e of s.entries)
      if (!e.skipped)
        for (const id of e.primary)
          counts[id] = (counts[id] ?? 0) + e.sets.filter((x) => x.done).length;
  return counts;
}
