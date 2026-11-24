import { ClubSalesReportsService } from './club-sales-reports.service';
import { ClubCommissionSettingsService } from './club-commission-settings.service';

function fixture() {
  const subscription = { id: 1, sales_id: 4, receipts: [{ id: 1, amount: 500, receipt_date: '2026-09-01' }] };
  const db = {
    club_sales_defaults: { findUnique: jest.fn().mockResolvedValue(null) },
    club_sales_rep_settings: { findMany: jest.fn().mockResolvedValue([{ employee_id: 4, monthly_target: 1000, commission_mode: 'flat', flat_commission_percent: 10, tiers: [] }]) },
    club_target_settlements: { findMany: jest.fn().mockResolvedValue([]) },
    club_subscriptions: { findMany: jest.fn().mockResolvedValue([]) },
    club_receipts: { findMany: jest.fn().mockResolvedValue([{ id: 1, subscription_id: 1, receipt_date: '2026-09-01', amount: 500, subscription }]) },
    club_subscription_refunds: { findMany: jest.fn().mockResolvedValue([]) },
    club_sales_commission_entries: { findMany: jest.fn().mockResolvedValue([]) },
    fin_payroll_items: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const service = new ClubSalesReportsService(db as never, { resolveListFilter: () => [1] } as never, { salesReps: async () => [{ id: 4, name: 'Sales' }] } as never, new ClubCommissionSettingsService({} as never, {} as never), {} as never);
  return { db, service, subscription };
}
const query = { dateFrom: '2026-09-01', dateTo: '2026-09-30' };
describe('sales cash commissions', () => {
  it('keeps actual sales visible after payroll settles their commission', async () => {
    const { service, db } = fixture();
    db.club_sales_commission_entries.findMany.mockResolvedValue([{ source_kind: 'receipt', source_id: 1, employee_id: 4, commission_amount: 50 }] as never);
    expect((await service.salesRepsReport(query, {} as never)).rows[0]).toMatchObject({ revenue: 0, commissionDue: 0, periodRevenue: 500, periodAchievementPct: 50 });
  });
  it('applies general defaults to a new rep through payroll reports', async () => {
    const { service, db } = fixture();
    db.club_sales_rep_settings.findMany.mockResolvedValue([]);
    db.club_sales_defaults.findUnique.mockResolvedValue({settings: { monthly_target: 2000, flat_commission_percent: 6, commission_mode: 'flat' }} as never);
    expect((await service.salesRepsReport(query, {} as never)).rows[0]).toMatchObject({ target: 2000, commissionDue: 30 });
  });
  it('includes an installment in its receipt period even for an older subscription', async () => {
    const { service } = fixture();
    expect((await service.salesRepsReport(query, {} as never)).rows[0]).toMatchObject({ revenue: 500, commissionDue: 50 });
  });
  it('subtracts a completed refund without erasing the negative commission', async () => {
    const { service, db, subscription } = fixture();
    db.club_receipts.findMany.mockResolvedValue([]);
    db.club_subscription_refunds.findMany.mockResolvedValue([{ id: 10, refund_amount: 500, subscription_id: 1, subscription, refund_date: '2026-09-02', completed_at: new Date('2026-09-02') }] as never);
    db.club_sales_commission_entries.findMany.mockResolvedValue([{ source_kind: 'receipt', source_id: 1, employee_id: 4, subscription_id: 1, base_amount: 500, commission_amount: 100, commission_percent: 20 }] as never);
    expect((await service.salesRepsReport(query, {} as never)).rows[0]).toMatchObject({ revenue: -500, commissionDue: -100 });
  });
  it('never pays a receipt again after its subscription is reassigned to another employee', async () => {
    const { service, db } = fixture();
    db.club_sales_commission_entries.findMany.mockResolvedValue([{ source_kind: 'receipt', source_id: 1, employee_id: 99, subscription_id: 1, base_amount: 500, commission_amount: 50, commission_percent: 10 }] as never);
    expect((await service.salesRepsReport(query, {} as never)).rows[0].commissionDue).toBe(0);
  });
  it('does not reverse a refund twice and retains unpaid prior-period refunds for the next run', async () => {
    const { service, db, subscription } = fixture();
    db.club_receipts.findMany.mockResolvedValue([]);
    db.club_subscription_refunds.findMany.mockResolvedValue([{ id: 10, refund_amount: 500, subscription_id: 1, subscription, refund_date: '2026-08-02', completed_at: new Date('2026-08-02') }] as never);
    const allocation = { source_kind: 'receipt', source_id: 1, employee_id: 4, subscription_id: 1, base_amount: 500, commission_amount: 100, commission_percent: 20 };
    db.club_sales_commission_entries.findMany.mockResolvedValue([allocation] as never);
    expect((await service.salesRepsReport(query, {} as never)).rows[0].commissionDue).toBe(-100);
    db.club_sales_commission_entries.findMany.mockResolvedValue([allocation, { ...allocation, source_kind: 'refund', source_id: 10, commission_amount: -100 }] as never);
    expect((await service.salesRepsReport(query, {} as never)).rows[0].commissionDue).toBe(0);
  });
  it('counts a backdated receipt only in its own period (Noamany payroll keeps no commission sources)', async () => {
    const { service, db, subscription } = fixture();
    db.club_receipts.findMany.mockResolvedValue([{ id: 1, subscription_id: 1, receipt_date: '2026-08-05', amount: 500, subscription }]);
    expect((await service.salesRepsReport(query, {} as never)).rows[0].commissionDue).toBe(0);
  });
  it('defers a refund until all of this employee’s original receipt commissions are known', async () => {
    const { service, db, subscription } = fixture();
    subscription.receipts[0].receipt_date = '2026-08-01';
    db.club_receipts.findMany.mockResolvedValue([]);
    db.club_subscription_refunds.findMany.mockResolvedValue([{ id: 10, refund_amount: 500, subscription_id: 1, subscription, completed_at: new Date('2026-09-02') }] as never);
    expect((await service.salesRepsReport(query, {} as never)).rows[0].sources).toEqual([]);
    subscription.receipts.push({ id: 2, amount: 500, receipt_date: '2026-08-02' });
    const original = { source_kind: 'receipt', source_id: 1, employee_id: 4, commission_amount: 50 };
    db.club_sales_commission_entries.findMany.mockResolvedValue([original] as never);
    expect((await service.salesRepsReport(query, {} as never)).rows[0].sources).toEqual([]);
    db.club_sales_commission_entries.findMany.mockResolvedValue([original, { ...original, source_id: 2, commission_amount: 100 }] as never);
    expect((await service.salesRepsReport(query, {} as never)).rows[0].commissionDue).toBe(-75);
  });
  it('does not infer settlement from a legacy payroll belonging to a different branch', async () => {
    const { service, db, subscription } = fixture();
    db.club_receipts.findMany.mockResolvedValue([{ id: 1, subscription_id: 1, branch_id: 2, receipt_date: '2026-09-01', amount: 500, subscription }] as never);
    db.fin_payroll_items.findMany.mockResolvedValue([{ employee_id: 4, branch_id: 1, commission_sources: null, run: { branch_id: 1, period_start: '2026-09-01', period_end: '2026-09-30' } }] as never);
    expect((await service.salesRepsReport(query, {} as never)).rows[0].commissionDue).toBe(50);
  });

});
