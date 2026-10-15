import { MissionsService } from './missions.service';

describe('MissionsService data scope', () => {
  it('filters missions by scoped employee ids', async () => {
    const prisma = { hr_mandate_orders: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) } };
    const scope = { employeeIdentities: jest.fn().mockResolvedValue({ ids: [17], codes: [4401] }) };
    const service = new MissionsService(prisma as never, scope as never);
    await service.list({ page: 1, pageSize: 25, skip: 0, take: 25 } as never, { sub: 7 } as never);
    expect(prisma.hr_mandate_orders.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { AND: [{ emp_id_fk: { in: [17] } }] },
    }));
  });
});
