import assert from 'node:assert/strict';
import { test } from 'node:test';
import { packagePriceForBranch, sessionMatrixForBranchPrice } from './package-price';

const TYPE = { price: 500, branchPrices: [{ branchId: 2, price: 400 }] };

test('a branch override replaces the default price; other branches keep it', () => {
  assert.equal(packagePriceForBranch(TYPE, 2), 400);
  assert.equal(packagePriceForBranch(TYPE, 1), 500);
  assert.equal(packagePriceForBranch(TYPE, null), 500);
  assert.equal(packagePriceForBranch({ price: 300 }, 2), 300);
});

test('the session matrix scales with the branch price', () => {
  const matrix = [
    { sessionsCount: 1, price: 50 },
    { sessionsCount: 10, price: 500 },
  ];
  assert.deepEqual(sessionMatrixForBranchPrice(matrix, 500, 400), [
    { sessionsCount: 1, price: 40 },
    { sessionsCount: 10, price: 400 },
  ]);
  assert.equal(sessionMatrixForBranchPrice(matrix, 500, 500), matrix);
  assert.equal(sessionMatrixForBranchPrice(undefined, 500, 400), undefined);
});
