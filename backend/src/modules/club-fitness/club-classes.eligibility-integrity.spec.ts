import { eligibleEnrollmentSource } from './class-enrollment-entitlement';

describe('attendance history versus new class bookings', () => {
  const cls: any = { id: 4, branch_id: 2, trainer_id: 8, status: 'completed', class_date: '2099-10-01', start_time: '17:00', end_time: '18:00', class_type_id: 3, audience: 'all' };
  const sub = { id: 20, status: 'active', branch_id: 2, subscription_type_id: 7, subscription_start_date: '2026-01-01', subscription_end_date: '2099-12-31', sessions_used: 0, class_sessions_used: 0, is_linked_to_sessions: true, sessions_count: 4, type: { class_types: [{ class_type_id: 3 }] }, class_entitlement: { version: 1, classTypeIds: [3], branchIds: [2], limit: 4, unlimited: false } };
  function client(): any { return {
    club_members: { findFirst: async () => ({ id: 11, gender: 'male' }) },
    club_trainers: { findFirst: async () => null },
    club_subscriptions: { findMany: async () => [sub] },
    club_class_enrollments: { count: async () => 0, findMany: async () => [] },
    club_class_bookings: { findMany: async () => [] },
    club_free_session_grants: { findUnique: async () => null },
  }; }
  it('allows recording a linked attendance after class completion even if its trainer later deactivated', async () => {
    expect(await eligibleEnrollmentSource(client(), cls, 11, 20, 5)).toBe(20);
  });
  it('still blocks a new booking with an unavailable trainer', async () => {
    await expect(eligibleEnrollmentSource(client(), { ...cls, status: 'scheduled' }, 11)).rejects.toThrow('مدرب الحصة غير نشط');
  });
});
