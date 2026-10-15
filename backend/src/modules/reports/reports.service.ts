import { SuspendStatus } from '../../common/utils/suspend-status.util';
import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ListQueryDto } from '../../common/dto/list-query.dto';
import { paginated } from '../../common/dto/list-result';
import { PrismaService } from '../../common/prisma/prisma.service';
import { addDateOnlyDays, cairoDateString, dateOnlyEpochSeconds } from '../../common/utils/cairo-date';
import { toIsoDate } from '../../common/utils/legacy-date.util';
import { HrDataScopeService } from '../../common/hr-scope/hr-data-scope.service';
import { JwtUser } from '../../common/types/jwt-user';
import { PermissionEngineService } from '../rbac/engine/permission-engine.service';

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

interface ReportScope {
  employeeWhere: Prisma.employeesWhereInput;
  employeeIds: number[] | null;
  employeeCodes: number[] | null;
  canViewPayroll: boolean;
}

const PAYROLL_REPORTS = new Set<ReportKey>([
  'payroll-sheet',
  'payroll-deductions',
  'payroll-incentives',
  'payroll-allowances',
  'payroll-commissions',
  'payroll-taxes',
  'payroll-insurance',
]);

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hrScope: HrDataScopeService,
    private readonly permissions: PermissionEngineService,
  ) {}

  async run(key: string, q: ListQueryDto, user: JwtUser) {
    if (!REPORT_KEYS.includes(key as ReportKey)) {
      throw new BadRequestException('تقرير غير معروف');
    }
    const reportKey = key as ReportKey;
    const scope = await this.resolveScope(user);
    if (PAYROLL_REPORTS.has(reportKey) && !scope.canViewPayroll) {
      throw new ForbiddenException('لا تملك صلاحية عرض بيانات الرواتب');
    }
    const handler = this.handlers[reportKey].bind(this);
    return handler(q, scope);
  }

  private async resolveScope(user: JwtUser): Promise<ReportScope> {
    const employeeWhere = await this.hrScope.employeeWhere(user, 'reports.hub');
    const canViewPayroll = await this.permissions.canAny(user.sub, ['payroll.runs:view']);
    if (Object.keys(employeeWhere).length === 0) {
      return { employeeWhere, employeeIds: null, employeeCodes: null, canViewPayroll };
    }
    const employees = await this.prisma.employees.findMany({
      where: employeeWhere,
      select: { id: true, emp_code: true },
    });
    return {
      employeeWhere,
      employeeIds: employees.map((employee) => employee.id),
      employeeCodes: employees
        .map((employee) => employee.emp_code)
        .filter((code): code is number => code != null),
      canViewPayroll,
    };
  }

  private payrollWhere(scope: ReportScope): Prisma.hr_mosayer_detailsWhereInput | undefined {
    if (scope.employeeIds === null || scope.employeeCodes === null) return undefined;
    const or: Prisma.hr_mosayer_detailsWhereInput[] = [];
    if (scope.employeeIds.length) or.push({ emp_id: { in: scope.employeeIds } });
    if (scope.employeeCodes.length) or.push({ emp_code: { in: scope.employeeCodes } });
    return or.length ? { OR: or } : { id: -1 };
  }

  private attendanceScope(scope: ReportScope): Prisma.tbl_hdoor_empsWhereInput {
    if (scope.employeeCodes === null) return {};
    return scope.employeeCodes.length
      ? { employee_code: { in: scope.employeeCodes } }
      : { hodoor_id: -1 };
  }

  private leaveScope(scope: ReportScope): Prisma.hr_all_agzat_ordersWhereInput {
    if (scope.employeeIds === null) return {};
    return scope.employeeIds.length
      ? { emp_id_fk: { in: scope.employeeIds } }
      : { id: -1 };
  }

  private dec(v: Prisma.Decimal | number | null | undefined): number {
    if (v == null) return 0;
    return Number(v);
  }

  private employeeSearch(q: ListQueryDto): Prisma.employeesWhereInput | undefined {
    const search = q.search?.trim();
    if (!search) return undefined;
    const numeric = Number(search);
    return {
      OR: [
        { employee: { contains: search } },
        { phone: { contains: search } },
        { edara_n: { contains: search } },
        ...(Number.isFinite(numeric) ? [{ emp_code: numeric }] : []),
      ],
    };
  }

  private payrollReportWhere(
    scope: ReportScope,
    q: ListQueryDto,
    extra?: Prisma.hr_mosayer_detailsWhereInput,
  ): Prisma.hr_mosayer_detailsWhereInput {
    const and: Prisma.hr_mosayer_detailsWhereInput[] = [];
    const scoped = this.payrollWhere(scope);
    if (scoped) and.push(scoped);
    if (extra) and.push(extra);
    if (q.search?.trim()) and.push({ emp_name: { contains: q.search.trim() } });
    return and.length ? { AND: and } : {};
  }

  private async attendanceReportWhere(
    scope: ReportScope,
    q: ListQueryDto,
    extra: Prisma.tbl_hdoor_empsWhereInput,
  ): Promise<Prisma.tbl_hdoor_empsWhereInput> {
    const and: Prisma.tbl_hdoor_empsWhereInput[] = [extra, this.attendanceScope(scope)];
    const search = q.search?.trim();
    if (search) {
      const code = Number(search);
      const employees = await this.prisma.employees.findMany({
        where: {
          AND: [
            scope.employeeWhere,
            {
              OR: [
                { employee: { contains: search } },
                ...(Number.isFinite(code) ? [{ emp_code: code }] : []),
              ],
            },
          ],
        },
        select: { emp_code: true },
      });
      const codes = employees.map((employee) => employee.emp_code).filter((value): value is number => value != null);
      and.push(codes.length ? { employee_code: { in: codes } } : { hodoor_id: -1 });
    }
    return { AND: and };
  }

  private async attendanceNames(rows: Array<{ employee_code: number | null }>) {
    const empCodes = [...new Set(rows.map((row) => row.employee_code).filter((value): value is number => value != null))];
    const employees = empCodes.length
      ? await this.prisma.employees.findMany({
          where: { emp_code: { in: empCodes } },
          select: { emp_code: true, employee: true },
        })
      : [];
    return new Map(employees.map((employee) => [employee.emp_code, employee.employee]));
  }

  private async searchedEmployees(scope: ReportScope, q: ListQueryDto) {
    const search = q.search?.trim();
    if (!search) return null;
    const code = Number(search);
    return this.prisma.employees.findMany({
      where: {
        AND: [
          scope.employeeWhere,
          {
            OR: [
              { employee: { contains: search } },
              ...(Number.isFinite(code) ? [{ emp_code: code }] : []),
            ],
          },
        ],
      },
      select: { id: true, emp_code: true },
    });
  }

  private async contractReportWhere(scope: ReportScope, q: ListQueryDto): Promise<Prisma.contract_employeWhereInput> {
    const searched = await this.searchedEmployees(scope, q);
    const codes = searched
      ? searched.map((employee) => employee.emp_code).filter((value): value is number => value != null).map(String)
      : scope.employeeCodes?.map(String) ?? null;
    return codes === null ? {} : codes.length ? { emp_code: { in: codes } } : { id: -1 };
  }

  private async leaveOrderReportWhere(scope: ReportScope, q: ListQueryDto): Promise<Prisma.hr_all_agzat_ordersWhereInput> {
    const and: Prisma.hr_all_agzat_ordersWhereInput[] = [
      { suspend: SuspendStatus.APPROVED },
      this.leaveScope(scope),
    ];
    const searched = await this.searchedEmployees(scope, q);
    if (searched) {
      const ids = searched.map((employee) => employee.id);
      and.push(ids.length ? { emp_id_fk: { in: ids } } : { id: -1 });
    }
    return { AND: and };
  }

  private handlers: Record<ReportKey, (q: ListQueryDto, scope: ReportScope) => Promise<ReturnType<typeof paginated>>> = {
    'employees-list': async (q, scope) => {
      const where: Prisma.employeesWhereInput = {
        AND: [
          { OR: [{ leave_emp: null }, { leave_emp: 0 }] },
          scope.employeeWhere,
          ...(this.employeeSearch(q) ? [this.employeeSearch(q)!] : []),
        ],
      };
      const [rows, total] = await Promise.all([this.prisma.employees.findMany({
        where,
        select: { id: true, employee: true, emp_code: true, edara_n: true },
        orderBy: { id: 'desc' },
        skip: q.skip,
        take: q.take,
      }), this.prisma.employees.count({ where })]);
      return paginated(
        rows.map((e) => ({
          id: e.id,
          name: e.employee ?? '—',
          value: e.emp_code ?? '—',
          department: e.edara_n,
        })),
        total, q.page, q.pageSize,
      );
    },

    'employees-data': async (q, scope) => {
      const where: Prisma.employeesWhereInput = {
        AND: [
          { OR: [{ leave_emp: null }, { leave_emp: 0 }] },
          scope.employeeWhere,
          ...(this.employeeSearch(q) ? [this.employeeSearch(q)!] : []),
        ],
      };
      const [rows, total] = await Promise.all([this.prisma.employees.findMany({
        where,
        select: {
          id: true,
          employee: true,
          phone: true,
          edara_n: true,
          mosma_wazefy_n: true,
          basic_salary: true,
        },
        orderBy: { id: 'desc' },
        skip: q.skip,
        take: q.take,
      }), this.prisma.employees.count({ where })]);
      return paginated(
        rows.map((e) => ({
          id: e.id,
          name: e.employee ?? '—',
          value: e.phone ?? '—',
          jobTitle: e.mosma_wazefy_n,
          department: e.edara_n,
          ...(scope.canViewPayroll ? { salary: e.basic_salary?.toString() ?? '—' } : {}),
        })),
        total, q.page, q.pageSize,
      );
    },

    'employees-new': async (q, scope) => {
      const today = cairoDateString();
      const from = addDateOnlyDays(today, -90);
      const scopeSql = scope.employeeIds === null
        ? Prisma.empty
        : scope.employeeIds.length
          ? Prisma.sql`AND e.id IN (${Prisma.join(scope.employeeIds)})`
          : Prisma.sql`AND 1 = 0`;
      const searchSql = q.search?.trim()
        ? Prisma.sql`AND (e.employee LIKE ${`%${q.search.trim()}%`} OR COALESCE(e.start_work_date_m, e.date) LIKE ${`%${q.search.trim()}%`})`
        : Prisma.empty;
      const dateExpr = Prisma.sql`COALESCE(
        CASE
          WHEN e.start_work_date_m REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}' THEN STR_TO_DATE(SUBSTRING(e.start_work_date_m, 1, 10), '%Y-%m-%d')
          WHEN e.start_work_date_m REGEXP '^[0-9]{8,10}$' THEN FROM_UNIXTIME(CAST(e.start_work_date_m AS UNSIGNED))
          ELSE STR_TO_DATE(e.start_work_date_m, '%d/%m/%Y')
        END,
        CASE
          WHEN e.date REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}' THEN STR_TO_DATE(SUBSTRING(e.date, 1, 10), '%Y-%m-%d')
          WHEN e.date REGEXP '^[0-9]{8,10}$' THEN FROM_UNIXTIME(CAST(e.date AS UNSIGNED))
          ELSE STR_TO_DATE(e.date, '%d/%m/%Y')
        END
      )`;
      const [rows, counts] = await Promise.all([
        this.prisma.$queryRaw<Array<{ id: number; employee: string | null; start_date: Date }>>(Prisma.sql`
          SELECT e.id, e.employee, ${dateExpr} AS start_date
          FROM employees e
          WHERE (e.leave_emp IS NULL OR e.leave_emp = 0)
            AND ${dateExpr} BETWEEN STR_TO_DATE(${from}, '%Y-%m-%d') AND STR_TO_DATE(${today}, '%Y-%m-%d')
            ${scopeSql} ${searchSql}
          ORDER BY e.id DESC LIMIT ${q.take} OFFSET ${q.skip}
        `),
        this.prisma.$queryRaw<Array<{ total: bigint }>>(Prisma.sql`
          SELECT COUNT(*) AS total FROM employees e
          WHERE (e.leave_emp IS NULL OR e.leave_emp = 0)
            AND ${dateExpr} BETWEEN STR_TO_DATE(${from}, '%Y-%m-%d') AND STR_TO_DATE(${today}, '%Y-%m-%d')
            ${scopeSql} ${searchSql}
        `),
      ]);
      return paginated(rows.map((row) => ({
        id: row.id,
        name: row.employee ?? '—',
        value: row.start_date.toISOString().slice(0, 10),
      })), Number(counts[0]?.total ?? 0), q.page, q.pageSize);
    },

    'employees-expiring': async (q, scope) => {
      const today = cairoDateString();
      const until = addDateOnlyDays(today, 90);
      const scopeSql = scope.employeeIds === null
        ? Prisma.empty
        : scope.employeeIds.length
          ? Prisma.sql`AND e.id IN (${Prisma.join(scope.employeeIds)})`
          : Prisma.sql`AND 1 = 0`;
      const searchSql = q.search?.trim()
        ? Prisma.sql`AND (e.employee LIKE ${`%${q.search.trim()}%`} OR e.end_contract_date_m LIKE ${`%${q.search.trim()}%`})`
        : Prisma.empty;
      const dateExpr = Prisma.sql`CASE
        WHEN e.end_contract_date_m REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}' THEN STR_TO_DATE(SUBSTRING(e.end_contract_date_m, 1, 10), '%Y-%m-%d')
        WHEN e.end_contract_date_m REGEXP '^[0-9]{8,10}$' THEN FROM_UNIXTIME(CAST(e.end_contract_date_m AS UNSIGNED))
        ELSE STR_TO_DATE(e.end_contract_date_m, '%d/%m/%Y')
      END`;
      const [rows, counts] = await Promise.all([
        this.prisma.$queryRaw<Array<{ id: number; employee: string | null; expiry_date: Date; days_left: number }>>(Prisma.sql`
          SELECT e.id, e.employee, ${dateExpr} AS expiry_date,
            DATEDIFF(${dateExpr}, STR_TO_DATE(${today}, '%Y-%m-%d')) AS days_left
          FROM employees e
          WHERE (e.leave_emp IS NULL OR e.leave_emp = 0)
            AND ${dateExpr} BETWEEN STR_TO_DATE(${today}, '%Y-%m-%d') AND STR_TO_DATE(${until}, '%Y-%m-%d')
            ${scopeSql} ${searchSql}
          ORDER BY ${dateExpr} ASC, e.id DESC LIMIT ${q.take} OFFSET ${q.skip}
        `),
        this.prisma.$queryRaw<Array<{ total: bigint }>>(Prisma.sql`
          SELECT COUNT(*) AS total FROM employees e
          WHERE (e.leave_emp IS NULL OR e.leave_emp = 0)
            AND ${dateExpr} BETWEEN STR_TO_DATE(${today}, '%Y-%m-%d') AND STR_TO_DATE(${until}, '%Y-%m-%d')
            ${scopeSql} ${searchSql}
        `),
      ]);
      return paginated(rows.map((row) => ({
        id: row.id,
        name: row.employee ?? '—',
        value: row.expiry_date.toISOString().slice(0, 10),
        daysLeft: Number(row.days_left),
      })), Number(counts[0]?.total ?? 0), q.page, q.pageSize);
    },

    'employees-resigned': async (q, scope) => {
      const where: Prisma.employeesWhereInput = {
        AND: [
          { OR: [{ leave_emp: 1 }, { employee_type: { not: 1 } }] },
          scope.employeeWhere,
          ...(this.employeeSearch(q) ? [this.employeeSearch(q)!] : []),
        ],
      };
      const [rows, total] = await Promise.all([this.prisma.employees.findMany({
        where,
        select: { id: true, employee: true, end_service_date_m: true, reason: true },
        orderBy: { id: 'desc' },
        skip: q.skip,
        take: q.take,
      }), this.prisma.employees.count({ where })]);
      return paginated(
        rows.map((e) => ({
          id: e.id,
          name: e.employee ?? '—',
          value: toIsoDate(e.end_service_date_m) ?? '—',
          reason: e.reason,
        })),
        total, q.page, q.pageSize,
      );
    },

    'attendance-daily': async (q, scope) => {
      const date = q.date ?? q.dateFrom ?? cairoDateString();
      const matches = [date, String(dateOnlyEpochSeconds(date))];
      const where = await this.attendanceReportWhere(scope, q, { action_date_s: { in: matches } });
      const [rows, total] = await Promise.all([this.prisma.tbl_hdoor_emps.findMany({
        where,
        orderBy: { hodoor_id: 'desc' },
        skip: q.skip,
        take: q.take,
      }), this.prisma.tbl_hdoor_emps.count({ where })]);
      const byCode = await this.attendanceNames(rows);
      return paginated(
        rows.map((r) => ({
          id: r.hodoor_id,
          name: byCode.get(r.employee_code ?? 0) ?? String(r.employee_code ?? '—'),
          value: r.hdoor_time ?? '—',
          checkOut: r.ensraf_time,
          lateMin: r.late_min ?? 0,
        })),
        total, q.page, q.pageSize,
      );
    },

    'attendance-absence': async (q, scope) => {
      const date = q.date ?? q.dateFrom ?? cairoDateString();
      const matches = [date, String(dateOnlyEpochSeconds(date))];
      const present = await this.prisma.tbl_hdoor_emps.findMany({
        where: {
          AND: [
            { action_date_s: { in: matches }, hdoor_time: { not: null } },
            this.attendanceScope(scope),
          ],
        },
        select: { employee_code: true },
      });
      const presentCodes = new Set(present.map((p) => p.employee_code));
      const numericPresentCodes = [...presentCodes].filter((value): value is number => value != null);
      const where: Prisma.employeesWhereInput = {
        AND: [
          {
            OR: [{ leave_emp: null }, { leave_emp: 0 }],
            emp_code: numericPresentCodes.length ? { not: null, notIn: numericPresentCodes } : { not: null },
          },
          scope.employeeWhere,
          ...(this.employeeSearch(q) ? [this.employeeSearch(q)!] : []),
        ],
      };
      const [emps, total] = await Promise.all([this.prisma.employees.findMany({
        where,
        select: { id: true, employee: true, emp_code: true, edara_n: true },
        orderBy: { id: 'desc' },
        skip: q.skip,
        take: q.take,
      }), this.prisma.employees.count({ where })]);
      return paginated(
        emps.map((e) => ({
          id: e.id,
          name: e.employee ?? '—',
          value: e.emp_code ?? '—',
          department: e.edara_n,
          date,
        })),
        total, q.page, q.pageSize,
      );
    },

    'attendance-late': async (q, scope) => {
      const dateFilter: Prisma.tbl_hdoor_empsWhereInput = { late_min: { gt: 0 } };
      if (q.dateFrom || q.dateTo) {
        const from = q.dateFrom ?? '1970-01-01';
        const to = q.dateTo ?? cairoDateString();
        dateFilter.action_date_s = { gte: from, lte: to };
      }
      const where = await this.attendanceReportWhere(scope, q, dateFilter);
      const [rows, total] = await Promise.all([this.prisma.tbl_hdoor_emps.findMany({
        where,
        orderBy: { hodoor_id: 'desc' },
        skip: q.skip,
        take: q.take,
      }), this.prisma.tbl_hdoor_emps.count({ where })]);
      const byCode = await this.attendanceNames(rows);
      return paginated(
        rows.map((r) => ({
          id: r.hodoor_id,
          name: byCode.get(r.employee_code ?? 0) ?? String(r.employee_code ?? '—'),
          value: Math.round(r.late_min ?? 0),
          date: r.action_date_s,
        })),
        total, q.page, q.pageSize,
      );
    },

    'attendance-hours': async (q, scope) => {
      const where = this.payrollReportWhere(scope, q);
      const [rows, total] = await Promise.all([this.prisma.hr_mosayer_details.findMany({
        where,
        select: { id: true, emp_name: true, sa3at_amal: true, ayam_amal: true },
        orderBy: { id: 'desc' },
        skip: q.skip,
        take: q.take,
      }), this.prisma.hr_mosayer_details.count({ where })]);
      return paginated(
        rows.map((r) => ({
          id: r.id,
          name: r.emp_name ?? '—',
          value: r.sa3at_amal ?? 0,
          workDays: r.ayam_amal ?? 0,
        })),
        total, q.page, q.pageSize,
      );
    },

    'attendance-overtime': async (q, scope) => {
      const where = await this.attendanceReportWhere(scope, q, { num_min: { gt: 0 } });
      const [rows, total] = await Promise.all([this.prisma.tbl_hdoor_emps.findMany({
        where,
        orderBy: { hodoor_id: 'desc' },
        skip: q.skip,
        take: q.take,
      }), this.prisma.tbl_hdoor_emps.count({ where })]);
      const byCode = await this.attendanceNames(rows);
      return paginated(
        rows.map((r) => ({
          id: r.hodoor_id,
          name: byCode.get(r.employee_code ?? 0) ?? String(r.employee_code ?? '—'),
          value: Math.round(r.num_min ?? 0),
          date: r.action_date_s,
        })),
        total, q.page, q.pageSize,
      );
    },

    'attendance-shift': async (q, scope) => {
      const where = await this.attendanceReportWhere(scope, q, { sheft_type: { not: 0 } });
      const [rows, total] = await Promise.all([this.prisma.tbl_hdoor_emps.findMany({
        where,
        orderBy: { hodoor_id: 'desc' },
        skip: q.skip,
        take: q.take,
      }), this.prisma.tbl_hdoor_emps.count({ where })]);
      const byCode = await this.attendanceNames(rows);
      return paginated(
        rows.map((r) => ({
          id: r.hodoor_id,
          name: byCode.get(r.employee_code ?? 0) ?? String(r.employee_code ?? '—'),
          value: r.sheft_type,
          date: r.action_date_s,
        })),
        total, q.page, q.pageSize,
      );
    },

    'payroll-sheet': async (q, scope) => {
      const where = this.payrollReportWhere(scope, q);
      const [rows, total] = await Promise.all([this.prisma.hr_mosayer_details.findMany({
        where,
        select: { id: true, emp_name: true, rateb_asasy: true, safi: true },
        orderBy: { id: 'desc' },
        skip: q.skip,
        take: q.take,
      }), this.prisma.hr_mosayer_details.count({ where })]);
      return paginated(
        rows.map((r) => ({
          id: r.id,
          name: r.emp_name ?? '—',
          value: this.dec(r.safi),
          basicSalary: this.dec(r.rateb_asasy),
        })),
        total, q.page, q.pageSize,
      );
    },

    'payroll-deductions': async (q, scope) => {
      const where = this.payrollReportWhere(scope, q);
      const [rows, total] = await Promise.all([this.prisma.hr_mosayer_details.findMany({
        where,
        select: {
          id: true,
          emp_name: true,
          total_khsomat: true,
          khasm_gezaa: true,
          khasm_takher: true,
          khasm_solaf: true,
        },
        orderBy: { id: 'desc' },
        skip: q.skip,
        take: q.take,
      }), this.prisma.hr_mosayer_details.count({ where })]);
      return paginated(
        rows.map((r) => ({
          id: r.id,
          name: r.emp_name ?? '—',
          value: this.dec(r.total_khsomat),
          penalties: this.dec(r.khasm_gezaa),
          late: this.dec(r.khasm_takher),
          advances: this.dec(r.khasm_solaf),
        })),
        total, q.page, q.pageSize,
      );
    },

    'payroll-incentives': async (q, scope) => {
      const where = this.payrollReportWhere(scope, q);
      const [rows, total] = await Promise.all([this.prisma.hr_mosayer_details.findMany({
        where,
        select: { id: true, emp_name: true, tot_mokafaa: true },
        orderBy: { id: 'desc' },
        skip: q.skip,
        take: q.take,
      }), this.prisma.hr_mosayer_details.count({ where })]);
      return paginated(
        rows.map((r) => ({
          id: r.id,
          name: r.emp_name ?? '—',
          value: this.dec(r.tot_mokafaa),
        })),
        total, q.page, q.pageSize,
      );
    },

    'payroll-allowances': async (q, scope) => {
      const where = this.payrollReportWhere(scope, q);
      const [rows, total] = await Promise.all([this.prisma.hr_mosayer_details.findMany({
        where,
        select: {
          id: true,
          emp_name: true,
          badal_sakn: true,
          badal_mowaslat: true,
          badal_etsal: true,
          badal_e3asha: true,
        },
        orderBy: { id: 'desc' },
        skip: q.skip,
        take: q.take,
      }), this.prisma.hr_mosayer_details.count({ where })]);
      return paginated(
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
        total, q.page, q.pageSize,
      );
    },

    'payroll-commissions': async (q, scope) => {
      const where = this.payrollReportWhere(scope, q);
      const [rows, total] = await Promise.all([this.prisma.hr_mosayer_details.findMany({
        where,
        select: { id: true, emp_name: true, tot_entdab: true },
        orderBy: { id: 'desc' },
        skip: q.skip,
        take: q.take,
      }), this.prisma.hr_mosayer_details.count({ where })]);
      return paginated(
        rows.map((r) => ({
          id: r.id,
          name: r.emp_name ?? '—',
          value: this.dec(r.tot_entdab),
        })),
        total, q.page, q.pageSize,
      );
    },

    'payroll-taxes': async (q, scope) => {
      const where = this.payrollReportWhere(scope, q);
      const [rows, total] = await Promise.all([this.prisma.hr_mosayer_details.findMany({
        where,
        select: { id: true, emp_name: true, income_tax: true },
        orderBy: { id: 'desc' },
        skip: q.skip,
        take: q.take,
      }), this.prisma.hr_mosayer_details.count({ where })]);
      return paginated(
        rows.map((r) => ({
          id: r.id,
          name: r.emp_name ?? '—',
          value: this.dec(r.income_tax),
        })),
        total, q.page, q.pageSize,
      );
    },

    'payroll-insurance': async (q, scope) => {
      const where = this.payrollReportWhere(scope, q);
      const [rows, total] = await Promise.all([this.prisma.hr_mosayer_details.findMany({
        where,
        select: { id: true, emp_name: true, khasm_tamen: true },
        orderBy: { id: 'desc' },
        skip: q.skip,
        take: q.take,
      }), this.prisma.hr_mosayer_details.count({ where })]);
      return paginated(
        rows.map((r) => ({
          id: r.id,
          name: r.emp_name ?? '—',
          value: this.dec(r.khasm_tamen),
        })),
        total, q.page, q.pageSize,
      );
    },

    'leaves-balance': async (q, scope) => {
      const where = await this.contractReportWhere(scope, q);
      const [contracts, total] = await Promise.all([this.prisma.contract_employe.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: q.skip,
        take: q.take,
      }), this.prisma.contract_employe.count({ where })]);
      const pageCodes = contracts.map((contract) => Number(contract.emp_code)).filter(Number.isFinite);
      const emps = await this.prisma.employees.findMany({
        where: { AND: [scope.employeeWhere, { emp_code: { in: pageCodes } }] },
        select: { id: true, emp_code: true, employee: true },
      });
      const byCode = new Map(emps.map((e) => [String(e.emp_code), e]));
      return paginated(
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
        total, q.page, q.pageSize,
      );
    },

    'leaves-used': async (q, scope) => {
      const where = await this.leaveOrderReportWhere(scope, q);
      const [rows, total] = await Promise.all([this.prisma.hr_all_agzat_orders.findMany({
        where,
        select: {
          id: true,
          emp_id_fk: true,
          num_days: true,
          agaza_from_date_m: true,
          agaza_to_date_m: true,
        },
        orderBy: { id: 'desc' },
        skip: q.skip,
        take: q.take,
      }), this.prisma.hr_all_agzat_orders.count({ where })]);
      const empIds = [...new Set(rows.map((r) => r.emp_id_fk).filter(Boolean))] as number[];
      const emps = await this.prisma.employees.findMany({
        where: { id: { in: empIds } },
        select: { id: true, employee: true },
      });
      const byId = new Map(emps.map((e) => [e.id, e.employee]));
      return paginated(
        rows.map((r) => ({
          id: r.id,
          name: byId.get(r.emp_id_fk ?? 0) ?? '—',
          value: r.num_days ?? 0,
          from: r.agaza_from_date_m,
          to: r.agaza_to_date_m,
        })),
        total, q.page, q.pageSize,
      );
    },

    'leaves-remaining': async (q, scope) => {
      const contractWhere = await this.contractReportWhere(scope, q);
      const [contracts, total] = await Promise.all([this.prisma.contract_employe.findMany({
        where: contractWhere,
        orderBy: { id: 'desc' },
        skip: q.skip,
        take: q.take,
      }), this.prisma.contract_employe.count({ where: contractWhere })]);
      const pageCodes = contracts.map((contract) => Number(contract.emp_code)).filter(Number.isFinite);
      const emps = await this.prisma.employees.findMany({
        where: { AND: [scope.employeeWhere, { emp_code: { in: pageCodes } }] },
        select: { id: true, emp_code: true, employee: true },
      });
      const pageEmployeeIds = emps.map((employee) => employee.id);
      const usedRows = await this.prisma.hr_all_agzat_orders.groupBy({
        by: ['emp_id_fk'],
        where: {
          AND: [
            { suspend: SuspendStatus.APPROVED },
            this.leaveScope(scope),
            pageEmployeeIds.length ? { emp_id_fk: { in: pageEmployeeIds } } : { id: -1 },
          ],
        },
        _sum: { num_days: true },
      });
      const usedByEmp = new Map(usedRows.map((u) => [u.emp_id_fk, u._sum.num_days ?? 0]));
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
      return paginated(rows, total, q.page, q.pageSize);
    },
  };
}
