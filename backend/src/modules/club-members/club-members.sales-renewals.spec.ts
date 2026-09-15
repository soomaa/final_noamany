import { ClubMembersService } from './club-members.service';
import { localDateString } from './club-member.utils';

const shiftDays = (days: number) => {
  const date = new Date(`${localDateString()}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

test('sales renewals follows subscription ownership, latest subscription, filters, paging and lead handoff contract', async () => {
  const subscriptions = [
    { id: 12, member_id: 1, branch_id: 1, subscription_type: 'جديد', subscription_start_date: shiftDays(-30), subscription_end_date: shiftDays(-2), paid_amount: 100, renewed_from_subscription_id: null, status: 'expired', type: null },
    { id: 11, member_id: 1, branch_id: 1, subscription_type: 'قديم', subscription_start_date: shiftDays(-60), subscription_end_date: shiftDays(-31), paid_amount: 50, renewed_from_subscription_id: null, status: 'expired', type: null },
    { id: 21, member_id: 2, branch_id: 1, subscription_type: 'شهري', subscription_start_date: shiftDays(-20), subscription_end_date: shiftDays(5), paid_amount: 200, renewed_from_subscription_id: null, status: 'active', type: null },
  ];
  const prisma: any = {
    employees: { findUnique: jest.fn().mockResolvedValue({ mosma_wazefy_n: 'أخصائي مبيعات', mosma_wazefy_code: null }) },
    department_jobs: { findUnique: jest.fn() },
    club_subscriptions: { findMany: jest.fn()
      .mockResolvedValueOnce([{ member_id: 1 }, { member_id: 2 }])
      .mockResolvedValueOnce(subscriptions) },
    club_members: { findMany: jest.fn().mockResolvedValue([
      { id: 1, member_code: 'M1', name: 'عضو منتهي', phone: '0101', branch_id: 1 },
      { id: 2, member_code: 'M2', name: 'عضو قريب', phone: '0102', branch_id: 1 },
    ]) },
    club_leads: { findMany: jest.fn().mockResolvedValue([{ id: 71, phone: '0101', converted_member_id: 1, last_contacted_at: new Date('2026-09-01') }]) },
  };
  const service = new ClubMembersService(
    prisma,
    { log: jest.fn() } as any,
    { resolveListFilter: () => [1], memberGenderFilter: () => null } as any,
    {} as any,
    {} as any,
  );

  const result = await service.salesRenewals({ sub: 9, emp_code: 77, branch: 1 } as any, { window: 'all', search: 'عضو', page: 1, pageSize: 1 });

  expect(prisma.club_members.findMany.mock.calls[0][0].where.OR).toEqual([{ sales_id: 77 }, { created_by: 9 }, { id: { in: [1, 2] } }]);
  expect(result).toEqual(expect.objectContaining({ total: 2, page: 1, pageSize: 1, summary: { expired: 1, dueSoon: 1, total: 2 } }));
  expect(result.data[0]).toEqual(expect.objectContaining({ memberId: 1, memberName: 'عضو منتهي', subscriptionId: 12, subscriptionType: 'جديد', leadId: 71 }));
});
