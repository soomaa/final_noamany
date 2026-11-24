import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEAD_FEEDBACK_OPTIONS, feedbackByStatus, feedbackOptionsFor } from './lead-feedback.ts';

test('an unanswered call offers only the outcomes a silent phone can produce', () => {
  const shown = feedbackOptionsFor({ activityType: 'call', answered: false }).map((o) => o.key);
  assert.deepEqual(shown, ['no_answer', 'unreachable']);
});

test('an answered call offers the outcomes that need a conversation', () => {
  const shown = feedbackOptionsFor({ activityType: 'call', answered: true }).map((o) => o.key);
  assert.deepEqual(shown, ['follow_up', 'arrange_visit', 'not_interested', 'membership_done']);
});

test('a meeting or conversation never offers "no answer"', () => {
  for (const activityType of ['conversation', 'meeting']) {
    const shown = feedbackOptionsFor({ activityType }).map((o) => o.key);
    assert.ok(!shown.includes('no_answer'));
    assert.ok(!shown.includes('unreachable'));
  }
});

test('every option carries a status, and none of them is "converted"', () => {
  for (const o of LEAD_FEEDBACK_OPTIONS) {
    assert.match(o.status, /^[a-z_]+$/);
    assert.notEqual(o.status, 'converted');
  }
});

test('exactly the two answered outcomes close the lead', () => {
  assert.deepEqual(
    LEAD_FEEDBACK_OPTIONS.filter((o) => o.closes).map((o) => o.key),
    ['not_interested', 'membership_done'],
  );
});

test('a stored status maps back to its option so a saved lead shows what was picked', () => {
  assert.equal(feedbackByStatus('lost')?.key, 'not_interested');
  assert.equal(feedbackByStatus('visit_arranged')?.key, 'arrange_visit');
  assert.equal(feedbackByStatus('contacted'), null);
});
