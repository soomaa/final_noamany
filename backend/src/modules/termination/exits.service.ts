import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { paginated } from '../../common/dto/list-result';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtUser } from '../../common/types/jwt-user';
import { syncEmployeeTrainer } from '../club-fitness/trainer-sync.util';
import { assertEmployeeInScope, scopedEmployeeIds } from '../reports/employee-branch-scope.util';
import { CreateExitDto, ListExitsDto } from './dto/exit.dto';
import {
  EXIT_TYPE_LABELS,
  EXIT_TYPES,
  ExitType,
  computeNoticeShortfall,
  defaultRequiredNoticeDays,
  isExitType,
  isIsoDate,
} from './exit-types';

/** Raw row of hr_employee_exits (new table → raw SQL only; production never runs prisma generate). */
interface ExitRow {
  id: number;
  emp_id: number;
  exit_type: string;
  notice_given_date: string | null;
  last_working_date: string;
  required_notice_days: number;
  notice_days_given: number | null;
  notice_shortfall_days: number;
  reason: string | null;
  notes: string | null;
  settlement_notes: string | null;
  recorded_by: number | null;
  recorded_at: Date | string | null;
  employee_name?: string | null;
  recorded_by_name?: string | null;
}

function toView(row: ExitRow) {
  const type = isExitType(row.exit_type) ? row.exit_type : 'other';
  return {
    id: Number(row.id),
    empId: Number(row.emp_id),
    employeeName: row.employee_name ?? '',
    exitType: type,
    exitTypeLabel: EXIT_TYPE_LABELS[type],
    noticeGivenDate: row.notice_given_date,
    lastWorkingDate: row.last_working_date,
    requiredNoticeDays: Number(row.required_notice_days),
    noticeDaysGiven: row.notice_days_given == null ? null : Number(row.notice_days_given),
    noticeShortfallDays: Number(row.notice_shortfall_days),
    reason: row.reason,
    notes: row.notes,
    settlementNotes: row.settlement_notes,
    recordedBy: row.recorded_by == null ? null : Number(row.recorded_by),
    recordedByName: row.recorded_by_name ?? null,
    recordedAt: row.recorded_at instanceof Date ? row.recorded_at.toISOString() : row.recorded_at,
  };
}

export type EmployeeExitView = ReturnType<typeof toView>;

const SELECT_EXIT = Prisma.sql`
  SELECT x.*, e.employee AS employee_name, u.name AS recorded_by_name
  FROM hr_employee_exits x
  LEFT JOIN employees e ON e.id = x.emp_id
  LEFT JOIN users u ON u.user_id = x.recorded_by`;

