import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('shared report audience control is JWT-locked and accessible', async () => {
  const text = await source('../src/components/reports/audience-filter.tsx');
  assert.match(text, /man_women_type === 0/);
  assert.match(text, /man_women_type === 1/);
  assert.match(text, /aria-label=\{ui\('القسم'\)\}/);
  assert.match(text, /disabled=\{locked\}/);
});

test('subscription daily and status reports send the effective audience', async () => {
  for (const path of [
    '../src/pages/reports/club/members-daily.tsx',
    '../src/pages/reports/club/subscriptions-daily.tsx',
    '../src/pages/reports/club/subscription-status-reports.tsx',
    '../src/pages/club/subscription-reports.tsx',
  ]) {
    const text = await source(path);
    assert.match(text, /ReportAudienceFilter/);
    assert.match(text, /gender/);
  }
  const members = await source('../src/pages/reports/club/members-daily.tsx');
  assert.match(members, /club-members-daily[^\]]+audience\.gender/s);
  assert.match(members, /gender: audience\.gender/);

  const canonical = await source('../src/pages/club/subscription-reports.tsx');
  assert.match(canonical, /const lockedGender/);
  assert.match(canonical, /gender === lockedGender/);
  assert.match(canonical, /locked=\{lockedGender !== null\}/);
  assert.doesNotMatch(canonical, /SelectFilter label=\{ui\('النوع'\)\} value=\{draft\.gender\}/);
});

test('member-linked miscellaneous reports send the effective audience', async () => {
  const text = await source('../src/pages/reports/club/misc-reports.tsx');
  assert.match(text, /ReportAudienceFilter/);
  assert.match(text, /gender/);
  assert.match(text, /club-locker-subscriptions/);
  assert.match(text, /club-trainers[\s\S]*audience\.gender/);
});
