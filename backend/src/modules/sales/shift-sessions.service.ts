import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  Prisma,
  QuickSaleStatus,
  SalesPaymentMethod,
  ShiftSessionStatus,
} from "@prisma/client";
import { paginated } from "../../common/dto/list-result";
import { isDryRun, previewResponse, PreviewRow } from "../../common/preview";
import { PrismaService } from "../../common/prisma/prisma.service";
import { JwtUser } from "../../common/types/jwt-user";
import { AuthService } from "../auth/auth.service";
import { ModuleLedgerService } from "../accounting/module-ledger.service";
import { roundMoney } from "../accounting/accounting.utils";
import {
  CloseShiftSessionDto,
  CreateDrawerMovementDto,
  CurrentSessionQueryDto,
  DailyReportQueryDto,
  ListDrawerMovementsDto,
  ListShiftSessionsDto,
  OpenCustodiesQueryDto,
  ShiftSessionsReportQueryDto,
  StartShiftSessionDto,
  SwitchShiftSessionDto,
} from "./dto/shift-sessions.dto";
import { ShiftWindowService } from "./shift-window.service";
import { localDateString, toDecimal, toNumber } from "./sales.utils";
import { ShiftsService } from "./shifts.service";
import {
  custodyOutstanding,
  drawerAllocationMatches,
  drawerDifference,
  expectedDrawerBalance,
} from "./cash-drawer.math";
import { buildShiftCloseReport, ShiftClosePaymentLine } from "./shift-close-report";

type SessionRow = Prisma.sales_shift_sessionsGetPayload<{
  include: { shift: true };
}>;

export interface PaymentBreakdown {
  cash: number;
  card: number;
  wallet: number;
  transfer: number;
}

interface SaleEditSessionSnapshot {
  totalAmount: number;
  collectedAmount: number;
  discountAmount: number;
  taxAmount: number;
  paymentMethod: SalesPaymentMethod;
  payments?: { method: SalesPaymentMethod; amount: Prisma.Decimal | number }[];
}