@Injectable()
export class ExitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branchScope: BranchScopeService,
  ) {}

  meta() {
    return {
      requiredNoticeDays: defaultRequiredNoticeDays(),
      types: EXIT_TYPES.map((value) => ({ value, label: EXIT_TYPE_LABELS[value] })),
    };
  }

  async list(q: ListExitsDto, user: JwtUser) {
    const conds: Prisma.Sql[] = [];
    const empIds = await scopedEmployeeIds(this.prisma, this.branchScope, user);
    if (empIds !== null) {
      if (!empIds.length) return paginated([], 0, q.page, q.pageSize);
      conds.push(Prisma.sql`x.emp_id IN (${Prisma.join(empIds)})`);
    }
    if (q.exitType) conds.push(Prisma.sql`x.exit_type = ${q.exitType}`);
    if (q.empId) conds.push(Prisma.sql`x.emp_id = ${q.empId}`);
    const s = q.search?.trim();
    if (s) {
      const like = `%${s}%`;
      conds.push(Prisma.sql`(e.employee LIKE ${like} OR x.reason LIKE ${like} OR x.last_working_date LIKE ${like})`);
    }
    const where = conds.length ? Prisma.sql`WHERE ${Prisma.join(conds, ' AND ')}` : Prisma.empty;

    const [rows, counts] = await Promise.all([
      this.prisma.$queryRaw<ExitRow[]>(Prisma.sql`
        ${SELECT_EXIT} ${where}
        ORDER BY x.last_working_date DESC, x.id DESC
        LIMIT ${q.take} OFFSET ${q.skip}`),
      this.prisma.$queryRaw<Array<{ total: bigint | number }>>(Prisma.sql`
        SELECT COUNT(*) AS total FROM hr_employee_exits x
        LEFT JOIN employees e ON e.id = x.emp_id ${where}`),
    ]);
    return paginated(rows.map(toView), Number(counts[0]?.total ?? 0), q.page, q.pageSize);
  }

  /** All exit records of one employee, newest first (profile card). */
  async forEmployee(empId: number, user: JwtUser) {
    await assertEmployeeInScope(this.prisma, this.branchScope, user, empId);
    const rows = await this.prisma.$queryRaw<ExitRow[]>(Prisma.sql`
      ${SELECT_EXIT} WHERE x.emp_id = ${empId} ORDER BY x.id DESC`);
    return rows.map(toView);
  }

  /**
   * Records an employee exit and marks the employee as left using the legacy fields
   * (leave_emp, end_service_date_m, end_date, reason) so every existing screen keeps working.
   */
  async create(dto: CreateExitDto, user: JwtUser) {
    if (!isExitType(dto.exitType)) throw new BadRequestException('نوع انتهاء الخدمة غير صالح');
    if (!isIsoDate(dto.lastWorkingDate)) throw new BadRequestException('تاريخ آخر يوم عمل غير صالح');
    const noticeGivenDate = dto.noticeGivenDate ? dto.noticeGivenDate : null;
    if (noticeGivenDate && !isIsoDate(noticeGivenDate)) throw new BadRequestException('تاريخ الإخطار غير صالح');
    if (noticeGivenDate && noticeGivenDate > dto.lastWorkingDate) {
      throw new BadRequestException('تاريخ الإخطار لا يمكن أن يكون بعد آخر يوم عمل');
    }

    const emp = await this.prisma.employees.findUnique({ where: { id: dto.empId }, select: { id: true } });
    if (!emp) throw new NotFoundException('الموظف غير موجود');
    await assertEmployeeInScope(this.prisma, this.branchScope, user, emp.id);

    const exitType: ExitType = dto.exitType;
    const requiredNoticeDays = dto.requiredNoticeDays ?? defaultRequiredNoticeDays();
    const { noticeDaysGiven, shortfallDays, suggestedType } = computeNoticeShortfall({
      exitType,
      noticeGivenDate,
      lastWorkingDate: dto.lastWorkingDate,
      requiredNoticeDays,
    });
    const reason = dto.reason?.trim() || null;
    const legacyReason = (reason ? `${EXIT_TYPE_LABELS[exitType]} — ${reason}` : EXIT_TYPE_LABELS[exitType]).slice(0, 100);
    const recordedBy = user?.sub ?? null;

    const id = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO hr_employee_exits
          (emp_id, exit_type, notice_given_date, last_working_date, required_notice_days,
           notice_days_given, notice_shortfall_days, reason, notes, settlement_notes, recorded_by)
        VALUES (${emp.id}, ${exitType}, ${noticeGivenDate}, ${dto.lastWorkingDate}, ${requiredNoticeDays},
           ${noticeDaysGiven}, ${shortfallDays}, ${reason}, ${dto.notes?.trim() || null},
           ${dto.settlementNotes?.trim() || null}, ${recordedBy})`);
      const inserted = await tx.$queryRaw<Array<{ id: bigint | number }>>(Prisma.sql`SELECT LAST_INSERT_ID() AS id`);
      // updateMany: legacy rows can hold '' in enum columns that Prisma cannot read back.
      await tx.employees.updateMany({
        where: { id: emp.id },
        data: {
          leave_emp: 1,
          end_service_date_m: dto.lastWorkingDate,
          end_date: dto.lastWorkingDate,
          reason: legacyReason,
        },
      });
      return Number(inserted[0]?.id ?? 0);
    });

    // A departed captain leaves the coach lists; a roster hiccup must not undo the exit.
    await syncEmployeeTrainer(this.prisma, emp.id).catch(() => undefined);

    return {
      id,
      empId: emp.id,
      exitType,
      exitTypeLabel: EXIT_TYPE_LABELS[exitType],
      requiredNoticeDays,
      noticeDaysGiven,
      noticeShortfallDays: shortfallDays,
      suggestedType,
      warning: suggestedType
        ? `الموظف ما أداش إخطار ${requiredNoticeDays} يوم (ناقص ${shortfallDays} يوم) — المفروض يتسجل ${EXIT_TYPE_LABELS[suggestedType]}`
        : null,
    };
  }
}
