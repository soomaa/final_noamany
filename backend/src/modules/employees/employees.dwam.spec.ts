import { EmployeesService } from './employees.service';

describe('EmployeesService multi-shift assignments', () => {
  it('stores the Management option as all without replacing another assignment', async () => {
    const prisma = {
      employees: {
        findUnique: jest.fn().mockResolvedValue({ id: 37, emp_code: 1037, branch_id_fk: 3 }),
      },
      hr_emp_dwam: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({ id: 8, always_id_fk: 1, period_id_fk: 3 }),
        create: jest.fn().mockResolvedValue({ id: 8 }),
        update: jest.fn().mockResolvedValue({ id: 8 }),
      },
      tbl_hdodr_setting: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({ id: 1, title: 'Morning' })
          .mockResolvedValueOnce({ id: 2, title: 'Evening' }),
      },
      tbl_branches: {
        findUnique: jest.fn().mockResolvedValue({ branch_id: 3, branch_name: 'Main branch' }),
      },
      tbl_hdoor_dawms_emps: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest
          .fn()
          .mockResolvedValueOnce({ id: 10 })
          .mockResolvedValueOnce({ id: 11 }),
      },
    };
    const service = new EmployeesService(prisma as never);

    await service.putDwam(37, { shiftId: 1, branchId: 'all' });
    await service.putDwam(37, { shiftId: 2, branchId: '3' });

    expect(prisma.tbl_hdoor_dawms_emps.create).toHaveBeenNthCalledWith(1, {
      data: expect.objectContaining({
        emp_id_fk: 37,
        emp_code_fk: 1037,
        dwam_id_fk: 1,
        branch_id_fk: 'all',
        b_name: 'إدارة',
      }),
    });
    expect(prisma.tbl_hdoor_dawms_emps.create).toHaveBeenNthCalledWith(2, {
      data: expect.objectContaining({
        dwam_id_fk: 2,
        branch_id_fk: '3',
        b_name: 'Main branch',
      }),
    });
    expect(prisma.tbl_hdoor_dawms_emps.create).toHaveBeenCalledTimes(2);
  });
});
