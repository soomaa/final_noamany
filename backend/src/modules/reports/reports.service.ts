import { SuspendStatus } from '../../common/utils/suspend-status.util';
import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ListQueryDto } from '../../common/dto/list-query.dto';
import { paginated } from '../../common/dto/list-result';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtUser } from '../../common/types/jwt-user';
import { diffDaysFromToday, parseLegacyDate, todayIso, toIsoDate } from '../../common/utils/legacy-date.util';

const REPORT_KEYS = [
  'employees-list',
  'employees-data',
  'employees-new',
  'employees-expiring',
  'employees-resigned',
  'attendance-daily',
  'attendance-absence',
  'attendance-late',
  'attendance-hours',
  'attendance-overtime',
  'attendance-shift',
  'payroll-sheet',
  'payroll-deductions',
  'payroll-incentives',
  'payroll-allowances',
  'payroll-commissions',
  'payroll-taxes',
  'payroll-insurance',
  'leaves-balance',
  'leaves-used',
  'leaves-remaining',
] as const;

type ReportKey = (typeof REPORT_KEYS)[number];

interface ReportRow {
  id: number;
  name: string;
  value: string | number;
  [key: string]: unknown;
}

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branchScope: BranchScopeService,
  ) {}

  async run(key: string, q: ListQueryDto, user: JwtUser) {
    if (!REPORT_KEYS.includes(key as ReportKey)) {
      throw new BadRequestException('تقرير غير معروف');
    }
    const handler = this.handlers[key as ReportKey].bind(this);
    return handler(q, user);
  }

  /** The department is an authorization constraint derived from the JWT, never the URL. */
  private employeeScope(q: ListQueryDto, user: JwtUser): Prisma.employeesWhereInput {
    const branches = this.branchScope.resolveListFilter(user, q.branchId);
    const requiredGender = this.branchScope.memberGenderFilter(user);
    const gender = requiredGender ?? q.gender;
    return {
      ...(branches !== null ? { branch_id_fk: { in: branches } } : {}),
      ...(gender ? { emp_type: gender === 'male' ? 1 : 2 } : {}),
    };
  }

  private activeEmployeeScope(q: ListQueryDto, user: JwtUser): Prisma.employeesWhereInput {
    return {
      AND: [
        this.employeeScope(q, user),
        { OR: [{ leave_emp: null }, { leave_emp: 0 }] },
      ],
    };
  }

  private async payrollEmployeeScope(q: ListQueryDto, user: JwtUser): Promise<Prisma.hr_mosayer_detailsWhereInput> {
    const employees = await this.prisma.employees.findMany({
      where: this.employeeScope(q, user),
      select: { id: true, emp_code: true },
    });
    // `hr_mosayer_details` has no Prisma relation to employees. A code-only
    // legacy row is attributable only when its employee code is globally
    // unique; duplicate codes must fail closed instead of leaking a row.
    const knownEmployees = await this.prisma.employees.findMany({
      select: { id: true, emp_code: true },
    });
    const legacyCodes = employees.flatMap((employee) => {
      if (employee.emp_code == null) return [];
      return knownEmployees.filter((known) => known.emp_code === employee.emp_code).length === 1
        ? [employee.emp_code]
        : [];
    });
    return {
      OR: [
        { emp_id: { in: employees.map((employee) => employee.id) } },
        {
          // emp_code is a legacy fallback only. An explicit employee id is
          // authoritative, so a reused code must never override it.
          AND: [
            { OR: [{ emp_id: null }, { emp_id: { notIn: knownEmployees.map((employee) => employee.id) } }] },
            { emp_code: { in: legacyCodes } },
          ],
        },
      ],
    };
  }

  private paginateRows(rows: ReportRow[], q: ListQueryDto) {
    let filtered = rows;
    if (q.search?.trim()) {
      const s = q.search.trim().toLowerCase();
      filtered = rows.filter(
        (r) =>
          String(r.name ?? '').toLowerCase().includes(s) ||
          String(r.value ?? '').toLowerCase().includes(s),
      );
    }
    const total = filtered.length;
    const data = filtered.slice(q.skip, q.skip + q.take);
    return paginated(data, total, q.page, q.pageSize);
  }

  private dec(v: Prisma.Decimal | number | null | undefined): number {
    if (v == null) return 0;
    return Number(v);
  }

  private handlers: Record<ReportKey, (q: ListQueryDto, user: JwtUser) => Promise<ReturnType<typeof paginated>>> = {
    'employees-list': async (q, user) => {
      const rows = await this.prisma.employees.findMany({
        where: this.activeEmployeeScope(q, user),
        select: { id: true, employee: true, emp_code: true, edara_n: true },
        orderBy: { id: 'desc' },
      });
      return this.paginateRows(
        rows.map((e) => ({
          id: e.id,
          name: e.employee ?? '—',
          value: e.emp_code ?? '—',
          department: e.edara_n,
        })),
        q,
      );
    },

    'employees-data': async (q, user) => {
      const rows = await this.prisma.employees.findMany({
        where: this.activeEmployeeScope(q, user),
        select: {
          id: true,
          employee: true,
          phone: true,
          edara_n: true,
          mosma_wazefy_n: true,
          basic_salary: true,
        },
        orderBy: { id: 'desc' },
      });
      return this.paginateRows(
        rows.map((e) => ({
          id: e.id,
          name: e.employee ?? '—',
          value: e.phone ?? '—',
          jobTitle: e.mosma_wazefy_n,
          department: e.edara_n,
          salary: e.basic_salary?.toString() ?? '—',
        })),
        q,
      );
    },

    'employees-new': async (q, user) => {
      const rows = await this.prisma.employees.findMany({
        where: this.activeEmployeeScope(q, user),
        select: { id: true, employee: true, start_work_date_m: true, date: true },
        orderBy: { id: 'desc' },
        take: 500,
      });
      const recent = rows.filter((e) => {
        const d = parseLegacyDate(e.start_work_date_m ?? e.date);
        if (!d) return false;
        const days = -diffDaysFromToday(d.toISOString().slice(0, 10))!;
        return days <= 90;
      });
      return this.paginateRows(
        recent.map((e) => ({
          id: e.id,
          name: e.employee ?? '—',
          value: toIsoDate(e.start_work_date_m ?? e.date) ?? '—',
        })),
        q,
      );
    },

    'employees-expiring': async (q, user) => {
      const rows = await this.prisma.employees.findMany({
        where: this.activeEmployeeScope(q, user),
        select: { id: true, employee: true, end_contract_date_m: true },
        orderBy: { id: 'desc' },
      });
      const expiring = rows.filter((e) => {
        const days = diffDaysFromToday(e.end_contract_date_m);
        return days != null && days >= 0 && days <= 90;
      });
      return this.paginateRows(
        expiring.map((e) => ({
          id: e.id,
          name: e.employee ?? '—',
          value: toIsoDate(e.end_contract_date_m) ?? '—',
          daysLeft: diffDaysFromToday(e.end_contract_date_m),
        })),
        q,
      );
    },

    'employees-resigned': async (q, user) => {
      const rows = await this.prisma.employees.findMany({
        where: { AND: [this.employeeScope(q, user), { OR: [{ leave_emp: 1 }, { employee_type: { not: 1 } }] }] },
        select: { id: true, employee: true, end_service_date_m: true, reason: true },
        orderBy: { id: 'desc' },
      });
      return this.paginateRows(
        rows.map((e) => ({
          id: e.id,
          name: e.employee ?? '—',
          value: toIsoDate(e.end_service_date_m) ?? '—',
          reason: e.reason,
        })),
        q,
      );
    },

    'attendance-daily': async (q, user) => {
      const date = q.date ?? q.dateFrom ?? todayIso();
      const matches = [date, String(Math.floor(new Date(date + 'T00:00:00').getTime() / 1000))];
      const branches = this.branchScope.resolveListFilter(user, q.branchId);
      const emps = await this.prisma.employees.findMany({
        where: this.employeeScope(q, user),
        select: { emp_code: true, employee: true },
      });
      const scopedCodes = emps.flatMap((employee) => employee.emp_code == null ? [] : [employee.emp_code]);
      const rows = await this.prisma.tbl_hdoor_emps.findMany({
        where: { action_date_s: { in: matches }, member_code: { in: scopedCodes }, ...(branches !== null ? { branch_id_fk: { in: branches } } : {}) },
        orderBy: { hodoor_id: 'desc' },
        take: 1000,
      });
      const byCode = new Map(emps.map((e) => [e.emp_code, e.employee]));
      return this.paginateRows(
        rows.filter((r) => byCode.has(r.member_code ?? 0)).map((r) => ({
          id: r.hodoor_id,
          name: byCode.get(r.member_code ?? 0) ?? String(r.member_code ?? '—'),
          value: r.hdoor_time ?? '—',
          checkOut: r.ensraf_time,
          lateMin: r.late_min ?? 0,
        })),
        q,
      );
    },

    'attendance-absence': async (q, user) => {
      const date = q.date ?? q.dateFrom ?? todayIso();
      const matches = [date, String(Math.floor(new Date(date + 'T00:00:00').getTime() / 1000))];
      const present = await this.prisma.tbl_hdoor_emps.findMany({
        where: { action_date_s: { in: matches }, hdoor_time: { not: null } },
        select: { member_code: true },
      });
      const presentCodes = new Set(present.map((p) => p.member_code));
      const emps = await this.prisma.employees.findMany({
        where: { AND: [this.activeEmployeeScope(q, user), { emp_code: { not: null } }] },
        select: { id: true, employee: true, emp_code: true, edara_n: true },
      });
      const absent = emps.filter((e) => e.emp_code != null && !presentCodes.has(e.emp_code));
      return this.paginateRows(
        absent.map((e) => ({
          id: e.id,
          name: e.employee ?? '—',
          value: e.emp_code ?? '—',
          department: e.edara_n,
          date,
        })),
        q,
      );
    },

    'attendance-late': async (q, user) => {
      const dateFilter: Prisma.tbl_hdoor_empsWhereInput = { late_min: { gt: 0 } };
      const branches = this.branchScope.resolveListFilter(user, q.branchId);
      const emps = await this.prisma.employees.findMany({
        where: this.employeeScope(q, user),
        select: { emp_code: true, employee: true },
      });
      dateFilter.member_code = { in: emps.flatMap((employee) => employee.emp_code == null ? [] : [employee.emp_code]) };
      if (branches !== null) dateFilter.branch_id_fk = { in: branches };
      if (q.dateFrom || q.dateTo) {
        const from = q.dateFrom ?? '1970-01-01';
        const to = q.dateTo ?? todayIso();
        dateFilter.action_date_s = { gte: from, lte: to };
      }
      const rows = await this.prisma.tbl_hdoor_emps.findMany({
        where: dateFilter,
        orderBy: { hodoor_id: 'desc' },
        take: 1000,
      });
      const byCode = new Map(emps.map((e) => [e.emp_code, e.employee]));
      return this.paginateRows(
        rows.filter((r) => byCode.has(r.member_code ?? 0)).map((r) => ({
          id: r.hodoor_id,
          name: byCode.get(r.member_code ?? 0) ?? String(r.member_code ?? '—'),
          value: Math.round(r.late_min ?? 0),
          date: r.action_date_s,
        })),
        q,
      );
    },

    'attendance-hours': async (q, user) => {
      const rows = await this.prisma.hr_mosayer_details.findMany({
        where: await this.payrollEmployeeScope(q, user),
        select: { id: true, emp_name: true, sa3at_amal: true, ayam_amal: true },
        orderBy: { id: 'desc' },
        take: 1000,
      });
      return this.paginateRows(
        rows.map((r) => ({
          id: r.id,
          name: r.emp_name ?? '—',
          value: r.sa3at_amal ?? 0,
          workDays: r.ayam_amal ?? 0,
        })),
        q,
      );
    },

    'attendance-overtime': async (q, user) => {
      const branches = this.branchScope.resolveListFilter(user, q.branchId);
      const emps = await this.prisma.employees.findMany({
        where: this.employeeScope(q, user),
        select: { emp_code: true, employee: true },
      });
      const scopedCodes = emps.flatMap((employee) => employee.emp_code == null ? [] : [employee.emp_code]);
      const rows = await this.prisma.tbl_hdoor_emps.findMany({
        where: { num_min: { gt: 0 }, member_code: { in: scopedCodes }, ...(branches !== null ? { branch_id_fk: { in: branches } } : {}) },
        orderBy: { hodoor_id: 'desc' },
        take: 1000,
      });
      const byCode = new Map(emps.map((e) => [e.emp_code, e.employee]));
      return this.paginateRows(
        rows.filter((r) => byCode.has(r.member_code ?? 0)).map((r) => ({
          id: r.hodoor_id,
          name: byCode.get(r.member_code ?? 0) ?? String(r.member_code ?? '—'),
          value: Math.round(r.num_min ?? 0),
          date: r.action_date_s,
        })),
        q,
      );
    },

    'attendance-shift': async (q, user) => {
      const branches = this.branchScope.resolveListFilter(user, q.branchId);
      const emps = await this.prisma.employees.findMany({
        where: this.employeeScope(q, user),
        select: { emp_code: true, employee: true },
      });
      const scopedCodes = emps.flatMap((employee) => employee.emp_code == null ? [] : [employee.emp_code]);
      const rows = await this.prisma.tbl_hdoor_emps.findMany({
        where: { sheft_type: { not: 0 }, member_code: { in: scopedCodes }, ...(branches !== null ? { branch_id_fk: { in: branches } } : {}) },
        orderBy: { hodoor_id: 'desc' },
        take: 1000,
      });
      const byCode = new Map(emps.map((e) => [e.emp_code, e.employee]));
      return this.paginateRows(
        rows.filter((r) => byCode.has(r.member_code ?? 0)).map((r) => ({
          id: r.hodoor_id,
          name: byCode.get(r.member_code ?? 0) ?? String(r.member_code ?? '—'),
          value: r.sheft_type,
          date: r.action_date_s,
        })),
        q,
      );
    },

    'payroll-sheet': async (q, user) => {
      const rows = await this.prisma.hr_mosayer_details.findMany({
        where: await this.payrollEmployeeScope(q, user),
        select: { id: true, emp_name: true, rateb_asasy: true, safi: true },
        orderBy: { id: 'desc' },
        take: 1000,
      });
      return this.paginateRows(
        rows.map((r) => ({
          id: r.id,
          name: r.emp_name ?? '—',
          value: this.dec(r.safi),
          basicSalary: this.dec(r.rateb_asasy),
        })),
        q,
      );
    },

    'payroll-deductions': async (q, user) => {
      const rows = await this.prisma.hr_mosayer_details.findMany({
        where: await this.payrollEmployeeScope(q, user),
        select: {
          id: true,
          emp_name: true,
          total_khsomat: true,
          khasm_gezaa: true,
          khasm_takher: true,
          khasm_solaf: true,
        },
        orderBy: { id: 'desc' },
        take: 1000,
      });
      return this.paginateRows(
        rows.map((r) => ({
          id: r.id,
          name: r.emp_name ?? '—',
          value: this.dec(r.total_khsomat),
          penalties: this.dec(r.khasm_gezaa),
          late: this.dec(r.khasm_takher),
          advances: this.dec(r.khasm_solaf),
        })),
        q,
      );
    },

    'payroll-incentives': async (q, user) => {
      const rows = await this.prisma.hr_mosayer_details.findMany({
        where: await this.payrollEmployeeScope(q, user),
        select: { id: true, emp_name: true, tot_mokafaa: true },
        orderBy: { id: 'desc' },
        take: 1000,
      });
      return this.paginateRows(
        rows.map((r) => ({
          id: r.id,
          name: r.emp_name ?? '—',
          value: this.dec(r.tot_mokafaa),
        })),
        q,
      );
    },

    'payroll-allowances': async (q, user) => {
      const rows = await this.prisma.hr_mosayer_details.findMany({
        where: await this.payrollEmployeeScope(q, user),
        select: {
          id: true,
          emp_name: true,
          badal_sakn: true,
          badal_mowaslat: true,
          badal_etsal: true,
          badal_e3asha: true,
        },
        orderBy: { id: 'desc' },
        take: 1000,
      });
      return this.paginateRows(
        rows.map((r) => ({
          id: r.id,
          name: r.emp_name ?? '—',
          value:
            this.dec(r.badal_sakn) +
            this.dec(r.badal_mowaslat) +
            this.dec(r.badal_etsal) +
            this.dec(r.badal_e3asha),
          housing: this.dec(r.badal_sakn),
          transport: this.dec(r.badal_mowaslat),
        })),
        q,
      );
    },

    'payroll-commissions': async (q, user) => {
      const rows = await this.prisma.hr_mosayer_details.findMany({
        where: await this.payrollEmployeeScope(q, user),
        select: { id: true, emp_name: true, tot_entdab: true },
        orderBy: { id: 'desc' },
        take: 1000,
      });
      return this.paginateRows(
        rows.map((r) => ({
          id: r.id,
          name: r.emp_name ?? '—',
          value: this.dec(r.tot_entdab),
        })),
        q,
      );
    },

    'payroll-taxes': async (q, user) => {
      const rows = await this.prisma.hr_mosayer_details.findMany({
        where: await this.payrollEmployeeScope(q, user),
        select: { id: true, emp_name: true, khasm_keyab: true, agaza_bdon_rateb: true },
        orderBy: { id: 'desc' },
        take: 1000,
      });
      return this.paginateRows(
        rows.map((r) => ({
          id: r.id,
          name: r.emp_name ?? '—',
          value: this.dec(r.khasm_keyab) + this.dec(r.agaza_bdon_rateb),
        })),
        q,
      );
    },

    'payroll-insurance': async (q, user) => {
      const rows = await this.prisma.hr_mosayer_details.findMany({
        where: await this.payrollEmployeeScope(q, user),
        select: { id: true, emp_name: true, khasm_tamen: true },
        orderBy: { id: 'desc' },
        take: 1000,
      });
      return this.paginateRows(
        rows.map((r) => ({
          id: r.id,
          name: r.emp_name ?? '—',
          value: this.dec(r.khasm_tamen),
        })),
        q,
      );
    },

    'leaves-balance': async (q, user) => {
      const emps = await this.prisma.employees.findMany({
        where: this.employeeScope(q, user),
        select: { id: true, emp_code: true, employee: true },
      });
      const contracts = await this.prisma.contract_employe.findMany({
        where: { emp_code: { in: emps.flatMap((employee) => employee.emp_code == null ? [] : [String(employee.emp_code)]) } },
        take: 1000,
      });
      const byCode = new Map(emps.map((e) => [String(e.emp_code), e]));
      return this.paginateRows(
        contracts.filter((contract) => byCode.has(contract.emp_code)).map((c, i) => {
          const emp = byCode.get(c.emp_code);
          const total =
            (parseFloat(c.year_vacation_num) || 0) + (c.vacation_previous_balance || 0);
          return {
            id: c.id ?? i + 1,
            name: emp?.employee ?? c.emp_code,
            value: total,
            empCode: c.emp_code,
          };
        }),
        q,
      );
    },

    'leaves-used': async (q, user) => {
      const emps = await this.prisma.employees.findMany({
        where: this.employeeScope(q, user),
        select: { id: true, employee: true },
      });
      const rows = await this.prisma.hr_all_agzat_orders.findMany({
        where: { suspend: SuspendStatus.APPROVED, emp_id_fk: { in: emps.map((employee) => employee.id) } },
        select: {
          id: true,
          emp_id_fk: true,
          num_days: true,
          agaza_from_date_m: true,
          agaza_to_date_m: true,
        },
        orderBy: { id: 'desc' },
        take: 1000,
      });
      const empIds = [...new Set(rows.map((r) => r.emp_id_fk).filter(Boolean))] as number[];
      const byId = new Map(emps.filter((employee) => empIds.includes(employee.id)).map((e) => [e.id, e.employee]));
      return this.paginateRows(
        rows.map((r) => ({
          id: r.id,
          name: byId.get(r.emp_id_fk ?? 0) ?? '—',
          value: r.num_days ?? 0,
          from: r.agaza_from_date_m,
          to: r.agaza_to_date_m,
        })),
        q,
      );
    },

    'leaves-remaining': async (q, user) => {
      const emps = await this.prisma.employees.findMany({
        where: this.employeeScope(q, user),
        select: { id: true, emp_code: true, employee: true },
      });
      const contracts = await this.prisma.contract_employe.findMany({
        where: { emp_code: { in: emps.flatMap((employee) => employee.emp_code == null ? [] : [String(employee.emp_code)]) } },
        take: 1000,
      });
      const usedRows = await this.prisma.hr_all_agzat_orders.groupBy({
        by: ['emp_id_fk'],
        where: { suspend: SuspendStatus.APPROVED, emp_id_fk: { in: emps.map((employee) => employee.id) } },
        _sum: { num_days: true },
      });
      const usedByEmp = new Map(usedRows.map((u) => [u.emp_id_fk, u._sum.num_days ?? 0]));
      const byCode = new Map(emps.map((e) => [String(e.emp_code), e]));
      const rows: ReportRow[] = contracts.filter((contract) => byCode.has(contract.emp_code)).map((c, i) => {
        const emp = byCode.get(c.emp_code);
        const total =
          (parseFloat(c.year_vacation_num) || 0) + (c.vacation_previous_balance || 0);
        const used = emp ? (usedByEmp.get(emp.id) ?? 0) : 0;
        return {
          id: c.id ?? i + 1,
          name: emp?.employee ?? c.emp_code,
          value: Math.max(0, total - used),
          total,
          used,
        };
      });
      return this.paginateRows(rows, q);
    },
  };
}
