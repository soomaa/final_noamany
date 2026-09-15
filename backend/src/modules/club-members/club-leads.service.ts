import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtUser } from '../../common/types/jwt-user';
import { EmployeesService } from '../employees/employees.service';

type LeadQuery = { page?: unknown; pageSize?: unknown; status?: unknown; search?: unknown };
type ReminderKind = 'call' | 'follow_up';
const STATUS_LABELS: Record<string, string> = { new: 'جديد', in_progress: 'قيد المتابعة', follow_later: 'متابعة لاحقًا', qualified: 'مؤهل', converted: 'تم الاشتراك', lost: 'غير مؤهل' };
const SOURCE_LABELS: Record<string, string> = { walk_in: 'زيارة الفرع', phone: 'اتصال', social_media: 'التواصل الاجتماعي', referral: 'ترشيح' };

@Injectable()
export class ClubLeadsService {
  constructor(private readonly prisma: PrismaService, private readonly scope: BranchScopeService, private readonly employees: EmployeesService) {}

  private async owner(user: JwtUser) {
    if (!user.emp_code || !(await this.employees.isSalesEmployee(user.emp_code))) throw new ForbiddenException('هذه البوابة متاحة لأخصائي المبيعات فقط');
    return user.emp_code;
  }

  private scopeClauses(user: JwtUser) {
    const branches = this.scope.resolveListFilter(user, null);
    return [{ assigned_to_id: user.emp_code! }, ...(branches === null ? [] : [{ branch_id: { in: branches } }])];
  }

  private pagination(query: LeadQuery, fallback = 25) {
    const requestedPage = Number(query.page);
    const requestedSize = Number(query.pageSize);
    return {
      page: Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1,
      pageSize: Number.isInteger(requestedSize) && requestedSize > 0 ? Math.min(100, requestedSize) : fallback,
    };
  }

  async mine(user: JwtUser, query: LeadQuery = {}) {
    await this.owner(user);
    const { page, pageSize } = this.pagination(query, 50);
    const status = typeof query.status === 'string' ? query.status.trim() : '';
    const search = typeof query.search === 'string' ? query.search.trim() : '';
    const and: Record<string, unknown>[] = [...this.scopeClauses(user), status && status !== 'following' ? { status } : { status: { notIn: ['converted', 'lost'] } }];
    if (search) and.push({ OR: [{ full_name: { contains: search } }, { phone: { contains: search } }, { notes: { contains: search } }] });
    const where = { AND: and };
    const [total, rows] = await Promise.all([
      this.prisma.club_leads.count({ where }),
      this.prisma.club_leads.findMany({ where, orderBy: [{ created_at: 'desc' }, { id: 'desc' }], skip: (page - 1) * pageSize, take: pageSize }),
    ]);
    return { data: rows.map((row) => this.map(row)), total, page, pageSize };
  }

  async findOne(id: number, user: JwtUser) {
    await this.owner(user);
    const row = await this.prisma.club_leads.findFirst({ where: { AND: [{ id }, ...this.scopeClauses(user)] }, include: { follow_ups: { orderBy: { created_at: 'desc' } } } });
    if (!row) throw new NotFoundException('العميل المحتمل غير موجود');
    const [subscription, creatorNames] = await Promise.all([
      this.subscriptionForMember(row.converted_member_id, row.branch_id),
      this.creatorNames(row.follow_ups),
    ]);
    return this.map(row, subscription, creatorNames);
  }

