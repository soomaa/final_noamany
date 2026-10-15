import { ForbiddenException } from '@nestjs/common';
import { ClubMembersService } from './club-members.service';

function buildService(jobTitle: string | null, options: { active?: boolean } = {}) {
  const active = options.active ?? true;
  const prisma = {
    employees: {
      findUnique: jest.fn().mockResolvedValue({
        mosma_wazefy_code: null,
        mosma_wazefy_n: jobTitle,
        leave_emp: active ? null : 1,
        employee_type: active ? 1 : 0,
      }),
      findMany: jest.fn().mockResolvedValue([
        { id: 77, employee: 'مندوب حالي', branch_id_fk: 1 },
        { id: 88, employee: 'مندوب متقدم', branch_id_fk: 1 },
      ]),
    },
    club_members: {
      count: jest.fn()
        .mockResolvedValueOnce(12)
        .mockResolvedValueOnce(3)
        .mockResolvedValueOnce(7)
        .mockResolvedValueOnce(10),
      findMany: jest.fn().mockResolvedValue([
        {
          id: 4,
          member_code: 'A000004',
          name: 'عضو مبيعات',
          phone: '01000000000',
          is_active: true,
          created_at: new Date('2026-08-23T10:00:00Z'),
        },
      ]),
    },
    club_sales_rep_settings: {
      findUnique: jest.fn().mockResolvedValue({
        employee_id: 77,
        monthly_target: 10000,
        commission_mode: 'tiered',
        flat_commission_percent: 0,
        tiers: [
          { min_achievement_pct: 0, max_achievement_pct: 79.99, commission_percent: 1 },
          { min_achievement_pct: 80, max_achievement_pct: null, commission_percent: 3 },
        ],
      }),
      findMany: jest.fn().mockResolvedValue([
        {
          employee_id: 77,
          monthly_target: 10000,
          target_period_mode: 'monthly',
          target_start_date: null,
          target_end_date: null,
          target_days: null,
        },
        {
          employee_id: 88,
          monthly_target: 5000,
          target_period_mode: 'monthly',
          target_start_date: null,
          target_end_date: null,
          target_days: null,
        },
      ]),
    },
    club_subscriptions: {
      findMany: jest.fn()
        .mockResolvedValueOnce([
          {
            id: 21,
            subscription_number: 'SUB-21',
            customer_name: 'عضو أول',
            paid_amount: 5000,
            registration_date: '2026-08-05',
            subscription_type: 'سنوي',
          },
          {
            id: 22,
            subscription_number: 'SUB-22',
            customer_name: 'عضو ثانٍ',
            paid_amount: 4000,
            registration_date: '2026-08-10',
            subscription_type: 'شهري',
          },
        ])
        .mockResolvedValueOnce([
          { sales_id: 77, paid_amount: 9000, registration_date: '2026-08-10' },
          { sales_id: 88, paid_amount: 6000, registration_date: '2026-08-12' },
        ]),
    },
    club_sales_crm_leads: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 31,
          full_name: 'عميل جديد',
          phone: '01111111111',
          status: 'new',
          created_at: new Date('2026-08-01T08:00:00Z'),
          last_contacted_at: null,
        },
        {
          id: 32,
          full_name: 'عميل محول',
          phone: '01222222222',
          status: 'converted',
          created_at: new Date('2026-08-03T08:00:00Z'),
          last_contacted_at: new Date('2026-08-03T10:00:00Z'),
        },
      ]),
    },
    department_jobs: {
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([{ id: 5 }]),
    },
  };
  const branchScope = {
    resolveListFilter: jest.fn().mockReturnValue([1]),
    isBranchAllowed: jest.fn().mockReturnValue(true),
  };
  return {
    service: new ClubMembersService(prisma as never, { log: jest.fn() } as never, branchScope as never, {} as never),
    prisma,
  };
}

describe('ClubMembersService sales portal', () => {
  // The fixtures book sales in August 2026 against a monthly target, so the assertions
  // only hold while "now" is inside that month. Pin the clock instead of letting the
  // suite start failing once the calendar rolls over.
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-15T12:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns branch-scoped metrics and recent members assigned to the logged-in sales specialist', async () => {
    const { service, prisma } = buildService('أخصائي مبيعات');

    const result = await service.salesPortal({ sub: 9, emp_code: 77, branch: 1 } as never);

    expect(result).toEqual(expect.objectContaining({
      statistics: { totalAssigned: 12, registeredToday: 3, registeredThisMonth: 7, activeMembers: 10 },
      performance: expect.objectContaining({
        target: 10000,
        actualRevenue: 9000,
        achievementPct: 90,
        commissionPercent: 3,
        commissionDue: 270,
        conversionRate: 50,
        overdueLeads: 1,
        closedDeals: 2,
      }),
      pipeline: { new: 1, inProgress: 0, followLater: 0, qualified: 0, converted: 1, lost: 0 },
      leaderboard: [
        { rank: 1, employeeId: 88, name: 'مندوب متقدم', achievementPct: 120, isCurrent: false },
        { rank: 2, employeeId: 77, name: 'مندوب حالي', achievementPct: 90, isCurrent: true },
      ],
      closedDeals: expect.arrayContaining([expect.objectContaining({ id: 21, paidAmount: 5000 })]),
      recentMembers: expect.arrayContaining([expect.objectContaining({ id: 4, memberCode: 'A000004' })]),
    }));
    expect(prisma.club_members.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        branch_id: { in: [1] },
        OR: [{ sales_id: 77 }, { created_by: 9 }],
      }),
    }));
    expect(prisma.club_subscriptions.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ sales_id: 77, branch_id: { in: [1] } }),
    }));
    expect(prisma.club_sales_crm_leads.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ assigned_to_id: 77, branch_id: { in: [1] } }),
    }));
    const leaderboard = (result as unknown as { leaderboard: Array<Record<string, unknown>> }).leaderboard;
    expect(Object.keys(leaderboard[0]).sort()).toEqual([
      'achievementPct',
      'employeeId',
      'isCurrent',
      'name',
      'rank',
    ]);
  });

  it('rejects users whose employee job is not sales', async () => {
    const { service } = buildService('موظف استقبال');

    await expect(service.salesPortal({ sub: 8, emp_code: 12, branch: 1 } as never))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects an inactive or departed sales employee even when the job title is still sales', async () => {
    const { service } = buildService('أخصائي مبيعات', { active: false });

    await expect(service.salesPortal({ sub: 8, emp_code: 77, branch: 1 } as never))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  it('keeps assigned leads from before the target cycle in pipeline and overdue metrics', async () => {
    const { service, prisma } = buildService('أخصائي مبيعات');

    await service.salesPortal({ sub: 9, emp_code: 77, branch: 1 } as never);

    expect(prisma.club_sales_crm_leads.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.not.objectContaining({ created_at: expect.anything() }),
    }));
  });
});
