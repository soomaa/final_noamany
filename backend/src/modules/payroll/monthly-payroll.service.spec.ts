import { PayrollService } from './payroll.service';
import { FinancePayrollService } from '../finance-payroll/finance-payroll.service';

function setup() {
  const state: any = { run: { id: 1, mosayer_rkm: 10, mosayer_month: 3, mosayer_year: 2026, period_start: '2026-03-01', period_end: '2026-03-31', taghez: 'yes', approved: 0 }, events: [], allocations: [], sales: [{ id: 91, employee_id: 7, sale_type: 'employee', status: 'completed', billing_cycle: 'monthly', billing_status: 'unbilled', sale_date: '2026-03-03', total_amount: 150, collected_amount: 0, sale_number: 'QS-91' }], line: { id: 4, emp_id: 7, mosayer_rkm_fk: 10 } };
  const tx: any = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    hr_mosayer: { findUnique: jest.fn(async () => state.run), update: jest.fn(async ({ data }) => Object.assign(state.run, data)) },
    hr_mosayer_details: { findFirst: jest.fn(async () => state.line), update: jest.fn(async ({ data }) => Object.assign(state.line, data)), findMany: jest.fn(async () => [state.line]) },
    payroll_monthly_events: {
      findUnique: jest.fn(async ({ where }) => state.events.find((e: any) => e.request_id === where.request_id)),
      findFirst: jest.fn(async ({ where }) => state.events.find((e: any) => where.reverses_id != null ? e.reverses_id === where.reverses_id : e.id === where.id && e.run_id === where.run_id && e.employee_id === where.employee_id && where.kind.in.includes(e.kind))),
      findMany: jest.fn(async ({ where }) => state.events.filter((e: any) => e.run_id === where.run_id && e.employee_id === where.employee_id)),
      create: jest.fn(async ({ data }) => { const row = { id: state.events.length + 1, ...data, reverses_id: data.reverses_id ?? null }; state.events.push(row); return row; }),
    },
    payroll_cafe_allocations: {
      findMany: jest.fn(async ({ where }) => state.allocations.filter((a: any) => (!where.employee_id || a.employee_id === where.employee_id) && (where.run_id?.not != null ? a.run_id !== where.run_id.not : !where.run_id || a.run_id === where.run_id))),
      deleteMany: jest.fn(async ({ where }) => { state.allocations = state.allocations.filter((a: any) => a.run_id !== where.run_id || a.employee_id !== where.employee_id); }),
      create: jest.fn(async ({ data }) => { if (state.allocations.some((a: any) => a.sale_id === data.sale_id)) throw new Error('duplicate sale'); state.allocations.push(data); return data; }),
      updateMany: jest.fn(async ({ data }) => state.allocations.forEach((a: any) => Object.assign(a, data))),
    },
    sales_quick_sales: {
      findMany: jest.fn(async ({ where }) => state.sales.filter((s: any) => s.status === 'completed' && ['unbilled', 'in_statement'].includes(s.billing_status) && (!where.id || where.id.in.includes(s.id)))),
      findUnique: jest.fn(async ({ where }) => state.sales.find((s: any) => s.id === where.id)),
      update: jest.fn(async ({ where, data }) => Object.assign(state.sales.find((s: any) => s.id === where.id), data)),
    },
    fin_revenues: { updateMany: jest.fn() }, sales_invoice_events: { create: jest.fn() },
    sales_billing_statement_items: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const prisma: any = { ...tx, $transaction: jest.fn(async (cb: any) => { const before = structuredClone(state); try { return await cb(tx); } catch (e) { Object.assign(state, before); throw e; } }) };
  const engine = { computeOneById: jest.fn(async (_emp, _m, _y, overrides) => ({ empId: 7, empCode: 7, empName: 'منى', ratebAsasy: 3000, otherAllowances: overrides.privateBonus + overrides.manualIncrease + overrides.taqeemValue + overrides.targetValue, otherDeductions: overrides.manualDeduction + overrides.cafeDeduction, totalEsthkak: 3000 + overrides.privateBonus + overrides.manualIncrease + overrides.taqeemValue + overrides.targetValue, totalKhsomat: overrides.manualDeduction + overrides.cafeDeduction, safi: 3000 + overrides.privateBonus + overrides.manualIncrease + overrides.taqeemValue + overrides.targetValue - overrides.manualDeduction - overrides.cafeDeduction, taxPolicySnapshot: {}, breakdown: { cafeDeduction: overrides.cafeDeduction }, taxBreakdown: {} })) };
  const service = new PayrollService(prisma, engine as never);
  jest.spyOn(service, 'getSlip').mockResolvedValue({ employee: { id: 7 } } as never);
  jest.spyOn(service, 'monthlyEmployee').mockImplementation(async () => state as never);
  jest.spyOn(service as any, 'recomputeHeaderTotals').mockResolvedValue(undefined);
  const user = { sub: 42, name: 'مسؤول النظام' } as never;
  const event = (kind: string, amount: number, requestId: string, extra = {}) => service.addMonthlyEvent(1, 4, { kind, amount, requestId, note: 'ملاحظة مستقلة', ...extra } as never, user);
  return { state, tx, prisma, engine, service, user, event };
}

