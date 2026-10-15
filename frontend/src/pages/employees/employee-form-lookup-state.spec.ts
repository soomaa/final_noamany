import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveEmployeeLookupState } from './employee-form-lookup-state';

test('employee lookup state exposes loading, error, empty, and ready behavior', () => {
  assert.deepEqual(
    resolveEmployeeLookupState({ isLoading: true, isError: false, hasData: false }),
    { status: 'loading', disabled: true, canRetry: false },
  );
  assert.deepEqual(
    resolveEmployeeLookupState({ isLoading: false, isError: true, hasData: false }),
    { status: 'error', disabled: true, canRetry: true },
  );
  assert.deepEqual(
    resolveEmployeeLookupState({ isLoading: false, isError: false, hasData: false }),
    { status: 'empty', disabled: true, canRetry: true },
  );
  assert.deepEqual(
    resolveEmployeeLookupState({ isLoading: false, isError: false, hasData: true }),
    { status: 'ready', disabled: false, canRetry: false },
  );
});
