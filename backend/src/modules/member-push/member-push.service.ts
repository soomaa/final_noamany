import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, push_campaigns, push_sends } from '@prisma/client';
import { runWithMysqlLock } from '../../common/automation/cron-dedup.util';
import { paginated } from '../../common/dto/list-result';
import { PrismaService } from '../../common/prisma/prisma.service';
import { MemberPushPayload, PushService } from '../push/push.service';
import { ageOn, birthdaySuffixes } from '../whatsapp-campaigns/wa-campaigns.utils';
import { ListPushSendsDto, PushCampaignDto, PushMessageDto, PushSendDto, PushSettingsDto, PushTestDto } from './dto/member-push.dto';
import {
  addDays,
  audienceSummary,
  cairoDayStart,
  cairoParts,
  hasVariables,
  inQuietHours,
  nextRun,
  normalizeAudience,
  parseSchedule,
  PushAudience,
  renderVariables,
  ScheduleSpec,
  topicTarget,
} from './member-push.util';

const LOCK = 'cron:member-push';
/** A scheduled slot older than this (server down, long deferral) is skipped instead of sent late. */
const STALE_MS = 12 * 3600_000;
const CHUNK = 1000;

interface AudienceMember {
  id: number;
  name: string;
  branchId: number;
}

interface Message {
  title: string;
  body: string;
  type: string;
  link: string | null;
  imageUrl: string | null;
}

const chunks = <T>(list: T[], size = CHUNK): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
};

/**
 * «إشعارات الموبايل للأعضاء»: audience preview, manual / test / scheduled sends, history and
 * settings. Delivery goes through PushService (FCM v1): plain audiences to topics, computed or
 * personalised ones per member by token. Every real send also writes the in-app notification
 * rows (am_member_notifications) unless inApp=false.
 */
@Injectable()
export class MemberPushService {
  private readonly log = new Logger(MemberPushService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
  ) {}

  // ── settings ────────────────────────────────────────────────────────────────

