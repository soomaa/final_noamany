import assert from 'node:assert/strict';
import test from 'node:test';
import { buildMemberNotificationRequest } from './member-notification-compose';

test('builds the PHAROS-compatible branch notification request', () => {
  assert.deepEqual(
    buildMemberNotificationRequest({
      title: ' عرض ',
      body: ' تجديد ',
      target: 'branch',
      branchId: '3',
      appUsersOnly: true,
    }),
    {
      title: 'عرض',
      body: 'تجديد',
      type: 'offer',
      broadcast: true,
      appUsersOnly: true,
      branchId: 3,
    },
  );
});

test('rejects incomplete copy and a branch target without a branch', () => {
  assert.throws(
    () => buildMemberNotificationRequest({
      title: '',
      body: 'تنبيه',
      target: 'all',
      branchId: '',
      appUsersOnly: true,
    }),
    /title and body/i,
  );
  assert.throws(
    () => buildMemberNotificationRequest({
      title: 'تنبيه',
      body: 'صيانة',
      target: 'branch',
      branchId: '',
      appUsersOnly: false,
    }),
    /branch/i,
  );
});
