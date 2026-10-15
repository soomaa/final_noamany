import type { Plan } from './model';
import { dayLabel, validPlanDayNumbers } from './day-number';
export type SaveState = 'waiting' | 'pending' | 'saving' | 'saved' | 'error' | 'conflict' | 'unconfirmed';
export const planContent = (plan: Plan) => JSON.stringify({...plan, id: undefined, revision: undefined});
export function readyToSave(plan: Plan): boolean {
  return !!plan.name.trim() && !!plan.branch_id && plan.weeks >= 1 && plan.weeks <= 104 && validPlanDayNumbers(plan.days)
    && plan.days.every(day => day.exercises.length > 0 && day.exercises.every(e => e.sets >= 1 && (e.kind !== 'strength' || e.reps >= 1) && (e.kind === 'strength' || e.seconds >= 1) && (plan.status !== 'published' || e.primary.length > 0)));
}
export function createPlanAutosave(initial: Plan, request: (payload: Plan & {branchId?: number}) => Promise<Plan>, changed: (state: SaveState, error?: unknown) => void, committed: (plan: Plan) => void, unsaved = false, unconfirmed = false) {
  let latest = initial, identity = {id: initial.id, revision: initial.revision}, saved = unsaved ? '' : planContent(initial), state: SaveState = unconfirmed ? 'unconfirmed' : 'saved';
  let inFlight: Promise<boolean> | undefined;
  const emit = (next: SaveState, error?: unknown) => {state = next; changed(next, error);};
  function update(plan: Plan) {
    latest = plan;
    if (state === 'conflict' || state === 'unconfirmed' || inFlight) return;
    emit(planContent(latest) === saved ? 'saved' : readyToSave(latest) ? 'pending' : 'waiting');
  }
  async function run(): Promise<boolean> {
    if (state === 'conflict' || state === 'unconfirmed') return false;
    while (planContent(latest) !== saved) {
      if (!readyToSave(latest)) {emit('waiting');return false;}
      const snapshot = latest, content = planContent(snapshot);
      emit('saving');
      try {
        const result = await request({...snapshot, ...identity, branchId: snapshot.branch_id, days: snapshot.days.map(day => ({...day, name: dayLabel(day, day.reportLocale ?? 'ar')}))});
        if (!result?.id || !result.revision) throw new Error('Save response did not confirm a plan revision');
        identity = {id: result.id, revision: result.revision};
        saved = content;
        committed(result);
      } catch (error) {
        const code = (error as {response?: {status?: number}})?.response?.status;
        emit(code === 409 ? 'conflict' : !identity.id ? 'unconfirmed' : 'error', error);
        return false;
      }
    }
    emit('saved');return true;
  }
  return {update, flush() {
    if (inFlight) return inFlight;
    const task = run();inFlight = task;
    void task.finally(() => {inFlight = undefined;});
    return task;
  }, dirty: () => planContent(latest) !== saved, state: () => state};
}
