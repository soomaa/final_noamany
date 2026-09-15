import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { runWithMysqlLock } from '../../common/automation/cron-dedup.util';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AutomationEngineService } from './automation-engine.service';

@Injectable()
export class AutomationCron {
  private readonly log = new Logger(AutomationCron.name);

  constructor(
    private readonly engine: AutomationEngineService,
    private readonly prisma: PrismaService,
  ) {}

  /** Every 15 minutes — expiry follow-ups, outstanding tasks. */
  @Cron('*/15 * * * *', { timeZone: 'Africa/Cairo' })
  async handleScheduledAutomation() {
    const ran = await runWithMysqlLock(this.prisma, 'cron:gym-ops-automation', 0, () =>
      this.handleScheduledAutomationLocked(),
    );
    if (ran === null) this.log.debug('Skipped automation cron; another instance holds the lock');
  }

  private async handleScheduledAutomationLocked() {
    const result = await this.engine.processScheduledTriggers();
    if (result.expired + result.expiring + result.outstanding > 0) {
      this.log.log(
        `Automation: expired=${result.expired} expiring=${result.expiring} outstanding=${result.outstanding}`,
      );
    }
  }
}
