import type { Prisma } from '@prisma/client';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { ClubDashboardService } from './club-dashboard.service';

const menEmployee = { sub: 11, level: 2, branch: 2, man_women_type: 1, member_sections: ['male'] } as never;
const womenEmployee = { sub: 12, level: 2, branch: 2, man_women_type: 2, member_sections: ['female'] } as never;
const admin = { sub: 1, level: 1 } as never;

const subscriptionSection = (gender: string) => ({
  OR: [{ gender }, { gender: null, member: { is: { gender } } }],
});

function makePrisma() {
  const model = () => ({
    count: jest.fn().mockResolvedValue(0),
    findMany: jest.fn().mockResolvedValue([]),
    groupBy: jest.fn().mockResolvedValue([]),
  });
  return {
    club_members: model(),
    club_subscriptions: model(),
    club_locker_subscriptions: model(),
    club_attendance: model(),
    club_halls: model(),
    club_trainers: model(),
    club_classes: model(),
    club_spa_invoices: model(),
    club_inbody_invoices: model(),
    club_class_enrollments: model(),
    club_receipts: model(),
    club_receipt_payments: model(),
    club_subscription_refunds: model(),
    $queryRaw: jest.fn().mockResolvedValue([]),
  };
}

function makeService(prisma = makePrisma(), superAdmin = false) {
  const permissions = { isSuperAdmin: jest.fn().mockResolvedValue(superAdmin) };
  const service = new ClubDashboardService(prisma as never, new BranchScopeService(), permissions as never);
  return { service, prisma };
}

/** The `AND COALESCE(s.gender, m.gender) = ?` fragment passed to the subscription-metrics query. */
function metricsSectionValues(prisma: ReturnType<typeof makePrisma>): unknown[] | null {
  const args = prisma.$queryRaw.mock.calls[0] as unknown[];
  const fragment = args
    .slice(1)
    .find(
      (v): v is Prisma.Sql =>
        typeof v === 'object' && v !== null && typeof (v as Prisma.Sql).sql === 'string' &&
        (v as Prisma.Sql).sql.includes('COALESCE(s.gender, m.gender)'),
    );
  return fragment ? fragment.values : null;
}

const range = { startDate: '2026-11-01', endDate: '2026-11-18' };

