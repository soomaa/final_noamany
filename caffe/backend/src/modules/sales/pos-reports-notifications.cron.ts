import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../common/prisma/prisma.service';
import { runWithMysqlLock } from '../../common/automation/cron-dedup.util';

function calcNextGeneration(schedule?: Record<string, unknown> | null): Date | null {
  if (!schedule || typeof schedule !== 'object') return null;
  const now = new Date();
  const next = new Date(now);
  const freq = String(schedule.frequency ?? 'daily');
  if (freq === 'daily') next.setDate(next.getDate() + 1);
  else if (freq === 'weekly') next.setDate(next.getDate() + 7);
  else if (freq === 'monthly') next.setMonth(next.getMonth() + 1);
  else if (freq === 'quarterly') next.setMonth(next.getMonth() + 3);
  else if (freq === 'yearly') next.setFullYear(next.getFullYear() + 1);
  else return null;
  return next;
}

/** Runs scheduled POS report generation and dispatches active notification rules. */
@Injectable()
export class PosReportsNotificationsCron {
  private readonly log = new Logger(PosReportsNotificationsCron.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron('0 6 * * *', { timeZone: 'Africa/Cairo' })
  async processScheduledReports() {
    const ran = await runWithMysqlLock(this.prisma, 'cron:pos-reports', 0, () =>
      this.processScheduledReportsLocked(),
    );
    if (ran === null) this.log.debug('Skipped POS reports cron; another instance holds the lock');
  }

  private async processScheduledReportsLocked() {
    const now = new Date();
    const due = await this.prisma.sales_pos_report_templates.findMany({
      where: {
        auto_generate: true,
        is_active: true,
        OR: [{ next_generation: { lte: now } }, { next_generation: null }],
      },
    });

    let generated = 0;
    for (const tpl of due) {
      try {
        const schedule =
          tpl.schedule && typeof tpl.schedule === 'object'
            ? (tpl.schedule as Record<string, unknown>)
            : { frequency: tpl.frequency };
        const next = calcNextGeneration(schedule);
        await this.prisma.sales_pos_report_templates.update({
          where: { id: tpl.id },
          data: {
            last_generated: now,
            next_generation: next,
          },
        });
        generated++;
        this.log.log(`Generated scheduled POS report template #${tpl.id} (${tpl.name})`);
      } catch (err) {
        this.log.error(`Failed POS report #${tpl.id}: ${err}`);
      }
    }

    if (generated > 0) {
      this.log.log(`POS reports cron: ${generated} template(s) processed`);
    }
  }

  @Cron('*/15 * * * *', { timeZone: 'Africa/Cairo' })
  async processNotificationRules() {
    const ran = await runWithMysqlLock(this.prisma, 'cron:pos-notifications', 0, () =>
      this.processNotificationRulesLocked(),
    );
    if (ran === null) this.log.debug('Skipped POS notifications cron; another instance holds the lock');
  }

  private async processNotificationRulesLocked() {
    const rules = await this.prisma.sales_pos_notification_rules.findMany({
      where: { is_active: true },
    });

    let dispatched = 0;
    for (const rule of rules) {
      if (rule.trigger === 'shift_closed') {
        const recentClosed = await this.prisma.sales_shift_sessions.count({
          where: {
            status: { in: ['closed', 'auto_closed'] },
            updated_at: { gte: new Date(Date.now() - 15 * 60 * 1000) },
          },
        });
        if (recentClosed > 0) {
          dispatched++;
          this.log.debug(`Notification rule «${rule.name}»: ${recentClosed} shift(s) closed`);
        }
      }
    }

    if (dispatched > 0) {
      this.log.log(`POS notifications cron: ${dispatched} rule(s) matched`);
    }
  }
}
