import { ClubReceptionInvitationsService } from './club-reception-invitations.service';
import { localDateString } from './club-member.utils';

function fixture({ allowed = 3, used = 1 } = {}) {
  const today = localDateString();
  const sub = {
    id: 20, member_id: 10, branch_id: 2, status: 'active',
    subscription_start_date: '2020-01-01', subscription_end_date: '2099-01-01',
    type: { invitations_count: allowed },
  };
  const prisma: any = {
    $queryRaw: jest.fn(),
    $transaction: jest.fn(),
    club_members: { findUnique: jest.fn().mockResolvedValue({ id: 10, name: 'Member', branch_id: 2, gender: 'male' }) },
    club_subscriptions: { findUnique: jest.fn().mockResolvedValue(sub), findMany: jest.fn().mockResolvedValue([sub]) },
    am_invitations: {
      count: jest.fn().mockResolvedValue(used),
      findFirst: jest.fn().mockResolvedValue({ id: 41 }),
      create: jest.fn(async ({ data }) => ({ id: 42, ...data })),
    },
  };
  prisma.$transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback(prisma));
  const branchScope = {
    isMemberGenderAllowed: jest.fn().mockReturnValue(true),
    assertBranchAllowed: jest.fn(),
  };
  const service = new ClubReceptionInvitationsService(prisma as never, branchScope as never);
  return { service, prisma, sub, branchScope, today };
}

const user = { sub: 7, level: 2, branch: 2 } as never;
const body = { memberId: 10, subscriptionId: 20, guestName: '  Guest Name ', guestPhone: '01012345678' };

describe('reception guest invitations', () => {
  it('reports the remaining invitations of each current subscription, not counting rejected ones', async () => {
    const { service, prisma } = fixture({ allowed: 12, used: 5 });
    const result = await service.summary(10, user);
    expect(result.subscriptions).toEqual([{ subscriptionId: 20, allowed: 12, used: 5, remaining: 7, activeToday: true }]);
    expect(prisma.am_invitations.count).toHaveBeenCalledWith({ where: expect.objectContaining({
      inviter_member_id: 10, status: { not: 'rejected' },
    }) });
  });

  it('records the guest against the locked subscription and returns what is left', async () => {
    const { service, prisma } = fixture({ allowed: 3, used: 1 });
    const result = await service.create(body, user);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(prisma.am_invitations.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      invitation_code: 'INV000042', recipient_name: 'Guest Name', recipient_phone: '01012345678',
      inviter_member_id: 10, branch_id: 2, status: 'attended', accepted_by_user_id: 7,
    }) });
    expect(result).toMatchObject({ remaining: 1, allowed: 3, status: 'attended' });
  });

  it('records an accepted invitation without a visit when the guest is not here yet', async () => {
    const { service, prisma } = fixture();
    await service.create({ ...body, guestHere: false }, user);
    expect(prisma.am_invitations.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      status: 'accepted', attendance_date: null,
    }) });
  });

  it('refuses when no invitations are left', async () => {
    const { service, prisma } = fixture({ allowed: 2, used: 2 });
    await expect(service.create(body, user)).rejects.toThrow('لا توجد دعوات متبقية');
    expect(prisma.am_invitations.create).not.toHaveBeenCalled();
  });

  it('refuses a plan without invitations', async () => {
    const { service, prisma } = fixture({ allowed: 0, used: 0 });
    await expect(service.create(body, user)).rejects.toThrow('لا يشمل دعوات');
    expect(prisma.am_invitations.create).not.toHaveBeenCalled();
  });

  it("refuses another member's subscription", async () => {
    const { service, prisma, sub } = fixture();
    sub.member_id = 99;
    await expect(service.create(body, user)).rejects.toThrow('غير متاح');
    expect(prisma.am_invitations.create).not.toHaveBeenCalled();
  });

  it('refuses a subscription that is not active today', async () => {
    const { service, prisma, sub } = fixture();
    sub.status = 'frozen';
    await expect(service.create(body, user)).rejects.toThrow('غير نشط');
    expect(prisma.am_invitations.create).not.toHaveBeenCalled();
  });

  it('refuses an invalid guest phone before touching the subscription', async () => {
    const { service, prisma } = fixture();
    await expect(service.create({ ...body, guestPhone: '12' }, user)).rejects.toThrow();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('refuses a subscription from a branch the user cannot serve', async () => {
    const { service, prisma, branchScope } = fixture();
    branchScope.assertBranchAllowed.mockImplementation(() => { throw new Error('لا تملك صلاحية'); });
    await expect(service.create(body, user)).rejects.toThrow('صلاحية');
    expect(prisma.am_invitations.create).not.toHaveBeenCalled();
  });
});
