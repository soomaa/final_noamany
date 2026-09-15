import { LeavesService } from './leaves.service';

describe('LeavesService leave list management fields', () => {
  const prisma = {
    hr_all_agzat_orders: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    employees: { findMany: jest.fn() },
    holiday_setting: { findMany: jest.fn() },
  };
  const service = new LeavesService(prisma as never);

  beforeEach(() => jest.clearAllMocks());

  it('exposes the request number, submission date, current recipient, and owner management access', async () => {
    prisma.hr_all_agzat_orders.findMany.mockResolvedValue([
      {
        id: 44,
        agaza_rkm: 1207,
        agaza_date: '2026-08-24',
        mobashret_amal_date_m: '2026-08-28',
        address_since_agaza: 'القاهرة',
        emp_id_fk: 6,
        no3_agaza: 2,
        current_to_user_name: 'مدير الموارد البشرية',
        current_to_user_id: 9,
        publisher: 17,
        suspend: 0,
        actions_sends: 'send_to_direct_manager',
      },
    ]);
    prisma.hr_all_agzat_orders.count.mockResolvedValue(1);
    prisma.employees.findMany.mockResolvedValue([{ id: 6, employee: 'علي يونس' }]);
    prisma.holiday_setting.findMany.mockResolvedValue([{ id: 2, name: 'سنوية' }]);

    const result = await service.list(
      { page: 1, pageSize: 20, skip: 0, take: 20, order: 'desc' },
      17,
    );

    expect(result.data[0]).toMatchObject({
      requestNumber: 1207,
      submittedAt: '2026-08-24',
      currentTo: 'مدير الموارد البشرية',
      canManage: true,
      returnToWorkDate: '2026-08-28',
      addressSinceAgaza: 'القاهرة',
    });
  });
});
