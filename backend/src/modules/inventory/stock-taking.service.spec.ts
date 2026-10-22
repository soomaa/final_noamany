import { StockTakingService } from './stock-taking.service';

describe('stock-count numbering', () => {
  it('opens another count when MySQL returns the previous number as bigint', async () => {
    let created: Record<string, unknown> | null = null;
    const prisma: Record<string, unknown> = {
      $queryRaw: jest.fn().mockResolvedValue([{ maxNum: 1n }]),
      $transaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn(prisma)),
      inv_count_sessions: {
        create: jest.fn(async ({ data }) => (created = { id: 2, ...data, status: 'draft', created_at: new Date(), updated_at: new Date() })),
        findUnique: jest.fn(async () => ({ ...created, items: [] })),
      },
      inv_adjustments: { findFirst: jest.fn().mockResolvedValue(null) },
      inv_warehouses: { findMany: jest.fn().mockResolvedValue([]) },
      inv_categories: { findMany: jest.fn().mockResolvedValue([]) },
      users: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const location = { resolveSelection: jest.fn().mockResolvedValue({ branchId: 4, warehouseId: 10 }) };
    const service = new StockTakingService(prisma as never, {} as never, location as never, {} as never);
    const session = await service.createSession({ warehouseId: 10 }, { sub: 1, level: 1, branch: 4 } as never);
    expect(session.sessionNumber).toBe('CNT000002');
    expect(session.warehouseId).toBe(10);
  });
});

describe('stock-count reports for reception', () => {
  const receptionist = { sub: 10, level: 2, branch: 3, job_title: 'موظف استقبال', man_women_type: 1 };
  const listService = () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const none = { findMany: jest.fn().mockResolvedValue([]) };
    const prisma = { inv_count_sessions: { findMany, count: jest.fn().mockResolvedValue(0) }, inv_warehouses: none, inv_categories: none, users: none };
    return { findMany, service: new StockTakingService(prisma as never, {} as never, {} as never, {} as never) };
  };

  it('limits reception employees to today\'s reports', async () => {
    const { findMany, service } = listService();
    await service.listSessions({ page: 1, pageSize: 20, skip: 0, take: 20 } as never, receptionist as never);
    expect(JSON.stringify(findMany.mock.calls[0][0].where)).toContain('created_at');
  });

  it('filters the report by Cairo calendar days, end date inclusive', async () => {
    const { findMany, service } = listService();
    await service.listSessions({ page: 1, pageSize: 20, skip: 0, take: 20, dateFrom: '2026-10-01', dateTo: '2026-10-22' } as never, { ...receptionist, job_title: 'مدير' } as never);
    const and = findMany.mock.calls[0][0].where.AND as Array<{ created_at?: { gte?: Date; lt?: Date } }>;
    expect(and.find((c) => c.created_at?.gte)?.created_at?.gte?.toISOString()).toBe('2026-09-30T21:00:00.000Z');
    expect(and.find((c) => c.created_at?.lt)?.created_at?.lt?.toISOString()).toBe('2026-10-22T21:00:00.000Z');
  });

  it('shows managers every report', async () => {
    const { findMany, service } = listService();
    await service.listSessions({ page: 1, pageSize: 20, skip: 0, take: 20 } as never, { ...receptionist, job_title: 'مشرف استقبال' } as never);
    expect(JSON.stringify(findMany.mock.calls[0][0].where ?? {})).not.toContain('created_at');
  });
});
