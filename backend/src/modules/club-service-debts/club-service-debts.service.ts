import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { JwtUser } from '../../common/types/jwt-user';
import { paginated } from '../../common/dto/list-result';
import { ModuleLedgerService } from '../accounting/module-ledger.service';
import { ClubReceiptsService } from '../club-subscriptions/club-receipts.service';
import { primaryClubPaymentMethod, resolveClubPayments, roundMoney, toNum } from '../club-subscriptions/club-subscription.utils';
import { ListClubServiceDebtsDto, PayClubServiceDebtDto } from './dto/club-service-debts.dto';

type Tx = Prisma.TransactionClient;

export interface RecordClubServiceSaleInput {
  sourceType: 'inbody' | 'quick_service';
  sourceRef: string;
  branchId: number;
  memberId?: number | null;
  customerName: string;
  customerPhone?: string | null;
  totalAmount: number;
  paidAmount: number;
  paymentMethod?: string | null;
  payments?: { method: string; amount: number }[];
  transactionDate: string;
  description?: string | null;
  createdBy?: number;
}

@Injectable()
export class ClubServiceDebtsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: ModuleLedgerService,
    private readonly receipts: ClubReceiptsService,
    private readonly branchScope: BranchScopeService,
  ) {}

  async recordSale(input: RecordClubServiceSaleInput, tx: Tx) {
    const total = roundMoney(input.totalAmount);
    const paid = roundMoney(input.paidAmount);
    if (total <= 0 || paid < 0 || paid > total) {
      throw new BadRequestException('المبلغ المدفوع يجب أن يكون بين صفر وإجمالي الخدمة');
    }
    const splits = resolveClubPayments(paid, input.paymentMethod, input.payments);
    const remaining = roundMoney(total - paid);
    if (remaining > 0 && !input.memberId && !input.customerPhone?.trim()) {
      throw new BadRequestException('رقم الموبايل أو العضو مطلوب لحفظ المديونية');
    }

    const debt = remaining > 0
      ? await tx.club_service_debts.create({
          data: {
            debt_number: `D-${input.sourceRef}`.slice(0, 40),
            source_type: input.sourceType,
            source_ref: input.sourceRef,
            branch_id: input.branchId,
            member_id: input.memberId ?? null,
            customer_name: input.customerName.trim() || 'عميل',
            customer_phone: input.customerPhone?.trim() || null,
            description: input.description?.trim() || null,
            total_amount: total,
            paid_amount: paid,
            remaining_amount: remaining,
            status: 'outstanding',
            transaction_date: input.transactionDate,
            created_by: input.createdBy ?? null,
          },
        })
      : null;

    let receipt: any = null;
    if (paid > 0) {
      const receiptNumber = await this.receipts.nextReceiptNumber(tx);
      receipt = await tx.club_receipts.create({
        data: {
          receipt_number: receiptNumber,
          service_debt_id: debt?.id ?? null,
          member_id: input.memberId ?? null,
          member_name: input.customerName.trim() || 'عميل',
          branch_id: input.branchId,
          amount: paid,
          type: `${input.sourceType}_sale`,
          payment_method: primaryClubPaymentMethod(splits),
          receipt_date: input.transactionDate,
          status: 'مدفوعة',
          description: input.description?.trim() || null,
          created_by: input.createdBy ?? null,
          payments: { create: splits.map((row) => ({ method: row.method, amount: row.amount })) },
        },
        include: { payments: { select: { method: true, amount: true }, orderBy: { id: 'asc' } } },
      });
    }

    await this.ledger.postClubServiceSale({
      sourceType: input.sourceType,
      sourceRef: input.sourceRef,
      branchId: input.branchId,
      date: input.transactionDate,
      totalAmount: total,
      collectedAmount: paid,
      paymentMethod: input.paymentMethod,
      payments: splits,
      description: input.description,
      createdBy: input.createdBy,
    }, tx);

    return { debt, receipt, paidAmount: paid, remainingAmount: remaining, payments: splits };
  }

  private map(row: any) {
    return {
      id: row.id,
      debtNumber: row.debt_number,
      sourceType: row.source_type,
      sourceRef: row.source_ref,
      branchId: row.branch_id,
      memberId: row.member_id,
      customerName: row.customer_name,
      customerPhone: row.customer_phone,
      memberCode: row.member?.member_code ?? null,
      description: row.description,
      totalAmount: toNum(row.total_amount),
      paidAmount: toNum(row.paid_amount),
      remainingAmount: toNum(row.remaining_amount),
      status: row.status,
      transactionDate: row.transaction_date,
    };
  }

  async list(q: ListClubServiceDebtsDto, user?: JwtUser) {
    const and: Prisma.club_service_debtsWhereInput[] = [{ remaining_amount: { gt: 0 }, status: 'outstanding' }];
    const allowed = this.branchScope.allowedBranchIds(user);
    if (allowed !== null) and.push({ branch_id: { in: allowed } });
    if (q.branchId != null) and.push({ branch_id: q.branchId });
    if (q.memberId != null) and.push({ member_id: q.memberId });
    if (q.search?.trim()) {
      const search = q.search.trim();
      and.push({ OR: [
        { customer_name: { contains: search } },
        { customer_phone: { contains: search } },
        { debt_number: { contains: search } },
        { source_ref: { contains: search } },
        { member: { is: { OR: [{ name: { contains: search } }, { member_code: { contains: search } }, { phone: { contains: search } }] } } },
      ] });
    }
    const where = { AND: and };
    const [rows, total] = await Promise.all([
      this.prisma.club_service_debts.findMany({ where, include: { member: { select: { member_code: true } } }, orderBy: [{ remaining_amount: 'desc' }, { transaction_date: 'desc' }], skip: q.skip, take: q.take }),
      this.prisma.club_service_debts.count({ where }),
    ]);
    return paginated(rows.map((row) => this.map(row)), total, q.page, q.pageSize);
  }

  async pay(id: number, body: PayClubServiceDebtDto, user?: JwtUser) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM club_service_debts WHERE id = ${id} FOR UPDATE`;
      const debt = await tx.club_service_debts.findUnique({ where: { id } });
      if (!debt || debt.status !== 'outstanding') throw new NotFoundException('المديونية غير موجودة أو تم سدادها');
      if (!this.branchScope.isBranchAllowed(user, debt.branch_id)) throw new ForbiddenException('لا تملك صلاحية الوصول لهذا الفرع');
      const amount = roundMoney(body.amount);
      const remainingBefore = toNum(debt.remaining_amount);
      if (amount <= 0 || amount > remainingBefore) throw new BadRequestException('مبلغ السداد يتجاوز المتبقي');
      const splits = resolveClubPayments(amount, body.paymentMethod, body.payments);
      const receiptNumber = await this.receipts.nextReceiptNumber(tx);
      const receipt = await tx.club_receipts.create({
        data: {
          receipt_number: receiptNumber,
          service_debt_id: debt.id,
          member_id: debt.member_id,
          member_name: debt.customer_name,
          branch_id: debt.branch_id,
          amount,
          type: 'service_debt_payment',
          payment_method: primaryClubPaymentMethod(splits),
          receipt_date: new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(new Date()),
          status: 'مدفوعة',
          description: `سداد ${debt.debt_number}`,
          created_by: user?.sub ?? null,
          payments: { create: splits.map((row) => ({ method: row.method, amount: row.amount })) },
        },
        include: { payments: { select: { method: true, amount: true }, orderBy: { id: 'asc' } } },
      });
      const remaining = roundMoney(remainingBefore - amount);
      const updated = await tx.club_service_debts.update({ where: { id }, data: { paid_amount: { increment: amount }, remaining_amount: remaining, status: remaining === 0 ? 'paid' : 'outstanding' } });
      await this.ledger.postClubServiceDebtPayment({ receiptNumber, branchId: debt.branch_id, date: receipt.receipt_date, amount, payments: splits, paymentMethod: body.paymentMethod, createdBy: user?.sub }, tx);
      return { debt: this.map(updated), receipt };
    });
  }
}
