import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const receiptSourceUrl = new URL('./new-receipt.tsx', import.meta.url);
const shiftSourceUrl = new URL('../../components/sales/pos-shift-switcher.tsx', import.meta.url);

test('places calculator and shift invoices together in the POS utility area', async () => {
  const [receiptSource, shiftSource] = await Promise.all([
    readFile(receiptSourceUrl, 'utf8'),
    readFile(shiftSourceUrl, 'utf8'),
  ]);

  assert.match(receiptSource, /aria-label=\{ui\("فتح الحاسبة"\)\}/);
  assert.match(receiptSource, /<Link to="\/sales\/drafts">/);
  assert.match(receiptSource, /فواتير الورديات/);
  assert.match(receiptSource, /<PosShiftSwitcher actions=\{posUtilityActions\}/);
  assert.match(shiftSource, /actions\?: ReactNode/);
  assert.match(shiftSource, /\{actions\}/);
});

test('keeps one review-and-pay action visible with a separate payment dialog', async () => {
  const receiptSource = await readFile(receiptSourceUrl, 'utf8');

  assert.match(receiptSource, /data-pos-checkout-scroll/);
  assert.match(receiptSource, /data-pos-checkout-dock/);
  assert.match(receiptSource, /data-pos-mobile-checkout-jump/);
  assert.match(receiptSource, /مراجعة ودفع/);
  assert.match(receiptSource, /<PosPaymentDialog/);
  assert.doesNotMatch(receiptSource, /<PosCashAssistant/);
  assert.match(receiptSource, /lg:sticky lg:top-4 lg:max-h-\[var\(--pos-cart-height/);
});

test('connects the cafe customer row to the gym member scanner', async () => {
  const receiptSource = await readFile(receiptSourceUrl, 'utf8');

  assert.match(receiptSource, /CameraBarcodeScanner/);
  assert.match(receiptSource, /aria-label=\{ui\("مسح كود العضو"\)\}/);
  assert.match(receiptSource, /quick-sales\/customers\/member-lookup/);
  assert.match(receiptSource, /quick-sales\/customers\/member-search/);
  assert.match(receiptSource, /htmlFor="cafeMemberCode"/);
  assert.match(receiptSource, /onDetected=\{\(code\)/);
  assert.match(receiptSource, /sm:grid-cols-2/);
  assert.match(receiptSource, /sm:col-span-2/);
  assert.match(receiptSource, /memberSuggestions/);
});

test('slightly enlarges the POS product image without increasing the card body', async () => {
  const receiptSource = await readFile(receiptSourceUrl, 'utf8');

  assert.match(receiptSource, /-top-12 left-1\/2 size-32/);
  assert.match(receiptSource, /px-3 pb-3 pt-20/);
  assert.doesNotMatch(receiptSource, /px-3 pb-3 pt-(?:2[14]|\[)/);
});
