import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, QuickSaleStatus, SalesPaymentMethod } from "@prisma/client";
import { paginated } from "../../common/dto/list-result";
import { PrismaService } from "../../common/prisma/prisma.service";
import { ModuleLedgerService } from "../accounting/module-ledger.service";
import {
  BillingPreviewQueryDto,
  CreateBillingStatementDto,
  ListBillingStatementsDto,
  SettleBillingStatementDto,
} from "./dto/billing-statements.dto";
import { localDateString, toDecimal, toNumber } from "./sales.utils";

@Injectable()
export class BillingStatementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: ModuleLedgerService,
  ) {}

  private salesWhere(
    q: BillingPreviewQueryDto,
  ): Prisma.sales_quick_salesWhereInput {
    return {
      sale_type: q.accountType,
      ...(q.accountType === "employee"
        ? { employee_id: q.accountId }
        : { partner_id: q.accountId }),
      status: QuickSaleStatus.completed,
      billing_status: "unbilled",
      ...(q.billingCycle ? { billing_cycle: q.billingCycle } : {}),
      sale_date: { gte: q.periodStart, lte: q.periodEnd },
      ...(q.branchId ? { branch_id: q.branchId } : {}),
    };
  }

  async preview(q: BillingPreviewQueryDto) {
    if (q.periodStart > q.periodEnd)
      throw new BadRequestException("بداية الفترة يجب أن تسبق نهايتها");
    const sales = await this.prisma.sales_quick_sales.findMany({
      where: this.salesWhere(q),
      include: { items: true },
      orderBy: [{ sale_date: "asc" }, { daily_number: "asc" }],
    });
    const account =
      q.accountType === "employee"
        ? await this.prisma.employees.findUnique({
            where: { id: q.accountId },
            select: { employee: true, emp_code: true },
          })
        : await this.prisma.cafe_partners.findUnique({
            where: { id: q.accountId },
            select: { name: true },
          });
    if (!account)
      throw new NotFoundException(
        q.accountType === "employee" ? "الموظف غير موجود" : "الشريك غير موجود",
      );
    return {
      accountType: q.accountType,
      accountId: q.accountId,
      accountName: "employee" in account ? account.employee : account.name,
      periodStart: q.periodStart,
      periodEnd: q.periodEnd,
      count: sales.length,
      totalAmount: sales.reduce(
        (sum, sale) => sum + toNumber(sale.total_amount),
        0,
      ),
      sales: sales.map((sale) => ({
        id: sale.id,
        saleNumber: sale.sale_number,
        dailyNumber: sale.daily_number,
        saleDate: sale.sale_date,
        saleTime: sale.sale_time,
        amount: toNumber(sale.total_amount),
        billingCycle: sale.billing_cycle,
        items: sale.items.map((item) => ({
          name: item.name,
          quantity: toNumber(item.quantity),
          amount: toNumber(item.line_total),
        })),
      })),
    };
  }

  async create(dto: CreateBillingStatementDto, userId: number) {
    const preview = await this.preview(dto);
    const selected = dto.saleIds?.length
      ? preview.sales.filter((sale) => dto.saleIds!.includes(sale.id))
      : preview.sales;
    if (!selected.length)
      throw new BadRequestException(
        "لا توجد فواتير غير مسواة في الفترة المحددة",
      );
    if (dto.saleIds?.length && selected.length !== new Set(dto.saleIds).size) {
      throw new BadRequestException("بعض الفواتير المختارة غير متاحة للتجميع");
    }
    const total = selected.reduce((sum, sale) => sum + sale.amount, 0);
    const statementNumber = `ST-${localDateString().replaceAll("-", "")}-${dto.accountType === "employee" ? "E" : "P"}-${Date.now().toString().slice(-8)}`;
    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.sales_billing_statements.create({
        data: {
          statement_number: statementNumber,
          account_type: dto.accountType,
          employee_id: dto.accountType === "employee" ? dto.accountId : null,
          partner_id: dto.accountType === "partner" ? dto.accountId : null,
          billing_cycle: dto.billingCycle,
          period_start: dto.periodStart,
          period_end: dto.periodEnd,
          total_amount: toDecimal(total),
          branch_id: dto.branchId ?? null,
          notes: dto.notes?.trim() || null,
          created_by: userId,
          items: {
            create: selected.map((sale) => ({
              quick_sale_id: sale.id,
              amount: toDecimal(sale.amount),
            })),
          },
        },
        include: { items: { include: { sale: true } } },
      });
      await tx.sales_quick_sales.updateMany({
        where: {
          id: { in: selected.map((sale) => sale.id) },
          billing_status: "unbilled",
        },
        data: { billing_status: "in_statement" },
      });
      await tx.sales_invoice_events.createMany({
        data: selected.map((sale) => ({
          quick_sale_id: sale.id,
          event_type: "billing_statement_issued",
          notes: `تمت إضافة الفاتورة إلى كشف الحساب ${statementNumber}`,
          created_by: userId,
        })),
      });
      return created;
    });
    return this.map(row);
  }

  async settle(id: number, dto: SettleBillingStatementDto, userId: number) {
    const statement = await this.prisma.sales_billing_statements.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!statement) throw new NotFoundException("كشف الحساب غير موجود");
    if (statement.status !== "issued")
      throw new BadRequestException("تمت تسوية هذا الكشف بالفعل");
    if (
      statement.account_type === "employee" &&
      dto.settlementMethod === "profit_share_deduction"
    ) {
      throw new BadRequestException("خصم الأرباح متاح للشريك فقط");
    }
    if (
      statement.account_type === "partner" &&
      dto.settlementMethod === "payroll_deduction"
    ) {
      throw new BadRequestException("خصم الراتب متاح للموظف فقط");
    }
    if (dto.settlementMethod === "direct_payment" && !dto.paymentMethod) {
      throw new BadRequestException("اختر وسيلة الدفع");
    }
    await this.ledger.ensureChart();
    const row = await this.prisma.$transaction(async (tx) => {
      await this.ledger.postSalesStatementSettlement(
        {
          statementNumber: statement.statement_number,
          branchId: statement.branch_id,
          date: localDateString(),
          amount: toNumber(statement.total_amount),
          accountType: statement.account_type as "employee" | "partner",
          settlementMethod: dto.settlementMethod,
          paymentMethod: dto.paymentMethod as SalesPaymentMethod | undefined,
          createdBy: userId,
        },
        tx,
      );
      await tx.sales_quick_sales.updateMany({
        where: {
          id: { in: statement.items.map((item) => item.quick_sale_id) },
        },
        data: { billing_status: "settled" },
      });
      await tx.sales_invoice_events.createMany({
        data: statement.items.map((item) => ({
          quick_sale_id: item.quick_sale_id,
          event_type: "billing_statement_settled",
          notes: `تمت تسوية كشف الحساب ${statement.statement_number} بطريقة ${dto.settlementMethod}`,
          created_by: userId,
        })),
      });
      return tx.sales_billing_statements.update({
        where: { id },
        data: {
          paid_amount: statement.total_amount,
          settlement_method: dto.settlementMethod,
          payment_method: dto.paymentMethod as SalesPaymentMethod | undefined,
          status: "settled",
          settled_by: userId,
          settled_at: new Date(),
          notes: dto.notes?.trim() || statement.notes,
        },
        include: { items: { include: { sale: true } } },
      });
    });
    return this.map(row);
  }

  async list(q: ListBillingStatementsDto) {
    const where: Prisma.sales_billing_statementsWhereInput = {};
    if (q.accountType) where.account_type = q.accountType;
    if (q.accountId != null) {
      if (q.accountType === "employee") where.employee_id = q.accountId;
      else if (q.accountType === "partner") where.partner_id = q.accountId;
      else
        where.OR = [{ employee_id: q.accountId }, { partner_id: q.accountId }];
    }
    if (q.status && q.status !== "all") where.status = q.status;
    if (q.branchId) where.branch_id = q.branchId;
    if (q.dateFrom || q.dateTo)
      where.period_start = {
        ...(q.dateFrom ? { gte: q.dateFrom } : {}),
        ...(q.dateTo ? { lte: q.dateTo } : {}),
      };
    const [rows, total] = await Promise.all([
      this.prisma.sales_billing_statements.findMany({
        where,
        include: { items: { include: { sale: true } } },
        orderBy: { id: "desc" },
        skip: q.skip,
        take: q.take,
      }),
      this.prisma.sales_billing_statements.count({ where }),
    ]);
    const employeeIds = rows.flatMap((row) =>
      row.employee_id ? [row.employee_id] : [],
    );
    const partnerIds = rows.flatMap((row) =>
      row.partner_id ? [row.partner_id] : [],
    );
    const employees: Array<{ id: number; employee: string | null }> =
      employeeIds.length
        ? await this.prisma.employees.findMany({
            where: { id: { in: employeeIds } },
            select: { id: true, employee: true },
          })
        : [];
    const partners: Array<{ id: number; name: string }> = partnerIds.length
      ? await this.prisma.cafe_partners.findMany({
          where: { id: { in: partnerIds } },
          select: { id: true, name: true },
        })
      : [];
    const employeeNames = new Map<number, string | null>(
      employees.map((employee) => [employee.id, employee.employee]),
    );
    const partnerNames = new Map<number, string>(
      partners.map((partner) => [partner.id, partner.name]),
    );
    return paginated(
      rows.map((row) =>
        this.map(
          row,
          row.employee_id
            ? employeeNames.get(row.employee_id)
            : row.partner_id
              ? partnerNames.get(row.partner_id)
              : null,
        ),
      ),
      total,
      q.page,
      q.pageSize,
    );
  }

  private map(
    row: Prisma.sales_billing_statementsGetPayload<{
      include: { items: { include: { sale: true } } };
    }>,
    accountName?: string | null,
  ) {
    return {
      id: row.id,
      statementNumber: row.statement_number,
      accountType: row.account_type,
      employeeId: row.employee_id,
      partnerId: row.partner_id,
      billingCycle: row.billing_cycle,
      accountName: accountName ?? null,
      periodStart: row.period_start,
      periodEnd: row.period_end,
      totalAmount: toNumber(row.total_amount),
      paidAmount: toNumber(row.paid_amount),
      settlementMethod: row.settlement_method,
      paymentMethod: row.payment_method,
      status: row.status,
      notes: row.notes,
      branchId: row.branch_id,
      createdBy: row.created_by,
      settledBy: row.settled_by,
      settledAt: row.settled_at,
      createdAt: row.created_at,
      sales: row.items.map((item) => ({
        id: item.sale.id,
        saleNumber: item.sale.sale_number,
        dailyNumber: item.sale.daily_number,
        saleDate: item.sale.sale_date,
        amount: toNumber(item.amount),
      })),
    };
  }
}
