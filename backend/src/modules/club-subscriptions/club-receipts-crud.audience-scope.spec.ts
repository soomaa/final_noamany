import { ClubReceiptsCrudService } from './club-receipts-crud.service';

describe('ClubReceiptsCrudService canonical audience scope', () => {
  const prisma = {
    club_receipts: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      findUnique: jest.fn(),
    },
    club_subscriptions: { findUnique: jest.fn() },
    club_members: { findUnique: jest.fn(), findFirst: jest.fn() },
    $transaction: jest.fn(),
  };
  const branchScope = {
    allowedBranchIds: jest.fn().mockReturnValue([5]),
    memberGenderFilter: jest.fn().mockReturnValue('male'),
    isBranchAllowed: jest.fn().mockReturnValue(true),
  };
  const service = new ClubReceiptsCrudService(
    prisma as never,
    {} as never,
    {} as never,
    branchScope as never,
  );
  const user = { sub: 9 } as never;

  beforeEach(() => jest.clearAllMocks());

  it('intersects authoritative branch precedence with canonical receipt audience for list/count', async () => {
    await service.list({ page: 1, pageSize: 20, skip: 0, take: 20 } as never, user);
    const where = prisma.club_receipts.findMany.mock.calls[0][0].where;
    expect(where.AND[0].AND).toHaveLength(2);
    expect(where.AND[0].AND[1].OR[0]).toEqual(expect.objectContaining({
      subscription_id: { not: null },
      subscription: { is: { member: { is: { is_deleted: false, gender: 'male' } } } },
    }));
    expect(prisma.club_receipts.count).toHaveBeenCalledWith({ where });
  });

  it('uses linked subscription member before a conflicting receipt member on direct access', async () => {
    prisma.club_receipts.findUnique.mockResolvedValue({
      id: 1,
      branch_id: 5,
      subscription_id: 7,
      locker_subscription_id: null,
      member_id: 99,
      member_name: 'عضو',
      amount: 100,
      type: null,
      payment_method: 'cash',
      receipt_date: '2026-09-09',
      status: 'paid',
      description: null,
      subscription: { branch_id: 5, member: { gender: 'male', is_deleted: false } },
      locker_subscription: null,
      member: { branch_id: 5, gender: 'female', is_deleted: false },
      payments: [],
    });
    await expect(service.findOne(1, user)).resolves.toMatchObject({ id: 1 });
  });

  it('fails closed when the authoritative subscription has no canonical member', async () => {
    prisma.club_receipts.findUnique.mockResolvedValue({
      id: 2,
      branch_id: 5,
      subscription_id: 8,
      locker_subscription_id: null,
      member_id: 99,
      member_name: 'عضو',
      amount: 100,
      type: null,
      payment_method: 'cash',
      receipt_date: '2026-09-09',
      status: 'paid',
      description: null,
      subscription: { branch_id: 5, member: null },
      locker_subscription: null,
      member: { branch_id: 5, gender: 'male', is_deleted: false },
      payments: [],
    });

    await expect(service.findOne(2, user)).rejects.toThrow(
      'لا تملك صلاحية الوصول إلى بيانات هذا القسم',
    );
  });

  it('rejects creating against an opposite-section subscription and anonymous scoped receipts', async () => {
    prisma.club_subscriptions.findUnique.mockResolvedValue({
      id: 7,
      branch_id: 5,
      member: { gender: 'female', is_deleted: false },
    });
    await expect(service.create({
      subscriptionId: 7,
      memberName: 'عضو',
      amount: 100,
      paymentMethod: 'cash',
    } as never, user)).rejects.toThrow('لا تملك صلاحية الوصول إلى بيانات هذا القسم');

    await expect(service.create({
      memberName: 'زائر',
      amount: 100,
      paymentMethod: 'cash',
    } as never, user)).rejects.toThrow('لا يمكن إنشاء إيصال غير مرتبط بعضو');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('blocks a manually dated receipt when that branch accounting day is closed', async () => {
    branchScope.memberGenderFilter.mockReturnValueOnce(null);
    const tx = {
      business_audit_log: {
        findMany: jest.fn().mockResolvedValue([{
          entity_id: '2026-09-08:5:all',
          action: 'daily_close_close',
        }]),
      },
      club_receipts: { create: jest.fn() },
    };
    prisma.$transaction.mockImplementationOnce(async (work: (client: typeof tx) => unknown) => work(tx));

    await expect(service.create({
      branchId: 5,
      memberName: 'زائر',
      amount: 100,
      paymentMethod: 'cash',
      receiptDate: '2026-09-08',
    } as never, user)).rejects.toThrow('اليوم المالي مقفل');

    expect(tx.business_audit_log.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ entity_id: { in: ['2026-09-08:5:all'] } }),
    }));
    expect(tx.club_receipts.create).not.toHaveBeenCalled();
  });

  it('relocks and reauthorizes a direct member before posting a standalone receipt', async () => {
    prisma.club_members.findFirst.mockResolvedValueOnce({ id: 11, name: 'عضو', card_number: null });
    prisma.club_members.findUnique.mockResolvedValueOnce({
      branch_id: 5,
      gender: 'male',
      is_deleted: false,
    });
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 11 }]),
      club_members: {
        findUnique: jest.fn().mockResolvedValue({
          branch_id: 5,
          gender: 'female',
          is_deleted: false,
        }),
      },
      club_receipts: { create: jest.fn() },
    };
    prisma.$transaction.mockImplementationOnce(async (work: (client: typeof tx) => unknown) => work(tx));

    await expect(service.create({
      branchId: 5,
      memberId: 11,
      memberName: 'عضو',
      amount: 100,
      paymentMethod: 'cash',
    } as never, user)).rejects.toThrow('لا تملك صلاحية الوصول إلى بيانات هذا القسم');

    expect(tx.$queryRaw).toHaveBeenCalled();
    expect(tx.club_receipts.create).not.toHaveBeenCalled();
  });
});
