import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true, hmr: false }, optimizeDeps: { noDiscovery: true }, appType: 'custom' });
const { formatMoney, formatMoneyNumber, formatNum, formatTimeFromDate, formatDateTime } = await server.ssrLoadModule('/src/lib/formatters.ts');
test.after(async () => server.close());

test('money uses English digits and hides only zero piastres', () => {
  assert.equal(formatMoneyNumber(20), '20');
  assert.equal(formatMoneyNumber(20.5), '20.50');
  assert.equal(formatMoneyNumber(20.25), '20.25');
  assert.equal(formatMoneyNumber(1250), '1,250');
  assert.equal(formatMoney(20, undefined, 'ar'), '20 EGP');
});

test('reused number formatters preserve rounding, invalid values and both locales', () => {
  for (const value of [0, 1250, 20.5, 20.25, -1.25, 1.999, '1250.50']) {
    const cents = Math.round(Number(value) * 100);
    const digits = Math.abs(cents % 100) !== 0 ? 2 : 0;
    const expected = new Intl.NumberFormat('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(cents / 100);
    assert.equal(formatMoneyNumber(value), expected);
    for (const locale of ['ar', 'en']) {
      const expectedNumber = new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'ar-SA-u-nu-latn').format(Number(value));
      assert.equal(formatNum(value, locale), expectedNumber);
    }
  }
  for (const value of [NaN, Infinity, 'invalid']) assert.equal(formatMoneyNumber(value), '—');
});

test('cached clocks preserve locale, seconds and date options without leaking between calls', () => {
  const date = new Date('2026-10-08T06:09:12Z');
  for (let repeat = 0; repeat < 2; repeat++) for (const locale of ['ar', 'en']) for (const seconds of [true, false]) {
    const options = { hour: 'numeric', minute: '2-digit', ...(seconds ? { second: '2-digit' } : {}), hour12: true };
    const intlLocale = locale === 'en' ? 'en-US' : 'ar-EG-u-nu-latn';
    assert.equal(formatTimeFromDate(date, locale, { seconds }), new Intl.DateTimeFormat(intlLocale, options).format(date));
    assert.equal(formatDateTime(date, locale, { seconds }), new Intl.DateTimeFormat(intlLocale, { year:'numeric', month:'2-digit', day:'2-digit', ...options }).format(date));
  }
  assert.equal(formatDateTime('invalid'), '—');
  assert.equal(formatTimeFromDate(null), '—');
});
