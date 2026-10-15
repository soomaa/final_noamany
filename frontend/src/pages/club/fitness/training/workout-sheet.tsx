import { formatDisplayNumber } from '@/lib/number-display';
import { exerciseLabel } from './exercise-label';
import { Button } from '@/components/ui/button';
import { trainingPhases, type Plan, type PlanDay, type PlanExercise } from './model';
export const plannedLoad = (e: PlanExercise, ar: boolean) => e.load == null ? '—' : `${e.load} ${e.loadMode === 'percent1rm' ? '% 1RM' : ar ? 'كجم' : 'kg'}`;
export function WorkoutDay({day, ar, onPreview}: {day: PlanDay; ar: boolean; onPreview: (e: PlanExercise) => void}) {
  return <div className="mt-4 space-y-5">
    {(day.exerciseType || day.date) && <p className="text-sm text-muted-foreground">{day.exerciseType}{day.date && ` · ${day.date}`}</p>}
    {trainingPhases.map(p => {
      const rows = day.exercises.filter(e => (e.phase ?? 'workout') === p.id);
      if (!rows.length && !(p.id === 'warmup' && day.warmup && (day.warmup.equipment || day.warmup.seconds || day.warmup.note))) return null;
      return <section key={p.id}>
        <h4 className="border-b pb-2 text-sm font-semibold">{ar ? p.ar : p.en}</h4>
        {p.id === 'warmup' && day.warmup && <p className="mt-3 text-sm text-muted-foreground">{day.warmup.equipment}{!!day.warmup.seconds && ` · ${formatDisplayNumber(day.warmup.seconds)} ${ar ? 'ثانية' : 'sec'}`}{day.warmup.note && ` — ${day.warmup.note}`}</p>}
        <ul className="divide-y">{rows.map(e => <li key={e.rowId ?? e.key} className="flex flex-wrap items-center justify-between gap-3 py-3">
          <div className="min-w-0"><p className="font-medium">{e.reportName?.trim() || exerciseLabel(e, ar ? 'ar' : 'en')}</p><p className="mt-1 text-sm text-muted-foreground">{formatDisplayNumber(e.sets)} × {e.kind === 'strength' ? e.reps : `${formatDisplayNumber(e.seconds)}s`} · {ar ? 'راحة' : 'Rest'} {formatDisplayNumber(e.rest)}s{e.kind === 'strength' && e.seconds > 0 && ` · ${formatDisplayNumber(e.seconds)}s`}{e.load != null && ` · ${ar ? 'الحمل المخطط' : 'Planned load'} ${plannedLoad(e, ar)}`}</p>{e.note && <p className="mt-1 text-sm">{e.note}</p>}</div>
          <Button permissionAction={null} variant="outline" onClick={() => onPreview(e)}>{ar ? 'شرح الحركة والعضلات' : 'Movement & muscles'}</Button>
        </li>)}</ul>
      </section>;
    })}
  </div>;
}
export { openWorkoutSheet, workoutSheetHtml } from './workout-sheet-model';
