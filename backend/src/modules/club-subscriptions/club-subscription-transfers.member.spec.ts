import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { JwtUser } from '../../common/types/jwt-user';
import { BusinessAuditService } from '../gym-ops/business-audit.service';
import { ClubReceiptsService } from './club-receipts.service';
import { ClubSubscriptionTransfersService } from './club-subscription-transfers.service';
import { addDays } from './club-subscription.utils';
import { localDateString } from '../club-members/club-member.utils';

describe('ClubSubscriptionTransfersService.transferToMember', () => {
  const today = localDateString();
  const member = (id: number, name: string) => ({
    id,
    member_code: `M${id}`,
    name,
    phone: null,
    email: null,
    gender: 'male',
    card_number: null,
    date_of_birth: null,
    address: null,
    marital_status: null,
    job_title: null,
    profile_picture: null,
    branch_id: 6,
    membership_type_id: null,
    start_date: null,
    end_date: null,
    notes: null,
    is_active: true,
    sales_id: null,
    employee_id: null,
    guardian_name: null,
    guardian_phone: null,
    app_user_id: null,
    is_deleted: false,
    created_by: 1,
    created_at: new Date(),
    updated_at: new Date(),
  });
  const sourceMember = member(10, 'Source');
  const destinationMember = member(20, 'Destination');
  const source = {
    id: 100,
    subscription_number: 'M10',
    registration_date: addDays(today, -10),
    branch_id: 6,
    member_id: 10,
    customer_name: 'Source',
    subscription_type_id: 3,
    special_class_type_id: null,
    subscription_type: 'Monthly',
    subscription_start_date: addDays(today, -10),
    subscription_end_date: addDays(today, 20),
    subscription_value: 310,
    discount_enabled: false,
    discount_value: 0,
    paid_amount: 310,
    waived_amount: 0,
    transferred_credit_amount: 0,
    transferred_out_amount: 0,
    remaining_amount: 0,
    gender: 'male',
    employee_id: null,
    sales_id: null,
    payment_method: 'cash',
    receipt_number: 'R-1',
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
    created_by: 1,
    created_at: new Date(),
    updated_at: new Date(),
    member: sourceMember,
    type: { id: 3, branches: [{ branch_id: 6 }] },
  };
  const createdDestination = {
    ...source,
    id: 101,
    subscription_number: 'MT100D20',
    member_id: 20,
    customer_name: 'Destination',
    subscription_start_date: today,
    subscription_value: 210,
    paid_amount: 0,
    transferred_credit_amount: 210,
    receipt_number: null,
    member: undefined,
    type: undefined,
  };
  const tx = {
    $queryRaw: jest.fn(),
    club_subscriptions: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    club_members: { findUnique: jest.fn() },
    club_member_subscription_transfers: { create: jest.fn() },
    business_audit_log: { create: jest.fn() },
  };
  const prisma = {
    $transaction: jest.fn(),
    club_member_subscription_transfers: { findMany: jest.fn() },
  };
  const receipts = { recalculateSubscriptionPayments: jest.fn() };
  const audit = { log: jest.fn() };
  const branchScope = {
    isBranchAllowed: jest.fn().mockReturnValue(true),
    allowedBranchIds: jest.fn().mockReturnValue(null),
  };
  const user = { sub: 7, level: 1, branch: 0 } as JwtUser;
  const service = new ClubSubscriptionTransfersService(
    prisma as unknown as PrismaService,
    receipts as unknown as ClubReceiptsService,
    { postJournal: jest.fn() } as unknown as import('./club-subscription-accounting.service').ClubSubscriptionAccountingService,
    audit as unknown as BusinessAuditService,
    branchScope as unknown as BranchScopeService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    branchScope.isBranchAllowed.mockReturnValue(true);
    prisma.$transaction.mockImplementation(async (fn: (client: typeof tx) => unknown) => fn(tx));
    tx.club_subscriptions.findUnique.mockResolvedValue(source);
    tx.club_subscriptions.findMany.mockResolvedValue([]);
    tx.club_members.findUnique.mockResolvedValue(destinationMember);
    tx.club_subscriptions.create.mockResolvedValue(createdDestination);
    tx.club_member_subscription_transfers.create.mockImplementation(async ({ data }: any) => ({
      id: 55,
      ...data,
      source_member: sourceMember,
      destination_member: destinationMember,
      source_subscription: source,
      destination_subscription: createdDestination,
    }));
    audit.log.mockResolvedValue(undefined);
  });

  it('moves remaining days/value as non-cash credit and exhausts the source atomically', async () => {
    const result = await service.transferToMember(
      { sourceSubscriptionId: 100, destinationMemberId: 20, reason: 'طلب العضو' },
      user,
    );

    expect(result).toMatchObject({
      source_subscription_id: 100,
      destination_subscription_id: 101,
      remaining_days: 21,
      entitlement_kind: 'days',
      transferred_value: 210,
      created_by: 7,
    });
    expect(tx.club_subscriptions.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        member_id: 20,
        subscription_start_date: today,
        subscription_end_date: addDays(today, 20),
        subscription_value: 210,
        paid_amount: 0,
        transferred_credit_amount: 210,
        remaining_amount: 0,
        payment_method: null,
        receipt_number: null,
      }),
    });
    expect(tx.club_subscriptions.update).toHaveBeenCalledWith({
      where: { id: 100 },
      data: expect.objectContaining({
        subscription_end_date: addDays(today, -1),
        status: 'expired',
        transferred_out_amount: 210,
      }),
    });
    expect(receipts.recalculateSubscriptionPayments).not.toHaveBeenCalled();
    expect(tx.business_audit_log.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'member_entitlement_transfer',
        actor_user_id: 7,
        reason: 'طلب العضو',
      }),
    });
  });

  it('rejects an unsettled source before creating the destination subscription', async () => {
    tx.club_subscriptions.findUnique.mockResolvedValue({ ...source, remaining_amount: 25 });

    await expect(service.transferToMember(
      { sourceSubscriptionId: 100, destinationMemberId: 20, reason: 'طلب العضو' },
      user,
    )).rejects.toBeInstanceOf(BadRequestException);

    expect(tx.club_subscriptions.create).not.toHaveBeenCalled();
    expect(tx.club_member_subscription_transfers.create).not.toHaveBeenCalled();
  });

  it('rejects cross-branch transfers', async () => {
    tx.club_members.findUnique.mockResolvedValue({ ...destinationMember, branch_id: 7 });

    await expect(service.transferToMember(
      { sourceSubscriptionId: 100, destinationMemberId: 20, reason: 'طلب العضو' },
      user,
    )).rejects.toThrow('التحويل بين الأعضاء مسموح داخل نفس الفرع فقط');
  });

  it('rejects creating a duplicate live entitlement for the destination member', async () => {
    tx.club_subscriptions.findMany.mockResolvedValue([{
      status: 'active',
      subscription_start_date: today,
      subscription_end_date: addDays(today, 30),
      is_linked_to_sessions: false,
      sessions_count: null,
      sessions_used: 0,
    }]);

    await expect(service.transferToMember(
      { sourceSubscriptionId: 100, destinationMemberId: 20, reason: 'طلب العضو' },
      user,
    )).rejects.toThrow('العضو المستلم لديه بالفعل نفس الاشتراك');

    expect(tx.club_subscriptions.create).not.toHaveBeenCalled();
  });
});
