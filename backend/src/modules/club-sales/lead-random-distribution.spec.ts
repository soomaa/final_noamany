import { ClubLeadsService } from './club-leads.service';

/**
 * The potential-members screen's "random distribution" button: every open lead with no owner
 * goes to a randomly drawn active rep who covers the lead's branch.
 */
describe('random distribution of unassigned leads', () => {
  const reps = [
    { id: 10, name: 'سارة', branchId: 1, branchIds: [1] },
    { id: 11, name: 'أحمد', branchId: 1, branchIds: [1] },
    { id: 12, name: 'منى', branchId: 2, branchIds: [2] },
  ];
  const manager = { sub: 1, emp_code: 3 } as never;

  const build = (leads: Array<{ id: number; branch_id: number | null }>, deactivated: number[] = []) => {
    const prisma = {
      club_sales_rep_settings: {
        findMany: jest.fn().mockResolvedValue(deactivated.map((employee_id) => ({ employee_id, is_active: false }))),
        findUnique: jest.fn().mockResolvedValue(null),
      },
      club_sales_round_robin_state: { findUnique: jest.fn().mockResolvedValue(null), upsert: jest.fn() },
      club_leads: {
        findMany: jest.fn().mockResolvedValue(leads),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const client = prisma as any;
    client.$executeRaw = jest.fn();
    client.$transaction = jest.fn((work) => work(client));
    const service = new ClubLeadsService(
      prisma as never,
      { resolveListFilter: () => null, isBranchAllowed: () => true } as never,
      { salesReps: jest.fn().mockResolvedValue(reps) } as never,
      {} as never,
    );
    return { service, prisma };
  };

  it('only ever draws a rep who covers the lead\'s branch', async () => {
    const { service, prisma } = build([{ id: 1, branch_id: 2 }, { id: 2, branch_id: 2 }]);

    // Whatever index the draw lands on, the branch-2 pool is only منى.
    await service.distributeUnassigned(manager, undefined, 'random', () => 0);

    const assignees = prisma.club_leads.updateMany.mock.calls.map(([args]: any[]) => args.data.assigned_to);
    expect(assignees).toEqual([12, 12]);
  });

  it('uses the draw to pick among eligible reps', async () => {
    const { service, prisma } = build([{ id: 1, branch_id: 1 }, { id: 2, branch_id: 1 }]);
    const draws = [1, 0];

    const result = await service.distributeUnassigned(manager, undefined, 'random', () => draws.shift()!);

    const assignees = prisma.club_leads.updateMany.mock.calls.map(([args]: any[]) => args.data.assigned_to);
    expect(assignees).toEqual([11, 10]);
    expect(result.distributed).toBe(2);
    expect(result.byRep.map((r) => r.id).sort()).toEqual([10, 11]);
  });

  it('never draws a deactivated rep', async () => {
    const { service, prisma } = build([{ id: 1, branch_id: 1 }], [10]);

    await service.distributeUnassigned(manager, undefined, 'random', () => 0);

    expect(prisma.club_leads.updateMany.mock.calls[0][0].data.assigned_to).toBe(11);
  });

  it('stamps the handover so the rep sees the lead flagged as new', async () => {
    const { service, prisma } = build([{ id: 1, branch_id: 1 }]);

    await service.distributeUnassigned(manager, undefined, 'random', () => 0);

    const { where, data } = prisma.club_leads.updateMany.mock.calls[0][0];
    expect(where).toEqual({ id: 1, assigned_to: null });
    expect(data).toMatchObject({ assignment_mode: 'automatic', assigned_by: 3, assignment_seen_at: null });
    expect(data.assigned_at).toBeInstanceOf(Date);
  });

  it('only picks up open, undeleted leads with no owner', async () => {
    const { service, prisma } = build([]);

    await service.distributeUnassigned(manager, undefined, 'random');

    expect(prisma.club_leads.findMany.mock.calls[0][0].where.AND).toContainEqual({
      assigned_to: null,
      is_deleted: false,
      status: { notIn: ['converted', 'lost'] },
    });
  });

  it('does not count a lead someone else claimed first', async () => {
    const { service, prisma } = build([{ id: 1, branch_id: 1 }, { id: 2, branch_id: 1 }]);
    prisma.club_leads.updateMany.mockResolvedValueOnce({ count: 0 });

    const result = await service.distributeUnassigned(manager, undefined, 'random', () => 0);

    expect(result).toMatchObject({ distributed: 1, skipped: 1 });
  });
});
