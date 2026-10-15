import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../common/prisma/prisma.service';
import { MemberJwtUser } from '../../common/types/member-jwt-user';
import { MemberAuthService } from './member-auth.service';

/**
 * One person, one `club_members` row + one `api_users` account per branch. Real JWTs
 * (not mocks) so the selection token's type/expiry checks are exercised for real.
 */
describe('MemberAuthService — members enrolled in several branches', () => {
  const active = (branch_id: number) => [{
    branch_id, subscription_start_date: '2000-01-01', subscription_end_date: '2099-12-31',
    status: 'active', is_linked_to_sessions: false, sessions_count: null, sessions_used: 0,
  }];
  const expired = (branch_id: number) => [{
    branch_id, subscription_start_date: '2000-01-01', subscription_end_date: '2000-02-01',
    status: 'active', is_linked_to_sessions: false, sessions_count: null, sessions_used: 0,
  }];

  let hashes: Record<number, string>;
  const memberA = { id: 45, app_user_id: 12, branch_id: 1, member_code: 'A000045', name: 'عضو', phone: '01000000000', subscriptions: expired(1) };
  const memberB = { id: 46, app_user_id: 13, branch_id: 2, member_code: 'B000046', name: 'عضو', phone: '01000000000', subscriptions: active(2) };
  const members = [memberA, memberB];

  const prisma = {
    club_members: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    api_users: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
    tbl_branches: { findMany: jest.fn() },
    club_branch_profiles: { findMany: jest.fn() },
  };
  const config = {
    get: jest.fn((key: string) =>
      ({ 'jwt.accessSecret': 'access-secret', 'jwt.refreshSecret': 'refresh-secret', 'jwt.accessTtl': '15m', 'jwt.refreshTtl': '7d', bcryptRounds: 4 } as Record<string, unknown>)[key]),
  };
  const jwt = new JwtService({});
  const service = new MemberAuthService(
    prisma as unknown as PrismaService,
    jwt,
    config as unknown as ConfigService,
  );
  const appUser = (user_id: number) => ({ user_id, status: 1, user_name: 'عضو', user_phone: '01000000000', user_pass: hashes[user_id] });

  beforeAll(async () => {
    hashes = { 12: await bcrypt.hash('shared-pass', 4), 13: await bcrypt.hash('shared-pass', 4) };
  });

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.club_members.findMany.mockImplementation(async (args: { where: { id?: { in: number[] }; branch_id?: number } }) =>
      members.filter((m) =>
        (args.where.id ? args.where.id.in.includes(m.id) : true) &&
        (args.where.branch_id != null ? m.branch_id === args.where.branch_id : true)));
    prisma.club_members.findFirst.mockImplementation(async (args: { where: { id: number } }) =>
      members.find((m) => m.id === args.where.id) ?? null);
    prisma.api_users.findMany.mockImplementation(async (args: { where: { user_id: { in: number[] } } }) =>
      args.where.user_id.in.map(appUser));
    prisma.api_users.findUnique.mockImplementation(async (args: { where: { user_id: number } }) => appUser(args.where.user_id));
    prisma.tbl_branches.findMany.mockResolvedValue([
      { branch_id: 1, branch_name: 'فرع A1' },
      { branch_id: 2, branch_name: 'فرع B2' },
    ]);
    prisma.club_branch_profiles.findMany.mockResolvedValue([{ branch_id: 2, display_name: 'ONE80 كلوب' }]);
  });

  it('asks which branch instead of guessing when the password opens several', async () => {
    const result = await service.login('01000000000', 'shared-pass');
    expect(result.requiresBranchSelection).toBe(true);
    if (!result.requiresBranchSelection) throw new Error('expected picker');
    expect(result).not.toHaveProperty('accessToken');
    // The branch usable today comes first; profile display names win over the operational name.
    expect(result.branches).toEqual([
      expect.objectContaining({ memberId: 46, branchId: 2, branchName: 'ONE80 كلوب', memberCode: 'B000046', standing: 'active' }),
      expect.objectContaining({ memberId: 45, branchId: 1, branchName: 'فرع A1', memberCode: 'A000045', standing: 'expired' }),
    ]);
  });

  it('exchanges the choice for a session bound to that branch, remembering both', async () => {
    const picker = await service.login('01000000000', 'shared-pass');
    if (!picker.requiresBranchSelection) throw new Error('expected picker');
    const session = await service.selectBranch(picker.selectionToken, 45);
    expect(session.user).toMatchObject({ sub: 12, memberId: 45, branchId: 1, memberCode: 'A000045', linkedMemberIds: [45, 46] });
    const refresh = await jwt.verifyAsync(session.refreshToken, { secret: 'refresh-secret' });
    expect(refresh).toMatchObject({ memberId: 45, branchId: 1, linkedMemberIds: [45, 46] });
  });

  it('never offers a branch whose own account has a different password', async () => {
    hashes[12] = await bcrypt.hash('another-pass', 4);
    try {
      const result = await service.login('01000000000', 'shared-pass');
      expect(result.requiresBranchSelection).toBeFalsy();
      if (result.requiresBranchSelection) throw new Error('unexpected picker');
      expect(result.user).toMatchObject({ memberId: 46, branchId: 2 });
      expect(result.user.linkedMemberIds).toBeUndefined();
    } finally {
      hashes[12] = await bcrypt.hash('shared-pass', 4);
    }
  });

  it('rejects a wrong password on every branch', async () => {
    await expect(service.login('01000000000', 'nope')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('refuses a selection token for a membership it was not issued for, or a forged/other token', async () => {
    const picker = await service.login('01000000000', 'shared-pass');
    if (!picker.requiresBranchSelection) throw new Error('expected picker');
    await expect(service.selectBranch(picker.selectionToken, 999)).rejects.toBeInstanceOf(UnauthorizedException);
    const session = await service.selectBranch(picker.selectionToken, 46);
    // A refresh token is signed with the same secret but is not a selection token.
    await expect(service.selectBranch(session.refreshToken, 46)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(service.selectBranch('garbage', 46)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('switches branch in-app only within the memberships proved at login', async () => {
    const user: MemberJwtUser = { sub: 13, memberId: 46, branchId: 2, memberCode: 'B000046', phone: '01000000000', name: 'عضو', type: 'member', linkedMemberIds: [45, 46] };
    const switched = await service.switchBranch(user, 45);
    expect(switched.user).toMatchObject({ memberId: 45, branchId: 1, linkedMemberIds: [45, 46] });
    await expect(service.switchBranch({ ...user, linkedMemberIds: undefined }, 45)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('re-validates the target at switch time', async () => {
    prisma.club_members.findFirst.mockResolvedValueOnce(null);
    const user: MemberJwtUser = { sub: 13, memberId: 46, branchId: 2, memberCode: 'B000046', phone: '01000000000', name: 'عضو', type: 'member', linkedMemberIds: [45, 46] };
    await expect(service.switchBranch(user, 45)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('lists the branches for the switcher and marks the current one', async () => {
    const user: MemberJwtUser = { sub: 13, memberId: 46, branchId: 2, memberCode: 'B000046', phone: '01000000000', name: 'عضو', type: 'member', linkedMemberIds: [45, 46] };
    const branches = await service.listBranches(user);
    expect(branches.map((b) => [b.memberId, b.current])).toEqual([[46, true], [45, false]]);
  });

  it('keeps one password across the linked branch accounts', async () => {
    await service.changePassword(13, 'shared-pass', 'new-pass-123', [45, 46]);
    expect(prisma.api_users.updateMany).toHaveBeenCalledWith({
      where: { user_id: { in: [13, 12] }, status: 1 },
      data: { user_pass: expect.any(String) },
    });
  });

  it('still signs a single-branch member straight in', async () => {
    const result = await service.login('01000000000', 'shared-pass', 2);
    if (result.requiresBranchSelection) throw new Error('unexpected picker');
    expect(result.user).toMatchObject({ memberId: 46, branchId: 2 });
  });
});
