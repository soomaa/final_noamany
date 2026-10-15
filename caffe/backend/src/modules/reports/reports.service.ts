import { SuspendStatus } from '../../common/utils/suspend-status.util';
import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ListQueryDto } from '../../common/dto/list-query.dto';
import { paginated } from '../../common/dto/list-result';
import { PrismaService } from '../../common/prisma/prisma.service';
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
  constructor(private readonly prisma: PrismaService) {}

  async run(key: string, q: ListQueryDto) {
    if (!REPORT_KEYS.includes(key as ReportKey)) {
      throw new BadRequestException('تقرير غير معروف');
    }
    const handler = this.handlers[key as ReportKey].bind(this);
    return handler(q);
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

  private handlers: Record<ReportKey, (q: ListQueryDto) => Promise<ReturnType<typeof paginated>>> = {
    'employees-list': async (q) => {
      const rows = await this.prisma.employees.findMany({
        where: { OR: [{ leave_emp: null }, { leave_emp: 0 }] },
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

    'employees-data': async (q) => {
      const rows = await this.prisma.employees.findMany({
        where: { OR: [{ leave_emp: null }, { leave_emp: 0 }] },
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

    'employees-new': async (q) => {
      const rows = await this.prisma.employees.findMany({
        where: { OR: [{ leave_emp: null }, { leave_emp: 0 }] },
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

    'employees-expiring': async (q) => {
      const rows = await this.prisma.employees.findMany({
        where: { OR: [{ leave_emp: null }, { leave_emp: 0 }] },
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

    'employees-resigned': async (q) => {
      const rows = await this.prisma.employees.findMany({
        where: { OR: [{ leave_emp: 1 }, { employee_type: { not: 1 } }] },
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

    'attendance-daily': async (q) => {
      const date = q.date ?? q.dateFrom ?? todayIso();
      const matches = [date, String(Math.floor(new Date(date + 'T00:00:00').getTime() / 1000))];
      const rows = await this.prisma.tbl_hdoor_emps.findMany({
        where: { action_date_s: { in: matches } },
        orderBy: { hodoor_id: 'desc' },
        take: 1000,
      });
      const empCodes = [...new Set(rows.map((r) => r.member_code).filter(Boolean))] as number[];
      const emps = await this.prisma.employees.findMany({
        where: { emp_code: { in: empCodes } },
        select: { emp_code: true, employee: true },
      });
      const byCode = new Map(emps.map((e) => [e.emp_code, e.employee]));
      return this.paginateRows(
        rows.map((r) => ({
          id: r.hodoor_id,
          name: byCode.get(r.member_code ?? 0) ?? String(r.member_code ?? '—'),
          value: r.hdoor_time ?? '—',
          checkOut: r.ensraf_time,
          lateMin: r.late_min ?? 0,
        })),
        q,
      );
    },

    'attendance-absence': async (q) => {
      const date = q.date ?? q.dateFrom ?? todayIso();
      const matches = [date, String(Math.floor(new Date(date + 'T00:00:00').getTime() / 1000))];
      const present = await this.prisma.tbl_hdoor_emps.findMany({
        where: { action_date_s: { in: matches }, hdoor_time: { not: null } },
        select: { member_code: true },
      });
      const presentCodes = new Set(present.map((p) => p.member_code));
      const emps = await this.prisma.employees.findMany({
        where: { OR: [{ leave_emp: null }, { leave_emp: 0 }], emp_code: { not: null } },
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

    'attendance-late': async (q) => {
      const dateFilter: Prisma.tbl_hdoor_empsWhereInput = { late_min: { gt: 0 } };
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
      const empCodes = [...new Set(rows.map((r) => r.member_code).filter(Boolean))] as number[];
      const emps = await this.prisma.employees.findMany({
        where: { emp_code: { in: empCodes } },
        select: { emp_code: true, employee: true },
      });
      const byCode = new Map(emps.map((e) => [e.emp_code, e.employee]));
      return this.paginateRows(
        rows.map((r) => ({
          id: r.hodoor_id,
          name: byCode.get(r.member_code ?? 0) ?? String(r.member_code ?? '—'),
          value: Math.round(r.late_min ?? 0),
          date: r.action_date_s,
        })),
        q,
      );
    },

    'attendance-hours': async (q) => {
      const rows = await this.prisma.hr_mosayer_details.findMany({
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

    'attendance-overtime': async (q) => {
      const rows = await this.prisma.tbl_hdoor_emps.findMany({
        where: { num_min: { gt: 0 } },
        orderBy: { hodoor_id: 'desc' },
        take: 1000,
      });
      const empCodes = [...new Set(rows.map((r) => r.member_code).filter(Boolean))] as number[];
      const emps = await this.prisma.employees.findMany({
        where: { emp_code: { in: empCodes } },
        select: { emp_code: true, employee: true },
      });
      const byCode = new Map(emps.map((e) => [e.emp_code, e.employee]));
      return this.paginateRows(
        rows.map((r) => ({
          id: r.hodoor_id,
          name: byCode.get(r.member_code ?? 0) ?? String(r.member_code ?? '—'),
          value: Math.round(r.num_min ?? 0),
          date: r.action_date_s,
        })),
        q,
      );
    },

    'attendance-shift': async (q) => {
      const rows = await this.prisma.tbl_hdoor_emps.findMany({
        where: { sheft_type: { not: 0 } },
        orderBy: { hodoor_id: 'desc' },
        take: 1000,
      });
      const empCodes = [...new Set(rows.map((r) => r.member_code).filter(Boolean))] as number[];
      const emps = await this.prisma.employees.findMany({
        where: { emp_code: { in: empCodes } },
        select: { emp_code: true, employee: true },
      });
      const byCode = new Map(emps.map((e) => [e.emp_code, e.employee]));
      return this.paginateRows(
        rows.map((r) => ({
          id: r.hodoor_id,
          name: byCode.get(r.member_code ?? 0) ?? String(r.member_code ?? '—'),
          value: r.sheft_type,
          date: r.action_date_s,
        })),
        q,
      );
    },

    'payroll-sheet': async (q) => {
      const rows = await this.prisma.hr_mosayer_details.findMany({
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

    'payroll-deductions': async (q) => {
      const rows = await this.prisma.hr_mosayer_details.findMany({
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

    'payroll-incentives': async (q) => {
      const rows = await this.prisma.hr_mosayer_details.findMany({
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

    'payroll-allowances': async (q) => {
      const rows = await this.prisma.hr_mosayer_details.findMany({
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

    'payroll-commissions': async (q) => {
      const rows = await this.prisma.hr_mosayer_details.findMany({
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

    'payroll-taxes': async (q) => {
      const rows = await this.prisma.hr_mosayer_details.findMany({
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

    'payroll-insurance': async (q) => {
      const rows = await this.prisma.hr_mosayer_details.findMany({
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

    'leaves-balance': async (q) => {
      const contracts = await this.prisma.contract_employe.findMany({ take: 1000 });
      const emps = await this.prisma.employees.findMany({
        select: { id: true, emp_code: true, employee: true },
      });
      const byCode = new Map(emps.map((e) => [String(e.emp_code), e]));
      return this.paginateRows(
        contracts.map((c, i) => {
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

    'leaves-used': async (q) => {
      const rows = await this.prisma.hr_all_agzat_orders.findMany({
        where: { suspend: SuspendStatus.APPROVED },
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
      const emps = await this.prisma.employees.findMany({
        where: { id: { in: empIds } },
        select: { id: true, employee: true },
      });
      const byId = new Map(emps.map((e) => [e.id, e.employee]));
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

    'leaves-remaining': async (q) => {
      const contracts = await this.prisma.contract_employe.findMany({ take: 1000 });
      const usedRows = await this.prisma.hr_all_agzat_orders.groupBy({
        by: ['emp_id_fk'],
        where: { suspend: SuspendStatus.APPROVED },
        _sum: { num_days: true },
      });
      const usedByEmp = new Map(usedRows.map((u) => [u.emp_id_fk, u._sum.num_days ?? 0]));
      const emps = await this.prisma.employees.findMany({
        select: { id: true, emp_code: true, employee: true },
      });
      const byCode = new Map(emps.map((e) => [String(e.emp_code), e]));
      const rows: ReportRow[] = contracts.map((c, i) => {
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
