import { One80GymIncentiveAdapter } from './one80-gym-incentive.adapter';

describe('One80GymIncentiveAdapter', () => {
  it('uses employee primary id for attribution and excludes receipt commissions owned by an active trainer', async () => {
    const receiptsAggregate = jest.fn();
    const usersFindMany = jest.fn().mockResolvedValue([]);
    const prisma = {
      users: { findMany: usersFindMany },
      club_trainers: { findFirst: jest.fn().mockResolvedValue({ id: 9 }) },
      tbl_gym_setting: {
        findMany: jest.fn().mockResolvedValue([
          { ttype: 'target', for_user: 10 },
          { ttype: 'proten', for_user: 5 },
          { ttype: 'classes', for_user: 20 },
        ]),
      },
      club_receipts: { aggregate: receiptsAggregate },
      club_locker_subscriptions: { aggregate: jest.fn().mockResolvedValue({ _sum: { paid_amount: 200 } }) },
      sales_quick_sales: { aggregate: jest.fn().mockResolvedValue({ _sum: { collected_amount: 100 } }) },
    };
    const adapter = new One80GymIncentiveAdapter(prisma as never);
    await expect(adapter.calculate({ employeeId: 44, employeeCode: 9001, fromDate: '2026-07-26', toDate: '2026-08-25' })).resolves.toBe(25);
    expect(usersFindMany).toHaveBeenCalledWith({ where: { emp_code: 44 }, select: { user_id: true } });
    expect(receiptsAggregate).not.toHaveBeenCalled();
  });
});
