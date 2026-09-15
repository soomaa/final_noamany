import assert from 'node:assert/strict';
import test from 'node:test';

import {
  calculateCashSettlement,
  createCalculatorState,
  pressCalculatorKey,
} from './pos-cash-tools.ts';

test('calculates the customer change in cents without floating-point drift', () => {
  assert.deepEqual(calculateCashSettlement(80, '100'), {
    tenderedCents: 10_000,
    totalCents: 8_000,
    changeCents: 2_000,
    remainingCents: 0,
    status: 'change',
  });
});

test('shows the amount still due when the customer pays less than the total', () => {
  assert.deepEqual(calculateCashSettlement(80, '50'), {
    tenderedCents: 5_000,
    totalCents: 8_000,
    changeCents: 0,
    remainingCents: 3_000,
    status: 'short',
  });
});

test('treats an empty or invalid tendered amount as no cash entry', () => {
  assert.equal(calculateCashSettlement(80, '').status, 'empty');
  assert.equal(calculateCashSettlement(80, '-10').status, 'empty');
  assert.equal(calculateCashSettlement(80, 'not-a-number').status, 'empty');
});

test('performs chained basic calculator operations', () => {
  let state = createCalculatorState();
  for (const key of ['2', '5', '+', '1', '7', '='] as const) {
    state = pressCalculatorKey(state, key);
  }
  assert.equal(state.display, '42');

  state = pressCalculatorKey(state, '×');
  state = pressCalculatorKey(state, '2');
  state = pressCalculatorKey(state, '=');
  assert.equal(state.display, '84');
});

test('supports decimals, backspace, sign change, and clear', () => {
  let state = createCalculatorState();
  for (const key of ['1', '0', '.', '5', 'backspace', '2', 'sign'] as const) {
    state = pressCalculatorKey(state, key);
  }
  assert.equal(state.display, '-10.2');

  state = pressCalculatorKey(state, 'clear');
  assert.deepEqual(state, createCalculatorState());
});

test('recovers from division by zero when the next digit is entered', () => {
  let state = createCalculatorState();
  for (const key of ['8', '÷', '0', '='] as const) {
    state = pressCalculatorKey(state, key);
  }
  assert.equal(state.display, 'Error');

  state = pressCalculatorKey(state, '3');
  assert.equal(state.display, '3');
});
