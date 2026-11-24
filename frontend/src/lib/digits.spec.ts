import assert from 'node:assert/strict';
import test from 'node:test';
import { digitsOnly } from './digits.ts';

test('keeps Latin digits and drops separators', () => {
  assert.equal(digitsOnly('0155-313 4827'), '01553134827');
  assert.equal(digitsOnly('+20 155 313 4827'), '201553134827');
});

test('reads a number pasted from a screen that renders Arabic digits', () => {
  assert.equal(digitsOnly('٠١٥٥٣١٣٤٨٢٧'), '01553134827');
});

test('reads Eastern Arabic-Indic digits', () => {
  assert.equal(digitsOnly('۰۱۵۵۳۱۳۴۸۲۷'), '01553134827');
});

test('reads a number mixing both digit systems', () => {
  assert.equal(digitsOnly('٠١٥٥3134827'), '01553134827');
});

test('strips direction marks and decoration around Arabic digits', () => {
  assert.equal(digitsOnly('‏٠١٥٥-٣١٣-٤٨٢٧ '), '01553134827');
});

test('absent values give an empty string, never a crash', () => {
  assert.equal(digitsOnly(null), '');
  assert.equal(digitsOnly(undefined), '');
  assert.equal(digitsOnly(''), '');
  assert.equal(digitsOnly('لا أرقام هنا'), '');
});