describe('monthly payroll edits and café allocation', () => {
  it('adds separate monetary entries and does not reapply a retried request', async () => {
    const { state, event, engine } = setup();
    await event('deduction', 100, 'request-0000000001');
    await event('deduction', 25, 'request-0000000002');
    await event('bonus', 200, 'request-0000000003');
    await event('bonus', 200, 'request-0000000003');
    expect(state.events).toHaveLength(3);
    expect(state.events[0]).toMatchObject({ actor_id: 42, actor_name: 'مسؤول النظام', note: 'ملاحظة مستقلة' });
    expect(state.line.safi).toBe(3075);
    expect(engine.computeOneById).toHaveBeenLastCalledWith(7, 3, 2026, expect.objectContaining({ privateBonus: 200, manualDeduction: 125 }), { fromDate: '2026-03-01', toDate: '2026-03-31' });
  });
  it('rejects reuse of a request identity with different content', async () => {
    const { event, state } = setup();
    await event('bonus', 200, 'request-0000000001');
    await expect(event('bonus', 300, 'request-0000000001')).rejects.toThrow('طلب مختلف');
    expect(state.line.safi).toBe(3200);
  });
  it('retains the original event and prevents reversing it twice', async () => {
    const { event, state } = setup();
    await event('deduction', 100, 'request-0000000001');
    await event('reversal', 100, 'request-0000000002', { reversesId: 1 });
    expect(state.line.safi).toBe(3000);
    expect(state.events).toHaveLength(2);
    await expect(event('reversal', 100, 'request-0000000003', { reversesId: 1 })).rejects.toThrow('تم إلغاؤها');
  });
  it('rolls back history and amounts if deductions exceed earnings', async () => {
    const { event, state } = setup();
    await expect(event('deduction', 5000, 'request-0000000001')).rejects.toThrow('الخصومات أكبر');
    expect(state.events).toHaveLength(0);
  });
  it.each([1])('rechecks approval under the header lock before writing', async approved => {
    const { state, event, tx } = setup(); state.run.approved = approved;
    await expect(event('bonus', 100, 'request-0000000001')).rejects.toThrow('التعديل مقفول');
    expect(tx.$queryRaw).toHaveBeenCalled(); expect(state.events).toHaveLength(0);
  });
  it('edits after submission require a new review', async () => {
    const { state, event } = setup(); state.run.suspend_mohasb = 'yes';
    await event('bonus', 100, 'request-0000000001');
    expect(state.run.suspend_mohasb).toBeNull();
  });
  it('reserves exact café invoices, keeps them unpaid until post, and releases on defer', async () => {
    const { service, user, state } = setup();
    await service.chooseMonthlyCafe(1, 4, { deduct: true, expectedAmount: 150, note: 'خصم مارس', requestId: 'cafe-request-000001' }, user);
    expect(state.line.safi).toBe(2850); expect(state.sales[0].billing_status).toBe('unbilled');
    expect(state.allocations).toHaveLength(1);
    await service.chooseMonthlyCafe(1, 4, { deduct: false, expectedAmount: 150, note: 'تأجيل', requestId: 'cafe-request-000002' }, user);
    expect(state.line.safi).toBe(3000); expect(state.allocations).toHaveLength(0);
    expect(state.events.map((e: any) => e.kind)).toEqual(['cafe_select', 'cafe_defer']);
  });
  it('rejects a stale café balance and a balance reserved in another month', async () => {
    const { service, user, state } = setup();
    await expect(service.chooseMonthlyCafe(1, 4, { deduct: true, expectedAmount: 100, note: 'خصم', requestId: 'cafe-request-000001' }, user)).rejects.toThrow('اتغيرت');
    expect(state.allocations).toHaveLength(0);
    state.allocations.push({ run_id: 2, employee_id: 7, sale_id: 91, amount: 150 });
    await expect(service.chooseMonthlyCafe(1, 4, { deduct: true, expectedAmount: 150, note: 'خصم', requestId: 'cafe-request-000002' }, user)).rejects.toThrow('لا توجد مديونية');
  });
  it('settles only allocated invoices without creating cash or a duplicate invoice', async () => {
    const { service, user, state, prisma, tx } = setup();
    await service.chooseMonthlyCafe(1, 4, { deduct: true, expectedAmount: 150, note: 'خصم', requestId: 'cafe-request-000001' }, user);
    await prisma.$transaction((client: any) => (service as any).settleMonthlyCafe(client, 1, 42));
    expect(state.sales[0].billing_status).toBe('settled'); expect(state.allocations[0].settled_at).toBeInstanceOf(Date);
    expect(tx.fin_revenues.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { payment_status: 'مدفوع' } }));
    await expect(prisma.$transaction((client: any) => (service as any).settleMonthlyCafe(client, 1, 42))).rejects.toThrow('تغيرت مديونية');
  });
  it('rejects monthly edits without the existing HR update permission', async () => {
    const payroll = { addMonthlyEvent: jest.fn() };
    const service = new FinancePayrollService(payroll as never, { canAny: jest.fn().mockResolvedValue(false) } as never);
    await expect(service.addMonthlyEvent(1, 4, {} as never, { sub: 42 } as never)).rejects.toThrow();
    expect(payroll.addMonthlyEvent).not.toHaveBeenCalled();
  });
  it('preserves legacy windows and uses saved calendar boundaries for new runs', () => {
    const { service } = setup();
    expect((service as any).runWindow({ mosayer_month: 1, mosayer_year: 2026 })).toMatchObject({ fromDate: '2025-12-26', toDate: '2026-01-25' });
    expect((service as any).runWindow({ mosayer_month: 3, mosayer_year: 2026, period_start: '2026-03-01', period_end: '2026-03-31' })).toEqual({ fromDate: '2026-03-01', toDate: '2026-03-31' });
  });
});

describe('monthly payroll posting consistency', () => {
  it('will not mark café invoices paid when the deduction is missing from the salary snapshot', async () => {
    const { service, user, state, prisma } = setup();
    await service.chooseMonthlyCafe(1, 4, { deduct: true, expectedAmount: 150, note: 'خصم', requestId: 'cafe-request-000001' }, user);
    state.line.calculation_snapshot.breakdown.cafeDeduction = 0;
    await expect(prisma.$transaction((tx: any) => (service as any).settleMonthlyCafe(tx, 1, 42))).rejects.toThrow('لا يطابق');
    expect(state.sales[0].billing_status).toBe('unbilled');
    expect(state.allocations[0].settled_at).toBeUndefined();
  });
  it('carries previously saved private bonuses into the immutable history once', async () => {
    const { state, event } = setup();
    state.line.calculation_snapshot = { overrides: { privateBonus: 200 } };
    await event('deduction', 100, 'request-0000000001');
    await event('deduction', 50, 'request-0000000002');
    expect(state.events.filter((e: any) => e.request_id.startsWith('legacy-'))).toHaveLength(1);
    expect(state.line.safi).toBe(3050);
  });
});
