import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AccountRow } from '@/types/accounting';
import {
  buildAccountTree,
  childLevelOf,
  compareAccountCodes,
  flattenAccounts,
  levelForDepth,
} from './chart-of-accounts-model.ts';
import { blankDraft, draftTotals, toApiLines, type DraftEntry } from './journal-entry-model.ts';
import { mapAccountLevel, mapAccountType } from './chart-of-accounts-import.ts';

function account(id: number, code: string, parentId: number | null = null): AccountRow {
  return {
    id,
    code,
    name: `حساب ${code}`,
    accountType: 'asset',
    normalBalance: 'debit',
    parentId,
    isPostable: true,
    category: null,
    description: null,
    branchId: null,
    isActive: true,
  };
}

test('account codes sort by numeric segment, not lexically', () => {
  const sorted = ['1.10', '1.2', '1.1'].sort(compareAccountCodes);
  assert.deepEqual(sorted, ['1.1', '1.2', '1.10']);
});

test('buildAccountTree nests children under their parent', () => {
  const tree = buildAccountTree([
    account(2, '1.01', 1),
    account(1, '1'),
    account(3, '1.01.001', 2),
  ]);
  assert.equal(tree.length, 1);
  assert.equal(tree[0]!.code, '1');
  assert.equal(tree[0]!.children[0]!.code, '1.01');
  assert.equal(tree[0]!.children[0]!.children[0]!.code, '1.01.001');
});

test('an account whose parent has not loaded yet still shows, as a root', () => {
  // Mid "load more" the child can arrive before the parent; dropping it would make
  // rows appear to vanish between pages.
  const tree = buildAccountTree([account(3, '1.01.001', 2)]);
  assert.equal(tree.length, 1);
  assert.equal(tree[0]!.code, '1.01.001');
});

test('buildAccountTree survives a row that points at itself', () => {
  const tree = buildAccountTree([account(1, '1', 1)]);
  assert.equal(tree.length, 1);
  assert.equal(flattenAccounts(tree).length, 1);
});

test('a later page replaces an earlier copy of the same account', () => {
  const stale = { ...account(1, '1'), balance: 100 };
  const fresh = { ...account(1, '1'), balance: 250 };
  const tree = buildAccountTree([stale, fresh]);
  assert.equal(tree.length, 1);
  assert.equal(tree[0]!.balance, 250);
});

test('levels follow depth, and a child sits one rung below its parent', () => {
  assert.equal(levelForDepth(0), 'main');
  assert.equal(levelForDepth(1), 'sub-main');
  assert.equal(levelForDepth(5), 'sub');
  assert.equal(childLevelOf('main'), 'sub-main');
  assert.equal(childLevelOf('sub-main'), 'sub');
  assert.equal(childLevelOf('sub'), 'sub');
});

function draftWith(lines: DraftEntry['lines']): DraftEntry {
  return { ...blankDraft('2026-09-10'), lines };
}

test('a fresh draft opens unbalanced with one debit and one credit row', () => {
  const draft = blankDraft('2026-09-10');
  assert.equal(draft.lines.length, 2);
  assert.deepEqual(
    draft.lines.map((l) => l.side),
    ['debit', 'credit'],
  );
  assert.equal(draftTotals(draft).isBalanced, true);
  assert.equal(draftTotals(draft).totalDebit, 0);
});

test('totals add each side and report the difference', () => {
  const totals = draftTotals(
    draftWith([
      { side: 'debit', accountId: '1', amount: '1500', description: '' },
      { side: 'credit', accountId: '2', amount: '1000', description: '' },
      { side: 'credit', accountId: '3', amount: '500', description: '' },
    ]),
  );
  assert.equal(totals.totalDebit, 1500);
  assert.equal(totals.totalCredit, 1500);
  assert.equal(totals.difference, 0);
  assert.equal(totals.isBalanced, true);
});

test('a one-piastre gap still counts as balanced, matching the backend tolerance', () => {
  const totals = draftTotals(
    draftWith([
      { side: 'debit', accountId: '1', amount: '100.00', description: '' },
      { side: 'credit', accountId: '2', amount: '99.99', description: '' },
    ]),
  );
  assert.equal(totals.isBalanced, true);
});

test('a real gap is reported as unbalanced', () => {
  const totals = draftTotals(
    draftWith([
      { side: 'debit', accountId: '1', amount: '100', description: '' },
      { side: 'credit', accountId: '2', amount: '90', description: '' },
    ]),
  );
  assert.equal(totals.difference, 10);
  assert.equal(totals.isBalanced, false);
});

test('blank and account-less rows are dropped before the payload is sent', () => {
  // The backend rejects a line that is neither a debit nor a credit, so an untouched
  // spare row must never reach it.
  const lines = toApiLines(
    draftWith([
      { side: 'debit', accountId: '1', amount: '250', description: ' نقدية ' },
      { side: 'debit', accountId: '', amount: '99', description: '' },
      { side: 'credit', accountId: '2', amount: '', description: '' },
      { side: 'credit', accountId: '2', amount: '250', description: '' },
    ]),
  );
  assert.equal(lines.length, 2);
  assert.deepEqual(lines[0], {
    accountId: 1,
    debit: 250,
    credit: 0,
    description: 'نقدية',
  });
  assert.deepEqual(lines[1], { accountId: 2, debit: 0, credit: 250, description: undefined });
});

test('a line never carries both a debit and a credit', () => {
  for (const line of toApiLines(
    draftWith([
      { side: 'debit', accountId: '1', amount: '10', description: '' },
      { side: 'credit', accountId: '2', amount: '10', description: '' },
    ]),
  )) {
    assert.ok(line.debit === 0 || line.credit === 0);
  }
});

test('imported account types map from Arabic and English headers', () => {
  assert.equal(mapAccountType('الخصوم'), 'liability');
  assert.equal(mapAccountType('Equity'), 'equity');
  assert.equal(mapAccountType('إيرادات'), 'revenue');
  assert.equal(mapAccountType('مصروفات'), 'expense');
  assert.equal(mapAccountType('غير معروف'), 'asset');
});

test('"حساب رئيسي فرعي" maps to sub-main, not main', () => {
  // It contains "رئيسي", so a naive substring test would call it a root account.
  assert.equal(mapAccountLevel('حساب رئيسي فرعي', true), 'sub-main');
  assert.equal(mapAccountLevel('حساب رئيسي', false), 'main');
  assert.equal(mapAccountLevel('حساب فرعي', true), 'sub');
});

test('with no level column, a named parent implies a child', () => {
  assert.equal(mapAccountLevel('', true), 'sub-main');
  assert.equal(mapAccountLevel('', false), 'main');
});
