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

describe('EmployeesService status and delete with legacy enum values', () => {
  function service() {
    const prisma = {
      employees: {
        findUnique: jest.fn().mockResolvedValue({ id: 97 }),
        update: jest.fn().mockRejectedValue(new Error("Value '' not found in enum 'employees_person_img'")),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    return { prisma, svc: new EmployeesService(prisma as unknown as PrismaService) };
  }

  it('switches an employee to inactive without reading the row back', async () => {
    const { prisma, svc } = service();
    await expect(svc.setStatus(97, 2)).resolves.toEqual({ id: 97, employee_type: 2 });
    expect(prisma.employees.updateMany).toHaveBeenCalledWith({ where: { id: 97 }, data: { employee_type: 2 } });
    expect(prisma.employees.update).not.toHaveBeenCalled();
  });

  it('soft-deletes an employee without reading the row back', async () => {
    const { prisma, svc } = service();
    await expect(svc.remove(97)).resolves.toEqual({ id: 97 });
    expect(prisma.employees.updateMany).toHaveBeenCalledWith({ where: { id: 97 }, data: { leave_emp: 1 } });
    expect(prisma.employees.update).not.toHaveBeenCalled();
  });

  it('hides a deleted captain from the coach lists (client, 23 Nov)', async () => {
    const { prisma, svc } = service();
    const p = prisma as unknown as Record<string, Record<string, jest.Mock>>;
    p.employees.findUnique = jest.fn().mockResolvedValue({ id: 97, employee: 'كابتن', phone: null, email: null, leave_emp: 1, mosma_wazefy_code: 48 });
    p.department_jobs = { findUnique: jest.fn().mockResolvedValue({ is_trainer: true, name: 'كابتن' }) };
    p.club_trainers = { findUnique: jest.fn().mockResolvedValue({ id: 500, is_active: true }), update: jest.fn().mockResolvedValue({}) };
    await expect(svc.remove(97)).resolves.toEqual({ id: 97 });
    expect(p.club_trainers.update).toHaveBeenCalledWith({ where: { id: 500 }, data: { is_active: false } });
  });
});
