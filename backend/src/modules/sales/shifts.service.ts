import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, QuickSaleStatus, SalesBookingStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  CreateShiftDto,
  CurrentShiftQueryDto,
  ListShiftsDto,
  ShiftRevenueQueryDto,
  UpdateShiftDto,
} from './dto/shifts.dto';
import { ShiftWindowService, normalizeTime } from './shift-window.service';
import { toNumber } from './sales.utils';

type ShiftRow = Prisma.sales_shiftsGetPayload<object>;
type ResponsibleUser = { user_id: number; name: string | null; username: string | null };

@Injectable()
export class ShiftsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly window: ShiftWindowService,
  ) {}

  private mapShift(row: ShiftRow, responsible?: ResponsibleUser | null) {
    return {
      id: row.id,
      shiftName: row.shift_name,
      startTime: row.start_time,
      endTime: row.end_time,
      branchId: row.branch_id,
      responsibleUserId: row.responsible_user_id,
      isLastShiftOfDay: row.is_last_shift_of_day,
      responsibleUser: responsible
        ? { id: responsible.user_id, name: responsible.name, username: responsible.username }
        : null,
      isActive: row.is_active,
      description: row.description,
      color: row.color,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private async assertNoOverlap(
    startTime: string,
    endTime: string,
    branchId: number | null | undefined,
    excludeId?: number,
  ) {
    const start = normalizeTime(startTime);
    const end = normalizeTime(endTime);
    const peers = await this.prisma.sales_shifts.findMany({
      where: {
        is_active: true,
        branch_id: branchId ?? null,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
    for (const peer of peers) {
      if (this.window.rangesOverlap(start, end, peer.start_time, peer.end_time)) {
        throw new BadRequestException('يوجد تداخل مع وردية أخرى في نفس الوقت');
      }
    }
  }

  async list(q: ListShiftsDto) {
    const where: Prisma.sales_shiftsWhereInput = {};
    // A branch can use its own shifts plus company-wide templates (branch_id = null),
    // matching the schedule-status endpoint and the POS handover workflow.
    if (q.branchId !== undefined) {
      where.OR = [{ branch_id: q.branchId }, { branch_id: null }];
    }
    if (q.isActive !== undefined) where.is_active = q.isActive;
    const rows = await this.prisma.sales_shifts.findMany({
      where,
      orderBy: { start_time: 'asc' },
    });
    const userIds = rows.flatMap((row) => row.responsible_user_id ? [row.responsible_user_id] : []);
    const users = userIds.length
      ? await this.prisma.users.findMany({
          where: { user_id: { in: userIds } },
          select: { user_id: true, name: true, username: true },
        })
      : [];
    const byId = new Map(users.map((user) => [user.user_id, user]));
    return rows.map((r) => this.mapShift(r, r.responsible_user_id ? byId.get(r.responsible_user_id) : null));
  }

  async findOne(id: number) {
    const row = await this.prisma.sales_shifts.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('الوردية غير موجودة');
    const responsible = row.responsible_user_id
      ? await this.prisma.users.findUnique({
          where: { user_id: row.responsible_user_id },
          select: { user_id: true, name: true, username: true },
        })
      : null;
    return this.mapShift(row, responsible);
  }

  async eligibleUsers(branchId?: number) {
    const users = await this.prisma.users.findMany({
      where: {
        approved: 1,
        ...(branchId ? { OR: [{ branch_id_fk: branchId }, { branch_id_fk: null }] } : {}),
      },
      select: { user_id: true, username: true, name: true, level: true, emp_code: true, branch_id_fk: true },
      orderBy: { name: 'asc' },
    });
    const employeeIds = users.flatMap((user) => user.emp_code ? [user.emp_code] : []);
    const employees = employeeIds.length
      ? await this.prisma.employees.findMany({
          where: { id: { in: employeeIds } },
          select: { id: true, employee: true, mosma_wazefy_n: true, mosma_wazefy_code: true, edara_n: true },
        })
      : [];
    const jobIds = employees.flatMap((employee) => employee.mosma_wazefy_code ? [employee.mosma_wazefy_code] : []);
    const jobs = jobIds.length
      ? await this.prisma.department_jobs.findMany({
          where: { id: { in: jobIds } },
          select: { id: true, name: true },
        })
      : [];
    const employeeById = new Map(employees.map((employee) => [employee.id, employee]));
    const jobById = new Map(jobs.map((job) => [job.id, job.name]));
    const isCafeManagement = (value?: string | null) => {
      const normalized = (value ?? '')
        .trim()
        .toLocaleLowerCase()
        .replace(/[إأآ]/g, 'ا')
        .replace(/ة/g, 'ه');
      return normalized === 'اداره الكافيه' || normalized === 'cafe management';
    };
    return users
      .map((user) => {
        const employee = user.emp_code ? employeeById.get(user.emp_code) : undefined;
        const jobTitle = employee?.mosma_wazefy_n?.trim()
          || (employee?.mosma_wazefy_code ? jobById.get(employee.mosma_wazefy_code)?.trim() : null)
          || null;
        const department = employee?.edara_n?.trim() || null;
        return {
          id: user.user_id,
          name: user.name || employee?.employee || user.username,
          username: user.username,
          branchId: user.branch_id_fk,
          jobTitle,
          department,
          isAdmin: user.level === 1,
          eligible: user.level === 1 || isCafeManagement(jobTitle),
        };
      })
      .filter((user) => user.eligible);
  }

  async getScheduleStatus(q: CurrentShiftQueryDto) {
    const now = this.window.nowTime();
    const shifts = await this.prisma.sales_shifts.findMany({
      where: {
        is_active: true,
        ...(q.branchId !== undefined
          ? { OR: [{ branch_id: q.branchId }, { branch_id: null }] }
          : {}),
      },
      orderBy: { start_time: 'asc' },
    });
    if (!shifts.length) return { current: null, next: null, secondsUntilNext: null, alertActive: false };
    const current = shifts.find((shift) => this.window.isInWindow(shift.start_time, shift.end_time, now)) ?? null;
    const seconds = (value: string) => {
      const [h = 0, m = 0, s = 0] = normalizeTime(value).split(':').map(Number);
      return h * 3600 + m * 60 + s;
    };
    const nowSeconds = seconds(now);
    const ordered = shifts
      .map((shift) => ({ shift, delta: (seconds(shift.start_time) - nowSeconds + 86400) % 86400 }))
      .filter(({ shift, delta }) => !current || shift.id !== current.id || delta > 0)
      .sort((a, b) => a.delta - b.delta);
    const nextEntry = ordered[0] ?? null;
    const userIds = [current?.responsible_user_id, nextEntry?.shift.responsible_user_id]
      .filter((value): value is number => value != null);
    const users = userIds.length
      ? await this.prisma.users.findMany({ where: { user_id: { in: userIds } }, select: { user_id: true, name: true, username: true } })
      : [];
    const byId = new Map(users.map((user) => [user.user_id, user]));
    return {
      current: current ? this.mapShift(current, current.responsible_user_id ? byId.get(current.responsible_user_id) : null) : null,
      next: nextEntry ? this.mapShift(nextEntry.shift, nextEntry.shift.responsible_user_id ? byId.get(nextEntry.shift.responsible_user_id) : null) : null,
      secondsUntilNext: nextEntry?.delta ?? null,
      alertActive: nextEntry ? nextEntry.delta <= 600 : false,
    };
  }

  async getCurrent(q: CurrentShiftQueryDto) {
    const now = this.window.nowTime();
    const shifts = await this.prisma.sales_shifts.findMany({
      where: {
        is_active: true,
        ...(q.branchId !== undefined
          ? { OR: [{ branch_id: q.branchId }, { branch_id: null }] }
          : {}),
      },
      orderBy: { start_time: 'asc' },
    });
    const match = shifts.find((s) => this.window.isInWindow(s.start_time, s.end_time, now));
    return match ? this.mapShift(match) : null;
  }

  private async revenueForShift(
    shift: ShiftRow,
    date: string,
    branchFilter?: number,
  ) {
    const saleWhere: Prisma.sales_quick_salesWhereInput = {
      sale_date: date,
      status: QuickSaleStatus.completed,
    };
    if (shift.branch_id) saleWhere.branch_id = shift.branch_id;
    else if (branchFilter) saleWhere.branch_id = branchFilter;

    const bookingWhere: Prisma.sales_bookingsWhereInput = {
      booking_date: date,
      status: { not: SalesBookingStatus.cancelled },
      paid_amount: { gt: 0 },
    };
    if (shift.branch_id) bookingWhere.branch_id = shift.branch_id;
    else if (branchFilter) bookingWhere.branch_id = branchFilter;

    const [allSales, allBookings] = await Promise.all([
      this.prisma.sales_quick_sales.findMany({ where: saleWhere }),
      this.prisma.sales_bookings.findMany({ where: bookingWhere }),
    ]);

    const quickSales = allSales.filter((s) =>
      this.window.isInWindow(shift.start_time, shift.end_time, s.sale_time),
    );
    const bookings = allBookings.filter(
      (b) =>
        this.window.isInWindow(shift.start_time, shift.end_time, b.booking_time) &&
        toNumber(b.paid_amount) - toNumber(b.refunded_amount) > 0,
    );

    const quickSalesTotal = quickSales.reduce((sum, s) => sum + toNumber(s.total_amount), 0);
    const bookingsTotal = bookings.reduce(
      (sum, b) => sum + toNumber(b.paid_amount) - toNumber(b.refunded_amount),
      0,
    );
    const totalRevenue = quickSalesTotal + bookingsTotal;

    return {
      shift: {
        id: shift.id,
        name: shift.shift_name,
        startTime: shift.start_time,
        endTime: shift.end_time,
        date,
      },
      summary: {
        totalRevenue,
        quickSalesTotal,
        bookingsTotal,
        totalTransactions: quickSales.length + bookings.length,
        quickSalesCount: quickSales.length,
        bookingsCount: bookings.length,
        totalDiscount: quickSales.reduce((sum, s) => sum + toNumber(s.discount_amount), 0),
        totalTax: quickSales.reduce((sum, s) => sum + toNumber(s.tax_amount), 0),
        averageTransaction:
          quickSales.length + bookings.length > 0
            ? totalRevenue / (quickSales.length + bookings.length)
            : 0,
      },
      paymentMethods: {
        cash: quickSales.filter((s) => s.payment_method === 'cash').length + bookings.filter((b) => b.payment_method === 'cash').length,
        card: quickSales.filter((s) => s.payment_method === 'card').length + bookings.filter((b) => b.payment_method === 'card').length,
        wallet: quickSales.filter((s) => s.payment_method === 'wallet').length + bookings.filter((b) => b.payment_method === 'wallet').length,
        transfer: quickSales.filter((s) => s.payment_method === 'transfer').length + bookings.filter((b) => b.payment_method === 'transfer').length,
        mixed: quickSales.filter((s) => s.payment_method === 'mixed').length + bookings.filter((b) => b.payment_method === 'mixed').length,
      },
      quickSales: quickSales.map((s) => ({
        id: s.id,
        saleNumber: s.sale_number,
        time: s.sale_time,
        customerName: s.customer_name,
        totalAmount: toNumber(s.total_amount),
        paymentMethod: s.payment_method,
      })),
      bookings: bookings.map((b) => ({
        id: b.id,
        bookingNumber: b.booking_number,
        time: b.booking_time,
        customerName: b.customer_name,
        totalAmount: toNumber(b.paid_amount) - toNumber(b.refunded_amount),
        paymentMethod: b.payment_method,
        status: b.status,
      })),
    };
  }

  async getShiftRevenue(id: number, q: ShiftRevenueQueryDto) {
    const shift = await this.prisma.sales_shifts.findUnique({ where: { id } });
    if (!shift) throw new NotFoundException('الوردية غير موجودة');
    return this.revenueForShift(shift, q.date);
  }

  async getAllRevenue(q: ShiftRevenueQueryDto) {
    const where: Prisma.sales_shiftsWhereInput = { is_active: true };
    if (q.branchId) where.branch_id = q.branchId;
    const shifts = await this.prisma.sales_shifts.findMany({
      where,
      orderBy: { start_time: 'asc' },
    });
    const shiftsData = await Promise.all(
      shifts.map((s) => this.revenueForShift(s, q.date, q.branchId)),
    );
    const grandTotal = shiftsData.reduce((sum, s) => sum + s.summary.totalRevenue, 0);
    return {
      date: q.date,
      summary: {
        totalRevenue: grandTotal,
        shiftsCount: shifts.length,
        totalTransactions: shiftsData.reduce((sum, s) => sum + s.summary.totalTransactions, 0),
      },
      shifts: shiftsData,
    };
  }

  async create(dto: CreateShiftDto, userId: number) {
    await this.assertNoOverlap(dto.startTime, dto.endTime, dto.branchId ?? null);
    if (dto.responsibleUserId != null) {
      const eligible = await this.eligibleUsers(dto.branchId);
      if (!eligible.some((user) => user.id === dto.responsibleUserId)) {
        throw new BadRequestException('المستخدم المحدد غير مؤهل للعمل على نقطة بيع الكافيه');
      }
    }
    const branchId = dto.branchId ?? null;
    const row = await this.prisma.$transaction(async (tx) => {
      if (dto.isLastShiftOfDay) {
        await tx.sales_shifts.updateMany({
          where: { branch_id: branchId, is_last_shift_of_day: true },
          data: { is_last_shift_of_day: false },
        });
      }
      return tx.sales_shifts.create({
        data: {
          shift_name: dto.shiftName.trim(),
          start_time: normalizeTime(dto.startTime),
          end_time: normalizeTime(dto.endTime),
          branch_id: branchId,
          responsible_user_id: dto.responsibleUserId ?? null,
          is_last_shift_of_day: dto.isLastShiftOfDay ?? false,
          description: dto.description ?? null,
          color: dto.color ?? '#3b82f6',
          created_by: userId,
        },
      });
    });
    return this.mapShift(row);
  }

  async update(id: number, dto: UpdateShiftDto) {
    const existing = await this.prisma.sales_shifts.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('الوردية غير موجودة');

    const startTime = dto.startTime ? normalizeTime(dto.startTime) : existing.start_time;
    const endTime = dto.endTime ? normalizeTime(dto.endTime) : existing.end_time;
    const branchId = dto.branchId !== undefined ? dto.branchId : existing.branch_id;

    if (dto.startTime || dto.endTime || dto.branchId !== undefined) {
      await this.assertNoOverlap(startTime, endTime, branchId, id);
    }
    if (dto.responsibleUserId != null) {
      const eligible = await this.eligibleUsers(branchId ?? undefined);
      if (!eligible.some((user) => user.id === dto.responsibleUserId)) {
        throw new BadRequestException('المستخدم المحدد يجب أن يكون مرتبطاً بمسمى إدارة الكافيه');
      }
    }

    const row = await this.prisma.$transaction(async (tx) => {
      if (dto.isLastShiftOfDay) {
        await tx.sales_shifts.updateMany({
          where: { id: { not: id }, branch_id: branchId, is_last_shift_of_day: true },
          data: { is_last_shift_of_day: false },
        });
      }
      return tx.sales_shifts.update({
        where: { id },
        data: {
          ...(dto.shiftName !== undefined ? { shift_name: dto.shiftName.trim() } : {}),
          ...(dto.startTime !== undefined ? { start_time: startTime } : {}),
          ...(dto.endTime !== undefined ? { end_time: endTime } : {}),
          ...(dto.branchId !== undefined ? { branch_id: dto.branchId } : {}),
          ...(dto.responsibleUserId !== undefined ? { responsible_user_id: dto.responsibleUserId } : {}),
          ...(dto.isLastShiftOfDay !== undefined ? { is_last_shift_of_day: dto.isLastShiftOfDay } : {}),
          ...(dto.description !== undefined ? { description: dto.description } : {}),
          ...(dto.color !== undefined ? { color: dto.color } : {}),
          ...(dto.isActive !== undefined ? { is_active: dto.isActive } : {}),
        },
      });
    });
    return this.mapShift(row);
  }

  async remove(id: number) {
    const existing = await this.prisma.sales_shifts.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('الوردية غير موجودة');
    const row = await this.prisma.sales_shifts.update({
      where: { id },
      data: { is_active: false },
    });
    return this.mapShift(row);
  }
}
