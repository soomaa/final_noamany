import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement, Fragment, type ReactNode } from 'react';
import { optionsFrom } from './select-options.ts';

const option = (value: string, label: ReactNode) => createElement('option', { value, key: value }, label);

test('reads plain options in the order they were written', () => {
  const got = optionsFrom([option('a', 'Alpha'), option('b', 'Beta')]);
  assert.deepEqual(got, [{ value: 'a', label: 'Alpha' }, { value: 'b', label: 'Beta' }]);
});

test('looks inside fragments, which is how mapped lists arrive', () => {
  const got = optionsFrom(
    createElement(Fragment, null, option('', 'Any'), [option('1', 'One'), option('2', 'Two')]),
  );
  assert.deepEqual(got.map((o) => o.value), ['', '1', '2']);
});

test('joins an interpolated label into one searchable string', () => {
  const got = optionsFrom([option('7', ['Sara', ' — ', 'coach'])]);
  assert.equal(got[0].label, 'Sara — coach');
});

test('an option with no value carries the empty string, not "undefined"', () => {
  const got = optionsFrom([createElement('option', { key: 'x' }, 'Nobody')]);
  assert.deepEqual(got, [{ value: '', label: 'Nobody' }]);
});

test('flattens optgroup children rather than dropping them', () => {
  const got = optionsFrom([
    createElement('optgroup', { label: 'Coaches', key: 'g' }, option('1', 'One'), option('2', 'Two')),
  ]);
  assert.deepEqual(got.map((o) => o.label), ['One', 'Two']);
});
