import { OnlineSubscriptionsService } from './online-subscriptions.service';
import { ForbiddenException } from '@nestjs/common';

describe('OnlineSubscriptionsService public package resolution', () => {
  const prisma = {
    $queryRawUnsafe: jest.fn(),
    $transaction: jest.fn(),
  } as any;

  beforeEach(() => jest.clearAllMocks());

  it('uses the branch override price and does not expose a package unavailable to that branch', async () => {
    prisma.$queryRawUnsafe
      .mockResolvedValueOnce([{ id: 8, name: 'باقة القوة', description: 'وصف', price: 700, days: 30, branch_id: null, apply_to_all_branches: 0, is_special_offer: 0, is_for_students: 0 }])
      .mockResolvedValueOnce([{ branch_id: 4 }])
      .mockResolvedValueOnce([{ price: 555 }]);
    const service = new OnlineSubscriptionsService(prisma, {} as any, {} as any, {} as any);
    await expect(service.publicPackage(8, 4)).resolves.toMatchObject({ id: 8, price: 555, branchId: 4 });
  });

  it('rejects an invalid package identity before reading a fallback row', async () => {
    const service = new OnlineSubscriptionsService(prisma, {} as any, {} as any, {} as any);
    await expect(service.publicPackage(0, 4)).rejects.toThrow('باقة صحيحة');
    expect(prisma.$queryRawUnsafe).not.toHaveBeenCalled();
  });

  it('exposes only packages explicitly published to the member app', async () => {
    prisma.$queryRawUnsafe.mockResolvedValueOnce([]);
    const service = new OnlineSubscriptionsService(prisma, {} as any, {} as any, {} as any);

    await service.publicPackages(4);

    expect(String(prisma.$queryRawUnsafe.mock.calls[0][0])).toContain('show_in_app=1');
  });

  it('returns only global payment methods when no branch is supplied', async () => {
    prisma.$queryRawUnsafe.mockImplementationOnce(async (sql: string) =>
      String(sql).includes('branch_id IS NULL')
        ? [{ id: 1, name: 'عام', method_type: 'instapay', branch_id: null, display_order: 1 }]
        : [
            { id: 1, name: 'عام', method_type: 'instapay', branch_id: null, display_order: 1 },
            { id: 2, name: 'فرع آخر', method_type: 'wallet', branch_id: 9, display_order: 2 },
          ],
    );
    const service = new OnlineSubscriptionsService(prisma, {} as any, {} as any, {} as any);

    await expect(service.paymentMethods()).resolves.toEqual([
      expect.objectContaining({ id: 1, branchId: null }),
    ]);
  });

  it('does not let a branch-scoped employee create a global payment method', async () => {
    const scopedPrisma = { $executeRawUnsafe: jest.fn(), $queryRawUnsafe: jest.fn() } as any;
    const scope = { allowedBranchIds: () => [2], isBranchAllowed: (_user: unknown, branchId: number) => branchId === 2 } as any;
    const service = new OnlineSubscriptionsService(scopedPrisma, scope, {} as any, {} as any);

    await expect(service.savePaymentMethod({ sub: 5 } as any, {
      name: 'إنستاباي', type: 'instapay', branchId: null,
    })).rejects.toThrow('كل الفروع');
    expect(scopedPrisma.$executeRawUnsafe).not.toHaveBeenCalled();
  });

  it('never exposes the private proof storage key in admin JSON', async () => {
    prisma.$queryRawUnsafe.mockResolvedValueOnce([{
      id: 17, branch_id: 2, applicant_gender: 'female', proof_path: 'proof-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png', proof_mime: 'image/png',
    }]);
    const service = new OnlineSubscriptionsService(
      prisma,
      { isBranchAllowed: () => true, isMemberGenderAllowed: () => true } as any,
      {} as any,
      {} as any,
    );

    const result = await service.adminDetail({ sub: 5 } as any, 17);

    expect(result).not.toHaveProperty('proof_path');
    expect(result).not.toHaveProperty('proof_mime');
    expect(result).toHaveProperty('applicant_gender', 'female');
    expect(result).toHaveProperty('proofUrl', '/api/online-subscriptions/17/proof');
  });

  it('filters the admin queue by the authenticated employee audience on the server', async () => {
    prisma.$queryRawUnsafe.mockResolvedValueOnce([]);
    const scope = {
      resolveListFilter: () => [2],
      memberGenderFilter: () => 'female',
      isBranchAllowed: () => true,
    } as any;
    const service = new OnlineSubscriptionsService(prisma, scope, {} as any, {} as any);

    await service.adminList({ sub: 5, level: 2, branch: 2, man_women_type: 1 } as any);

    expect(String(prisma.$queryRawUnsafe.mock.calls[0][0])).toContain('r.applicant_gender=?');
    expect(prisma.$queryRawUnsafe.mock.calls[0].slice(1)).toEqual([2, 'female']);
  });

  it('blocks detail and proof access for an applicant outside the employee audience', async () => {
    const scope = {
      isBranchAllowed: () => true,
      isMemberGenderAllowed: (_user: unknown, gender: string) => gender === 'female',
    } as any;
    const service = new OnlineSubscriptionsService(prisma, scope, {} as any, {} as any);
    prisma.$queryRawUnsafe.mockResolvedValueOnce([{ id: 17, branch_id: 2, applicant_gender: 'male' }]);
    await expect(service.adminDetail({ sub: 5 } as any, 17)).rejects.toBeInstanceOf(ForbiddenException);

    prisma.$queryRawUnsafe.mockResolvedValueOnce([{ id: 17, branch_id: 2, applicant_gender: 'male', proof_path: 'proof.png' }]);
    await expect(service.adminProof({ sub: 5 } as any, 17)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('persists only server-resolved package, price, branch, payment, and entitlement snapshots', async () => {
    const create = jest.fn().mockResolvedValue({ id: 23 });
    const requestPrisma = { online_subscription_requests: { create } } as any;
    const service = new OnlineSubscriptionsService(requestPrisma, {} as any, {} as any, {} as any);
    jest.spyOn(service, 'publicPackage').mockResolvedValue({
      id: 8, name: 'باقة القوة', price: 555, days: 30, branchId: 4,
      isLinkedToSessions: true, sessionsCount: 12, allowMultipleDailyEntries: true,
    } as any);
    jest.spyOn(service, 'paymentMethods').mockResolvedValue([{ id: 3, name: 'إنستاباي', destination: 'النعماني', account: '01000000000', branchId: 4, type: 'instapay' }]);

    await service.createRequest({
      packageId: 8, branchId: 4, paymentMethodId: 3, fullName: ' منى   أحمد ', phone: '01012345678',
      email: 'member@example.com', gender: 'female', proofPath: 'proof-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png', proofMime: 'image/png', proofSize: 8,
    });

    expect(create).toHaveBeenCalledWith({ data: expect.objectContaining({
      package_id: 8, package_name_snapshot: 'باقة القوة', price_snapshot: 555, branch_id: 4,
      payment_method_id: 3, payment_account_snapshot: '01000000000', applicant_name: 'منى أحمد',
      applicant_gender: 'female',
      is_linked_to_sessions_snapshot: true, sessions_count_snapshot: 12, allow_multiple_daily_entries_snapshot: true,
    }), select: { id: true } });
  });

  it('rejects a public applicant without an explicit male or female selection', async () => {
    const service = new OnlineSubscriptionsService({} as any, {} as any, {} as any, {} as any);

    await expect(service.createRequest({
      packageId: 8, branchId: 4, paymentMethodId: 3, fullName: 'منى أحمد', phone: '01012345678',
      gender: '', proofPath: 'proof-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png', proofMime: 'image/png', proofSize: 8,
    })).rejects.toThrow('اختر القسم رجال أو سيدات');
  });
});