describe('ClubDashboardService summary — رجالي/حريمي/الكل', () => {
  it("does not narrow a men's employee to men by default; an explicit men's pick filters", async () => {
    const all = makeService();
    await all.service.summary(range, menEmployee, []);
    expect(all.prisma.club_members.count.mock.calls[0][0].where).not.toHaveProperty('gender');
    expect(all.prisma.club_subscriptions.findMany.mock.calls[0][0].where).not.toHaveProperty('AND');
    expect(all.prisma.club_attendance.groupBy.mock.calls[0][0].where).not.toHaveProperty('member');
    expect(metricsSectionValues(all.prisma)).toBeNull();

    const { service, prisma } = makeService();
    await service.summary({ ...range, gender: 'male' }, menEmployee, []);

    expect(prisma.club_members.count.mock.calls[0][0].where).toMatchObject({ gender: 'male' });
    expect(prisma.club_subscriptions.findMany.mock.calls[0][0].where.AND).toEqual([subscriptionSection('male')]);
    expect(prisma.club_locker_subscriptions.findMany.mock.calls[0][0].where.AND).toEqual([subscriptionSection('male')]);
    expect(prisma.club_attendance.groupBy.mock.calls[0][0].where.member).toEqual({ is: { gender: 'male' } });
    expect(metricsSectionValues(prisma)).toEqual(['male']);
    expect(prisma.club_receipts.findMany.mock.calls[0][0].where.AND).toContainEqual(
      expect.objectContaining({ OR: expect.arrayContaining([{ subscription: { is: subscriptionSection('male') } }]) }),
    );
    expect(prisma.club_subscription_refunds.findMany.mock.calls[0][0].where.subscription).toEqual({
      is: subscriptionSection('male'),
    });
  });

  it("lets a men's employee open the women's section", async () => {
    const { service, prisma } = makeService();
    await expect(service.summary({ ...range, gender: 'female' }, menEmployee, [])).resolves.toBeDefined();
    expect(prisma.club_members.count.mock.calls[0][0].where).toMatchObject({ gender: 'female' });
    expect(prisma.club_subscriptions.findMany.mock.calls[0][0].where.AND).toEqual([subscriptionSection('female')]);
    expect(metricsSectionValues(prisma)).toEqual(['female']);
  });

  it("lets a women's employee pick women's rows or the men's section", async () => {
    const { service, prisma } = makeService();
    await service.summary({ ...range, gender: 'female' }, womenEmployee, []);
    expect(prisma.club_members.count.mock.calls[0][0].where).toMatchObject({ gender: 'female' });
    expect(metricsSectionValues(prisma)).toEqual(['female']);

    const men = makeService();
    await expect(men.service.summary({ ...range, gender: 'male' }, womenEmployee, [])).resolves.toBeDefined();
    expect(men.prisma.club_members.count.mock.calls[0][0].where).toMatchObject({ gender: 'male' });
    expect(metricsSectionValues(men.prisma)).toEqual(['male']);
  });

  it('lets an admin pick a section, and is unfiltered with none', async () => {
    const picked = makeService();
    await picked.service.summary({ ...range, gender: 'female' }, admin, []);
    expect(picked.prisma.club_members.count.mock.calls[0][0].where).toMatchObject({ gender: 'female' });
    expect(picked.prisma.club_subscriptions.findMany.mock.calls[0][0].where.AND).toEqual([subscriptionSection('female')]);
    expect(metricsSectionValues(picked.prisma)).toEqual(['female']);

    const all = makeService();
    await all.service.summary(range, admin, []);
    expect(all.prisma.club_members.count.mock.calls[0][0].where).not.toHaveProperty('gender');
    expect(all.prisma.club_subscriptions.findMany.mock.calls[0][0].where).not.toHaveProperty('AND');
    expect(all.prisma.club_attendance.groupBy.mock.calls[0][0].where).not.toHaveProperty('member');
    expect(metricsSectionValues(all.prisma)).toBeNull();
  });

  it("counts spa/InBody/class revenue only for the chosen section's members", async () => {
    const prisma = makePrisma();
    prisma.club_spa_invoices.findMany.mockResolvedValue([
      { status: 'paid', total_amount: 100, member_id: 1 },
      { status: 'paid', total_amount: 50, member_id: 2 },
    ]);
    prisma.club_inbody_invoices.findMany.mockResolvedValue([
      { status: 'paid', total_amount: 30, member_id: null },
      { status: 'paid', total_amount: 20, member_id: 1 },
    ]);
    prisma.club_class_enrollments.findMany.mockResolvedValue([
      { member_id: 2, class: { price: 70 } },
      { member_id: 1, class: { price: 10 } },
    ]);
    prisma.club_members.findMany.mockImplementation(async (args: { where: { id?: unknown; gender?: string } }) =>
      args.where.id ? [{ id: 1 }] : [],
    );
    const { service } = makeService(prisma);

    const result = await service.summary({ ...range, gender: 'female' }, admin, []);

    expect(prisma.club_members.findMany).toHaveBeenCalledWith({
      where: { id: { in: [1, 2] }, gender: 'female' },
      select: { id: true },
    });
    expect(result).toMatchObject({ spaRevenue: 100, inbodyRevenue: 20, classRevenue: 10 });
  });
});

