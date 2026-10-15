import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { runWithMysqlLock } from '../../common/automation/cron-dedup.util';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ClubAttendanceService } from './club-attendance.service';

@Injectable()
export class ClubAttendanceCron {
  private readonly logger = new Logger(ClubAttendanceCron.name);

  constructor(
    private readonly attendance: ClubAttendanceService,
    private readonly prisma: PrismaService,
  ) {}

  @Cron('0 * * * *', { timeZone: 'Africa/Cairo' })
  async autoCheckoutStale() {
    const ran = await runWithMysqlLock(this.prisma, 'cron:club-attendance-auto-checkout', 0, () =>
      this.autoCheckoutStaleLocked(),
    );
    if (ran === null) this.logger.debug('Skipped club attendance auto-checkout; another instance holds the lock');
  }

  private async autoCheckoutStaleLocked() {
    const result = await this.attendance.autoCheckoutStale();
    if (result.checkedOut > 0) {
      this.logger.log(`Auto check-out: ${result.checkedOut} stale visit(s)`);
    }
  }
}
