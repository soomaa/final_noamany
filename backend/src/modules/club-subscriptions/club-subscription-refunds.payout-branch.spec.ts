import { ForbiddenException } from '@nestjs/common';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { ClubSubscriptionRefundsService, REFUND_EXPENSE_CATEGORY } from './club-subscription-refunds.service';

function setup(group = [3, 7]) {
  const subscription = { id: 22, member_id: 42, customer_name: 'عضو تجريبي', branch_id: 7,
    subscription_number: 'SUB-TEST', subscription_type: 'اشتراك', subscription_start_date: '2026-10-01',
    subscription_end_date: '2026-10-31', subscription_value: 300, paid_amount: 300, remaining_amount: 0,
    discount_enabled: false, discount_value: 0, is_linked_to_sessions: false, payment_method: 'cash' };
  let refund: any;
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([{ id: 22 }]),
    $queryRawUnsafe: jest.fn().mockResolvedValue([{ acquired: 1 }]),
    club_subscriptions: { findUnique: jest.fn().mockResolvedValue(subscription), update: jest.fn().mockResolvedValue(subscription) },
    club_subscription_refunds: {
      aggregate: jest.fn().mockResolvedValue({ _sum: { refund_amount: 0 } }), findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(({ data }) => { refund = { id: 60, ...data }; return Promise.resolve(refund); }),
      findUnique: jest.fn().mockImplementation(() => Promise.resolve(refund)),
      updateMany: jest.fn().mockImplementation(() => { refund.status = 'completed'; return Promise.resolve({ count: 1 }); }),
    },
    fin_expenses: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 1 }) },
  };
  const prisma = { ...tx, $transaction: jest.fn().mockImplementation(fn => fn(tx)) };
  const accounting = { postJournal: jest.fn().mockResolvedValue(undefined) };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const service = new ClubSubscriptionRefundsService(prisma as never, accounting as never,
    { recalculateSubscriptionPayments: jest.fn().mockResolvedValue(undefined) } as never,
    audit as never, new BranchScopeService(), { siblingBranchIds: jest.fn().mockResolvedValue(group) });
  return { service, tx, accounting, audit, subscription };
}

const user = { sub: 11, level: 2, branch: 3, man_women_type: 3, job_title: 'موظف استقبال' } as never;
const body = { subscriptionId: 22, stopDate: '2026-10-16', createdBy: 11 };

describe('refund payout branch ownership', () => {
  it('books a sibling subscription refund, its journal, expense and audit to the executing branch', async () => {
    const { service, tx, accounting, audit, subscription } = setup();
    const result = await service.create(body, user);
    expect(result).toMatchObject({ branchId: 3, refundAmount: 150, status: 'completed' });
    expect(tx.club_subscription_refunds.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ branch_id: 3, subscription_id: 22 }) }));
    expect(accounting.postJournal).toHaveBeenCalledWith(expect.objectContaining({ branchId: 3, kind: 'refund', paidAmount: 150 }), tx);
    expect(tx.fin_expenses.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ branch_id: 3, total_amount: 150, category: REFUND_EXPENSE_CATEGORY }) }));
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ branchId: 3 }));
    expect(subscription.branch_id).toBe(7);
    expect(tx.club_subscriptions.update.mock.calls.every(([args]) => !('branch_id' in args.data))).toBe(true);
  });

  it('returns the executing branch in the preview without booking money', async () => {
    const { service, tx } = setup();
    const preview = await service.computePreview(body, user);
    expect(preview.refundBranchId).toBe(3);
    expect(tx.club_subscription_refunds.create).not.toHaveBeenCalled();
    expect(tx.fin_expenses.create).not.toHaveBeenCalled();
  });

  it('rejects a source subscription outside the group', async () => {
    const { service, tx } = setup([3]);
    await expect(service.create(body, user)).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.club_subscription_refunds.create).not.toHaveBeenCalled();
  });

  it('prevents an employee from changing the paying branch, including in previews', async () => {
    const { service, tx } = setup();
    await expect(service.create({ ...body, branchId: 7, dryRun: true }, user)).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.club_subscription_refunds.create).not.toHaveBeenCalled();
  });

  it('uses the explicitly selected payout branch for an administrator with no assigned branch', async () => {
    const { service } = setup();
    const result = await service.create({ ...body, branchId: 3 }, { sub: 1, level: 1, branch: 0 } as never);
    expect(result).toMatchObject({ branchId: 3 });
  });
});
