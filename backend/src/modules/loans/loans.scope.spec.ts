import { LoansService } from './loans.service';

describe('LoansService data scope', () => {
  it('intersects list queries with scoped employee ids and codes', async () => {
    const prisma = {
      hr_solaf: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
    };
    const scope = { employeeIdentities: jest.fn().mockResolvedValue({ ids: [17], codes: [4401] }) };
    const service = new LoansService(prisma as never, scope as never, {} as never);
    const user = { sub: 7 } as never;

    await service.list({ page: 1, pageSize: 25, skip: 0, take: 25 } as never, user);

    expect(prisma.hr_solaf.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { AND: [{ OR: [{ emp_id_fk: { in: [17] } }, { emp_code_fk: { in: [4401] } }] }] },
    }));
  });
});
