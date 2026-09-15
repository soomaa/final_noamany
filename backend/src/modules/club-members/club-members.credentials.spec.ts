import { ConflictException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { BusinessAuditService } from '../gym-ops/business-audit.service';
import { ClubSubscriptionRefundsService } from '../club-subscriptions/club-subscription-refunds.service';
import { ClubMembersService } from './club-members.service';

describe('ClubMembersService app credentials', () => {
  const service = new ClubMembersService(
    {} as PrismaService,
    {} as BusinessAuditService,
    {} as BranchScopeService,
    {} as ClubSubscriptionRefundsService,
    {} as never,
  );

  it('generates a unique password instead of the shared legacy default', () => {
    const first = (service as any).defaultAppPassword();
    const second = (service as any).defaultAppPassword();

    expect(first).not.toBe('000000');
    expect(second).not.toBe('000000');
    expect(first).not.toBe(second);
    expect(first.length).toBeGreaterThanOrEqual(12);
  });

  it('does not attach an existing orphan login to a newly created member', async () => {
    const tx = {
      api_users: {
        findFirst: jest.fn().mockResolvedValue({ user_id: 77 }),
      },
      club_members: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };

    await expect(
      (service as any).provisionAppUser(tx, { phone: '01000000000' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