  async reminders(user: JwtUser, query: LeadQuery = {}) {
    await this.owner(user);
    const { page: requestedPage, pageSize } = this.pagination(query);
    const rows = await this.prisma.club_leads.findMany({ where: { AND: [...this.scopeClauses(user), { status: { notIn: ['lost', 'qualified'] } }, { OR: [{ next_call_at: { not: null } }, { next_follow_up_at: { not: null } }] }] } });
    const reminders = rows.flatMap((row) => {
      const lead = this.map(row);
      return ([['call', row.next_call_at], ['follow_up', row.next_follow_up_at]] as const).flatMap(([kind, dueAt]) => dueAt ? [{ id: `${row.id}:${kind}`, kind, dueAt, lead }] : []);
    }).sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime() || a.lead.id - b.lead.id || a.kind.localeCompare(b.kind));
    const total = reminders.length;
    const page = Math.min(requestedPage, Math.max(1, Math.ceil(total / pageSize)));
    return { data: reminders.slice((page - 1) * pageSize, page * pageSize), page, pageSize, total, overdue: reminders.filter((item) => item.dueAt.getTime() < Date.now()).length };
  }

  async completeReminder(id: number, dto: Record<string, unknown>, user: JwtUser) {
    await this.owner(user);
    if (dto.kind !== 'call' && dto.kind !== 'follow_up') throw new BadRequestException('نوع التنبيه غير صحيح');
    const kind = dto.kind as ReminderKind;
    const dueAt = new Date(String(dto.dueAt ?? ''));
    if (Number.isNaN(dueAt.getTime())) throw new BadRequestException('موعد التنبيه غير صحيح');
    const field = kind === 'call' ? 'next_call_at' : 'next_follow_up_at';
    await this.prisma.$transaction(async (tx) => {
      const result = await tx.club_leads.updateMany({ where: { AND: [{ id }, ...this.scopeClauses(user), { [field]: dueAt }] }, data: { [field]: null } });
      if (!result.count) throw new BadRequestException('تغير هذا الموعد أو لم يعد العميل مسندًا لك. حدّث التنبيهات.');
      await tx.club_lead_follow_ups.create({ data: { lead_id: id, activity_type: 'system', note: kind === 'call' ? 'تم إنجاز تنبيه الاتصال' : 'تم إنجاز تنبيه المتابعة', created_by: user.emp_code ?? user.sub } });
    });
    return { completed: true };
  }

  async followUp(id: number, dto: Record<string, unknown>, user: JwtUser) {
    await this.owner(user);
    const activityType = typeof dto.activityType === 'string' ? dto.activityType : 'note';
    if (!['call', 'conversation', 'meeting', 'note'].includes(activityType)) throw new BadRequestException('نوع التواصل غير صحيح');
    if (activityType === 'call' && typeof dto.answered !== 'boolean') throw new BadRequestException('حدد هل تم الرد');
    const note = typeof dto.note === 'string' ? dto.note.trim() : '';
    if (!note && dto.answered !== false) throw new BadRequestException('ملاحظات المتابعة مطلوبة');
    const requestedStatus = typeof dto.status === 'string' && dto.status ? dto.status : 'in_progress';
    if (!['in_progress', 'follow_later', 'lost', 'converted'].includes(requestedStatus)) throw new BadRequestException('حالة المتابعة غير صحيحة');
    const nextFollowUpAt = this.optionalDate(dto.nextFollowUpAt, 'موعد المتابعة غير صحيح');
    const nextCallAt = this.optionalDate(dto.nextCallAt, 'موعد الاتصال غير صحيح');
    if (requestedStatus === 'follow_later' && !nextFollowUpAt) throw new BadRequestException('حدد موعد المتابعة القادم');
    const lead = await this.prisma.club_leads.findFirst({ where: { AND: [{ id }, ...this.scopeClauses(user)] } });
    if (!lead) throw new NotFoundException('العميل المحتمل غير موجود');
    if (requestedStatus === 'converted' && lead.status !== 'converted') throw new BadRequestException('حالة المتابعة غير صحيحة');
    const status = lead.status === 'converted' ? 'converted' : requestedStatus;
    if (status === 'follow_later' && !nextFollowUpAt) throw new BadRequestException('حدد موعد المتابعة القادم');
    const interests = typeof dto.interests === 'string' ? dto.interests.trim() : '';
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.club_leads.updateMany({
        where: { AND: [{ id }, { status: lead.status }, ...this.scopeClauses(user)] },
        data: { status, last_contacted_at: new Date(), ...(nextFollowUpAt ? { next_follow_up_at: nextFollowUpAt } : {}), ...(nextCallAt ? { next_call_at: nextCallAt } : {}) },
      });
      if (!updated.count) {
        throw new BadRequestException('تغير ملف العميل أو لم يعد مسندًا لك. أعد تحميل الملف.');
      }
      await tx.club_lead_follow_ups.create({ data: { lead_id: id, note: note || 'لم يتم الرد', status, activity_type: activityType, answered: activityType === 'call' ? dto.answered as boolean : null, interests: interests || null, next_follow_up_at: nextFollowUpAt ?? null, next_call_at: nextCallAt ?? null, created_by: user.emp_code ?? user.sub } });
    });
    return { ok: true };
  }

  async ensureRenewalLead(memberId: number, user: JwtUser) {
    await this.owner(user);
    const branches = this.scope.resolveListFilter(user, null);
    const soldSubscription = await this.prisma.club_subscriptions.findFirst({ where: { member_id: memberId, sales_id: user.emp_code, ...(branches === null ? {} : { branch_id: { in: branches } }) }, select: { member_id: true } });
    const member = await this.prisma.club_members.findFirst({ where: { id: memberId, is_deleted: false, ...(branches === null ? {} : { branch_id: { in: branches } }), OR: [{ sales_id: user.emp_code }, { created_by: user.sub }, ...(soldSubscription ? [{ id: memberId }] : [])] }, select: { id: true, name: true, phone: true, branch_id: true } });
    if (!member) throw new NotFoundException('العضو غير موجود ضمن عملائك');
    if (!member.phone?.trim()) throw new BadRequestException('لا يوجد رقم موبايل مسجل لهذا العضو');
    const phone = member.phone.trim();
    const existing = await this.prisma.club_leads.findFirst({ where: { branch_id: member.branch_id, OR: [{ converted_member_id: member.id }, { converted_member_id: null, phone }] }, orderBy: [{ converted_member_id: 'desc' }, { id: 'desc' }], include: { follow_ups: { orderBy: { created_at: 'desc' } } } });
    if (existing?.assigned_to_id != null && existing.assigned_to_id !== user.emp_code) throw new ForbiddenException('ملف هذا العضو مسند إلى أخصائي مبيعات آخر');
    if (existing) {
      const row = await this.prisma.club_leads.update({ where: { id: existing.id }, data: { assigned_to_id: user.emp_code, converted_member_id: existing.converted_member_id ?? member.id }, include: { follow_ups: { orderBy: { created_at: 'desc' } } } });
      const [subscription, creatorNames] = await Promise.all([
        this.subscriptionForMember(member.id, member.branch_id),
        this.creatorNames(row.follow_ups),
      ]);
      return this.map(row, subscription, creatorNames);
    }
    const row = await this.prisma.club_leads.create({ data: { full_name: member.name.trim(), phone, source: 'walk_in', status: 'converted', assigned_to_id: user.emp_code, converted_member_id: member.id, notes: 'ملف متابعة تجديد العضوية', branch_id: member.branch_id, created_by: user.sub }, include: { follow_ups: true } });
    const [subscription, creatorNames] = await Promise.all([
      this.subscriptionForMember(member.id, member.branch_id),
      this.creatorNames(row.follow_ups),
    ]);
    return this.map(row, subscription, creatorNames);
  }

  private optionalDate(value: unknown, message: string) {
    if (value == null || value === '') return undefined;
    const date = new Date(String(value));
    if (Number.isNaN(date.getTime())) throw new BadRequestException(message);
    return date;
  }

  private async subscriptionForMember(memberId: number | null | undefined, branchId: number | null | undefined) {
    if (memberId == null) return null;
    const row = await this.prisma.club_subscriptions.findFirst({
      where: { member_id: memberId, ...(branchId == null ? {} : { branch_id: branchId }) },
      orderBy: [{ subscription_end_date: 'desc' }, { id: 'desc' }],
      select: {
        subscription_number: true,
        subscription_type: true,
        paid_amount: true,
        subscription_start_date: true,
        subscription_end_date: true,
        type: { select: { name: true } },
      },
    });
    if (!row) return null;
    return {
      subscriptionNumber: row.subscription_number,
      packageName: row.type?.name ?? row.subscription_type ?? null,
      paidAmount: Number(row.paid_amount ?? 0),
      startDate: row.subscription_start_date,
      endDate: row.subscription_end_date,
    };
  }

  private async creatorNames(followUps: Array<{ created_by?: number | null }> | undefined) {
    const ids = [...new Set((followUps ?? []).map((item) => item.created_by).filter((id): id is number => id != null))];
    if (!ids.length) return new Map<number, string>();
    const rows = await this.prisma.employees.findMany({
      where: { id: { in: ids } },
      select: { id: true, employee: true },
    });
    return new Map(rows.map((row) => [row.id, row.employee ?? `#${row.id}`]));
  }

  private map(
    row: any,
    subscription: Awaited<ReturnType<ClubLeadsService['subscriptionForMember']>> = null,
    creatorNames = new Map<number, string>(),
  ) {
    return { id: row.id, fullName: row.full_name, phone: row.phone, source: row.source ?? null, sourceLabel: SOURCE_LABELS[row.source] ?? row.source ?? '', status: row.status, statusLabel: STATUS_LABELS[row.status] ?? row.status, convertedMemberId: row.converted_member_id ?? null, notes: row.notes ?? null, lastContactedAt: row.last_contacted_at ?? null, nextCallAt: row.next_call_at ?? null, nextFollowUpAt: row.next_follow_up_at ?? null, branchId: row.branch_id, createdAt: row.created_at, subscription, followUps: row.follow_ups?.map((item: any) => ({ id: item.id, note: item.note, status: item.status ?? null, activityType: item.activity_type, answered: item.answered, interests: item.interests ?? null, nextFollowUpAt: item.next_follow_up_at ?? null, nextCallAt: item.next_call_at ?? null, createdByName: item.created_by != null ? creatorNames.get(item.created_by) ?? null : null, createdAt: item.created_at })) ?? [] };
  }
}
