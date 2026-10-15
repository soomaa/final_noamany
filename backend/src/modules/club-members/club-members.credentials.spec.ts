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
  );

  it('uses the documented first-login password', () => {
    const first = (service as any).defaultAppPassword();
    const second = (service as any).defaultAppPassword();

    expect(first).toBe('000000');
    expect(second).toBe('000000');
  });

  it('always creates an app account for a phone-backed member even when an old client opts out', () => {
    expect((service as any).shouldCreateAppAccount({
      phone: '01000000000',
      autoCreateUser: false,
      cardNumber: '29801010101234-C01',
    })).toBe(true);
  });

  it('creates a dedicated app identity instead of reusing a global phone match', async () => {
    const tx = {
      api_users: {
        create: jest.fn().mockResolvedValue({ user_id: 88 }),
      },
    };

    await expect((service as any).provisionAppUser(tx, {
      name: 'عضو فرع ب',
      phone: '01000000000',
    })).resolves.toEqual(expect.objectContaining({ appUserId: 88, plaintextPassword: '000000' }));
    expect(tx.api_users.create).toHaveBeenCalledTimes(1);
  });
});
