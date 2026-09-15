import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { paginated } from '../../common/dto/list-result';
import { ACTIVE_BOOKING_STATUSES, assertEndTimeAfterStart, localDateString, timeOverlap } from './club-fitness.utils';
import { attachMemberBrief, loadMemberBriefMap, searchMemberIds } from '../club-members/club-member-brief.utils';
import { ListClubHallBookingsDto, ListClubHallsDto } from './dto/list-club-halls.dto';

@Injectable()
export class ClubHallsService {
  constructor(private readonly prisma: PrismaService) {}

  private mapHall(row: {
    id: number;
    name: string;
    hall_number: string;
    capacity: number;
    branch_id: number;
    description: string | null;
    status: string;
    created_at: Date;
    updated_at: Date;
  }) {
    return {
      id: row.id,
      name: row.name,
      hallNumber: row.hall_number,
      capacity: row.capacity,
      branchId: row.branch_id,
      description: row.description,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapBooking(row: {
    id: number;
    hall_id: number;
    member_id: number | null;
    customer_name: string | null;
    booking_date: string;
    start_time: string;
    end_time: string;
    number_of_people: number;
    status: string;
    notes: string | null;
    created_at: Date;
    updated_at: Date;
    hall?: ReturnType<ClubHallsService['mapHall']>;
  }) {
    return {
      id: row.id,
      hallId: row.hall_id,
      memberId: row.member_id,
      customerName: row.customer_name,
      bookingDate: row.booking_date,
      startTime: row.start_time,
      endTime: row.end_time,
      numberOfPeople: row.number_of_people,
      status: row.status,
      notes: row.notes,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      hall: row.hall,
    };
  }

  async listHalls(q: ListClubHallsDto) {
    const and: Prisma.club_hallsWhereInput[] = [{ is_deleted: false }];
    if (q.search?.trim()) {
      const s = q.search.trim();
      and.push({ OR: [{ name: { contains: s } }, { hall_number: { contains: s } }] });
    }
    if (q.branch && q.branch !== 'all') and.push({ branch_id: Number(q.branch) });
    if (q.status && q.status !== 'all') {
      and.push({ status: q.status as Prisma.EnumClubFitnessHallStatusFilter['equals'] });
    }

    const where: Prisma.club_hallsWhereInput = { AND: and };
    const [rows, total] = await Promise.all([
      this.prisma.club_halls.findMany({
        where,
        orderBy: { hall_number: 'asc' },
        skip: q.skip,
        take: q.take,
      }),
      this.prisma.club_halls.count({ where }),
    ]);
    return paginated(rows.map((r) => this.mapHall(r)), total, q.page, q.pageSize);
  }

  async hallStatistics(branch?: string) {
    const where: Prisma.club_hallsWhereInput = { is_deleted: false };
    if (branch && branch !== 'all') where.branch_id = Number(branch);

    const [total, available, maintenance, unavailable] = await Promise.all([
      this.prisma.club_halls.count({ where }),
      this.prisma.club_halls.count({ where: { ...where, status: 'available' } }),
      this.prisma.club_halls.count({ where: { ...where, status: 'maintenance' } }),
      this.prisma.club_halls.count({ where: { ...where, status: 'unavailable' } }),
    ]);

    const halls = await this.prisma.club_halls.findMany({ where, select: { capacity: true } });
    const totalCapacity = halls.reduce((sum, h) => sum + h.capacity, 0);
    const today = localDateString();

    const todayBookings = await this.prisma.club_hall_bookings.count({
      where: {
        booking_date: today,
        is_deleted: false,
        status: { in: [...ACTIVE_BOOKING_STATUSES] },
        ...(branch && branch !== 'all' ? { hall: { branch_id: Number(branch) } } : {}),
      },
    });

    return { total, available, maintenance, unavailable, totalCapacity, todayBookings };
  }

  async findHall(id: number) {
    const row = await this.prisma.club_halls.findFirst({
      where: { id, is_deleted: false },
    });
    if (!row) throw new NotFoundException('القاعة غير موجودة');
    return this.mapHall(row);
  }

  async createHall(body: Record<string, unknown>) {
    if (!body.name || !body.hallNumber || body.capacity == null || !body.branchId) {
      throw new BadRequestException('الاسم ورقم القاعة والسعة والفرع مطلوبة');
    }

    const branchId = Number(body.branchId);
    const hallNumber = String(body.hallNumber).trim();

    const existing = await this.prisma.club_halls.findFirst({
      where: { branch_id: branchId, hall_number: hallNumber, is_deleted: false },
    });
    if (existing) {
      throw new ConflictException('رقم القاعة موجود بالفعل في هذا الفرع');
    }

    const row = await this.prisma.club_halls.create({
      data: {
        name: String(body.name).trim(),
        hall_number: hallNumber,
        capacity: Number(body.capacity),
        branch_id: branchId,
        description: body.description ? String(body.description) : null,
        status: (body.status as Prisma.EnumClubFitnessHallStatusFieldUpdateOperationsInput['set']) ?? 'available',
      },
    });
    return this.mapHall(row);
  }

  async updateHall(id: number, body: Record<string, unknown>) {
    const hall = await this.findHall(id);

    if (body.hallNumber && String(body.hallNumber).trim() !== hall.hallNumber) {
      const branchId = body.branchId != null ? Number(body.branchId) : hall.branchId;
      const hallNumber = String(body.hallNumber).trim();
      const existing = await this.prisma.club_halls.findFirst({
        where: {
          branch_id: branchId,
          hall_number: hallNumber,
          is_deleted: false,
          id: { not: id },
        },
      });
      if (existing) {
        throw new ConflictException('رقم القاعة موجود بالفعل في هذا الفرع');
      }
    }

    const row = await this.prisma.club_halls.update({
      where: { id },
      data: {
        ...(body.name != null ? { name: String(body.name).trim() } : {}),
        ...(body.hallNumber != null ? { hall_number: String(body.hallNumber).trim() } : {}),
        ...(body.capacity != null ? { capacity: Number(body.capacity) } : {}),
        ...(body.branchId != null ? { branch_id: Number(body.branchId) } : {}),
        ...(body.description !== undefined ? { description: body.description ? String(body.description) : null } : {}),
        ...(body.status != null ? { status: String(body.status) as Prisma.EnumClubFitnessHallStatusFieldUpdateOperationsInput['set'] } : {}),
      },
    });
    return this.mapHall(row);
  }

  async removeHall(id: number) {
    await this.findHall(id);
    const activeBookings = await this.prisma.club_hall_bookings.count({
      where: {
        hall_id: id,
        is_deleted: false,
        status: { in: [...ACTIVE_BOOKING_STATUSES] },
      },
    });
    if (activeBookings > 0) {
      throw new BadRequestException('لا يمكن حذف القاعة — يوجد حجوزات نشطة');
    }
    await this.prisma.club_halls.update({
      where: { id },
      data: { is_deleted: true },
    });
    return { success: true };
  }

  private async assertNoOverlap(
    hallId: number,
    bookingDate: string,
    startTime: string,
    endTime: string,
    excludeId?: number,
  ) {
    const existing = await this.prisma.club_hall_bookings.findMany({
      where: {
        hall_id: hallId,
        booking_date: bookingDate,
        is_deleted: false,
        status: { in: [...ACTIVE_BOOKING_STATUSES] },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });

    for (const b of existing) {
      if (timeOverlap(startTime, endTime, b.start_time, b.end_time)) {
        throw new ConflictException('القاعة محجوزة في هذا الوقت');
      }
    }
  }

  async listBookings(q: ListClubHallBookingsDto) {
    const and: Prisma.club_hall_bookingsWhereInput[] = [{ is_deleted: false }];
    if (q.hallId) and.push({ hall_id: Number(q.hallId) });
    if (q.memberId) and.push({ member_id: Number(q.memberId) });
    if (q.status && q.status !== 'all') {
      and.push({ status: q.status as Prisma.EnumClubFitnessBookingStatusFilter['equals'] });
    }
    if (q.dateFrom && q.dateTo) {
      and.push({ booking_date: { gte: q.dateFrom, lte: q.dateTo } });
    } else if (q.dateFrom) {
      and.push({ booking_date: { gte: q.dateFrom } });
    } else if (q.dateTo) {
      and.push({ booking_date: { lte: q.dateTo } });
    }
    if (q.branch && q.branch !== 'all') {
      and.push({ hall: { branch_id: Number(q.branch) } });
    }

    const where: Prisma.club_hall_bookingsWhereInput = { AND: and };
    const [rows, total] = await Promise.all([
      this.prisma.club_hall_bookings.findMany({
        where,
        include: { hall: true },
        orderBy: [{ booking_date: 'asc' }, { start_time: 'asc' }],
        skip: q.skip,
        take: q.take,
      }),
      this.prisma.club_hall_bookings.count({ where }),
    ]);
    const memberMap = await loadMemberBriefMap(this.prisma, rows.map((r) => r.member_id));

    return paginated(
      rows.map((r) => ({
        ...this.mapBooking({ ...r, hall: this.mapHall(r.hall) }),
        ...attachMemberBrief(r.member_id, memberMap),
      })),
      total,
      q.page,
      q.pageSize,
    );
  }

  async findBooking(id: number) {
    const row = await this.prisma.club_hall_bookings.findFirst({
      where: { id, is_deleted: false },
      include: { hall: true },
    });
    if (!row) throw new NotFoundException('حجز القاعة غير موجود');
    const memberMap = await loadMemberBriefMap(this.prisma, [row.member_id]);
    return {
      ...this.mapBooking({ ...row, hall: this.mapHall(row.hall) }),
      ...attachMemberBrief(row.member_id, memberMap),
    };
  }

  async createBooking(body: Record<string, unknown>) {
    const hallId = Number(body.hallId);
    if (!hallId || !body.bookingDate || !body.startTime || !body.endTime) {
      throw new BadRequestException('القاعة والتاريخ ووقت البداية والنهاية مطلوبة');
    }
    if (!body.memberId && !body.customerName) {
      throw new BadRequestException('يجب تحديد العضو أو اسم العميل');
    }

    const hall = await this.prisma.club_halls.findFirst({
      where: { id: hallId, is_deleted: false },
    });
    if (!hall) throw new NotFoundException('القاعة غير موجودة');
    if (hall.status !== 'available') {
      throw new BadRequestException('القاعة غير متاحة للحجز (صيانة أو غير متاحة)');
    }

    const peopleCount = body.numberOfPeople != null ? Number(body.numberOfPeople) : 1;
    if (peopleCount > hall.capacity) {
      throw new BadRequestException(
        `عدد الأشخاص (${peopleCount}) يتجاوز سعة القاعة (${hall.capacity})`,
      );
    }

    const bookingDate = String(body.bookingDate);
    const startTime = String(body.startTime);
    const endTime = String(body.endTime);
    assertEndTimeAfterStart(startTime, endTime);
    await this.assertNoOverlap(hallId, bookingDate, startTime, endTime);

    const row = await this.prisma.club_hall_bookings.create({
      data: {
        hall_id: hallId,
        member_id: body.memberId ? Number(body.memberId) : null,
        customer_name: body.customerName ? String(body.customerName) : null,
        booking_date: bookingDate,
        start_time: startTime,
        end_time: endTime,
        number_of_people: peopleCount,
        notes: body.notes ? String(body.notes) : null,
        status: (body.status as Prisma.EnumClubFitnessBookingStatusFieldUpdateOperationsInput['set']) ?? 'pending',
      },
      include: { hall: true },
    });
    return this.mapBooking({ ...row, hall: this.mapHall(row.hall) });
  }

  async updateBooking(id: number, body: Record<string, unknown>) {
    const existing = await this.findBooking(id);

    const hallId = body.hallId != null ? Number(body.hallId) : existing.hallId;
    const bookingDate = body.bookingDate != null ? String(body.bookingDate) : existing.bookingDate;
    const startTime = body.startTime != null ? String(body.startTime) : existing.startTime;
    const endTime = body.endTime != null ? String(body.endTime) : existing.endTime;
    const peopleCount = body.numberOfPeople != null ? Number(body.numberOfPeople) : existing.numberOfPeople;

    const hall = await this.prisma.club_halls.findFirst({
      where: { id: hallId, is_deleted: false },
    });
    if (!hall) throw new NotFoundException('القاعة غير موجودة');

    if (peopleCount > hall.capacity) {
      throw new BadRequestException(
        `عدد الأشخاص (${peopleCount}) يتجاوز سعة القاعة (${hall.capacity})`,
      );
    }

    if (
      hallId !== existing.hallId ||
      bookingDate !== existing.bookingDate ||
      startTime !== existing.startTime ||
      endTime !== existing.endTime
    ) {
      await this.assertNoOverlap(hallId, bookingDate, startTime, endTime, id);
    }

    const row = await this.prisma.club_hall_bookings.update({
      where: { id },
      data: {
        ...(body.hallId != null ? { hall_id: hallId } : {}),
        ...(body.memberId !== undefined ? { member_id: body.memberId ? Number(body.memberId) : null } : {}),
        ...(body.customerName !== undefined ? { customer_name: body.customerName ? String(body.customerName) : null } : {}),
        ...(body.bookingDate != null ? { booking_date: bookingDate } : {}),
        ...(body.startTime != null ? { start_time: startTime } : {}),
        ...(body.endTime != null ? { end_time: endTime } : {}),
        ...(body.numberOfPeople != null ? { number_of_people: peopleCount } : {}),
        ...(body.notes !== undefined ? { notes: body.notes ? String(body.notes) : null } : {}),
        ...(body.status != null ? { status: String(body.status) as Prisma.EnumClubFitnessBookingStatusFieldUpdateOperationsInput['set'] } : {}),
      },
      include: { hall: true },
    });
    return this.mapBooking({ ...row, hall: this.mapHall(row.hall) });
  }

  async removeBooking(id: number) {
    await this.findBooking(id);
    await this.prisma.club_hall_bookings.update({
      where: { id },
      data: { is_deleted: true },
    });
    return { success: true };
  }
}
