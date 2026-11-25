import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { MemberPushService } from './member-push.service';
import { CAIRO } from './member-push.util';

/** Every minute: send the due push schedules. Off when DISABLE_SCHEDULED_TASKS=true (ScheduleModule). */
@Injectable()
export class MemberPushCron {
  private readonly log = new Logger(MemberPushCron.name);

  constructor(private readonly service: MemberPushService) {}

  @Cron('* * * * *', { timeZone: CAIRO })
  async tick() {
    try {
      const ran = await this.service.runDue();
      if (ran === null) this.log.debug('push schedules: another instance holds the lock');
    } catch (err) {
      this.log.error(`push schedules failed: ${err instanceof Error ? err.message : err}`);
    }
  }
}
