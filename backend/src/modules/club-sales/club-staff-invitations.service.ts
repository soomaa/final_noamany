import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtUser } from '../../common/types/jwt-user';
import { managerKind } from '../../common/utils/manager-scope.util';
import { managerStaff } from '../../common/utils/manager-staff.util';
import { isSystemAdmin } from '../../common/utils/system-admin.util';
import { PermissionEngineService } from '../rbac/engine/permission-engine.service';
import { localDateString } from '../club-fitness/club-fitness.utils';
import { ClubLeadsService } from './club-leads.service';
import { LEAD_STATUS_LABELS, isLeadStatus } from './club-sales.constants';
import {
  AdjustStaffInvitationQuotaDto,
  CreateStaffInvitationDto,
  GenerateStaffInvitationCodesDto,
  UpdateStaffInvitationCodeDto,
  UpdateStaffInvitationSettingsDto,
  UpsertStaffInvitationCodeDto,
} from './dto/staff-invitations.dto';
import {
  decideQuota,
  effectiveQuota,
  egyptianMobile,
  invitationOutcome,
  invitationPeriod,
  normalizeInvitationCode,
  phoneVariants,
  remainingQuota,
  suggestedInvitationCode,
  validateAdjustment,
  validateVisitDate,
} from './staff-invitation-quota';

/** Whose codes a user may see — the same split as the discount codes (admin / manager / self). */
export type StaffInvitationViewer =
  | { kind: 'all' }
  | { kind: 'branches'; branchIds: number[] }
  | { kind: 'manager'; user: JwtUser }
  | { kind: 'self'; employeeId: number | null };

const PAGE_KEYS = ['club.staff_invitations:view'];
const MANAGE_KEYS = ['club.staff_invitations:update'];
const OVERRIDE_KEYS = ['club.staff_invitations:approve'];
const CLOSED_LEAD_STATUSES = ['membership_done', 'lost', 'converted'];
/**
 * Active staff, as the login check reads it (auth/employee-status.util): not deleted from HR
 * (leave_emp = 1) and not suspended (employee_type = 2).
 */
const ACTIVE_EMPLOYEE: Prisma.employeesWhereInput = { AND: [{ OR: [{ leave_emp: null }, { leave_emp: 0 }] }, { NOT: { employee_type: 2 } }] };
const INACTIVE_EMPLOYEE: Prisma.employeesWhereInput = { OR: [{ leave_emp: 1 }, { employee_type: 2 }] };

type CodeRow = { id: number; employee_id: number; code: string; monthly_quota: number; is_active: boolean };

function badRequest(error: unknown): never {
  throw new BadRequestException(error instanceof Error ? error.message : String(error));
}

