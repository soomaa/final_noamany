import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { runWithMysqlLock } from '../../common/automation/cron-dedup.util';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtUser } from '../../common/types/jwt-user';
import { localDateString } from '../club-members/club-member.utils';
import { CreateWaCampaignDto, WaBirthdaySettingsDto } from './dto/wa-campaigns.dto';
import {
  BirthdaySettings,
  DEFAULT_BIRTHDAY_TEMPLATE,
  DEFAULT_BIRTHDAY_TEMPLATE_NAME,
  readBirthdaySettings,
  writeBirthdaySettings,
} from './wa-birthdays.settings';
import { WaCampaignsService } from './wa-campaigns.service';

const CAIRO = 'Africa/Cairo';
const LOCK = 'cron:wa-birthdays';

/** HH:MM now in Cairo. */
export function cairoClock(now = new Date()): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: CAIRO, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now);
}

/**
 * Birthday greetings: every day at the configured Cairo time, one running campaign per branch
 * that has a paired sending device. The extension sends it whenever it is open, inside the
 * Gymora limits and sending hours.
 */
@Injectable()
export class WaBirthdaysService {
  private readonly log = new Logger(WaBirthdaysService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly campaigns: WaCampaignsService,
  ) {}

  /** Checked every 5 minutes so the time can change without a restart; off when DISABLE_SCHEDULED_TASKS=true. */
  @Cron('*/5 * * * *', { timeZone: CAIRO })
  async tick() {
    try {
      await this.expirePastGreetings();
      const settings = await readBirthdaySettings(this.prisma);
      if (!settings.enabled || cairoClock() < settings.time) return;
      await this.runToday('auto');
    } catch (err) {
      this.log.error(`birthday greetings failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  async settings(user: JwtUser) {
    let settings = await readBirthdaySettings(this.prisma);
    if (!settings.templateId || !(await this.prisma.wa_templates.findUnique({ where: { id: settings.templateId }, select: { id: true } }))) {
      settings = (await runWithMysqlLock(this.prisma, LOCK, 10, async () => this.ensureTemplate(await readBirthdaySettings(this.prisma), user.sub))) ?? settings;
    }
    const today = localDateString();
    const [template, devices, recent] = await Promise.all([
      settings.templateId ? this.prisma.wa_templates.findUnique({ where: { id: settings.templateId } }) : null,
      this.pairedBranches(),
      this.prisma.wa_campaigns.findMany({ where: { source: 'birthdays', created_at: { gte: new Date(Date.now() - 36 * 3600_000) } }, select: { id: true, branch_id: true, name: true, status: true, created_at: true } }),
    ]);
    const todays = recent.filter((c) => localDateString(c.created_at) === today);
    return {
      enabled: settings.enabled,
      time: settings.time,
      activeOnly: settings.activeOnly,
      template: template ? { id: template.id, name: template.name, body: template.body } : null,
      pairedBranchIds: devices,
      today,
      ranToday: Object.entries(settings.runs).filter(([, day]) => day === today).map(([branchId]) => Number(branchId)),
      todaysCampaigns: todays.map((c) => ({ id: c.id, branchId: c.branch_id, name: c.name, status: c.status })),
    };
  }

  async updateSettings(dto: WaBirthdaySettingsDto, user: JwtUser) {
    return runWithMysqlLock(this.prisma, LOCK, 10, async () => {
      const settings = await readBirthdaySettings(this.prisma);
      if (dto.templateId !== undefined) {
        const template = await this.prisma.wa_templates.findUnique({ where: { id: dto.templateId } });
        if (!template) throw new BadRequestException('القالب غير موجود');
        settings.templateId = template.id;
      }
      if (dto.enabled !== undefined) settings.enabled = dto.enabled;
      if (dto.time !== undefined) settings.time = dto.time;
      if (dto.activeOnly !== undefined) settings.activeOnly = dto.activeOnly;
      await writeBirthdaySettings(this.prisma, settings);
      return true;
    }).then(async (done) => {
      if (done === null) throw new BadRequestException('في عملية تانية شغالة على أعياد الميلاد — جرّب كمان شوية');
      return this.settings(user);
    });
  }

  /**
   * Queue today's greetings for every branch with a paired device that hasn't had them yet.
   * Serialised by a MySQL lock and recorded per branch per Cairo day, so restarts, several
   * processes and the «ابعت دلوقتي» button never queue a branch twice in one day.
   */
  async runToday(trigger: 'auto' | 'manual', userId: number | null = null) {
    const result = await runWithMysqlLock(this.prisma, LOCK, trigger === 'auto' ? 0 : 10, async () => {
      const today = localDateString();
      const settings = await this.ensureTemplate(await readBirthdaySettings(this.prisma), userId);
      const template = await this.prisma.wa_templates.findUnique({ where: { id: settings.templateId! } });
      const done: { branchId: number; campaignId: number | null; queued: number; skipped: number }[] = [];
      for (const branchId of await this.pairedBranches()) {
        if (settings.runs[String(branchId)] === today) continue;
        const dto = {
          branchId,
          source: 'birthdays',
          activeOnly: settings.activeOnly,
          body: template!.body,
          name: `تهنئة أعياد الميلاد ${today}`,
          templateId: template!.id,
          start: true,
          auto: trigger === 'auto',
          day: today,
        } as CreateWaCampaignDto;
        const created = await this.campaigns.createSystemCampaign(dto);
        settings.runs[String(branchId)] = today;
        // Saved after each branch: a failure later in the loop never re-queues this one.
        await writeBirthdaySettings(this.prisma, settings);
        done.push({ branchId, campaignId: created.id, queued: created.queued, skipped: created.skipped });
      }
      if (done.length) this.log.log(`birthday greetings ${today} (${trigger}): ${done.map((d) => `branch ${d.branchId} → ${d.queued}`).join(', ')}`);
      return done;
    });
    if (result === null && trigger === 'manual') throw new BadRequestException('في عملية تانية شغالة على أعياد الميلاد — جرّب كمان شوية');
    return { branches: result ?? [] };
  }

  /**
   * A greeting belongs to its day: whatever is still queued once the day is over (device was
   * closed, daily limit reached, outside sending hours) is cancelled instead of arriving late.
   */
  async expirePastGreetings() {
    const today = localDateString();
    const open = await this.prisma.wa_campaigns.findMany({
      where: { source: 'birthdays', status: { in: ['ready', 'running', 'paused'] }, created_at: { lt: new Date(Date.now() - 3600_000) } },
      select: { id: true, created_at: true },
    });
    for (const c of open.filter((row) => localDateString(row.created_at) < today)) {
      await this.prisma.$transaction([
        this.prisma.wa_messages.updateMany({ where: { campaign_id: c.id, status: 'queued' }, data: { status: 'cancelled', reason: 'birthday_passed' } }),
        this.prisma.wa_campaigns.update({ where: { id: c.id }, data: { status: 'done', finished_at: new Date() } }),
      ]);
      this.log.log(`birthday campaign ${c.id}: day over, unsent greetings cancelled`);
    }
  }

  /** Branches with a paired, non-revoked sending device. */
  private async pairedBranches(): Promise<number[]> {
    const rows = await this.prisma.wa_devices.findMany({ where: { revoked_at: null, token_hash: { not: null } }, select: { branch_id: true }, distinct: ['branch_id'] });
    return rows.map((r) => r.branch_id).sort((a, b) => a - b);
  }

  /** The birthday template exists from the first use, with the default greeting. */
  private async ensureTemplate(settings: BirthdaySettings, userId: number | null): Promise<BirthdaySettings> {
    if (settings.templateId && (await this.prisma.wa_templates.findUnique({ where: { id: settings.templateId }, select: { id: true } }))) return settings;
    const row = await this.prisma.wa_templates.create({ data: { name: DEFAULT_BIRTHDAY_TEMPLATE_NAME, body: DEFAULT_BIRTHDAY_TEMPLATE, is_active: true, created_by: userId } });
    const fresh = { ...(await readBirthdaySettings(this.prisma)), templateId: row.id };
    await writeBirthdaySettings(this.prisma, fresh);
    return fresh;
  }
}
