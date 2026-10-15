import type {Entry, PlanDay, Session} from './model';
export function sessionProgress(entries: Entry[]) {
  let done = 0, total = 0, skipped = 0, exercisesDone = 0;
  for (const e of entries) {
    total += e.sets.length;
    if (e.skipped) {skipped += e.sets.length;continue;}
    const complete = e.sets.filter(s => s.done).length;
    done += complete;
    if (e.sets.length > 0 && complete === e.sets.length) exercisesDone++;
  }
  return {done, total, skipped, remaining: total - done - skipped, exercisesDone, exercisesTotal: entries.length};
}
export function latestDaySession(day: PlanDay, sessions: Session[], assignmentId: number) {
  return sessions.filter(s => s.assignment_id === assignmentId && s.day_id === day.id)
    .sort((a,b) => b.date.localeCompare(a.date))[0];
}
