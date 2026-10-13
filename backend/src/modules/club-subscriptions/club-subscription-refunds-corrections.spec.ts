import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { BusinessAuditService } from '../gym-ops/business-audit.service';
import { ClubReceiptsService } from './club-receipts.service';
import { ClubSubscriptionAccountingService } from './club-subscription-accounting.service';
import { ClubSubscriptionRefundsService } from './club-subscription-refunds.service';

const refund = {
  id: 7, subscription_id: 11, branch_id: 2, status: 'completed',
  invoice_number: 'REF-7', customer_name: 'عضو', refund_amount: 60,
  refund_date: '2026-09-20', stop_date: '2026-09-20',
  original_start_date: '2026-09-01', original_end_date: '2026-10-01',
  original_value: 300, created_at: new Date('2026-09-20T10:00:00Z'),
  created_by: 3, reason: null, notes: null,
};
const subscription = {
  id: 11, branch_id: 2, status: 'expired', subscription_end_date: refund.stop_date,
  subscription_start_date: refund.original_start_date, subscription_number: 'SUB-11',
  subscription_value: 300, paid_amount: 300, discount_enabled: false,
  discount_value: 0, is_linked_to_sessions: false, sessions_count: null,
  sessions_used: 0, payment_method: 'cash',
};
const user = { sub: 3 } as any;

function setup(blocker = 0) {
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([{ id: 11 }]),
    $queryRawUnsafe: jest.fn().mockResolvedValue([{ acquired: 1 }]),
    club_subscription_refunds: {
      findUnique: jest.fn().mockResolvedValue(refund),
      count: jest.fn().mockResolvedValue(0),
      aggregate: jest.fn().mockResolvedValue({ _sum: { refund_amount: 0 } }),
      update: jest.fn().mockResolvedValue({ ...refund, status: 'cancelled' }),
    },
    club_subscriptions: {
      findUnique: jest.fn().mockResolvedValue(subscription),
      count: jest.fn().mockResolvedValue(0),
      update: jest.fn().mockResolvedValue(subscription),
    },
    club_receipts: { count: jest.fn().mockResolvedValue(blocker) },
    club_attendance: { count: jest.fn().mockResolvedValue(0) },
    club_subscription_transfers: { count: jest.fn().mockResolvedValue(0) },
    club_member_subscription_transfers: { count: jest.fn().mockResolvedValue(0) },
    club_subscription_freezes: { count: jest.fn().mockResolvedValue(0) },
    fin_expenses: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 4 }),
    },
    business_audit_log: { create: jest.fn().mockResolvedValue({ id: 1 }) },
  };
  const prisma = { $transaction: jest.fn().mockImplementation((fn: (client: typeof tx) => unknown) => fn(tx)) };
  const accounting = {
    reverseRefundEntry: jest.fn().mockResolvedValue(undefined),
    postJournal: jest.fn().mockResolvedValue(undefined),
  };
  const receipts = { recalculateSubscriptionPayments: jest.fn().mockResolvedValue(undefined) };
  const scope = { isBranchAllowed: jest.fn().mockReturnValue(true) };
  const service = new ClubSubscriptionRefundsService(
    prisma as unknown as PrismaService,
    accounting as unknown as ClubSubscriptionAccountingService,
    receipts as unknown as ClubReceiptsService,
    {} as BusinessAuditService,
    scope as unknown as BranchScopeService,
  );
  return { service, tx, accounting, receipts };
}

describe('subscription refund corrections', () => {
  it('reverses a completed refund and restores the original subscription end date on deletion', async () => {
    const { service, tx, accounting, receipts } = setup();
    await expect(service.remove(refund.id, user)).resolves.toEqual({ success: true });
    expect(accounting.reverseRefundEntry).toHaveBeenCalledWith('REF-7', expect.any(String), 3, tx);
    expect(tx.club_subscription_refunds.update).toHaveBeenCalledWith({ where: { id: 7 }, data: { status: 'cancelled' } });
    expect(receipts.recalculateSubscriptionPayments).toHaveBeenCalledWith(11, tx);
    expect(tx.club_subscriptions.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 11 }, data: expect.objectContaining({ subscription_end_date: '2026-10-01' }),
    }));
    expect(tx.fin_expenses.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ invoice_number: 'REF-7', is_deleted: false }),
    }));
  });

  it('blocks correction when a later receipt exists, before reversing any financial entry', async () => {
    const { service, tx, accounting } = setup(1);
    await expect(service.edit(refund.id, {
      refundAmount: 50, refundDate: '2026-09-21', stopDate: '2026-09-20',
    }, user)).rejects.toBeInstanceOf(BadRequestException);
    expect(accounting.reverseRefundEntry).not.toHaveBeenCalled();
    expect(tx.club_subscription_refunds.update).not.toHaveBeenCalled();
  });

  it('reposts a corrected amount and date and replaces the linked expense', async () => {
    const { service, tx, accounting, receipts } = setup();
    tx.club_subscription_refunds.update.mockResolvedValue({
      ...refund, refund_amount: 80, refund_date: '2026-09-21', reason: 'تصحيح',
    });
    const result = await service.edit(refund.id, {
      refundAmount: 80, refundDate: '2026-09-21', stopDate: '2026-09-20', reason: 'تصحيح',
    }, user);
    expect(result.refundAmount).toBe(80);
    expect(accounting.reverseRefundEntry).toHaveBeenCalledWith('REF-7', expect.any(String), 3, tx);
    expect(receipts.recalculateSubscriptionPayments).toHaveBeenCalledWith(11, tx);
    expect(accounting.postJournal).toHaveBeenCalledWith(expect.objectContaining({
      sourceDocId: 'REF-7', paidAmount: 80, registrationDate: '2026-09-21', kind: 'refund',
    }), tx);
    expect(tx.fin_expenses.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      amount: 80, expense_date: '2026-09-21', invoice_number: 'REF-7',
    }) }));
  });

  it('keeps corrections on the original paying branch when the subscription belongs to another branch', async () => {
    const { service, tx, accounting } = setup();
    tx.club_subscription_refunds.findUnique.mockResolvedValue({ ...refund, branch_id: 3 });
    tx.club_subscriptions.findUnique.mockResolvedValue({ ...subscription, branch_id: 7 });
    await service.edit(refund.id, { refundAmount: 50, refundDate: '2026-09-21', stopDate: '2026-09-20' }, user);
    expect(accounting.postJournal).toHaveBeenCalledWith(expect.objectContaining({ branchId: 3, kind: 'refund' }), tx);
    expect(tx.fin_expenses.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ branch_id: 3 }) }));
  });
});
