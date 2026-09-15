import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { paginated } from '../../common/dto/list-result';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  buildSuspendWhere,
  SUSPEND_APPROVED,
  SuspendStatus,
  suspendToListStatus,
} from '../../common/utils/suspend-status.util';
import { CreateRewardDto, UpdateRewardDto } from './dto/reward.dto';
import { ListRewardsDto } from './dto/list-rewards.dto';

@Injectable()
export class RewardsService {
  constructor(private readonly prisma: PrismaService) {}

  /** The legacy page lists one row per reward request (hr_mokafat), not one per employee. */
  async list(q: ListRewardsDto) {
    const and: Prisma.hr_mokafatWhereInput[] = [];
    const statusWhere = buildSuspendWhere(q.status);
    if (statusWhere?.suspend) and.push({ suspend: statusWhere.suspend });
    if (q.search?.trim()) {
      const search = q.search.trim();
      const rewardNumber = Number(search);
      and.push({
        OR: [
          { about: { contains: search } },
          { mokafa_date_ar: { contains: search } },
          ...(Number.isInteger(rewardNumber) ? [{ mokafa_rkm: rewardNumber }] : []),
        ],
      });
    }

    const where: Prisma.hr_mokafatWhereInput = and.length ? { AND: and } : {};
    const [headers, total] = await Promise.all([
      this.prisma.hr_mokafat.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: q.skip,
        take: q.take,
      }),
      this.prisma.hr_mokafat.count({ where }),
    ]);

    const rewardNumbers = headers.map((header) => header.mokafa_rkm);
    const details = rewardNumbers.length
      ? await this.prisma.hr_mokafat_details.findMany({
          where: { mokafa_rkm_fk: { in: rewardNumbers } },
          orderBy: { id: 'asc' },
        })
      : [];
    const employeeCodes = [
      ...new Set(details.map((detail) => detail.emp_code).filter((code): code is number => code != null)),
    ];
    const employees = employeeCodes.length
      ? await this.prisma.employees.findMany({
          where: { emp_code: { in: employeeCodes } },
          select: { id: true, emp_code: true, employee: true },
        })
      : [];
    const employeeByCode = new Map(employees.map((employee) => [employee.emp_code, employee]));
    const detailsByReward = new Map<number, typeof details>();
    for (const detail of details) {
      if (detail.mokafa_rkm_fk == null) continue;
      const bucket = detailsByReward.get(detail.mokafa_rkm_fk) ?? [];
      bucket.push(detail);
      detailsByReward.set(detail.mokafa_rkm_fk, bucket);
    }

    const data = headers.map((header) => {
      const rewardDetails = detailsByReward.get(header.mokafa_rkm) ?? [];
      const first = rewardDetails[0];
      const detailRows = rewardDetails.map((detail) => {
        const employee = detail.emp_code != null ? employeeByCode.get(detail.emp_code) : undefined;
        return {
          id: detail.id,
          employeeId: employee?.id ?? null,
          empCode: detail.emp_code,
          employeeName: employee?.employee ?? detail.bank_responsible_name ?? null,
          jobTitle: detail.mosma_wazefy_n,
          department: detail.qsm_n,
          administration: detail.edara_n,
          value: detail.value != null ? Number(detail.value) : 0,
          option: detail.mokafa_option,
        };
      });
      return {
        id: header.mokafa_rkm,
        mokafaRkm: header.mokafa_rkm,
        date: header.mokafa_date_ar,
        month: Number(header.mon_melady) || header.month,
        recipientType: header.mokafa_type,
        totalValue: header.total_value != null ? Number(header.total_value) : 0,
        employeeCount: rewardDetails.length,
        title: header.about,
        value: first?.value != null ? Number(first.value) : 0,
        option: first?.mokafa_option ?? null,
        employeeIds: detailRows
          .map((detail) => detail.employeeId)
          .filter((employeeId): employeeId is number => employeeId != null),
        details: detailRows,
        status: suspendToListStatus(header.suspend),
      };
    });

    return paginated(data, total, q.page, q.pageSize);
  }

  async nextNumber() {
    const max = await this.prisma.hr_mokafat.aggregate({ _max: { mokafa_rkm: true } });
    return { value: (max._max.mokafa_rkm ?? 0) + 1 };
  }

  async create(dto: CreateRewardDto, publisherId?: number) {
    const selection = await this.resolveSelection(dto);
    const date = this.parseDate(dto.date);
    const rewardNumber = (await this.nextNumber()).value;
    const recipientType = this.recipientType(dto.recipientType ?? dto.mokafaType);
    const calendarMonth = date.getMonth() + 1;
    const calendarYear = date.getFullYear();
    const displayMonth = dto.month ?? calendarMonth;
    const option = dto.option ?? 'rateb';
    const total = selection.reduce((sum, item) => sum + item.value, 0);

    await this.prisma.$transaction(async (tx) => {
      await tx.hr_mokafat.create({
        data: {
          mokafa_rkm: rewardNumber,
          mokafa_date: Math.floor(date.getTime() / 1000),
          month: calendarMonth,
          year: calendarYear,
          mon_melady: String(displayMonth),
          mokafa_date_ar: this.dateString(date, dto.date),
          mokafa_value_type: 0,
          mokafa_type: recipientType,
          total_value: String(total),
          presence_number: selection.length,
          publisher: publisherId ?? 0,
          about: dto.title.trim(),
          suspend: SuspendStatus.INCOMING,
        },
      });
      await tx.hr_mokafat_details.createMany({
        data: selection.map(({ employee, value }) => ({
          mokafa_rkm_fk: rewardNumber,
          emp_code: employee.emp_code,
          month: calendarMonth,
          year: calendarYear,
          day: date.getDate(),
          value,
          bank_responsible_name: employee.employee,
          mosma_wazefy_n: employee.mosma_wazefy_n,
          edara_n: employee.edara_n,
          qsm_n: employee.qsm_n,
          mokafa_types: recipientType,
          mokafa_option: option,
          suspend: SuspendStatus.INCOMING,
        })),
      });
    });

    return { id: rewardNumber, mokafaRkm: rewardNumber };
  }

  async update(rewardNumber: number, dto: UpdateRewardDto) {
    const header = await this.findHeaderOrThrow(rewardNumber);
    if (SUSPEND_APPROVED.includes(header.suspend)) {
      throw new BadRequestException('لا يمكن تعديل مكافأة معتمدة');
    }

    const currentDetails = await this.prisma.hr_mokafat_details.findMany({
      where: { mokafa_rkm_fk: rewardNumber },
      orderBy: { id: 'asc' },
    });
    const currentEmployeeIds = await this.employeeIdsForCodes(
      currentDetails.map((detail) => detail.emp_code).filter((code): code is number => code != null),
    );
    const selection = await this.resolveSelection(
      {
        ...dto,
        title: dto.title ?? header.about,
        recipientType: dto.recipientType ?? header.mokafa_type,
        employeeIds: dto.employeeIds ?? currentEmployeeIds,
        value: dto.value ?? Number(currentDetails[0]?.value ?? 0),
      },
      currentDetails,
    );
    const date = this.parseDate(dto.date ?? header.mokafa_date_ar);
    const dateString = this.dateString(date, dto.date ?? header.mokafa_date_ar);
    const recipientType = this.recipientType(dto.recipientType ?? dto.mokafaType ?? header.mokafa_type);
    const option = dto.option ?? currentDetails[0]?.mokafa_option ?? 'rateb';
    const calendarMonth = date.getMonth() + 1;
    const calendarYear = date.getFullYear();
    const total = selection.reduce((sum, item) => sum + item.value, 0);

    await this.prisma.$transaction(async (tx) => {
      await tx.hr_mokafat.update({
        where: { id: header.id },
        data: {
          mokafa_date: Math.floor(date.getTime() / 1000),
          mokafa_date_ar: dateString,
          month: calendarMonth,
          year: calendarYear,
          mon_melady: String(dto.month ?? (Number(header.mon_melady) || calendarMonth)),
          mokafa_type: recipientType,
          total_value: String(total),
          presence_number: selection.length,
          about: (dto.title ?? header.about).trim(),
        },
      });
      await tx.hr_mokafat_details.deleteMany({ where: { mokafa_rkm_fk: rewardNumber } });
      await tx.hr_mokafat_details.createMany({
        data: selection.map(({ employee, value }) => ({
          mokafa_rkm_fk: rewardNumber,
          emp_code: employee.emp_code,
          month: calendarMonth,
          year: calendarYear,
          day: date.getDate(),
          value,
          bank_responsible_name: employee.employee,
          mosma_wazefy_n: employee.mosma_wazefy_n,
          edara_n: employee.edara_n,
          qsm_n: employee.qsm_n,
          mokafa_types: recipientType,
          mokafa_option: option,
          suspend: header.suspend,
        })),
      });
    });
    return { id: rewardNumber };
  }

  async approve(rewardNumber: number) {
    const header = await this.findHeaderOrThrow(rewardNumber);
    const detailCount = await this.prisma.hr_mokafat_details.count({
      where: { mokafa_rkm_fk: rewardNumber },
    });
    if (detailCount === 0) throw new BadRequestException('لا يوجد موظفون في طلب المكافأة');
    await this.prisma.$transaction([
      this.prisma.hr_mokafat.update({
        where: { id: header.id },
        data: { suspend: SuspendStatus.APPROVED },
      }),
      this.prisma.hr_mokafat_details.updateMany({
        where: { mokafa_rkm_fk: rewardNumber },
        // Preserve rateb/alone exactly as selected in the legacy form.
        data: { suspend: SuspendStatus.APPROVED },
      }),
    ]);
    return { id: rewardNumber, status: 'approved' };
  }

  async reject(rewardNumber: number) {
    const header = await this.findHeaderOrThrow(rewardNumber);
    await this.prisma.$transaction([
      this.prisma.hr_mokafat.update({
        where: { id: header.id },
        data: { suspend: SuspendStatus.REJECTED },
      }),
      this.prisma.hr_mokafat_details.updateMany({
        where: { mokafa_rkm_fk: rewardNumber },
        data: { suspend: SuspendStatus.REJECTED },
      }),
    ]);
    return { id: rewardNumber, status: 'rejected' };
  }

  async remove(rewardNumber: number) {
    const header = await this.findHeaderOrThrow(rewardNumber);
    if (header.suspend !== SuspendStatus.INCOMING) {
      throw new BadRequestException('لا يمكن حذف مكافأة تم اتخاذ إجراء عليها');
    }
    const consumed = await this.prisma.hr_mokafat_details.count({
      where: { mokafa_rkm_fk: rewardNumber, mosayer_rkm_fk: { not: null } },
    });
    if (consumed) throw new BadRequestException('لا يمكن حذف مكافأة تم ترحيلها لمسير الرواتب');
    await this.prisma.$transaction([
      this.prisma.hr_mokafat_details.deleteMany({ where: { mokafa_rkm_fk: rewardNumber } }),
      this.prisma.hr_mokafat.delete({ where: { id: header.id } }),
    ]);
    return { id: rewardNumber };
  }

  private async findHeaderOrThrow(rewardNumber: number) {
    const header = await this.prisma.hr_mokafat.findFirst({ where: { mokafa_rkm: rewardNumber } });
    if (!header) throw new NotFoundException('المكافأة غير موجودة');
    return header;
  }

  private recipientType(value?: number) {
    return value === 3 ? 3 : 2;
  }

  private parseDate(value?: string) {
    const dateString = value ?? new Date().toISOString().slice(0, 10);
    const date = new Date(`${dateString}T00:00:00`);
    if (Number.isNaN(date.getTime())) throw new BadRequestException('تاريخ المكافأة غير صحيح');
    return date;
  }

  private dateString(date: Date, supplied?: string) {
    return supplied?.slice(0, 10) ?? date.toISOString().slice(0, 10);
  }

  private async employeeIdsForCodes(codes: number[]) {
    if (!codes.length) return [];
    const employees = await this.prisma.employees.findMany({
      where: { emp_code: { in: codes } },
      select: { id: true },
    });
    return employees.map((employee) => employee.id);
  }

  private async resolveSelection(
    dto: CreateRewardDto,
    currentDetails: Array<{ emp_code: number | null; value: Prisma.Decimal | null }> = [],
  ) {
    const recipientType = this.recipientType(dto.recipientType ?? dto.mokafaType);
    let employees;
    if (recipientType === 3) {
      employees = await this.prisma.employees.findMany({
        where: { employee_type: 1 },
        orderBy: { employee: 'asc' },
      });
    } else if (dto.employeeIds?.length) {
      employees = await this.prisma.employees.findMany({
        where: { id: { in: dto.employeeIds }, employee_type: 1 },
      });
      if (employees.length !== new Set(dto.employeeIds).size) {
        throw new BadRequestException('بعض الموظفين المختارين غير موجودين أو غير نشطين');
      }
    } else if (dto.details?.length) {
      const codes = [...new Set(dto.details.map((detail) => detail.empCode))];
      employees = await this.prisma.employees.findMany({ where: { emp_code: { in: codes } } });
      if (employees.length !== codes.length) throw new BadRequestException('بعض الموظفين غير موجودين');
    } else {
      throw new BadRequestException('يجب اختيار موظف واحد على الأقل');
    }
    if (!employees.length) throw new BadRequestException('لا يوجد موظفون لإضافة المكافأة');

    const explicitByCode = new Map(dto.details?.map((detail) => [detail.empCode, detail.value ?? 0]) ?? []);
    const currentByCode = new Map(
      currentDetails
        .filter((detail): detail is { emp_code: number; value: Prisma.Decimal | null } => detail.emp_code != null)
        .map((detail) => [detail.emp_code, Number(detail.value ?? 0)]),
    );
    return employees.map((employee) => ({
      employee,
      value: dto.value ?? explicitByCode.get(employee.emp_code) ?? currentByCode.get(employee.emp_code) ?? 0,
    }));
  }
}
