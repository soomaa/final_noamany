import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { runWithMysqlLock } from '../../common/automation/cron-dedup.util';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ClubLockersService } from './club-lockers.service';

@Injectable()
export class ClubLockerStatusCron {
  private readonly log = new Logger(ClubLockerStatusCron.name);

  constructor(
    private readonly lockers: ClubLockersService,
    private readonly prisma: PrismaService,
  ) {}

  @Cron('30 2 * * *', { timeZone: 'Africa/Cairo' })
  async handleExpiry() {
    const ran = await runWithMysqlLock(this.prisma, 'cron:club-locker-status', 0, () =>
      this.handleExpiryLocked(),
    );
    if (ran === null) this.log.debug('Skipped locker status cron; another instance holds the lock');
  }

  private async handleExpiryLocked() {
    const result = await this.lockers.expireAndReleaseLockers();
    if (result.subs > 0) this.log.log(`Released ${result.lockers} lockers from ${result.subs} expired subs`);
    const handoffs = await this.lockers.releaseStaleHandoffs();
    if (handoffs > 0) this.log.log(`Released ${handoffs} locker handoffs left open from a previous day`);
  }
}
