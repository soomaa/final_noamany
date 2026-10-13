import { PrismaService } from '../../common/prisma/prisma.service';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { BusinessAuditService } from '../gym-ops/business-audit.service';
import { AutomationEngineService } from '../gym-ops/automation-engine.service';
import { PermissionEngineService } from '../rbac/engine/permission-engine.service';
import { ClubDiscountCodesService } from './club-discount-codes.service';
import { ClubSubscriptionAccountingService } from './club-subscription-accounting.service';
import { ClubReceiptsService } from './club-receipts.service';
import { ClubSubscriptionsService } from './club-subscriptions.service';
import { localDateString } from '../club-members/club-member.utils';

describe('ClubSubscriptionsService.expiredReport', () => {
  it('filters expired subscriptions in the database before loading report rows', async () => {
    const prisma = {
      club_subscriptions: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(41),
      },
    };
    const branchScope = {
      resolveListFilter: jest.fn().mockReturnValue(null),
      memberGenderFilter: jest.fn().mockReturnValue(null),
    };
    const service = new ClubSubscriptionsService(
      prisma as unknown as PrismaService,
      {} as ClubReceiptsService,
      {} as ClubSubscriptionAccountingService,
      {} as BusinessAuditService,
      {} as AutomationEngineService,
      branchScope as unknown as BranchScopeService,
      {} as PermissionEngineService,
      {} as ClubDiscountCodesService,
      {} as never,
    );

    const result = await service.expiredReport({ search: 'سارة', page: '2', pageSize: '20' } as any);

    expect(result).toEqual({ data: [], count: 41, page: 2, pageSize: 20 });

    expect(prisma.club_subscriptions.findMany).toHaveBeenCalledWith({
      where: {
        AND: expect.arrayContaining([
          { subscription_end_date: { lt: localDateString() } },
          {
            OR: [
              { customer_name: { contains: 'سارة' } },
              { subscription_number: { contains: 'سارة' } },
            ],
          },
        ]),
      },
      orderBy: { subscription_end_date: 'desc' },
      skip: 20,
      take: 20,
    });
  });
});
