import { OnlineSubscriptionsService } from './online-subscriptions.service';

const user = { sub: 4, level: 1, branch: 0 } as any;
const request = { id: 17, status: 'submitted', branch_id: 2, applicant_phone: '0101', applicant_name: 'منى', applicant_gender: 'female', package_id: 8, package_name_snapshot: 'شهري', package_days_snapshot: 30, price_snapshot: 500, proof_path: 'proof-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png', promoted_subscription_id: null };
const member = { id: 9, name: 'منى', gender: 'female' };
const unrestrictedScope = { isBranchAllowed: () => true, isMemberGenderAllowed: () => true };

describe('online membership promotion', () => {
  it('creates receipt and journal inside the same transaction before it marks the request promoted', async () => {
    const tx = { $queryRawUnsafe: jest.fn().mockResolvedValueOnce([request]).mockResolvedValueOnce([member]), $executeRawUnsafe: jest.fn().mockResolvedValueOnce(1), club_subscriptions: { create: jest.fn().mockResolvedValue({ id: 77 }) } };
    const receipts = { createForSubscription: jest.fn().mockResolvedValue({ receipt_number: 'R-2026-0000001' }) };
    const accounting = { postJournal: jest.fn().mockResolvedValue(undefined) };
    const prisma = { $transaction: jest.fn(async (work: any) => work(tx)) };
    const service = new OnlineSubscriptionsService(prisma as any, unrestrictedScope as any, receipts as any, accounting as any);

    await expect(service.approveAndPromote(user, 17)).resolves.toMatchObject({ promotedSubscriptionId: 77, idempotent: false });
    expect(receipts.createForSubscription).toHaveBeenCalledWith(77, 500, expect.any(Object), tx);
    expect(accounting.postJournal).toHaveBeenCalledWith(expect.objectContaining({ sourceDocId: 'R-2026-0000001', paymentMethod: 'online' }), tx);
    expect(tx.$executeRawUnsafe).toHaveBeenLastCalledWith(expect.stringContaining("status='approved'"), 77, 4, 17);
  });

  it('returns the previously linked subscription on a double-click without another receipt', async () => {
    const tx = { $queryRawUnsafe: jest.fn().mockResolvedValue([{ ...request, status: 'approved', promoted_subscription_id: 77 }]), $executeRawUnsafe: jest.fn() };
    const receipts = { createForSubscription: jest.fn() };
    const prisma = { $transaction: jest.fn(async (work: any) => work(tx)) };
    const service = new OnlineSubscriptionsService(prisma as any, unrestrictedScope as any, receipts as any, {} as any);

    await expect(service.approveAndPromote(user, 17)).resolves.toMatchObject({ promotedSubscriptionId: 77, idempotent: true });
    expect(receipts.createForSubscription).not.toHaveBeenCalled();
    expect(tx.$executeRawUnsafe).not.toHaveBeenCalled();
  });

  it('bubbles a receipt failure so the encompassing transaction rolls back and never promotes the request', async () => {
    const tx = { $queryRawUnsafe: jest.fn().mockResolvedValueOnce([request]).mockResolvedValueOnce([member]), $executeRawUnsafe: jest.fn(), club_subscriptions: { create: jest.fn().mockResolvedValue({ id: 77 }) } };
    const receipts = { createForSubscription: jest.fn().mockRejectedValue(new Error('receipt failed')) };
    const prisma = { $transaction: jest.fn(async (work: any) => work(tx)) };
    const service = new OnlineSubscriptionsService(prisma as any, unrestrictedScope as any, receipts as any, {} as any);

    await expect(service.approveAndPromote(user, 17)).rejects.toThrow('receipt failed');
    expect(tx.$executeRawUnsafe).not.toHaveBeenCalledWith(expect.stringContaining("status='approved'"), expect.anything(), expect.anything(), expect.anything());
  });

  it('promotes immutable session entitlements into a canonical subscription row', async () => {
    const sessionRequest = {
      ...request,
      is_linked_to_sessions_snapshot: 1,
      sessions_count_snapshot: 12,
      allow_multiple_daily_entries_snapshot: 1,
      payment_account_snapshot: '01000000000',
    };
    const create = jest.fn().mockResolvedValue({ id: 77, registration_date: '2026-09-09' });
    const tx = {
      $queryRawUnsafe: jest.fn().mockResolvedValueOnce([sessionRequest]).mockResolvedValueOnce([member]),
      $executeRawUnsafe: jest.fn().mockResolvedValue(1),
      club_subscriptions: { create },
    };
    const receipts = { createForSubscription: jest.fn().mockResolvedValue({ receipt_number: 'R-2026-0000001' }) };
    const accounting = { postJournal: jest.fn().mockResolvedValue(undefined) };
    const prisma = { $transaction: jest.fn(async (work: any) => work(tx)) };
    const service = new OnlineSubscriptionsService(prisma as any, unrestrictedScope as any, receipts as any, accounting as any);

    await service.approveAndPromote(user, 17);

    expect(create).toHaveBeenCalledWith({ data: expect.objectContaining({
      subscription_type_id: 8,
      is_linked_to_sessions: true,
      sessions_count: 12,
      sessions_used: 0,
      allow_multiple_daily_entries: true,
      paid_amount: 500,
      remaining_amount: 0,
    }) });
    expect(receipts.createForSubscription).toHaveBeenCalledWith(77, 500, expect.any(Object), tx);
    expect(accounting.postJournal).toHaveBeenCalledWith(expect.any(Object), tx);
  });

  it('creates a canonical member for a new applicant only from the submitted gender snapshot', async () => {
    const newApplicant = { ...request, applicant_gender: 'male' };
    const createMember = jest.fn().mockResolvedValue({ id: 31, name: 'منى', gender: 'male', member_code: 'B000031' });
    const tx = {
      $queryRawUnsafe: jest.fn()
        .mockResolvedValueOnce([newApplicant])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ acquired: 1 }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ maxNum: 30 }])
        .mockResolvedValueOnce([{ released: 1 }]),
      $executeRawUnsafe: jest.fn().mockResolvedValue(1),
      club_members: { create: createMember },
      club_subscriptions: { create: jest.fn().mockResolvedValue({ id: 77 }) },
    };
    const receipts = { createForSubscription: jest.fn().mockResolvedValue({ receipt_number: 'R-2026-0000001' }) };
    const prisma = { $transaction: jest.fn(async (work: any) => work(tx)) };
    const service = new OnlineSubscriptionsService(prisma as any, unrestrictedScope as any, receipts as any, { postJournal: jest.fn() } as any);

    await expect(service.approveAndPromote(user, 17)).resolves.toMatchObject({ promotedSubscriptionId: 77 });
    expect(createMember).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ branch_id: 2, gender: 'male', phone: '0101', membership_type_id: null }) }));
  });

  it('stops a new-applicant promotion when the member-code lock is unavailable', async () => {
    const createMember = jest.fn();
    const tx = {
      $queryRawUnsafe: jest.fn()
        .mockResolvedValueOnce([{ ...request, applicant_gender: 'female' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ acquired: 0 }]),
      $executeRawUnsafe: jest.fn(),
      club_members: { create: createMember },
      club_subscriptions: { create: jest.fn() },
    };
    const prisma = { $transaction: jest.fn(async (work: any) => work(tx)) };
    const service = new OnlineSubscriptionsService(prisma as any, unrestrictedScope as any, {} as any, {} as any);

    await expect(service.approveAndPromote(user, 17)).rejects.toThrow('تعذر حجز كود العضو');
    expect(createMember).not.toHaveBeenCalled();
    expect(tx.club_subscriptions.create).not.toHaveBeenCalled();
  });

  it('fails closed for a historic new applicant that has no submitted gender', async () => {
    const createMember = jest.fn();
    const tx = {
      $queryRawUnsafe: jest.fn().mockResolvedValueOnce([{ ...request, applicant_gender: null }]).mockResolvedValueOnce([]),
      $executeRawUnsafe: jest.fn(),
      club_members: { create: createMember },
      club_subscriptions: { create: jest.fn() },
    };
    const prisma = { $transaction: jest.fn(async (work: any) => work(tx)) };
    const service = new OnlineSubscriptionsService(prisma as any, unrestrictedScope as any, {} as any, {} as any);

    await expect(service.approveAndPromote(user, 17)).rejects.toThrow('الطلبات القديمة بدون قسم');
    expect(createMember).not.toHaveBeenCalled();
  });

  it('rejects approval when the applicant audience is outside the reviewer scope', async () => {
    const tx = { $queryRawUnsafe: jest.fn().mockResolvedValueOnce([{ ...request, applicant_gender: 'male' }]), $executeRawUnsafe: jest.fn() };
    const prisma = { $transaction: jest.fn(async (work: any) => work(tx)) };
    const scope = {
      isBranchAllowed: () => true,
      isMemberGenderAllowed: (_user: unknown, gender: string) => gender === 'female',
    };
    const service = new OnlineSubscriptionsService(prisma as any, scope as any, {} as any, {} as any);

    await expect(service.approveAndPromote(user, 17)).rejects.toThrow('القسم');
    expect(tx.$executeRawUnsafe).not.toHaveBeenCalled();
  });

  it('never promotes a request onto an existing member with a different gender', async () => {
    const tx = {
      $queryRawUnsafe: jest.fn().mockResolvedValueOnce([{ ...request, applicant_gender: 'female' }]).mockResolvedValueOnce([{ ...member, gender: 'male' }]),
      $executeRawUnsafe: jest.fn(),
      club_subscriptions: { create: jest.fn() },
    };
    const prisma = { $transaction: jest.fn(async (work: any) => work(tx)) };
    const scope = { isBranchAllowed: () => true, isMemberGenderAllowed: () => true };
    const service = new OnlineSubscriptionsService(prisma as any, scope as any, {} as any, {} as any);

    await expect(service.approveAndPromote(user, 17)).rejects.toThrow('قسم العضو');
    expect(tx.club_subscriptions.create).not.toHaveBeenCalled();
  });
});
