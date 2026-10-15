import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('Gym Policies exposes and saves all central receipt fields', () => {
  const source = readFileSync(new URL('./gym-policies.tsx', import.meta.url), 'utf8');
  assert.match(source, /الطباعة المركزية/);
  const fields = [
    ['printSubscriptionReceipts', 'print-subscription-receipts'],
    ['printSubscriptionPayments', 'print-subscription-payments'],
    ['printQuickServiceReceipts', 'print-quick-service-receipts'],
    ['printInbodyReceipts', 'print-inbody-receipts'],
    ['printSpaReceipts', 'print-spa-receipts'],
    ['printLockerReceipts', 'print-locker-receipts'],
    ['printEventReceipts', 'print-event-receipts'],
  ];
  for (const [field, id] of fields) {
    assert.match(source, new RegExp(field));
    assert.match(source, new RegExp(`id:\\s*['"]${id}['"]`));
  }
  assert.match(source, /requireExpenseApproval/);
  assert.match(source, /receiptPaperSize/);
  assert.match(source, /receiptA4Copies/);
  assert.match(source, /receiptLanguage/);
});
