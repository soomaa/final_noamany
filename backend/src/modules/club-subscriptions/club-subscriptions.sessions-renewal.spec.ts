import { ClubSubscriptionsService } from './club-subscriptions.service';

describe('session quota renewal promotion', () => {
  it('promotes a queued renewal when the final session is consumed', async () => {
    const row = { id: 41, branch_id: 2, subscription_number: 'SUB-41', registration_date: '2026-08-01', member_id: 9, customer_name: 'عضو', subscription_type_id: 7, special_class_type_id: null, private_package_id: null, private_trainer_id: null, private_discount_type: null, subscription_type: 'حصص', subscription_start_date: '2026-08-01', subscription_end_date: '2026-09-01', subscription_value: 500, discount_enabled: false, discount_code_id: null, discount_percentage: null, discount_value: 0, paid_amount: 500, waived_amount: 0, transferred_credit_amount: 0, remaining_amount: 0, gender: null, employee_id: null, sales_id: null, payment_method: 'cash', receipt_number: null, customer_source_id: null, guardian_name: null, guardian_phone: null, status: 'active', is_special: false, is_linked_to_sessions: true, sessions_count: 3, sessions_used: 2, inbody_used: 0, spa_used: 0, allow_multiple_daily_entries: false, is_time_based: false, time_from: null, time_to: null, created_by: 1, created_at: new Date(), updated_at: new Date() };
    const tx = { club_subscriptions: { update: jest.fn().mockResolvedValue({ ...row, sessions_used: 3 }) } };
    const prisma = {
      club_members: { findUnique: jest.fn().mockResolvedValue({ gender: 'male', is_deleted: false }) },
      club_subscriptions: { findUnique: jest.fn().mockResolvedValue(row) },
      $transaction: jest.fn((fn) => fn(tx)),
    };
    const lifecycle = { promoteAfterQuotaExhaustion: jest.fn().mockResolvedValue({ activatedSubscriptionId: 42, shiftedSubscriptionIds: [42], shiftDays: 2 }), syncActivatedMember: jest.fn() };
    const service = new ClubSubscriptionsService(prisma as never, {} as never, {} as never, {} as never, {} as never, {
      isBranchAllowed: jest.fn().mockReturnValue(true),
      memberGenderFilter: jest.fn().mockReturnValue(null),
    } as never, {} as never, {} as never, lifecycle as never);
    await service.useSession(41);
    expect(lifecycle.promoteAfterQuotaExhaustion).toHaveBeenCalledWith(41, expect.any(String), tx);
    expect(lifecycle.syncActivatedMember).toHaveBeenCalledWith(42);
  });
});
