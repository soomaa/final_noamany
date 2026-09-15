import { ClubDashboardService } from './club-dashboard.service';

describe('ClubDashboardService executive cache', () => {
  const branchScope = {
    resolveListFilter: jest.fn().mockReturnValue([3]),
    memberGenderFilter: jest.fn().mockReturnValue(null),
  };

  const makeService = () =>
    new ClubDashboardService({} as never, branchScope as never, {} as never);

  beforeEach(() => jest.clearAllMocks());

  it('deduplicates identical dashboard requests during the short cache window', async () => {
    const service = makeService();
    const build = jest
      .spyOn(service as unknown as { buildExecutive: () => Promise<unknown> }, 'buildExecutive')
      .mockResolvedValue({ ok: true });
    const query = { startDate: '2026-08-01', endDate: '2026-08-14', branchId: '3' };
    const user = { sub: 42 } as never;

    const [first, second] = await Promise.all([
      service.executive(query, user),
      service.executive(query, user),
    ]);

    expect(first).toEqual({ ok: true });
    expect(second).toBe(first);
    expect(build).toHaveBeenCalledTimes(1);
  });

  it('removes rejected work so the next request can retry', async () => {
    const service = makeService();
    const build = jest
      .spyOn(service as unknown as { buildExecutive: () => Promise<unknown> }, 'buildExecutive')
      .mockRejectedValueOnce(new Error('temporary'))
      .mockResolvedValueOnce({ ok: true });
    const query = { startDate: '2026-08-01', endDate: '2026-08-14' };
    const user = { sub: 7 } as never;

    await expect(service.executive(query, user)).rejects.toThrow('temporary');
    await expect(service.executive(query, user)).resolves.toEqual({ ok: true });
    expect(build).toHaveBeenCalledTimes(2);
  });
});

