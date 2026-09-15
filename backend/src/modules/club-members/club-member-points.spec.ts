import { ClubMembersService } from './club-members.service';

describe('ClubMembersService point history', () => {
  const prisma = {
    club_members: { findFirst: jest.fn() },
    club_member_point_transactions: { findMany: jest.fn(), create: jest.fn() },
  };
  const service = new ClubMembersService(prisma as never, {} as never, {
    isBranchAllowed: jest.fn(() => true),
    resolveListFilter: jest.fn(() => null),
    memberGenderFilter: jest.fn(() => null),
    isMemberGenderAllowed: jest.fn(() => true),
  } as never, {} as never, {} as never);

  beforeEach(() => jest.clearAllMocks());

  it('returns an immutable ledger and computed current balance for an accessible member', async () => {
    prisma.club_members.findFirst.mockResolvedValue({ id: 7, branch_id: 2, gender: 'male' });
    prisma.club_member_point_transactions.findMany.mockResolvedValue([
      { id: 2, transaction_type: 'redeem', points: -30, action_name: 'استبدال', occurred_at: new Date('2026-09-02') },
      { id: 1, transaction_type: 'earn', points: 50, action_name: 'اشتراك', occurred_at: new Date('2026-09-01') },
    ]);

    await expect(service.pointHistory(7, { level: 3, branch: 2, man_women_type: 0 } as never))
      .resolves.toMatchObject({ memberId: 7, balance: 20, transactions: [{ points: -30 }, { points: 50 }] });
  });

  it('records an integer manual adjustment from a system administrator', async () => {
    prisma.club_members.findFirst.mockResolvedValue({ id: 7, branch_id: 2, gender: 'male' });
    prisma.club_member_point_transactions.create.mockResolvedValue({ id: 9, points: -10, transaction_type: 'manual_adjustment', action_name: 'تصحيح إداري', occurred_at: new Date() });

    await service.adjustPoints(7, { points: -10, reason: 'تصحيح إداري' }, { sub: 44, level: 1, branch: 2, man_women_type: 2 } as never);

    expect(prisma.club_member_point_transactions.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ member_id: 7, source_member_id: 7, points: -10, created_by: 44, action_name: 'تصحيح إداري' }),
    }));
  });

  it('rejects manual adjustment by a non-system administrator even when called outside the controller', async () => {
    await expect(service.adjustPoints(
      7,
      { points: 10, reason: 'تصحيح' },
      { sub: 44, level: 3, branch: 2, man_women_type: 0 } as never,
    )).rejects.toThrow('هذا الإجراء متاح لمدير النظام فقط');
    expect(prisma.club_member_point_transactions.create).not.toHaveBeenCalled();
  });

  it('rejects fractional point movements instead of silently truncating them', async () => {
    prisma.club_members.findFirst.mockResolvedValue({ id: 7, branch_id: 2, gender: 'male' });
    await expect(service.adjustPoints(
      7,
      { points: 1.5, reason: 'تصحيح' },
      { sub: 44, level: 1, branch: 2, man_women_type: 2 } as never,
    )).rejects.toThrow('قيمة التعديل يجب أن تكون عددًا صحيحًا غير صفري');
    expect(prisma.club_member_point_transactions.create).not.toHaveBeenCalled();
  });
});
