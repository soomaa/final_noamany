import { ClubLeadsService } from './club-leads.service';

/**
 * Deactivating a specialist has two consequences that must both hold: they stop being
 * handed new customers, and the ones they already hold do not sit stranded on someone who
 * has stopped working them.
 */
describe('deactivating a sales specialist', () => {
  const reps = [
    { id: 10, name: 'سارة', branchId: 1, branchIds: [1] },
    { id: 11, name: 'أحمد', branchId: 1, branchIds: [1] },
    { id: 12, name: 'منى', branchId: 2, branchIds: [2] },
  ];

  const build = (overrides: Record<string, unknown> = {}) => {
    const prisma = {
      club_sales_rep_settings: { findMany: jest.fn().mockResolvedValue([]) },
      club_sales_round_robin_state: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn(),
      },
      club_leads: {
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn(),
        update: jest.fn(),
      },
      ...overrides,
    };
    const client = prisma as any;
    client.$executeRaw = jest.fn();
    client.$transaction = jest.fn((work) => work(client));
    client.club_sales_rep_settings.upsert = jest.fn();
    client.club_leads.updateMany.mockResolvedValue({ count: 1 });
    const employees = { salesReps: jest.fn().mockResolvedValue(reps) };
    const service = new ClubLeadsService(
      prisma as never,
      { resolveListFilter: () => null, isBranchAllowed: () => true } as never,
      employees as never,
      {} as never,
    );
    return { service, prisma, employees };
  };

  it('stops handing new customers to a deactivated specialist', async () => {
    const { service, prisma } = build({
      club_sales_rep_settings: { findMany: jest.fn().mockResolvedValue([{ employee_id: 10 }]) },
    });

    const picked = new Set<number>();
    for (let i = 0; i < 6; i += 1) {
      const next = await service.nextRoundRobinRep(1);
      if (next) picked.add(next.id);
    }

    expect(picked.has(10)).toBe(false);
    expect(picked.has(11)).toBe(true);
    prisma.club_sales_round_robin_state.findUnique.mockResolvedValue(null);
  });

  it('moves every open customer to one named colleague', async () => {
    const updateMany = jest.fn();
    const { service } = build({
      club_leads: {
        findMany: jest.fn().mockResolvedValue([
          { id: 1, branch_id: 1 }, { id: 2, branch_id: 1 },
        ]),
        updateMany,
        update: jest.fn(),
      },
    });

    const result = await service.transferLeads(10, { mode: 'manual', targetEmployeeId: 11 }, {} as never);

    expect(result).toMatchObject({ moved: 2, targets: [11] });
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: { assigned_to: 11, assignment_mode: 'manual' },
    }));
  });

  it('only ever moves open customers, never closed history', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const { service } = build({ club_leads: { findMany, updateMany: jest.fn(), update: jest.fn() } });

    await service.transferLeads(10, { mode: 'auto' }, {} as never);

    // Converted and lost leads are the specialist's own record and their commission basis.
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { assigned_to: 10, status: { notIn: ['converted', 'lost'] } },
    }));
  });

  it('spreads customers across the team and never back onto the person being emptied', async () => {
    const update = jest.fn();
    const { service, prisma } = build({
      club_leads: {
        findMany: jest.fn().mockResolvedValue([
          { id: 1, branch_id: 1 }, { id: 2, branch_id: 1 }, { id: 3, branch_id: 1 },
        ]),
        updateMany: jest.fn(),
        update,
      },
    });

    const result = await service.transferLeads(10, { mode: 'auto' }, {} as never);

    expect(result.moved).toBe(3);
    expect(prisma.club_leads.updateMany).toHaveBeenCalledTimes(3);
    expect(result.targets).not.toContain(10);
    // Branch 1 leads go to the branch-1 colleague, not to the branch-2 one.
    for (const call of prisma.club_leads.updateMany.mock.calls) {
      expect(call[0].data.assigned_to).toBe(11);
    }
  });

  it('refuses a transfer to the same person', async () => {
    const { service } = build({
      club_leads: {
        findMany: jest.fn().mockResolvedValue([{ id: 1, branch_id: 1 }]),
        updateMany: jest.fn(), update: jest.fn(),
      },
    });
    await expect(service.transferLeads(10, { mode: 'manual', targetEmployeeId: 10 }, {} as never))
      .rejects.toThrow();
  });

  it('says so rather than silently doing nothing when nobody can receive them', async () => {
    const { service } = build({
      club_sales_rep_settings: {
        findMany: jest.fn().mockResolvedValue([{ employee_id: 11 }, { employee_id: 12 }]),
      },
      club_leads: {
        findMany: jest.fn().mockResolvedValue([{ id: 1, branch_id: 1 }]),
        updateMany: jest.fn(), update: jest.fn(),
      },
    });
    await expect(service.transferLeads(10, { mode: 'auto' }, {} as never)).rejects.toThrow();
  });
});
