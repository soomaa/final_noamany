import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
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

export interface ResolvedClubDiscount {
  discountEnabled: boolean;
  discountCodeId: number | null;
  discountPercentage: number | null;
  discountValue: number;
}

@Injectable()
export class ClubDiscountCodesService {
  constructor(private readonly prisma: PrismaService) {}

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

  async employeeAssignments(employeeId?: number) {
    const rows = await this.prisma.tbl_discount_cobones_employees.findMany({
      where: employeeId ? { emp_id_fk: employeeId } : undefined,
      orderBy: { id: 'desc' },
    });
    const codeIds = [...new Set(rows.map((row) => row.code_id_fk).filter((id): id is number => id != null))];
    const employeeIds = [...new Set(rows.map((row) => row.emp_id_fk).filter((id): id is number => id != null))];
    const [codes, employees] = await Promise.all([
      codeIds.length ? this.prisma.tbl_discount_codes.findMany({ where: { id: { in: codeIds } } }) : [],
      employeeIds.length ? this.prisma.employees.findMany({ where: { id: { in: employeeIds } }, select: { id: true, employee: true } }) : [],
    ]);
    const codeById = new Map(codes.map((code) => [code.id, code] as const));
    const employeeById = new Map(employees.map((employee) => [employee.id, employee.employee] as const));
    return rows.map((row) => ({
      id: row.id,
      employeeId: row.emp_id_fk,
      employeeName: row.emp_id_fk ? employeeById.get(row.emp_id_fk) ?? null : null,
      codeId: row.code_id_fk,
      code: row.code_id_fk ? codeById.get(row.code_id_fk)?.title ?? null : null,
      percentage: row.code_id_fk ? toNum(codeById.get(row.code_id_fk)?.nesba) : 0,
      allowedCount: row.num,
      assignedAt: row.date ? new Date(row.date * 1000).toISOString().slice(0, 10) : null,
    }));
  }

  async deleteEmployeeAssignments(employeeId: number) {
    const deleted = await this.prisma.tbl_discount_cobones_employees.deleteMany({ where: { emp_id_fk: employeeId } });
    if (!deleted.count) throw new NotFoundException('لا توجد أكواد مخصصة لهذا الموظف');
    return { employeeId, deleted: deleted.count };
  }

  async findMemberForDiscountGrant(term: string) {
    const input = term.trim();
    if (!input) throw new BadRequestException('كود العضو أو رقم الموبايل مطلوب');
    const digits = input.replace(/\D/g, '');
    const phoneSearch = /^\d{8,}$/.test(digits);
    const member = await this.prisma.club_members.findFirst({
      where: phoneSearch
        ? { OR: [
          { phone: { contains: digits } },
          { phone: { contains: `0${digits}` } },
          { phone: { contains: `+2${digits}` } },
          { phone: { contains: `20${digits}` } },
        ] }
        : { member_code: input },
      select: { id: true, name: true, member_code: true, phone: true },
    });
    if (!member) throw new NotFoundException('لا يوجد عضو مطابق لكود العضوية أو رقم الموبايل');
    return { id: member.id, name: member.name, memberCode: member.member_code, phone: member.phone };
  }

  async grantToMember(input: { employeeId: number; codeId: number; memberId: number; expiresOn?: string }, publisher: number) {
    const [assignment, member] = await Promise.all([
      this.prisma.tbl_discount_cobones_employees.findFirst({ where: { emp_id_fk: input.employeeId, code_id_fk: input.codeId } }),
      this.prisma.club_members.findUnique({ where: { id: input.memberId }, select: { member_code: true } }),
    ]);
    if (!assignment) throw new BadRequestException('هذا الكود غير موزع على الموظف');
    if (!member) throw new NotFoundException('العضو غير موجود');
    const used = await this.prisma.tbl_emps_members_dis_codes.count({ where: { emp_id_fk: input.employeeId, code_id_fk: input.codeId } });
    if (used >= assignment.num) throw new BadRequestException('تم استهلاك العدد المسموح به لهذا الموظف');
    const today = new Date().toISOString().slice(0, 10);
    const expiresOn = input.expiresOn ?? memberGrantExpiryOn();
    return this.prisma.tbl_emps_members_dis_codes.create({ data: {
      emp_id_fk: input.employeeId, member_code: member.member_code, mem_id_fk: input.memberId, code_id_fk: input.codeId,
      date: today, year: today.slice(0, 4), month: today.slice(5, 7), ended_date_ar: expiresOn, ended_date: expiresOn, approved: false, publisher,
    } });
  }

  async memberGrants(memberId?: number) {
    const rows = await this.prisma.tbl_emps_members_dis_codes.findMany({
      where: memberId ? { mem_id_fk: memberId } : undefined,
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

  async memberGrantsByMemberCode(memberCode: string) {
    const member = await this.prisma.club_members.findUnique({
      where: { member_code: memberCode.trim() },
      select: { id: true },
    });
    return member ? this.memberGrants(member.id) : [];
  }

  async usageReport(input: { fromDate: string; toDate: string; memberCode?: string }) {
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
      memberIds.length ? this.prisma.club_members.findMany({ where: { id: { in: memberIds } }, select: { id: true, name: true, phone: true } }) : [],
      codeIds.length ? this.prisma.tbl_discount_codes.findMany({ where: { id: { in: codeIds } }, select: { id: true, title: true } }) : [],
      subscriptionIds.length ? this.prisma.club_subscriptions.findMany({ where: { id: { in: subscriptionIds } }, select: { id: true, subscription_type: true } }) : [],
    ]);
    const memberById = new Map(members.map((row) => [row.id, row] as const));
    const codeById = new Map(codes.map((row) => [row.id, row.title] as const));
    const subscriptionById = new Map(subscriptions.map((row) => [row.id, row.subscription_type] as const));
    return rows.map((row) => ({
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
    return { discountEnabled: true, discountCodeId: code.id, discountPercentage, discountValue: roundMoney(subscriptionValue * discountPercentage / 100) };
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
