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
        memberGenderFilter: jest.fn().mockReturnValue(null),
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

  it('forces a women-section employee to female locker subscriptions even when requesting men', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const service = new ClubLockersService(
      {
        club_locker_subscriptions: { findMany, count },
      } as any,
      {} as any,
      {
        resolveListFilter: jest.fn().mockReturnValue([3]),
        memberGenderFilter: jest.fn().mockReturnValue('female'),
      } as any,
      {} as any,
      {} as any,
    );

    await service.listSubscriptions(
      { page: '1', pageSize: '20', gender: 'male' } as any,
      { level: 2, man_women_type: 1 } as any,
    );

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        AND: expect.arrayContaining([{ gender: 'female' }]),
      }),
    }));
  });
});
