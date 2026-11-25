import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import type { Plan } from './model';
import { createPlanAutosave, type SaveState } from './plan-autosave';
export function readPlanDraft(key: string, initial: Plan | null): {plan: Plan; unconfirmed: boolean} | null {
  try {
    const draft = JSON.parse(localStorage.getItem(key) ?? 'null');
    if (!draft?.plan?.days?.length || !Array.isArray(draft.plan.days)) return null;
    if (initial && (draft.plan.id !== initial.id || draft.plan.revision !== initial.revision)) return null;
    return {plan: draft.plan as Plan, unconfirmed: draft.unconfirmed === true};
  } catch {return null;}
}
export function usePlanAutosave(plan: Plan, setPlan: React.Dispatch<React.SetStateAction<Plan>>, key: string, onSaved: () => void, restored: boolean, unconfirmed: boolean, base = "/club-training") {
  const [state, setState] = useState<SaveState>(unconfirmed ? 'unconfirmed' : 'saved');
  const [error, setError] = useState<unknown>();
  const [localSaved, setLocalSaved] = useState(false);
  const mounted = useRef(true), timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined), savedCallback = useRef(onSaved);
  savedCallback.current = onSaved;
  const engine = useRef<ReturnType<typeof createPlanAutosave> | null>(null);
  if (!engine.current) engine.current = createPlanAutosave(plan, async payload => {
    const {data} = await (payload.id ? api.put : api.post)<Plan>(`${base}/plans`, payload);
    return data;
  }, (next, failure) => {
    if (next === 'unconfirmed') {try {const draft = JSON.parse(localStorage.getItem(key) ?? '{}');localStorage.setItem(key, JSON.stringify({...draft, unconfirmed: true}));} catch {/* current draft remains downloadable */}}
    if (next === 'saved') {try {localStorage.removeItem(key);} catch {/* keep status honest */}}
    if (mounted.current) {setState(next);setError(failure);}
  }, result => {
    if (mounted.current) setPlan(current => ({...current, id: result.id, revision: result.revision}));
    savedCallback.current();
  }, restored, unconfirmed);
  useEffect(() => {
    mounted.current = true;
    return () => {mounted.current = false;clearTimeout(timer.current);void engine.current?.flush();};
  }, []);
  useEffect(() => {
    const saver = engine.current!;
    saver.update(plan);
    clearTimeout(timer.current);
    if (!saver.dirty()) return;
    try {localStorage.setItem(key, JSON.stringify({plan, unconfirmed: saver.state() === 'unconfirmed'}));setLocalSaved(true);} catch {setLocalSaved(false);}
    if (saver.state() === 'pending') timer.current = setTimeout(() => void saver.flush(), 700);
  }, [plan, key]);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!engine.current?.dirty()) return;
      event.preventDefault();event.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, []);
  return {state, error, localSaved, flush: () => engine.current!.flush(), dirty: () => engine.current!.dirty()};
}