describe('ClubDashboardService treasury — رجالي/حريمي/الكل', () => {
  it("filters the all-time summary to the men's section a men's employee picks", async () => {
    const { service, prisma } = makeService();
    prisma.club_spa_invoices.findMany.mockResolvedValue([{ member_id: 4 }, { member_id: 5 }]);
    prisma.club_members.findMany.mockResolvedValue([{ id: 4 }]);

    await service.treasury({ gender: 'male' }, menEmployee);

    expect(prisma.club_receipt_payments.groupBy.mock.calls[0][0].where.receipt.is.AND).toContainEqual(
      expect.objectContaining({ OR: expect.arrayContaining([{ subscription: { is: subscriptionSection('male') } }]) }),
    );
    expect(prisma.club_subscriptions.groupBy.mock.calls[0][0].where.AND).toEqual([subscriptionSection('male')]);
    expect(prisma.club_locker_subscriptions.groupBy.mock.calls[0][0].where.AND).toEqual([subscriptionSection('male')]);
    expect(prisma.club_spa_invoices.groupBy.mock.calls[0][0].where.member_id).toEqual({ in: [4] });
    expect(prisma.club_inbody_invoices.groupBy.mock.calls[0][0].where.member_id).toEqual({ in: [4] });
  });

  it("does not narrow a men's employee's all-time summary by default", async () => {
    const { service, prisma } = makeService();
    await service.treasury(undefined, menEmployee);
    expect(prisma.club_subscriptions.groupBy.mock.calls[0][0].where).not.toHaveProperty('AND');
    expect(prisma.club_locker_subscriptions.groupBy.mock.calls[0][0].where).not.toHaveProperty('AND');
    expect(prisma.club_spa_invoices.groupBy.mock.calls[0][0].where).not.toHaveProperty('member_id');
  });

  it("lets a men's employee open the women's section", async () => {
    const { service, prisma } = makeService();
    await expect(service.treasury({ gender: 'female' }, menEmployee)).resolves.toBeDefined();
    expect(prisma.club_subscriptions.groupBy.mock.calls[0][0].where.AND).toEqual([subscriptionSection('female')]);
  });

  it("gives a women's employee women's money in the daily detail when picked, and everyone's by default", async () => {
    const spa = [
      { member_id: 7, total_amount: 40, payment_method: 'cash', service: null },
      { member_id: 8, total_amount: 60, payment_method: 'cash', service: null },
    ];
    const members = [
      { id: 7, name: 'A', gender: 'female' },
      { id: 8, name: 'B', gender: 'male' },
    ];
    const { service, prisma } = makeService();
    prisma.club_spa_invoices.findMany.mockResolvedValue(spa);
    prisma.club_members.findMany.mockResolvedValue(members);

    const result = await service.treasury({ date: '2026-11-18', gender: 'female' }, womenEmployee);

    expect(prisma.club_receipts.findMany.mock.calls[0][0].where.AND).toContainEqual(
      expect.objectContaining({ OR: expect.arrayContaining([{ subscription_id: null, member: { is: { gender: 'female' } } }]) }),
    );
    expect(prisma.club_subscriptions.findMany.mock.calls[0][0].where.AND).toEqual([subscriptionSection('female')]);
    expect(result.entries).toEqual([expect.objectContaining({ source: 'spa', amount: 40 })]);
    expect(result.total).toBe(40);

    const all = makeService();
    all.prisma.club_spa_invoices.findMany.mockResolvedValue(spa);
    all.prisma.club_members.findMany.mockResolvedValue(members);
    const everyone = await all.service.treasury({ date: '2026-11-18' }, womenEmployee);
    expect(all.prisma.club_subscriptions.findMany.mock.calls[0][0].where).not.toHaveProperty('AND');
    expect(everyone.total).toBe(100);

    const men = makeService();
    men.prisma.club_spa_invoices.findMany.mockResolvedValue(spa);
    men.prisma.club_members.findMany.mockResolvedValue(members);
    const menResult = await men.service.treasury({ date: '2026-11-18', gender: 'male' }, womenEmployee);
    expect(menResult.entries).toEqual([expect.objectContaining({ source: 'spa', amount: 60 })]);
    expect(menResult.total).toBe(60);
  });

  it('lets an admin pick a section, and is unfiltered with none', async () => {
    const picked = makeService(makePrisma(), true);
    await picked.service.treasury({ date: '2026-11-18', gender: 'female' }, admin);
    expect(picked.prisma.club_subscriptions.findMany.mock.calls[0][0].where.AND).toEqual([subscriptionSection('female')]);

    const all = makeService(makePrisma(), true);
    await all.service.treasury({ date: '2026-11-18' }, admin);
    expect(all.prisma.club_subscriptions.findMany.mock.calls[0][0].where).not.toHaveProperty('AND');
    expect(all.prisma.club_receipts.findMany.mock.calls[0][0].where).not.toHaveProperty('AND');
    expect(all.prisma.club_locker_subscriptions.findMany.mock.calls[0][0].where).not.toHaveProperty('AND');
  });
});
