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

  async list(q: ListRewardsDto) {
    const and: Prisma.hr_mokafat_detailsWhereInput[] = [];
    const statusWhere = buildSuspendWhere(q.status);
    if (statusWhere?.suspend) and.push({ suspend: statusWhere.suspend });
    if (q.search?.trim()) {
      const s = q.search.trim();
      and.push({
        OR: [
          { bank_responsible_name: { contains: s } },
          { mosma_wazefy_n: { contains: s } },
          { edara_n: { contains: s } },
        ],
      });
    }

    const where: Prisma.hr_mokafat_detailsWhereInput = and.length ? { AND: and } : {};
    const [rows, total] = await Promise.all([
      this.prisma.hr_mokafat_details.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: q.skip,
        take: q.take,
      }),
      this.prisma.hr_mokafat_details.count({ where }),
    ]);

    const rkmIds = [...new Set(rows.map((r) => r.mokafa_rkm_fk).filter((v): v is number => v != null))];
    const headers = rkmIds.length
      ? await this.prisma.hr_mokafat.findMany({ where: { mokafa_rkm: { in: rkmIds } } })
      : [];
    const headerMap = new Map(headers.map((h) => [h.mokafa_rkm, h]));

    const data = rows.map((row) => {
      const header = row.mokafa_rkm_fk != null ? headerMap.get(row.mokafa_rkm_fk) : undefined;
      return {
        id: row.id,
        employeeName: row.bank_responsible_name ?? row.mosma_wazefy_n,
        title: header?.about ?? null,
        amount: row.value != null ? Number(row.value) : null,
        date: header?.mokafa_date_ar ?? null,
        status: suspendToListStatus(header?.suspend ?? row.suspend),
      };
    });

    return paginated(data, total, q.page, q.pageSize);
  }

  async create(dto: CreateRewardDto, publisherId?: number) {
    if (!dto.details?.length) throw new BadRequestException('يجب إضافة موظف واحد على الأقل');

    const maxRkm = await this.prisma.hr_mokafat.aggregate({ _max: { mokafa_rkm: true } });
    const mokafaRkm = (maxRkm._max.mokafa_rkm ?? 0) + 1;
    const dateStr = dto.date ?? new Date().toISOString().slice(0, 10);
    const total = dto.details.reduce((s, d) => s + (d.value ?? 0), 0);
    // month/year drive the engine window-mapping (anchor date-25). Populate them at create so an
    // approved reward maps into the correct payroll run (mirrors how penalties map by month/year).
    const anchor = new Date(dateStr);
    const month = anchor.getMonth() + 1;
    const year = anchor.getFullYear();

    await this.prisma.hr_mokafat.create({
      data: {
        mokafa_rkm: mokafaRkm,
        mokafa_date: Math.floor(Date.now() / 1000),
        month,
        year,
        mokafa_date_ar: dateStr,
        mokafa_value_type: 1,
        mokafa_type: dto.mokafaType ?? 1,
        total_value: String(total),
        publisher: publisherId ?? 0,
        about: dto.title,
        // Newly created reward is PENDING (suspend=0) and NOT yet salary-borne
        // (mokafa_option left null) — it pays nothing until it is approved.
        suspend: SuspendStatus.INCOMING,
      },
    });

    for (const detail of dto.details) {
      const emp = await this.prisma.employees.findFirst({ where: { emp_code: detail.empCode } });
      await this.prisma.hr_mokafat_details.create({
        data: {
          mokafa_rkm_fk: mokafaRkm,
          emp_code: detail.empCode,
          month,
          year,
          value: detail.value ?? 0,
          bank_responsible_name: emp?.employee,
          mosma_wazefy_n: emp?.mosma_wazefy_n,
          edara_n: emp?.edara_n,
          qsm_n: emp?.qsm_n,
          mokafa_types: dto.mokafaType ?? 1,
          suspend: SuspendStatus.INCOMING,
        },
      });
    }

    return { mokafaRkm };
  }

  async update(id: number, dto: UpdateRewardDto) {
    const detail = await this.prisma.hr_mokafat_details.findUnique({ where: { id } });
    if (!detail) throw new NotFoundException('المكافأة غير موجودة');
    if (detail.mokafa_rkm_fk == null) throw new BadRequestException('رقم المكافأة غير موجود');

    const header = await this.prisma.hr_mokafat.findFirst({
      where: { mokafa_rkm: detail.mokafa_rkm_fk },
    });
    if (!header) throw new NotFoundException('سجل المكافأة غير موجود');

    // Once approved (suspend ∈ {1,4}) the reward's amount / month / year are locked — editing the
    // date would re-map it into a different payroll run and re-open the double-pay window.
    if (isApproved(header.suspend)) {
      throw new BadRequestException('لا يمكن تعديل مكافأة معتمدة');
    }

    // Keep header month/year in sync if the date is edited (still-pending reward only).
    const dateChange =
      dto.date != null
        ? (() => {
            const d = new Date(dto.date!);
            return { month: d.getMonth() + 1, year: d.getFullYear() };
          })()
        : null;

    await this.prisma.$transaction(async (tx) => {
      await tx.hr_mokafat.update({
        where: { id: header.id },
        data: {
          about: dto.title,
          mokafa_date_ar: dto.date,
          mokafa_type: dto.mokafaType,
          ...(dateChange ?? {}),
        },
      });
      if (dateChange) {
        await tx.hr_mokafat_details.updateMany({
          where: { mokafa_rkm_fk: header.mokafa_rkm },
          data: dateChange,
        });
      }
    });
    return { id };
  }

  /**
   * Approve a reward so it actually pays. The engine bonus query (getMokafaaByDate) requires
   * BOTH suspend=4 (fully approved) AND mokafa_option='rateb' (salary-borne). create() writes
   * neither, so before this endpoint an "approved-looking" reward paid ZERO. Here we stamp the
   * header + every detail line: suspend=4 and mokafa_option='rateb' so the reward flows into the
   * correct month's run exactly once. Idempotent — re-approving an already-approved reward is a
   * no-op on the values.
   */
  async approve(id: number) {
    const detail = await this.prisma.hr_mokafat_details.findUnique({ where: { id } });
    if (!detail) throw new NotFoundException('المكافأة غير موجودة');
    if (detail.mokafa_rkm_fk == null) throw new BadRequestException('رقم المكافأة غير موجود');
    const header = await this.prisma.hr_mokafat.findFirst({
      where: { mokafa_rkm: detail.mokafa_rkm_fk },
    });
    if (!header) throw new NotFoundException('سجل المكافأة غير موجود');

    await this.prisma.$transaction(async (tx) => {
      await tx.hr_mokafat.update({
        where: { id: header.id },
        data: { suspend: SuspendStatus.APPROVED },
      });
      await tx.hr_mokafat_details.updateMany({
        where: { mokafa_rkm_fk: header.mokafa_rkm },
        // 'rateb' = salary-borne: the sentinel the engine (getMokafaaByDate) filters on so the
        // bonus is added to the employee's payroll net exactly once in the mapped month's run.
        data: { suspend: SuspendStatus.APPROVED, mokafa_option: 'rateb' },
      });
    });
    return { id, status: 'approved' };
  }

  async reject(id: number) {
    const detail = await this.prisma.hr_mokafat_details.findUnique({ where: { id } });
    if (!detail) throw new NotFoundException('المكافأة غير موجودة');
    if (detail.mokafa_rkm_fk == null) throw new BadRequestException('رقم المكافأة غير موجود');
    const header = await this.prisma.hr_mokafat.findFirst({
      where: { mokafa_rkm: detail.mokafa_rkm_fk },
    });
    if (!header) throw new NotFoundException('سجل المكافأة غير موجود');

    await this.prisma.$transaction(async (tx) => {
      await tx.hr_mokafat.update({
        where: { id: header.id },
        data: { suspend: SuspendStatus.REJECTED },
      });
      await tx.hr_mokafat_details.updateMany({
        where: { mokafa_rkm_fk: header.mokafa_rkm },
        // Clear the salary-borne sentinel so a rejected reward can never be picked up by the engine.
        data: { suspend: SuspendStatus.REJECTED, mokafa_option: null },
      });
    });
    return { id, status: 'rejected' };
  }

  async remove(id: number) {
    const detail = await this.prisma.hr_mokafat_details.findUnique({ where: { id } });
    if (!detail) throw new NotFoundException('المكافأة غير موجودة');

    // Don't delete an approved (possibly already-consumed) reward line — it may have been paid
    // into a posted run and stamped with mosayer_rkm_fk.
    if (detail.mokafa_rkm_fk != null) {
      const header = await this.prisma.hr_mokafat.findFirst({
        where: { mokafa_rkm: detail.mokafa_rkm_fk },
      });
      if (isApproved(header?.suspend) || isApproved(detail.suspend)) {
        throw new BadRequestException('لا يمكن حذف مكافأة معتمدة');
      }
    }

    await this.prisma.hr_mokafat_details.delete({ where: { id } });

    if (detail.mokafa_rkm_fk != null) {
      const remaining = await this.prisma.hr_mokafat_details.count({
        where: { mokafa_rkm_fk: detail.mokafa_rkm_fk },
      });
      if (remaining === 0) {
        const header = await this.prisma.hr_mokafat.findFirst({
          where: { mokafa_rkm: detail.mokafa_rkm_fk },
        });
        if (header) await this.prisma.hr_mokafat.delete({ where: { id: header.id } });
      }
    }

    return { id };
  }
}

/** A reward header is locked (approved path) when suspend ∈ {1, 4}. */
function isApproved(suspend: number | null | undefined): boolean {
  return suspend != null && SUSPEND_APPROVED.includes(suspend);
}
