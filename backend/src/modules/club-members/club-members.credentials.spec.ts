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

  it('uses the member phone as the initial app password', () => {
    expect((service as any).defaultAppPassword('01012345678')).toBe('01012345678');
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
