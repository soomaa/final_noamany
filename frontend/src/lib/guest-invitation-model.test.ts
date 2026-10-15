import assert from 'node:assert/strict';
import test from 'node:test';
import { invitationLeadPresentation } from './guest-invitation-model.ts';

test('presents converted invitation leads as completed memberships', () => {
  assert.deepEqual(invitationLeadPresentation('converted'), {
    label: 'تم الاشتراك',
    tone: 'success',
  });
});

test('presents invitations without a lead as needing attention', () => {
  assert.deepEqual(invitationLeadPresentation(null), {
    label: 'لم تُنشأ متابعة',
    tone: 'warning',
  });
});

test('covers the deferred-follow-up stage the sales pipeline can put a lead in', () => {
  assert.deepEqual(invitationLeadPresentation('follow_later'), {
    label: 'متابعة لاحقًا',
    tone: 'warning',
  });
});
