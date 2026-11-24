import { ClubCommissionSettingsService } from './club-commission-settings.service';

describe('ClubCommissionSettingsService sales branches', () => {
  it('keeps the primary branch and replaces the representative additional branch assignments', async () => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      users: { findUnique: jest.fn().mockResolvedValue({ user_id: 1, level: 1, approved: 1 }), findFirst: jest.fn().mockResolvedValue(null) },
      employees: { findUnique: jest.fn().mockResolvedValue({ branch_id_fk: 1 }) },
      club_sales_rep_settings: {
        upsert: jest.fn().mockResolvedValue({ id: 5 }),
        findUnique: jest.fn().mockResolvedValue({ id: 5, employee_id: 77, tiers: [] }),
      },
      club_sales_commission_tiers: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        createMany: jest.fn(),
      },
      club_sales_rep_branches: {
        findMany: jest.fn().mockResolvedValue([]),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        createMany: jest.fn().mockResolvedValue({ count: 3 }),
      },
    };
    const prisma = {
      tbl_branches: { count: jest.fn().mockResolvedValue(3) },
      $transaction: jest.fn().mockImplementation((work) => work(tx)),
    };
    const employees = {
      salesReps: jest.fn().mockResolvedValue([
        { id: 77, name: 'سارة', branchId: 1, branchIds: [1] },
      ]),
    };
    const service = new ClubCommissionSettingsService(prisma as never, employees as never);

    await service.upsertSalesRep({
      employeeId: 77,
      monthlyTarget: 100,
      commissionMode: 'flat',
      flatCommissionPercent: 5,
      branchIds: [2, 3],
    } as never, { sub: 1, level: 1 } as never);

    expect(tx.club_sales_rep_branches.deleteMany).toHaveBeenCalledWith({ where: { employee_id: 77 } });
    expect(tx.club_sales_rep_branches.createMany).toHaveBeenCalledWith({
      data: [
        { employee_id: 77, branch_id: 1 },
        { employee_id: 77, branch_id: 2 },
        { employee_id: 77, branch_id: 3 },
      ],
      skipDuplicates: true,
    });
  });
});
