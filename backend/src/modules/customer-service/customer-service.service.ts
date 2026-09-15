import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { JwtUser } from '../../common/types/jwt-user';
import { PrismaService } from '../../common/prisma/prisma.service';
import { localDateString } from '../club-members/club-member.utils';

export type FollowUpQuery = {
  branchId?: number;
  gender?: string;
  membershipStatus?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
  hasOpinion?: boolean | string;
};
export type CustomerRosterQuery = {
  branchId?: number;
  gender?: string;
  /** Which side of "today" the subscription end date must fall on. */
  status: 'ongoing' | 'expired';
  /** Optional window on the subscription end date, e.g. "expiring this month" or "lapsed last month". */
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
};
export type CreateInteraction = {
  memberId?: number;
  subscriptionId?: number;
  branchId: number;
  gender?: string;
  membershipStatus?: string;
  note?: string;
  opinion?: string;
  contactDate?: string;
  answers?: Array<{ questionId: number; answer: string }>;
};

function dateOnly(value: string, message = 'التاريخ غير صحيح') {
  if (!/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(value)) throw new BadRequestException(message);
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new BadRequestException(message);
  return parsed;
}

@Injectable()
export class CustomerServiceService {
  constructor(private readonly prisma: PrismaService, private readonly branchScope: BranchScopeService) {}
  private db() { return this.prisma as unknown as Record<string, any>; }
  private assertBranch(user: JwtUser | undefined, branchId: number) {
    if (user && !this.branchScope.isBranchAllowed(user, branchId)) throw new ForbiddenException('لا يمكنك الوصول لهذا الفرع');
  }
  private assertGlobalQuestionWrite(user: JwtUser | undefined, branchId?: number | null) {
    if (!user || branchId != null) return;
    if (this.branchScope.resolveListFilter(user) !== null) {
      throw new ForbiddenException('اختر فرعًا مسموحًا؛ إدارة الأسئلة العامة متاحة للإدارة فقط');
    }
  }
  private buildWhere(q: FollowUpQuery, user?: JwtUser) {
    const where: Record<string, unknown> = {};
    if (q.branchId != null) {
      this.assertBranch(user, Number(q.branchId));
      where.branch_id = Number(q.branchId);
    } else if (user) {
      const allowed = this.branchScope.resolveListFilter(user);
      if (allowed !== null) where.branch_id = { in: allowed };
    }
    const requiredGender = this.branchScope.memberGenderFilter(user);
    if (requiredGender) {
      where.gender = requiredGender;
    } else if (q.gender) {
      if (q.gender !== 'male' && q.gender !== 'female') throw new BadRequestException('القسم غير صحيح');
      where.gender = q.gender;
    }
    if (q.membershipStatus) where.membership_status = q.membershipStatus;
    if (q.dateFrom || q.dateTo) where.contact_date = {
      ...(q.dateFrom ? { gte: dateOnly(q.dateFrom) } : {}),
      ...(q.dateTo ? { lte: dateOnly(q.dateTo) } : {}),
    };
    if (q.hasOpinion === true || q.hasOpinion === 'true') where.opinion = { not: null };
    return where;
  }
  async listFollowUps(q: FollowUpQuery, user?: JwtUser) {
    const where = this.buildWhere(q, user);
    const page = Math.max(1, Number(q.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(q.pageSize ?? 20)));
    const store = this.db().club_customer_service_interactions;
    const [rows, total] = await Promise.all([
      store.findMany({ where, orderBy: [{ contact_date: 'desc' }, { id: 'desc' }], skip: (page - 1) * pageSize, take: pageSize }),
      store.count({ where }),
    ]);
    const memberIds = [...new Set<number>(rows.map((row: any) => row.member_id).filter(Boolean))];
    const subscriptionIds = [...new Set<number>(rows.map((row: any) => row.subscription_id).filter(Boolean))];
    const [members, subscriptions] = await Promise.all([
      memberIds.length ? this.db().club_members.findMany({ where: { id: { in: memberIds } }, select: { id: true, name: true, member_code: true, phone: true } }) : [],
      subscriptionIds.length ? this.db().club_subscriptions.findMany({ where: { id: { in: subscriptionIds } }, select: { id: true, subscription_number: true, subscription_start_date: true, subscription_end_date: true, status: true } }) : [],
    ]);
    const memberById = new Map<number, any>(members.map((row: any) => [row.id, row]));
    const subscriptionById = new Map<number, any>(subscriptions.map((row: any) => [row.id, row]));
    const data = rows.map((row: any) => {
      const member = memberById.get(row.member_id);
      const subscription = subscriptionById.get(row.subscription_id);
      return {
        ...row,
        memberName: member?.name ?? null,
        memberCode: member?.member_code ?? null,
        memberPhone: member?.phone ?? null,
        subscriptionNumber: subscription?.subscription_number ?? null,
        subscriptionStartDate: subscription?.subscription_start_date ?? null,
        subscriptionEndDate: subscription?.subscription_end_date ?? null,
        subscriptionStatus: subscription?.status ?? row.membership_status ?? null,
      };
    });
    return { data, total, page, pageSize };
  }
  listOpinions(q: FollowUpQuery, user?: JwtUser) { return this.listFollowUps({ ...q, hasOpinion: true }, user); }
  /**
   * The customer-service call list: every member with an ongoing or expired subscription,
   * not merely a history of calls already logged. Ongoing/expired is derived from
   * subscription_end_date vs today (never the stored status enum, which is not guaranteed
   * to be refreshed daily), matching how the rest of the dashboard classifies subscriptions.
   */
  async listCustomers(q: CustomerRosterQuery, user?: JwtUser) {
    if (q.status !== 'ongoing' && q.status !== 'expired') throw new BadRequestException('الحالة غير صحيحة');
    const where: Record<string, unknown> = { member_id: { not: null }, member: { is_deleted: false } };
    if (q.branchId != null) {
      this.assertBranch(user, Number(q.branchId));
      where.branch_id = Number(q.branchId);
    } else if (user) {
      const allowed = this.branchScope.resolveListFilter(user);
      if (allowed !== null) where.branch_id = { in: allowed };
    }
    const requiredGender = this.branchScope.memberGenderFilter(user);
    if (requiredGender) {
      where.member = { is_deleted: false, gender: requiredGender };
    } else if (q.gender) {
      if (q.gender !== 'male' && q.gender !== 'female') throw new BadRequestException('القسم غير صحيح');
      where.member = { is_deleted: false, gender: q.gender };
    }
    const today = localDateString();
    const validatedFrom = q.dateFrom ? dateOnly(q.dateFrom).toISOString().slice(0, 10) : undefined;
    const validatedTo = q.dateTo ? dateOnly(q.dateTo).toISOString().slice(0, 10) : undefined;
    if (validatedFrom && validatedTo && validatedFrom > validatedTo) throw new BadRequestException('نطاق التاريخ غير صحيح');
    // "Ongoing" can never start before today regardless of a looser dateFrom; "expired" has no
    // implicit lower bound beyond whatever dateFrom the caller asked for.
    const lowerBound = q.status === 'ongoing'
      ? (validatedFrom && validatedFrom > today ? validatedFrom : today)
      : validatedFrom;
    where.subscription_end_date = {
      ...(lowerBound ? { gte: lowerBound } : {}),
      ...(q.status === 'expired' ? { lt: today } : {}),
      ...(validatedTo ? { lte: validatedTo } : {}),
    };
    const page = Math.max(1, Number(q.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(q.pageSize ?? 20)));
    const db = this.db();
    const [rows, total] = await Promise.all([
      db.club_subscriptions.findMany({
        where,
        orderBy: q.status === 'ongoing' ? [{ subscription_end_date: 'asc' }] : [{ subscription_end_date: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          subscription_number: true,
          subscription_type: true,
          subscription_start_date: true,
          subscription_end_date: true,
          status: true,
          branch_id: true,
          member: { select: { id: true, name: true, member_code: true, phone: true, gender: true } },
        },
      }),
      db.club_subscriptions.count({ where }),
    ]);
    return {
      data: rows.map((row: any) => ({
        subscriptionId: row.id,
        subscriptionNumber: row.subscription_number,
        subscriptionType: row.subscription_type,
        startDate: row.subscription_start_date,
        endDate: row.subscription_end_date,
        status: row.status,
        branchId: row.branch_id,
        memberId: row.member.id,
        memberName: row.member.name,
        memberCode: row.member.member_code,
        memberPhone: row.member.phone,
        gender: row.member.gender,
      })),
      total,
      page,
      pageSize,
    };
  }
  async getInteraction(id: number, user: JwtUser) {
    const row = await this.db().club_customer_service_interactions.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('متابعة خدمة العملاء غير موجودة');
    this.assertBranch(user, row.branch_id);
    if (!this.branchScope.isMemberGenderAllowed(user, row.gender)) throw new ForbiddenException('لا يمكنك الوصول لهذا القسم');
    const answers = await this.db().club_customer_service_answers.findMany({ where: { interaction_id: id }, orderBy: { id: 'asc' } });
    return { ...row, answers };
  }
  async createInteraction(input: CreateInteraction, actorId: number, user?: JwtUser) {
    if (!Number.isInteger(Number(input.branchId)) || Number(input.branchId) <= 0) throw new BadRequestException('الفرع مطلوب');
    this.assertBranch(user, Number(input.branchId));
    if (!input.note?.trim() && !input.opinion?.trim() && !input.answers?.length) throw new BadRequestException('أدخل ملاحظة أو رأيًا أو إجابات المتابعة');
    const db = this.db();
    let memberId = input.memberId ?? null;
    let resolvedGender: string | null = null;
    let resolvedMembershipStatus = input.membershipStatus ?? null;
    if (input.subscriptionId) {
      const subscription = await db.club_subscriptions.findUnique({
        where: { id: input.subscriptionId },
        select: { id: true, branch_id: true, member_id: true, status: true },
      });
      if (!subscription) throw new NotFoundException('الاشتراك غير موجود');
      if (subscription.branch_id !== Number(input.branchId)) throw new BadRequestException('الاشتراك لا يتبع فرع المتابعة');
      if (memberId && subscription.member_id && memberId !== subscription.member_id) throw new BadRequestException('الاشتراك لا يخص العضو المحدد');
      memberId = memberId ?? subscription.member_id ?? null;
      resolvedMembershipStatus = subscription.status ?? resolvedMembershipStatus;
    }
    if (memberId) {
      const member = await db.club_members.findUnique({ where: { id: memberId }, select: { id: true, branch_id: true, gender: true } });
      if (!member) throw new NotFoundException('العضو غير موجود');
      if (member.branch_id !== Number(input.branchId)) throw new BadRequestException('العضو لا يتبع فرع المتابعة');
      resolvedGender = member.gender ?? null;
    } else {
      const requiredGender = this.branchScope.memberGenderFilter(user);
      if (requiredGender) resolvedGender = requiredGender;
      else if (input.gender) {
        if (input.gender !== 'male' && input.gender !== 'female') throw new BadRequestException('القسم غير صحيح');
        resolvedGender = input.gender;
      }
    }
    if (!this.branchScope.isMemberGenderAllowed(user, resolvedGender)) throw new ForbiddenException('لا يمكنك تسجيل متابعة لهذا القسم');
    const questions = await db.club_customer_service_questions.findMany({
      where: { is_active: true, OR: [{ branch_id: null }, { branch_id: Number(input.branchId) }] },
      orderBy: { id: 'asc' },
    });
    const responses = input.answers ?? [];
    const responseIds = new Set(responses.map((response) => response.questionId));
    if (responses.length !== questions.length || responseIds.size !== questions.length || questions.some((question: any) => !responseIds.has(question.id))) {
      throw new BadRequestException('يجب إدخال إجابة واحدة لكل سؤال متابعة نشط');
    }
    const snapshots = questions.map((question: any) => {
      const answer = responses.find((response) => response.questionId === question.id)?.answer?.trim();
      if (!answer) throw new BadRequestException('إجابة سؤال المتابعة مطلوبة');
      return { id: question.id, title: question.title, version: question.version, answer };
    });
    const execute = async (tx: Record<string, any>) => {
      const interaction = await tx.club_customer_service_interactions.create({ data: {
        member_id: memberId,
        subscription_id: input.subscriptionId ?? null,
        branch_id: Number(input.branchId),
        gender: resolvedGender,
        membership_status: resolvedMembershipStatus,
        note: input.note?.trim() || null,
        opinion: input.opinion?.trim() || null,
        contact_date: dateOnly(input.contactDate ?? new Date().toISOString().slice(0, 10)),
        created_by: actorId,
      } });
      for (const snapshot of snapshots) await tx.club_customer_service_answers.create({ data: { interaction_id: interaction.id, question_id: snapshot.id, question_title: snapshot.title, question_version: snapshot.version, answer: snapshot.answer } });
      return interaction;
    };
    return typeof db.$transaction === 'function' ? db.$transaction(execute) : execute(db);
  }
  async listQuestions(query: { branchId?: number; includeInactive?: boolean } = {}, user?: JwtUser) {
    const where: Record<string, unknown> = query.includeInactive ? {} : { is_active: true };
    if (query.branchId != null) {
      this.assertBranch(user, Number(query.branchId));
      where.OR = [{ branch_id: null }, { branch_id: Number(query.branchId) }];
    } else if (user) {
      const allowed = this.branchScope.resolveListFilter(user);
      if (allowed !== null) where.OR = [{ branch_id: null }, { branch_id: { in: allowed } }];
    }
    return this.db().club_customer_service_questions.findMany({ where, orderBy: [{ title: 'asc' }, { version: 'desc' }] });
  }
  async createQuestion(input: { title: string; branchId?: number | null }, actorId: number, user?: JwtUser) {
    const title = input.title?.trim();
    if (!title) throw new BadRequestException('نص السؤال مطلوب');
    this.assertGlobalQuestionWrite(user, input.branchId);
    if (input.branchId != null) this.assertBranch(user, Number(input.branchId));
    return this.db().club_customer_service_questions.create({ data: { title, branch_id: input.branchId ?? null, version: 1, is_active: true, created_by: actorId } });
  }
  async versionQuestion(id: number, title: string, actorId: number, user: JwtUser) {
    const db = this.db();
    const nextTitle = title?.trim();
    if (!nextTitle) throw new BadRequestException('نص السؤال مطلوب');
    const execute = async (tx: Record<string, any>) => {
      const current = await tx.club_customer_service_questions.findFirst({ where: { id, is_active: true } });
      if (!current) throw new NotFoundException('سؤال خدمة العملاء غير موجود');
      this.assertGlobalQuestionWrite(user, current.branch_id);
      if (current.branch_id != null) this.assertBranch(user, current.branch_id);
      await tx.club_customer_service_questions.update({ where: { id }, data: { is_active: false } });
      return tx.club_customer_service_questions.create({ data: { title: nextTitle, branch_id: current.branch_id, version: current.version + 1, is_active: true, created_by: actorId } });
    };
    return typeof db.$transaction === 'function' ? db.$transaction(execute) : execute(db);
  }
}
