import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash, randomBytes, randomInt, randomUUID } from 'crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { paginated } from '../../common/dto/list-result';
import { JwtUser } from '../../common/types/jwt-user';
import { localDateString } from '../club-members/club-member.utils';
import { addDays } from '../club-subscriptions/club-subscription.utils';
import {
  CreateWaCampaignDto,
  CreateWaDeviceDto,
  ListWaCampaignsDto,
  ListWaMessagesDto,
  UpsertWaTemplateDto,
  WaAbsenceLookupDto,
  WaAbsenceSettingsDto,
  WaAudienceDto,
  WaOptOutDto,
} from './dto/wa-campaigns.dto';
import {
  ageOn,
  birthdaySuffixes,
  bodyToFields,
  classifyRecipients,
  daysBetween,
  fieldsToBody,
  displayPhone,
  firstName,
  formatDate,
  renderTemplate,
  SkipReason,
  toWhatsAppPhone,
  varyTemplate,
  withOptOutLine,
} from './wa-campaigns.utils';
import { ControlUnavailableError, WaControlClient } from './wa-control.client';
import { readBirthdaySettings } from './wa-birthdays.settings';
import { readTemplateOptions, setOptOutLine, updateTemplateOptions } from './wa-template-options';
import { BIRTHDAY_FIELDS, DEFAULT_TEMPLATES } from './wa-default-templates';
import { runWithMysqlLock } from '../../common/automation/cron-dedup.util';

const MAX_AUDIENCE = 5000;
/** A phone that got any campaign message this recently is skipped, so reminders never stack. */
const RECENT_DAYS = 3;
/**
 * Birthday greetings ignore other recent messages (a renewal reminder must not swallow the
 * greeting) but a member gets at most one greeting in this window — a manual and an automatic
 * birthday campaign on the same day never both reach them.
 */
const GREETED_DAYS = 30;
/** A number WhatsApp said isn't registered is not looked up again for this long (each lookup is a signal too). */
const NOT_ON_WHATSAPP_DAYS = 180;
const PAIR_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const PAIR_CODE_TTL_MS = 15 * 60_000;

export const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

interface AudienceRow {
  memberId: number;
  subscriptionId: number | null;
  name: string;
  code: string;
  phoneRaw: string | null;
  endDate: string | null;
  packageName: string | null;
  age?: number | null;
}

