import { ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { MobileService } from './mobile.service';

describe('MobileService legacy HR contracts', () => {
  const prisma = {
    employees: { findFirst: jest.fn(), findUnique: jest.fn() },
    users: { findFirst: jest.fn() },
    hr_dialy_reports: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
    hr_ta3mem_details: { findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn(), create: jest.fn(), update: jest.fn() },
    hr_ta3mem: { findUnique: jest.fn(), findMany: jest.fn() },
    hr_ta3mem_attaches: { findMany: jest.fn() },
    hr_enzarat: { findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn(), update: jest.fn() },
    hr_enzarat_files: { findMany: jest.fn() },
    hr_all_agzat_orders: { count: jest.fn() },
    hr_all_ozonat_orders: { count: jest.fn() },
    tbl_hdoor_emps: { findMany: jest.fn() },
    hr_solaf: { aggregate: jest.fn() },
  };
  const auth = { login: jest.fn(), authenticateStaff: jest.fn() };
  const service = new MobileService(prisma as never, auth as never);
  const user = { sub: 44, emp_code: 1008, name: 'موظف' } as never;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.employees.findUnique.mockResolvedValue({ id: 8, emp_code: 1008, employee: 'موظف' });
    prisma.users.findFirst.mockResolvedValue({ user_id: 44 });
  });

  it('allows only a staff account linked to an existing employee into the modern mobile API', async () => {
    auth.authenticateStaff.mockResolvedValue({
      accessToken: 'access',
      refreshToken: 'refresh',
      user: { sub: 44, emp_code: 8, name: 'موظف' },
      message: 'تم تسجيل الدخول بنجاح',
    });
    prisma.employees.findUnique.mockResolvedValueOnce({ id: 8 });

    await expect(service.login('01000000000', '102030')).resolves.toEqual(
      expect.objectContaining({ accountType: 'staff', mustChangePassword: false }),
    );
    expect(auth.login).not.toHaveBeenCalled();
  });

  it('rejects a valid staff account that is not linked to an employee', async () => {
    auth.authenticateStaff.mockResolvedValue({
      accessToken: 'access', refreshToken: 'refresh',
      user: { sub: 1, emp_code: null }, message: 'ok',
    });

    await expect(service.login('admin', 'secret')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('tells the employee when the phone number is not registered', async () => {
    prisma.users.findFirst.mockResolvedValue(null);

    await expect(service.login('01000000000', '102030'))
      .rejects.toThrow('رقم الهاتف غير صحيح');
    expect(auth.authenticateStaff).not.toHaveBeenCalled();
  });

  it('tells the employee when the phone number exists but the password is wrong', async () => {
    auth.authenticateStaff.mockRejectedValue(new UnauthorizedException('لا يمكنك الدخول هناك بيان خاطىء'));

    await expect(service.login('01000000000', 'wrong-password'))
      .rejects.toThrow('كلمة المرور غير صحيحة');
  });

  it('reads only safe employee fields when logging in against legacy data', async () => {
    prisma.employees.findFirst.mockResolvedValue({
      id: 8,
      emp_code: 1008,
      card_num: 15,
      employee: 'موظف',
      edara_n: 'الإدارة',
      qsm_n: 'القسم',
      mosma_wazefy_n: 'محاسب',
      phone: '01000000000',
    });
    prisma.users.findFirst.mockResolvedValue({ user_id: 44, username: '01000000000' });
    auth.login.mockResolvedValue({
      accessToken: 'access',
      refreshToken: 'refresh',
      user: { name: 'موظف' },
    });

    await expect(service.legacyLogin('01000000000', '102030')).resolves.toEqual(
      expect.objectContaining({ access_token: 'access', emp_id: '8', phone_number: '01000000000' }),
    );
    expect(prisma.employees.findFirst).toHaveBeenCalledWith({
      where: { OR: [{ phone: '01000000000' }, { emp_code: 1000000000 }] },
      select: {
        id: true,
        emp_code: true,
        card_num: true,
        employee: true,
        edara_n: true,
        qsm_n: true,
        mosma_wazefy_n: true,
        phone: true,
      },
    });
  });

  it('stores mobile tasks in the legacy hr_dialy_reports table for the JWT employee', async () => {
    prisma.hr_dialy_reports.create.mockResolvedValue({ id: 71 });

    await expect(
      service.createDailyTask(user, { title: 'زيارة', notes: 'متابعة العميل', status: 'done' }),
    ).resolves.toEqual({ id: 71 });
    expect(prisma.hr_dialy_reports.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ emp_id_fk: 8, title: 'زيارة', status: 'done' }),
    });
  });

  it('does not allow an employee to delete another employee task', async () => {
    prisma.hr_dialy_reports.findUnique.mockResolvedValue({ id: 9, emp_id_fk: 99 });
    await expect(service.deleteDailyTask(user, 9)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.hr_dialy_reports.delete).not.toHaveBeenCalled();
  });

  it('does not expose a non-general circular that was not targeted to the employee', async () => {
    prisma.hr_ta3mem_details.findFirst.mockResolvedValue(null);
    prisma.hr_ta3mem.findUnique.mockResolvedValue({ id: 5, send_all_t3mem: 0 });
    await expect(service.circular(user, 5)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('opens a general circular and creates the employee read record on first open', async () => {
    prisma.hr_ta3mem_details.findFirst.mockResolvedValue(null);
    prisma.hr_ta3mem.findUnique.mockResolvedValue({
      id: 5, ta3mem_title: 'تعميم عام', subject: 'التفاصيل', ta3mem_date: '2026-08-20',
      img: null, send_all_t3mem: 1,
    });
    prisma.hr_ta3mem_details.create.mockResolvedValue({
      id: 55, ta3mem_id_fk: 5, emp_id: 8, emp_code: 1008, emp_name: 'موظف', seen: 0,
      seen_date: null, seen_time: null,
    });
    prisma.hr_ta3mem_attaches.findMany.mockResolvedValue([]);

    await expect(service.circular(user, 5)).resolves.toEqual(expect.objectContaining({
      id: 5, title: 'تعميم عام', detail_id: '55', seen: false,
    }));
    expect(prisma.hr_ta3mem_details.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ ta3mem_id_fk: 5, emp_id: 8, emp_code: 1008, seen: 0 }),
    });
  });

  it('opens a circular targeted to the employee even when it is not sent to everyone', async () => {
    prisma.hr_ta3mem_details.findFirst.mockResolvedValue({
      id: 91, ta3mem_id_fk: 7, emp_id: 8, emp_code: 1008, emp_name: 'موظف', seen: 0,
    });
    prisma.hr_ta3mem.findUnique.mockResolvedValue({
      id: 7, ta3mem_title: 'تعميم موجه', subject: 'التفاصيل', ta3mem_date: '2026-08-15',
      img: null, send_all_t3mem: 0,
    });
    prisma.hr_ta3mem_attaches.findMany.mockResolvedValue([]);

    await expect(service.circular(user, 7)).resolves.toEqual(expect.objectContaining({
      id: 7,
      title: 'تعميم موجه',
      emp_id: '8',
    }));
  });

  it('returns general circulars without requiring a pre-created employee detail record', async () => {
    prisma.hr_ta3mem.findMany
      .mockResolvedValueOnce([{ id: 5, ta3mem_title: 'سياسة جديدة', subject: '<p>التفاصيل</p>', ta3mem_date: '2026-08-12', img: 'circular/a.pdf', send_all_t3mem: 1 }])
      .mockResolvedValueOnce([]);
    prisma.hr_ta3mem_details.findMany.mockResolvedValue([]);

    const result = await service.circulars(user, { page: 1, perPage: 20 });

    expect(result.data[0]).toEqual(expect.objectContaining({
      id: 5,
      title: 'سياسة جديدة',
      ta3mem_id_fk: '5',
      ta3mem_title: 'سياسة جديدة',
      ta3mem_img: 'circular/a.pdf',
      seen_value: '0',
    }));
    expect(prisma.hr_ta3mem.findMany).toHaveBeenNthCalledWith(1, {
      where: { send_all_t3mem: 1 },
      orderBy: { id: 'desc' },
    });
  });

  it('returns warning aliases and attachments while enforcing employee ownership', async () => {
    prisma.hr_enzarat.findFirst.mockResolvedValue({
      id: 12, emp_name: 'موظف', emp_name_id: 8, emp_edara: 'الإدارة', emp_edara_id: 2,
      emp_qesm: 'القسم', emp_qesm_id: 3, enzar_type: 'تأخير', enzar_type_id: 7,
      details: 'تفاصيل', enzar_date_ar: '2026-08-12', enzar_time: '10:30 AM', hr_notes: null, seen: 0,
    });
    prisma.hr_enzarat_files.findMany.mockResolvedValue([{ id: 2, title: 'مستند', file: 'warnings/a.pdf' }]);

    const result = await service.warning(user, 12);

    expect(result).toEqual(expect.objectContaining({
      id: 12,
      enzar_id_fk: '12',
      enzar_type: 'تأخير',
      enzar_date_ar: '2026-08-12',
      attachments: [{ id: 2, title: 'مستند', file: 'warnings/a.pdf' }],
    }));
    expect(prisma.hr_enzarat.findFirst).toHaveBeenCalledWith({ where: { id: 12, emp_name_id: 8 } });
  });

  it('returns the authenticated employee monthly HR statistics only', async () => {
    prisma.hr_all_agzat_orders.count.mockResolvedValue(2);
    prisma.hr_all_ozonat_orders.count.mockResolvedValue(3);
    prisma.tbl_hdoor_emps.findMany.mockResolvedValue([
      { late_min: 12, second_late_min: 3 },
      { late_min: 0, second_late_min: null },
      { late_min: 5, second_late_min: 0 },
    ]);
    prisma.hr_solaf.aggregate.mockResolvedValue({ _sum: { qemt_solaf: 1500 } });
    prisma.hr_enzarat.count.mockResolvedValue(4);

    await expect(service.monthlyStatistics(user, { month: 8, year: 2026 })).resolves.toEqual({
      month: 8,
      year: 2026,
      leavesCount: 2,
      permissionsCount: 3,
      lateCount: 2,
      lateMinutes: 20,
      loansTotal: 1500,
      warningsCount: 4,
    });
    expect(prisma.tbl_hdoor_emps.findMany).toHaveBeenCalledWith({
      where: { member_code: 1008, for_month: 8, for_year: 2026 },
      select: { late_min: true, second_late_min: true },
    });
  });
});
