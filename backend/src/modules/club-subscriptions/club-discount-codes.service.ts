import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtUser } from '../../common/types/jwt-user';
import { isSystemAdmin } from '../../common/utils/system-admin.util';
import { roundMoney, toNum } from './club-subscription.utils';
import {
  CreateClubDiscountCodeDto,
  UpdateClubDiscountCodeDto,
} from './dto/club-discount-code.dto';

type DiscountClient = PrismaService | Prisma.TransactionClient;

export function memberGrantExpiryOn(now = new Date()) {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const day = now.getUTCDate();
  const lastDayThisMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const expiryMonth = day > Math.min(30, lastDayThisMonth) ? month + 1 : month;
  const expiryYear = expiryMonth > 11 ? year + 1 : year;
  const normalizedMonth = expiryMonth % 12;
  const expiryDay = Math.min(30, new Date(Date.UTC(expiryYear, normalizedMonth + 1, 0)).getUTCDate());
  return new Date(Date.UTC(expiryYear, normalizedMonth, expiryDay)).toISOString().slice(0, 10);
}

/** Allowances run per calendar month: grants issued this month count against this month only. */
export function grantPeriod(now = new Date()) {
  const today = now.toISOString().slice(0, 10);
  return { year: today.slice(0, 4), month: today.slice(5, 7) };
}

/**
 * Whose codes a user may see. Admins see everyone; a branch manager (level 3) sees the
 * employees of their branches; every other employee (captain, reception) sees only their own.
 */
export type DiscountViewer = { kind: 'all' } | { kind: 'branches'; branchIds: number[] } | { kind: 'self'; employeeId: number | null };

export interface ResolvedClubDiscount {
  discountEnabled: boolean;
  discountCodeId: number | null;
  discountPercentage: number | null;
  discountValue: number;
}

