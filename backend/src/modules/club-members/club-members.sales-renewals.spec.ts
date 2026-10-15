import { localDateString } from '../club-fitness/club-fitness.utils';
import { ClubMembersService } from './club-members.service';

const shiftDays = (days: number) => {
  const date = new Date(`${localDateString()}T12:00:00`);
  date.setDate(date.getDate() + days);
  return localDateString(date);
};

describe('sales renewal workspace', () => {
  it('uses the latest contract and includes reception-created members owned through CRM', async () => {
    const prisma = {
      employees: {
        findUnique: jest.fn().mockResolvedValue({
          mosma_wazefy_code: null,
          mosma_wazefy_n: 'أخصائي مبيعات',
          leave_emp: null,
          employee_type: 1,
        }),
      },
      department_jobs: { findUnique: jest.fn() },
      club_members: {
        findMany: jest.fn().mockResolvedValue([
          { id: 10, member_code: 'A10', name: 'عضو منتهي', phone: '0101', branch_id: 1 },
          { id: 20, member_code: 'A20', name: 'عضو قريب', phone: '0102', branch_id: 1 },
        ]),
      },
      club_subscriptions: {
        findMany: jest.fn().mockImplementation((args) =>
          args?.distinct
            ? Promise.resolve([{ member_id: 10 }, { member_id: 20 }])
            : Promise.resolve([
                {
                  id: 102,
                  member_id: 10,
                  subscription_type: 'الاشتراك الأحدث',
                  subscription_start_date: '2026-08-01',
                  subscription_end_date: shiftDays(-7),
                  paid_amount: 1200,
                  status: 'expired',
                  type: null,
                },
                {
                  id: 101,
                  member_id: 10,
                  subscription_type: 'اشتراك قديم',
                  subscription_start_date: '2026-01-01',
                  subscription_end_date: '2026-02-01',
                  paid_amount: 700,
                  status: 'expired',
                  type: null,
                },
                {
                  id: 201,
                  member_id: 20,
                  subscription_type: 'شهري',
                  subscription_start_date: '2026-08-20',
                  subscription_end_date: shiftDays(5),
                  paid_amount: 800,
                  status: 'active',
                  type: null,
                },
              ]),
        ),
      },
      club_sales_crm_leads: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 71,
            phone: '0101',
            converted_member_id: 10,
            last_contacted_at: new Date('2026-08-30T10:00:00Z'),
          },
        ]),
      },
    };
    const branchScope = {
      resolveListFilter: jest.fn().mockReturnValue([1]),
      isBranchAllowed: jest.fn().mockReturnValue(true),
    };
    const service = new ClubMembersService(
      prisma as never,
      { log: jest.fn() } as never,
      branchScope as never,
      {} as never,
    );

    const result = await service.salesRenewals(
      { sub: 9, emp_code: 77, branch: 1 } as never,
      { window: 'all', page: 1, pageSize: 25 },
    );

    expect(prisma.club_members.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          branch_id: { in: [1] },
          OR: [{ sales_id: 77 }, { created_by: 9 }, { id: { in: [10, 20] } }],
        }),
      }),
    );
    expect(result.data).toHaveLength(2);
    expect(result.data[0]).toEqual(
      expect.objectContaining({
        memberId: 10,
        subscriptionType: 'الاشتراك الأحدث',
        paidAmount: 1200,
        leadId: 71,
      }),
    );
    expect(result.data[0].daysRemaining).toBeLessThan(0);
    expect(result.data[1].memberId).toBe(20);
    expect(result.data[1].daysRemaining).toBeGreaterThanOrEqual(0);
  });
});