  private async readSettings() {
    return (
      (await this.prisma.push_settings.findUnique({ where: { id: 1 } })) ??
      (await this.prisma.push_settings.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} }))
    );
  }

  async settings() {
    const s = await this.readSettings();
    const firebase = this.push.firebaseStatus();
    const memory = this.push.lastError;
    const lastError = memory && (!s.last_error_at || memory.at > s.last_error_at) ? memory : s.last_error ? { message: s.last_error, at: s.last_error_at } : null;
    const [devices, members] = await Promise.all([
      this.prisma.club_member_device_tokens.count({ where: { invalid_at: null } }),
      this.prisma.club_member_device_tokens.groupBy({ by: ['member_id'], where: { invalid_at: null } }).then((g) => g.length),
    ]);
    return {
      quietEnabled: s.quiet_enabled,
      quietStart: s.quiet_start,
      quietEnd: s.quiet_end,
      quietMode: s.quiet_mode as 'defer' | 'skip',
      defaultType: s.default_type,
      dailyLimit: s.daily_limit,
      firebase: { ...firebase, lastError: lastError?.message ?? null, lastErrorAt: lastError?.at ?? null },
      devices: { total: devices, members },
      now: cairoParts(new Date()),
    };
  }

  async updateSettings(dto: PushSettingsDto) {
    await this.readSettings();
    await this.prisma.push_settings.update({
      where: { id: 1 },
      data: {
        quiet_enabled: dto.quietEnabled,
        quiet_start: dto.quietStart,
        quiet_end: dto.quietEnd,
        quiet_mode: dto.quietMode,
        default_type: dto.defaultType?.trim() || undefined,
        daily_limit: dto.dailyLimit,
      },
    });
    return this.settings();
  }

  private isQuiet(s: { quiet_enabled: boolean; quiet_start: string; quiet_end: string }, at = new Date()) {
    return s.quiet_enabled && inQuietHours(at, s.quiet_start, s.quiet_end);
  }

  // ── audience ────────────────────────────────────────────────────────────────

  /** Members matching the audience right now (Cairo today). */
  async resolveAudience(a: PushAudience, now = new Date()): Promise<AudienceMember[]> {
    const today = cairoParts(now).date;
    const base: Prisma.club_membersWhereInput = {
      is_deleted: false,
      is_blocked: false,
      ...(a.branchIds.length ? { branch_id: { in: a.branchIds } } : {}),
      ...(a.gender ? { gender: a.gender } : {}),
    };
    const select = { id: true, name: true, branch_id: true, date_of_birth: true } as const;
    let rows: { id: number; name: string; branch_id: number; date_of_birth: string | null }[];

    switch (a.kind) {
      case 'members':
        rows = await this.prisma.club_members.findMany({ where: { id: { in: a.memberIds }, is_deleted: false }, select });
        break;
      case 'all':
        rows = await this.prisma.club_members.findMany({ where: { ...base, is_active: true }, select });
        break;
      case 'active':
        rows = await this.prisma.club_members.findMany({
          where: {
            ...base,
            subscriptions: { some: { subscription_start_date: { lte: today }, subscription_end_date: { gte: today }, status: { not: 'frozen' } } },
          },
          select,
        });
        break;
      case 'birthday':
        rows = (
          await this.prisma.club_members.findMany({
            where: { ...base, OR: birthdaySuffixes(today).map((suffix) => ({ date_of_birth: { endsWith: suffix } })) },
            select,
          })
        ).filter((m) => ageOn(m.date_of_birth, today) !== null);
        break;
      case 'expiring':
      case 'expired': {
        // The member's LAST subscription ends in the window, so whoever renewed is left out.
        const range = a.kind === 'expiring' ? { gte: today, lte: addDays(today, a.days!) } : { gte: addDays(today, -a.days!), lte: addDays(today, -1) };
        const groups = await this.prisma.club_subscriptions.groupBy({
          by: ['member_id'],
          where: { member_id: { not: null } },
          _max: { subscription_end_date: true },
          having: { subscription_end_date: { _max: range } },
        });
        rows = await this.membersIn(groups.map((g) => g.member_id!), base, select);
        break;
      }
      case 'absent': {
        // Holds a running plan that started at least N days ago, and no visit in the last N days.
        const cutoff = addDays(today, -a.days!);
        const subs = await this.prisma.club_subscriptions.groupBy({
          by: ['member_id'],
          where: { member_id: { not: null }, subscription_end_date: { gte: today }, subscription_start_date: { lte: cutoff }, status: { not: 'frozen' } },
        });
        const ids = subs.map((g) => g.member_id!);
        const came = new Set<number>();
        for (const part of chunks(ids)) {
          const seen = await this.prisma.club_attendance.findMany({
            where: { member_id: { in: part }, attendance_date: { gt: cutoff } },
            distinct: ['member_id'],
            select: { member_id: true },
          });
          seen.forEach((s) => came.add(s.member_id));
        }
        rows = await this.membersIn(ids.filter((id) => !came.has(id)), base, select);
        break;
      }
    }
    return rows.map((r) => ({ id: r.id, name: r.name, branchId: r.branch_id }));
  }

  private async membersIn<S extends Prisma.club_membersSelect>(ids: number[], base: Prisma.club_membersWhereInput, select: S) {
    const out: Prisma.club_membersGetPayload<{ select: S }>[] = [];
    for (const part of chunks([...new Set(ids)])) {
      out.push(...((await this.prisma.club_members.findMany({ where: { ...base, id: { in: part } }, select })) as Prisma.club_membersGetPayload<{ select: S }>[]));
    }
    return out as unknown as { id: number; name: string; branch_id: number; date_of_birth: string | null }[];
  }

  private async countDevices(memberIds: number[]) {
    let devices = 0;
    let withDevice = 0;
    for (const part of chunks(memberIds)) {
      const groups = await this.prisma.club_member_device_tokens.groupBy({
        by: ['member_id'],
        where: { member_id: { in: part }, invalid_at: null },
        _count: { _all: true },
      });
      withDevice += groups.length;
      devices += groups.reduce((sum, g) => sum + g._count._all, 0);
    }
    return { devices, withDevice };
  }

  private async branchNames(): Promise<Map<number, string>> {
    const rows = await this.prisma.tbl_branches.findMany({ select: { branch_id: true, branch_name: true } });
    return new Map(rows.map((b) => [b.branch_id, b.branch_name?.trim() || `فرع ${b.branch_id}`]));
  }

  /** Estimated members and devices before sending, and how it will be delivered. */
  async preview(rawAudience: unknown, message?: Partial<PushMessageDto>) {
    const audience = normalizeAudience(rawAudience);
    const members = await this.resolveAudience(audience);
    const { devices, withDevice } = await this.countDevices(members.map((m) => m.id));
    const target = topicTarget(audience, hasVariables(message?.title, message?.body));
    const names = await this.branchNames();
    return {
      members: members.length,
      membersWithApp: withDevice,
      devices,
      delivery: target ? 'topic' : 'tokens',
      target: target ? ('topic' in target ? target.topic : target.condition) : null,
      summary: audienceSummary(audience, names),
      sample: members.slice(0, 6).map((m) => ({ id: m.id, name: m.name, branch: names.get(m.branchId) ?? '' })),
    };
  }

  // ── sending ─────────────────────────────────────────────────────────────────

  private message(dto: PushMessageDto, defaultType: string): Message {
    const title = dto.title?.trim();
    const body = dto.body?.trim();
    if (!title || !body) throw new BadRequestException('العنوان والنص مطلوبين');
    const imageUrl = dto.imageUrl?.trim() || null;
    if (imageUrl && !/^https:\/\//i.test(imageUrl)) throw new BadRequestException('رابط الصورة لازم يبدأ بـ https://');
    return { title, body, type: dto.type?.trim() || defaultType, link: dto.link?.trim() || null, imageUrl };
  }

  /** «ابعت دلوقتي»: the send row is created now and delivered in the background; poll the history. */
  async sendNow(dto: PushSendDto, userId: number | null) {
    const settings = await this.readSettings();
    const msg = this.message(dto, settings.default_type);
    const audience = normalizeAudience(dto.audience);
    if (!dto.force && this.isQuiet(settings)) {
      throw new BadRequestException(`دلوقتي ساعات الهدوء (${settings.quiet_start} – ${settings.quiet_end}). اعمل جدولة أو ابعت برضه.`);
    }
    const members = await this.resolveAudience(audience);
    if (members.length === 0) throw new BadRequestException('مفيش أعضاء في الجمهور ده');
    const send = await this.createSendRow({ msg, audience, trigger: 'manual', inApp: dto.inApp !== false, userId });
    void this.deliver(send, audience, members, msg).catch((e) => this.log.error(`push send ${send.id} failed: ${(e as Error).message}`));
    return { id: send.id, members: members.length, status: 'running' };
  }

  /** «إرسال تجربة»: one member's phones only, nothing in the app list, recorded in history as test. */
  async sendTest(dto: PushTestDto, userId: number | null) {
    const settings = await this.readSettings();
    const msg = this.message(dto, settings.default_type);
    const member = await this.prisma.club_members.findFirst({ where: { id: dto.memberId, is_deleted: false }, select: { id: true, name: true, branch_id: true } });
    if (!member) throw new NotFoundException('العضو غير موجود');
    const audience = normalizeAudience({ kind: 'members', memberIds: [member.id] });
    const send = await this.createSendRow({ msg, audience, trigger: 'test', inApp: false, userId });
    const done = await this.deliver(send, audience, [{ id: member.id, name: member.name, branchId: member.branch_id }], msg, { test: true });
    return { id: send.id, sent: done.sent_count, invalid: done.invalid_count, devices: done.devices_count };
  }

  private async createSendRow(p: { msg: Message; audience: PushAudience; trigger: 'manual' | 'schedule' | 'test'; inApp: boolean; userId: number | null; campaignId?: number; runKey?: string; status?: string }) {
    return this.prisma.push_sends.create({
      data: {
        campaign_id: p.campaignId ?? null,
        run_key: p.runKey ?? null,
        trigger: p.trigger,
        title: p.msg.title,
        body: p.msg.body,
        type: p.msg.type,
        link: p.msg.link,
        image_url: p.msg.imageUrl,
        audience: JSON.stringify(p.audience),
        audience_summary: audienceSummary(p.audience, await this.branchNames()),
        in_app: p.inApp,
        status: p.status ?? 'running',
        created_by: p.userId,
      },
    });
  }

  /**
   * Deliver one send: in-app rows, then topic or per-member tokens (per-member daily limit for
   * token sends; test sends ignore it). Never throws: errors end up on the send row.
   */
  async deliver(send: push_sends, audience: PushAudience, members: AudienceMember[], msg: Message, opts: { test?: boolean } = {}): Promise<push_sends> {
    const startedErrorAt = this.push.lastError?.at ?? null;
    const counts = { members_count: members.length, devices_count: 0, sent_count: 0, failed_count: 0, invalid_count: 0, limited_count: 0 };
    let status = 'done';
    let error: string | null = null;
    let delivery = 'tokens';
    let topicCondition: string | null = null;
    try {
      const settings = await this.readSettings();
      const names = await this.branchNames();
      const personalised = hasVariables(msg.title, msg.body);
      const render = (m: AudienceMember) => {
        const vars = { name: m.name, branch: names.get(m.branchId) ?? '' };
        return { title: renderVariables(msg.title, vars), body: renderVariables(msg.body, vars) };
      };
      const byId = new Map(members.map((m) => [m.id, m]));

      if (send.in_app) {
        const data = JSON.stringify({ sendId: send.id, ...(msg.link ? { link: msg.link } : {}) });
        for (const part of chunks(members)) {
          await this.prisma.am_member_notifications.createMany({
            data: part.map((m) => ({ member_id: m.id, branch_id: m.branchId, ...render(m), type: msg.type, data, image_url: msg.imageUrl, created_by: send.created_by })),
          });
        }
      }

      const base: MemberPushPayload = { type: msg.type, id: send.id, title: msg.title, body: msg.body, link: msg.link, sendId: send.id, imageUrl: msg.imageUrl };
      const target = opts.test ? null : topicTarget(audience, personalised);
      if (target) {
        delivery = 'topic';
        topicCondition = 'topic' in target ? target.topic : target.condition;
        counts.devices_count = (await this.countDevices(members.map((m) => m.id))).devices;
        const ok = await this.push.sendToTopicTarget(target, base);
        if (ok) counts.sent_count = counts.devices_count;
        else {
          counts.failed_count = counts.devices_count;
          status = 'failed';
          error = this.push.lastError?.message ?? 'FCM رفض الإرسال';
        }
      } else {
        let eligible = members.map((m) => m.id);
        const limited = new Set<number>();
        if (!opts.test && settings.daily_limit > 0) {
          const since = cairoDayStart();
          // Test sends never use up a member's daily allowance.
          const tests = (await this.prisma.push_sends.findMany({ where: { trigger: 'test', created_at: { gte: since } }, select: { id: true } })).map((t) => t.id);
          for (const part of chunks(eligible)) {
            const groups = await this.prisma.push_send_recipients.groupBy({
              by: ['member_id'],
              where: { member_id: { in: part }, status: 'sent', created_at: { gte: since }, ...(tests.length ? { send_id: { notIn: tests } } : {}) },
              _count: { _all: true },
            });
            groups.filter((g) => g._count._all >= settings.daily_limit).forEach((g) => limited.add(g.member_id));
          }
          eligible = eligible.filter((id) => !limited.has(id));
        }
        const { result, perMember } = await this.push.deliverToMembers(eligible, (memberId) => {
          const m = byId.get(memberId);
          return m && personalised ? { ...base, ...render(m) } : base;
        });
        // Counts are devices (like topic sends); per-member results go to push_send_recipients.
        counts.devices_count = result.devices;
        counts.sent_count = result.sent;
        counts.invalid_count = result.invalid;
        counts.failed_count = Math.max(0, result.devices - result.sent - result.invalid);
        counts.limited_count = limited.size;
        const rows: { send_id: number; member_id: number; status: string }[] = [];
        for (const [memberId, st] of perMember) rows.push({ send_id: send.id, member_id: memberId, status: st });
        limited.forEach((memberId) => rows.push({ send_id: send.id, member_id: memberId, status: 'limited' }));
        for (const part of chunks(rows)) await this.prisma.push_send_recipients.createMany({ data: part, skipDuplicates: true });
        if (counts.failed_count > 0 && counts.sent_count === 0) {
          status = 'failed';
          error = this.push.lastError?.message ?? null;
        }
      }
    } catch (e) {
      status = 'failed';
      error = (e as Error).message;
      this.log.error(`push send ${send.id}: ${error}`);
    }

    const latest = this.push.lastError;
    if (latest && (!startedErrorAt || latest.at > startedErrorAt)) {
      await this.prisma.push_settings.update({ where: { id: 1 }, data: { last_error: latest.message, last_error_at: latest.at } }).catch(() => undefined);
    }
    const done = await this.prisma.push_sends.update({
      where: { id: send.id },
      data: { ...counts, delivery, topic_condition: topicCondition, status, error, finished_at: new Date() },
    });
    this.log.log(`push send ${send.id} (${send.trigger}) → ${delivery}${topicCondition ? ` ${topicCondition}` : ''}: members=${counts.members_count} devices=${counts.devices_count} sent=${counts.sent_count} failed=${counts.failed_count} invalid=${counts.invalid_count} limited=${counts.limited_count}`);
    return done;
  }

  // ── history ─────────────────────────────────────────────────────────────────

  async listSends(q: ListPushSendsDto) {
    const where: Prisma.push_sendsWhereInput = {
      ...(q.trigger ? { trigger: q.trigger } : {}),
      ...(q.campaignId ? { campaign_id: q.campaignId } : {}),
      ...(q.search?.trim() ? { OR: [{ title: { contains: q.search.trim() } }, { body: { contains: q.search.trim() } }] } : {}),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.push_sends.count({ where }),
      this.prisma.push_sends.findMany({ where, orderBy: { id: 'desc' }, skip: q.skip, take: q.take }),
    ]);
    const meta = await this.sendMeta(rows);
    return paginated(rows.map((r) => this.sendView(r, meta)), total, q.page, q.pageSize);
  }

  async getSend(id: number) {
    const row = await this.prisma.push_sends.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('الإرسال غير موجود');
    const meta = await this.sendMeta([row]);
    const [byStatus, recipients] = await Promise.all([
      this.prisma.push_send_recipients.groupBy({ by: ['status'], where: { send_id: id }, _count: { _all: true } }),
      this.prisma.push_send_recipients.findMany({ where: { send_id: id }, orderBy: { id: 'asc' }, take: 300 }),
    ]);
    const members = await this.prisma.club_members.findMany({
      where: { id: { in: recipients.map((r) => r.member_id) } },
      select: { id: true, name: true, member_code: true, branch_id: true },
    });
    const byId = new Map(members.map((m) => [m.id, m]));
    const names = await this.branchNames();
    return {
      ...this.sendView(row, meta),
      audience: JSON.parse(row.audience) as PushAudience,
      recipientsByStatus: Object.fromEntries(byStatus.map((g) => [g.status, g._count._all])),
      recipients: recipients.map((r) => ({
        memberId: r.member_id,
        name: byId.get(r.member_id)?.name ?? `#${r.member_id}`,
        code: byId.get(r.member_id)?.member_code ?? '',
        branch: names.get(byId.get(r.member_id)?.branch_id ?? 0) ?? '',
        status: r.status,
        openedAt: r.opened_at,
      })),
    };
  }

  private async sendMeta(rows: push_sends[]) {
    const campaignIds = [...new Set(rows.map((r) => r.campaign_id).filter((id): id is number => id != null))];
    const userIds = [...new Set(rows.map((r) => r.created_by).filter((id): id is number => id != null))];
    const [campaigns, users] = await Promise.all([
      campaignIds.length ? this.prisma.push_campaigns.findMany({ where: { id: { in: campaignIds } }, select: { id: true, name: true } }) : [],
      userIds.length ? this.prisma.users.findMany({ where: { user_id: { in: userIds } }, select: { user_id: true, name: true, username: true } }) : [],
    ]);
    return {
      campaigns: new Map<number, string>(campaigns.map((c) => [c.id, c.name] as [number, string])),
      users: new Map<number, string | null>(users.map((u) => [u.user_id, u.name || u.username || null] as [number, string | null])),
    };
  }

  private sendView(r: push_sends, meta: { campaigns: Map<number, string>; users: Map<number, string | null> }) {
    return {
      id: r.id,
      trigger: r.trigger,
      campaignId: r.campaign_id,
      campaignName: r.campaign_id != null ? meta.campaigns.get(r.campaign_id) ?? null : null,
      createdBy: r.created_by != null ? meta.users.get(r.created_by) ?? null : null,
      title: r.title,
      body: r.body,
      type: r.type,
      link: r.link,
      imageUrl: r.image_url,
      audienceSummary: r.audience_summary,
      delivery: r.delivery,
      topic: r.topic_condition,
      inApp: r.in_app,
      members: r.members_count,
      devices: r.devices_count,
      sent: r.sent_count,
      failed: r.failed_count,
      invalid: r.invalid_count,
      limited: r.limited_count,
      opened: r.opened_count,
      status: r.status,
      error: r.error,
      createdAt: r.created_at,
      finishedAt: r.finished_at,
    };
  }

  /** The app reports a tap on a push (POST /member/notification-opened). Counted once per member. */
  async recordOpen(memberId: number, sendId: number) {
    const send = await this.prisma.push_sends.findUnique({ where: { id: sendId }, select: { id: true } });
    if (!send) return { ok: true, counted: false };
    const existing = await this.prisma.push_send_recipients.findUnique({ where: { send_id_member_id: { send_id: sendId, member_id: memberId } } });
    if (existing?.opened_at) return { ok: true, counted: false };
    try {
      if (existing) await this.prisma.push_send_recipients.update({ where: { id: existing.id }, data: { opened_at: new Date() } });
      else await this.prisma.push_send_recipients.create({ data: { send_id: sendId, member_id: memberId, status: 'topic', opened_at: new Date() } });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return { ok: true, counted: false };
      throw e;
    }
    await this.prisma.push_sends.update({ where: { id: sendId }, data: { opened_count: { increment: 1 } } });
    return { ok: true, counted: true };
  }

  // ── schedules ───────────────────────────────────────────────────────────────

  private specOf(c: push_campaigns): ScheduleSpec {
    return {
      kind: c.schedule_kind as ScheduleSpec['kind'],
      runAt: c.run_at,
      time: c.time_of_day,
      weekdays: c.weekdays ? c.weekdays.split(',').map(Number) : [],
      monthDay: c.month_day,
      intervalDays: c.interval_days,
      startDate: c.start_date,
      endDate: c.end_date,
      anchorDate: cairoParts(c.created_at).date,
    };
  }

  private campaignData(dto: PushCampaignDto, defaultType: string) {
    const msg = this.message(dto, defaultType);
    const audience = normalizeAudience(dto.audience);
    const spec = parseSchedule(dto.schedule as never);
    const name = dto.name?.trim();
    if (!name) throw new BadRequestException('اكتب اسم للجدولة');
    return {
      spec,
      data: {
        name,
        preset: dto.preset?.trim() || null,
        title: msg.title,
        body: msg.body,
        type: msg.type,
        link: msg.link,
        image_url: msg.imageUrl,
        audience: JSON.stringify(audience),
        in_app: dto.inApp !== false,
        schedule_kind: spec.kind,
        run_at: spec.runAt ?? null,
        time_of_day: spec.time ?? null,
        weekdays: spec.weekdays?.length ? spec.weekdays.join(',') : null,
        month_day: spec.monthDay ?? null,
        interval_days: spec.intervalDays ?? null,
        start_date: spec.startDate ?? null,
        end_date: spec.endDate ?? null,
      },
    };
  }

  async listCampaigns() {
    const rows = await this.prisma.push_campaigns.findMany({ orderBy: [{ status: 'asc' }, { next_run_at: 'asc' }, { id: 'desc' }] });
    const lastIds = rows.map((r) => r.last_send_id).filter((id): id is number => id != null);
    const lasts = lastIds.length ? await this.prisma.push_sends.findMany({ where: { id: { in: lastIds } } }) : [];
    const byId = new Map(lasts.map((s) => [s.id, s]));
    const names = await this.branchNames();
    return rows.map((c) => this.campaignView(c, c.last_send_id != null ? byId.get(c.last_send_id) ?? null : null, names));
  }

  private campaignView(c: push_campaigns, last: push_sends | null, names: Map<number, string>) {
    const audience = JSON.parse(c.audience) as PushAudience;
    return {
      id: c.id,
      name: c.name,
      preset: c.preset,
      title: c.title,
      body: c.body,
      type: c.type,
      link: c.link,
      imageUrl: c.image_url,
      audience,
      audienceSummary: audienceSummary(audience, names),
      inApp: c.in_app,
      schedule: {
        kind: c.schedule_kind,
        runAt: c.run_at ? `${cairoParts(c.run_at).date}T${cairoParts(c.run_at).time}` : null,
        time: c.time_of_day,
        weekdays: c.weekdays ? c.weekdays.split(',').map(Number) : [],
        monthDay: c.month_day,
        intervalDays: c.interval_days,
        startDate: c.start_date,
        endDate: c.end_date,
      },
      status: c.status,
      nextRunAt: c.next_run_at,
      lastRunAt: c.last_run_at,
      lastSend: last ? { id: last.id, status: last.status, sent: last.sent_count, failed: last.failed_count, devices: last.devices_count, members: last.members_count } : null,
      createdAt: c.created_at,
    };
  }

  async createCampaign(dto: PushCampaignDto, userId: number | null) {
    const settings = await this.readSettings();
    const { spec, data } = this.campaignData(dto, settings.default_type);
    const next = nextRun(spec, new Date());
    if (!next) throw new BadRequestException(spec.kind === 'once' ? 'وقت الإرسال عدّى — اختار وقت جاي' : 'الفترة دي مفيهاش أي معاد إرسال');
    const row = await this.prisma.push_campaigns.create({ data: { ...data, next_run_at: next, status: 'active', created_by: userId } });
    return this.campaignView(row, null, await this.branchNames());
  }

  async updateCampaign(id: number, dto: PushCampaignDto) {
    const current = await this.requireCampaign(id);
    const settings = await this.readSettings();
    const { data } = this.campaignData(dto, settings.default_type);
    const row = await this.prisma.push_campaigns.update({ where: { id }, data });
    const next = row.status === 'paused' ? row.next_run_at : nextRun(this.specOf(row), new Date());
    if (current.status !== 'paused' && !next) throw new BadRequestException('مفيش معاد إرسال جاي بالإعدادات دي');
    const saved = await this.prisma.push_campaigns.update({
      where: { id },
      data: { next_run_at: next, status: row.status === 'paused' ? 'paused' : 'active' },
    });
    return this.campaignView(saved, null, await this.branchNames());
  }

  async setCampaignStatus(id: number, action: 'pause' | 'resume') {
    const c = await this.requireCampaign(id);
    if (action === 'pause') {
      await this.prisma.push_campaigns.update({ where: { id }, data: { status: 'paused' } });
    } else {
      const next = nextRun(this.specOf(c), new Date());
      if (!next) throw new BadRequestException('الجدولة دي خلصت — عدّل المعاد الأول');
      await this.prisma.push_campaigns.update({ where: { id }, data: { status: 'active', next_run_at: next } });
    }
    return { ok: true };
  }

  async duplicateCampaign(id: number, userId: number | null) {
    const c = await this.requireCampaign(id);
    const { id: _id, created_at: _c, updated_at: _u, last_run_at: _l, last_send_id: _s, ...rest } = c;
    const row = await this.prisma.push_campaigns.create({
      data: { ...rest, name: `${c.name} (نسخة)`.slice(0, 150), status: 'paused', created_by: userId },
    });
    return this.campaignView(row, null, await this.branchNames());
  }

  async deleteCampaign(id: number) {
    await this.requireCampaign(id);
    await this.prisma.push_campaigns.delete({ where: { id } });
    return { ok: true };
  }

  private async requireCampaign(id: number) {
    const c = await this.prisma.push_campaigns.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('الجدولة غير موجودة');
    return c;
  }

  /**
   * The minute cron: run every due schedule once. A MySQL lock serialises processes, and the
   * unique run_key (campaign + slot) makes a second attempt at the same slot a no-op.
   * Quiet hours: «defer» waits for the end of the window, «skip» records the slot as skipped.
   */
  async runDue(now = new Date()) {
    return runWithMysqlLock(this.prisma, LOCK, 0, async () => {
      const due = await this.prisma.push_campaigns.findMany({ where: { status: 'active', next_run_at: { lte: now } }, orderBy: { next_run_at: 'asc' }, take: 20 });
      if (!due.length) return [];
      const settings = await this.readSettings();
      const quiet = this.isQuiet(settings, now);
      const results: { campaignId: number; sendId: number | null; outcome: string }[] = [];
      for (const c of due) {
        const slot = c.next_run_at!;
        const advance = async (sendId?: number) => {
          const next = nextRun(this.specOf(c), now);
          await this.prisma.push_campaigns.update({
            where: { id: c.id },
            data: {
              next_run_at: next,
              status: next ? 'active' : 'done',
              ...(sendId ? { last_run_at: now, last_send_id: sendId } : {}),
            },
          });
        };
        if (now.getTime() - slot.getTime() > STALE_MS) {
          this.log.warn(`push schedule ${c.id}: slot ${slot.toISOString()} is stale, skipped`);
          await advance();
          results.push({ campaignId: c.id, sendId: null, outcome: 'stale' });
          continue;
        }
        if (quiet && settings.quiet_mode === 'defer') {
          results.push({ campaignId: c.id, sendId: null, outcome: 'deferred' });
          continue;
        }
        const msg: Message = { title: c.title, body: c.body, type: c.type, link: c.link, imageUrl: c.image_url };
        const audience = normalizeAudience(JSON.parse(c.audience));
        const runKey = `c${c.id}:${slot.toISOString()}`;
        let send: push_sends;
        try {
          send = await this.createSendRow({ msg, audience, trigger: 'schedule', inApp: c.in_app, userId: c.created_by, campaignId: c.id, runKey, status: quiet ? 'skipped' : 'running' });
        } catch (e) {
          if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
            this.log.warn(`push schedule ${c.id}: slot ${runKey} already ran`);
            await advance();
            results.push({ campaignId: c.id, sendId: null, outcome: 'duplicate' });
            continue;
          }
          throw e;
        }
        if (quiet) {
          await this.prisma.push_sends.update({ where: { id: send.id }, data: { error: 'ساعات الهدوء', finished_at: now } });
          await advance(send.id);
          results.push({ campaignId: c.id, sendId: send.id, outcome: 'skipped' });
          continue;
        }
        const members = await this.resolveAudience(audience, now);
        const done = await this.deliver(send, audience, members, msg);
        await advance(send.id);
        results.push({ campaignId: c.id, sendId: send.id, outcome: done.status });
      }
      return results;
    });
  }
}