@Injectable()
export class ClubDiscountCodesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branchScope: BranchScopeService = new BranchScopeService(),
  ) {}

  viewer(user?: JwtUser): DiscountViewer {
    if (!user || isSystemAdmin(user)) return { kind: 'all' };
    if (user.level === 3) return { kind: 'branches', branchIds: this.branchScope.allowedBranchIds(user) ?? [] };
    return { kind: 'self', employeeId: user.emp_code ?? null };
  }

  /** Employee ids filter for the viewer, or undefined for "everyone". */
  private async employeeFilter(viewer: DiscountViewer): Promise<number[] | undefined> {
    if (viewer.kind === 'all') return undefined;
    if (viewer.kind === 'self') return viewer.employeeId ? [viewer.employeeId] : [];
    const rows = await this.prisma.employees.findMany({ where: { branch_id_fk: { in: viewer.branchIds } }, select: { id: true } });
    return rows.map((row) => row.id);
  }

  async assertEmployeeVisible(user: JwtUser | undefined, employeeId: number) {
    const ids = await this.employeeFilter(this.viewer(user));
    if (ids && !ids.includes(employeeId)) throw new ForbiddenException('لا يمكنك عرض أكواد موظف آخر');
  }

  /** A member is reachable only inside the user's branches and gender section. */
  private memberScope(user?: JwtUser): Prisma.club_membersWhereInput {
    // No user = an internal call (e.g. from subscription create), which scopes on its own.
    if (!user) return {};
    const branches = this.branchScope.allowedBranchIds(user);
    const gender = this.branchScope.memberGenderFilter(user);
    return {
      ...(branches === null ? {} : { branch_id: { in: branches } }),
      ...(gender ? { gender } : {}),
    };
  }

  async assertMemberInScope(user: JwtUser | undefined, memberId: number) {
    const member = await this.prisma.club_members.findFirst({ where: { id: memberId, ...this.memberScope(user) }, select: { id: true } });
    if (!member) throw new NotFoundException('العضو غير موجود');
  }

  private map(row: {
    id: number;
    title: string;
    nesba: unknown;
  }) {
    return {
      id: row.id,
      code: row.title,
      percentage: toNum(row.nesba),
      // The legacy table has no inactive state. A code is available until it
      // is deleted, exactly as in the original admin flow.
      isActive: true,
      usageCount: 0,
      createdAt: null,
      updatedAt: null,
    };
  }

  async list(_includeInactive = false) {
    const rows = await this.prisma.tbl_discount_codes.findMany({
      orderBy: { title: 'asc' },
    });
    return rows.map((row) => this.map(row));
  }

  async create(dto: CreateClubDiscountCodeDto, createdBy?: number) {
    const code = dto.code.trim().toUpperCase();
    if (!code) throw new BadRequestException('اسم كود الخصم مطلوب');
    const duplicate = await this.prisma.tbl_discount_codes.findUnique({ where: { title: code } });
    if (duplicate) throw new BadRequestException('اسم كود الخصم مستخدم بالفعل');
    const row = await this.prisma.tbl_discount_codes.create({
      data: {
        title: code,
        nesba: Math.round(dto.percentage),
        publisher: createdBy ?? null,
      },
    });
    return this.map(row);
  }

  async update(id: number, dto: UpdateClubDiscountCodeDto) {
    const existing = await this.prisma.tbl_discount_codes.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('كود الخصم غير موجود');
    const code = dto.code?.trim().toUpperCase();
    if (code && code !== existing.title) {
      const duplicate = await this.prisma.tbl_discount_codes.findUnique({ where: { title: code } });
      if (duplicate) throw new BadRequestException('اسم كود الخصم مستخدم بالفعل');
    }
    const row = await this.prisma.tbl_discount_codes.update({
      where: { id },
      data: {
        ...(code ? { title: code } : {}),
        ...(dto.percentage !== undefined ? { nesba: Math.round(dto.percentage) } : {}),
      },
    });
    return this.map(row);
  }

  async deactivate(id: number) {
    const existing = await this.prisma.tbl_discount_codes.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('كود الخصم غير موجود');
    await this.prisma.tbl_discount_codes.delete({ where: { id } });
    return { id, deleted: true };
  }

  async assignToEmployee(input: { employeeId: number; codeId: number; count: number }, publisher: number, client: DiscountClient = this.prisma) {
    const code = await client.tbl_discount_codes.findUnique({ where: { id: input.codeId } });
    if (!code) throw new NotFoundException('كود الخصم غير موجود');
    const existing = await client.tbl_discount_cobones_employees.findFirst({
      where: { emp_id_fk: input.employeeId, code_id_fk: input.codeId },
    });
    const data = { nesba: String(code.nesba), num: input.count, publisher, date: Math.floor(Date.now() / 1000) };
    return existing
      ? client.tbl_discount_cobones_employees.update({ where: { id: existing.id }, data })
      : client.tbl_discount_cobones_employees.create({ data: { emp_id_fk: input.employeeId, code_id_fk: input.codeId, ...data } });
  }

  async assignManyToEmployee(input: { employeeId: number; assignments: Array<{ codeId: number; count: number }> }, publisher: number) {
    const uniqueCodeIds = new Set(input.assignments.map((row) => row.codeId));
    if (uniqueCodeIds.size !== input.assignments.length) throw new BadRequestException('لا يمكن تكرار كود الخصم للكابتن نفسه');
    return this.prisma.$transaction(async (tx) => Promise.all(input.assignments.map((row) =>
      this.assignToEmployee({ employeeId: input.employeeId, codeId: row.codeId, count: row.count }, publisher, tx),
    )));
  }

  async replaceEmployeeAssignments(input: { employeeId: number; assignments: Array<{ codeId: number; count: number }> }, publisher: number) {
    const uniqueCodeIds = new Set(input.assignments.map((row) => row.codeId));
    if (uniqueCodeIds.size !== input.assignments.length) throw new BadRequestException('لا يمكن تكرار كود الخصم للكابتن نفسه');
    return this.prisma.$transaction(async (tx) => {
      await tx.tbl_discount_cobones_employees.deleteMany({ where: { emp_id_fk: input.employeeId } });
      return Promise.all(input.assignments.map((row) =>
        this.assignToEmployee({ employeeId: input.employeeId, codeId: row.codeId, count: row.count }, publisher, tx),
      ));
    });
  }

  async employeeAssignments(employeeId?: number, user?: JwtUser) {
    if (employeeId) await this.assertEmployeeVisible(user, employeeId);
    const visible = employeeId ? undefined : await this.employeeFilter(this.viewer(user));
    const rows = await this.prisma.tbl_discount_cobones_employees.findMany({
      where: employeeId ? { emp_id_fk: employeeId } : visible ? { emp_id_fk: { in: visible } } : undefined,
      orderBy: { id: 'desc' },
    });
    const codeIds = [...new Set(rows.map((row) => row.code_id_fk).filter((id): id is number => id != null))];
    const employeeIds = [...new Set(rows.map((row) => row.emp_id_fk).filter((id): id is number => id != null))];
    const period = grantPeriod();
    const [codes, employees, usedRows] = await Promise.all([
      codeIds.length ? this.prisma.tbl_discount_codes.findMany({ where: { id: { in: codeIds } } }) : [],
      employeeIds.length ? this.prisma.employees.findMany({ where: { id: { in: employeeIds } }, select: { id: true, employee: true } }) : [],
      employeeIds.length
        ? this.prisma.tbl_emps_members_dis_codes.groupBy({
            by: ['emp_id_fk', 'code_id_fk'],
            where: { emp_id_fk: { in: employeeIds }, year: period.year, month: period.month },
            _count: { _all: true },
          })
        : [],
    ]);
    const codeById = new Map(codes.map((code) => [code.id, code] as const));
    const employeeById = new Map(employees.map((employee) => [employee.id, employee.employee] as const));
    const usedByKey = new Map(usedRows.map((row) => [`${row.emp_id_fk}:${row.code_id_fk}`, row._count._all] as const));
    return rows.map((row) => {
      const usedThisMonth = usedByKey.get(`${row.emp_id_fk}:${row.code_id_fk}`) ?? 0;
      return {
        id: row.id,
        employeeId: row.emp_id_fk,
        employeeName: row.emp_id_fk ? employeeById.get(row.emp_id_fk) ?? null : null,
        codeId: row.code_id_fk,
        code: row.code_id_fk ? codeById.get(row.code_id_fk)?.title ?? null : null,
        percentage: row.code_id_fk ? toNum(codeById.get(row.code_id_fk)?.nesba) : 0,
        allowedCount: row.num,
        usedThisMonth,
        remainingThisMonth: Math.max(0, (row.num ?? 0) - usedThisMonth),
        assignedAt: row.date ? new Date(row.date * 1000).toISOString().slice(0, 10) : null,
      };
    });
  }

  async deleteEmployeeAssignments(employeeId: number) {
    const deleted = await this.prisma.tbl_discount_cobones_employees.deleteMany({ where: { emp_id_fk: employeeId } });
    if (!deleted.count) throw new NotFoundException('لا توجد أكواد مخصصة لهذا الموظف');
    return { employeeId, deleted: deleted.count };
  }

  async findMemberForDiscountGrant(term: string, user?: JwtUser) {
    const input = term.trim();
    if (!input) throw new BadRequestException('كود العضو أو رقم الموبايل مطلوب');
    const digits = input.replace(/\D/g, '');
    const phoneSearch = /^\d{8,}$/.test(digits);
    const scope = this.memberScope(user);
    const match: Prisma.club_membersWhereInput = phoneSearch
        ? { OR: [
          { phone: { contains: digits } },
          { phone: { contains: `0${digits}` } },
          { phone: { contains: `+2${digits}` } },
          { phone: { contains: `20${digits}` } },
        ] }
        : { member_code: input };
    const member = await this.prisma.club_members.findFirst({
      where: Object.keys(scope).length ? { AND: [scope, match] } : match,
      select: { id: true, name: true, member_code: true, phone: true },
    });
    if (!member) throw new NotFoundException('لا يوجد عضو مطابق لكود العضوية أو رقم الموبايل');
    return { id: member.id, name: member.name, memberCode: member.member_code, phone: member.phone };
  }

  async grantToMember(input: { employeeId: number; codeId: number; memberId: number; expiresOn?: string }, publisher: number, user?: JwtUser) {
    if (user) await this.assertMemberInScope(user, input.memberId);
    const [assignment, member] = await Promise.all([
      this.prisma.tbl_discount_cobones_employees.findFirst({ where: { emp_id_fk: input.employeeId, code_id_fk: input.codeId } }),
      this.prisma.club_members.findUnique({ where: { id: input.memberId }, select: { member_code: true } }),
    ]);
    if (!assignment) throw new BadRequestException('هذا الكود غير موزع على الموظف');
    if (!member) throw new NotFoundException('العضو غير موجود');
    const period = grantPeriod();
    const used = await this.prisma.tbl_emps_members_dis_codes.count({
      where: { emp_id_fk: input.employeeId, code_id_fk: input.codeId, year: period.year, month: period.month },
    });
    if (used >= assignment.num) throw new BadRequestException('تم استهلاك العدد المسموح به لهذا الموظف هذا الشهر، ويتجدد أول الشهر');
    const today = new Date().toISOString().slice(0, 10);
    const expiresOn = input.expiresOn ?? memberGrantExpiryOn();
    return this.prisma.tbl_emps_members_dis_codes.create({ data: {
      emp_id_fk: input.employeeId, member_code: member.member_code, mem_id_fk: input.memberId, code_id_fk: input.codeId,
      date: today, year: today.slice(0, 4), month: today.slice(5, 7), ended_date_ar: expiresOn, ended_date: expiresOn, approved: false, publisher,
    } });
  }

  async memberGrants(memberId?: number, user?: JwtUser) {
    // A member's own grants are visible to whoever may serve that member (e.g. reception applying
    // the code). Without a member, each employee sees only the grants they are allowed to see.
    if (memberId && user) await this.assertMemberInScope(user, memberId);
    const visible = memberId ? undefined : await this.employeeFilter(this.viewer(user));
    const rows = await this.prisma.tbl_emps_members_dis_codes.findMany({
      where: memberId ? { mem_id_fk: memberId } : visible ? { emp_id_fk: { in: visible } } : undefined,
      orderBy: { id: 'desc' },
    });
    const [codeIds, employeeIds, memberIds] = [
      [...new Set(rows.map((row) => row.code_id_fk).filter((id): id is number => id != null))],
      [...new Set(rows.map((row) => row.emp_id_fk).filter((id): id is number => id != null))],
      [...new Set(rows.map((row) => row.mem_id_fk).filter((id): id is number => id != null))],
    ];
    const [codes, employees, members] = await Promise.all([
      codeIds.length ? this.prisma.tbl_discount_codes.findMany({ where: { id: { in: codeIds } } }) : [],
      employeeIds.length ? this.prisma.employees.findMany({ where: { id: { in: employeeIds } }, select: { id: true, employee: true } }) : [],
      memberIds.length ? this.prisma.club_members.findMany({ where: { id: { in: memberIds } }, select: { id: true, name: true, member_code: true } }) : [],
    ]);
    const codeById = new Map(codes.map((code) => [code.id, code] as const));
    const employeeById = new Map(employees.map((employee) => [employee.id, employee.employee] as const));
    const memberById = new Map(members.map((member) => [member.id, member] as const));
    return rows.map((row) => ({
      id: row.id,
      employeeId: row.emp_id_fk,
      employeeName: row.emp_id_fk ? employeeById.get(row.emp_id_fk) ?? null : null,
      memberId: row.mem_id_fk,
      memberName: row.mem_id_fk ? memberById.get(row.mem_id_fk)?.name ?? null : null,
      memberCode: row.member_code ?? (row.mem_id_fk ? memberById.get(row.mem_id_fk)?.member_code ?? null : null),
      codeId: row.code_id_fk,
      code: row.code_id_fk ? codeById.get(row.code_id_fk)?.title ?? null : null,
      percentage: row.code_id_fk ? toNum(codeById.get(row.code_id_fk)?.nesba) : 0,
      expiresOn: row.ended_date,
      used: row.approved,
    }));
  }

  async memberGrantsByMemberCode(memberCode: string, user?: JwtUser) {
    const member = await this.prisma.club_members.findFirst({
      where: { member_code: memberCode.trim(), ...this.memberScope(user) },
      select: { id: true },
    });
    return member ? this.memberGrants(member.id, user) : [];
  }

  async usageReport(input: { fromDate: string; toDate: string; memberCode?: string }, user?: JwtUser) {
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    if (!datePattern.test(input.fromDate) || !datePattern.test(input.toDate) || input.fromDate > input.toDate) {
      throw new BadRequestException('نطاق التاريخ غير صالح');
    }
    const rows = await this.prisma.tbl_cobon_exhausted_history.findMany({
      where: {
        date: { gte: input.fromDate, lte: input.toDate },
        ...(input.memberCode?.trim() ? { member_code: input.memberCode.trim() } : {}),
      },
      orderBy: { id: 'desc' },
    });
    const memberIds = [...new Set(rows.map((row) => row.member_id).filter((id): id is number => id != null))];
    const codeIds = [...new Set(rows.map((row) => row.discount_code_id_fk).filter((id): id is number => id != null))];
    const subscriptionIds = [...new Set(rows.map((row) => row.sub_id_fk).filter((id): id is number => id != null))];
    const [members, codes, subscriptions] = await Promise.all([
      memberIds.length ? this.prisma.club_members.findMany({ where: { id: { in: memberIds }, ...this.memberScope(user) }, select: { id: true, name: true, phone: true } }) : [],
      codeIds.length ? this.prisma.tbl_discount_codes.findMany({ where: { id: { in: codeIds } }, select: { id: true, title: true } }) : [],
      subscriptionIds.length ? this.prisma.club_subscriptions.findMany({ where: { id: { in: subscriptionIds } }, select: { id: true, subscription_type: true } }) : [],
    ]);
    const memberById = new Map(members.map((row) => [row.id, row] as const));
    const codeById = new Map(codes.map((row) => [row.id, row.title] as const));
    const subscriptionById = new Map(subscriptions.map((row) => [row.id, row.subscription_type] as const));
    // Members outside the user's branches/section were not loaded above; drop their rows.
    const scoped = !user || isSystemAdmin(user) ? rows : rows.filter((row) => row.member_id != null && memberById.has(row.member_id));
    return scoped.map((row) => ({
      id: row.id,
      memberCode: row.member_code,
      memberName: row.member_id ? memberById.get(row.member_id)?.name ?? null : null,
      phone: row.member_id ? memberById.get(row.member_id)?.phone ?? null : null,
      subscriptionType: row.sub_id_fk ? subscriptionById.get(row.sub_id_fk) ?? null : null,
      code: row.discount_code_id_fk ? codeById.get(row.discount_code_id_fk) ?? null : null,
      percentage: toNum(row.discount_code_nesba),
      value: toNum(row.cobon_value),
      date: row.date,
      time: row.time,
    }));
  }

  async consumeMemberGrant(input: { grantId: number; memberId: number; memberCode: string | null; subscriptionId: number; subscriptionValue: number; publisher: number }, client: DiscountClient = this.prisma) {
    const grant = await client.tbl_emps_members_dis_codes.findFirst({ where: { id: input.grantId, mem_id_fk: input.memberId, approved: false } });
    if (!grant || !grant.code_id_fk || (grant.ended_date && grant.ended_date < new Date().toISOString().slice(0, 10))) throw new BadRequestException('كود الخصم غير صالح أو منتهٍ أو مستخدم');
    const code = await client.tbl_discount_codes.findUnique({ where: { id: grant.code_id_fk } });
    if (!code) throw new BadRequestException('كود الخصم غير موجود');
    const percentage = toNum(code.nesba);
    const value = roundMoney((input.subscriptionValue * percentage) / 100);
    const updated = await client.tbl_emps_members_dis_codes.updateMany({ where: { id: grant.id, approved: false }, data: { approved: true } });
    if (updated.count !== 1) throw new BadRequestException('تم استخدام كود الخصم بالفعل');
    await client.tbl_cobon_exhausted_history.create({ data: { member_id: input.memberId, member_code: input.memberCode, sub_id_fk: input.subscriptionId, discount_code_id_fk: code.id, discount_code_nesba: String(percentage), cobon_value: value, date: new Date().toISOString().slice(0, 10), publisher: input.publisher } });
    return { discountCodeId: code.id, discountPercentage: percentage, discountValue: value };
  }

  async resolveMemberGrant(grantId: number, memberId: number, subscriptionValue: number) {
    const grant = await this.prisma.tbl_emps_members_dis_codes.findFirst({ where: { id: grantId, mem_id_fk: memberId, approved: false } });
    if (!grant || !grant.code_id_fk || (grant.ended_date && grant.ended_date < new Date().toISOString().slice(0, 10))) throw new BadRequestException('كود الخصم غير صالح أو منتهٍ أو مستخدم');
    const code = await this.prisma.tbl_discount_codes.findUnique({ where: { id: grant.code_id_fk } });
    if (!code) throw new BadRequestException('كود الخصم غير موجود');
    const discountPercentage = toNum(code.nesba);
    return {
      discountEnabled: true,
      discountCodeId: code.id,
      discountPercentage,
      discountValue: roundMoney(subscriptionValue * discountPercentage / 100),
      // The captain who issued the grant owns the sale; the subscription is credited to them.
      employeeId: grant.emp_id_fk ?? null,
    };
  }

  async resolveDiscount(
    input: {
      subscriptionValue: number;
      discountCodeId?: number | null;
      discountEnabled?: boolean;
      discountValue?: number | null;
    },
    client: DiscountClient = this.prisma,
  ): Promise<ResolvedClubDiscount> {
    const subscriptionValue = roundMoney(input.subscriptionValue);
    if (!Number.isFinite(subscriptionValue) || subscriptionValue < 0) {
      throw new BadRequestException('قيمة الاشتراك غير صالحة');
    }

    if (input.discountCodeId != null) {
      const code = await client.tbl_discount_codes.findUnique({
        where: { id: input.discountCodeId },
      });
      if (!code) throw new BadRequestException('كود الخصم غير موجود');
      const percentage = toNum(code.nesba);
      const discountValue = roundMoney((subscriptionValue * percentage) / 100);
      return {
        discountEnabled: discountValue > 0,
        discountCodeId: code.id,
        discountPercentage: percentage,
        discountValue,
      };
    }

    if (!input.discountEnabled) {
      return {
        discountEnabled: false,
        discountCodeId: null,
        discountPercentage: null,
        discountValue: 0,
      };
    }

    const discountValue = roundMoney(Number(input.discountValue) || 0);
    if (discountValue < 0 || discountValue > subscriptionValue) {
      throw new BadRequestException('قيمة الخصم لا يمكن أن تتجاوز قيمة الاشتراك');
    }
    return {
      discountEnabled: discountValue > 0,
      discountCodeId: null,
      discountPercentage: null,
      discountValue,
    };
  }
}
