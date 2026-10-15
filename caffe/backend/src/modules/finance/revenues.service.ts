import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, QuickSaleStatus, SalesBookingStatus } from "@prisma/client";
import { BranchScopeService } from "../../common/branch-scope/branch-scope.service";
import { paginated } from "../../common/dto/list-result";
import { PrismaService } from "../../common/prisma/prisma.service";
import { JwtUser } from "../../common/types/jwt-user";
import { ModuleLedgerService } from "../accounting/module-ledger.service";
import {
  ListRevenuesDto,
  RevenueStatisticsQueryDto,
  SyncRevenuesDto,
  TopCustomersQueryDto,
  UpsertRevenueDto,
} from "./dto/finance.dto";
import {
  computeRevenueAmounts,
  mapPaymentMethodToArabic,
  nextFinDocNumber,
  notDeletedFilter,
  REVENUE_PAID,
  toNumber,
} from "./finance.utils";

@Injectable()
export class RevenuesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly moduleLedger: ModuleLedgerService,
    private readonly branchScope: BranchScopeService,
  ) {}

  private assertBranchAccess(
    user: JwtUser | undefined,
    branchId: number | null | undefined,
  ) {
    if (branchId == null || !this.branchScope.isBranchAllowed(user, branchId)) {
      throw new ForbiddenException("لا تملك صلاحية الوصول لبيانات هذا الفرع");
    }
  }

  private branchFilter(
    user?: JwtUser,
    requested?: string | number | null,
  ): Prisma.fin_revenuesWhereInput | null {
    const scope = this.branchScope.resolveListFilter(user, requested ?? null);
    return scope === null ? null : { branch_id: { in: scope } };
  }

  private allowedBranchCondition(user?: JwtUser, requested?: number | null) {
    const scope = this.branchScope.resolveListFilter(user, requested ?? null);
    return scope === null ? {} : { branch_id: { in: scope } };
  }

  private map(row: Prisma.fin_revenuesGetPayload<object>) {
    return {
      id: row.id,
      revenueNumber: row.revenue_number,
      revenueDate: row.revenue_date,
      source: row.source,
      subSource: row.sub_source,
      amount: toNumber(row.amount),
      taxAmount: toNumber(row.tax_amount),
      discountAmount: toNumber(row.discount_amount),
      totalAmount: toNumber(row.total_amount),
      netAmount: toNumber(row.net_amount),
      paymentMethod: row.payment_method,
      paymentStatus: row.payment_status,
      description: row.description,
      customerName: row.customer_name,
      invoiceNumber: row.invoice_number,
      receiptNumber: row.receipt_number,
      sourceModule: row.source_module,
      sourceRef: row.source_ref,
      branchId: row.branch_id,
      attachments: row.attachments,
      notes: row.notes,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      isRecurring: row.is_recurring,
      recurringFrequency: row.recurring_frequency,
      nextRecurringDate: row.next_recurring_date,
    };
  }

  private buildListWhere(
    q: ListRevenuesDto,
    user?: JwtUser,
  ): Prisma.fin_revenuesWhereInput {
    const and: Prisma.fin_revenuesWhereInput[] = [notDeletedFilter()];
    if (q.search?.trim()) {
      const s = q.search.trim();
      and.push({
        OR: [
          { revenue_number: { contains: s } },
          { customer_name: { contains: s } },
          { description: { contains: s } },
        ],
      });
    }
    if (q.branchId && q.branchId !== "all")
      and.push({ branch_id: Number(q.branchId) });
    const scope = this.branchFilter(user, q.branchId ?? null);
    if (scope) and.push(scope);
    if (q.source && q.source !== "all") and.push({ source: q.source });
    if (q.paymentStatus && q.paymentStatus !== "all") {
      and.push({ payment_status: q.paymentStatus });
    }
    if (q.dateFrom || q.dateTo) {
      and.push({
        revenue_date: {
          ...(q.dateFrom ? { gte: q.dateFrom } : {}),
          ...(q.dateTo ? { lte: q.dateTo } : {}),
        },
      });
    }
    return { AND: and };
  }

  async list(q: ListRevenuesDto, user?: JwtUser) {
    const where = this.buildListWhere(q, user);
    const [rows, total] = await Promise.all([
      this.prisma.fin_revenues.findMany({
        where,
        orderBy: { id: "desc" },
        skip: q.skip,
        take: q.take,
      }),
      this.prisma.fin_revenues.count({ where }),
    ]);
    return paginated(
      rows.map((r) => this.map(r)),
      total,
      q.page,
      q.pageSize,
    );
  }

  async findOne(id: number, user?: JwtUser) {
    const row = await this.prisma.fin_revenues.findFirst({
      where: { id, ...notDeletedFilter() },
    });
    if (!row) throw new NotFoundException("الإيراد غير موجود");
    this.assertBranchAccess(user, row.branch_id);
    return this.map(row);
  }

  async statistics(q: RevenueStatisticsQueryDto, user?: JwtUser) {
    const and: Prisma.fin_revenuesWhereInput[] = [notDeletedFilter()];
    if (q.branchId && q.branchId !== "all")
      and.push({ branch_id: Number(q.branchId) });
    const scope = this.branchFilter(user, q.branchId ?? null);
    if (scope) and.push(scope);
    if (q.dateFrom || q.dateTo) {
      and.push({
        revenue_date: {
          ...(q.dateFrom ? { gte: q.dateFrom } : {}),
          ...(q.dateTo ? { lte: q.dateTo } : {}),
        },
      });
    }
    const where = { AND: and };
    const [total, aggregate, bySource, byPayment] = await Promise.all([
      this.prisma.fin_revenues.count({ where }),
      this.prisma.fin_revenues.aggregate({
        where,
        _sum: { net_amount: true, total_amount: true },
      }),
      this.prisma.fin_revenues.groupBy({
        by: ["source"],
        where,
        _count: true,
        _sum: { net_amount: true },
      }),
      this.prisma.fin_revenues.groupBy({
        by: ["payment_status"],
        where,
        _count: true,
        _sum: { net_amount: true },
      }),
    ]);
    return {
      total,
      totalNetAmount: toNumber(aggregate._sum.net_amount),
      totalAmount: toNumber(aggregate._sum.total_amount),
      bySource: bySource.map((r) => ({
        source: r.source,
        count: r._count,
        netAmount: toNumber(r._sum.net_amount),
      })),
      byPaymentStatus: byPayment.map((r) => ({
        status: r.payment_status,
        count: r._count,
        netAmount: toNumber(r._sum.net_amount),
      })),
    };
  }

  async topCustomers(q: TopCustomersQueryDto, user?: JwtUser) {
    const and: Prisma.fin_revenuesWhereInput[] = [
      notDeletedFilter(),
      { payment_status: REVENUE_PAID },
      { customer_name: { not: null } },
    ];
    if (q.branchId && q.branchId !== "all")
      and.push({ branch_id: Number(q.branchId) });
    const scope = this.branchFilter(user, q.branchId ?? null);
    if (scope) and.push(scope);
    if (q.dateFrom || q.dateTo) {
      and.push({
        revenue_date: {
          ...(q.dateFrom ? { gte: q.dateFrom } : {}),
          ...(q.dateTo ? { lte: q.dateTo } : {}),
        },
      });
    }
    const where = { AND: and };
    const grouped = await this.prisma.fin_revenues.groupBy({
      by: ["customer_name"],
      where,
      _count: true,
      _sum: { net_amount: true },
      orderBy: { _sum: { net_amount: "desc" } },
      take: q.limit ?? q.pageSize,
    });
    const data = grouped.map((r) => ({
      customerName: r.customer_name,
      transactionCount: r._count,
      totalNetAmount: toNumber(r._sum.net_amount),
    }));
    return paginated(data, data.length, 1, data.length || 1);
  }

  async create(dto: UpsertRevenueDto, userId: number, user?: JwtUser) {
    const allowed = this.branchScope.allowedBranchIds(user);
    const branchId =
      dto.branchId ?? (allowed === null ? undefined : allowed[0]);
    if (branchId != null) this.assertBranchAccess(user, branchId);
    const totals = computeRevenueAmounts(
      dto.amount,
      dto.taxAmount ?? 0,
      dto.discountAmount ?? 0,
    );
    const paymentStatus = dto.paymentStatus ?? REVENUE_PAID;
    const paymentMethod = dto.paymentMethod ?? "نقدي";
    const revenueDate =
      dto.revenueDate ?? new Date().toISOString().slice(0, 10);
    const row = await this.prisma.$transaction(async (tx) => {
      const revenueNumber = await nextFinDocNumber(
        tx,
        "fin_revenues",
        "revenue_number",
        "REV",
      );
      const created = await tx.fin_revenues.create({
        data: {
          revenue_number: revenueNumber,
          revenue_date: revenueDate,
          source: dto.source.trim(),
          sub_source: dto.subSource?.trim() ?? null,
          amount: totals.amount,
          tax_amount: totals.taxAmount,
          discount_amount: totals.discountAmount,
          total_amount: totals.totalAmount,
          net_amount: totals.netAmount,
          payment_method: paymentMethod,
          payment_status: paymentStatus,
          description: dto.description ?? null,
          customer_name: dto.customerName ?? null,
          invoice_number: dto.invoiceNumber ?? null,
          receipt_number: dto.receiptNumber ?? null,
          branch_id: branchId ?? null,
          notes: dto.notes ?? null,
          is_recurring: dto.isRecurring ?? false,
          recurring_frequency: dto.recurringFrequency ?? null,
          next_recurring_date: dto.isRecurring
            ? (dto.nextRecurringDate ??
              dto.revenueDate ??
              new Date().toISOString().slice(0, 10))
            : null,
          created_by: userId,
        },
      });
      // GL is the authoritative income statement. Manual (misc) revenue never posted to the GL
      // before, so it silently diverged from the accounting income statement. Post a balanced GL
      // entry here (debit cash/bank, credit 'other_revenue') within the same tx, idempotent per
      // revenue_number. Sale/subscription/spa revenue is NOT posted here — it already hits GL at
      // its own source module (posting it again would double-count). Only post when actually paid.
      if (paymentStatus === REVENUE_PAID) {
        await this.moduleLedger.postOtherRevenue(
          {
            sourceRef: revenueNumber,
            branchId,
            date: revenueDate,
            amount: totals.netAmount,
            paymentMethod,
            description: dto.description ?? `إيراد ${revenueNumber}`,
            createdBy: userId,
          },
          tx,
        );
      }
      return created;
    });
    return this.map(row);
  }

  async update(
    id: number,
    dto: Partial<UpsertRevenueDto>,
    userId: number,
    user?: JwtUser,
  ) {
    const existing = await this.prisma.fin_revenues.findFirst({
      where: { id, ...notDeletedFilter() },
    });
    if (!existing) throw new NotFoundException("الإيراد غير موجود");
    this.assertBranchAccess(user, existing.branch_id);
    if (dto.branchId != null) this.assertBranchAccess(user, dto.branchId);
    const amount = dto.amount ?? toNumber(existing.amount);
    const taxAmount = dto.taxAmount ?? toNumber(existing.tax_amount);
    const discountAmount =
      dto.discountAmount ?? toNumber(existing.discount_amount);
    const totals = computeRevenueAmounts(amount, taxAmount, discountAmount);
    const paymentStatus = dto.paymentStatus ?? existing.payment_status;
    const revenueDate = dto.revenueDate ?? existing.revenue_date;
    const paymentMethod = dto.paymentMethod ?? existing.payment_method;
    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.fin_revenues.update({
        where: { id },
        data: {
          ...(dto.revenueDate !== undefined
            ? { revenue_date: dto.revenueDate }
            : {}),
          ...(dto.source !== undefined ? { source: dto.source.trim() } : {}),
          ...(dto.subSource !== undefined
            ? { sub_source: dto.subSource?.trim() ?? null }
            : {}),
          amount: totals.amount,
          tax_amount: totals.taxAmount,
          discount_amount: totals.discountAmount,
          total_amount: totals.totalAmount,
          net_amount: totals.netAmount,
          ...(dto.paymentMethod !== undefined
            ? { payment_method: dto.paymentMethod }
            : {}),
          ...(dto.paymentStatus !== undefined
            ? { payment_status: dto.paymentStatus }
            : {}),
          ...(dto.description !== undefined
            ? { description: dto.description }
            : {}),
          ...(dto.customerName !== undefined
            ? { customer_name: dto.customerName }
            : {}),
          ...(dto.invoiceNumber !== undefined
            ? { invoice_number: dto.invoiceNumber }
            : {}),
          ...(dto.receiptNumber !== undefined
            ? { receipt_number: dto.receiptNumber }
            : {}),
          ...(dto.branchId !== undefined ? { branch_id: dto.branchId } : {}),
          ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
        },
      });
      // Manual (non-synced) revenue posts GL on create — keep the ledger in sync on edit.
      if (!existing.source_module) {
        const glChanged =
          paymentStatus !== existing.payment_status ||
          totals.netAmount !== toNumber(existing.net_amount) ||
          revenueDate !== existing.revenue_date ||
          paymentMethod !== existing.payment_method;
        if (glChanged) {
          await this.moduleLedger.syncOtherRevenue(
            {
              sourceRef: existing.revenue_number,
              branchId: updated.branch_id ?? undefined,
              date: revenueDate,
              amount: totals.netAmount,
              paymentMethod,
              description:
                updated.description ?? `إيراد ${existing.revenue_number}`,
              createdBy: userId,
              post: paymentStatus === REVENUE_PAID,
            },
            tx,
          );
        }
      }
      return updated;
    });
    return this.map(row);
  }

  async remove(id: number, userId: number, user?: JwtUser) {
    const existing = await this.prisma.fin_revenues.findFirst({
      where: { id, ...notDeletedFilter() },
    });
    if (!existing) throw new NotFoundException("الإيراد غير موجود");
    this.assertBranchAccess(user, existing.branch_id);
    if (existing.source_module) {
      throw new BadRequestException(
        "لا يمكن حذف إيراد متزامن من المالية؛ يجب إلغاء العملية من مصدرها",
      );
    }
    await this.prisma.$transaction(async (tx) => {
      const activeEntry = await tx.acc_journal_entries.findFirst({
        where: {
          source_module: "finance",
          source_doc_type: "revenue",
          source_doc_id: existing.revenue_number,
          status: "posted",
          reversed_by_id: null,
        },
        orderBy: { source_version: "desc" },
      });
      if (activeEntry) {
        await this.moduleLedger.syncOtherRevenue(
          {
            sourceRef: existing.revenue_number,
            branchId: existing.branch_id ?? undefined,
            date: existing.revenue_date,
            amount: toNumber(existing.net_amount),
            paymentMethod: existing.payment_method,
            description:
              existing.description ?? `حذف إيراد ${existing.revenue_number}`,
            createdBy: userId,
            post: false,
          },
          tx,
        );
      }
      await tx.fin_revenues.update({
        where: { id },
        data: { is_deleted: true, deleted_at: new Date() },
      });
    });
    return { success: true };
  }

  // sync() backfills the operational fin_revenues log from sale/subscription/booking/locker/
  // spa/inbody sources. Most sources already post their balanced GL entry at creation time. Legacy
  // paid bookings did not, so their loop also idempotently backfills the missing booking GL entry.
  // Manual (create) and recurring (cron) non-sale revenue use postOtherRevenue instead.
  async sync(dto: SyncRevenuesDto, userId: number, user?: JwtUser) {
    if (dto.branchId != null) this.assertBranchAccess(user, dto.branchId);
    const allowedBranches = this.branchScope.resolveListFilter(
      user,
      dto.branchId ?? null,
    );
    const branchFilter = this.allowedBranchCondition(
      user,
      dto.branchId ?? null,
    );
    const receiptBranchFilter =
      allowedBranches === null
        ? {}
        : { subscription: { branch_id: { in: allowedBranches } } };
    const lockerBranchFilter =
      allowedBranches === null
        ? {}
        : { main_branch_id: { in: allowedBranches } };
    const dateFilter = { gte: dto.startDate, lte: dto.endDate };

    const [
      quickSales,
      receipts,
      bookings,
      lockerSubs,
      spaInvoices,
      inbodyInvoices,
    ] = await Promise.all([
      this.prisma.sales_quick_sales.findMany({
        where: {
          status: QuickSaleStatus.completed,
          sale_date: dateFilter,
          ...branchFilter,
        },
      }),
      this.prisma.club_receipts.findMany({
        where: {
          receipt_date: dateFilter,
          status: { in: ["مدفوعة", "paid"] },
          ...receiptBranchFilter,
        },
        include: { subscription: { select: { branch_id: true } } },
      }),
      this.prisma.sales_bookings.findMany({
        where: {
          // Payment is the accounting trigger. An in-progress (or still-pending) booking can
          // already be paid and must not disappear from revenue merely because service delivery
          // has not finished yet. Only a cancelled booking is excluded; its refund is a separate
          // financial event.
          status: { not: SalesBookingStatus.cancelled },
          payment_status: "paid",
          payments: { none: {} },
          booking_date: dateFilter,
          ...branchFilter,
        },
      }),
      this.prisma.club_locker_subscriptions.findMany({
        where: {
          subscription_start_date: dateFilter,
          ...lockerBranchFilter,
        },
      }),
      this.prisma.club_spa_invoices.findMany({
        where: {
          is_active: true,
          status: "paid",
          covered_by_subscription: false,
          total_amount: { gt: 0 },
          invoice_date: dateFilter,
          ...branchFilter,
        },
        include: { service: { select: { name: true } } },
      }),
      this.prisma.club_inbody_invoices.findMany({
        where: {
          is_active: true,
          status: "paid",
          covered_by_subscription: false,
          total_amount: { gt: 0 },
          invoice_date: dateFilter,
          ...branchFilter,
        },
      }),
    ]);

    const filteredReceipts =
      allowedBranches === null
        ? receipts
        : receipts.filter(
            (r) =>
              r.subscription?.branch_id != null &&
              allowedBranches.includes(r.subscription.branch_id),
          );

    let created = 0;
    let skipped = 0;

    await this.prisma.$transaction(async (tx) => {
      for (const sale of quickSales) {
        const exists = await tx.fin_revenues.findFirst({
          where: { source_module: "quick_sale", source_ref: sale.sale_number },
        });
        if (exists) {
          skipped++;
          continue;
        }
        const subtotal = toNumber(sale.subtotal);
        const tax = toNumber(sale.tax_amount);
        const discount = toNumber(sale.discount_amount);
        const totals = computeRevenueAmounts(subtotal, tax, discount);
        const revenueNumber = await nextFinDocNumber(
          tx,
          "fin_revenues",
          "revenue_number",
          "REV",
        );
        await tx.fin_revenues.create({
          data: {
            revenue_number: revenueNumber,
            revenue_date: sale.sale_date,
            source: "مبيعات سريعة",
            sub_source: "نقطة البيع",
            amount: totals.amount,
            tax_amount: totals.taxAmount,
            discount_amount: totals.discountAmount,
            total_amount: totals.totalAmount,
            net_amount: totals.netAmount,
            payment_method: mapPaymentMethodToArabic(sale.payment_method),
            payment_status: REVENUE_PAID,
            description: sale.notes,
            customer_name: sale.customer_name,
            source_module: "quick_sale",
            source_ref: sale.sale_number,
            branch_id: sale.branch_id,
            created_by: userId,
          },
        });
        created++;
      }

      for (const receipt of filteredReceipts) {
        const exists = await tx.fin_revenues.findFirst({
          where: {
            source_module: "club_receipt",
            source_ref: receipt.receipt_number,
          },
        });
        if (exists) {
          skipped++;
          continue;
        }
        const amt = toNumber(receipt.amount);
        if (amt <= 0) {
          skipped++;
          continue;
        }
        const totals = computeRevenueAmounts(amt, 0, 0);
        const revenueNumber = await nextFinDocNumber(
          tx,
          "fin_revenues",
          "revenue_number",
          "REV",
        );
        await tx.fin_revenues.create({
          data: {
            revenue_number: revenueNumber,
            revenue_date: receipt.receipt_date,
            source: "اشتراكات النادي",
            sub_source: receipt.type ?? "إيصال",
            amount: totals.amount,
            tax_amount: totals.taxAmount,
            discount_amount: totals.discountAmount,
            total_amount: totals.totalAmount,
            net_amount: totals.netAmount,
            payment_method: "نقدي",
            payment_status: REVENUE_PAID,
            description: receipt.description,
            customer_name: receipt.member_name,
            receipt_number: receipt.receipt_number,
            source_module: "club_receipt",
            source_ref: receipt.receipt_number,
            branch_id: receipt.subscription?.branch_id ?? null,
            created_by: userId,
          },
        });
        created++;
      }

      for (const booking of bookings) {
        const amt =
          toNumber(booking.final_amount) || toNumber(booking.total_price);
        await this.moduleLedger.postBookingRevenue(
          {
            bookingNumber: booking.booking_number,
            branchId: booking.branch_id,
            bookingDate: booking.booking_date,
            amount: amt,
            createdBy: booking.created_by ?? userId,
            paymentMethod: "نقدي",
          },
          tx,
        );
        const exists = await tx.fin_revenues.findFirst({
          where: {
            source_module: "booking",
            source_ref: booking.booking_number,
          },
        });
        if (exists) {
          skipped++;
          continue;
        }
        if (amt <= 0) {
          skipped++;
          continue;
        }
        const totals = computeRevenueAmounts(amt, 0, 0);
        const revenueNumber = await nextFinDocNumber(
          tx,
          "fin_revenues",
          "revenue_number",
          "REV",
        );
        await tx.fin_revenues.create({
          data: {
            revenue_number: revenueNumber,
            revenue_date: booking.booking_date,
            source: "حجوزات",
            sub_source: booking.status,
            amount: totals.amount,
            tax_amount: totals.taxAmount,
            discount_amount: totals.discountAmount,
            total_amount: totals.totalAmount,
            net_amount: totals.netAmount,
            payment_method: mapPaymentMethodToArabic(booking.payment_method),
            payment_status: REVENUE_PAID,
            description: booking.notes,
            customer_name: booking.customer_name,
            source_module: "booking",
            source_ref: booking.booking_number,
            branch_id: booking.branch_id,
            created_by: userId,
          },
        });
        created++;
      }

      for (const locker of lockerSubs) {
        const exists = await tx.fin_revenues.findFirst({
          where: {
            source_module: "locker_subscription",
            source_ref: locker.subscription_number,
          },
        });
        if (exists) {
          skipped++;
          continue;
        }
        const amt = toNumber(locker.paid_amount);
        if (amt <= 0) {
          skipped++;
          continue;
        }
        const totals = computeRevenueAmounts(amt, 0, 0);
        const revenueNumber = await nextFinDocNumber(
          tx,
          "fin_revenues",
          "revenue_number",
          "REV",
        );
        await tx.fin_revenues.create({
          data: {
            revenue_number: revenueNumber,
            revenue_date: locker.subscription_start_date,
            source: "لوكرات",
            sub_source: "اشتراك لوكر",
            amount: totals.amount,
            tax_amount: totals.taxAmount,
            discount_amount: totals.discountAmount,
            total_amount: totals.totalAmount,
            net_amount: totals.netAmount,
            payment_method: "نقدي",
            payment_status: REVENUE_PAID,
            description: locker.subscription_number,
            customer_name: locker.customer_name,
            source_module: "locker_subscription",
            source_ref: locker.subscription_number,
            branch_id: locker.main_branch_id,
            created_by: userId,
          },
        });
        created++;
      }

      for (const spa of spaInvoices) {
        const exists = await tx.fin_revenues.findFirst({
          where: {
            source_module: "spa_invoice",
            source_ref: spa.invoice_number,
          },
        });
        if (exists) {
          skipped++;
          continue;
        }
        const amt = toNumber(spa.total_amount);
        if (amt <= 0) {
          skipped++;
          continue;
        }
        const totals = computeRevenueAmounts(amt, 0, 0);
        const revenueNumber = await nextFinDocNumber(
          tx,
          "fin_revenues",
          "revenue_number",
          "REV",
        );
        await tx.fin_revenues.create({
          data: {
            revenue_number: revenueNumber,
            revenue_date: spa.invoice_date,
            source: "خدمات SPA",
            sub_source: spa.service?.name ?? "SPA",
            amount: totals.amount,
            tax_amount: totals.taxAmount,
            discount_amount: totals.discountAmount,
            total_amount: totals.totalAmount,
            net_amount: totals.netAmount,
            payment_method: mapPaymentMethodToArabic(spa.payment_method),
            payment_status: REVENUE_PAID,
            customer_name: spa.service?.name ?? "SPA",
            source_module: "spa_invoice",
            source_ref: spa.invoice_number,
            branch_id: spa.branch_id,
            created_by: userId,
          },
        });
        created++;
      }

      for (const inbody of inbodyInvoices) {
        const exists = await tx.fin_revenues.findFirst({
          where: {
            source_module: "inbody_invoice",
            source_ref: inbody.invoice_number,
          },
        });
        if (exists) {
          skipped++;
          continue;
        }
        const amt = toNumber(inbody.total_amount);
        if (amt <= 0) {
          skipped++;
          continue;
        }
        const totals = computeRevenueAmounts(amt, 0, 0);
        const revenueNumber = await nextFinDocNumber(
          tx,
          "fin_revenues",
          "revenue_number",
          "REV",
        );
        await tx.fin_revenues.create({
          data: {
            revenue_number: revenueNumber,
            revenue_date: inbody.invoice_date,
            source: "InBody",
            sub_source: "فحص InBody",
            amount: totals.amount,
            tax_amount: totals.taxAmount,
            discount_amount: totals.discountAmount,
            total_amount: totals.totalAmount,
            net_amount: totals.netAmount,
            payment_method: mapPaymentMethodToArabic(inbody.payment_method),
            payment_status: REVENUE_PAID,
            customer_name: inbody.customer_name ?? "InBody",
            source_module: "inbody_invoice",
            source_ref: inbody.invoice_number,
            branch_id: inbody.branch_id,
            created_by: userId,
          },
        });
        created++;
      }
    });

    return { created, skipped, total: created + skipped };
  }
}
