import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('./', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), 'utf8');
const flows = [
  ['reception.tsx', 'quickService', true],
  ['fitness/inbody-record-dialog.tsx', 'inbody', false],
  ['fitness/facilities/spa-invoices.tsx', 'spa', true],
  ['lockers.tsx', 'locker', true],
  ['events/RegistrationsTab.tsx', 'event', true],
] as const;

test('every paid club flow consumes the central policy after a persisted reference', () => {
  for (const [file, transaction, requiresRunOnce] of flows) {
    const source = read(file);
    assert.match(source, /useClubPrintingPolicy\(\)/, file);
    assert.match(source, new RegExp(`shouldPrint\\('${transaction}'`), file);
    // A save-and-close dialog (like the InBody record dialog) prints once per submit and then
    // unmounts, so it has no re-render to guard against and doesn't need runAutoPrintOnce.
    if (requiresRunOnce) {
      assert.match(source, new RegExp(`runAutoPrintOnce\\('${transaction}'`), file);
    }
    assert.match(source, /printThermalFinancialReceiptWithFallback/, file);
  }
});

test('subscriptions centralize new charge and subsequent payment printing without local preferences', () => {
  const source = read('subscriptions.tsx');
  assert.doesNotMatch(source, /printReceiptAfterSave|club-print-receipt-after-save/);
  assert.match(source, /shouldPrint\('subscription'/);
  assert.match(source, /shouldPrint\('subscriptionPayment'/);
  assert.match(source, /runAutoPrintOnce\('subscription'/);
  assert.match(source, /runAutoPrintOnce\('subscriptionPayment'/);
});

test('the dirty POS receipt editor is not part of the club printing integration', () => {
  const source = read('../sales/new-receipt.tsx');
  assert.doesNotMatch(source, /useClubPrintingPolicy|runAutoPrintOnce/);
});
