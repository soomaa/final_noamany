import assert from 'node:assert/strict';
import test from 'node:test';
import {
  resolveStockTakingCatalogBranch,
  resolveStockTakingCreateBranch,
} from './stock-taking-branch.ts';

test('uses the branch explicitly selected by a branchless system admin', () => {
  assert.equal(resolveStockTakingCreateBranch(0, '7'), 7);
});

test('keeps a branch-scoped user on their assigned branch', () => {
  assert.equal(resolveStockTakingCreateBranch(2, '7'), 2);
});

test('loads the product catalog from the saved count-session branch', () => {
  assert.equal(resolveStockTakingCatalogBranch(7), 7);
  assert.equal(resolveStockTakingCatalogBranch(null), null);
});
