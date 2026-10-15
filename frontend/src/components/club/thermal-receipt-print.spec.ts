import assert from 'node:assert/strict';
import test from 'node:test';
import { printThermalFinancialReceipt } from './thermal-receipt-print.tsx';

const receipt = { documentNumber: 'QS-20', transactionLabel: 'Quick service', itemName: 'Day pass', collectedAmount: 100 };

test('reports a blocked popup without mutating or retrying the money operation', () => {
  const previousWindow = globalThis.window;
  let opens = 0;
  Object.assign(globalThis, { window: { open: () => { opens += 1; return null; } } });
  try {
    assert.equal(printThermalFinancialReceipt(receipt), false);
    assert.equal(opens, 1);
  } finally {
    Object.assign(globalThis, { window: previousWindow });
  }
});

test('uses paper-specific popup dimensions and writes only the receipt document', () => {
  const previousWindow = globalThis.window;
  const writes: string[] = [];
  let features = '';
  const popup = { document: { write: (html: string) => writes.push(html), close: () => undefined } };
  Object.assign(globalThis, { window: { open: (_url: string, _target: string, value: string) => { features = value; return popup; } } });
  try {
    assert.equal(printThermalFinancialReceipt(receipt, {
      receiptPaperSize: 'a4', receiptA4Copies: 1, receiptLanguage: 'en',
      printSubscriptionReceipts: false, printSubscriptionPayments: false, printQuickServiceReceipts: false,
      printInbodyReceipts: false, printSpaReceipts: false, printLockerReceipts: false, printEventReceipts: false,
    }), true);
    assert.equal(features, 'width=960,height=900');
    assert.equal(writes.length, 1);
    assert.match(writes[0], /data-print-size="a4"/);
    assert.match(writes[0], /<html lang="en" dir="ltr">/);
  } finally {
    Object.assign(globalThis, { window: previousWindow });
  }
});
