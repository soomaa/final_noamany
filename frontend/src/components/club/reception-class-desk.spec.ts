import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./reception-class-desk.tsx', import.meta.url), 'utf8');

test('today classes handle is attached to the opposite page edge', () => {
  assert.match(source, /className="fixed left-0[^"]*rounded-l-none/);
  assert.doesNotMatch(source, /className="fixed (?:start|end)-0[^"]*حصص اليوم/);
});

test('class tabs stay centered', () => {
  assert.match(source, /<div className="flex justify-center"><TabsList>/);
});

test('member attendance search offers live name, code and phone results', () => {
  assert.match(source, /setTimeout\(\(\) =>/);
  assert.match(source, /searchClubMembers\(identifier/);
  assert.match(source, /hit\.name/);
  assert.match(source, /hit\.memberCode/);
  assert.match(source, /hit\.phone/);
});

test('external attendance collects a separate name and mobile number', () => {
  assert.match(source, /اسم العضو الخارجي/);
  assert.match(source, /id="class-desk-phone"/);
  assert.match(source, /identifier: attendanceIdentifier/);
});
