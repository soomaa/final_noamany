import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { runWithMysqlLock } from '../../common/automation/cron-dedup.util';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AutomationEngineService } from '../gym-ops/automation-engine.service';
import { ClubSubscriptionsService } from './club-subscriptions.service';

@Injectable()
export class ClubSubscriptionStatusCron {
  private readonly log = new Logger(ClubSubscriptionStatusCron.name);

  constructor(
    private readonly subscriptions: ClubSubscriptionsService,
    private readonly automation: AutomationEngineService,
    private readonly prisma: PrismaService,
  ) {}

  @Cron('0 2 * * *', { timeZone: 'Africa/Cairo' })
  async handleExpired() {
    const ran = await runWithMysqlLock(this.prisma, 'cron:club-subscription-status', 0, () =>
      this.handleExpiredLocked(),
    );
    if (ran === null) this.log.debug('Skipped subscription status cron; another instance holds the lock');
  }

  private async handleExpiredLocked() {
    const expiredSubs = await this.subscriptions.findNewlyExpired();
    const count = await this.subscriptions.updateExpiredStatuses();
    if (count > 0) this.log.log(`Marked ${count} subscriptions as expired`);

    for (const sub of expiredSubs) {
      if (!sub.member_id) continue;
      void this.automation.emit('subscription_expired', {
        memberId: sub.member_id,
        subscriptionId: sub.id,
        branchId: sub.branch_id,
        memberName: sub.customer_name ?? '—',
        subscriptionNumber: sub.subscription_number,
        daysOffset: 0,
      });
    }
  }
}
