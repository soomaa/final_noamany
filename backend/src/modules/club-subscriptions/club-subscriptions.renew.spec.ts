import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { BusinessAuditService } from '../gym-ops/business-audit.service';
import { AutomationEngineService } from '../gym-ops/automation-engine.service';
import { PermissionEngineService } from '../rbac/engine/permission-engine.service';
import { ClubSubscriptionAccountingService } from './club-subscription-accounting.service';
import { ClubReceiptsService } from './club-receipts.service';
import { ClubSubscriptionsService } from './club-subscriptions.service';
import { addDays } from './club-subscription.utils';
import { localDateString } from '../club-members/club-member.utils';

describe('ClubSubscriptionsService.renew history safety', () => {
  const tx = {
    club_subscriptions: {
      create: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
    },
    club_receipts: {
      deleteMany: jest.fn(),
    },
  };
  const prisma = {
    club_members: {
      findUnique: jest.fn(),
    },
    club_subscriptions: {
      findUnique: jest.fn(),
    },
    club_subscription_freezes: {
      findFirst: jest.fn(),
    },
    club_receipts: {
      findMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const receipts = {
    createForSubscription: jest.fn(),
  };
  const accounting = {
    postJournal: jest.fn(),
    reverseReceiptEntry: jest.fn(),
  };
  const audit = {
    log: jest.fn(),
  };
  const automation = {
    emit: jest.fn(),
  };
  const branchScope = {
    isBranchAllowed: jest.fn(),
    memberGenderFilter: jest.fn(() => null),
  };
  const permissions = {
    isSuperAdmin: jest.fn(),
  };

  const service = new ClubSubscriptionsService(
    prisma as unknown as PrismaService,
    receipts as unknown as ClubReceiptsService,
    accounting as unknown as ClubSubscriptionAccountingService,
    audit as unknown as BusinessAuditService,
    automation as unknown as AutomationEngineService,
    branchScope as unknown as BranchScopeService,
    permissions as unknown as PermissionEngineService,
    { resolveDiscount: jest.fn() } as unknown as import('./club-discount-codes.service').ClubDiscountCodesService,
  );

  const today = localDateString();
  const oldSubscription = {
    id: 41,
    subscription_number: 'MEM001',
    registration_date: addDays(today, -40),
    branch_id: 1,
    member_id: 9,
    customer_name: 'Member',
    subscription_type_id: 2,
    special_class_type_id: null,
    subscription_type: 'Monthly',
    subscription_start_date: addDays(today, -20),
    subscription_end_date: addDays(today, 10),
    subscription_value: 300,
    discount_enabled: false,
    discount_value: 0,
    paid_amount: 300,
    waived_amount: 0,
    remaining_amount: 0,
    gender: null,
    employee_id: null,
    sales_id: null,
    payment_method: 'cash',
    receipt_number: 'R-OLD',
    customer_source_id: null,
    guardian_name: null,
    guardian_phone: null,
    status: 'active',
    is_special: false,
    is_linked_to_sessions: false,
    sessions_count: null,
    sessions_used: 0,
    inbody_used: 0,
    spa_used: 0,
    allow_multiple_daily_entries: false,
    is_time_based: false,
    time_from: null,
    time_to: null,
    created_by: 5,
    created_at: new Date(),
    updated_at: new Date(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    branchScope.isBranchAllowed.mockReturnValue(true);
    prisma.club_members.findUnique.mockResolvedValue({ gender: 'male', is_deleted: false });
    prisma.club_subscriptions.findUnique.mockResolvedValue(oldSubscription);
    prisma.club_subscription_freezes.findFirst.mockResolvedValue(null);
    prisma.$transaction.mockImplementation(async (fn: (client: typeof tx) => unknown) => fn(tx));
    jest.spyOn(service as any, 'generateSubNumberForMember').mockResolvedValue('MEM001-2');
    receipts.createForSubscription.mockResolvedValue({ receipt_number: 'R-NEW' });
    audit.log.mockResolvedValue(undefined);
    automation.emit.mockResolvedValue(undefined);

    const renewed = {
      ...oldSubscription,
      id: 42,
      subscription_number: 'MEM001-2',
      registration_date: today,
      subscription_start_date: addDays(oldSubscription.subscription_end_date, 1),
      subscription_end_date: addDays(oldSubscription.subscription_end_date, 31),
      paid_amount: 300,
      receipt_number: 'R-NEW',
      status: 'upcoming',
    };
    tx.club_subscriptions.create.mockResolvedValue(renewed);
    tx.club_subscriptions.findUniqueOrThrow.mockResolvedValue(renewed);
  });

  it('creates a new period and never deletes, reverses, or updates the old subscription', async () => {
    const result = await service.renew(41, 30, {
      paidAmount: 300,
      paymentMethod: 'cash',
    });

    expect(result.subscription).toMatchObject({
      id: 42,
      subscriptionNumber: 'MEM001-2',
      paidAmount: 300,
      status: 'upcoming',
    });
    expect(tx.club_subscriptions.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        subscription_number: 'MEM001-2',
        member_id: 9,
        paid_amount: 300,
        sessions_used: 0,
        gender: 'male',
      }),
    });
    expect(receipts.createForSubscription).toHaveBeenCalledWith(
      42,
      300,
      expect.objectContaining({ description: 'تجديد اشتراك - Monthly' }),
      tx,
    );
    expect(tx.club_subscriptions.update).not.toHaveBeenCalled();
    expect(tx.club_receipts.deleteMany).not.toHaveBeenCalled();
    expect(prisma.club_receipts.findMany).not.toHaveBeenCalled();
    expect(accounting.reverseReceiptEntry).not.toHaveBeenCalled();
  });

  it('rejects overpayment before starting a transaction', async () => {
    await expect(service.renew(41, 30, { paidAmount: 301 })).rejects.toBeInstanceOf(
      BadRequestException,
    );

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.club_subscriptions.create).not.toHaveBeenCalled();
  });
});
