import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { runWithMysqlLock } from '../../common/automation/cron-dedup.util';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AttendanceExceptionsRemindersService } from './attendance-exceptions.reminders';

/** Manager reminder: 10:00 and 18:00 Cairo time (a repeat goes out only when the count changed). */
export const MANAGER_REMINDER_CRON = '0 10,18 * * *';
/** HR escalation of cases open 2+ days: once a day, 11:00 Cairo time. */
export const HR_ESCALATION_CRON = '0 11 * * *';
const TIME_ZONE = 'Africa/Cairo';

@Injectable()
export class AttendanceExceptionsCron {
  private readonly log = new Logger(AttendanceExceptionsCron.name);

  constructor(
    private readonly reminders: AttendanceExceptionsRemindersService,
    private readonly prisma: PrismaService,
  ) {}

  @Cron(MANAGER_REMINDER_CRON, { timeZone: TIME_ZONE })
  async managerReminder() {
    await this.run('cron:attendance-exceptions-manager-reminder', () => this.reminders.remindManagers());
  }

  @Cron(HR_ESCALATION_CRON, { timeZone: TIME_ZONE })
  async hrEscalation() {
    await this.run('cron:attendance-exceptions-hr-escalation', () => this.reminders.escalateToHr());
  }

  /** One instance at a time (MySQL lock); a failure is logged, never thrown into the scheduler. */
  private async run(key: string, job: () => Promise<unknown>) {
    try {
      const ran = await runWithMysqlLock(this.prisma, key, 0, job);
      if (ran === null) this.log.debug(`Skipped ${key}; another instance holds the lock`);
    } catch (error) {
      this.log.error(`${key} failed: ${(error as Error).message}`);
    }
  }
}