describe('ClubDashboardService audience scope', () => {
  it('filters executive quick-sale totals to canonical members in the authenticated audience', async () => {
    const prisma = {
      club_subscriptions: { findMany: jest.fn().mockResolvedValue([]), groupBy: jest.fn().mockResolvedValue([]) },
      club_members: {
        findMany: jest.fn().mockImplementation((args: { select?: { id?: boolean } }) =>
          Promise.resolve(args.select?.id ? [{ id: 44 }] : []),
        ),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      club_attendance: { findMany: jest.fn().mockResolvedValue([]) },
      employees: { count: jest.fn().mockResolvedValue(0) },
      sales_quick_sales: {
        aggregate: jest.fn().mockResolvedValue({ _count: { _all: 0 }, _sum: { collected_amount: 0 } }),
      },
      sales_bookings: { count: jest.fn().mockResolvedValue(0) },
      tbl_branches: { findMany: jest.fn().mockResolvedValue([]) },
      club_inbody_invoices: { groupBy: jest.fn().mockResolvedValue([]) },
      $queryRaw: jest.fn().mockResolvedValue([]),
    };
    const branchScope = {
      resolveListFilter: jest.fn().mockReturnValue([3]),
      memberGenderFilter: jest.fn().mockReturnValue('female'),
    };
    const service = new ClubDashboardService(prisma as never, branchScope as never, {} as never);
    jest.spyOn(service, 'summary').mockResolvedValue({
      totalMembers: { active: 0, inactive: 0 }, totalRemaining: 0, trainers: 0, facilities: 0, classesToday: 0,
    } as never);

    await (service as unknown as { buildExecutive: (query: { startDate: string; endDate: string }, user: never) => Promise<unknown> })
      .buildExecutive({ startDate: '2026-09-01', endDate: '2026-09-09' }, { sub: 7, branch: 3, man_women_type: 1 } as never);

    expect(prisma.sales_quick_sales.aggregate).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ customer_member_id: { in: [44] } }),
    }));
    expect(prisma.sales_bookings.count).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: -1 }),
    }));
    expect(prisma.employees.count).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ branch_id_fk: { in: [3] }, emp_type: 2 }),
    }));
    expect(prisma.club_inbody_invoices.groupBy).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        OR: expect.arrayContaining([
          { member_id: { in: [44] } },
          expect.objectContaining({ member_id: null, subscription: expect.anything() }),
        ]),
      }),
    }));
  });

  it('limits summary trainer totals to the authenticated branch', async () => {
    const prisma = {
      club_members: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
      club_subscriptions: { findMany: jest.fn().mockResolvedValue([]) },
      club_locker_subscriptions: { findMany: jest.fn().mockResolvedValue([]) },
      club_attendance: { groupBy: jest.fn().mockResolvedValue([]) },
      club_halls: { count: jest.fn().mockResolvedValue(0) },
      employees: { findMany: jest.fn().mockResolvedValue([{ id: 31 }]) },
      club_trainers: { count: jest.fn().mockResolvedValue(0) },
      club_classes: { count: jest.fn().mockResolvedValue(0) },
      club_spa_invoices: { findMany: jest.fn().mockResolvedValue([]) },
      club_inbody_invoices: { findMany: jest.fn().mockResolvedValue([]) },
      club_class_enrollments: { findMany: jest.fn().mockResolvedValue([]) },
      club_receipts: { findMany: jest.fn().mockResolvedValue([]) },
      club_subscription_refunds: { findMany: jest.fn().mockResolvedValue([]) },
      $queryRaw: jest.fn().mockResolvedValue([{
        active_members: 0, active_subscriptions: 0, outstanding_count: 0,
        outstanding_amount: 0, expired: 0, pending_renewals: 0,
        expiring_7: 0, expiring_30: 0, monthly: 0, quarterly: 0,
        half_yearly: 0, yearly: 0,
      }]),
    };
    const branchScope = {
      resolveListFilter: jest.fn().mockReturnValue([3]),
      memberGenderFilter: jest.fn().mockReturnValue('female'),
    };
    const service = new ClubDashboardService(prisma as never, branchScope as never, {} as never);

    await service.summary(
      { startDate: '2026-09-01', endDate: '2026-09-09' },
      { sub: 7, branch: 3, man_women_type: 1 } as never,
      [],
    );

    expect(prisma.employees.findMany).toHaveBeenCalledWith({
      where: { branch_id_fk: { in: [3] }, emp_type: 2 },
      select: { id: true },
    });
    expect(prisma.club_trainers.count).toHaveBeenCalledWith({
      where: { is_deleted: false, is_active: true, employee_id: { in: [31] } },
    });
  });

  it('fails closed in raw subscription metrics when the authenticated user has no branch', async () => {
    const prisma = {
      club_members: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
      club_subscriptions: { findMany: jest.fn().mockResolvedValue([]) },
      club_locker_subscriptions: { findMany: jest.fn().mockResolvedValue([]) },
      club_attendance: { groupBy: jest.fn().mockResolvedValue([]) },
      club_halls: { count: jest.fn().mockResolvedValue(0) },
      employees: { findMany: jest.fn().mockResolvedValue([]) },
      club_trainers: { count: jest.fn().mockResolvedValue(0) },
      club_classes: { count: jest.fn().mockResolvedValue(0) },
      club_spa_invoices: { findMany: jest.fn().mockResolvedValue([]) },
      club_inbody_invoices: { findMany: jest.fn().mockResolvedValue([]) },
      club_class_enrollments: { findMany: jest.fn().mockResolvedValue([]) },
      club_receipts: { findMany: jest.fn().mockResolvedValue([]) },
      club_subscription_refunds: { findMany: jest.fn().mockResolvedValue([]) },
      $queryRaw: jest.fn().mockResolvedValue([{
        active_members: 0, active_subscriptions: 0, outstanding_count: 0,
        outstanding_amount: 0, expired: 0, pending_renewals: 0,
        expiring_7: 0, expiring_30: 0, monthly: 0, quarterly: 0,
        half_yearly: 0, yearly: 0,
      }]),
    };
    const branchScope = {
      resolveListFilter: jest.fn().mockReturnValue([]),
      memberGenderFilter: jest.fn().mockReturnValue('female'),
    };
    const service = new ClubDashboardService(prisma as never, branchScope as never, {} as never);

    await service.summary(
      { startDate: '2026-09-01', endDate: '2026-09-09' },
      { sub: 7, branch: 0, man_women_type: 1 } as never,
      [],
    );

    const rawArgs = prisma.$queryRaw.mock.calls[0];
    const nestedSql = rawArgs.filter(
      (arg): arg is { strings: readonly string[] } => typeof arg === 'object' && arg !== null && !Array.isArray(arg),
    );
    expect(nestedSql.some((sql) => sql.strings.join('').includes('AND 1 = 0'))).toBe(true);
  });

  it('applies the authenticated member gender to summary counts, subscriptions, attendance, lockers, receipts and refunds', async () => {
    const prisma = {
      club_members: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockImplementation((args: { select?: { id?: boolean } }) =>
          Promise.resolve(args.select?.id && Object.keys(args.select).length === 1 ? [{ id: 44 }] : []),
        ),
      },
      club_subscriptions: { findMany: jest.fn().mockResolvedValue([]) },
      club_locker_subscriptions: { findMany: jest.fn().mockResolvedValue([]) },
      club_attendance: { groupBy: jest.fn().mockResolvedValue([]) },
      club_halls: { count: jest.fn().mockResolvedValue(0) },
      employees: { findMany: jest.fn().mockResolvedValue([]) },
      club_trainers: { count: jest.fn().mockResolvedValue(0) },
      club_classes: { count: jest.fn().mockResolvedValue(0) },
      club_spa_invoices: { findMany: jest.fn().mockResolvedValue([]) },
      club_inbody_invoices: { findMany: jest.fn().mockResolvedValue([]) },
      club_class_enrollments: { findMany: jest.fn().mockResolvedValue([]) },
      club_receipts: { findMany: jest.fn().mockResolvedValue([]) },
      club_subscription_refunds: { findMany: jest.fn().mockResolvedValue([]) },
      $queryRaw: jest.fn().mockResolvedValue([{
        active_members: 0, active_subscriptions: 0, outstanding_count: 0,
        outstanding_amount: 0, expired: 0, pending_renewals: 0,
        expiring_7: 0, expiring_30: 0, monthly: 0, quarterly: 0,
        half_yearly: 0, yearly: 0,
      }]),
    };
    const branchScope = {
      resolveListFilter: jest.fn().mockReturnValue([3]),
      memberGenderFilter: jest.fn().mockReturnValue('female'),
    };
    const service = new ClubDashboardService(prisma as never, branchScope as never, {} as never);

    await service.summary(
      { startDate: '2026-09-01', endDate: '2026-09-09', branchId: '3' },
      { sub: 7 } as never,
      [],
    );

    expect(prisma.club_members.count).toHaveBeenCalledWith({
      where: expect.objectContaining({ branch_id: { in: [3] }, gender: 'female' }),
    });
    expect(prisma.club_subscriptions.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ member: expect.objectContaining({ gender: 'female' }) }),
    }));
    expect(prisma.club_attendance.groupBy).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ member: expect.objectContaining({ gender: 'female' }) }),
    }));
    expect(prisma.club_locker_subscriptions.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ member: expect.objectContaining({ gender: 'female' }) }),
    }));
    expect(prisma.club_receipts.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ AND: expect.arrayContaining([
        expect.objectContaining({ OR: expect.any(Array) }),
      ]) }),
    }));
    expect(prisma.club_subscription_refunds.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        subscription: expect.objectContaining({ member: expect.objectContaining({ gender: 'female' }) }),
      }),
    }));
    expect(prisma.club_classes.count).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ audience: { in: ['women', 'mixed'] } }),
    }));
    expect(prisma.club_class_enrollments.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ member_id: { in: [44] } }),
    }));
    expect(prisma.club_spa_invoices.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ member_id: { in: [44] } }),
    }));
    expect(prisma.club_inbody_invoices.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        OR: expect.arrayContaining([
          { member_id: { in: [44] } },
          expect.objectContaining({ member_id: null, subscription: expect.anything() }),
        ]),
      }),
    }));
  });
});
