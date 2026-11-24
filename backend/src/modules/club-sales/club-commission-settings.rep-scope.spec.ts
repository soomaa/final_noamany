import { ForbiddenException } from '@nestjs/common';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { JwtUser } from '../../common/types/jwt-user';
import { ClubCommissionSettingsService } from './club-commission-settings.service';

const branchScope = new BranchScopeService();
const admin = { sub: 1, level: 1, branch: 0 } as JwtUser;
const branchOneManager = { sub: 2, level: 3, branch: 1 } as JwtUser;

const reps = [
  { id: 70, name: 'مندوب فرع 1', empCode: 1, branchId: 1, branchIds: [1] },
  { id: 71, name: 'مندوب مشترك', empCode: 2, branchId: 2, branchIds: [2, 1] },
  { id: 72, name: 'مندوب فرع 2', empCode: 3, branchId: 2, branchIds: [2] },
];

function makeService(current: { primary: number | null; extra: number[] }) {
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    users: { findUnique: jest.fn().mockResolvedValue({ user_id: 1, level: 1, approved: 1 }), findFirst: jest.fn().mockResolvedValue(null) },
    employees: { findUnique: jest.fn().mockResolvedValue({ branch_id_fk: current.primary }) },
    club_sales_rep_branches: { findMany: jest.fn().mockResolvedValue(current.extra.map(branch_id => ({ branch_id }))), deleteMany: jest.fn(), createMany: jest.fn() },
    club_sales_rep_settings: {
      upsert: jest.fn().mockResolvedValue({ id: 5 }),
      findUnique: jest.fn().mockResolvedValue({ id: 5, tiers: [] }),
    },
    club_sales_commission_tiers: { deleteMany: jest.fn(), createMany: jest.fn() },
  };
  const prisma = {
    employees: { findUnique: jest.fn().mockResolvedValue(current.primary == null ? null : { branch_id_fk: current.primary }) },
    club_sales_rep_branches: {
      findMany: jest.fn().mockResolvedValue(current.extra.map((branch_id) => ({ branch_id }))),
    },
    club_sales_rep_settings: { findMany: jest.fn().mockResolvedValue([]) },
    club_sales_defaults: { findUnique: jest.fn().mockResolvedValue(null) },
    tbl_branches: { count: jest.fn().mockImplementation(({ where }) => Promise.resolve(where.branch_id.in.length)) },
    $transaction: jest.fn().mockImplementation((work) => work(tx)),
  };
  const employees = { salesReps: jest.fn().mockResolvedValue(reps) };
  const service = new ClubCommissionSettingsService(prisma as never, employees as never, branchScope);
  return { tx, prisma, service };
}

const baseDto = { monthlyTarget: 1000, commissionMode: 'flat', flatCommissionPercent: 5 };

describe('ClubCommissionSettingsService sales-rep branch scope', () => {
  describe('GET club-sales-settings/sales-reps', () => {
    it('lists only reps sharing a branch with a scoped manager', async () => {
      const { service } = makeService({ primary: null, extra: [] });

      const rows = await service.listSalesRepsWithSettings(branchOneManager);

      expect(rows.map((row) => row.id)).toEqual([70, 71]);
    });

    it('lists every rep for level 1', async () => {
      const { service } = makeService({ primary: null, extra: [] });

      const rows = await service.listSalesRepsWithSettings(admin);

      expect(rows.map((row) => row.id)).toEqual([70, 71, 72]);
    });
  });

  describe('PUT club-sales-settings/sales-reps', () => {
    it('rejects changing the target/commission of a rep from another branch', async () => {
      const { service, tx } = makeService({ primary: 2, extra: [] });

      await expect(
        service.upsertSalesRep({ ...baseDto, employeeId: 72 } as never, branchOneManager),
      ).rejects.toThrow(new ForbiddenException('لا تملك صلاحية الوصول لبيانات هذا الفرع'));
      expect(tx.club_sales_rep_settings.upsert).not.toHaveBeenCalled();
    });

    it('rejects routing an in-scope rep into a branch outside the manager scope', async () => {
      const { service, tx } = makeService({ primary: 1, extra: [] });

      await expect(
        service.upsertSalesRep({ ...baseDto, employeeId: 70, branchIds: [1, 3] } as never, branchOneManager),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(tx.club_sales_rep_branches.createMany).not.toHaveBeenCalled();
    });

    it.each([{ primary: 2, extra: [1] }, { primary: 1, extra: [5] }])('denies shared commission edits when any current branch is foreign: %j', async current => {
      const { service, tx } = makeService(current);
      await expect(service.upsertSalesRep({ ...baseDto, employeeId: 71, branchIds: [1] } as never, branchOneManager)).rejects.toBeInstanceOf(ForbiddenException);
      expect(tx.club_sales_rep_settings.upsert).not.toHaveBeenCalled();
      expect(tx.club_sales_rep_branches.deleteMany).not.toHaveBeenCalled();
    });

    it('lets level 1 configure and re-route any rep', async () => {
      const { service, tx, prisma } = makeService({ primary: 2, extra: [] });

      await service.upsertSalesRep({ ...baseDto, employeeId: 72, branchIds: [2, 3] } as never, admin);

      expect(prisma.employees.findUnique).not.toHaveBeenCalled();
      expect(tx.club_sales_rep_branches.createMany).toHaveBeenCalledWith({
        data: [{ employee_id: 72, branch_id: 2 }, { employee_id: 72, branch_id: 3 }],
        skipDuplicates: true,
      });
    });
  });
});
