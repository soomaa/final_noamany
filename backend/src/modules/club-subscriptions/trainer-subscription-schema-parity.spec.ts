import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('trainer/subscription migration schema parity', () => {
  const schema = readFileSync(resolve(process.cwd(), 'prisma/schema.prisma'), 'utf8');

  it('mirrors every runtime field required by the renewal and branch-price services', () => {
    expect(schema).toContain('model club_subscription_type_branch_prices');
    expect(schema).toContain('branch_prices');
    expect(schema).toContain('renewed_from_subscription_id');
    expect(schema).toContain('renewal_successor');
    expect(schema).toContain('private_commission_percentage');
    expect(schema).toContain('attendance_id');
    expect(schema).toContain('payroll_item_id');
    expect(schema).toContain('branch_scope');
  });

  it('mirrors the immutable payout snapshot and payroll lock tables', () => {
    expect(schema).toContain('model club_trainer_receipt_commissions');
    expect(schema).toContain('model club_trainer_refund_settlements');
    expect(schema).toContain('model fin_payroll_employee_locks');
  });
});
