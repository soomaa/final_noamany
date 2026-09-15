import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { BusinessAuditService } from '../gym-ops/business-audit.service';
import { ClubReceiptsCrudService } from './club-receipts-crud.service';
import { ClubReceiptsService } from './club-receipts.service';
import { ClubSubscriptionAccountingService } from './club-subscription-accounting.service';
import { ClubSubscriptionRefundsService } from './club-subscription-refunds.service';

describe('Club money mutation locks', () => {
  it('rejects a concurrent refund that would exceed the remaining paid cap under lock', async () => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 41 }]),
      club_subscriptions: {
        findUnique: jest.fn().mockResolvedValue({
          id: 41,
          paid_amount: 100,
          branch_id: 1,
          member: { gender: 'male', is_deleted: false },
        }),
      },
      club_subscription_refunds: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { refund_amount: 80 } }),
        updateMany: jest.fn(),
      },
    };
    const prisma = {
      $transaction: jest.fn().mockImplementation((fn: (client: typeof tx) => unknown) => fn(tx)),
    };
    const service = new ClubSubscriptionRefundsService(
      prisma as unknown as PrismaService,
      {} as ClubSubscriptionAccountingService,
      {} as ClubReceiptsService,
      {} as BusinessAuditService,
      {
        isBranchAllowed: jest.fn().mockReturnValue(true),
        memberGenderFilter: jest.fn().mockReturnValue(null),
      } as unknown as BranchScopeService,
    );

    await expect(
      (service as any).commitRefund({
        id: 9,
        subscription_id: 41,
        refund_amount: 30,
        stop_date: '2026-07-25',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(tx.$queryRaw).toHaveBeenCalled();
    expect(tx.club_subscription_refunds.updateMany).not.toHaveBeenCalled();
  });

  it('rejects a manual receipt above the live balance before creating a receipt', async () => {
    const subscription = {
      id: 41,
      branch_id: 1,
      subscription_number: 'SUB001',
      subscription_value: 100,
      discount_enabled: false,
      discount_value: 0,
      waived_amount: 0,
      transferred_credit_amount: 0,
    };
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 41 }]),
      club_subscriptions: {
        findUnique: jest.fn().mockResolvedValue(subscription),
      },
      club_receipts: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 80 } }),
        create: jest.fn(),
      },
    };
    const prisma = {
      club_subscriptions: {
        findUnique: jest.fn().mockResolvedValue(subscription),
      },
      $transaction: jest.fn().mockImplementation((fn: (client: typeof tx) => unknown) => fn(tx)),
    };
    const receipts = {
      nextReceiptNumber: jest.fn(),
      recalculateSubscriptionPayments: jest.fn(),
    };
    const accounting = {
      postJournal: jest.fn(),
    };
    const branchScope = {
      isBranchAllowed: jest.fn().mockReturnValue(true),
    };
    const service = new ClubReceiptsCrudService(
      prisma as unknown as PrismaService,
      receipts as unknown as ClubReceiptsService,
      accounting as unknown as ClubSubscriptionAccountingService,
      branchScope as unknown as BranchScopeService,
    );

    await expect(
      service.create({
        subscriptionId: 41,
        memberName: 'Member',
        amount: 21,
        paymentMethod: 'cash',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(tx.$queryRaw).toHaveBeenCalled();
    expect(tx.club_receipts.create).not.toHaveBeenCalled();
    expect(receipts.nextReceiptNumber).not.toHaveBeenCalled();
    expect(accounting.postJournal).not.toHaveBeenCalled();
  });

  it('does not collect cash again for value already settled by a member transfer credit', async () => {
    const subscription = {
      id: 42,
      branch_id: 1,
      subscription_number: 'MT41D9',
      subscription_value: 75,
      discount_enabled: false,
      discount_value: 0,
      waived_amount: 0,
      transferred_credit_amount: 75,
    };
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 42 }]),
      club_subscriptions: { findUnique: jest.fn().mockResolvedValue(subscription) },
      club_receipts: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: null } }),
        create: jest.fn(),
      },
    };
    const prisma = {
      club_subscriptions: { findUnique: jest.fn().mockResolvedValue(subscription) },
      $transaction: jest.fn().mockImplementation((fn: (client: typeof tx) => unknown) => fn(tx)),
    };
    const receipts = {
      nextReceiptNumber: jest.fn(),
      recalculateSubscriptionPayments: jest.fn(),
    };
    const accounting = { postJournal: jest.fn() };
    const branchScope = { isBranchAllowed: jest.fn().mockReturnValue(true) };
    const service = new ClubReceiptsCrudService(
      prisma as unknown as PrismaService,
      receipts as unknown as ClubReceiptsService,
      accounting as unknown as ClubSubscriptionAccountingService,
      branchScope as unknown as BranchScopeService,
    );

    await expect(service.create({
      subscriptionId: 42,
      memberName: 'Destination',
      amount: 1,
      paymentMethod: 'cash',
    })).rejects.toBeInstanceOf(BadRequestException);

    expect(tx.club_receipts.create).not.toHaveBeenCalled();
    expect(receipts.nextReceiptNumber).not.toHaveBeenCalled();
    expect(accounting.postJournal).not.toHaveBeenCalled();
  });
});
