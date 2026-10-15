import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { runWithMysqlLock } from '../../common/automation/cron-dedup.util';
import { PrismaService } from '../../common/prisma/prisma.service';
import { LeavesService } from '../leaves/leaves.service';

@Injectable()
export class LeavesCron {
  private readonly log = new Logger(LeavesCron.name);

  constructor(
    private readonly leaves: LeavesService,
    private readonly prisma: PrismaService,
  ) {}

  /** Jan 1 02:00 — roll annual leave balances into vacation_previous_balance. */
  @Cron('0 2 1 1 *', { timeZone: 'Africa/Cairo' })
  async yearEndCarryOver() {
    const ran = await runWithMysqlLock(this.prisma, 'cron:leaves-year-end-carry-over', 0, () =>
      this.yearEndCarryOverLocked(),
    );
    if (ran === null) this.log.debug('Skipped leave carry-over; another instance holds the lock');
  }

  private async yearEndCarryOverLocked() {
    const year = new Date().getFullYear();
    const result = await this.leaves.carryOver(year);
    this.log.log(`Leave carry-over ${year}: processed=${result.processed}`);
  }
}
