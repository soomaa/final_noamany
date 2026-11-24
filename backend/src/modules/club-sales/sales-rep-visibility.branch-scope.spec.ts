import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { JwtUser } from '../../common/types/jwt-user';
import { ClubCommissionSettingsService } from './club-commission-settings.service';
import { ClubSalesDashboardService } from './club-sales-dashboard.service';
import { ClubSalesReportsService } from './club-sales-reports.service';

const branchScope = new BranchScopeService();
const admin = { sub: 1, level: 1, branch: 0, emp_code: null } as JwtUser;
const branchOneManager = { sub: 2, level: 3, branch: 1, emp_code: null } as JwtUser;

const reps = [
  { id: 70, name: 'مندوب فرع 1', empCode: 1, branchId: 1, branchIds: [1] },
  { id: 72, name: 'مندوب فرع 2', empCode: 3, branchId: 2, branchIds: [2] },
  // Moved to branch 2, but still has a sale booked in branch 1 this month.
  { id: 73, name: 'مندوب منقول', empCode: 4, branchId: 2, branchIds: [2] },
];
const settings = [70, 72, 73].map((employee_id) => ({
  employee_id,
  monthly_target: 1000,
  commission_mode: 'flat',
  flat_commission_percent: 10,
  use_default_settings: false,
  is_active: true,
  tiers: [],
}));
const employees = { salesReps: jest.fn().mockResolvedValue(reps), isSalesEmployee: jest.fn().mockResolvedValue(false) };

describe('sales team reports hide reps of other branches', () => {
  describe('club-sales-dashboard overview', () => {
    const makeService = () => {
      const prisma = {
        club_sales_rep_settings: { findMany: jest.fn().mockResolvedValue(settings) },
        club_sales_defaults: { findUnique: jest.fn().mockResolvedValue(null) },
        club_leads: {
          findMany: jest.fn().mockResolvedValue([
            { id: 1, assigned_to: 70, status: 'new', last_contacted_at: null, created_at: new Date(), follow_ups: [] },
          ]),
          count: jest.fn().mockResolvedValue(0),
        },
        club_subscriptions: {
          findMany: jest.fn().mockResolvedValue([
            { id: 1, sales_id: 70, paid_amount: 300 },
            { id: 2, sales_id: 73, paid_amount: 200 },
          ]),
        },
      };
      return new ClubSalesDashboardService(prisma as never, branchScope, employees as never, {} as never);
    };
    const query = { range: 'custom' as const, dateFrom: '2026-09-01', dateTo: '2026-09-30' };

    it('keeps in-branch reps and reps with sales in the branch; team target sums only those', async () => {
      const result = await makeService().overview(query, branchOneManager);

      expect(result.table.map((row) => row.salesRepId)).toEqual([70, 73]);
      expect(result.kpis.teamTarget).toBe(
        result.table.reduce((sum, row) => sum + row.financialTarget, 0),
      );
      expect(result.kpis.teamTarget).toBe(2000);
    });

    it('is unchanged for level 1', async () => {
      const result = await makeService().overview(query, admin);

      expect(result.table.map((row) => row.salesRepId)).toEqual([70, 72, 73]);
      expect(result.kpis.teamTarget).toBe(3000);
    });
  });

  describe('club-sales-reports sales-reps (also feeds staff performance and payroll)', () => {
    const makeService = () => {
      const receipt = (id: number, salesId: number) => ({
        id,
        subscription_id: id,
        receipt_date: '2026-09-05',
        amount: 500,
        branch_id: 1,
        subscription: { id, sales_id: salesId },
      });
      const db = {
        club_sales_rep_settings: { findMany: jest.fn().mockResolvedValue(settings) },
        club_sales_defaults: { findUnique: jest.fn().mockResolvedValue(null) },
        club_receipts: { findMany: jest.fn().mockResolvedValue([receipt(1, 70), receipt(2, 73)]) },
        club_subscription_refunds: { findMany: jest.fn().mockResolvedValue([]) },
        club_sales_commission_entries: { findMany: jest.fn().mockResolvedValue([]) },
        fin_payroll_items: { findMany: jest.fn().mockResolvedValue([]) },
      };
      const commissions = new ClubCommissionSettingsService({} as never, {} as never);
      return new ClubSalesReportsService(db as never, branchScope, employees as never, commissions, {} as never);
    };
    const query = { dateFrom: '2026-09-01', dateTo: '2026-09-30' };

    it('drops a foreign rep with no activity but keeps the rep whose commission is earned in the branch', async () => {
      const report = await makeService().salesRepsReport(query, branchOneManager);

      expect(report.rows.map((row) => row.salesRepId)).toEqual([70, 73]);
      expect(report.rows.find((row) => row.salesRepId === 73)).toMatchObject({ revenue: 500, commissionDue: 50 });
    });

    it('lists every rep for level 1, even with a branch filter', async () => {
      const service = makeService();

      expect((await service.salesRepsReport(query, admin)).rows.map((row) => row.salesRepId)).toEqual([70, 72, 73]);
      expect(
        (await service.salesRepsReport({ ...query, branchId: 1 }, admin)).rows.map((row) => row.salesRepId),
      ).toEqual([70, 72, 73]);
    });
  });
});
