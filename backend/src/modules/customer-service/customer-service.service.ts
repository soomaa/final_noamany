import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtUser } from '../../common/types/jwt-user';
import { CreateCustomerServiceFeedbackDto, CustomerServiceCallStatus, CustomerServiceListDto, UpsertCustomerServiceQuestionDto } from './dto/customer-service.dto';

const questions = (prisma: PrismaService) => (prisma as any).cs_questions;
const feedbacks = (prisma: PrismaService) => (prisma as any).cs_feedbacks;

@Injectable()
export class CustomerServiceService {
  constructor(private readonly prisma: PrismaService) {}

  listQuestions() { return questions(this.prisma).findMany({ orderBy: { id: 'asc' } }); }
  async createQuestion(dto: UpsertCustomerServiceQuestionDto) {
    const options = this.normaliseOptions(dto);
    return questions(this.prisma).create({ data: { question_text: dto.questionText.trim(), question_type: dto.questionType, options } });
  }
  async updateQuestion(id: number, dto: UpsertCustomerServiceQuestionDto) {
    await this.ensureQuestion(id);
    return questions(this.prisma).update({ where: { id }, data: { question_text: dto.questionText.trim(), question_type: dto.questionType, options: this.normaliseOptions(dto) } });
  }
  async removeQuestion(id: number) { await this.ensureQuestion(id); return questions(this.prisma).delete({ where: { id } }); }

  async listSubscriptions(query: CustomerServiceListDto) {
    const where: any = { member_id: { not: null } };
    if (query.branchId) where.branch_id = query.branchId;
    if (query.subscriptionStatus === 'active') where.status = 'active';
    if (query.subscriptionStatus === 'expired') where.status = 'expired';
    if (query.category) where.gender = query.category === 'women' ? 'female' : 'male';
    if (query.fromDate || query.toDate) where.subscription_start_date = { ...(query.fromDate ? { gte: query.fromDate } : {}), ...(query.toDate ? { lte: query.toDate } : {}) };
    if (query.contactStatus) {
      const contactDate = query.contactFromDate || query.contactToDate
        ? { created_at: { ...(query.contactFromDate ? { gte: new Date(query.contactFromDate) } : {}), ...(query.contactToDate ? { lte: new Date(`${query.contactToDate}T23:59:59.999Z`) } : {}) } }
        : {};
      const contacted = await feedbacks(this.prisma).findMany({ where: contactDate, select: { subscription_id: true }, distinct: ['subscription_id'] });
      const ids = contacted.map((feedback: any) => feedback.subscription_id);
      where.id = query.contactStatus === 'contacted' ? { in: ids } : { notIn: ids };
    }
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.club_subscriptions.count({ where }),
      this.prisma.club_subscriptions.findMany({ where, skip: (query.page - 1) * query.pageSize, take: query.pageSize, orderBy: { id: 'desc' }, include: { member: true, type: true } }),
    ]);
    const ids = rows.map((row) => row.id);
    const latest = ids.length ? await feedbacks(this.prisma).findMany({ where: { subscription_id: { in: ids } }, orderBy: { created_at: 'desc' } }) : [];
    const bySubscription = new Map<number, any>(); latest.forEach((item: any) => { if (!bySubscription.has(item.subscription_id)) bySubscription.set(item.subscription_id, item); });
    return { data: rows.map((row) => this.subscriptionRow(row, bySubscription.get(row.id))), total, page: query.page, pageSize: query.pageSize };
  }

  async createFeedback(dto: CreateCustomerServiceFeedbackDto, user: JwtUser) {
    const subscription = await this.prisma.club_subscriptions.findFirst({ where: { id: dto.subscriptionId, member_id: dto.clientId } });
    if (!subscription) throw new BadRequestException('العميل أو الاشتراك غير صحيح');
    const configured = await this.listQuestions();
    if (dto.callStatus === CustomerServiceCallStatus.answered) {
      const given = new Map(dto.answers.map((answer) => [answer.questionId, answer.answerText?.trim() ?? '']));
      if (configured.some((question: any) => !given.get(question.id))) throw new BadRequestException('يجب الإجابة على جميع بنود الأسئلة');
      for (const question of configured) this.assertAnswer(question, given.get(question.id)!);
    }
    return this.prisma.$transaction(async (tx: any) => {
      const feedback = await tx.cs_feedbacks.create({ data: { client_id: dto.clientId, subscription_id: dto.subscriptionId, call_status: dto.callStatus, created_by: user.sub } });
      if (dto.callStatus === CustomerServiceCallStatus.answered) await tx.cs_feedback_answers.createMany({ data: dto.answers.map((answer) => ({ feedback_id: feedback.id, question_id: answer.questionId, answer_text: answer.answerText!.trim() })) });
      return feedback;
    });
  }

  async feedbackDetails(id: number) {
    const feedback = await feedbacks(this.prisma).findUnique({ where: { id }, include: { answers: { include: { question: true } } } });
    if (!feedback) throw new NotFoundException('الرأي غير موجود');
    return feedback;
  }

  async branches() { return this.prisma.tbl_branches.findMany({ orderBy: { branch_name: 'asc' }, select: { branch_id: true, branch_name: true } }); }
  private normaliseOptions(dto: UpsertCustomerServiceQuestionDto) {
    if (dto.questionType !== 'multiple_choice') return null;
    const options = (dto.options ?? []).map((option) => option.trim()).filter(Boolean);
    if (options.length < 2) throw new BadRequestException('أدخل خيارين على الأقل للاختيار المتعدد');
    return options;
  }
  private async ensureQuestion(id: number) { if (!await questions(this.prisma).findUnique({ where: { id } })) throw new NotFoundException('السؤال غير موجود'); }
  private assertAnswer(question: any, answer: string) {
    if (question.question_type === 'stars' && !['1', '2', '3', '4', '5'].includes(answer)) throw new BadRequestException('التقييم يجب أن يكون من 1 إلى 5');
    if (question.question_type === 'yes_no' && !['yes', 'no'].includes(answer)) throw new BadRequestException('إجابة نعم أو لا مطلوبة');
    if (question.question_type === 'multiple_choice' && !((question.options ?? []) as string[]).includes(answer)) throw new BadRequestException('الخيار المحدد غير صالح');
  }
  private subscriptionRow(row: any, feedback: any) {
    const recent = feedback?.created_at && new Date(feedback.created_at).getTime() >= Date.now() - 7 * 86400000;
    return { subscriptionId: row.id, clientId: row.member_id, clientName: row.member?.name ?? row.customer_name ?? '-', clientCode: row.member?.member_code ?? '-', phone: row.member?.phone ?? '-', subscription: row.type?.name ?? row.subscription_type ?? '-', startDate: row.subscription_start_date, endDate: row.subscription_end_date, feedbackId: feedback?.id ?? null, callStatus: feedback?.call_status ?? null, lastFeedbackAt: feedback?.created_at ?? null, hasRecentFeedback: Boolean(recent) };
  }
}
