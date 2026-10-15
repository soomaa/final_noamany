import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_CLUB_PRINTING_POLICY,
  normalizeClubPrintingPolicy,
  runAutoPrintOnce,
  shouldAutoPrint,
  type ClubPrintingPolicy,
  type ClubPrintTransactionType,
} from './club-printing.ts';

const enabled: ClubPrintingPolicy = {
  receiptPaperSize: 'a4',
  receiptA4Copies: 2,
  receiptLanguage: 'ar',
  printSubscriptionReceipts: true,
  printSubscriptionPayments: true,
  printQuickServiceReceipts: true,
  printInbodyReceipts: true,
  printSpaReceipts: true,
  printLockerReceipts: true,
  printEventReceipts: true,
};

test('central printing is safe by default and keeps the existing thermal format', () => {
  assert.deepEqual(DEFAULT_CLUB_PRINTING_POLICY, {
    receiptPaperSize: 'thermal', receiptA4Copies: 2, receiptLanguage: 'ar',
    printSubscriptionReceipts: false, printSubscriptionPayments: false,
    printQuickServiceReceipts: false, printInbodyReceipts: false,
    printSpaReceipts: false, printLockerReceipts: false, printEventReceipts: false,
  });
});

test('normalizes unsupported persisted values without enabling printing', () => {
  assert.deepEqual(normalizeClubPrintingPolicy({
    receiptPaperSize: 'letter' as never,
    receiptA4Copies: 4 as never,
    receiptLanguage: 'fr' as never,
    printSpaReceipts: 1 as never,
  }), DEFAULT_CLUB_PRINTING_POLICY);
});

test('maps every paid club flow to its own policy switch', () => {
  const flows: ClubPrintTransactionType[] = [
    'subscription', 'subscriptionPayment', 'quickService', 'inbody', 'spa', 'locker', 'event',
  ];
  for (const flow of flows) assert.equal(shouldAutoPrint(enabled, flow, 150, `${flow}-12`), true);
});

test('rejects disabled, free, invalid and unconfirmed transactions', () => {
  assert.equal(shouldAutoPrint(DEFAULT_CLUB_PRINTING_POLICY, 'inbody', 150, 'IB-12'), false);
  assert.equal(shouldAutoPrint(enabled, 'inbody', 0, 'IB-12'), false);
  assert.equal(shouldAutoPrint(enabled, 'inbody', -1, 'IB-12'), false);
  assert.equal(shouldAutoPrint(enabled, 'inbody', Number.NaN, 'IB-12'), false);
  assert.equal(shouldAutoPrint(enabled, 'inbody', 150, ''), false);
});

test('attempts automatic printing only once per persisted transaction reference', () => {
  let attempts = 0;
  const action = () => { attempts += 1; };
  assert.equal(runAutoPrintOnce('spa', 'SPA-20', action), true);
  assert.equal(runAutoPrintOnce('spa', 'SPA-20', action), false);
  assert.equal(runAutoPrintOnce('spa', 'SPA-21', action), true);
  assert.equal(attempts, 2);
});
