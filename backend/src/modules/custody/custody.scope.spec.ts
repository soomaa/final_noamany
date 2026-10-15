import { CustodyService } from './custody.service';

describe('CustodyService data scope', () => {
  it('filters custody records by scoped employee ids', async () => {
    const prisma = { emp_custody: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) } };
    const scope = { employeeIdentities: jest.fn().mockResolvedValue({ ids: [17], codes: [4401] }) };
    const service = new CustodyService(prisma as never, scope as never);
    await service.list({ page: 1, pageSize: 25, skip: 0, take: 25 } as never, { sub: 7 } as never);
    expect(prisma.emp_custody.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { AND: [{ emp_code: { in: [17] } }] },
    }));
  });
});
