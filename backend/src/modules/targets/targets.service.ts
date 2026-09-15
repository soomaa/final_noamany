import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { JwtUser } from '../../common/types/jwt-user';
import {
  allocateCollectedCafeSale,
  summarizeCafeTargetLines,
} from './cafe-target-classification';
import type {
  TargetPeopleQueryDto,
  TargetReportQueryDto,
} from './dto/target-report-query.dto';

type ClientSnapshot = {
  id: number;
  member_code: string;
  name: string;
  phone: string | null;
};

type TargetReportRow = {
  id: string;
  clientId: number | null;
  clientName: string;
  clientCode: string | null;
  clientPhone: string | null;
  date: string;
  reference: string;
  description: string;
  amount: number;
  classification?: 'protein' | 'bar';
};

function money(value: Prisma.Decimal | number | string | null | undefined) {
  return Math.round(Number(value ?? 0) * 100) / 100;
}

@Injectable()
export class TargetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branchScope: BranchScopeService,
  ) {}

  private period(month: string) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      throw new BadRequestException('الشهر يجب أن يكون بالصيغة YYYY-MM');
    }
    const [year, monthNumber] = month.split('-').map(Number);
    const next = new Date(Date.UTC(year, monthNumber, 1));
    const end = new Date(next.getTime() - 86_400_000).toISOString().slice(0, 10);
    return { start: `${month}-01`, end };
  }

  private branchIds(query: TargetReportQueryDto, user: JwtUser) {
    return this.branchScope.resolveListFilter(user, query.branchId ?? null);
  }

  private gender(gender: 'male' | 'female' | undefined, user: JwtUser) {
    const required = this.branchScope.memberGenderFilter(user);
    if (required && gender && gender !== required) {
      throw new ForbiddenException('لا تملك صلاحية عرض هذا القسم');
    }
    return required ?? gender;
  }

  private async genderMemberIds(gender?: 'male' | 'female') {
    if (!gender) return null;
    const rows = await this.prisma.club_members.findMany({
      where: { gender },
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }

  private async memberMap(ids: Array<number | null | undefined>) {
    const memberIds = [...new Set(ids.filter((id): id is number => Number.isInteger(id)))];
    if (!memberIds.length) return new Map<number, ClientSnapshot>();
    const rows = await this.prisma.club_members.findMany({
      where: { id: { in: memberIds } },
      select: { id: true, member_code: true, name: true, phone: true },
    });
    return new Map(rows.map((row) => [row.id, row]));
  }

  private client(
    memberId: number | null | undefined,
    members: Map<number, ClientSnapshot>,
    fallbackName?: string | null,
    fallbackPhone?: string | null,
  ) {
    const member = memberId ? members.get(memberId) : undefined;
    return {
      clientId: member?.id ?? memberId ?? null,
      clientName: member?.name ?? fallbackName?.trim() ?? 'عميل نقدي',
      clientCode: member?.member_code ?? null,
      clientPhone: member?.phone ?? fallbackPhone ?? null,
    };
  }

  private response(query: TargetReportQueryDto, rows: TargetReportRow[]) {
    const page = Math.max(1, Number(query.page ?? 1));
    const pageSize = Math.max(1, Math.min(100, Number(query.pageSize ?? 25)));
    const start = (page - 1) * pageSize;
    const data = rows.slice(start, start + pageSize);
    return {
      data,
      total: rows.length,
      page,
      pageSize,
      summary: {
        count: rows.length,
        totalAmount: money(rows.reduce((sum, row) => sum + row.amount, 0)),
        targetAmount: money(rows.reduce((sum, row) => sum + row.amount, 0)),
      },
    };
  }

  async report(query: TargetReportQueryDto, user: JwtUser) {
    switch (query.tab) {
      case 'subscriptions':
        return this.subscriptions(query, user);
      case 'private':
        return this.privateTraining(query, user);
      case 'sales':
        return this.sales(query, user);
      case 'sessions':
        return this.sessions(query, user);
      default:
        throw new BadRequestException('تبويب تقرير التارجت غير معروف');
    }
  }

  async people(query: TargetPeopleQueryDto, user: JwtUser) {
    const branches = this.branchScope.resolveListFilter(user, query.branchId ?? null);
    const gender = this.gender(query.gender, user);
    const rows = await this.prisma.employees.findMany({
      where: {
        ...(branches !== null ? { branch_id_fk: { in: branches } } : {}),
        ...(gender ? { emp_type: gender === 'male' ? 1 : 2 } : {}),
        OR: [{ leave_emp: null }, { leave_emp: 0 }],
      },
      select: { id: true, employee: true, emp_code: true, branch_id_fk: true },
      orderBy: { employee: 'asc' },
    });
    return rows.map((row) => ({
      id: row.id,
      name: row.employee?.trim() || `موظف #${row.id}`,
      code: row.emp_code,
      branchId: row.branch_id_fk,
    }));
  }

  private async subscriptions(query: TargetReportQueryDto, user: JwtUser) {
    const { start, end } = this.period(query.month);
    const branches = this.branchIds(query, user);
    const gender = this.gender(query.gender, user);
    const receipts = await this.prisma.club_receipts.findMany({
      where: {
        receipt_date: { gte: start, lte: end },
        status: { in: ['مدفوعة', 'paid'] },
        subscription: {
          is: {
            is_special: false,
            ...(query.personId ? { employee_id: query.personId } : {}),
            ...(gender ? { gender } : {}),
            ...(branches !== null ? { branch_id: { in: branches } } : {}),
            type: { is: { is_part_of_target: true } },
          },
        },
      },
      select: {
        id: true,
        receipt_number: true,
        receipt_date: true,
        amount: true,
        member_id: true,
        member_name: true,
        member: { select: { id: true, member_code: true, name: true, phone: true } },
        subscription: { select: { member_id: true, customer_name: true, subscription_type: true } },
      },
      orderBy: [{ receipt_date: 'desc' }, { id: 'desc' }],
    });
    const members = new Map(
      receipts.flatMap((row) => row.member ? [[row.member.id, row.member] as const] : []),
    );
    return this.response(query, receipts.map((row) => ({
      id: `subscription:${row.id}`,
      ...this.client(row.member_id ?? row.subscription?.member_id, members, row.member_name || row.subscription?.customer_name),
      date: row.receipt_date,
      reference: row.receipt_number,
      description: row.subscription?.subscription_type ?? 'اشتراك',
      amount: money(row.amount),
    })));
  }

  private async privateTraining(query: TargetReportQueryDto, user: JwtUser) {
    const { start, end } = this.period(query.month);
    const branches = this.branchIds(query, user);
    const gender = this.gender(query.gender, user);
    const rows = await this.prisma.club_private_attendance_commissions.findMany({
      where: {
        attendance_date: { gte: start, lte: end },
        ...(query.personId ? { trainer: { employee_id: query.personId } } : {}),
        subscription: {
          ...(gender ? { gender } : {}),
          ...(branches !== null ? { branch_id: { in: branches } } : {}),
        },
      },
      select: {
        id: true,
        attendance_date: true,
        revenue_base: true,
        subscription: { select: { id: true, member_id: true, customer_name: true, subscription_number: true } },
      },
      orderBy: [{ attendance_date: 'desc' }, { id: 'desc' }],
    });
    const members = await this.memberMap(rows.map((row) => row.subscription.member_id));
    return this.response(query, rows.map((row) => ({
      id: `private:${row.id}`,
      ...this.client(row.subscription.member_id, members, row.subscription.customer_name),
      date: row.attendance_date,
      reference: row.subscription.subscription_number,
      description: 'جلسة برايفت',
      amount: money(row.revenue_base),
    })));
  }

  private async sales(query: TargetReportQueryDto, user: JwtUser) {
    const { start, end } = this.period(query.month);
    const branches = this.branchIds(query, user);
    const genderMemberIds = await this.genderMemberIds(this.gender(query.gender, user));
    const raw = await this.prisma.sales_quick_sale_items.findMany({
      where: {
        sale: {
          status: 'completed',
          business_date: { gte: start, lte: end },
          ...(branches !== null ? { branch_id: { in: branches } } : {}),
          ...(query.personId ? { target_employee_id: query.personId } : {}),
          ...(genderMemberIds !== null ? { customer_member_id: { in: genderMemberIds } } : {}),
        },
      },
      select: {
        id: true,
        name: true,
        business_classification: true,
        line_total: true,
        unit_price: true,
        quantity: true,
        free_quantity: true,
        sale: { select: {
          id: true,
          sale_number: true,
          business_date: true,
          sale_date: true,
          branch_id: true,
          target_employee_id: true,
          customer_member_id: true,
          customer_name: true,
          customer_phone: true,
          collected_amount: true,
        } },
      },
      orderBy: { id: 'desc' },
    });
    // Every monetary line participates in the allocation denominator so a mixed café/inventory
    // receipt cannot assign the whole collected amount to its Protein/Bar subset.
    const bySale = new Map<number, typeof raw>();
    for (const line of raw) {
      const group = bySale.get(line.sale.id) ?? [];
      group.push(line);
      bySale.set(line.sale.id, group);
    }
    const allocatedAmountByLine = new Map<number, number>();
    for (const saleLines of bySale.values()) {
      const allocated = allocateCollectedCafeSale(saleLines.map((line) => ({
        id: line.id,
        classification: line.business_classification,
        grossAmount: money(line.line_total),
        paidAmount: money(line.unit_price) * Math.max(
          0,
          Number(line.quantity) - Number(line.free_quantity ?? 0),
        ),
      })), money(saleLines[0].sale.collected_amount));
      for (const line of allocated) allocatedAmountByLine.set(line.id, line.amount);
    }
    const lines = raw.filter((row) =>
      row.business_classification === 'protein' || row.business_classification === 'bar',
    );
    const members = await this.memberMap(lines.map((row) => row.sale.customer_member_id));
    const rows: TargetReportRow[] = lines.map((row) => ({
      id: `sale:${row.id}`,
      ...this.client(row.sale.customer_member_id, members, row.sale.customer_name, row.sale.customer_phone),
      date: row.sale.business_date ?? row.sale.sale_date,
      reference: row.sale.sale_number,
      description: row.name,
      amount: allocatedAmountByLine.get(row.id) ?? 0,
      classification: row.business_classification as 'protein' | 'bar',
    }));
    const cafe = summarizeCafeTargetLines(rows.map((row) => ({
      classification: row.classification!,
      amount: row.amount,
      name: row.description,
    })));
    const response = this.response(query, rows);
    return {
      ...response,
      summary: {
        count: rows.length,
        totalAmount: money(cafe.proteinAmount + cafe.barAmount),
        targetAmount: cafe.targetAmount,
        proteinAmount: cafe.proteinAmount,
        barAmount: cafe.barAmount,
      },
    };
  }

  private async sessions(query: TargetReportQueryDto, user: JwtUser) {
    const { start, end } = this.period(query.month);
    const branches = this.branchIds(query, user);
    const genderMemberIds = await this.genderMemberIds(this.gender(query.gender, user));
    const rows = await this.prisma.club_class_enrollments.findMany({
      where: {
        attendance_status: 'attended',
        ...(genderMemberIds !== null ? { member_id: { in: genderMemberIds } } : {}),
        class: {
          class_date: { gte: start, lte: end },
          is_deleted: false,
          ...(branches !== null ? { branch_id: { in: branches } } : {}),
          ...(query.personId ? { trainer: { employee_id: query.personId } } : {}),
        },
      },
      select: {
        id: true,
        member_id: true,
        class: { select: { id: true, class_name: true, class_date: true, price: true } },
      },
      orderBy: { id: 'desc' },
    });
    const members = await this.memberMap(rows.map((row) => row.member_id));
    return this.response(query, rows.map((row) => ({
      id: `session:${row.id}`,
      ...this.client(row.member_id, members),
      date: row.class.class_date,
      reference: `CLASS-${row.class.id}`,
      description: row.class.class_name,
      amount: money(row.class.price),
    })));
  }
}
