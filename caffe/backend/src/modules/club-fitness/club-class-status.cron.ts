import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { runWithMysqlLock } from '../../common/automation/cron-dedup.util';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ClubClassesService } from './club-classes.service';

@Injectable()
export class ClubClassStatusCron {
  private readonly log = new Logger(ClubClassStatusCron.name);

  constructor(
    private readonly classes: ClubClassesService,
    private readonly prisma: PrismaService,
  ) {}

  /** Every 15 minutes: move scheduled classes to ongoing/completed based on Cairo local time. */
  @Cron('*/15 * * * *')
  async handleStatusTransitions() {
    const ran = await runWithMysqlLock(this.prisma, 'cron:club-class-status', 0, () =>
      this.handleStatusTransitionsLocked(),
    );
    if (ran === null) this.log.debug('Skipped class status cron; another instance holds the lock');
  }

  private async handleStatusTransitionsLocked() {
    const result = await this.classes.advanceStatuses();
    if (result.ongoing + result.completed > 0) {
      this.log.log(`Class statuses updated: ${result.ongoing} ongoing, ${result.completed} completed`);
    }
  }
}
