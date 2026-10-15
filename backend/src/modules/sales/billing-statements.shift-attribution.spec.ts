import { SalesPaymentMethod } from '@prisma/client';
import { BillingStatementsService } from './billing-statements.service';

const statementFixture = {
  id: 12,
  statement_number: 'ST-20260901-E-00000012',
  account_type: 'employee',
  employee_id: 44,
  partner_id: null,
  billing_cycle: 'monthly',
  period_start: '2026-08-01',
  period_end: '2026-08-31',
  total_amount: 150,
  paid_amount: 0,
  settlement_method: null,
  payment_method: null,
  status: 'issued',
  notes: null,
  branch_id: 1,
  created_by: 9,
  settled_by: null,
  settled_at: null,
  created_at: new Date('2026-09-01T08:00:00Z'),
  updated_at: new Date('2026-09-01T08:00:00Z'),
  items: [{
    quick_sale_id: 91,
    amount: 150,
    sale: {
      id: 91,
      sale_number: 'QS-91',
      daily_number: 4,
      sale_date: '2026-08-20',
    },
  }],
};

function setup() {
  const updated = {
    ...statementFixture,
    status: 'settled',
    paid_amount: 150,
    settled_by: 9,
    settled_at: new Date('2026-09-01T12:00:00Z'),
  };
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    payroll_cafe_allocations: { count: jest.fn().mockResolvedValue(0) },
    fin_revenues: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    sales_shift_sessions: { findFirst: jest.fn().mockResolvedValue({ id: 7 }) },
    sales_cash_drawer_transactions: { create: jest.fn().mockResolvedValue({ id: 31 }) },
    sales_quick_sales: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    sales_invoice_events: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
    sales_billing_statements: { findUnique: jest.fn().mockResolvedValue(statementFixture), update: jest.fn().mockResolvedValue(updated) },
  };
  const prisma = {
    sales_billing_statements: {
      findUnique: jest.fn().mockResolvedValue(statementFixture),
    },
    $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
  };
  const ledger = {
    ensureChart: jest.fn().mockResolvedValue(undefined),
    postSalesStatementSettlement: jest.fn().mockResolvedValue(undefined),
  };
  const sessions = {
    findBranchSessionForSale: jest.fn().mockResolvedValue({ id: 7 }),
    applyStatementSettlementToSession: jest.fn().mockResolvedValue(undefined),
  };
  const service = new (BillingStatementsService as any)(prisma, ledger, sessions) as BillingStatementsService;
  return { service, tx, ledger, sessions };
}

describe('BillingStatementsService shift attribution', () => {
  it('attributes a direct cash settlement to the open shift and records the drawer receipt', async () => {
    const { service, tx, sessions } = setup();

    await service.settle(12, {
      settlementMethod: 'direct_payment',
      paymentMethod: SalesPaymentMethod.cash,
    }, 9);

    expect(sessions.findBranchSessionForSale).toHaveBeenCalledWith(tx, 1);
    expect(sessions.applyStatementSettlementToSession).toHaveBeenCalledWith(tx, 7, {
      amount: 150,
      settlementMethod: 'direct_payment',
      paymentMethod: SalesPaymentMethod.cash,
    });
    expect(tx.fin_revenues.updateMany).toHaveBeenCalledWith({
      where: { source_module: 'quick_sale', source_ref: { in: ['QS-91'] } },
      data: { payment_status: 'مدفوع' },
    });
    expect(tx.sales_cash_drawer_transactions.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        reference: 'AS-12-7',
        branch_id: 1,
        shift_session_id: 7,
        source_transaction_id: 12,
        movement_type: 'account_settlement',
        direction: 'in',
        employee_id: 44,
        amount: expect.anything(),
      }),
    });
    expect(tx.sales_billing_statements.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ shift_session_id: 7 }),
      }),
    );
  });

  it('requires payroll selection instead of marking an uncollected salary deduction paid', async () => {
    const { service, tx } = setup();
    await expect(service.settle(12, { settlementMethod: 'payroll_deduction' } as never, 9)).rejects.toThrow('المرتبات الشهرية');
    expect(tx.sales_billing_statements.update).not.toHaveBeenCalled();
  });
  it('does not collect cash for a statement already reserved in payroll', async () => {
    const { service, tx, sessions, ledger } = setup();
    tx.payroll_cafe_allocations.count.mockResolvedValue(1);
    await expect(service.settle(12, { settlementMethod: 'direct_payment', paymentMethod: SalesPaymentMethod.cash }, 9)).rejects.toThrow('مختار للخصم');
    expect(ledger.postSalesStatementSettlement).not.toHaveBeenCalled();
    expect(sessions.applyStatementSettlementToSession).not.toHaveBeenCalled();
    expect(tx.sales_cash_drawer_transactions.create).not.toHaveBeenCalled();
  });

});
