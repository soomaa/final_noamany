import { PrismaService } from '../../common/prisma/prisma.service';
import { EmployeesService } from './employees.service';

describe('EmployeesService.update legacy enum resilience', () => {
  it('updates a legacy employee without deserializing invalid enum values', async () => {
    const prisma = {
      employees: {
        findUnique: jest.fn().mockResolvedValue({
          id: 161,
          employee: 'Legacy employee',
          phone: '01000000000',
          branch_id_fk: 1,
        }),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      employees_settings: { findFirst: jest.fn() },
      department_jobs: { findUnique: jest.fn().mockResolvedValue({ id: 7, name: 'موظف' }) },
    };
    const service = new EmployeesService(prisma as unknown as PrismaService);
    jest.spyOn(service as any, 'provisionUser').mockResolvedValue(undefined);
    jest.spyOn(service as any, 'revokeDashboardAccess').mockResolvedValue(undefined);
    jest.spyOn(service as any, 'syncTrainerCommission').mockResolvedValue(undefined);

    await service.update(161, {
      job_title_id_fk: '7',
      emp_name: 'Legacy employee',
      branch_id_fk: '1',
      jwal: '01000000000',
      emp_type: '1',
      edara_id_fk: '1',
      qsm_id_fk: '1',
    });

    expect(prisma.employees.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 161 },
      data: expect.objectContaining({ employee: 'Legacy employee', phone: '01000000000' }),
    }));
    expect(prisma.employees.update).not.toHaveBeenCalled();
  });
});