@Injectable()
export class ShiftSessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly window: ShiftWindowService,
    private readonly auth: AuthService,
    private readonly shifts: ShiftsService,
    private readonly moduleLedger: ModuleLedgerService,
  ) {}

  private mapSession(row: SessionRow) {
    return {
      id: row.id,
      shiftId: row.shift_id,
      branchId: row.branch_id,
      userId: row.user_id,
      sessionDate: row.session_date,
      startTime: row.start_time,
      endTime: row.end_time,
      expectedStartTime: row.expected_start_time,
      expectedEndTime: row.expected_end_time,
      sessionSequence: row.session_sequence,
      handoverFromSessionId: row.handover_from_session_id,
      openingBalance: toNumber(row.opening_balance),
      transferredIn: toNumber(row.transferred_in),
      closingBalance:
        row.closing_balance != null ? toNumber(row.closing_balance) : null,
      expectedClosingBalance:
        row.expected_closing_balance != null
          ? toNumber(row.expected_closing_balance)
          : null,
      cashDifference:
        row.cash_difference != null ? toNumber(row.cash_difference) : null,
      cashDropAmount: toNumber(row.cash_drop_amount),
      retainedAmount: toNumber(row.retained_amount),
      totalSales: toNumber(row.total_sales),
      totalCash: toNumber(row.total_cash),
      totalCard: toNumber(row.total_card),
      totalWallet: toNumber(row.total_wallet),
      totalTransfer: toNumber(row.total_transfer),
      totalDiscount: toNumber(row.total_discount),
      totalTax: toNumber(row.total_tax),
      transactionsCount: row.transactions_count,
      status: row.status,
      closedBy: row.closed_by,
      notes: row.notes,
      closingNotes: row.closing_notes,
      shortageReason: row.shortage_reason,
      shift: row.shift
        ? {
            id: row.shift.id,
            shiftName: row.shift.shift_name,
            startTime: row.shift.start_time,
            endTime: row.shift.end_time,
            color: row.shift.color,
            isLastShiftOfDay: row.shift.is_last_shift_of_day,
          }
        : undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /** Payment split from a sale (uses pos_payments when mixed). */
  breakdownFromSale(
    paymentMethod: SalesPaymentMethod,
    totalAmount: number,
    payments?: {
      method: SalesPaymentMethod;
      amount: Prisma.Decimal | number;
    }[],
  ): PaymentBreakdown {
    const empty = { cash: 0, card: 0, wallet: 0, transfer: 0 };
    if (paymentMethod === SalesPaymentMethod.mixed && payments?.length) {
      return payments.reduce(
        (acc, p) => {
          const amt = toNumber(p.amount);
          if (p.method === SalesPaymentMethod.cash) acc.cash += amt;
          else if (p.method === SalesPaymentMethod.card) acc.card += amt;
          else if (p.method === SalesPaymentMethod.wallet) acc.wallet += amt;
          else if (p.method === SalesPaymentMethod.transfer)
            acc.transfer += amt;
          return acc;
        },
        { ...empty },
      );
    }
    if (paymentMethod === SalesPaymentMethod.cash)
      return { ...empty, cash: totalAmount };
    if (paymentMethod === SalesPaymentMethod.card)
      return { ...empty, card: totalAmount };
    if (paymentMethod === SalesPaymentMethod.wallet)
      return { ...empty, wallet: totalAmount };
    if (paymentMethod === SalesPaymentMethod.transfer)
      return { ...empty, transfer: totalAmount };
    return empty;
  }

  async calculateSessionSales(
    session: {
      id: number;
      session_date: string;
      branch_id: number | null;
      expected_start_time: string;
      expected_end_time: string;
    },
    db: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    const linkedSales = await db.sales_quick_sales.findMany({
      where: {
        shift_session_id: session.id,
        status: {
          in: [
            QuickSaleStatus.completed,
            QuickSaleStatus.refunded,
            QuickSaleStatus.cancelled,
          ],
        },
      },
      include: { payments: true },
    });

    // Money belongs to the session that actually handled it. Never infer ownership
    // from a configured shift window or from the customer's appointment time.
    const bookingPayments = await db.sales_booking_payments.findMany({
      where: {
        shift_session_id: session.id,
        status: "posted",
      },
    });
    const saleAdjustments = await db.sales_shift_sale_adjustments.findMany({
      where: { shift_session_id: session.id },
    });

    let totalCash = 0;
    let totalCard = 0;
    let totalWallet = 0;
    let totalTransfer = 0;
    for (const sale of linkedSales) {
      const bd = this.breakdownFromSale(
        sale.payment_method,
        toNumber(sale.collected_amount),
        sale.payments,
      );
      totalCash += bd.cash;
      totalCard += bd.card;
      totalWallet += bd.wallet;
      totalTransfer += bd.transfer;
    }
    for (const payment of bookingPayments) {
      const signed =
        payment.kind === "refund"
          ? -toNumber(payment.amount)
          : toNumber(payment.amount);
      if (payment.method === SalesPaymentMethod.cash) totalCash += signed;
      else if (payment.method === SalesPaymentMethod.card) totalCard += signed;
      else if (payment.method === SalesPaymentMethod.wallet)
        totalWallet += signed;
      else if (payment.method === SalesPaymentMethod.transfer)
        totalTransfer += signed;
    }
    for (const adjustment of saleAdjustments) {
      totalCash -= toNumber(adjustment.cash_amount);
      totalCard -= toNumber(adjustment.card_amount);
      totalWallet -= toNumber(adjustment.wallet_amount);
      totalTransfer -= toNumber(adjustment.transfer_amount);
    }

    const quickSalesTotal = linkedSales.reduce(
      (sum, sale) => sum + toNumber(sale.total_amount),
      0,
    );
    const bookingsTotal = bookingPayments.reduce(
      (sum, payment) =>
        sum +
        (payment.kind === "refund"
          ? -toNumber(payment.amount)
          : toNumber(payment.amount)),
      0,
    );
    const reversedSalesTotal = saleAdjustments.reduce(
      (sum, adjustment) => sum + toNumber(adjustment.total_amount),
      0,
    );

    return {
      totalSales: quickSalesTotal + bookingsTotal - reversedSalesTotal,
      totalCash,
      totalCard,
      totalWallet,
      totalTransfer,
      totalDiscount:
        linkedSales.reduce((sum, s) => sum + toNumber(s.discount_amount), 0) -
        saleAdjustments.reduce(
          (sum, adjustment) => sum + toNumber(adjustment.discount_amount),
          0,
        ),
      totalTax:
        linkedSales.reduce((sum, s) => sum + toNumber(s.tax_amount), 0) -
        saleAdjustments.reduce(
          (sum, adjustment) => sum + toNumber(adjustment.tax_amount),
          0,
        ),
      transactionsCount:
        linkedSales.length + bookingPayments.length + saleAdjustments.length,
    };
  }

  async findBranchSessionForSale(
    tx: Prisma.TransactionClient,
    branchId: number,
    _userId?: number,
  ) {
    // An open shift remains authoritative until it is handed over or closed.
    // Do not filter by session_date: a night shift opened before midnight must
    // continue receiving sales, bookings and refunds after the calendar rolls.
    return tx.sales_shift_sessions.findFirst({
      where: {
        branch_id: branchId,
        status: ShiftSessionStatus.open,
      },
      orderBy: { id: "desc" },
    });
  }

  async applySaleToSession(
    tx: Prisma.TransactionClient,
    sessionId: number,
    data: {
      totalAmount: number;
      collectedAmount?: number;
      discountAmount: number;
      taxAmount: number;
      paymentMethod: SalesPaymentMethod;
      payments?: { method: SalesPaymentMethod; amount: number }[];
    },
    _reopenAutoClosed = false,
  ) {
    const collectedAmount = data.collectedAmount ?? data.totalAmount;
    const bd = this.breakdownFromSale(
      data.paymentMethod,
      collectedAmount,
      data.payments,
    );
    await tx.$queryRaw(Prisma.sql`
      SELECT id FROM sales_shift_sessions WHERE id = ${sessionId} FOR UPDATE
    `);
    const session = await tx.sales_shift_sessions.findUnique({
      where: { id: sessionId },
    });
    if (!session || session.status !== ShiftSessionStatus.open) {
      throw new BadRequestException(
        "الوردية لم تعد مفتوحة؛ أعد المحاولة على الوردية الحالية",
      );
    }

    const newTotalCash = toNumber(session.total_cash) + bd.cash;
    const adjustments = await this.drawerAdjustments(sessionId, tx);
    const expectedClosing = expectedDrawerBalance(
      toNumber(session.opening_balance),
      newTotalCash,
      adjustments,
    );

    await tx.sales_shift_sessions.update({
      where: { id: sessionId },
      data: {
        total_sales: { increment: toDecimal(data.totalAmount) },
        total_cash: { increment: toDecimal(bd.cash) },
        total_card: { increment: toDecimal(bd.card) },
        total_wallet: { increment: toDecimal(bd.wallet) },
        total_transfer: { increment: toDecimal(bd.transfer) },
        total_discount: { increment: toDecimal(data.discountAmount) },
        total_tax: { increment: toDecimal(data.taxAmount) },
        transactions_count: { increment: 1 },
        expected_closing_balance: toDecimal(expectedClosing),
      },
    });
  }

  /** Amend the original open session; an edit is not another transaction. */
  async applySaleEditToSession(
    tx: Prisma.TransactionClient,
    sessionId: number,
    data: { before: SaleEditSessionSnapshot; after: SaleEditSessionSnapshot },
  ) {
    await tx.$queryRaw(Prisma.sql`
      SELECT id FROM sales_shift_sessions WHERE id = ${sessionId} FOR UPDATE
    `);
    const session = await tx.sales_shift_sessions.findUnique({ where: { id: sessionId } });
    if (!session || session.status !== ShiftSessionStatus.open) {
      throw new BadRequestException('تم إغلاق الوردية الأصلية؛ لا يمكن تعديل فواتيرها بعد التسليم');
    }
    const before = this.breakdownFromSale(
      data.before.paymentMethod,
      data.before.collectedAmount,
      data.before.payments,
    );
    const after = this.breakdownFromSale(
      data.after.paymentMethod,
      data.after.collectedAmount,
      data.after.payments,
    );
    const cashDelta = roundMoney(after.cash - before.cash);
    const adjustments = await this.drawerAdjustments(sessionId, tx);
    const availableCash = expectedDrawerBalance(
      toNumber(session.opening_balance),
      toNumber(session.total_cash),
      adjustments,
    );
    const expectedClosing = expectedDrawerBalance(
      toNumber(session.opening_balance),
      toNumber(session.total_cash) + cashDelta,
      adjustments,
    );
    if (cashDelta < 0 && expectedClosing < -0.001) {
      throw new BadRequestException(
        `النقدية المتاحة في الدرج ${availableCash.toFixed(2)} ج.م ولا تكفي لرد فرق تعديل الفاتورة`,
      );
    }
    await tx.sales_shift_sessions.update({
      where: { id: sessionId },
      data: {
        total_sales: { increment: toDecimal(roundMoney(data.after.totalAmount - data.before.totalAmount)) },
        total_cash: { increment: toDecimal(cashDelta) },
        total_card: { increment: toDecimal(roundMoney(after.card - before.card)) },
        total_wallet: { increment: toDecimal(roundMoney(after.wallet - before.wallet)) },
        total_transfer: { increment: toDecimal(roundMoney(after.transfer - before.transfer)) },
        total_discount: { increment: toDecimal(roundMoney(data.after.discountAmount - data.before.discountAmount)) },
        total_tax: { increment: toDecimal(roundMoney(data.after.taxAmount - data.before.taxAmount)) },
        expected_closing_balance: toDecimal(expectedClosing),
      },
    });
  }

  async applyBookingPaymentToSession(
    tx: Prisma.TransactionClient,
    sessionId: number,
    data: {
      amount: number;
      paymentMethod: SalesPaymentMethod;
      kind: "payment" | "refund";
    },
  ) {
    await tx.$queryRaw(Prisma.sql`
      SELECT id FROM sales_shift_sessions WHERE id = ${sessionId} FOR UPDATE
    `);
    const session = await tx.sales_shift_sessions.findUnique({
      where: { id: sessionId },
    });
    if (!session) throw new BadRequestException("وردية التحصيل غير موجودة");
    if (session.status !== ShiftSessionStatus.open) {
      throw new BadRequestException("وردية التحصيل لم تعد مفتوحة");
    }
    const sign = data.kind === "refund" ? -1 : 1;
    const bd = this.breakdownFromSale(data.paymentMethod, data.amount);
    const newTotalCash = toNumber(session.total_cash) + sign * bd.cash;
    const adjustments = await this.drawerAdjustments(sessionId, tx);
    const expectedClosing = expectedDrawerBalance(
      toNumber(session.opening_balance),
      newTotalCash,
      adjustments,
    );
    await tx.sales_shift_sessions.update({
      where: { id: sessionId },
      data: {
        total_sales: { increment: toDecimal(sign * data.amount) },
        total_cash: { increment: toDecimal(sign * bd.cash) },
        total_card: { increment: toDecimal(sign * bd.card) },
        total_wallet: { increment: toDecimal(sign * bd.wallet) },
        total_transfer: { increment: toDecimal(sign * bd.transfer) },
        transactions_count: { increment: 1 },
        expected_closing_balance: toDecimal(expectedClosing),
      },
    });
  }

  async applySaleReversalToSession(
    tx: Prisma.TransactionClient,
    sessionId: number,
    data: {
      quickSaleId: number;
      totalAmount: number;
      collectedAmount: number;
      discountAmount: number;
      taxAmount: number;
      paymentMethod: SalesPaymentMethod;
      payments?: {
        method: SalesPaymentMethod;
        amount: Prisma.Decimal | number;
      }[];
      operationType: "refund" | "cancel";
      createdBy: number;
    },
  ) {
    await tx.$queryRaw(Prisma.sql`
      SELECT id FROM sales_shift_sessions WHERE id = ${sessionId} FOR UPDATE
    `);
    const session = await tx.sales_shift_sessions.findUnique({
      where: { id: sessionId },
    });
    if (!session || session.status !== ShiftSessionStatus.open) {
      throw new BadRequestException(
        "افتح وردية باسم المستخدم الحالي قبل استرداد أو إلغاء الفاتورة",
      );
    }
    const bd = this.breakdownFromSale(
      data.paymentMethod,
      data.collectedAmount,
      data.payments,
    );
    const adjustments = await this.drawerAdjustments(sessionId, tx);
    const availableBeforeRefund = expectedDrawerBalance(
      toNumber(session.opening_balance),
      toNumber(session.total_cash),
      adjustments,
    );
    if (bd.cash > availableBeforeRefund + 0.001) {
      throw new BadRequestException(
        `النقدية المتاحة في الدرج ${availableBeforeRefund.toFixed(2)} ج.م ولا تكفي للاسترداد النقدي`,
      );
    }
    const newTotalCash = toNumber(session.total_cash) - bd.cash;
    const expectedClosing = expectedDrawerBalance(
      toNumber(session.opening_balance),
      newTotalCash,
      adjustments,
    );
    await tx.sales_shift_sale_adjustments.create({
      data: {
        shift_session_id: sessionId,
        quick_sale_id: data.quickSaleId,
        event_type: data.operationType,
        total_amount: toDecimal(data.totalAmount),
        cash_amount: toDecimal(bd.cash),
        card_amount: toDecimal(bd.card),
        wallet_amount: toDecimal(bd.wallet),
        transfer_amount: toDecimal(bd.transfer),
        discount_amount: toDecimal(data.discountAmount),
        tax_amount: toDecimal(data.taxAmount),
        created_by: data.createdBy,
      },
    });
    await tx.sales_shift_sessions.update({
      where: { id: sessionId },
      data: {
        total_sales: { decrement: toDecimal(data.totalAmount) },
        total_cash: { decrement: toDecimal(bd.cash) },
        total_card: { decrement: toDecimal(bd.card) },
        total_wallet: { decrement: toDecimal(bd.wallet) },
        total_transfer: { decrement: toDecimal(bd.transfer) },
        total_discount: { decrement: toDecimal(data.discountAmount) },
        total_tax: { decrement: toDecimal(data.taxAmount) },
        transactions_count: { increment: 1 },
        expected_closing_balance: toDecimal(expectedClosing),
      },
    });
  }

  private async drawerAdjustments(
    sessionId: number,
    tx: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    const rows = await tx.sales_cash_drawer_transactions.findMany({
      where: {
        shift_session_id: sessionId,
        status: "posted",
        movement_type: {
          in: [
            "petty_expense",
            "custody_issue",
            "custody_return",
            "adjustment",
          ],
        },
      },
      select: { direction: true, amount: true },
    });
    return rows.reduce(
      (sum, row) =>
        sum +
        (row.direction === "in" ? toNumber(row.amount) : -toNumber(row.amount)),
      0,
    );
  }

  private drawerReference(prefix: string) {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  }

  async start(dto: StartShiftSessionDto, userId: number) {
    const shift = await this.prisma.sales_shifts.findUnique({
      where: { id: dto.shiftId },
    });
    if (!shift) throw new NotFoundException("الوردية غير موجودة");
    if (!shift.is_active) throw new BadRequestException("الوردية غير نشطة");

    const sessionDate = localDateString();
    const branchId = dto.branchId ?? shift.branch_id ?? null;
    if (!branchId)
      throw new BadRequestException("حدد فرع الوردية قبل فتح الدرج");
    const eligible = await this.shifts.eligibleUsers(branchId ?? undefined);
    if (!eligible.some((user) => user.id === userId)) {
      throw new BadRequestException("المستخدم الحالي غير مرتبط بإدارة الكافيه");
    }

    try {
      const row = await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw(Prisma.sql`
          SELECT branch_id FROM tbl_branches WHERE branch_id = ${branchId} FOR UPDATE
        `);
        const branch = await tx.tbl_branches.findUnique({
          where: { branch_id: branchId },
        });
        if (!branch) throw new BadRequestException("الفرع المحدد غير موجود");
        const openDuplicate = await tx.sales_shift_sessions.findFirst({
          where: { branch_id: branchId, status: ShiftSessionStatus.open },
          include: { shift: true },
        });
        if (openDuplicate) {
          // Idempotent: same cashier reopening → return the existing open session.
          if (openDuplicate.user_id === userId) {
            return openDuplicate;
          }
          // Reclaim empty stale drawers (no sales, open > 24h) so POS is not blocked
          // by abandoned sessions after a crash / unfinished handover.
          const ageMs = Date.now() - new Date(openDuplicate.start_time).getTime();
          const staleMs = 24 * 60 * 60 * 1000;
          if (
            ageMs > staleMs &&
            openDuplicate.transactions_count === 0 &&
            toNumber(openDuplicate.total_sales) === 0
          ) {
            await tx.sales_shift_sessions.update({
              where: { id: openDuplicate.id },
              data: {
                status: ShiftSessionStatus.auto_closed,
                end_time: new Date(),
                closing_notes: "إغلاق تلقائي لجلسة معلّقة فارغة قبل فتح وردية جديدة",
                closed_by: userId,
              },
            });
          } else {
            throw new BadRequestException(
              "يوجد شيفت مفتوح بالفعل في هذا الفرع؛ استخدم تسليم وتبديل الشيفت",
            );
          }
        }
        const last = await tx.sales_shift_sessions.aggregate({
          where: {
            shift_id: dto.shiftId,
            session_date: sessionDate,
            branch_id: branchId,
          },
          _max: { session_sequence: true },
        });
        return tx.sales_shift_sessions.create({
          data: {
            shift_id: dto.shiftId,
            branch_id: branchId,
            user_id: userId,
            session_date: sessionDate,
            expected_start_time: shift.start_time,
            expected_end_time: shift.end_time,
            session_sequence: Number(last._max.session_sequence ?? 0) + 1,
            opening_balance: toDecimal(dto.openingBalance ?? 0),
            expected_closing_balance: toDecimal(dto.openingBalance ?? 0),
            notes: dto.notes ?? null,
            created_by: userId,
            status: ShiftSessionStatus.open,
          },
          include: { shift: true },
        });
      });
      return this.mapSession(row);
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2002"
      ) {
        throw new BadRequestException(
          "يوجد جلسة لهذه الوردية في هذا اليوم بالفعل",
        );
      }
      throw e;
    }
  }

  async getCurrent(q: CurrentSessionQueryDto) {
    const where: Prisma.sales_shift_sessionsWhereInput = {
      status: ShiftSessionStatus.open,
    };
    if (q.branchId !== undefined) where.branch_id = q.branchId;
    if (q.userId !== undefined) where.user_id = q.userId;

    const row = await this.prisma.sales_shift_sessions.findFirst({
      where,
      include: { shift: true },
      orderBy: { start_time: "desc" },
    });
    if (!row) return null;

    const salesData = await this.calculateSessionSales(row);
    const drawerAdjustments = await this.drawerAdjustments(row.id);
    const mapped = this.mapSession(row);
    return {
      ...mapped,
      ...salesData,
      expectedClosingBalance: expectedDrawerBalance(
        mapped.openingBalance,
        salesData.totalCash,
        drawerAdjustments,
      ),
      drawerAdjustments,
    };
  }

  async list(q: ListShiftSessionsDto) {
    const and: Prisma.sales_shift_sessionsWhereInput[] = [];
    if (q.branchId) and.push({ branch_id: q.branchId });
    if (q.shiftId) and.push({ shift_id: q.shiftId });
    if (q.status && q.status !== "all") {
      and.push({ status: q.status as ShiftSessionStatus });
    }
    if (q.dateFrom || q.dateTo) {
      and.push({
        session_date: {
          ...(q.dateFrom ? { gte: q.dateFrom } : {}),
          ...(q.dateTo ? { lte: q.dateTo } : {}),
        },
      });
    }
    const where = and.length ? { AND: and } : {};
    const [rows, total] = await Promise.all([
      this.prisma.sales_shift_sessions.findMany({
        where,
        include: { shift: true },
        orderBy: [{ session_date: "desc" }, { start_time: "desc" }],
        skip: q.skip,
        take: q.take,
      }),
      this.prisma.sales_shift_sessions.count({ where }),
    ]);
    const hydrated = await Promise.all(
      rows.map(async (row) => {
        const mapped = this.mapSession(row);
        const [sales, adjustments] = await Promise.all([
          this.calculateSessionSales(row),
          row.status === ShiftSessionStatus.open
            ? this.drawerAdjustments(row.id)
            : Promise.resolve(0),
        ]);
        return {
          ...mapped,
          ...sales,
          expectedClosingBalance:
            row.status === ShiftSessionStatus.open
              ? expectedDrawerBalance(
                  mapped.openingBalance,
                  sales.totalCash,
                  adjustments,
                )
              : mapped.expectedClosingBalance,
        };
      }),
    );
    return paginated(hydrated, total, q.page, q.pageSize);
  }

  async findOne(id: number) {
    const row = await this.prisma.sales_shift_sessions.findUnique({
      where: { id },
      include: { shift: true },
    });
    if (!row) throw new NotFoundException("الجلسة غير موجودة");
    return this.mapSession(row);
  }

  async closeReport(id: number) {
    const session = await this.prisma.sales_shift_sessions.findUnique({
      where: { id },
      include: { shift: true },
    });
    if (!session) throw new NotFoundException("الجلسة غير موجودة");

    const [sales, adjustments, drawerAdjustment, cashier, branch, settlements] =
      await Promise.all([
        this.prisma.sales_quick_sales.findMany({
          where: {
            shift_session_id: id,
            status: {
              in: [
                QuickSaleStatus.completed,
                QuickSaleStatus.refunded,
                QuickSaleStatus.cancelled,
              ],
            },
          },
          include: { payments: true, items: true },
          orderBy: [{ sale_date: "asc" }, { sale_time: "asc" }],
        }),
        this.prisma.sales_shift_sale_adjustments.findMany({
          where: { shift_session_id: id },
          include: { sale: { include: { payments: true, items: true } } },
          orderBy: { created_at: "asc" },
        }),
        this.drawerAdjustments(id),
        this.prisma.users.findUnique({
          where: { user_id: session.user_id },
          select: { name: true, username: true },
        }),
        session.branch_id != null
          ? this.prisma.tbl_branches.findUnique({
              where: { branch_id: session.branch_id },
              select: { branch_name: true },
            })
          : Promise.resolve(null),
        this.prisma.sales_billing_statements.findMany({
          where: { shift_session_id: id, status: "settled" },
          select: {
            statement_number: true,
            settled_at: true,
            account_type: true,
            employee_id: true,
            partner_id: true,
            total_amount: true,
            settlement_method: true,
            payment_method: true,
          },
          orderBy: { settled_at: "asc" },
        }),
      ]);

    const employeeIds = settlements.flatMap((row) =>
      row.employee_id ? [row.employee_id] : [],
    );
    const partnerIds = settlements.flatMap((row) =>
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

    const paymentLines = (sale: (typeof sales)[number]): ShiftClosePaymentLine[] =>
      sale.payments.length
        ? sale.payments.map((payment) => ({
            baseMethod: payment.method,
            amount: toNumber(payment.amount),
            methodCode: payment.method_code,
            methodName: payment.method_name,
          }))
        : toNumber(sale.collected_amount) > 0
          ? [{
              baseMethod: sale.payment_method,
              amount: toNumber(sale.collected_amount),
            }]
          : [];

    const productLines = (sale: (typeof sales)[number]) =>
      (sale.items ?? []).map((item) => ({
        key: [
          item.item_type,
          item.cafe_product_id ?? item.product_id,
          item.cafe_variant_id ?? 0,
        ].join(':'),
        itemType: item.item_type,
        name: item.name,
        variantName: item.variant_name,
        quantity: toNumber(item.quantity),
        unitPrice: toNumber(item.unit_price),
        lineTotal: toNumber(item.line_total),
      }));

    const report = buildShiftCloseReport({
      sales: sales.map((sale) => ({
        invoiceNumber: sale.sale_number,
        saleDate: sale.sale_date,
        saleTime: sale.sale_time,
        customerName: sale.customer_name,
        status: sale.status,
        subtotalAmount: toNumber(sale.subtotal),
        totalAmount: toNumber(sale.total_amount),
        collectedAmount: toNumber(sale.collected_amount),
        discountAmount: toNumber(sale.discount_amount),
        taxAmount: toNumber(sale.tax_amount),
        saleType: sale.sale_type,
        paymentMethod: sale.payment_method,
        payments: paymentLines(sale),
        items: productLines(sale),
      })),
      adjustments: adjustments.map((adjustment) => {
        const originalTotal = toNumber(adjustment.sale.total_amount);
        const adjustmentTotal = toNumber(adjustment.total_amount);
        const ratio = originalTotal > 0
          ? Math.min(1, adjustmentTotal / originalTotal)
          : 1;
        const originalInternal = Math.max(
          0,
          originalTotal - toNumber(adjustment.sale.collected_amount),
        );
        return {
          eventType: adjustment.event_type,
          totalAmount: adjustmentTotal,
          discountAmount: toNumber(adjustment.discount_amount),
          taxAmount: toNumber(adjustment.tax_amount),
          paymentLines: paymentLines(adjustment.sale).map((line) => ({
            ...line,
            amount: roundMoney(line.amount * ratio),
          })),
          internalAccountAmount: roundMoney(originalInternal * ratio),
          items: productLines(adjustment.sale),
        };
      }),
      accountSettlements: settlements.map((settlement) => ({
        statementNumber: settlement.statement_number,
        settledAt: settlement.settled_at,
        accountType: settlement.account_type,
        accountName: settlement.employee_id
          ? employeeNames.get(settlement.employee_id)
          : settlement.partner_id
            ? partnerNames.get(settlement.partner_id)
            : null,
        totalAmount: toNumber(settlement.total_amount),
        settlementMethod: settlement.settlement_method ?? "direct_payment",
        paymentMethod: settlement.payment_method,
      })),
    });

    const cashCollected = report.paymentMethods
      .filter((method) => method.baseMethod === SalesPaymentMethod.cash)
      .reduce((sum, method) => sum + method.netAmount, 0);
    const expectedClosing = expectedDrawerBalance(
      toNumber(session.opening_balance),
      cashCollected,
      drawerAdjustment,
    );
    const closingBalance = session.closing_balance != null
      ? toNumber(session.closing_balance)
      : null;

    return {
      generatedAt: new Date(),
      session: {
        id: session.id,
        shiftName: session.shift.shift_name,
        branchId: session.branch_id,
        branchName: branch?.branch_name ?? null,
        cashierId: session.user_id,
        cashierName: cashier?.name || cashier?.username || null,
        sessionDate: session.session_date,
        startTime: session.start_time,
        endTime: session.end_time,
        status: session.status,
      },
      ...report,
      drawer: {
        openingBalance: toNumber(session.opening_balance),
        expectedClosingBalance: expectedClosing,
        closingBalance,
        cashDifference:
          closingBalance != null
            ? drawerDifference(closingBalance, expectedClosing)
            : null,
        cashDropAmount: toNumber(session.cash_drop_amount),
        retainedAmount: toNumber(session.retained_amount),
      },
    };
  }

  async closeOwn(id: number, dto: CloseShiftSessionDto, userId: number, dryRun = false) {
    const session = await this.prisma.sales_shift_sessions.findUnique({
      where: { id },
      select: { user_id: true },
    });
    if (!session) throw new NotFoundException("جلسة الوردية غير موجودة");
    if (session.user_id !== userId) {
      throw new ForbiddenException("يمكنك تسليم وإغلاق ورديتك فقط");
    }
    return this.close(id, dto, userId, dryRun);
  }

  async close(
    id: number,
    dto: CloseShiftSessionDto,
    userId: number,
    dryRun = false,
  ) {
    const session = await this.prisma.sales_shift_sessions.findUnique({
      where: { id },
      include: { shift: true },
    });
    if (!session) throw new NotFoundException("الجلسة غير موجودة");
    if (session.status !== ShiftSessionStatus.open) {
      throw new BadRequestException("الجلسة مغلقة بالفعل");
    }

    const salesData = await this.calculateSessionSales(session);
    const drawerAdjustments = await this.drawerAdjustments(session.id);
    const expectedClosing = expectedDrawerBalance(
      toNumber(session.opening_balance),
      salesData.totalCash,
      drawerAdjustments,
    );
    const closingBalance = roundMoney(dto.closingBalance);
    const cashDifference = drawerDifference(closingBalance, expectedClosing);
    const shortageReason = dto.shortageReason?.trim() ?? "";
    if (cashDifference < -0.01 && !shortageReason) {
      throw new BadRequestException("اكتب سبب عجز النقدية قبل اعتماد الإغلاق");
    }
    const retainedAmount = roundMoney(dto.retainedAmount ?? 0);
    const cashDropAmount = roundMoney(
      dto.cashDropAmount ?? Math.max(0, closingBalance - retainedAmount),
    );
    if (
      !drawerAllocationMatches(closingBalance, retainedAmount, cashDropAmount)
    ) {
      throw new BadRequestException(
        "المسحوب والمبلغ المتبقي يجب أن يساويا الرصيد الفعلي في الدرج",
      );
    }

    const previewRows: PreviewRow[] = [
      {
        label: "رصيد الافتتاح",
        after: `${toNumber(session.opening_balance).toFixed(2)} ج.م`,
      },
      {
        label: "إجمالي النقدي",
        after: `${salesData.totalCash.toFixed(2)} ج.م`,
      },
      { label: "الرصيد المتوقع", after: `${expectedClosing.toFixed(2)} ج.م` },
      { label: "الرصيد الفعلي", after: `${closingBalance.toFixed(2)} ج.م` },
      {
        label: "فرق النقدية",
        after: `${cashDifference >= 0 ? "+" : ""}${cashDifference.toFixed(2)} ج.م`,
      },
      { label: "عدد المعاملات", after: String(salesData.transactionsCount) },
    ];

    if (isDryRun(dryRun)) {
      const warn =
        Math.abs(cashDifference) > 0.01
          ? "يوجد فرق بين الرصيد الفعلي والمتوقع — راجع الصندوق قبل الإغلاق"
          : undefined;
      return previewResponse(
        {
          sessionId: id,
          expectedClosing,
          closingBalance,
          cashDifference,
          totalSales: salesData.totalSales,
        },
        { rows: previewRows, warning: warn },
      );
    }

    const row = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`
        SELECT id FROM sales_shift_sessions WHERE id = ${id} FOR UPDATE
      `);
      const current = await tx.sales_shift_sessions.findUnique({
        where: { id },
      });
      if (!current || current.status !== ShiftSessionStatus.open) {
        throw new BadRequestException("الجلسة لم تعد مفتوحة");
      }
      const freshSalesData = await this.calculateSessionSales(current, tx);
      const freshAdjustments = await this.drawerAdjustments(current.id, tx);
      const freshExpectedClosing = expectedDrawerBalance(
        toNumber(current.opening_balance),
        freshSalesData.totalCash,
        freshAdjustments,
      );
      const freshCashDifference = drawerDifference(
        closingBalance,
        freshExpectedClosing,
      );
      if (freshCashDifference < -0.01 && !shortageReason) {
        throw new BadRequestException("اكتب سبب عجز النقدية قبل اعتماد الإغلاق");
      }
      const updated = await tx.sales_shift_sessions.update({
        where: { id },
        data: {
          end_time: new Date(),
          closing_balance: toDecimal(closingBalance),
          expected_closing_balance: toDecimal(freshExpectedClosing),
          cash_difference: toDecimal(freshCashDifference),
          cash_drop_amount: toDecimal(cashDropAmount),
          retained_amount: toDecimal(retainedAmount),
          total_sales: toDecimal(freshSalesData.totalSales),
          total_cash: toDecimal(freshSalesData.totalCash),
          total_card: toDecimal(freshSalesData.totalCard),
          total_wallet: toDecimal(freshSalesData.totalWallet),
          total_transfer: toDecimal(freshSalesData.totalTransfer),
          total_discount: toDecimal(freshSalesData.totalDiscount),
          total_tax: toDecimal(freshSalesData.totalTax),
          transactions_count: freshSalesData.transactionsCount,
          closed_by: userId,
          closing_notes:
            dto.closingNotes ?? "إغلاق اليوم بدون تسليم لوردية تالية",
          shortage_reason:
            freshCashDifference < -0.01 ? shortageReason : null,
          status: ShiftSessionStatus.closed,
        },
        include: { shift: true },
      });
      if (cashDropAmount > 0) {
        await tx.sales_cash_drawer_transactions.create({
          data: {
            reference: this.drawerReference("DROP"),
            branch_id: session.branch_id,
            shift_session_id: id,
            movement_type: "cash_drop",
            direction: "out",
            amount: toDecimal(cashDropAmount),
            description: "توريد نقدية عند إغلاق اليوم إلى الخزنة",
            created_by: userId,
          },
        });
      }
      return updated;
    });
    return this.mapSession(row);
  }

  async switchShift(dto: SwitchShiftSessionDto, currentUserId: number) {
    const authResult = await this.auth.authenticateStaff(
      dto.username,
      dto.password,
    );
    const nextUser = authResult.user as JwtUser;
    const eligible = await this.shifts.eligibleUsers(
      dto.branchId || nextUser.branch || undefined,
    );
    if (!eligible.some((user) => user.id === nextUser.sub)) {
      throw new BadRequestException(
        "هذا المستخدم غير مرتبط بإدارة الكافيه ولا يمكنه استلام نقطة البيع",
      );
    }
    const targetShift = await this.prisma.sales_shifts.findUnique({
      where: { id: dto.targetShiftId },
    });
    if (!targetShift || !targetShift.is_active)
      throw new BadRequestException("الوردية المستهدفة غير متاحة");
    const branchId = dto.branchId ?? targetShift.branch_id ?? nextUser.branch;
    if (!branchId) throw new BadRequestException("حدد فرع الوردية");
    if (
      nextUser.level !== 1 &&
      nextUser.branch &&
      nextUser.branch !== branchId
    ) {
      throw new BadRequestException("المستخدم الجديد غير مرتبط بهذا الفرع");
    }
    const closingBalance = roundMoney(dto.closingBalance);
    const transferAmount = roundMoney(dto.transferAmount);
    const cashDropAmount = roundMoney(dto.cashDropAmount);
    if (
      !drawerAllocationMatches(closingBalance, transferAmount, cashDropAmount)
    ) {
      throw new BadRequestException(
        "المبلغ المسلم مع المسحوب يجب أن يساويا النقدية الفعلية",
      );
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const current = await tx.sales_shift_sessions.findFirst({
        where: {
          branch_id: branchId,
          user_id: currentUserId,
          status: ShiftSessionStatus.open,
        },
        include: { shift: true },
        orderBy: { id: "desc" },
      });
      if (!current)
        throw new BadRequestException(
          "لا توجد وردية مفتوحة للمستخدم الحالي في هذا الفرع",
        );
      await tx.$queryRaw(Prisma.sql`
        SELECT id FROM sales_shift_sessions WHERE id = ${current.id} FOR UPDATE
      `);
      const lockedCurrent = await tx.sales_shift_sessions.findUnique({
        where: { id: current.id },
        include: { shift: true },
      });
      if (!lockedCurrent || lockedCurrent.status !== ShiftSessionStatus.open) {
        throw new BadRequestException("الوردية لم تعد مفتوحة");
      }
      const salesData = await this.calculateSessionSales(lockedCurrent, tx);
      const drawerAdjustments = await this.drawerAdjustments(
        lockedCurrent.id,
        tx,
      );
      const expectedClosing = expectedDrawerBalance(
        toNumber(lockedCurrent.opening_balance),
        salesData.totalCash,
        drawerAdjustments,
      );
      const difference = drawerDifference(closingBalance, expectedClosing);
      const shortageReason = dto.shortageReason?.trim() ?? "";
      if (difference < -0.01 && !shortageReason) {
        throw new BadRequestException("اكتب سبب عجز النقدية قبل تسليم الدرج");
      }
      const sessionDate = localDateString();
      const last = await tx.sales_shift_sessions.aggregate({
        where: {
          shift_id: targetShift.id,
          branch_id: branchId,
          session_date: sessionDate,
        },
        _max: { session_sequence: true },
      });
      await tx.sales_shift_sessions.update({
        where: { id: current.id },
        data: {
          end_time: new Date(),
          closing_balance: toDecimal(closingBalance),
          expected_closing_balance: toDecimal(expectedClosing),
          cash_difference: toDecimal(difference),
          cash_drop_amount: toDecimal(cashDropAmount),
          retained_amount: toDecimal(transferAmount),
          total_sales: toDecimal(salesData.totalSales),
          total_cash: toDecimal(salesData.totalCash),
          total_card: toDecimal(salesData.totalCard),
          total_wallet: toDecimal(salesData.totalWallet),
          total_transfer: toDecimal(salesData.totalTransfer),
          total_discount: toDecimal(salesData.totalDiscount),
          total_tax: toDecimal(salesData.totalTax),
          transactions_count: salesData.transactionsCount,
          status: ShiftSessionStatus.closed,
          closed_by: currentUserId,
          closing_notes: dto.notes ?? "تسليم يدوي للوردية التالية",
          shortage_reason: difference < -0.01 ? shortageReason : null,
        },
      });
      const next = await tx.sales_shift_sessions.create({
        data: {
          shift_id: targetShift.id,
          branch_id: branchId,
          user_id: nextUser.sub,
          session_date: sessionDate,
          expected_start_time: targetShift.start_time,
          expected_end_time: targetShift.end_time,
          session_sequence: Number(last._max.session_sequence ?? 0) + 1,
          handover_from_session_id: lockedCurrent.id,
          opening_balance: toDecimal(transferAmount),
          transferred_in: toDecimal(transferAmount),
          expected_closing_balance: toDecimal(transferAmount),
          status: ShiftSessionStatus.open,
          notes: dto.notes ?? `استلام من جلسة #${lockedCurrent.id}`,
          created_by: nextUser.sub,
        },
        include: { shift: true },
      });
      if (transferAmount > 0) {
        await tx.sales_cash_drawer_transactions.createMany({
          data: [
            {
              reference: this.drawerReference("TR-OUT"),
              branch_id: branchId,
              shift_session_id: lockedCurrent.id,
              counterparty_session_id: next.id,
              movement_type: "shift_transfer_out",
              direction: "out",
              amount: toDecimal(transferAmount),
              description: `تسليم نقدية إلى ${targetShift.shift_name}`,
              created_by: currentUserId,
            },
            {
              reference: this.drawerReference("TR-IN"),
              branch_id: branchId,
              shift_session_id: next.id,
              counterparty_session_id: lockedCurrent.id,
              movement_type: "shift_transfer_in",
              direction: "in",
              amount: toDecimal(transferAmount),
              description: `استلام نقدية من ${lockedCurrent.shift.shift_name}`,
              created_by: nextUser.sub,
            },
          ],
        });
      }
      if (cashDropAmount > 0) {
        await tx.sales_cash_drawer_transactions.create({
          data: {
            reference: this.drawerReference("DROP"),
            branch_id: branchId,
            shift_session_id: lockedCurrent.id,
            movement_type: "cash_drop",
            direction: "out",
            amount: toDecimal(cashDropAmount),
            description: "توريد نقدية نهاية الوردية إلى الخزنة",
            created_by: currentUserId,
          },
        });
      }
      return {
        previousSessionId: lockedCurrent.id,
        session: this.mapSession(next),
        expectedClosing,
        cashDifference: difference,
      };
    });
    return { ...result, ...authResult };
  }

  async createDrawerMovement(dto: CreateDrawerMovementDto, userId: number) {
    const amount = roundMoney(dto.amount);
    if (amount < 0.01)
      throw new BadRequestException("المبلغ يجب ألا يقل عن 0.01 ج.م");
    if (!dto.description.trim())
      throw new BadRequestException("اكتب سبب الحركة بوضوح");
    const session = await this.prisma.sales_shift_sessions.findUnique({
      where: { id: dto.sessionId },
    });
    if (!session || session.status !== ShiftSessionStatus.open)
      throw new BadRequestException("الوردية غير مفتوحة");
    if (session.user_id !== userId)
      throw new BadRequestException(
        "الحركة يجب أن يسجلها مسؤول الوردية الحالي",
      );
    if (dto.movementType === "custody_issue" && !dto.employeeId) {
      throw new BadRequestException("اختر الموظف صاحب العهدة");
    }
    if (dto.movementType === "custody_issue") {
      const employee = await this.prisma.employees.findUnique({
        where: { id: dto.employeeId! },
        select: { id: true },
      });
      if (!employee) throw new BadRequestException("الموظف المحدد غير موجود");
    }
    if (dto.movementType === "custody_return" && !dto.sourceTransactionId) {
      throw new BadRequestException("اختر العهدة المصروفة التي يتم ردها");
    }
    const direction = dto.movementType === "custody_return" ? "in" : "out";
    await this.moduleLedger.ensureChart();
    const reference = this.drawerReference(
      dto.movementType === "petty_expense"
        ? "EXP"
        : dto.movementType === "custody_issue"
          ? "CUST"
          : "CUST-RET",
    );
    const row = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`
        SELECT id FROM sales_shift_sessions WHERE id = ${session.id} FOR UPDATE
      `);
      const lockedSession = await tx.sales_shift_sessions.findUnique({
        where: { id: session.id },
      });
      if (!lockedSession || lockedSession.status !== ShiftSessionStatus.open) {
        throw new BadRequestException("الوردية لم تعد مفتوحة");
      }
      const adjustments = await this.drawerAdjustments(session.id, tx);
      const available = expectedDrawerBalance(
        toNumber(lockedSession.opening_balance),
        toNumber(lockedSession.total_cash),
        adjustments,
      );
      if (direction === "out" && amount > available + 0.001) {
        throw new BadRequestException(
          `الرصيد المتاح في الدرج ${available.toFixed(2)} ج.م فقط`,
        );
      }

      let employeeId = dto.employeeId ?? null;
      let sourceReference: string | null = null;
      if (dto.movementType === "custody_return") {
        await tx.$queryRaw(Prisma.sql`
          SELECT id FROM sales_cash_drawer_transactions
          WHERE id = ${dto.sourceTransactionId!} FOR UPDATE
        `);
        const source = await tx.sales_cash_drawer_transactions.findFirst({
          where: {
            id: dto.sourceTransactionId!,
            movement_type: "custody_issue",
            status: "posted",
            ...(session.branch_id != null
              ? { branch_id: session.branch_id }
              : {}),
          },
        });
        if (!source)
          throw new BadRequestException(
            "العهدة الأصلية غير موجودة أو لا تخص هذا الفرع",
          );
        const returned = await tx.sales_cash_drawer_transactions.aggregate({
          where: {
            source_transaction_id: source.id,
            movement_type: "custody_return",
            status: "posted",
          },
          _sum: { amount: true },
        });
        const outstanding = custodyOutstanding(
          toNumber(source.amount),
          toNumber(returned._sum.amount),
        );
        if (outstanding <= 0.001)
          throw new BadRequestException("تم رد هذه العهدة بالكامل بالفعل");
        if (amount > outstanding + 0.001) {
          throw new BadRequestException(
            `المتبقي على هذه العهدة ${outstanding.toFixed(2)} ج.م فقط`,
          );
        }
        employeeId = source.employee_id;
        sourceReference = source.reference;
      }

      const created = await tx.sales_cash_drawer_transactions.create({
        data: {
          reference,
          branch_id: session.branch_id,
          shift_session_id: session.id,
          movement_type: dto.movementType,
          direction,
          amount: toDecimal(amount),
          category: dto.category ?? null,
          description: dto.description.trim(),
          employee_id: employeeId,
          source_transaction_id: dto.sourceTransactionId ?? null,
          created_by: userId,
        },
      });
      await this.moduleLedger.postDrawerMovement(
        {
          reference,
          branchId: session.branch_id,
          date: localDateString(),
          movementType: dto.movementType,
          category: dto.category,
          amount,
          description: sourceReference
            ? `${dto.description} (${sourceReference})`
            : dto.description,
          createdBy: userId,
        },
        tx,
      );
      const signedAmount = direction === "in" ? amount : -amount;
      await tx.sales_shift_sessions.update({
        where: { id: session.id },
        data: { expected_closing_balance: toDecimal(available + signedAmount) },
      });
      return created;
    });
    return { ...row, amount: toNumber(row.amount) };
  }

  async listDrawerMovements(q: ListDrawerMovementsDto) {
    const where: Prisma.sales_cash_drawer_transactionsWhereInput = {};
    if (q.sessionId) where.shift_session_id = q.sessionId;
    if (q.branchId) where.branch_id = q.branchId;
    if (q.dateFrom || q.dateTo)
      where.created_at = {
        ...(q.dateFrom ? { gte: new Date(`${q.dateFrom}T00:00:00`) } : {}),
        ...(q.dateTo ? { lte: new Date(`${q.dateTo}T23:59:59.999`) } : {}),
      };
    const [rows, total] = await Promise.all([
      this.prisma.sales_cash_drawer_transactions.findMany({
        where,
        orderBy: { id: "desc" },
        skip: q.skip,
        take: q.take,
      }),
      this.prisma.sales_cash_drawer_transactions.count({ where }),
    ]);
    const employeeIds = [
      ...new Set(
        rows.flatMap((row) => (row.employee_id ? [row.employee_id] : [])),
      ),
    ];
    const sourceIds = [
      ...new Set(
        rows.flatMap((row) =>
          row.source_transaction_id ? [row.source_transaction_id] : [],
        ),
      ),
    ];
    const [employees, sources] = await Promise.all([
      employeeIds.length
        ? this.prisma.employees.findMany({
            where: { id: { in: employeeIds } },
            select: { id: true, employee: true, emp_code: true },
          })
        : [],
      sourceIds.length
        ? this.prisma.sales_cash_drawer_transactions.findMany({
            where: { id: { in: sourceIds } },
            select: { id: true, reference: true },
          })
        : [],
    ]);
    const employeeById = new Map(
      employees.map((employee) => [employee.id, employee] as const),
    );
    const sourceById = new Map(
      sources.map((source) => [source.id, source.reference] as const),
    );
    return paginated(
      rows.map((row) => ({
        ...row,
        amount: toNumber(row.amount),
        employee: row.employee_id
          ? (employeeById.get(row.employee_id) ?? null)
          : null,
        sourceReference: row.source_transaction_id
          ? (sourceById.get(row.source_transaction_id) ?? null)
          : null,
      })),
      total,
      q.page,
      q.pageSize,
    );
  }

  async openCustodies(q: OpenCustodiesQueryDto) {
    const issues = await this.prisma.sales_cash_drawer_transactions.findMany({
      where: {
        movement_type: "custody_issue",
        status: "posted",
        ...(q.branchId ? { branch_id: q.branchId } : {}),
        ...(q.employeeId ? { employee_id: q.employeeId } : {}),
      },
      orderBy: { created_at: "asc" },
    });
    if (!issues.length)
      return { data: [], summary: { count: 0, outstanding: 0 } };

    const issueIds = issues.map((issue) => issue.id);
    const returns = await this.prisma.sales_cash_drawer_transactions.groupBy({
      by: ["source_transaction_id"],
      where: {
        source_transaction_id: { in: issueIds },
        movement_type: "custody_return",
        status: "posted",
      },
      _sum: { amount: true },
    });
    const returnedByIssue = new Map(
      returns.map((row) => [
        row.source_transaction_id!,
        toNumber(row._sum.amount),
      ]),
    );
    const employeeIds = [
      ...new Set(
        issues.flatMap((issue) =>
          issue.employee_id ? [issue.employee_id] : [],
        ),
      ),
    ];
    const employees = employeeIds.length
      ? await this.prisma.employees.findMany({
          where: { id: { in: employeeIds } },
          select: { id: true, employee: true, emp_code: true },
        })
      : [];
    const employeeById = new Map(
      employees.map((employee) => [employee.id, employee]),
    );
    const data = issues
      .map((issue) => {
        const issuedAmount = toNumber(issue.amount);
        const returnedAmount = returnedByIssue.get(issue.id) ?? 0;
        return {
          id: issue.id,
          reference: issue.reference,
          branchId: issue.branch_id,
          sessionId: issue.shift_session_id,
          employeeId: issue.employee_id,
          employee: issue.employee_id
            ? (employeeById.get(issue.employee_id) ?? null)
            : null,
          description: issue.description,
          issuedAmount,
          returnedAmount,
          outstandingAmount: custodyOutstanding(issuedAmount, returnedAmount),
          issuedAt: issue.created_at,
        };
      })
      .filter((issue) => issue.outstandingAmount > 0.001);
    return {
      data,
      summary: {
        count: data.length,
        outstanding: data.reduce(
          (sum, issue) => sum + issue.outstandingAmount,
          0,
        ),
      },
    };
  }

  async report(q: ShiftSessionsReportQueryDto) {
    const where: Prisma.sales_shift_sessionsWhereInput = {
      ...(q.branchId ? { branch_id: q.branchId } : {}),
      ...(q.shiftId ? { shift_id: q.shiftId } : {}),
      ...(q.userId ? { user_id: q.userId } : {}),
      ...(q.status && q.status !== "all"
        ? { status: q.status as ShiftSessionStatus }
        : {}),
      ...(q.dateFrom || q.dateTo
        ? {
            session_date: {
              ...(q.dateFrom ? { gte: q.dateFrom } : {}),
              ...(q.dateTo ? { lte: q.dateTo } : {}),
            },
          }
        : {}),
    };
    const sessions = await this.prisma.sales_shift_sessions.findMany({
      where,
      include: { shift: true },
      orderBy: [{ session_date: "desc" }, { start_time: "desc" }],
      take: 1000,
    });
    const hydrated = await Promise.all(
      sessions.map(async (session) => {
        const mapped = this.mapSession(session);
        const [sales, adjustments] = await Promise.all([
          this.calculateSessionSales(session),
          session.status === ShiftSessionStatus.open
            ? this.drawerAdjustments(session.id)
            : Promise.resolve(0),
        ]);
        return {
          ...mapped,
          ...sales,
          expectedClosingBalance:
            session.status === ShiftSessionStatus.open
              ? expectedDrawerBalance(
                  mapped.openingBalance,
                  sales.totalCash,
                  adjustments,
                )
              : mapped.expectedClosingBalance,
        };
      }),
    );
    const differenceFiltered = hydrated.filter((session) => {
      if (!q.difference || q.difference === "all") return true;
      const difference = session.cashDifference;
      if (difference == null) return false;
      if (q.difference === "balanced") return Math.abs(difference) <= 0.01;
      if (q.difference === "shortage") return difference < -0.01;
      return difference > 0.01;
    });
    const sessionIds = differenceFiltered.map((session) => session.id);
    const userIds = [
      ...new Set(differenceFiltered.map((session) => session.userId)),
    ];
    const [users, movementGroups] = await Promise.all([
      userIds.length
        ? this.prisma.users.findMany({
            where: { user_id: { in: userIds } },
            select: { user_id: true, name: true, username: true },
          })
        : [],
      sessionIds.length
        ? this.prisma.sales_cash_drawer_transactions.groupBy({
            by: ["shift_session_id", "movement_type", "direction"],
            where: { shift_session_id: { in: sessionIds }, status: "posted" },
            _sum: { amount: true },
          })
        : [],
    ]);
    const userById = new Map(
      users.map((user) => [user.user_id, user] as const),
    );
    const movementBySession = new Map<number, Record<string, number>>();
    for (const movement of movementGroups) {
      const bucket = movementBySession.get(movement.shift_session_id) ?? {};
      bucket[movement.movement_type] =
        (bucket[movement.movement_type] ?? 0) + toNumber(movement._sum.amount);
      movementBySession.set(movement.shift_session_id, bucket);
    }
    const rows = differenceFiltered.map((session) => ({
      ...session,
      user: userById.get(session.userId) ?? null,
      movements: movementBySession.get(session.id) ?? {},
    }));
    const sum = (selector: (row: (typeof rows)[number]) => number) =>
      rows.reduce((total, row) => total + selector(row), 0);
    const totalTransactions = sum((row) => row.transactionsCount);
    const totalSales = sum((row) => row.totalSales);
    const closed = rows.filter((row) => row.cashDifference != null);
    const mismatched = closed.filter(
      (row) => Math.abs(row.cashDifference ?? 0) > 0.01,
    );
    const byShift = new Map<string, { sales: number; sessions: number }>();
    const byUser = new Map<string, { sales: number; sessions: number }>();
    for (const row of rows) {
      const shiftName = row.shift?.shiftName ?? `#${row.shiftId}`;
      const shiftBucket = byShift.get(shiftName) ?? { sales: 0, sessions: 0 };
      shiftBucket.sales += row.totalSales;
      shiftBucket.sessions += 1;
      byShift.set(shiftName, shiftBucket);
      const userName = row.user?.name || row.user?.username || `#${row.userId}`;
      const userBucket = byUser.get(userName) ?? { sales: 0, sessions: 0 };
      userBucket.sales += row.totalSales;
      userBucket.sessions += 1;
      byUser.set(userName, userBucket);
    }
    const bestEntry = (map: Map<string, { sales: number; sessions: number }>) =>
      [...map.entries()].sort((a, b) => b[1].sales - a[1].sales)[0] ?? null;
    const bestShift = bestEntry(byShift);
    const bestCashier = bestEntry(byUser);
    const biggestShortage =
      [...closed].sort(
        (a, b) => (a.cashDifference ?? 0) - (b.cashDifference ?? 0),
      )[0] ?? null;
    const summary = {
      sessionsCount: rows.length,
      openSessionsCount: rows.filter(
        (row) => row.status === ShiftSessionStatus.open,
      ).length,
      totalSales,
      totalTransactions,
      averageTransaction: totalTransactions
        ? totalSales / totalTransactions
        : 0,
      totalCash: sum((row) => row.totalCash),
      totalCard: sum((row) => row.totalCard),
      totalWallet: sum((row) => row.totalWallet),
      totalTransfer: sum((row) => row.totalTransfer),
      totalDiscount: sum((row) => row.totalDiscount),
      totalTax: sum((row) => row.totalTax),
      totalCashDifference: sum((row) => row.cashDifference ?? 0),
      cashDropAmount: sum((row) => row.cashDropAmount),
      custodyIssued: sum((row) => row.movements.custody_issue ?? 0),
      custodyReturned: sum((row) => row.movements.custody_return ?? 0),
      pettyExpenses: sum((row) => row.movements.petty_expense ?? 0),
      mismatchRate: closed.length
        ? (mismatched.length / closed.length) * 100
        : 0,
    };
    const insights = [
      bestShift
        ? `أعلى وردية مبيعاً: ${bestShift[0]} بإجمالي ${bestShift[1].sales.toFixed(2)} ج.م.`
        : "لا توجد مبيعات ضمن الفترة المحددة.",
      bestCashier
        ? `أعلى مسؤول وردية مبيعاً: ${bestCashier[0]} بإجمالي ${bestCashier[1].sales.toFixed(2)} ج.م.`
        : null,
      summary.openSessionsCount
        ? `يوجد ${summary.openSessionsCount} وردية مفتوحة تحتاج متابعة قبل إغلاق اليوم.`
        : "كل الورديات ضمن الفترة مغلقة أو تمت تسويتها.",
      closed.length
        ? `نسبة الجلسات التي بها فرق جرد: ${summary.mismatchRate.toFixed(1)}%.`
        : null,
      biggestShortage && (biggestShortage.cashDifference ?? 0) < -0.01
        ? `أكبر عجز: ${Math.abs(biggestShortage.cashDifference ?? 0).toFixed(2)} ج.م في ${biggestShortage.shift?.shiftName ?? `#${biggestShortage.shiftId}`} بتاريخ ${biggestShortage.sessionDate}.`
        : "لا يوجد عجز نقدي مسجل ضمن الفترة.",
      summary.custodyIssued > summary.custodyReturned
        ? `صافي عهد مصروفة خلال الفترة: ${(summary.custodyIssued - summary.custodyReturned).toFixed(2)} ج.م؛ راجع العهد المفتوحة.`
        : "لا يوجد صافي عهد جديد غير مردود ضمن حركات الفترة.",
    ].filter((value): value is string => Boolean(value));
    return { summary, insights, rows };
  }

  async dailyReport(q: DailyReportQueryDto) {
    const targetDate = q.date ?? localDateString();
    const where: Prisma.sales_shift_sessionsWhereInput = {
      session_date: targetDate,
    };
    if (q.branchId) where.branch_id = q.branchId;

    const sessions = await this.prisma.sales_shift_sessions.findMany({
      where,
      include: { shift: true },
      orderBy: { start_time: "asc" },
    });

    const updatedSessions = await Promise.all(
      sessions.map(async (session) => {
        const mapped = this.mapSession(session);
        if (session.status === ShiftSessionStatus.open) {
          const salesData = await this.calculateSessionSales(session);
          return {
            ...mapped,
            ...salesData,
            expectedClosingBalance: expectedDrawerBalance(
              mapped.openingBalance,
              salesData.totalCash,
              await this.drawerAdjustments(session.id),
            ),
          };
        }
        return mapped;
      }),
    );

    const summary = {
      totalSales: updatedSessions.reduce(
        (sum, s) => sum + (s.totalSales ?? 0),
        0,
      ),
      totalCash: updatedSessions.reduce(
        (sum, s) => sum + (s.totalCash ?? 0),
        0,
      ),
      totalCard: updatedSessions.reduce(
        (sum, s) => sum + (s.totalCard ?? 0),
        0,
      ),
      totalWallet: updatedSessions.reduce(
        (sum, s) => sum + (s.totalWallet ?? 0),
        0,
      ),
      totalTransfer: updatedSessions.reduce(
        (sum, s) => sum + (s.totalTransfer ?? 0),
        0,
      ),
      totalDiscount: updatedSessions.reduce(
        (sum, s) => sum + (s.totalDiscount ?? 0),
        0,
      ),
      totalTax: updatedSessions.reduce((sum, s) => sum + (s.totalTax ?? 0), 0),
      totalTransactions: updatedSessions.reduce(
        (sum, s) => sum + (s.transactionsCount ?? 0),
        0,
      ),
      totalCashDifference: updatedSessions.reduce(
        (sum, s) => sum + (s.cashDifference ?? 0),
        0,
      ),
      shiftsCount: updatedSessions.length,
      openShiftsCount: updatedSessions.filter(
        (s) => s.status === ShiftSessionStatus.open,
      ).length,
      closedShiftsCount: updatedSessions.filter(
        (s) =>
          s.status === ShiftSessionStatus.closed ||
          s.status === ShiftSessionStatus.auto_closed,
      ).length,
    };

    return { date: targetDate, summary, sessions: updatedSessions };
  }
}
