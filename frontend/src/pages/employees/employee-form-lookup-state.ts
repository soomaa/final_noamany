export type EmployeeLookupStatus = 'loading' | 'error' | 'empty' | 'ready';

export interface EmployeeLookupState {
  status: EmployeeLookupStatus;
  disabled: boolean;
  canRetry: boolean;
}

export function resolveEmployeeLookupState(input: {
  isLoading: boolean;
  isError: boolean;
  hasData: boolean;
}): EmployeeLookupState {
  if (input.isLoading) {
    return { status: 'loading', disabled: true, canRetry: false };
  }
  if (input.isError) {
    return { status: 'error', disabled: true, canRetry: true };
  }
  if (!input.hasData) {
    return { status: 'empty', disabled: true, canRetry: true };
  }
  return { status: 'ready', disabled: false, canRetry: false };
}