@Injectable()
export class WaCampaignsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branches: BranchScopeService,
    private readonly control: WaControlClient,
  ) {}

  // ── control (Gymora) ──────────────────────────────────────────────────────

  async controlStatus() {
    if (!this.control.configured) return { configured: false as const, error: 'خدمة التحكم في واتساب مش متظبطة على السيرفر' };
    try {
      const { selectors: _selectors, ...status } = await this.control.status();
      return { configured: true as const, status };
    } catch (err) {
      return { configured: true as const, error: err instanceof Error ? err.message : String(err) };
    }
  }

  // ── templates ─────────────────────────────────────────────────────────────

  async listTemplates() {
    await this.seedDefaultTemplates();
    const [rows, birthdays, options] = await Promise.all([
      this.prisma.wa_templates.findMany({ orderBy: [{ is_active: 'desc' }, { id: 'desc' }] }),
      readBirthdaySettings(this.prisma),
      readTemplateOptions(this.prisma),
    ]);
    return rows.map((t) => ({
      id: t.id,
      name: t.name,
      body: t.body,
      isActive: t.is_active,
      isBirthday: t.id === birthdays.templateId,
      isAbsence: t.id === options.absence.templateId,
      addOptOutLine: !options.noOptOutLine.includes(t.id),
      fields: options.fields[String(t.id)] ?? bodyToFields(t.body),
      updatedAt: t.updated_at,
    }));
  }

  /**
   * The page's starting templates, each created once: «بينتهي النهاردة», «منتهي من فترة» and
   * «لم يحضر منذ مدة»; the birthday template (made by the birthday settings) gets its fields.
   */
  private async seedDefaultTemplates() {
    const options = await readTemplateOptions(this.prisma);
    const birthdays = await readBirthdaySettings(this.prisma);
    const birthdayPending = !!birthdays.templateId && !options.fields[String(birthdays.templateId)] && !options.seeded.includes('birthday_fields');
    if (DEFAULT_TEMPLATES.every((d) => options.seeded.includes(d.key)) && !birthdayPending) return;
    await runWithMysqlLock(this.prisma, 'wa:templates-seed', 10, async () => {
      const current = await readTemplateOptions(this.prisma);
      const created: Record<string, number> = {};
      for (const d of DEFAULT_TEMPLATES) {
        if (current.seeded.includes(d.key)) continue;
        const row = await this.prisma.wa_templates.create({ data: { name: d.name, body: fieldsToBody(d.fields), is_active: true } });
        created[d.key] = row.id;
      }
      const birthday = birthdays.templateId ? await this.prisma.wa_templates.findUnique({ where: { id: birthdays.templateId } }) : null;
      // The birthday text written before the field editor: the free-week greeting becomes the
      // matching fields; any other text is split into fields line by line.
      const birthdayFields = birthday && !current.fields[String(birthday.id)] && !current.seeded.includes('birthday_fields')
        ? (birthday.body.includes('أسبوع فري') ? BIRTHDAY_FIELDS : bodyToFields(birthday.body))
        : null;
      if (birthday && birthdayFields) await this.prisma.wa_templates.update({ where: { id: birthday.id }, data: { body: fieldsToBody(birthdayFields) } });
      await updateTemplateOptions(this.prisma, (o) => {
        for (const d of DEFAULT_TEMPLATES) {
          if (!created[d.key]) continue;
          o.fields[String(created[d.key])] = d.fields;
          o.seeded.push(d.key);
          if (d.key === 'absence' && !o.absence.templateId) o.absence.templateId = created[d.key];
        }
        if (birthday && birthdayFields) {
          o.fields[String(birthday.id)] = birthdayFields;
          o.seeded.push('birthday_fields');
        }
      });
    });
  }

  async createTemplate(dto: UpsertWaTemplateDto, user: JwtUser) {
    const body = this.templateBody(dto);
    const row = await this.prisma.wa_templates.create({
      data: { name: dto.name.trim(), body, is_active: dto.isActive ?? true, created_by: user.sub },
    });
    await this.saveTemplateOptions(row.id, dto);
    return { id: row.id };
  }

  async updateTemplate(id: number, dto: UpsertWaTemplateDto) {
    await this.prisma.wa_templates.findUniqueOrThrow({ where: { id } }).catch(() => {
      throw new NotFoundException('القالب غير موجود');
    });
    await this.prisma.wa_templates.update({
      where: { id },
      data: { name: dto.name.trim(), body: this.templateBody(dto), ...(dto.isActive !== undefined ? { is_active: dto.isActive } : {}) },
    });
    await this.saveTemplateOptions(id, dto);
    return { id };
  }

  /** With fields the body is generated from them (one line each, `{a|b}` for several wordings). */
  private templateBody(dto: UpsertWaTemplateDto): string {
    const body = dto.fields?.length ? fieldsToBody(dto.fields) : dto.body.trim();
    if (!body) throw new BadRequestException('اكتب نص الرسالة');
    return body;
  }

  private async saveTemplateOptions(id: number, dto: UpsertWaTemplateDto) {
    await updateTemplateOptions(this.prisma, (o) => {
      if (dto.addOptOutLine !== undefined) {
        const ids = new Set(o.noOptOutLine);
        if (dto.addOptOutLine) ids.delete(id);
        else ids.add(id);
        o.noOptOutLine = [...ids].sort((a, b) => a - b);
      }
      // Fields given → stored; plain text only → the stored fields would be stale, so they go.
      if (dto.fields?.length) o.fields[String(id)] = dto.fields.map((f) => ({ label: f.label.trim(), options: f.options.map((x) => x.trim()).filter(Boolean) })).filter((f) => f.options.length);
      else delete o.fields[String(id)];
    });
  }

  async removeTemplate(id: number) {
    if ((await readBirthdaySettings(this.prisma)).templateId === id) throw new ConflictException('ده قالب أعياد الميلاد — اختار قالب تاني لأعياد الميلاد الأول');
    if ((await readTemplateOptions(this.prisma)).absence.templateId === id) throw new ConflictException('ده قالب «لم يحضر منذ مدة» — اختار قالب تاني ليه الأول');
    await this.prisma.wa_templates.deleteMany({ where: { id } });
    await setOptOutLine(this.prisma, id, true);
    await updateTemplateOptions(this.prisma, (o) => { delete o.fields[String(id)]; });
    return { id };
  }

  // ── audience / preview ────────────────────────────────────────────────────

  async preview(dto: WaAudienceDto, user: JwtUser) {
    const built = await this.buildAudience(dto, user);
    const sendable = built.recipients.filter((r) => !r.skip);
    const excluded: Partial<Record<SkipReason, number>> = {};
    for (const r of built.recipients) if (r.skip) excluded[r.skip] = (excluded[r.skip] ?? 0) + 1;
    return {
      total: built.recipients.length,
      sendable: sendable.length,
      excluded,
      truncated: built.truncated,
      sample: sendable.slice(0, 3).map((r) => ({ name: r.name, phone: displayPhone(r.phone!), body: r.body })),
      recipients: built.recipients.slice(0, 2000).map((r) => ({
        memberId: r.memberId,
        subscriptionId: r.subscriptionId,
        name: r.name,
        code: r.code,
        phone: r.phone ? displayPhone(r.phone) : r.phoneRaw,
        endDate: r.endDate,
        packageName: r.packageName,
        age: r.age ?? null,
        skip: r.skip,
      })),
    };
  }

  private async buildAudience(dto: WaAudienceDto, user: JwtUser) {
    if (!this.branches.isBranchAllowed(user, dto.branchId)) throw new ForbiddenException('لا تملك صلاحية الوصول لبيانات هذا الفرع');
    return this.audienceFor(dto);
  }

  private async audienceFor(dto: WaAudienceDto) {
    const today = localDateString();
    const birthdays = dto.source === 'birthdays';
    const rows = await this.candidates(dto, today);
    const truncated = rows.length > MAX_AUDIENCE;
    const audience = rows.slice(0, MAX_AUDIENCE);

    const phones = [...new Set(audience.map((r) => toWhatsAppPhone(r.phoneRaw)).filter((p): p is string => !!p))];
    const since = new Date(Date.now() - RECENT_DAYS * 86400_000);
    const deadSince = new Date(Date.now() - NOT_ON_WHATSAPP_DAYS * 86400_000);
    const memberIds = audience.map((r) => r.memberId);
    const [optOuts, recent, notOnWhatsApp, branchName, greeted, templateOptions] = await Promise.all([
      phones.length ? this.prisma.wa_opt_outs.findMany({ where: { phone: { in: phones } }, select: { phone: true } }) : [],
      phones.length && !birthdays
        ? this.prisma.wa_messages.findMany({
            where: { phone: { in: phones }, status: { in: ['sent', 'sending', 'uncertain'] }, OR: [{ sent_at: { gte: since } }, { claimed_at: { gte: since } }] },
            select: { phone: true },
            distinct: ['phone'],
          })
        : [],
      phones.length
        ? this.prisma.wa_messages.findMany({
            where: { phone: { in: phones }, status: 'failed', reason: 'not_on_whatsapp', created_at: { gte: deadSince } },
            select: { phone: true },
            distinct: ['phone'],
          })
        : [],
      this.branchName(dto.branchId),
      birthdays && memberIds.length
        ? this.prisma.wa_messages.findMany({
            where: {
              member_id: { in: memberIds },
              status: { in: ['queued', 'sending', 'sent', 'uncertain'] },
              created_at: { gte: new Date(Date.now() - GREETED_DAYS * 86400_000) },
              campaign: { source: 'birthdays' },
            },
            select: { member_id: true },
            distinct: ['member_id'],
          })
        : [],
      readTemplateOptions(this.prisma),
    ]);
    // A template can opt out of the automatic «ابعت إيقاف» line (staff choice per template).
    const addOptOutLine = !(dto.templateId && templateOptions.noOptOutLine.includes(dto.templateId));
    const classified = classifyRecipients(audience, {
      optedOut: new Set(optOuts.map((o) => o.phone)),
      recentlyMessaged: new Set(recent.map((m) => m.phone)),
      excludedMemberIds: new Set(dto.excludeMemberIds ?? []),
      notOnWhatsApp: new Set(notOnWhatsApp.map((m) => m.phone)),
      alreadyGreeted: new Set(greeted.map((m) => m.member_id!)),
    });
    const recipients = classified.map((r) => ({
      ...r,
      // Each member gets their own wording (version + {a|b} choices) and a way to stop the messages.
      body: (addOptOutLine ? withOptOutLine : (text: string) => text)(renderTemplate(varyTemplate(dto.body), {
        name: r.name,
        first_name: firstName(r.name),
        code: r.code,
        end_date: formatDate(r.endDate),
        days: r.endDate ? String(Math.abs(daysBetween(today, r.endDate))) : '',
        package: r.packageName ?? '',
        branch: branchName,
        age: r.age ? String(r.age) : '',
      })),
    }));
    return { recipients, truncated, branchName };
  }

  /** One row per member: the subscription that makes them part of this audience. */
  private async candidates(dto: WaAudienceDto, today: string): Promise<AudienceRow[]> {
    const memberWhere: Prisma.club_membersWhereInput = {
      is_deleted: false,
      is_blocked: false,
      ...(dto.gender ? { gender: dto.gender } : {}),
    };
    const memberSelect = { id: true, name: true, member_code: true, phone: true } as const;

    if (dto.source === 'members') {
      const ids = [...new Set(dto.memberIds ?? [])];
      if (!ids.length) throw new BadRequestException('اختار عضو واحد على الأقل');
      const members = await this.prisma.club_members.findMany({
        where: { ...memberWhere, id: { in: ids }, branch_id: dto.branchId },
        select: { ...memberSelect, subscriptions: { orderBy: { subscription_end_date: 'desc' }, take: 1, select: { id: true, subscription_end_date: true, subscription_type: true } } },
      });
      const byId = new Map(members.map((m) => [m.id, m]));
      return ids.flatMap((id) => {
        const m = byId.get(id);
        if (!m) return [];
        const sub = m.subscriptions[0];
        return [{ memberId: m.id, subscriptionId: sub?.id ?? null, name: m.name, code: m.member_code, phoneRaw: m.phone, endDate: sub?.subscription_end_date ?? null, packageName: sub?.subscription_type ?? null }];
      });
    }

    if (dto.source === 'birthdays') return this.birthdayCandidates(dto, today, memberWhere);

    let range: { gte: string; lte: string };
    if (dto.source === 'expired') {
      const to = dto.expiredTo && dto.expiredTo < today ? dto.expiredTo : addDays(today, -1);
      const from = dto.expiredFrom ?? addDays(today, -30);
      if (from > to) throw new BadRequestException('تاريخ البداية لازم يكون قبل تاريخ النهاية');
      range = { gte: from, lte: to };
    } else {
      range = { gte: today, lte: addDays(today, dto.withinDays ?? 7) };
    }

    const subs = await this.prisma.club_subscriptions.findMany({
      where: {
        branch_id: dto.branchId,
        member_id: { not: null },
        subscription_end_date: range,
        status: { not: 'frozen' },
        member: { is: memberWhere },
        ...(dto.packageName ? { subscription_type: dto.packageName } : {}),
      },
      select: { id: true, member_id: true, subscription_end_date: true, subscription_type: true, member: { select: memberSelect } },
      orderBy: [{ subscription_end_date: 'desc' }, { id: 'desc' }],
    });

    // A member who already holds anything ending later has renewed (or bought something else).
    const memberIds = [...new Set(subs.map((s) => s.member_id!))];
    const later = memberIds.length
      ? await this.prisma.club_subscriptions.groupBy({
          by: ['member_id'],
          where: { member_id: { in: memberIds } },
          _max: { subscription_end_date: true },
        })
      : [];
    const latestEnd = new Map(later.map((g) => [g.member_id!, g._max.subscription_end_date ?? '']));

    const seen = new Set<number>();
    const rows: AudienceRow[] = [];
    for (const s of subs) {
      const memberId = s.member_id!;
      if (seen.has(memberId) || !s.member) continue;
      seen.add(memberId);
      if ((latestEnd.get(memberId) ?? '') > s.subscription_end_date) continue;
      rows.push({ memberId, subscriptionId: s.id, name: s.member.name, code: s.member.member_code, phoneRaw: s.member.phone, endDate: s.subscription_end_date, packageName: s.subscription_type });
    }
    // Soonest-expiring (or most recently expired) first.
    return dto.source === 'expiring' ? rows.reverse() : rows;
  }

  /** Members of the branch whose birthday is today (Cairo), with their latest subscription. */
  private async birthdayCandidates(dto: WaAudienceDto, today: string, memberWhere: Prisma.club_membersWhereInput): Promise<AudienceRow[]> {
    const members = await this.prisma.club_members.findMany({
      where: {
        ...memberWhere,
        branch_id: dto.branchId,
        OR: birthdaySuffixes(today).map((suffix) => ({ date_of_birth: { endsWith: suffix } })),
        ...(dto.activeOnly ? { subscriptions: { some: { subscription_end_date: { gte: today } } } } : {}),
      },
      select: {
        id: true, name: true, member_code: true, phone: true, date_of_birth: true,
        subscriptions: { orderBy: { subscription_end_date: 'desc' }, take: 1, select: { id: true, subscription_end_date: true, subscription_type: true } },
      },
      orderBy: { id: 'asc' },
    });
    return members.flatMap((m) => {
      const age = ageOn(m.date_of_birth, today);
      if (age === null) return [];
      const sub = m.subscriptions[0];
      return [{ memberId: m.id, subscriptionId: sub?.id ?? null, name: m.name, code: m.member_code, phoneRaw: m.phone, endDate: sub?.subscription_end_date ?? null, packageName: sub?.subscription_type ?? null, age }];
    });
  }

  private async branchName(branchId: number): Promise<string> {
    const branch = await this.prisma.tbl_branches.findUnique({ where: { branch_id: branchId }, select: { branch_name: true } });
    return branch?.branch_name || '';
  }

  // ── campaigns ─────────────────────────────────────────────────────────────

  async createCampaign(dto: CreateWaCampaignDto, user: JwtUser) {
    return this.queueCampaign(dto, await this.buildAudience(dto, user), user.sub);
  }

  /** The daily birthday job: no user, the branch comes from a paired sending device. */
  async createSystemCampaign(dto: CreateWaCampaignDto) {
    const built = await this.audienceFor(dto);
    if (!built.recipients.some((r) => !r.skip && r.phone)) return { id: null, queued: 0, skipped: built.recipients.length };
    return this.queueCampaign(dto, built, null);
  }

  private async queueCampaign(dto: CreateWaCampaignDto, built: Awaited<ReturnType<WaCampaignsService['audienceFor']>>, createdBy: number | null) {
    const sendable = built.recipients.filter((r) => !r.skip && r.phone);
    if (!sendable.length) throw new BadRequestException('مفيش ولا عضو هيتبعتله — راجع الفلتر');
    const skipped = built.recipients.length - sendable.length;
    const { body, name, templateId, start, excludeMemberIds: _ex, ...filters } = dto;
    const campaign = await this.prisma.$transaction(async (tx) => {
      const row = await tx.wa_campaigns.create({
        data: {
          name: name.trim(),
          branch_id: dto.branchId,
          source: dto.source,
          filters: { ...filters, skipped } as Prisma.InputJsonValue,
          template_id: templateId ?? null,
          body,
          status: start ? 'running' : 'ready',
          started_at: start ? new Date() : null,
          created_by: createdBy,
        },
      });
      await tx.wa_messages.createMany({
        data: sendable.map((r) => ({
          campaign_id: row.id,
          branch_id: dto.branchId,
          member_id: r.memberId,
          subscription_id: r.subscriptionId,
          member_name: r.name.slice(0, 200),
          phone: r.phone!,
          body: r.body,
        })),
      });
      return row;
    });
    return { id: campaign.id, queued: sendable.length, skipped };
  }

  async listCampaigns(q: ListWaCampaignsDto, user: JwtUser) {
    const scope = this.branches.resolveListFilter(user, q.branch ?? null);
    const where: Prisma.wa_campaignsWhereInput = {
      ...(scope !== null ? { branch_id: { in: scope } } : {}),
      ...(q.status ? { status: q.status } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.wa_campaigns.findMany({ where, orderBy: { id: 'desc' }, skip: q.skip, take: q.take }),
      this.prisma.wa_campaigns.count({ where }),
    ]);
    const counts = await this.counts(rows.map((r) => r.id));
    return paginated(rows.map((r) => this.campaignView(r, counts.get(r.id))), total, q.page, q.pageSize);
  }

  async getCampaign(id: number, user: JwtUser) {
    const row = await this.accessibleCampaign(id, user);
    const counts = await this.counts([id]);
    return { ...this.campaignView(row, counts.get(id)), body: row.body, filters: row.filters };
  }

  async listMessages(id: number, q: ListWaMessagesDto, user: JwtUser) {
    await this.accessibleCampaign(id, user);
    const where: Prisma.wa_messagesWhereInput = {
      campaign_id: id,
      ...(q.status ? { status: q.status } : {}),
      ...(q.search?.trim() ? { OR: [{ member_name: { contains: q.search.trim() } }, { phone: { contains: q.search.trim().replace(/^0/, '') } }] } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.wa_messages.findMany({ where, orderBy: { id: 'asc' }, skip: q.skip, take: q.take }),
      this.prisma.wa_messages.count({ where }),
    ]);
    return paginated(
      rows.map((m) => ({
        id: m.id,
        memberId: m.member_id,
        name: m.member_name,
        phone: displayPhone(m.phone),
        body: m.body,
        status: m.status,
        reason: m.reason,
        sentAt: m.sent_at,
        claimedAt: m.claimed_at,
      })),
      total,
      q.page,
      q.pageSize,
    );
  }

  async setCampaignStatus(id: number, action: 'start' | 'pause' | 'cancel', user: JwtUser) {
    const row = await this.accessibleCampaign(id, user);
    const allowed: Record<typeof action, string[]> = { start: ['ready', 'paused'], pause: ['running'], cancel: ['ready', 'running', 'paused'] };
    if (!allowed[action].includes(row.status)) throw new ConflictException('الحالة الحالية للحملة مش بتسمح بده');
    if (action === 'cancel') {
      await this.prisma.$transaction([
        this.prisma.wa_messages.updateMany({ where: { campaign_id: id, status: 'queued' }, data: { status: 'cancelled' } }),
        this.prisma.wa_campaigns.update({ where: { id }, data: { status: 'cancelled', finished_at: new Date() } }),
      ]);
    } else {
      await this.prisma.wa_campaigns.update({
        where: { id },
        data: action === 'start' ? { status: 'running', started_at: row.started_at ?? new Date() } : { status: 'paused' },
      });
    }
    return this.getCampaign(id, user);
  }

  /** Failed sends go back to the queue — except numbers WhatsApp said don't exist. */
  async retryFailed(id: number, user: JwtUser) {
    const row = await this.accessibleCampaign(id, user);
    if (row.status === 'cancelled') throw new ConflictException('الحملة ملغية');
    const result = await this.prisma.wa_messages.updateMany({
      where: { campaign_id: id, status: 'failed', NOT: { reason: { in: ['not_on_whatsapp'] } } },
      data: { status: 'queued', reason: null, device_id: null, permit_id: null, claimed_at: null },
    });
    // Retrying means "send them again": a finished campaign goes straight back to running.
    if (result.count && row.status === 'done') await this.prisma.wa_campaigns.update({ where: { id }, data: { status: 'running', finished_at: null } });
    return { requeued: result.count };
  }

  /** Resolve an "uncertain" message after a person checked the chat. */
  async resolveMessage(messageId: number, action: 'requeue' | 'mark-sent', user: JwtUser) {
    const message = await this.prisma.wa_messages.findUnique({ where: { id: messageId } });
    if (!message) throw new NotFoundException('الرسالة غير موجودة');
    const campaign = await this.accessibleCampaign(message.campaign_id, user);
    if (!['uncertain', 'failed'].includes(message.status)) throw new ConflictException('الرسالة دي مش محتاجة مراجعة');
    await this.prisma.wa_messages.update({
      where: { id: messageId },
      data: action === 'requeue'
        ? { status: 'queued', reason: null, device_id: null, permit_id: null, claimed_at: null }
        : { status: 'sent', reason: 'confirmed_by_staff', sent_at: message.sent_at ?? new Date() },
    });
    if (action === 'requeue' && campaign.status === 'done') await this.prisma.wa_campaigns.update({ where: { id: campaign.id }, data: { status: 'running', finished_at: null } });
    return { id: messageId };
  }

  private async accessibleCampaign(id: number, user: JwtUser) {
    const row = await this.prisma.wa_campaigns.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('الحملة غير موجودة');
    if (!this.branches.isBranchAllowed(user, row.branch_id)) throw new ForbiddenException('لا تملك صلاحية الوصول لبيانات هذا الفرع');
    return row;
  }

  private async counts(ids: number[]) {
    const map = new Map<number, Record<string, number>>();
    if (!ids.length) return map;
    const grouped = await this.prisma.wa_messages.groupBy({ by: ['campaign_id', 'status'], where: { campaign_id: { in: ids } }, _count: { _all: true } });
    for (const g of grouped) {
      const entry = map.get(g.campaign_id) ?? {};
      entry[g.status] = g._count._all;
      map.set(g.campaign_id, entry);
    }
    return map;
  }

  private campaignView(row: { id: number; name: string; branch_id: number; source: string; status: string; created_at: Date; started_at: Date | null; finished_at: Date | null }, counts: Record<string, number> = {}) {
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    return {
      id: row.id,
      name: row.name,
      branchId: row.branch_id,
      source: row.source,
      status: row.status,
      createdAt: row.created_at,
      startedAt: row.started_at,
      finishedAt: row.finished_at,
      counts: {
        total,
        queued: counts.queued ?? 0,
        sending: counts.sending ?? 0,
        sent: counts.sent ?? 0,
        failed: counts.failed ?? 0,
        uncertain: counts.uncertain ?? 0,
        cancelled: counts.cancelled ?? 0,
      },
    };
  }

  // ── devices ───────────────────────────────────────────────────────────────

  async listDevices(user: JwtUser) {
    const scope = this.branches.allowedBranchIds(user);
    const rows = await this.prisma.wa_devices.findMany({
      where: { revoked_at: null, ...(scope !== null ? { branch_id: { in: scope } } : {}) },
      orderBy: { created_at: 'asc' },
    });
    return rows.map((d) => ({
      id: d.id,
      branchId: d.branch_id,
      label: d.label,
      paired: !!d.token_hash,
      pairedAt: d.paired_at,
      lastSeenAt: d.last_seen_at,
      pairCodeActive: !!d.pair_code_hash && !!d.pair_expires_at && d.pair_expires_at > new Date(),
    }));
  }

  async createDevice(dto: CreateWaDeviceDto, user: JwtUser) {
    if (!this.branches.isBranchAllowed(user, dto.branchId)) throw new ForbiddenException('لا تملك صلاحية الوصول لبيانات هذا الفرع');
    const id = randomUUID();
    const code = pairCode();
    await this.prisma.wa_devices.create({
      data: { id, branch_id: dto.branchId, label: dto.label.trim(), pair_code_hash: sha256(code), pair_expires_at: new Date(Date.now() + PAIR_CODE_TTL_MS), created_by: user.sub },
    });
    return { id, pairCode: code, expiresInMinutes: PAIR_CODE_TTL_MS / 60_000 };
  }

  /** A fresh code; the extension's current token keeps working until the code is used. */
  async newPairCode(id: string, user: JwtUser) {
    const device = await this.accessibleDevice(id, user);
    const code = pairCode();
    await this.prisma.wa_devices.update({ where: { id: device.id }, data: { pair_code_hash: sha256(code), pair_expires_at: new Date(Date.now() + PAIR_CODE_TTL_MS) } });
    return { id, pairCode: code, expiresInMinutes: PAIR_CODE_TTL_MS / 60_000 };
  }

  async revokeDevice(id: string, user: JwtUser) {
    const device = await this.accessibleDevice(id, user);
    await this.prisma.wa_devices.update({ where: { id: device.id }, data: { revoked_at: new Date(), token_hash: null, pair_code_hash: null } });
    await this.control.release(device.id).catch(() => undefined);
    return { id };
  }

  private async accessibleDevice(id: string, user: JwtUser) {
    const device = await this.prisma.wa_devices.findUnique({ where: { id } });
    if (!device || device.revoked_at) throw new NotFoundException('الجهاز غير موجود');
    if (!this.branches.isBranchAllowed(user, device.branch_id)) throw new ForbiddenException('لا تملك صلاحية الوصول لبيانات هذا الفرع');
    return device;
  }

  // ── «لم يحضر منذ مدة» (attendance list) ─────────────────────────────────────

  async absenceSettings() {
    await this.seedDefaultTemplates();
    const { absence } = await readTemplateOptions(this.prisma);
    return absence;
  }

  async updateAbsenceSettings(dto: WaAbsenceSettingsDto) {
    if (dto.templateId !== undefined && !(await this.prisma.wa_templates.findUnique({ where: { id: dto.templateId }, select: { id: true } }))) {
      throw new BadRequestException('القالب غير موجود');
    }
    const options = await updateTemplateOptions(this.prisma, (o) => {
      if (dto.yellowDays !== undefined) o.absence.yellowDays = dto.yellowDays;
      if (dto.redDays !== undefined) o.absence.redDays = dto.redDays;
      if (dto.templateId !== undefined) o.absence.templateId = dto.templateId;
    });
    if (options.absence.redDays < options.absence.yellowDays) {
      await updateTemplateOptions(this.prisma, (o) => { o.absence.redDays = o.absence.yellowDays; });
    }
    return this.absenceSettings();
  }

  /**
   * For the members on one page of the attendance list: the last visit before that day, how many
   * days ago, the colour, and — from the yellow threshold on — the «لم يحضر منذ مدة» message ready
   * to open in WhatsApp (sent by hand from the reception phone, not by the extension).
   */
  async absenceLookup(q: WaAbsenceLookupDto, user: JwtUser) {
    await this.seedDefaultTemplates();
    const day = q.date ?? localDateString();
    const ids = [...new Set(q.members.split(',').map(Number))];
    const { absence } = await readTemplateOptions(this.prisma);
    const scope = this.branches.allowedBranchIds(user);
    const [members, visits, template] = await Promise.all([
      this.prisma.club_members.findMany({
        where: { id: { in: ids }, ...(scope !== null ? { branch_id: { in: scope } } : {}) },
        select: { id: true, name: true, member_code: true, phone: true, branch_id: true },
      }),
      this.prisma.club_attendance.groupBy({
        by: ['member_id'],
        where: { member_id: { in: ids }, attendance_date: { lt: day } },
        _max: { attendance_date: true },
      }),
      absence.templateId ? this.prisma.wa_templates.findUnique({ where: { id: absence.templateId } }) : null,
    ]);
    const lastVisit = new Map(visits.map((v) => [v.member_id, v._max.attendance_date ?? null]));
    const branchNames = new Map<number, string>();
    for (const id of new Set(members.map((m) => m.branch_id))) branchNames.set(id, await this.branchName(id));
    return {
      yellowDays: absence.yellowDays,
      redDays: absence.redDays,
      rows: members.map((m) => {
        const last = lastVisit.get(m.id) ?? null;
        const days = last ? daysBetween(last, day) : null;
        const level = days === null ? null : days >= absence.redDays ? 'red' : days >= absence.yellowDays ? 'yellow' : null;
        const phone = toWhatsAppPhone(m.phone);
        const text = level && template
          ? renderTemplate(varyTemplate(template.body), {
              name: m.name,
              first_name: firstName(m.name),
              code: m.member_code,
              days: String(days),
              last_visit: formatDate(last),
              branch: branchNames.get(m.branch_id) ?? '',
            })
          : null;
        return { memberId: m.id, lastVisit: last, days, level, phone, text };
      }),
    };
  }

  // ── opt-outs ──────────────────────────────────────────────────────────────

  async listOptOuts() {
    const rows = await this.prisma.wa_opt_outs.findMany({ orderBy: { created_at: 'desc' }, take: 2000 });
    return rows.map((o) => ({ phone: displayPhone(o.phone), key: o.phone, reason: o.reason, createdAt: o.created_at }));
  }

  async addOptOut(dto: WaOptOutDto, user: JwtUser) {
    const phone = toWhatsAppPhone(dto.phone);
    if (!phone) throw new BadRequestException('رقم الموبايل غير صحيح');
    await this.prisma.$transaction([
      this.prisma.wa_opt_outs.upsert({
        where: { phone },
        create: { phone, reason: dto.reason?.trim() || null, created_by: user.sub },
        update: { reason: dto.reason?.trim() || null },
      }),
      // Anything still waiting for this number is dropped right away.
      this.prisma.wa_messages.updateMany({ where: { phone, status: 'queued' }, data: { status: 'cancelled', reason: 'opted_out' } }),
    ]);
    return { phone: displayPhone(phone) };
  }

  async removeOptOut(key: string) {
    await this.prisma.wa_opt_outs.deleteMany({ where: { phone: key } });
    return { phone: key };
  }
}

function pairCode(): string {
  return Array.from({ length: 8 }, () => PAIR_CODE_ALPHABET[randomInt(PAIR_CODE_ALPHABET.length)]).join('');
}

export function newDeviceToken(): string {
  return `pwa_${randomBytes(32).toString('base64url')}`;
}

export { ControlUnavailableError };
