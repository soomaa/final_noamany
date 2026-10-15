import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, SalesBookingStatus } from "@prisma/client";
import { paginated } from "../../common/dto/list-result";
import { PrismaService } from "../../common/prisma/prisma.service";
import { assertCapacity, assertNotPastDate } from "../../common/validators";
import {
  BookingAvailabilityQueryDto,
  BookingTimeSlotsQueryDto,
  BookingPaymentDto,
  CreateBookingDto,
  ListBookingsDto,
} from "./dto/bookings.dto";
import { PosSettingsService } from "./pos-admin/pos-reports-notifications.service";
import { toDecimal, toNumber } from "./sales.utils";
import { ModuleLedgerService } from "../accounting/module-ledger.service";
import { recordSystemRevenue } from "../finance/system-revenue.util";
import { ShiftSessionsService } from "./shift-sessions.service";
import { retryOnUniqueViolation } from "../../common/retry-unique";

const ACTIVE_BOOKING_STATUSES: SalesBookingStatus[] = [
  SalesBookingStatus.pending,
  SalesBookingStatus.confirmed,
  SalesBookingStatus.in_progress,
];

@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly posSettings: PosSettingsService,
    private readonly moduleLedger: ModuleLedgerService,
    private readonly sessions: ShiftSessionsService,
  ) {}

  private map(
    row: Prisma.sales_bookingsGetPayload<{
      include: { service: true; payments: true };
    }>,
  ) {
    const paidAmount = toNumber(row.paid_amount);
    const refundedAmount = toNumber(row.refunded_amount);
    return {
      id: row.id,
      bookingNumber: row.booking_number,
      customerName: row.customer_name,
      customerPhone: row.customer_phone,
      branchId: row.branch_id,
      serviceId: row.service_id,
      salesEmployeeId: row.sales_employee_id,
      bookingDate: row.booking_date,
      bookingTime: row.booking_time,
      status: row.status,
      totalPrice: toNumber(row.total_price),
      finalAmount: toNumber(row.final_amount),
      paymentStatus: row.payment_status,
      paidAmount,
      refundedAmount,
      netCollected: paidAmount - refundedAmount,
      outstandingAmount: Math.max(
        0,
        toNumber(row.final_amount) - paidAmount + refundedAmount,
      ),
      paymentMethod: row.payment_method,
      paidAt: row.paid_at,
      notes: row.notes,
      createdBy: row.created_by,
      service: row.service
        ? {
            id: row.service.id,
            name: row.service.name,
            price: toNumber(row.service.price),
          }
        : undefined,
      payments: row.payments.map((payment) => ({
        id: payment.id,
        paymentNumber: payment.payment_number,
        kind: payment.kind,
        amount: toNumber(payment.amount),
        method: payment.method,
        paymentDate: payment.payment_date,
        shiftSessionId: payment.shift_session_id,
        notes: payment.notes,
        createdAt: payment.created_at,
      })),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private normalizeSlotTime(time: string): string {
    return time.length === 5 ? time : time.substring(0, 5);
  }

  private async countBookedAt(branchId: number, date: string, time: string) {
    const slot = this.normalizeSlotTime(time);
    const bookings = await this.prisma.sales_bookings.findMany({
      where: {
        branch_id: branchId,
        booking_date: date,
        status: { in: ACTIVE_BOOKING_STATUSES },
      },
    });
    return bookings.filter(
      (b) => this.normalizeSlotTime(b.booking_time) === slot,
    ).length;
  }

  private async resolveCapacity(branchId: number): Promise<number> {
    const fromSettings = await this.posSettings.getNumericSetting(
      "booking",
      "capacity",
      branchId,
    );
    return fromSettings ?? 10;
  }

  async listServices(branchId?: number) {
    const where: Prisma.sales_booking_servicesWhereInput = { is_active: true };
    if (branchId) {
      where.OR = [{ branch_id: branchId }, { branch_id: null }];
    }
    const rows = await this.prisma.sales_booking_services.findMany({
      where,
      orderBy: [{ sort_order: "asc" }, { name: "asc" }],
    });
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      nameEn: r.name_en,
      price: toNumber(r.price),
      branchId: r.branch_id,
    }));
  }

  async availability(q: BookingAvailabilityQueryDto) {
    const totalTables =
      q.totalTables ?? (await this.resolveCapacity(q.branchId));
    const bookedTables = await this.countBookedAt(q.branchId, q.date, q.time);
    const availableTables = Math.max(0, totalTables - bookedTables);
    return {
      time: q.time,
      date: q.date,
      totalTables,
      bookedTables,
      availableTables,
      isAvailable: availableTables > 0,
      occupancyRate: totalTables > 0 ? bookedTables / totalTables : 0,
    };
  }

  async timeSlots(q: BookingTimeSlotsQueryDto) {
    const totalTables =
      q.totalTables ?? (await this.resolveCapacity(q.branchId));
    const bookings = await this.prisma.sales_bookings.findMany({
      where: {
        branch_id: q.branchId,
        booking_date: q.date,
        status: { in: ACTIVE_BOOKING_STATUSES },
      },
    });

    const timeSlots: object[] = [];
    for (let hour = 8; hour < 18; hour++) {
      for (let minute = 0; minute < 60; minute += 30) {
        const timeString = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
        const bookedTables = bookings.filter(
          (b) => this.normalizeSlotTime(b.booking_time) === timeString,
        ).length;
        const availableTables = Math.max(0, totalTables - bookedTables);

        let status = "available";
        let label = "متاح بالكامل";
        if (totalTables > 0 && bookedTables >= totalTables) {
          status = "fully_booked";
          label = "محجوز بالكامل";
        } else if (totalTables > 0 && bookedTables >= totalTables * 0.8) {
          status = "busy";
          label = "مزدحم";
        } else if (bookedTables > 0) {
          status = "partially_available";
          label = "متاح جزئياً";
        }

        timeSlots.push({
          time: timeString,
          status,
          label,
          bookedTables,
          totalTables,
          availableTables,
          occupancyRate: totalTables > 0 ? bookedTables / totalTables : 0,
        });
      }
    }

    return { timeSlots, totalTables, date: q.date, branchId: q.branchId };
  }

  async list(q: ListBookingsDto) {
    const and: Prisma.sales_bookingsWhereInput[] = [];
    if (q.search?.trim()) {
      const s = q.search.trim();
      and.push({
        OR: [
          { booking_number: { contains: s } },
          { customer_name: { contains: s } },
          { customer_phone: { contains: s } },
        ],
      });
    }
    if (q.branchId) and.push({ branch_id: q.branchId });
    if (q.status && q.status !== "all") {
      and.push({ status: q.status as SalesBookingStatus });
    }
    if (q.dateFrom || q.dateTo) {
      and.push({
        booking_date: {
          ...(q.dateFrom ? { gte: q.dateFrom } : {}),
          ...(q.dateTo ? { lte: q.dateTo } : {}),
        },
      });
    }
    const where = and.length ? { AND: and } : {};
    const [rows, total] = await Promise.all([
      this.prisma.sales_bookings.findMany({
        where,
        include: { service: true, payments: { orderBy: { id: "asc" } } },
        orderBy: { id: "desc" },
        skip: q.skip,
        take: q.take,
      }),
      this.prisma.sales_bookings.count({ where }),
    ]);
    return paginated(
      rows.map((r) => this.map(r)),
      total,
      q.page,
      q.pageSize,
    );
  }

  private async generateBookingNumber(
    tx: Prisma.TransactionClient,
  ): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `BK-${year}-`;
    const rows = await tx.$queryRaw<{ maxNum: number | null }[]>`
      SELECT MAX(CAST(SUBSTRING(booking_number, ${prefix.length + 1}) AS UNSIGNED)) AS maxNum
      FROM sales_bookings
      WHERE booking_number LIKE ${`${prefix}%`}
    `;
    const next = (rows[0]?.maxNum ?? 0) + 1;
    return `${prefix}${String(next).padStart(6, "0")}`;
  }

  async create(dto: CreateBookingDto, userId: number) {
    assertNotPastDate(dto.bookingDate);

    const branch = await this.prisma.tbl_branches.findUnique({
      where: { branch_id: dto.branchId },
    });
    if (!branch) throw new BadRequestException("الفرع المحدد غير موجود");

    if (!dto.serviceId) {
      throw new BadRequestException("يجب اختيار خدمة من الكتالوج");
    }
    const service = await this.prisma.sales_booking_services.findFirst({
      where: {
        id: dto.serviceId,
        is_active: true,
        OR: [{ branch_id: dto.branchId }, { branch_id: null }],
      },
    });
    if (!service)
      throw new BadRequestException(
        "الخدمة المحددة غير موجودة أو غير متاحة لهذا الفرع",
      );

    if (dto.salesEmployeeId) {
      const emp = await this.prisma.employees.findUnique({
        where: { id: dto.salesEmployeeId },
      });
      if (!emp) throw new BadRequestException("موظف المبيعات غير موجود");
    }

    const totalPrice = toNumber(service.price);
    const finalAmount = dto.finalAmount != null ? dto.finalAmount : totalPrice;
    const bookingTime =
      dto.bookingTime.length === 5 ? `${dto.bookingTime}:00` : dto.bookingTime;

    const capacity =
      dto.totalTables ?? (await this.resolveCapacity(dto.branchId));
    const booked = await this.countBookedAt(
      dto.branchId,
      dto.bookingDate,
      bookingTime,
    );
    assertCapacity(booked, capacity, 1, "تم تجاوز السعة المتاحة لهذا التوقيت");

    const row = await this.prisma.$transaction(async (tx) => {
      const bookingNumber = await this.generateBookingNumber(tx);
      return tx.sales_bookings.create({
        data: {
          booking_number: bookingNumber,
          customer_name: dto.customerName.trim(),
          customer_phone: dto.customerPhone.trim(),
          branch_id: dto.branchId,
          service_id: dto.serviceId,
          sales_employee_id: dto.salesEmployeeId ?? null,
          booking_date: dto.bookingDate,
          booking_time: bookingTime,
          total_price: toDecimal(totalPrice),
          final_amount: toDecimal(finalAmount),
          notes: dto.notes ?? null,
          created_by: userId,
        },
        include: { service: true, payments: true },
      });
    });

    return this.map(row);
  }

  async findOne(id: number) {
    const row = await this.prisma.sales_bookings.findUnique({
      where: { id },
      include: { service: true, payments: { orderBy: { id: "asc" } } },
    });
    if (!row) throw new NotFoundException("الحجز غير موجود");
    return this.map(row);
  }

  private async generatePaymentNumber(
    tx: Prisma.TransactionClient,
    kind: "payment" | "refund",
  ) {
    const prefix = `${kind === "payment" ? "BKP" : "BKR"}-${new Date().getFullYear()}-`;
    const latest = await tx.sales_booking_payments.findFirst({
      where: { payment_number: { startsWith: prefix } },
      orderBy: { payment_number: "desc" },
      select: { payment_number: true },
    });
    const last = latest
      ? Number(latest.payment_number.slice(prefix.length))
      : 0;
    return `${prefix}${String((Number.isFinite(last) ? last : 0) + 1).padStart(6, "0")}`;
  }

  async addPayment(id: number, dto: BookingPaymentDto, userId: number) {
    await retryOnUniqueViolation(() =>
      this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw(Prisma.sql`
        SELECT id FROM sales_bookings WHERE id = ${id} FOR UPDATE
      `);
        const booking = await tx.sales_bookings.findUnique({ where: { id } });
        if (!booking) throw new NotFoundException("الحجز غير موجود");
        if (booking.status === SalesBookingStatus.cancelled) {
          throw new BadRequestException("لا يمكن تحصيل دفعة على حجز ملغي");
        }
        const paid = toNumber(booking.paid_amount);
        const refunded = toNumber(booking.refunded_amount);
        const outstanding = Math.max(
          0,
          toNumber(booking.final_amount) - paid + refunded,
        );
        if (dto.amount > outstanding + 0.001) {
          throw new BadRequestException(
            `قيمة الدفعة أكبر من المتبقي (${outstanding.toFixed(2)})`,
          );
        }
        const session = await this.sessions.findBranchSessionForSale(
          tx,
          booking.branch_id,
          userId,
        );
        if (!session) {
          throw new BadRequestException(
            "افتح وردية باسم المستخدم الحالي قبل تحصيل دفعة الحجز",
          );
        }
        const paymentNumber = await this.generatePaymentNumber(tx, "payment");
        await tx.sales_booking_payments.create({
          data: {
            payment_number: paymentNumber,
            booking_id: booking.id,
            shift_session_id: session.id,
            kind: "payment",
            amount: dto.amount,
            method: dto.method,
            payment_date: dto.paymentDate,
            notes: dto.notes ?? null,
            created_by: userId,
          },
        });
        const nextPaid = paid + dto.amount;
        const net = nextPaid - refunded;
        const nextMethod =
          booking.payment_method == null ||
          booking.payment_method === dto.method
            ? dto.method
            : "mixed";
        await tx.sales_bookings.update({
          where: { id },
          data: {
            paid_amount: nextPaid,
            payment_status:
              net + 0.001 >= toNumber(booking.final_amount)
                ? "paid"
                : "partial",
            payment_method: nextMethod,
            paid_at: new Date(),
          },
        });
        await this.sessions.applyBookingPaymentToSession(tx, session.id, {
          amount: dto.amount,
          paymentMethod: dto.method,
          kind: "payment",
        });
        await this.moduleLedger.postBookingPayment(
          {
            paymentNumber,
            bookingNumber: booking.booking_number,
            branchId: booking.branch_id,
            date: dto.paymentDate,
            amount: dto.amount,
            paymentMethod: dto.method,
            createdBy: userId,
          },
          tx,
        );
        await recordSystemRevenue(tx, {
          sourceModule: "booking_payment",
          sourceRef: paymentNumber,
          date: dto.paymentDate,
          source: "حجوزات",
          subSource: "دفعة حجز",
          amount: dto.amount,
          description: `دفعة حجز ${booking.booking_number}`,
          customerName: booking.customer_name,
          invoiceNumber: paymentNumber,
          branchId: booking.branch_id,
          createdBy: userId,
          paymentMethod: dto.method,
        });
      }),
    );
    return this.findOne(id);
  }

  async addRefund(id: number, dto: BookingPaymentDto, userId: number) {
    await retryOnUniqueViolation(() =>
      this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw(Prisma.sql`
        SELECT id FROM sales_bookings WHERE id = ${id} FOR UPDATE
      `);
        const booking = await tx.sales_bookings.findUnique({ where: { id } });
        if (!booking) throw new NotFoundException("الحجز غير موجود");
        const paid = toNumber(booking.paid_amount);
        const refunded = toNumber(booking.refunded_amount);
        const refundable = paid - refunded;
        if (dto.amount > refundable + 0.001) {
          throw new BadRequestException(
            `قيمة الاسترداد أكبر من المحصل (${refundable.toFixed(2)})`,
          );
        }
        const session = await this.sessions.findBranchSessionForSale(
          tx,
          booking.branch_id,
          userId,
        );
        if (!session) {
          throw new BadRequestException(
            "افتح وردية باسم المستخدم الحالي قبل استرداد دفعة الحجز",
          );
        }
        const refundNumber = await this.generatePaymentNumber(tx, "refund");
        await tx.sales_booking_payments.create({
          data: {
            payment_number: refundNumber,
            booking_id: booking.id,
            shift_session_id: session.id,
            kind: "refund",
            amount: dto.amount,
            method: dto.method,
            payment_date: dto.paymentDate,
            notes: dto.notes ?? null,
            created_by: userId,
          },
        });
        const nextRefunded = refunded + dto.amount;
        const net = paid - nextRefunded;
        await tx.sales_bookings.update({
          where: { id },
          data: {
            refunded_amount: nextRefunded,
            payment_status:
              net <= 0.001
                ? "refunded"
                : net + 0.001 >= toNumber(booking.final_amount)
                  ? "paid"
                  : "partial",
          },
        });
        await this.sessions.applyBookingPaymentToSession(tx, session.id, {
          amount: dto.amount,
          paymentMethod: dto.method,
          kind: "refund",
        });
        await this.moduleLedger.postBookingRefund(
          {
            refundNumber,
            bookingNumber: booking.booking_number,
            branchId: booking.branch_id,
            date: dto.paymentDate,
            amount: dto.amount,
            paymentMethod: dto.method,
            createdBy: userId,
          },
          tx,
        );
        await recordSystemRevenue(tx, {
          sourceModule: "booking_refund",
          sourceRef: refundNumber,
          date: dto.paymentDate,
          source: "حجوزات",
          subSource: "استرداد حجز",
          amount: -dto.amount,
          description: `استرداد حجز ${booking.booking_number}`,
          customerName: booking.customer_name,
          invoiceNumber: refundNumber,
          branchId: booking.branch_id,
          createdBy: userId,
          paymentMethod: dto.method,
        });
      }),
    );
    return this.findOne(id);
  }

  async updateStatus(id: number, status: SalesBookingStatus) {
    const booking = await this.prisma.sales_bookings.findUnique({
      where: { id },
    });
    if (!booking) throw new NotFoundException("الحجز غير موجود");
    const net =
      toNumber(booking.paid_amount) - toNumber(booking.refunded_amount);
    if (status === SalesBookingStatus.cancelled && net > 0.001) {
      throw new BadRequestException(
        "يجب استرداد المبلغ المحصل بالكامل قبل إلغاء الحجز",
      );
    }
    await this.prisma.sales_bookings.update({
      where: { id },
      data: { status },
    });
    return this.findOne(id);
  }
}