@Injectable()
export class ClubStaffInvitationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branchScope: BranchScopeService,
    private readonly leads: ClubLeadsService,
    private readonly engine: PermissionEngineService,
  ) {}

  // ── scope ────────────────────────────────────────────────────────────────

  async viewer(user: JwtUser): Promise<StaffInvitationViewer> {
    if (isSystemAdmin(user)) return { kind: 'all' };
    // Without the page grant (e.g. «كود الدعوات الخاص بي» only) an employee sees themself alone.
    if (!(await this.engine.canAny(user.sub, PAGE_KEYS))) return { kind: 'self', employeeId: user.emp_code ?? null };
    if (managerKind(user)) return { kind: 'manager', user };
    if (user.level === 3) return { kind: 'branches', branchIds: this.branchScope.allowedBranchIds(user) ?? [] };
    // Whoever may manage codes (an admin-like role) sees every employee in their branches.
    if (await this.engine.canAny(user.sub, MANAGE_KEYS)) {
      const branches = this.branchScope.allowedBranchIds(user);
      return branches === null ? { kind: 'all' } : { kind: 'branches', branchIds: branches };
    }
    return { kind: 'self', employeeId: user.emp_code ?? null };
  }

  /** Employee ids the viewer may see, or undefined for everyone. */
  private async visibleEmployeeIds(viewer: StaffInvitationViewer): Promise<number[] | undefined> {
    if (viewer.kind === 'all') return undefined;
    if (viewer.kind === 'self') return viewer.employeeId ? [viewer.employeeId] : [];
    if (viewer.kind === 'manager') {
      const staff = await managerStaff(this.prisma, viewer.user, this.branchScope.allowedBranchIds(viewer.user));
      return (staff ?? []).map((row) => row.id);
    }
    const rows = await this.prisma.employees.findMany({ where: { branch_id_fk: { in: viewer.branchIds } }, select: { id: true } });
    return rows.map((row) => row.id);
  }

  async assertEmployeeVisible(user: JwtUser, employeeId: number) {
    const ids = await this.visibleEmployeeIds(await this.viewer(user));
    if (ids && !ids.includes(employeeId)) throw new ForbiddenException('مش مسموح لك تشوف دعوات موظف تاني');
  }

  private async assertCanManage(user: JwtUser, employeeId: number) {
    if (!isSystemAdmin(user) && !(await this.engine.canAny(user.sub, MANAGE_KEYS))) {
      throw new ForbiddenException('تعديل الأكواد والحصص للإدارة بس');
    }
    await this.assertEmployeeVisible(user, employeeId);
  }

  private async canOverride(user: JwtUser) {
    return isSystemAdmin(user) || this.engine.canAny(user.sub, OVERRIDE_KEYS);
  }

  // ── helpers ─────────────────────────────────────────────────────────────

  private today() {
    return localDateString();
  }

  private async settings() {
    const row = await this.prisma.club_staff_invitation_settings.findUnique({ where: { id: 1 } });
    return { duplicateWindowDays: row?.duplicate_window_days ?? 30, defaultMonthlyQuota: row?.default_monthly_quota ?? 5 };
  }

  /** used / quota / remaining for each code in one allowance month. */
  private async usage(codeRows: CodeRow[], period: string, client: PrismaService | Prisma.TransactionClient = this.prisma) {
    const ids = codeRows.map((row) => row.id);
    if (!ids.length) return new Map<number, { quota: number; used: number; remaining: number; adjustment: number }>();
    const [used, adjustments] = await Promise.all([
      client.club_staff_invitations.groupBy({ by: ['code_id'], where: { code_id: { in: ids }, period }, _count: { _all: true } }),
      client.club_staff_invitation_adjustments.findMany({ where: { code_id: { in: ids }, period, kind: 'adjust' }, select: { code_id: true, delta: true } }),
    ]);
    const usedBy = new Map(used.map((row) => [row.code_id, row._count._all] as const));
    const result = new Map<number, { quota: number; used: number; remaining: number; adjustment: number }>();
    for (const row of codeRows) {
      const deltas = adjustments.filter((a) => a.code_id === row.id).map((a) => a.delta);
      const quota = effectiveQuota(row.monthly_quota, deltas);
      const u = usedBy.get(row.id) ?? 0;
      result.set(row.id, { quota, used: u, remaining: remainingQuota(quota, u), adjustment: deltas.reduce((s, d) => s + d, 0) });
    }
    return result;
  }

  private async jobTitles(rows: Array<{ mosma_wazefy_code: number | null; mosma_wazefy_n: string | null }>) {
    const ids = [...new Set(rows.map((row) => row.mosma_wazefy_code).filter((id): id is number => id != null))];
    const jobs = ids.length ? await this.prisma.department_jobs.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : [];
    const byId = new Map(jobs.map((job) => [job.id, job.name] as const));
    return (row: { mosma_wazefy_code: number | null; mosma_wazefy_n: string | null }) =>
      (row.mosma_wazefy_code != null ? byId.get(row.mosma_wazefy_code) : null) ?? row.mosma_wazefy_n ?? null;
  }

  /**
   * The branch an employee works in: their HR record (employees.branch_id_fk), else their login's
   * branch (users.branch_id_fk) — the same pair the JWT's `branch` is built from.
   */
  private async effectiveBranches(employees: Array<{ id: number; branch_id_fk: number | null }>) {
    const missing = employees.filter((row) => !row.branch_id_fk).map((row) => row.id);
    const logins = missing.length
      ? await this.prisma.users.findMany({ where: { emp_code: { in: missing }, branch_id_fk: { not: null } }, select: { emp_code: true, branch_id_fk: true } })
      : [];
    const loginBranch = new Map(logins.filter((row) => row.branch_id_fk).map((row) => [row.emp_code, row.branch_id_fk!] as const));
    return new Map(employees.map((row) => [row.id, row.branch_id_fk || loginBranch.get(row.id) || null] as const));
  }

  private async branchNames() {
    const rows = await this.prisma.tbl_branches.findMany({ select: { branch_id: true, branch_name: true } });
    return new Map(rows.map((row) => [row.branch_id, row.branch_name ?? `#${row.branch_id}`] as const));
  }

  private async employeeNames(ids: Array<number | null | undefined>) {
    const unique = [...new Set(ids.filter((id): id is number => id != null))];
    if (!unique.length) return new Map<number, string>();
    const rows = await this.prisma.employees.findMany({ where: { id: { in: unique } }, select: { id: true, employee: true } });
    return new Map(rows.map((row) => [row.id, row.employee ?? `#${row.id}`] as const));
  }

  private async log(
    client: PrismaService | Prisma.TransactionClient,
    row: { code_id: number; employee_id: number; kind: string; delta?: number; quota_before?: number | null; quota_after?: number | null; period?: string | null; reason: string },
    user: JwtUser,
  ) {
    await client.club_staff_invitation_adjustments.create({
      data: {
        code_id: row.code_id,
        employee_id: row.employee_id,
        kind: row.kind,
        delta: row.delta ?? 0,
        quota_before: row.quota_before ?? null,
        quota_after: row.quota_after ?? null,
        period: row.period ?? null,
        reason: row.reason.slice(0, 500),
        created_by: user.emp_code ?? user.sub,
      },
    });
  }

  // ── admin list ──────────────────────────────────────────────────────────

  async list(user: JwtUser, query: { branchId?: number; search?: string; withCode?: string; status?: string; dateFrom?: string; dateTo?: string }) {
    const viewer = await this.viewer(user);
    const visible = await this.visibleEmployeeIds(viewer);
    const branches = this.branchScope.resolveListFilter(user, query.branchId ?? null);
    const search = query.search?.trim();
    const codeMatches = search
      ? await this.prisma.club_staff_invitation_codes.findMany({ where: { code: { contains: search } }, select: { employee_id: true } })
      : [];
    const allEmployees = await this.prisma.employees.findMany({
      where: {
        AND: [
          ...(query.status === 'inactive' ? [INACTIVE_EMPLOYEE] : query.status === 'all' ? [] : [ACTIVE_EMPLOYEE]),
          ...(visible ? [{ id: { in: visible } }] : []),
          ...(search
            ? [{ OR: [
                { employee: { contains: search } },
                ...(/^\d+$/.test(search) ? [{ emp_code: Number(search) }] : []),
                ...(codeMatches.length ? [{ id: { in: codeMatches.map((row) => row.employee_id) } }] : []),
              ] }]
            : []),
        ],
      },
      select: { id: true, employee: true, emp_code: true, branch_id_fk: true, mosma_wazefy_code: true, mosma_wazefy_n: true, leave_emp: true, employee_type: true },
      orderBy: [{ employee: 'asc' }],
      take: 2000,
    });
    // Branch filter on the effective branch (HR record, else the login's branch).
    const branchOf = await this.effectiveBranches(allEmployees);
    const employees = branches ? allEmployees.filter((row) => { const b = branchOf.get(row.id); return b != null && branches.includes(b); }) : allEmployees;
    const ids = employees.map((row) => row.id);
    const codes = ids.length ? await this.prisma.club_staff_invitation_codes.findMany({ where: { employee_id: { in: ids } } }) : [];
    const codeByEmployee = new Map(codes.map((row) => [row.employee_id, row] as const));
    const period = invitationPeriod(this.today());
    // «زيارات الفترة»: guests who visited in the chosen range (default: this month), and how many
    // of them subscribed — so the page can be read for any month or dates, not only now.
    const rangeFrom = query.dateFrom ?? `${period}-01`;
    const rangeTo = query.dateTo ?? this.today();
    const [periodVisits, periodConverted] = ids.length
      ? await Promise.all([
          this.prisma.club_staff_invitations.groupBy({
            by: ['employee_id'],
            where: { employee_id: { in: ids }, visit_date: { gte: rangeFrom, lte: rangeTo } },
            _count: { _all: true },
          }),
          this.prisma.$queryRaw<Array<{ employee_id: number; total: bigint }>>(Prisma.sql`
            SELECT si.employee_id, COUNT(*) AS total
            FROM club_staff_invitations si
            INNER JOIN club_leads l ON l.id = si.lead_id
            WHERE si.employee_id IN (${Prisma.join(ids)})
              AND si.visit_date BETWEEN ${rangeFrom} AND ${rangeTo}
              AND (l.converted_member_id IS NOT NULL OR l.status = 'converted')
            GROUP BY si.employee_id`),
        ])
      : [[], []];
    const periodVisitsBy = new Map(periodVisits.map((row) => [row.employee_id, row._count._all] as const));
    const periodConvertedBy = new Map(periodConverted.map((row) => [Number(row.employee_id), Number(row.total)] as const));
    const [usage, totals, converted, titleOf, branchNames] = await Promise.all([
      this.usage(codes, period),
      ids.length ? this.prisma.club_staff_invitations.groupBy({ by: ['employee_id'], where: { employee_id: { in: ids } }, _count: { _all: true } }) : [],
      ids.length
        ? this.prisma.club_leads.groupBy({
            by: ['invited_by_employee_id'],
            where: { invited_by_employee_id: { in: ids }, staff_invitation_id: { not: null }, OR: [{ converted_member_id: { not: null } }, { status: 'converted' }] },
            _count: { _all: true },
          })
        : [],
      this.jobTitles(employees),
      this.branchNames(),
    ]);
    const totalBy = new Map(totals.map((row) => [row.employee_id, row._count._all] as const));
    const convertedBy = new Map(converted.map((row) => [row.invited_by_employee_id, row._count._all] as const));
    const rows = employees.map((employee) => {
      const code = codeByEmployee.get(employee.id) ?? null;
      const use = code ? usage.get(code.id) : undefined;
      return {
        employeeId: employee.id,
        employeeName: employee.employee ?? `#${employee.id}`,
        empCode: employee.emp_code,
        jobTitle: titleOf(employee),
        branchId: branchOf.get(employee.id) ?? null,
        branchName: (() => { const b = branchOf.get(employee.id); return b != null ? branchNames.get(b) ?? `فرع ${b}` : 'الإدارة (بدون فرع)'; })(),
        isEmployeeActive: !(employee.leave_emp === 1 || employee.employee_type === 2),
        codeId: code?.id ?? null,
        code: code?.code ?? null,
        suggestedCode: suggestedInvitationCode(employee),
        isActive: code?.is_active ?? false,
        monthlyQuota: code?.monthly_quota ?? 0,
        monthAdjustment: use?.adjustment ?? 0,
        quota: use?.quota ?? 0,
        usedThisMonth: use?.used ?? 0,
        remaining: code?.is_active ? use?.remaining ?? 0 : 0,
        totalGuests: totalBy.get(employee.id) ?? 0,
        convertedGuests: convertedBy.get(employee.id) ?? 0,
        periodVisits: periodVisitsBy.get(employee.id) ?? 0,
        periodConverted: periodConvertedBy.get(employee.id) ?? 0,
      };
    });
    const filtered = query.withCode === 'yes' ? rows.filter((row) => row.codeId) : query.withCode === 'no' ? rows.filter((row) => !row.codeId) : rows;
    const canManage = isSystemAdmin(user) || (await this.engine.canAny(user.sub, MANAGE_KEYS));
    return {
      period,
      range: { from: rangeFrom, to: rangeTo },
      canManage,
      canOverride: await this.canOverride(user),
      scope: viewer.kind,
      rows: filtered,
      totals: {
        employees: filtered.length,
        withCode: filtered.filter((row) => row.codeId).length,
        usedThisMonth: filtered.reduce((sum, row) => sum + row.usedThisMonth, 0),
        totalGuests: filtered.reduce((sum, row) => sum + row.totalGuests, 0),
        convertedGuests: filtered.reduce((sum, row) => sum + row.convertedGuests, 0),
        periodVisits: filtered.reduce((sum, row) => sum + row.periodVisits, 0),
        periodConverted: filtered.reduce((sum, row) => sum + row.periodConverted, 0),
      },
    };
  }

  /** One employee's code card (the captain's own view, and the drill-down header). */
  async employeeSummary(employeeId: number, user: JwtUser) {
    await this.assertEmployeeVisible(user, employeeId);
    const employee = await this.prisma.employees.findUnique({
      where: { id: employeeId },
      select: { id: true, employee: true, emp_code: true, branch_id_fk: true, mosma_wazefy_code: true, mosma_wazefy_n: true },
    });
    if (!employee) throw new NotFoundException('الموظف غير موجود');
    const code = await this.prisma.club_staff_invitation_codes.findUnique({ where: { employee_id: employeeId } });
    const period = invitationPeriod(this.today());
    const use = code ? (await this.usage([code], period)).get(code.id) : undefined;
    const [total, converted, titleOf] = await Promise.all([
      this.prisma.club_staff_invitations.count({ where: { employee_id: employeeId } }),
      this.prisma.club_leads.count({ where: { invited_by_employee_id: employeeId, staff_invitation_id: { not: null }, OR: [{ converted_member_id: { not: null } }, { status: 'converted' }] } }),
      this.jobTitles([employee]),
    ]);
    return {
      employeeId,
      employeeName: employee.employee ?? `#${employeeId}`,
      empCode: employee.emp_code,
      jobTitle: titleOf(employee),
      codeId: code?.id ?? null,
      code: code?.code ?? null,
      isActive: code?.is_active ?? false,
      monthlyQuota: code?.monthly_quota ?? 0,
      monthAdjustment: use?.adjustment ?? 0,
      quota: use?.quota ?? 0,
      usedThisMonth: use?.used ?? 0,
      remaining: code?.is_active ? use?.remaining ?? 0 : 0,
      totalGuests: total,
      convertedGuests: converted,
      period,
    };
  }

  async mine(user: JwtUser) {
    // An account with no employee (the system admin) has no code: an answer, not an error, so the
    // page and the home card can say so instead of failing (console showed 400s on every load).
    if (!user.emp_code) return { linked: false, summary: null, guests: [] };
    const summary = await this.employeeSummary(user.emp_code, user);
    const guests = await this.guests(user.emp_code, user, {});
    return { linked: true, summary, guests };
  }

  // ── codes & quota ───────────────────────────────────────────────────────

  private async uniqueCodeOrThrow(code: string, exceptId?: number) {
    const clash = await this.prisma.club_staff_invitation_codes.findUnique({ where: { code } });
    if (clash && clash.id !== exceptId) throw new BadRequestException(`الكود ${code} مستخدم لموظف تاني`);
  }

  async upsertCode(dto: UpsertStaffInvitationCodeDto, user: JwtUser) {
    await this.assertCanManage(user, dto.employeeId);
    const employee = await this.prisma.employees.findFirst({ where: { id: dto.employeeId, ...ACTIVE_EMPLOYEE }, select: { id: true, emp_code: true } });
    if (!employee) throw new NotFoundException('الموظف غير موجود أو تارك العمل');
    let code: string;
    try {
      code = normalizeInvitationCode(dto.code?.trim() ? dto.code : suggestedInvitationCode(employee));
    } catch (error) {
      badRequest(error);
    }
    const existing = await this.prisma.club_staff_invitation_codes.findUnique({ where: { employee_id: dto.employeeId } });
    if (existing) return this.updateCode(existing.id, { code, monthlyQuota: dto.monthlyQuota, reason: dto.reason }, user);
    await this.uniqueCodeOrThrow(code);
    const quota = dto.monthlyQuota ?? (await this.settings()).defaultMonthlyQuota;
    try {
      return await this.prisma.$transaction(async (tx) => {
        const row = await tx.club_staff_invitation_codes.create({
          data: { employee_id: dto.employeeId, code, monthly_quota: quota, is_active: true, created_by: user.emp_code ?? user.sub },
        });
        await this.log(tx, { code_id: row.id, employee_id: row.employee_id, kind: 'set_quota', quota_before: null, quota_after: quota, reason: dto.reason?.trim() || `إنشاء الكود ${code}` }, user);
        return row;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new BadRequestException(`الكود ${code} مستخدم لموظف تاني`);
      throw error;
    }
  }

  async updateCode(id: number, dto: UpdateStaffInvitationCodeDto, user: JwtUser) {
    const existing = await this.prisma.club_staff_invitation_codes.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('الكود غير موجود');
    await this.assertCanManage(user, existing.employee_id);
    let code: string | undefined;
    if (dto.code?.trim()) {
      try {
        code = normalizeInvitationCode(dto.code);
      } catch (error) {
        badRequest(error);
      }
      if (code !== existing.code) await this.uniqueCodeOrThrow(code, id);
    }
    const quotaChanged = dto.monthlyQuota != null && dto.monthlyQuota !== existing.monthly_quota;
    const codeChanged = code != null && code !== existing.code;
    if (!quotaChanged && !codeChanged) return existing;
    try {
      return await this.prisma.$transaction(async (tx) => {
        const row = await tx.club_staff_invitation_codes.update({
          where: { id },
          data: { ...(codeChanged ? { code } : {}), ...(quotaChanged ? { monthly_quota: dto.monthlyQuota } : {}) },
        });
        if (quotaChanged) {
          await this.log(tx, { code_id: id, employee_id: existing.employee_id, kind: 'set_quota', delta: dto.monthlyQuota! - existing.monthly_quota, quota_before: existing.monthly_quota, quota_after: dto.monthlyQuota, reason: dto.reason?.trim() || 'تعديل الحصة الشهرية' }, user);
        }
        if (codeChanged) {
          await this.log(tx, { code_id: id, employee_id: existing.employee_id, kind: 'code', reason: `تغيير الكود من ${existing.code} إلى ${code}${dto.reason?.trim() ? ` — ${dto.reason.trim()}` : ''}` }, user);
        }
        return row;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new BadRequestException(`الكود ${code} مستخدم لموظف تاني`);
      throw error;
    }
  }

  /** Quick +/− on this month's allowance, with a reason (logged). */
  async adjust(id: number, dto: AdjustStaffInvitationQuotaDto, user: JwtUser) {
    let input: { delta: number; reason: string };
    try {
      input = validateAdjustment(dto.delta, dto.reason);
    } catch (error) {
      badRequest(error);
    }
    const existing = await this.prisma.club_staff_invitation_codes.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('الكود غير موجود');
    await this.assertCanManage(user, existing.employee_id);
    const period = invitationPeriod(this.today());
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM club_staff_invitation_codes WHERE id = ${id} FOR UPDATE`;
      const before = (await this.usage([existing], period, tx)).get(id)!;
      await this.log(tx, { code_id: id, employee_id: existing.employee_id, kind: 'adjust', delta: input.delta, quota_before: before.quota, quota_after: effectiveQuota(before.quota, [input.delta]), period, reason: input.reason }, user);
      const after = (await this.usage([existing], period, tx)).get(id)!;
      return { codeId: id, period, ...after };
    });
  }

  async setActive(id: number, active: boolean, reason: string, user: JwtUser) {
    const existing = await this.prisma.club_staff_invitation_codes.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('الكود غير موجود');
    await this.assertCanManage(user, existing.employee_id);
    if (existing.is_active === active) return existing;
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.club_staff_invitation_codes.update({ where: { id }, data: { is_active: active } });
      await this.log(tx, { code_id: id, employee_id: existing.employee_id, kind: active ? 'activate' : 'deactivate', reason }, user);
      return row;
    });
  }

  /** One click: a code (NM + employee code) for every visible active employee who has none. */
  async generateMissing(dto: GenerateStaffInvitationCodesDto, user: JwtUser) {
    if (!isSystemAdmin(user) && !(await this.engine.canAny(user.sub, MANAGE_KEYS))) {
      throw new ForbiddenException('تعديل الأكواد والحصص للإدارة بس');
    }
    const visible = await this.visibleEmployeeIds(await this.viewer(user));
    const branches = this.branchScope.resolveListFilter(user, dto.branchId ?? null);
    const candidates = await this.prisma.employees.findMany({
      where: { AND: [ACTIVE_EMPLOYEE, ...(visible ? [{ id: { in: visible } }] : [])] },
      select: { id: true, emp_code: true, branch_id_fk: true },
    });
    // Only staff who work in a branch (guests come to a branch); head-office staff with no
    // branch get a code by hand from the row menu.
    const branchOf = await this.effectiveBranches(candidates);
    const employees = candidates.filter((row) => { const b = branchOf.get(row.id); return b != null && (!branches || branches.includes(b)); });
    const have = new Set((await this.prisma.club_staff_invitation_codes.findMany({ select: { employee_id: true } })).map((row) => row.employee_id));
    const taken = new Set((await this.prisma.club_staff_invitation_codes.findMany({ select: { code: true } })).map((row) => row.code));
    const quota = dto.monthlyQuota ?? (await this.settings()).defaultMonthlyQuota;
    const pending = employees.filter((row) => !have.has(row.id));
    if (dto.dryRun) return { created: 0, wouldCreate: pending.length, monthlyQuota: quota };
    let created = 0;
    for (const employee of employees) {
      if (have.has(employee.id)) continue;
      let code = suggestedInvitationCode(employee);
      if (taken.has(code)) code = `NM-E${employee.id}`;
      if (taken.has(code)) continue;
      try {
        await this.prisma.$transaction(async (tx) => {
          const row = await tx.club_staff_invitation_codes.create({ data: { employee_id: employee.id, code, monthly_quota: quota, created_by: user.emp_code ?? user.sub } });
          await this.log(tx, { code_id: row.id, employee_id: employee.id, kind: 'set_quota', quota_after: quota, reason: `إنشاء تلقائي للكود ${code}` }, user);
        });
        taken.add(code);
        created += 1;
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) throw error;
      }
    }
    return { created };
  }

  async adjustments(id: number, user: JwtUser) {
    const code = await this.prisma.club_staff_invitation_codes.findUnique({ where: { id } });
    if (!code) throw new NotFoundException('الكود غير موجود');
    await this.assertEmployeeVisible(user, code.employee_id);
    const rows = await this.prisma.club_staff_invitation_adjustments.findMany({ where: { code_id: id }, orderBy: { id: 'desc' }, take: 300 });
    const names = await this.employeeNames(rows.map((row) => row.created_by));
    const KIND: Record<string, string> = {
      set_quota: 'تحديد الحصة الشهرية',
      adjust: 'تعديل رصيد الشهر',
      override: 'تجاوز الحصة',
      code: 'تغيير الكود',
      activate: 'تفعيل الكود',
      deactivate: 'إيقاف الكود',
    };
    return rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      kindLabel: KIND[row.kind] ?? row.kind,
      delta: row.delta,
      quotaBefore: row.quota_before,
      quotaAfter: row.quota_after,
      period: row.period,
      reason: row.reason,
      createdBy: row.created_by,
      createdByName: row.created_by != null ? names.get(row.created_by) ?? `#${row.created_by}` : null,
      createdAt: row.created_at,
    }));
  }

  async getSettings() {
    return this.settings();
  }

  async updateSettings(dto: UpdateStaffInvitationSettingsDto, user: JwtUser) {
    if (!isSystemAdmin(user) && !(await this.engine.canAny(user.sub, MANAGE_KEYS))) throw new ForbiddenException('الإعدادات للإدارة بس');
    const current = await this.settings();
    await this.prisma.club_staff_invitation_settings.upsert({
      where: { id: 1 },
      create: { id: 1, duplicate_window_days: dto.duplicateWindowDays ?? current.duplicateWindowDays, default_monthly_quota: dto.defaultMonthlyQuota ?? current.defaultMonthlyQuota, updated_by: user.sub },
      update: { ...(dto.duplicateWindowDays != null ? { duplicate_window_days: dto.duplicateWindowDays } : {}), ...(dto.defaultMonthlyQuota != null ? { default_monthly_quota: dto.defaultMonthlyQuota } : {}), updated_by: user.sub },
    });
    return this.settings();
  }

  // ── recording a guest ────────────────────────────────────────────────────

  /** The code card the dialog shows after typing / scanning a code. */
  async lookup(input: { code?: string; employeeId?: number }) {
    let row: CodeRow | null = null;
    if (input.employeeId) row = await this.prisma.club_staff_invitation_codes.findUnique({ where: { employee_id: input.employeeId } });
    else if (input.code?.trim()) {
      let code: string;
      try {
        code = normalizeInvitationCode(input.code);
      } catch {
        throw new NotFoundException('الكود ده مش موجود');
      }
      row = await this.prisma.club_staff_invitation_codes.findUnique({ where: { code } });
    }
    if (!row) throw new NotFoundException(input.employeeId ? 'الموظف ده مالوش كود دعوات' : 'الكود ده مش موجود');
    const employee = await this.prisma.employees.findUnique({ where: { id: row.employee_id }, select: { id: true, employee: true, branch_id_fk: true, leave_emp: true, employee_type: true } });
    const use = (await this.usage([row], invitationPeriod(this.today()))).get(row.id)!;
    return {
      codeId: row.id,
      code: row.code,
      employeeId: row.employee_id,
      employeeName: employee?.employee ?? `#${row.employee_id}`,
      employeeBranchId: employee?.branch_id_fk ?? null,
      isActive: row.is_active && !!employee && employee.leave_emp !== 1 && employee.employee_type !== 2,
      quota: use.quota,
      usedThisMonth: use.used,
      remaining: use.remaining,
    };
  }

  /** Active codes for the "pick an employee" list in the dialog. */
  async activeCodes(search?: string) {
    const codes = await this.prisma.club_staff_invitation_codes.findMany({ where: { is_active: true }, orderBy: { code: 'asc' }, take: 2000 });
    const names = await this.employeeNames(codes.map((row) => row.employee_id));
    const q = search?.trim().toLowerCase();
    return codes
      .map((row) => ({ codeId: row.id, code: row.code, employeeId: row.employee_id, employeeName: names.get(row.employee_id) ?? `#${row.employee_id}` }))
      .filter((row) => !q || row.code.toLowerCase().includes(q) || row.employeeName.toLowerCase().includes(q));
  }

  /** Warnings shown before saving: already a member, an open lead, or a recent invitation. */
  async checkPhone(rawPhone: string) {
    const phone = egyptianMobile(rawPhone);
    if (!phone) throw new BadRequestException('رقم الموبايل لازم يكون موبايل مصري صحيح (11 رقم يبدأ بـ 01)');
    const variants = phoneVariants(phone);
    const { duplicateWindowDays } = await this.settings();
    const since = new Date(Date.now() - duplicateWindowDays * 86_400_000);
    const [member, lead, recent] = await Promise.all([
      this.prisma.club_members.findFirst({ where: { phone: { in: variants }, is_deleted: false }, select: { id: true, name: true, member_code: true } }),
      this.prisma.club_leads.findFirst({ where: { phone: { in: variants }, is_deleted: false, status: { notIn: CLOSED_LEAD_STATUSES } }, select: { id: true, name: true, assigned_to: true, status: true }, orderBy: { id: 'desc' } }),
      duplicateWindowDays > 0
        ? this.prisma.club_staff_invitations.findFirst({ where: { phone_key: phone, created_at: { gte: since } }, orderBy: { id: 'desc' } })
        : null,
    ]);
    const names = await this.employeeNames([lead?.assigned_to, recent?.employee_id]);
    const warnings: string[] = [];
    if (member) warnings.push(`الرقم ده لعضو موجود: ${member.name} (${member.member_code})`);
    if (lead) warnings.push(`الرقم ده عميل محتمل مفتوح عند السيلز${lead.assigned_to ? ` (${names.get(lead.assigned_to) ?? ''})` : ''} — الدعوة هتتسجل على نفس العميل`);
    const blocking = recent
      ? `الرقم ده اتسجل كدعوة من ${names.get(recent.employee_id) ?? `#${recent.employee_id}`} (كود ${recent.code}) يوم ${recent.visit_date} — مينفعش يتكرر قبل ${duplicateWindowDays} يوم`
      : null;
    return {
      phone,
      warnings,
      blocking,
      existingMemberId: member?.id ?? null,
      openLeadId: lead?.id ?? null,
    };
  }

  async create(dto: CreateStaffInvitationDto, user: JwtUser) {
    const phone = egyptianMobile(dto.guestPhone);
    if (!phone) throw new BadRequestException('رقم موبايل الضيف لازم يكون موبايل مصري صحيح (11 رقم يبدأ بـ 01)');
    const guestName = dto.guestName.trim();
    if (guestName.length < 2) throw new BadRequestException('اسم الضيف مطلوب');
    this.branchScope.assertBranchAllowed(user, dto.branchId, 'مش مسموح لك تسجل دعوات في الفرع ده');
    const today = this.today();
    let visitDate: string;
    try {
      visitDate = validateVisitDate(dto.visitDate, today);
    } catch (error) {
      badRequest(error);
    }
    const period = invitationPeriod(visitDate);

    let code: CodeRow | null = null;
    if (dto.employeeId) code = await this.prisma.club_staff_invitation_codes.findUnique({ where: { employee_id: dto.employeeId } });
    else if (dto.code?.trim()) {
      try {
        code = await this.prisma.club_staff_invitation_codes.findUnique({ where: { code: normalizeInvitationCode(dto.code) } });
      } catch {
        code = null;
      }
    } else throw new BadRequestException('اكتب كود الموظف أو اختار الموظف');
    if (!code) throw new NotFoundException('الكود ده مش موجود');
    if (!code.is_active) throw new BadRequestException('الكود ده موقوف — كلم الإدارة');
    const inviter = await this.prisma.employees.findFirst({ where: { id: code.employee_id, ...ACTIVE_EMPLOYEE }, select: { id: true, employee: true } });
    if (!inviter) throw new BadRequestException('صاحب الكود مش موظف نشط');
    const inviterName = inviter.employee ?? `#${inviter.id}`;

    const overrideReason = dto.overrideReason?.trim() || null;
    const mayOverride = await this.canOverride(user);
    const check = await this.checkPhone(phone);
    if (check.blocking) {
      if (!mayOverride || !overrideReason) {
        throw new BadRequestException(mayOverride ? `${check.blocking}. اكتب سبب التجاوز عشان تسجلها.` : check.blocking);
      }
    }

    const codeRow = code;
    const result = await this.prisma.$transaction(async (tx) => {
      // One recorder at a time per code: the row lock makes the count below the truth.
      await tx.$queryRaw`SELECT id FROM club_staff_invitation_codes WHERE id = ${codeRow.id} FOR UPDATE`;
      const fresh = await tx.club_staff_invitation_codes.findUnique({ where: { id: codeRow.id } });
      if (!fresh?.is_active) throw new BadRequestException('الكود ده موقوف — كلم الإدارة');
      const use = (await this.usage([fresh], period, tx)).get(fresh.id)!;
      const decision = decideQuota({ quota: use.quota, used: use.used, canOverride: mayOverride, overrideReason });
      if (!decision.ok) throw new BadRequestException(decision.message);

      const invitation = await tx.club_staff_invitations.create({
        data: {
          code_id: fresh.id,
          employee_id: fresh.employee_id,
          code: fresh.code,
          guest_name: guestName,
          guest_phone: phone,
          phone_key: phone,
          visit_date: visitDate,
          period,
          branch_id: dto.branchId,
          notes: dto.notes?.trim() || null,
          over_quota: decision.overQuota,
          override_reason: decision.overQuota || check.blocking ? overrideReason : null,
          created_by: user.emp_code ?? user.sub,
        },
      });
      if (decision.overQuota || check.blocking) {
        await this.log(tx, {
          code_id: fresh.id,
          employee_id: fresh.employee_id,
          kind: 'override',
          period,
          reason: `${decision.overQuota ? 'تجاوز الحصة' : 'تكرار رقم'} — ${guestName} (${phone}): ${overrideReason}`,
        }, user);
      }

      // An open lead with this phone keeps its owner: the invitation is noted on it instead of
      // creating a duplicate the sales team would call twice.
      let leadId: number;
      let reusedLead = false;
      let lockedToInviter = false;
      if (check.openLeadId) {
        const existing = await tx.club_leads.findUnique({ where: { id: check.openLeadId }, select: { id: true, status: true, invited_by_employee_id: true } });
        if (existing) {
          reusedLead = true;
          leadId = existing.id;
          await tx.club_leads.update({
            where: { id: existing.id },
            data: existing.invited_by_employee_id == null ? { invited_by_employee_id: fresh.employee_id, staff_invitation_id: invitation.id } : {},
          });
          await tx.club_lead_follow_ups.create({
            data: {
              lead_id: existing.id,
              note: `جه كدعوة من ${inviterName} — كود ${fresh.code} (زيارة ${visitDate})${dto.notes?.trim() ? `\n${dto.notes.trim()}` : ''}`,
              status: existing.status,
              activity_type: 'system',
              created_by: user.emp_code ?? user.sub,
            },
          });
        }
      }
      if (!reusedLead) {
        const assignment = await this.leads.staffInvitationAssignment(fresh.employee_id, dto.branchId);
        lockedToInviter = assignment.lockedToInviter;
        const lead = await this.leads.createStaffInvitationLead({
          guestName,
          phone,
          branchId: dto.branchId,
          inviterEmployeeId: fresh.employee_id,
          inviterName,
          code: fresh.code,
          staffInvitationId: invitation.id,
          notes: dto.notes,
          assignment,
        }, user, tx);
        leadId = lead.id;
      }
      await tx.club_staff_invitations.update({ where: { id: invitation.id }, data: { lead_id: leadId! } });
      const after = (await this.usage([fresh], period, tx)).get(fresh.id)!;
      return { invitation, leadId: leadId!, reusedLead, lockedToInviter, overQuota: decision.overQuota, remaining: after.remaining, quota: after.quota, used: after.used };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 15_000 });

    const lead = await this.prisma.club_leads.findUnique({ where: { id: result.leadId }, select: { assigned_to: true } });
    const repNames = await this.employeeNames([lead?.assigned_to]);
    const repName = lead?.assigned_to != null ? repNames.get(lead.assigned_to) ?? `#${lead.assigned_to}` : null;
    // What the toast says about who works the guest. The inviter stays on the lead in every case.
    const assignment = result.reusedLead ? 'existing_lead' : !repName ? 'unassigned' : result.lockedToInviter ? 'inviter' : 'round_robin';
    const assignmentMessage = {
      existing_lead: `الرقم كان عميل محتمل مفتوح — الدعوة اتضافت عليه${repName ? ` (مع ${repName})` : ''}`,
      unassigned: 'مفيش سيلز متاح — العميل اتسجل غير مسند',
      inviter: `العميل مقفول على ${repName} (صاحب الكود)`,
      round_robin: `العميل اتوزع على ${repName}`,
    }[assignment];
    return {
      id: result.invitation.id,
      code: result.invitation.code,
      employeeId: result.invitation.employee_id,
      employeeName: inviterName,
      guestName,
      guestPhone: phone,
      visitDate,
      leadId: result.leadId,
      reusedLead: result.reusedLead,
      assignedToId: lead?.assigned_to ?? null,
      assignedToName: repName,
      assignment,
      assignmentMessage,
      overQuota: result.overQuota,
      quota: result.quota,
      usedThisMonth: result.used,
      remaining: result.remaining,
      warnings: check.warnings,
    };
  }

  // ── guests (drill-down) ─────────────────────────────────────────────────

  async guests(employeeId: number, user: JwtUser, query: { period?: string }) {
    await this.assertEmployeeVisible(user, employeeId);
    const period = query.period && /^\d{4}-\d{2}$/.test(query.period) ? query.period : undefined;
    const rows = await this.prisma.club_staff_invitations.findMany({
      where: { employee_id: employeeId, ...(period ? { period } : {}) },
      orderBy: { id: 'desc' },
      take: 500,
    });
    const leadIds = [...new Set(rows.map((row) => row.lead_id).filter((id): id is number => id != null))];
    const leads = leadIds.length
      ? await this.prisma.club_leads.findMany({
          where: { id: { in: leadIds } },
          select: {
            id: true, status: true, converted_member_id: true, assigned_to: true,
            follow_ups: { orderBy: { created_at: 'desc' }, take: 30, select: { id: true, note: true, activity_type: true, created_by: true, created_at: true } },
          },
        })
      : [];
    const leadById = new Map(leads.map((lead) => [lead.id, lead] as const));
    const names = await this.employeeNames([
      ...leads.map((lead) => lead.assigned_to),
      ...leads.flatMap((lead) => lead.follow_ups.map((f) => f.created_by)),
      ...rows.map((row) => row.created_by),
    ]);
    const branchNames = await this.branchNames();
    return rows.map((row) => {
      const lead = row.lead_id != null ? leadById.get(row.lead_id) : undefined;
      const outcome = invitationOutcome(lead);
      return {
        id: row.id,
        code: row.code,
        guestName: row.guest_name,
        guestPhone: row.guest_phone,
        visitDate: row.visit_date,
        period: row.period,
        branchId: row.branch_id,
        branchName: row.branch_id != null ? branchNames.get(row.branch_id) ?? null : null,
        notes: row.notes,
        overQuota: row.over_quota,
        overrideReason: row.override_reason,
        createdAt: row.created_at,
        createdByName: row.created_by != null ? names.get(row.created_by) ?? null : null,
        leadId: row.lead_id,
        leadStatus: lead?.status ?? null,
        leadStatusLabel: lead && isLeadStatus(lead.status) ? LEAD_STATUS_LABELS[lead.status] : lead?.status ?? null,
        outcome: outcome.key,
        outcomeLabel: outcome.label,
        convertedMemberId: lead?.converted_member_id ?? null,
        assignedToId: lead?.assigned_to ?? null,
        assignedToName: lead?.assigned_to != null ? names.get(lead.assigned_to) ?? null : null,
        followUps: (lead?.follow_ups ?? []).map((f) => ({
          id: f.id,
          note: f.note,
          activityType: f.activity_type,
          createdByName: f.created_by != null ? names.get(f.created_by) ?? null : null,
          createdAt: f.created_at,
        })),
      };
    });
  }

  /** A note on a guest — written to the lead's follow-ups, so sales reads it in the lead history. */
  async addNote(invitationId: number, note: string, user: JwtUser) {
    const row = await this.prisma.club_staff_invitations.findUnique({ where: { id: invitationId } });
    if (!row) throw new NotFoundException('الدعوة غير موجودة');
    await this.assertEmployeeVisible(user, row.employee_id);
    if (!row.lead_id) throw new BadRequestException('الدعوة دي مش مربوطة بعميل محتمل');
    const lead = await this.prisma.club_leads.findUnique({ where: { id: row.lead_id }, select: { id: true, status: true } });
    if (!lead) throw new BadRequestException('العميل المحتمل المربوط بالدعوة اتمسح');
    const text = note.trim();
    if (text.length < 2) throw new BadRequestException('اكتب الملاحظة');
    const created = await this.prisma.club_lead_follow_ups.create({
      data: { lead_id: lead.id, note: text, status: lead.status, activity_type: 'note', created_by: user.emp_code ?? user.sub },
    });
    await this.prisma.club_leads.update({ where: { id: lead.id }, data: { updated_at: new Date() } });
    return { id: created.id, note: created.note, createdAt: created.created_at };
  }
}
