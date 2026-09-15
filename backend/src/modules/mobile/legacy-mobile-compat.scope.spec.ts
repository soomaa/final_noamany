import { LegacyMobileCompatService } from './legacy-mobile-compat.service';

describe('LegacyMobileCompatService employee directory scope', () => {
  it('limits the employee directory to the authenticated employee branch', async () => {
    const prisma = {
      employees: {
        findUnique: jest.fn().mockResolvedValue({ id: 37, emp_code: 1037, branch_id_fk: 3 }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      users: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new LegacyMobileCompatService(prisma as never, {} as never);

    await service.employees({ sub: 39, emp_code: 37 } as never, { page: 1, per_page: 100 });

    expect(prisma.employees.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: { not: 37 }, employee_type: 1, branch_id_fk: 3 }),
    }));
  });

  it('allows an activity without an attachment and separates my requests from new system requests', async () => {
    const prisma = {
      employees: { findUnique: jest.fn().mockResolvedValue({ id: 37, emp_code: 1037, employee: 'موظف', branch_id_fk: 3 }) },
      hr_ansheta: { create: jest.fn().mockResolvedValue({ id: 73 }), findMany: jest.fn().mockResolvedValue([]) },
      hr_ansheta_files: { createMany: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn(async (work: any) => work({
        hr_ansheta: { create: prisma.hr_ansheta.create },
        hr_ansheta_files: { createMany: prisma.hr_ansheta_files.createMany },
      })),
    };
    const service = new LegacyMobileCompatService(prisma as never, {} as never);
    const user = { sub: 39, emp_code: 37 } as never;

    await expect(service.addActivity(user, { title: 'زيارة عميل', notes: 'تمت الزيارة' })).resolves.toEqual({ main_id: '73' });
    expect(prisma.hr_ansheta_files.createMany).not.toHaveBeenCalled();

    await service.activityRequests(user, { page: 1, per_page: 20 }, 'sent');
    await service.activityRequests(user, { page: 1, per_page: 20 }, 'incoming');
    expect(prisma.hr_ansheta.findMany).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: { emp_id: 37, source: 'mobile', created_by_user_id: 39 },
    }));
    expect(prisma.hr_ansheta.findMany).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: { emp_id: 37, source: 'system' },
    }));
  });

  it('filters the signed-in employee overtime report by date range and search text', async () => {
    const prisma = {
      employees: { findUnique: jest.fn().mockResolvedValue({ id: 37, emp_code: 1037, branch_id_fk: 3 }) },
      tbl_emps_hours_edafi: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new LegacyMobileCompatService(prisma as never, {} as never);

    await service.overtime({ sub: 39, emp_code: 37 } as never, {
      page: 2, perPage: 10, dateFrom: '2026-08-01', dateTo: '2026-08-25', search: '3',
    });

    expect(prisma.tbl_emps_hours_edafi.findMany).toHaveBeenCalledWith({
      where: {
        emp_id_fk: 37,
        edafa_date: { gte: '2026-08-01', lte: '2026-08-25' },
        OR: [
          { edafa_date: { contains: '3' } },
          { date_ar: { contains: '3' } },
          { date_s: { contains: '3' } },
          { emp_name: { contains: '3' } },
          { num_hours: 3 },
        ],
      },
      orderBy: { id: 'desc' },
      skip: 10,
      take: 10,
    });
  });

  it('filters the signed-in employee shift report by date range and search text', async () => {
    const prisma = {
      employees: { findUnique: jest.fn().mockResolvedValue({ id: 37, emp_code: 1037, branch_id_fk: 3 }) },
      tbl_emps_shef_edafi: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new LegacyMobileCompatService(prisma as never, {} as never);

    await service.shiftChanges({ sub: 39, emp_code: 37 } as never, {
      page: 1, perPage: 20, dateFrom: '2026-08-01', dateTo: '2026-08-25', search: '2',
    });

    expect(prisma.tbl_emps_shef_edafi.findMany).toHaveBeenCalledWith({
      where: {
        emp_id_fk: 37,
        sheft_date: { gte: '2026-08-01', lte: '2026-08-25' },
        OR: [
          { sheft_date: { contains: '2' } },
          { date_ar: { contains: '2' } },
          { date_s: { contains: '2' } },
          { emp_name: { contains: '2' } },
          { ttype: 2 },
          { dwam_id_fk: 2 },
        ],
      },
      orderBy: { id: 'desc' },
      skip: 0,
      take: 20,
    });
  });
});
