import { AttendanceService } from './attendance.service';

describe('AttendanceService staff barcode preview', () => {
  it('previews only scoped staff and treats a completed latest punch as a new entry', async () => {
    const prisma = {
      employees: { findMany: jest.fn().mockResolvedValue([{ id: 4, emp_code: 22, employee: 'أحمد', branch_id_fk: 5, edara_n: 'تشغيل', qsm_n: 'رجالي' }]) },
      tbl_hdoor_emps: { findMany: jest.fn().mockResolvedValue([]) },
      tbl_hdoor_emps_history: { findMany: jest.fn().mockResolvedValue([{ hodoor_id: 1, action_date_s: '2026-09-09', action_time: '05:00 PM', hdoor_ensraf_time: '05:00 PM', ttype: 'ensraf' }]) },
    };
    const service = new AttendanceService(prisma as never);
    await expect(service.barcodePreviewForUser('22', { level: 3, branch: 5, man_women_type: 0 } as never)).resolves.toMatchObject({
      employee: { empCode: 22, name: 'أحمد', branchId: 5 },
      nextAction: 'in',
      recentPunches: [{ id: 1, action: 'خروج' }],
    });
    expect((prisma as any).$transaction).toBeUndefined();
    expect(prisma.employees.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ emp_type: 1 }) }));
  });

  it('detects an authoritative open row from yesterday as an overnight checkout', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const yesterdayDate = new Date(`${today}T12:00:00`);
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterday = yesterdayDate.toISOString().slice(0, 10);
    const prisma = {
      employees: { findMany: jest.fn().mockResolvedValue([{ id: 4, emp_code: 22, employee: 'أحمد', branch_id_fk: 5, edara_n: 'تشغيل', qsm_n: 'رجالي' }]) },
      tbl_hdoor_emps: { findMany: jest.fn().mockResolvedValue([{ hodoor_id: 7, action_date_s: yesterday, hdoor_time: '10:00 PM', ensraf_time: null }]) },
      tbl_hdoor_emps_history: { findMany: jest.fn().mockResolvedValue([{ hodoor_id: 1, action_date_s: yesterday, action_time: '10:00 PM', hdoor_ensraf_time: '10:00 PM', ttype: 'hdoor' }]) },
    };
    const service = new AttendanceService(prisma as never);

    await expect(service.barcodePreviewForUser('22', { level: 3, branch: 5, man_women_type: 0 } as never)).resolves.toMatchObject({
      nextAction: 'out',
      nextActionLabel: 'تأكيد الخروج',
      recentPunches: [{ action: 'دخول' }],
    });
    expect(prisma.tbl_hdoor_emps.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ member_code: 22 }),
    }));
  });

  it('rejects unknown or foreign staff codes before reading punch history', async () => {
    const prisma = {
      employees: { findMany: jest.fn().mockResolvedValue([{ id: 4, emp_code: 22, employee: 'أحمد', branch_id_fk: 5, edara_n: null, qsm_n: null }]) },
      tbl_hdoor_emps_history: { findMany: jest.fn() },
    };
    const service = new AttendanceService(prisma as never);
    await expect(service.barcodePreviewForUser('999', { level: 3, branch: 5, man_women_type: 0 } as never)).rejects.toThrow('خارج نطاق');
    expect(prisma.tbl_hdoor_emps_history.findMany).not.toHaveBeenCalled();
  });

  it('fails closed when a non-admin scanner operator has no audience scope', async () => {
    const prisma = { employees: { findMany: jest.fn() } };
    const service = new AttendanceService(prisma as never);
    await expect(service.barcodePreviewForUser('22', { level: 3, branch: 5, man_women_type: -1 } as never)).rejects.toThrow('نطاق القسم');
    expect(prisma.employees.findMany).not.toHaveBeenCalled();
  });

  it('rejects a preview request that names another branch', async () => {
    const prisma = { employees: { findMany: jest.fn() } };
    const service = new AttendanceService(prisma as never);
    await expect(service.barcodePreviewForUser('22', { level: 3, branch: 5, man_women_type: 0 } as never, '7')).rejects.toThrow('فرع آخر');
    expect(prisma.employees.findMany).not.toHaveBeenCalled();
  });

  it('derives a new-day scan as entry rather than reusing yesterday attendance state', async () => {
    const prisma = {
      employees: { findMany: jest.fn().mockResolvedValue([{ id: 4, emp_code: 22, employee: 'أحمد', branch_id_fk: 5, edara_n: null, qsm_n: null }]) },
      tbl_hdoor_emps: { findMany: jest.fn().mockResolvedValue([]) },
      tbl_hdoor_emps_history: { findMany: jest.fn().mockResolvedValue([{ hodoor_id: 8, action_date_s: '2000-01-01', action_time: '09:00 AM', hdoor_ensraf_time: '09:00 AM', ttype: 'hdoor' }]) },
    };
    const service = new AttendanceService(prisma as never);
    await expect(service.barcodePreviewForUser('22', { level: 3, branch: 5, man_women_type: 0 } as never)).resolves.toMatchObject({ nextAction: 'in' });
  });
});
