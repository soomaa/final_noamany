import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { ClubLockersService } from './club-lockers.service';

describe('ClubLockersService locker subscription category scope', () => {
  it('returns the selected employee and the creator separately in the subscription list', async () => {
    const service = new ClubLockersService(
      {
        club_locker_subscriptions: {
          findMany: jest.fn().mockResolvedValue([{
            id: 12,
            subscription_number: 'LOCK000012',
            main_branch_id: 3,
            sub_branch_id: 3,
            member_id: null,
            customer_name: 'عضو',
            subscription_type_id: 2,
            subscription_start_date: '2026-10-01',
            subscription_end_date: '2026-11-01',
            subscription_value: 500,
            discount_value: 0,
            paid_amount: 500,
            locker_id: 7,
            payment_method: 'cash',
            recommended_employee_id: 21,
            created_by: 9,
            receipt_number: 'R-12',
            locker: { locker_number: 'L07' },
            type: { name: 'شهري' },
          }]),
          count: jest.fn().mockResolvedValue(1),
        },
        users: { findMany: jest.fn().mockResolvedValue([{ user_id: 9, name: 'المُضيف' }]) },
        employees: { findMany: jest.fn().mockResolvedValue([{ id: 21, employee: 'الموظف المختار' }]) },
      } as any,
      {} as any,
      {
        resolveListFilter: jest.fn().mockReturnValue(null),
        resolveMemberGenderRequest: jest.fn().mockReturnValue(null),
      } as any,
      {} as any,
      {} as any,
    );

    const result = await service.listSubscriptions({ page: '1', pageSize: '20' } as any);

    expect(result.data[0]).toMatchObject({
      subscriptionTypeName: 'شهري',
      lockerNumber: 'L07',
      recommendedEmployeeName: 'الموظف المختار',
      bookedByName: 'المُضيف',
      paymentMethod: 'cash',
      receiptNumber: 'R-12',
    });
  });

  it('edits category and employee without changing the existing payment', async () => {
    const existing = {
      id: 12,
      customer_name: 'عضو',
      member_id: null,
      main_branch_id: 3,
      locker_id: 7,
      subscription_start_date: '2020-01-01',
      subscription_end_date: '2020-02-01',
      subscription_value: 500,
      discount_enabled: false,
      discount_value: 0,
      paid_amount: 500,
      status: 'expired',
    };
    const update = jest.fn().mockImplementation(({ data }) => ({ ...existing, ...data }));
    const service = new ClubLockersService(
      {
        club_locker_subscriptions: { findUnique: jest.fn().mockResolvedValue(existing) },
        $transaction: jest.fn().mockImplementation((run) => run({ club_locker_subscriptions: { update } })),
      } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await service.updateSubscription(12, {
      customerName: 'الاسم المعدل',
      gender: 'female',
      recommendedEmployeeId: 21,
    });

    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        customer_name: 'الاسم المعدل',
        gender: 'female',
        recommended_employee_id: 21,
      }),
    }));
    expect(update.mock.calls[0][0].data).not.toHaveProperty('paid_amount');
  });

  describe('رجالي/حريمي/الكل filter', () => {
    const men = { level: 2, branch: 2, man_women_type: 1, member_sections: ['male'] } as any;
    const women = { level: 2, branch: 2, man_women_type: 2, member_sections: ['female'] } as any;
    const admin = { level: 1 } as any;
    const section = (gender: string) => ({ OR: [{ gender }, { gender: null, member: { is: { gender } } }] });

    function setup() {
      const prisma = {
        club_locker_subscriptions: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
        club_lockers: { findMany: jest.fn().mockResolvedValue([]) },
        club_locker_inventory_reports: { findMany: jest.fn().mockResolvedValue([]) },
        employees: { findMany: jest.fn().mockResolvedValue([]) },
      };
      const service = new ClubLockersService(prisma as any, {} as any, new BranchScopeService(), {} as any, {} as any);
      return { prisma, service };
    }
    const listWhere = (prisma: any) => prisma.club_locker_subscriptions.findMany.mock.calls[0][0].where;

    it('men employee: subscription list is not narrowed by default, and women may be picked', async () => {
      const { prisma, service } = setup();
      await service.listSubscriptions({ page: '1', pageSize: '20' } as any, men);
      expect(JSON.stringify(listWhere(prisma) ?? {})).not.toContain('gender');
      prisma.club_locker_subscriptions.findMany.mockClear();
      await service.listSubscriptions({ page: '1', pageSize: '20', gender: 'male' } as any, men);
      expect(listWhere(prisma).AND).toEqual(expect.arrayContaining([section('male')]));
      prisma.club_locker_subscriptions.findMany.mockClear();
      await expect(service.listSubscriptions({ page: '1', pageSize: '20', gender: 'female' } as any, men))
        .resolves.toBeDefined();
      expect(listWhere(prisma).AND).toEqual(expect.arrayContaining([section('female')]));
    });

    it('women employee: gender=female filters female, and men may be picked', async () => {
      const { prisma, service } = setup();
      await service.listSubscriptions({ page: '1', pageSize: '20', gender: 'female' } as any, women);
      expect(listWhere(prisma).AND).toEqual(expect.arrayContaining([section('female')]));
      prisma.club_locker_subscriptions.findMany.mockClear();
      await expect(service.listSubscriptions({ page: '1', pageSize: '20', gender: 'male' } as any, women))
        .resolves.toBeDefined();
      expect(listWhere(prisma).AND).toEqual(expect.arrayContaining([section('male')]));
    });

    it('admin: gender=female filters female, no gender is unfiltered', async () => {
      const { prisma, service } = setup();
      await service.listSubscriptions({ page: '1', pageSize: '20', gender: 'female' } as any, admin);
      expect(listWhere(prisma).AND).toEqual(expect.arrayContaining([section('female')]));
      prisma.club_locker_subscriptions.findMany.mockClear();
      await service.listSubscriptions({ page: '1', pageSize: '20', gender: 'all' } as any, admin);
      expect(JSON.stringify(listWhere(prisma) ?? {})).not.toContain('gender');
    });

    it('statistics follow the picked section, any section, and are unfiltered by default', async () => {
      const { prisma, service } = setup();
      await service.lockerStatistics(men);
      expect(JSON.stringify(prisma.club_locker_subscriptions.findMany.mock.calls[0][0].where)).not.toContain('gender');
      prisma.club_locker_subscriptions.findMany.mockClear();
      await service.lockerStatistics(men, 'male');
      expect(prisma.club_locker_subscriptions.findMany).toHaveBeenCalledWith({ where: expect.objectContaining(section('male')) });
      prisma.club_locker_subscriptions.findMany.mockClear();
      await expect(service.lockerStatistics(men, 'female')).resolves.toBeDefined();
      expect(prisma.club_locker_subscriptions.findMany).toHaveBeenCalledWith({ where: expect.objectContaining(section('female')) });
      prisma.club_locker_subscriptions.findMany.mockClear();
      await service.lockerStatistics(admin, 'female');
      expect(prisma.club_locker_subscriptions.findMany).toHaveBeenCalledWith({ where: section('female') });
      prisma.club_locker_subscriptions.findMany.mockClear();
      await service.lockerStatistics(admin);
      expect(prisma.club_locker_subscriptions.findMany).toHaveBeenCalledWith({ where: {} });
    });

    it('inventory snapshot reads occupants of the picked section, and everyone by default', async () => {
      const { prisma, service } = setup();
      await service.inventorySnapshot(2, women);
      expect(prisma.club_lockers.findMany.mock.calls[0][0].select.subscriptions.where).toBeUndefined();
      prisma.club_lockers.findMany.mockClear();
      await service.inventorySnapshot(2, women, 'female');
      expect(prisma.club_lockers.findMany.mock.calls[0][0].select.subscriptions.where).toEqual(section('female'));
      prisma.club_lockers.findMany.mockClear();
      await expect(service.inventorySnapshot(2, women, 'male')).resolves.toBeDefined();
      expect(prisma.club_lockers.findMany.mock.calls[0][0].select.subscriptions.where).toEqual(section('male'));
      prisma.club_lockers.findMany.mockClear();
      await service.inventorySnapshot(2, admin);
      expect(prisma.club_lockers.findMany.mock.calls[0][0].select.subscriptions.where).toBeUndefined();
    });

    it('inventory reports blank occupants outside a picked section, and show everyone by default', async () => {
      const { prisma, service } = setup();
      prisma.club_locker_inventory_reports.findMany.mockResolvedValue([{
        id: 1, branch_id: 2, employee_id: null,
        items: [{ locker_id: 5, latest_customer_name: 'رجل', latest_customer_phone: '010', previous_customer_name: 'سيدة', previous_customer_phone: '011' }],
      }]);
      prisma.club_locker_subscriptions.findMany.mockResolvedValue([{ locker_id: 5, customer_name: 'رجل' }]);
      const [report] = await service.listInventoryReports(undefined, men, undefined, undefined, 'male');
      expect(prisma.club_locker_subscriptions.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { AND: [{ locker_id: { in: [5] } }, section('male')] },
      }));
      expect(report.items[0]).toMatchObject({ latest_customer_name: 'رجل', latest_customer_phone: '010', previous_customer_name: null, previous_customer_phone: null });
      await expect(service.listInventoryReports(undefined, men, undefined, undefined, 'female')).resolves.toBeDefined();

      prisma.club_locker_subscriptions.findMany.mockClear();
      const [menDefault] = await service.listInventoryReports(undefined, men);
      expect(prisma.club_locker_subscriptions.findMany).not.toHaveBeenCalled();
      expect(menDefault.items[0].previous_customer_name).toBe('سيدة');

      prisma.club_locker_subscriptions.findMany.mockClear();
      const [unfiltered] = await service.listInventoryReports(undefined, admin);
      expect(prisma.club_locker_subscriptions.findMany).not.toHaveBeenCalled();
      expect(unfiltered.items[0].previous_customer_name).toBe('سيدة');
    });
  });
});
