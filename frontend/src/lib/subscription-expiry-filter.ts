export interface ExpiryDaysFilterState {
  draft: string;
  applied: number;
}

export type ExpiryDaysFilterAction =
  | { type: 'edit'; value: string }
  | { type: 'apply' };

export function createExpiryDaysFilterState(defaultDays: number): ExpiryDaysFilterState {
  return { draft: String(defaultDays), applied: defaultDays };
}

export function reduceExpiryDaysFilter(
  state: ExpiryDaysFilterState,
  action: ExpiryDaysFilterAction,
): ExpiryDaysFilterState {
  if (action.type === 'edit') return { ...state, draft: action.value };

  const parsed = action.type === 'apply' && state.draft.trim() !== ''
    ? Number(state.draft)
    : Number.NaN;
  const normalized = Number.isFinite(parsed)
    ? Math.min(90, Math.max(0, Math.trunc(parsed)))
    : 7;

  return { draft: String(normalized), applied: normalized };
}
