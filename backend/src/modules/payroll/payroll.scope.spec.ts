import { PayrollService } from './payroll.service';

describe('PayrollService data scope', () => {
  it('filters payroll lines to scoped employee ids', async () => {
    const prisma = {
      hr_mosayer: { findUnique: jest.fn().mockResolvedValue({ id: 1, mosayer_rkm: 10 }) },
      hr_mosayer_details: {
        findMany: jest.fn()
          .mockResolvedValueOnce([{ mosayer_rkm_fk: 10 }])
          .mockResolvedValueOnce([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    const scope = { employeeIdentities: jest.fn().mockResolvedValue({ ids: [17], codes: [4401] }) };
    const service = new PayrollService(prisma as never, {} as never, {} as never, scope as never);
    await service.listRunLines(1, { page: 1, pageSize: 25, skip: 0, take: 25 } as never, { sub: 7 } as never);
    expect(prisma.hr_mosayer_details.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { mosayer_rkm_fk: 10, emp_id: { in: [17] } },
    }));
  });
});
