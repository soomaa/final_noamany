import { EmployeesService } from './employees.service';

describe('EmployeesService read resilience', () => {
  it('uses a small stable projection for employee sub-page identity', async () => {
    const prisma = {
      employees: {
        findUnique: jest.fn().mockResolvedValue({
          id: 161,
          emp_code: 1042,
          employee: 'Employee',
          branch_id_fk: 2,
        }),
      },
    };
    const service = new EmployeesService(prisma as never);

    await expect(service.identity(161)).resolves.toEqual({
      id: 161,
      emp_code: 1042,
      employee: 'Employee',
      branch_id_fk: 2,
    });
    expect(prisma.employees.findUnique).toHaveBeenCalledWith({
      where: { id: 161 },
      select: { id: true, emp_code: true, employee: true, branch_id_fk: true },
    });
  });

  it('still returns the edit form when optional trainer compensation cannot load', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 161, employee: 'Employee', emp_code: 1042 }]),
      users: { findFirst: jest.fn().mockResolvedValue(null) },
      club_trainers: { findUnique: jest.fn().mockRejectedValue(new Error('legacy schema')) },
    };
    const service = new EmployeesService(prisma as never);

    await expect(service.findForForm(161)).resolves.toEqual(
      expect.objectContaining({
        id: 161,
        emp_name: 'Employee',
        emp_code: '1042',
        addToSystem: 'false',
        class_commission_percentage: '0',
        monthly_target: '0',
      }),
    );
  });

  it('loads the edit form from a legacy row even when platform-only columns are absent', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([{
        id: 57,
        employee: 'Imported employee',
        emp_code: 2057,
        phone: '01000000000',
        branch_id_fk: 2,
      }]),
      users: { findFirst: jest.fn().mockResolvedValue(null) },
      tbl_branches: { findUnique: jest.fn().mockResolvedValue({ branch_name: 'Imported branch' }) },
      club_trainers: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const service = new EmployeesService(prisma as never);

    await expect(service.findForForm(57)).resolves.toEqual(expect.objectContaining({
      id: 57,
      emp_name: 'Imported employee',
      emp_code: '2057',
      jwal: '01000000000',
      branch_id_fk: '2',
    }));
  });
});
