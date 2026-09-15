import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { paginated } from '../../common/dto/list-result';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtUser } from '../../common/types/jwt-user';
import { retryOnUniqueViolation } from '../../common/retry-unique';
import { csvCell } from '../../common/export/csv.util';
import { ModuleLedgerService } from '../accounting/module-ledger.service';
import { recordSystemExpense } from '../finance/system-expense.util';
import {
  CreatePayComponentDto,
  CreatePayrollRunDto,
  CreateSalaryIncreaseDto,
  ListPayComponentsDto,
  ListSalaryIncreasesDto,
  PayrollPreviewDto,
  UpdatePayComponentDto,
  UpdateSalaryIncreaseDto,
} from './dto/payroll.dto';
import { ComputedEmployeeSalary, PayrollEngineService } from './payroll-engine.service';
import {
  decimal,
  mapRunStatus,
  monthLabel,
  payrollPeriod,
  runTitle,
  todayAr,
  timeAr,
} from './payroll-status.util';

const COMPONENT_TYPES = ['allowances', 'deduction'] as const;

interface PayrollBranchTotals {
  branchId: number | null;
  grossEarnings: number;
  totalDeductions: number;
  netPay: number;
  employeeInsurance: number;
  employerInsurance: number;
  loanDeductions: number;
  nonLiabilityDeductions: number;
}

const payrollMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

@Injectable()
export class PayrollService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: PayrollEngineService,
    private readonly moduleLedger: ModuleLedgerService,
    private readonly branchScope: BranchScopeService,
  ) {}

  // ─── Components (all_defined_setting) ───────────────────────────────────

  async listComponents(q: ListPayComponentsDto) {
    const where: Prisma.all_defined_settingWhereInput = {
      defined_type_title:
        q.category === 'deduction'
          ? 'deduction'
          : q.category === 'allowance'
            ? 'allowances'
            : { in: [...COMPONENT_TYPES] },
      ...(q.search?.trim()
        ? { defined_title: { contains: q.search.trim() } }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.all_defined_setting.findMany({
        where,
        orderBy: { defined_id: 'asc' },
        skip: q.skip,
        take: q.take,
      }),
      this.prisma.all_defined_setting.count({ where }),
    ]);
    return paginated(rows.map((r) => this.toComponentRow(r)), total, q.page, q.pageSize);
  }

  async createComponent(dto: CreatePayComponentDto) {
    const typeTitle = dto.category === 'deduction' ? 'deduction' : 'allowances';
    const type = dto.category === 'deduction' ? 2 : 1;
    const row = await this.prisma.all_defined_setting.create({
      data: {
        defined_title: dto.title,
        defined_type: type,
        defined_type_title: typeTitle,
        in_order: String(dto.amount ?? 0),
      },
    });
    return this.toComponentRow(row, dto);
  }

  async updateComponent(id: number, dto: UpdatePayComponentDto) {
    await this.ensureComponent(id);
    const data: Prisma.all_defined_settingUpdateInput = {};
    if (dto.title != null) data.defined_title = dto.title;
    if (dto.category != null) {
      data.defined_type_title = dto.category === 'deduction' ? 'deduction' : 'allowances';
      data.defined_type = dto.category === 'deduction' ? 2 : 1;
    }
    if (dto.amount != null) data.in_order = String(dto.amount);
    const row = await this.prisma.all_defined_setting.update({
      where: { defined_id: id },
      data,
    });
    return this.toComponentRow(row, dto);
  }

  async removeComponent(id: number) {
    await this.ensureComponent(id);
    await this.prisma.all_defined_setting.delete({ where: { defined_id: id } });
    return { ok: true };
  }

  private async ensureComponent(id: number) {
    const row = await this.prisma.all_defined_setting.findFirst({
      where: { defined_id: id, defined_type_title: { in: [...COMPONENT_TYPES] } },
    });
    if (!row) throw new NotFoundException('مكون الراتب غير موجود');
    return row;
  }

  private toComponentRow(
    row: { defined_id: number; defined_title: string; defined_type: number; defined_type_title: string; in_order: string },
    overrides?: Partial<CreatePayComponentDto | UpdatePayComponentDto>,
  ) {
    const parsedAmount = parseFloat(row.in_order);
    return {
      id: row.defined_id,
      title: row.defined_title,
      type: overrides?.type ?? String(row.defined_type),
      category:
        overrides?.category ??
        (row.defined_type_title === 'deduction' ? 'deduction' : 'allowance'),
      amount: overrides?.amount ?? (Number.isNaN(parsedAmount) ? 0 : parsedAmount),
      // The legacy table has no active flag; defined_type=2 means "deduction",
      // not "inactive". Existing definitions are therefore active by default.
      isActive: overrides?.isActive ?? true,
    };
  }

  // ─── Live salary sheet (legacy Employee_salaries) ────────────────────────

  async previewSalarySheet(q: PayrollPreviewDto, user: JwtUser) {
    if (q.fromDate > q.toDate) {
      throw new BadRequestException('تاريخ البداية يجب أن يسبق تاريخ النهاية');
    }
    const branchIds = this.branchScope.resolveListFilter(user, q.branchId);
    const computed = branchIds?.length === 0 ? [] : await this.engine.computeAllForPeriod(
      q.fromDate,
      q.toDate,
      branchIds ?? undefined,
    );
    const search = q.search?.trim().toLocaleLowerCase('ar');
    const filtered = search
      ? computed.filter((row) =>
          `${row.empName} ${row.empCode} ${row.mosmaWazefyN ?? ''}`
            .toLocaleLowerCase('ar')
            .includes(search),
        )
      : computed;

    const resultBranchIds = [...new Set(filtered.map((row) => row.branchId).filter((id): id is number => id != null && id > 0))];
    const sites = resultBranchIds.length
      ? await this.prisma.tbl_sites.findMany({
          where: { id: { in: resultBranchIds } },
          select: { id: true, name: true },
        })
      : [];
    const siteNames = new Map(sites.map((site) => [site.id, site.name]));
    const pageRows = filtered.slice(q.skip, q.skip + q.take).map((row) =>
      this.toSalaryPreviewRow(row, siteNames.get(row.branchId ?? -1)),
    );
    return {
      ...paginated(pageRows, filtered.length, q.page, q.pageSize),
      summary: {
        employees: filtered.length,
        earnings: payrollMoney(filtered.reduce((sum, row) => sum + row.totalEsthkak, 0)),
        deductions: payrollMoney(filtered.reduce((sum, row) => sum + row.totalKhsomat, 0)),
        net: payrollMoney(filtered.reduce((sum, row) => sum + row.safi, 0)),
      },
      period: { fromDate: q.fromDate, toDate: q.toDate },
    };
  }

  // ─── Salary increases (tbl_zeyada_rateb) ────────────────────────────────

  async listSalaryIncreases(q: ListSalaryIncreasesDto) {
    if (q.dateFrom && q.dateTo && q.dateFrom > q.dateTo) {
      throw new BadRequestException('تاريخ البداية يجب أن يسبق تاريخ النهاية');
    }
    const where: Prisma.tbl_zeyada_ratebWhereInput = {
      ...(q.employeeId ? { emp_id_fk: q.employeeId } : {}),
      ...(q.dateFrom || q.dateTo
        ? { date_ar: { ...(q.dateFrom ? { gte: q.dateFrom } : {}), ...(q.dateTo ? { lte: q.dateTo } : {}) } }
        : {}),
    };
    if (q.search?.trim()) {
      const search = q.search.trim();
      const code = Number(search);
      where.OR = [
        { emp_name: { contains: search } },
        ...(Number.isFinite(code) ? [{ emp_code: code }] : []),
      ];
    }
    const [rows, total] = await Promise.all([
      this.prisma.tbl_zeyada_rateb.findMany({
        where,
        orderBy: [{ date_ar: 'desc' }, { id: 'desc' }],
        skip: q.skip,
        take: q.take,
      }),
      this.prisma.tbl_zeyada_rateb.count({ where }),
    ]);
    return paginated(rows.map((row) => this.toSalaryIncreaseRow(row)), total, q.page, q.pageSize);
  }

  async createSalaryIncrease(dto: CreateSalaryIncreaseDto, userId: number) {
    const employee = await this.getIncreaseEmployee(dto.employeeId);
    const row = await this.prisma.tbl_zeyada_rateb.create({
      data: {
        emp_id_fk: employee.id,
        emp_code: employee.emp_code!,
        emp_name: employee.employee ?? '',
        value: Math.round(dto.value),
        date_ar: dto.date,
        date_s: unixDate(dto.date),
        publisher: userId,
      },
    });
    return this.toSalaryIncreaseRow(row);
  }

  async updateSalaryIncrease(id: number, dto: UpdateSalaryIncreaseDto, userId: number) {
    const existing = await this.prisma.tbl_zeyada_rateb.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('زيادة الراتب غير موجودة');
    const employee = dto.employeeId != null ? await this.getIncreaseEmployee(dto.employeeId) : null;
    const date = dto.date ?? existing.date_ar;
    const row = await this.prisma.tbl_zeyada_rateb.update({
      where: { id },
      data: {
        ...(employee
          ? { emp_id_fk: employee.id, emp_code: employee.emp_code!, emp_name: employee.employee ?? '' }
          : {}),
        ...(dto.value != null ? { value: Math.round(dto.value) } : {}),
        ...(dto.date != null ? { date_ar: date, date_s: unixDate(date) } : {}),
        publisher: userId,
      },
    });
    return this.toSalaryIncreaseRow(row);
  }

  async removeSalaryIncrease(id: number) {
    const row = await this.prisma.tbl_zeyada_rateb.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('زيادة الراتب غير موجودة');
    await this.prisma.tbl_zeyada_rateb.delete({ where: { id } });
    return { ok: true };
  }

  private async getIncreaseEmployee(id: number) {
    const employee = await this.prisma.employees.findUnique({
      where: { id },
      select: { id: true, emp_code: true, employee: true },
    });
    if (!employee || employee.emp_code == null) throw new NotFoundException('الموظف غير موجود');
    return employee;
  }

  // ─── Payroll runs (hr_mosayer) ────────────────────────────────────────────

  async createRun(dto: CreatePayrollRunDto) {
    await this.assertAllActiveEmployeesHaveSalary();
    const existing = await this.prisma.hr_mosayer.findFirst({
      where: { mosayer_month: dto.month, mosayer_year: dto.year },
    });
    if (existing) {
      throw new ConflictException('مسيرة هذا الشهر موجودة مسبقًا');
    }

    const now = todayAr();
    // Race-safe مسيّرة رقم: recompute max+1 and insert together, retrying if a concurrent run took it.
    const { header, mosayerRkm } = await retryOnUniqueViolation(async () => {
      const maxRkm = await this.prisma.hr_mosayer.aggregate({ _max: { mosayer_rkm: true } });
      const nextRkm = (maxRkm._max.mosayer_rkm ?? 0) + 1;
      const created = await this.prisma.hr_mosayer.create({
        data: {
          mosayer_rkm: nextRkm,
          mosayer_date: now,
          mosayer_date_ar: now,
          mosayer_month: dto.month,
          mosayer_year: dto.year,
          total: 0,
          taghez: 'no',
          approved: 0,
        },
      });
      return { header: created, mosayerRkm: nextRkm };
    });

    await this.persistComputedSalaries(header.id, mosayerRkm, dto.month, dto.year);
    return this.findRun(header.id);
  }

  async listRuns(q: PaginationDto & { status?: string }) {
    const rows = await this.prisma.hr_mosayer.findMany({
      orderBy: { id: 'desc' },
    });

    let filtered = rows;
    if (q.status) {
      filtered = rows.filter((r) => mapRunStatus(r) === q.status);
    }
    if (q.search?.trim()) {
      const s = q.search.trim().toLowerCase();
      filtered = filtered.filter((r) => {
        const title = runTitle(r.mosayer_month ?? 0, r.mosayer_year ?? 0).toLowerCase();
        return title.includes(s) || String(r.id).includes(s);
      });
    }

    const total = filtered.length;
    const pageRows = filtered.slice(q.skip, q.skip + q.take);
    return paginated(pageRows.map((r) => this.toRunRow(r)), total, q.page, q.pageSize);
  }

  async findRun(id: number) {
    const row = await this.getRunOrThrow(id);
    const employeeCount = await this.prisma.hr_mosayer_details.count({
      where: { mosayer_rkm_fk: row.mosayer_rkm ?? undefined },
    });
    return {
      ...this.toRunRow(row),
      employeeCount,
      totalAmount: decimal(row.egmali_safi),
    };
  }

  async listRunLines(id: number, q: PaginationDto) {
    const row = await this.getRunOrThrow(id);
    const where: Prisma.hr_mosayer_detailsWhereInput = {
      mosayer_rkm_fk: row.mosayer_rkm ?? undefined,
    };
    if (q.search?.trim()) {
      const s = q.search.trim();
      where.OR = [
        { emp_name: { contains: s } },
        ...(Number.isNaN(parseInt(s, 10)) ? [] : [{ emp_code: parseInt(s, 10) }]),
      ];
    }

    const [lines, total] = await Promise.all([
      this.prisma.hr_mosayer_details.findMany({
        where,
        orderBy: { id: 'asc' },
        skip: q.skip,
        take: q.take,
      }),
      this.prisma.hr_mosayer_details.count({ where }),
    ]);

    return paginated(lines.map((l) => this.toLineRow(l)), total, q.page, q.pageSize);
  }

  async getSlip(runId: number, empLineId: number) {
    const run = await this.getRunOrThrow(runId);
    const line = await this.prisma.hr_mosayer_details.findFirst({
      where: { id: empLineId, mosayer_rkm_fk: run.mosayer_rkm ?? undefined },
    });
    if (!line) throw new NotFoundException('بند الموظف غير موجود');
    const manualRows = run.mosayer_rkm != null
      ? await this.prisma.hr_mosayer_egraat.findMany({
          where: {
            mosayer_rkm_fk: run.mosayer_rkm,
            emp_id: String(line.emp_id ?? ''),
            badal_code: { in: ['private_bonus', 'taqeem', 'target'] },
          },
          select: { badal_code: true, new_value: true },
        })
      : [];
    const manualValue = (code: string) => manualRows.find((row) => row.badal_code === code)?.new_value ?? 0;

    // Re-derive the late split (permit vs non-permit) from the engine breakdown,
    // since hr_mosayer_details persists only the combined khasm_takher line.
    let latePermit = 0;
    let lateNoPermit = decimal(line.khasm_takher);
    if (line.emp_id != null && run.mosayer_month != null && run.mosayer_year != null) {
      const recomputed = await this.engine.computeOneById(
        line.emp_id,
        run.mosayer_month,
        run.mosayer_year,
      );
      if (recomputed) {
        const b = recomputed.breakdown as { khasmTakherAmount?: number; khasmEznAmount?: number };
        lateNoPermit = b.khasmTakherAmount ?? lateNoPermit;
        latePermit = b.khasmEznAmount ?? 0;
      }
    }

    return {
      run: this.toRunRow(run),
      employee: {
        id: line.emp_id,
        empCode: line.emp_code,
        name: line.emp_name,
        jobTitle: line.mosma_wazefy_n,
      },
      earnings: {
        basicSalary: decimal(line.rateb_asasy),
        housing: decimal(line.badal_sakn),
        transport: decimal(line.badal_mowaslat),
        communication: decimal(line.badal_etsal),
        meal: decimal(line.badal_e3asha),
        nature: decimal(line.badal_tabe3a_amal),
        assignment: decimal(line.badal_taklef),
        overtime: decimal(line.tot_edafi),
        bonus: decimal(line.tot_mokafaa),
        incentives: decimal(line.tot_entdab),
        other: decimal(line.tot_okraa_esthkaq),
        total: decimal(line.total_esthkak),
      },
      deductions: {
        absence: decimal(line.khasm_keyab),
        unpaidLeave: decimal(line.agaza_bdon_rateb),
        lateness: lateNoPermit,
        permitLateness: latePermit,
        penalty: decimal(line.khasm_gezaa),
        insurance: decimal(line.khasm_tamen),
        loan: decimal(line.khasm_solaf),
        other: decimal(line.tot_okraa_khasm),
        total: decimal(line.total_khsomat),
      },
      netSalary: decimal(line.safi),
      manualAdjustments: {
        privateBonus: manualValue('private_bonus'),
        taqeemValue: manualValue('taqeem'),
        targetValue: manualValue('target'),
      },
      bank: {
        bankId: line.emp_bank_id_fk,
        account: line.emp_bank_account_num,
        code: line.bank_code,
        nameInBank: line.emp_name_in_bank,
      },
    };
  }

  /**
   * Apply manual slip overrides (مكافأة خاصة / تقييم / تارجت) to a persisted line,
   * recomputing the line via the engine with the overrides folded into earnings.
   * NOTE: hr_mosayer_details has no private_bonus / taqeem_value columns, so the override
   * amounts are merged into tot_okraa_esthkaq (free-form earnings) to keep totals correct.
   */
  async applySlipOverrides(
    runId: number,
    empLineId: number,
    overrides: { privateBonus?: number; taqeemValue?: number; targetValue?: number },
    userId?: number,
  ) {
    const run = await this.getRunOrThrow(runId);
    // Block edits once the run has left the editable phase — overrides must not alter an
    // approved / posted / banked payroll run.
    const status = mapRunStatus(run);
    if (['approved', 'posted', 'banked', 'completed'].includes(status)) {
      throw new BadRequestException('لا يمكن تعديل مسيّرة معتمدة أو مرحّلة أو مصروفة');
    }
    const line = await this.prisma.hr_mosayer_details.findFirst({
      where: { id: empLineId, mosayer_rkm_fk: run.mosayer_rkm ?? undefined },
    });
    if (!line) throw new NotFoundException('بند الموظف غير موجود');
    if (line.emp_id == null || run.mosayer_month == null || run.mosayer_year == null) {
      throw new BadRequestException('بيانات المسيرة غير مكتملة');
    }

    const recomputed = await this.engine.computeOneById(
      line.emp_id,
      run.mosayer_month,
      run.mosayer_year,
      overrides,
    );
    if (!recomputed) throw new NotFoundException('تعذر إعادة احتساب الموظف');

    const manual =
      (overrides.privateBonus ?? 0) +
      (overrides.taqeemValue ?? 0) +
      (overrides.targetValue ?? 0);

    // Update the line AND recompute the hr_mosayer header totals (egmali_* / egmali_safi)
    // from the detail rows in the same transaction, so the header never drifts from its lines.
    await this.prisma.$transaction(async (tx) => {
      await tx.hr_mosayer_egraat.deleteMany({
        where: {
          mosayer_rkm_fk: run.mosayer_rkm,
          emp_id: String(line.emp_id),
          badal_code: { in: ['private_bonus', 'taqeem', 'target'] },
        },
      });
      const manualDefinitions = [
        { code: 'private_bonus', name: 'مكافأة البرايفت', value: overrides.privateBonus ?? 0 },
        { code: 'taqeem', name: 'التقييم', value: overrides.taqeemValue ?? 0 },
        { code: 'target', name: 'نسبة التارجت', value: overrides.targetValue ?? 0 },
      ].filter((item) => item.value > 0);
      if (manualDefinitions.length) {
        await tx.hr_mosayer_egraat.createMany({
          data: manualDefinitions.map((item) => ({
            mosayer_rkm_fk: run.mosayer_rkm,
            emp_id: String(line.emp_id),
            emp_code: String(line.emp_code ?? ''),
            emp_name: line.emp_name,
            operation_value: 'plus',
            badal_code: item.code,
            badal_n: item.name,
            badal_name: item.name,
            new_value: item.value,
            subs_value: String(item.value),
            egraa_date: todayAr(),
            egraa_date_ar: todayAr(),
            time_add: timeAr(),
            publisher: userId != null ? String(userId) : null,
          })),
        });
      }
      await tx.hr_mosayer_details.update({
        where: { id: empLineId },
        data: {
          tot_okraa_esthkaq: manual,
          total_esthkak: recomputed.totalEsthkak,
          total_khsomat: recomputed.totalKhsomat,
          safi: recomputed.safi,
        },
      });
      await this.recomputeHeaderTotals(tx, run.mosayer_rkm, run.id);
    });
    return this.getSlip(runId, empLineId);
  }

  async runAction(id: number, action: string, userId?: number) {
    const run = await this.getRunOrThrow(id);
    const status = mapRunStatus(run);

    switch (action) {
      case 'compute':
        if (['approved', 'posted', 'banked', 'completed'].includes(status)) {
          throw new BadRequestException('لا يمكن إعادة احتساب مسيّرة معتمدة أو مصروفة');
        }
        if (!run.mosayer_rkm || run.mosayer_month == null || run.mosayer_year == null) {
          throw new BadRequestException('بيانات المسيرة غير مكتملة');
        }
        await this.assertAllActiveEmployeesHaveSalary();
        await this.persistComputedSalaries(
          run.id,
          run.mosayer_rkm,
          run.mosayer_month,
          run.mosayer_year,
        );
        await this.prisma.hr_mosayer.update({
          where: { id },
          data: { taghez: 'yes', taghez_date_ar: todayAr(), taghez_time: timeAr() },
        });
        break;

      case 'review':
        if (status === 'draft') {
          throw new BadRequestException('يجب احتساب المسيرة أولًا');
        }
        await this.prisma.hr_mosayer.update({
          where: { id },
          data: { suspend_mohasb: 'yes', suspend_direct_manager: 'yes' },
        });
        break;

      case 'approve':
        if (status !== 'reviewing') {
          throw new BadRequestException('يجب مراجعة المسيّرة قبل الاعتماد');
        }
        // VERIFY: legacy approval chain may use multiple suspend_* fields
        await this.prisma.hr_mosayer.update({
          where: { id },
          data: {
            approved: 1,
            suspend_moder_3am: 'yes',
            suspend_moder_mali: 'yes',
          },
        });
        break;

      case 'post': {
        // Precondition: the run must be approved (and not already posted/banked). Atomic
        // conditional claim so a second concurrent post can't re-run the loan settlement.
        if (status !== 'approved') {
          throw new BadRequestException('يجب اعتماد المسيّرة قبل الترحيل');
        }
        if (run.mosayer_rkm == null || run.mosayer_month == null || run.mosayer_year == null) {
          throw new BadRequestException('بيانات المسيرة غير مكتملة');
        }
        await this.moduleLedger.ensureChart();
        await this.prisma.$transaction(async (tx) => {
          const claimed = await tx.hr_mosayer.updateMany({
            where: {
              id,
              approved: 1,
              // still approved-only: not yet posted, not yet banked
              halet_sarf: { not: 'yes' },
              tanfez_ezn_sarf: { not: 'yes' },
              file_downloded: null,
            },
            data: { halet_sarf: 'yes', taghez: 'yes' },
          });
          if (claimed.count === 0) {
            throw new BadRequestException('المسيّرة مرحّلة بالفعل أو غير معتمدة');
          }
          const branchTotals = await this.getPayrollBranchTotals(run.mosayer_rkm!, tx);
          for (const totals of branchTotals) {
            this.assertPayrollTotalsBalanced(totals, run.mosayer_rkm!);
            await this.moduleLedger.postPayrollAccrual(
              {
                payrollNumber: run.mosayer_rkm!,
                branchId: totals.branchId ?? undefined,
                date: todayAr(),
                grossEarnings: totals.grossEarnings,
                netPay: totals.netPay,
                employeeInsurance: totals.employeeInsurance,
                employerInsurance: totals.employerInsurance,
                loanDeductions: totals.loanDeductions,
                nonLiabilityDeductions: totals.nonLiabilityDeductions,
                createdBy: userId,
              },
              tx,
            );
            const payrollExpense = payrollMoney(
              totals.grossEarnings + totals.employerInsurance - totals.nonLiabilityDeductions,
            );
            await recordSystemExpense(tx, {
              invoiceNumber: `PAYROLL-${run.mosayer_rkm!}-BR-${totals.branchId ?? 'GLOBAL'}`,
              date: todayAr(),
              category: 'رواتب',
              subCategory: 'مسيّرة رواتب',
              amount: payrollExpense,
              description: `مسيّرة رواتب ${run.mosayer_rkm!}`,
              branchId: totals.branchId ?? undefined,
              createdBy: userId,
              paymentMethod: 'تحويل بنكي',
            });
          }
          // Mark the exact loan installments that were deducted (khasm_solaf) as paid, so a
          // collected loan can't be collected again in a later run. Uses the same window/filters
          // as the engine (findUnpaidLoanQuests) to guarantee agreement on WHICH quests.
          await this.settleDeductedLoanQuests(
            tx,
            run.mosayer_rkm!,
            run.mosayer_month!,
            run.mosayer_year!,
          );
          // Same idea for penalties (hr_gezaat) and salary-borne bonuses (hr_mokafat_details):
          // stamp the exact rows the engine collected with this run number so a recompute or an
          // overlapping-period run can't collect them twice. Same window/filters as the engine
          // (getGezaaByDate / getMokafaaByDate).
          const { fromDate, toDate } = payrollPeriod(run.mosayer_month!, run.mosayer_year!);
          await this.engine.stampConsumedPenalties(run.mosayer_rkm!, fromDate, toDate, tx);
          await this.engine.stampConsumedBonuses(run.mosayer_rkm!, fromDate, toDate, tx);
        });
        break;
      }

      case 'bank': {
        // Precondition: the run must be posted before the bank file can be issued.
        if (status !== 'posted') {
          throw new BadRequestException('يجب ترحيل المسيّرة قبل إصدار ملف البنك');
        }
        if (run.mosayer_rkm == null) {
          throw new BadRequestException('بيانات المسيرة غير مكتملة');
        }
        await this.moduleLedger.ensureChart();
        await this.prisma.$transaction(async (tx) => {
          const claimed = await tx.hr_mosayer.updateMany({
            where: {
              id,
              halet_sarf: 'yes',
              tanfez_ezn_sarf: { not: 'yes' },
              file_downloded: null,
            },
            data: {
              tanfez_ezn_sarf: 'yes',
              file_downloded: `bank_${run.mosayer_rkm ?? id}_${todayAr()}.csv`,
            },
          });
          if (claimed.count === 0) {
            throw new BadRequestException('تم إصدار ملف البنك مسبقاً');
          }
          const branchTotals = await this.getPayrollBranchTotals(run.mosayer_rkm!, tx);
          for (const totals of branchTotals) {
            await this.moduleLedger.postPayrollPayment(
              {
                payrollNumber: run.mosayer_rkm!,
                branchId: totals.branchId ?? undefined,
                date: todayAr(),
                netPay: totals.netPay,
                createdBy: userId,
              },
              tx,
            );
          }
        });
        break;
      }

      default:
        throw new BadRequestException(`إجراء غير معروف: ${action}`);
    }

    return this.findRun(id);
  }

  /**
   * Generate the bank transfer file as downloadable CSV: code, name, bank, account, net.
   * Mirrors the slip bank fields (emp_bank_id_fk / account / code / name-in-bank) per line.
   */
  async generateBankFile(id: number): Promise<{ filename: string; content: string }> {
    const run = await this.getRunOrThrow(id);
    const status = mapRunStatus(run);
    if (!['banked', 'completed'].includes(status)) {
      throw new BadRequestException('يجب تنفيذ التحويل البنكي قبل تنزيل الملف');
    }
    const lines = await this.prisma.hr_mosayer_details.findMany({
      where: { mosayer_rkm_fk: run.mosayer_rkm ?? undefined },
      orderBy: { id: 'asc' },
    });

    const header = ['emp_code', 'emp_name', 'bank', 'account', 'net'];
    const rows = lines.map((l) => [
      l.emp_code != null ? String(l.emp_code) : '',
      l.emp_name_in_bank || l.emp_name || '',
      l.bank_code || (l.emp_bank_id_fk != null ? String(l.emp_bank_id_fk) : ''),
      l.emp_bank_account_num || '',
      decimal(l.safi).toFixed(2),
    ]);

    const csv = [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
    // Prepend BOM so Arabic names render correctly in Excel.
    const content = '﻿' + csv + '\r\n';
    const filename = `bank_${run.mosayer_rkm ?? id}_${todayAr()}.csv`;

    // Persist the bank-issue flags (legacy: tanfez_ezn_sarf + file_downloded).
    await this.prisma.hr_mosayer.update({
      where: { id },
      data: { tanfez_ezn_sarf: 'yes', file_downloded: filename },
    });

    return { filename, content };
  }

  async removeRun(id: number) {
    const run = await this.getRunOrThrow(id);
    // Block deletion once the run is approved / posted / banked / completed — deleting a
    // posted run would leave settled loan quests / GL without their source document.
    const status = mapRunStatus(run);
    if (['approved', 'posted', 'banked', 'completed'].includes(status)) {
      throw new BadRequestException('لا يمكن حذف مسيّرة معتمدة أو مرحّلة أو مصروفة');
    }
    await this.prisma.$transaction(async (tx) => {
      if (run.mosayer_rkm != null) {
        // Release any penalties / bonuses stamped with this run so a corrected run can
        // collect them again (H1 consumption marker). Kept for symmetry with post: a
        // draft/computed run has none stamped yet, but an unpost path would.
        await this.engine.releaseConsumedByRun(run.mosayer_rkm, tx);
        await tx.hr_mosayer_details.deleteMany({
          where: { mosayer_rkm_fk: run.mosayer_rkm },
        });
      }
      await tx.hr_mosayer.delete({ where: { id } });
    });
    return { ok: true };
  }

  /**
   * On payroll post: mark the exact loan installments (hr_solaf_quest) that were summed into
   * khasm_solaf as paid, then close any loan whose installments are now all settled. This is
   * the CRITICAL fix for double-collection — the deduction sits in the slip but nothing was
   * marking the quests paid, so the same installment could be deducted again next run.
   *
   * WHICH quests: exactly the ones the engine deducted, via engine.findUnpaidLoanQuests (same
   * window/filters: paid='no', approved loan, due-date in the payroll window). Replicates the
   * minimal quest-update + settle logic from LoansService (autoDeduct / settleLoanIfFullyPaid)
   * because LoansService is not injectable into PayrollModule.
   */
  private async settleDeductedLoanQuests(
    tx: Prisma.TransactionClient,
    mosayerRkm: number,
    month: number,
    year: number,
  ) {
    const { fromDate, toDate } = payrollPeriod(month, year);

    // Emp codes that are actually in this run (the ones whose salary — and loan deduction —
    // was computed and persisted).
    const details = await tx.hr_mosayer_details.findMany({
      where: { mosayer_rkm_fk: mosayerRkm },
      select: { emp_code: true },
    });
    const empCodes = Array.from(
      new Set(details.map((d) => d.emp_code).filter((c): c is number => c != null)),
    );

    const affectedLoans = new Set<number>();
    const nowDate = todayAr();
    const nowTime = new Date().toTimeString().slice(0, 8);

    for (const empCode of empCodes) {
      const quests = await this.engine.findUnpaidLoanQuests(empCode, fromDate, toDate, tx);
      if (!quests.length) continue;
      await tx.hr_solaf_quest.updateMany({
        where: { id: { in: quests.map((q) => q.id) } },
        data: { paid: 'yes', date_paid: nowDate, time_paid: nowTime },
      });
      for (const q of quests) {
        if (q.t_rkm_fk != null) affectedLoans.add(q.t_rkm_fk);
      }
    }

    // Close (ended='yes') any loan whose installments are now all paid — mirrors
    // LoansService.settleLoanIfFullyPaid.
    for (const tRkm of affectedLoans) {
      const outstanding = await tx.hr_solaf_quest.count({
        where: { t_rkm_fk: tRkm, paid: { not: 'yes' } },
      });
      if (outstanding === 0) {
        await tx.hr_solaf.updateMany({ where: { t_rkm: tRkm }, data: { ended: 'yes' } });
      }
    }
  }

  // ─── Persistence helpers ──────────────────────────────────────────────────

  private async assertAllActiveEmployeesHaveSalary() {
    const employees = await this.prisma.employees.findMany({
      where: {
        employee_type: 1,
        OR: [{ leave_emp: null }, { leave_emp: 0 }],
      },
      select: { id: true, emp_code: true, employee: true, basic_salary: true },
      orderBy: { id: 'asc' },
    });
    if (employees.length === 0) {
      throw new BadRequestException('لا يوجد موظفون نشطون لإنشاء مسيّرة رواتب');
    }
    const missing = employees.filter((employee) => decimal(employee.basic_salary) <= 0);
    if (missing.length > 0) {
      const names = missing
        .slice(0, 5)
        .map((employee) => `${employee.employee ?? 'موظف'} (${employee.emp_code ?? employee.id})`)
        .join('، ');
      const suffix = missing.length > 5 ? ` و${missing.length - 5} آخرين` : '';
      throw new BadRequestException(`يجب إدخال الراتب الأساسي للموظفين: ${names}${suffix}`);
    }
  }

  private async getPayrollBranchTotals(
    mosayerRkm: number,
    client: Prisma.TransactionClient = this.prisma,
  ): Promise<PayrollBranchTotals[]> {
    const details = await client.hr_mosayer_details.findMany({
      where: { mosayer_rkm_fk: mosayerRkm },
      select: {
        emp_id: true,
        total_esthkak: true,
        total_khsomat: true,
        safi: true,
        khasm_tamen: true,
        tamin_hesa_oner: true,
        khasm_solaf: true,
      },
    });
    if (details.length === 0) {
      throw new BadRequestException('لا توجد بنود موظفين في مسيّرة الرواتب');
    }
    const employeeIds = Array.from(
      new Set(details.map((detail) => detail.emp_id).filter((id): id is number => id != null)),
    );
    const employees = employeeIds.length
      ? await client.employees.findMany({
          where: { id: { in: employeeIds } },
          select: { id: true, branch_id_fk: true },
        })
      : [];
    const employeeBranches = new Map(employees.map((employee) => [employee.id, employee.branch_id_fk]));
    const grouped = new Map<string, PayrollBranchTotals>();
    for (const detail of details) {
      const branchId = detail.emp_id == null ? null : (employeeBranches.get(detail.emp_id) ?? null);
      const key = branchId == null ? 'global' : String(branchId);
      const totals = grouped.get(key) ?? {
        branchId,
        grossEarnings: 0,
        totalDeductions: 0,
        netPay: 0,
        employeeInsurance: 0,
        employerInsurance: 0,
        loanDeductions: 0,
        nonLiabilityDeductions: 0,
      };
      const totalDeductions = decimal(detail.total_khsomat);
      const employeeInsurance = decimal(detail.khasm_tamen);
      const loanDeductions = decimal(detail.khasm_solaf);
      totals.grossEarnings += decimal(detail.total_esthkak);
      totals.totalDeductions += totalDeductions;
      totals.netPay += decimal(detail.safi);
      totals.employeeInsurance += employeeInsurance;
      totals.employerInsurance += decimal(detail.tamin_hesa_oner);
      totals.loanDeductions += loanDeductions;
      totals.nonLiabilityDeductions += totalDeductions - employeeInsurance - loanDeductions;
      grouped.set(key, totals);
    }
    return Array.from(grouped.values()).map((totals) => ({
      ...totals,
      grossEarnings: payrollMoney(totals.grossEarnings),
      totalDeductions: payrollMoney(totals.totalDeductions),
      netPay: payrollMoney(totals.netPay),
      employeeInsurance: payrollMoney(totals.employeeInsurance),
      employerInsurance: payrollMoney(totals.employerInsurance),
      loanDeductions: payrollMoney(totals.loanDeductions),
      nonLiabilityDeductions: payrollMoney(totals.nonLiabilityDeductions),
    }));
  }

  private assertPayrollTotalsBalanced(totals: PayrollBranchTotals, mosayerRkm: number) {
    const creditAllocation = payrollMoney(
      totals.netPay +
        totals.employeeInsurance +
        totals.loanDeductions +
        totals.nonLiabilityDeductions,
    );
    if (
      totals.nonLiabilityDeductions < 0 ||
      Math.abs(totals.grossEarnings - creditAllocation) > 0.01
    ) {
      throw new BadRequestException(
        `لا يمكن ترحيل مسيّرة ${mosayerRkm}: الخصومات تتجاوز المستحقات أو الصافي غير مطابق`,
      );
    }
  }

  private async persistComputedSalaries(
    headerId: number,
    mosayerRkm: number,
    month: number,
    year: number,
  ) {
    const computed = await this.engine.computeAll(month, year);
    const manualRows = await this.prisma.hr_mosayer_egraat.findMany({
      where: {
        mosayer_rkm_fk: mosayerRkm,
        badal_code: { in: ['private_bonus', 'taqeem', 'target'] },
      },
      select: { emp_id: true, new_value: true },
    });
    const manualByEmployee = new Map<number, number>();
    for (const manualRow of manualRows) {
      const employeeId = Number(manualRow.emp_id);
      if (!Number.isFinite(employeeId)) continue;
      manualByEmployee.set(employeeId, (manualByEmployee.get(employeeId) ?? 0) + (manualRow.new_value ?? 0));
    }
    for (const row of computed) {
      const manual = manualByEmployee.get(row.empId) ?? 0;
      if (!manual) continue;
      row.manualEarnings = manual;
      row.totalEsthkak = payrollMoney(row.totalEsthkak + manual);
      row.safi = payrollMoney(row.safi + manual);
    }
    const totals = this.aggregateTotals(computed);

    // Atomic: delete old detail rows, re-create them, and update the header in ONE transaction so a
    // crash mid-loop can't leave a half-written payroll run (header totals out of sync with details).
    await this.prisma.$transaction(async (tx) => {
      await tx.hr_mosayer_details.deleteMany({ where: { mosayer_rkm_fk: mosayerRkm } });
      for (const c of computed) {
        await tx.hr_mosayer_details.create({ data: this.toDetailRow(mosayerRkm, c) });
      }
      await tx.hr_mosayer.update({
        where: { id: headerId },
        data: {
          ...totals,
          total: computed.length,
          taghez: 'yes',
          taghez_date_ar: todayAr(),
          taghez_time: timeAr(),
        },
      });
    });
  }

  private toDetailRow(mosayerRkm: number, c: ComputedEmployeeSalary): Prisma.hr_mosayer_detailsCreateInput {
    return {
      mosayer_rkm_fk: mosayerRkm,
      emp_id: c.empId,
      emp_code: c.empCode,
      emp_name: c.empName,
      mosma_wazefy_n: c.mosmaWazefyN,
      emp_bank_id_fk: c.bankId ?? undefined,
      emp_bank_account_num: c.bankAccount ?? undefined,
      bank_code: c.bankCode ?? undefined,
      emp_name_in_bank: c.nameInBank ?? undefined,
      rateb_asasy: c.ratebAsasy,
      badal_sakn: c.badalSakn,
      badal_mowaslat: c.badalMowaslat,
      badal_etsal: c.badalEtsal,
      badal_e3asha: c.badalE3asha,
      badal_tabe3a_amal: c.badalTabe3aAmal,
      badal_taklef: c.badalTaklef,
      tot_edafi: c.totEdafi,
      tot_mokafaa: c.totMokafaa,
      tot_entdab: c.totEntdab,
      tot_okraa_esthkaq: c.manualEarnings,
      total_esthkak: c.totalEsthkak,
      khasm_keyab: c.khasmKeyab,
      agaza_bdon_rateb: c.agazaBdonRateb,
      khasm_takher: c.khasmTakher,
      khasm_gezaa: c.khasmGezaa,
      khasm_tamen: c.khasmTamen,
      tamin_hesa_oner: c.taminHesaOner,
      khasm_solaf: c.khasmSolaf,
      tot_okraa_khasm: c.totOkraaKhasm,
      total_khsomat: c.totalKhsomat,
      safi: c.safi,
      agr_sa3a: c.agrSa3a,
      ayam_amal: c.breakdown?.workDays != null ? Number(c.breakdown.workDays) : 30,
      sa3at_amal: c.breakdown?.workHours != null ? Number(c.breakdown.workHours) : 8,
      taghez: 'no',
    };
  }

  /**
   * Recompute the hr_mosayer header totals (egmali_* / egmali_safi) by summing the persisted
   * detail rows. Used after a slip override so the header stays in sync with its lines.
   */
  private async recomputeHeaderTotals(
    tx: Prisma.TransactionClient,
    mosayerRkm: number | null,
    headerId: number,
  ) {
    if (mosayerRkm == null) return;
    const agg = await tx.hr_mosayer_details.aggregate({
      where: { mosayer_rkm_fk: mosayerRkm },
      _sum: {
        rateb_asasy: true,
        badal_sakn: true,
        badal_mowaslat: true,
        badal_etsal: true,
        badal_e3asha: true,
        badal_tabe3a_amal: true,
        badal_taklef: true,
        tot_edafi: true,
        tot_mokafaa: true,
        tot_entdab: true,
        tot_okraa_esthkaq: true,
        total_esthkak: true,
        khasm_keyab: true,
        agaza_bdon_rateb: true,
        khasm_takher: true,
        khasm_gezaa: true,
        khasm_tamen: true,
        tamin_hesa_oner: true,
        khasm_solaf: true,
        tot_okraa_khasm: true,
        total_khsomat: true,
        safi: true,
      },
    });
    const s = agg._sum;
    const n = (v: Prisma.Decimal | null) => decimal(v);
    await tx.hr_mosayer.update({
      where: { id: headerId },
      data: {
        egmali_rateb_asasy: n(s.rateb_asasy),
        egmali_badal_sakn: n(s.badal_sakn),
        egmali_badal_mowaslat: n(s.badal_mowaslat),
        egmali_badal_etsal: n(s.badal_etsal),
        egmali_badal_e3asha: n(s.badal_e3asha),
        egmali_badal_tabe3a_amal: n(s.badal_tabe3a_amal),
        egmali_badal_taklef: n(s.badal_taklef),
        egmali_tot_edafi: n(s.tot_edafi),
        egmali_tot_mokafaa: n(s.tot_mokafaa),
        egmali_tot_entdab: n(s.tot_entdab),
        egmali_tot_okraa_esthkaq: n(s.tot_okraa_esthkaq),
        egmali_total_esthkak: n(s.total_esthkak),
        egmali_khasm_keyab: n(s.khasm_keyab),
        egmali_agaza_bdon_rateb: n(s.agaza_bdon_rateb),
        egmali_khasm_takher: n(s.khasm_takher),
        egmali_khasm_gezaa: n(s.khasm_gezaa),
        egmali_khasm_tamen: n(s.khasm_tamen),
        egmali_tamin_hesa_oner: n(s.tamin_hesa_oner),
        egmali_khasm_solaf: n(s.khasm_solaf),
        egmali_tot_okraa_khasm: n(s.tot_okraa_khasm),
        egmali_total_khsomat: n(s.total_khsomat),
        egmali_safi: n(s.safi),
      },
    });
  }

  private aggregateTotals(rows: ComputedEmployeeSalary[]) {
    const sum = (fn: (r: ComputedEmployeeSalary) => number) =>
      rows.reduce((a, r) => a + fn(r), 0);

    return {
      egmali_rateb_asasy: sum((r) => r.ratebAsasy),
      egmali_badal_sakn: sum((r) => r.badalSakn),
      egmali_badal_mowaslat: sum((r) => r.badalMowaslat),
      egmali_badal_etsal: sum((r) => r.badalEtsal),
      egmali_badal_e3asha: sum((r) => r.badalE3asha),
      egmali_badal_tabe3a_amal: sum((r) => r.badalTabe3aAmal),
      egmali_badal_taklef: sum((r) => r.badalTaklef),
      egmali_tot_edafi: sum((r) => r.totEdafi),
      egmali_tot_mokafaa: sum((r) => r.totMokafaa),
      egmali_tot_entdab: sum((r) => r.totEntdab),
      egmali_tot_okraa_esthkaq: sum((r) => r.manualEarnings),
      egmali_total_esthkak: sum((r) => r.totalEsthkak),
      egmali_khasm_keyab: sum((r) => r.khasmKeyab),
      egmali_agaza_bdon_rateb: sum((r) => r.agazaBdonRateb),
      egmali_khasm_takher: sum((r) => r.khasmTakher),
      egmali_khasm_gezaa: sum((r) => r.khasmGezaa),
      egmali_khasm_tamen: sum((r) => r.khasmTamen),
      egmali_tamin_hesa_oner: sum((r) => r.taminHesaOner),
      egmali_khasm_solaf: sum((r) => r.khasmSolaf),
      egmali_tot_okraa_khasm: sum((r) => r.totOkraaKhasm),
      egmali_total_khsomat: sum((r) => r.totalKhsomat),
      egmali_safi: sum((r) => r.safi),
    };
  }

  private async getRunOrThrow(id: number) {
    const row = await this.prisma.hr_mosayer.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('مسيرة الرواتب غير موجودة');
    return row;
  }

  private toRunRow(row: {
    id: number;
    mosayer_month: number | null;
    mosayer_year: number | null;
    egmali_safi: Prisma.Decimal | null;
    mosayer_date_ar: string | null;
    taghez: string | null;
    suspend_mohasb: string | null;
    suspend_direct_manager: string | null;
    suspend_moder_mali: string | null;
    suspend_moder_3am: string | null;
    approved: number | null;
    halet_sarf: string | null;
    file_downloded: string | null;
    tanfez_ezn_sarf: string | null;
    finish_sarf_date: string | null;
  }) {
    const month = row.mosayer_month ?? 0;
    const year = row.mosayer_year ?? 0;
    return {
      id: row.id,
      title: runTitle(month, year),
      month: monthLabel(month),
      year,
      totalAmount: decimal(row.egmali_safi),
      status: mapRunStatus(row as Parameters<typeof mapRunStatus>[0]),
      createdAt: row.mosayer_date_ar ?? undefined,
    };
  }

  private toLineRow(line: {
    id: number;
    emp_code: number | null;
    emp_name: string | null;
    rateb_asasy: Prisma.Decimal | null;
    total_esthkak: Prisma.Decimal | null;
    total_khsomat: Prisma.Decimal | null;
    safi: Prisma.Decimal | null;
  }) {
    const basic = decimal(line.rateb_asasy);
    const totalE = decimal(line.total_esthkak);
    return {
      id: line.id,
      empCode: line.emp_code != null ? String(line.emp_code) : undefined,
      employeeName: line.emp_name ?? undefined,
      basicSalary: basic,
      allowances: totalE - basic,
      deductions: decimal(line.total_khsomat),
      netSalary: decimal(line.safi),
    };
  }

  private toSalaryPreviewRow(row: ComputedEmployeeSalary, branchName?: string) {
    const breakdown = row.breakdown as {
      hoursEdafi?: number;
      sheftEdafi?: number;
      hoursEdafiValue?: number;
      daysEdafiValue?: number;
      absenceDays?: number;
      paidLeaveDays?: number;
      unpaidLeaveDays?: number;
      forgottenFingerprint?: { count?: number; deductionDays?: number };
      late?: { lateWithPermission?: number; lateWithoutPermission?: number };
      khasmTakherAmount?: number;
      khasmEznAmount?: number;
      incentives?: {
        targetBase?: number;
        targetCommission?: number;
        proteinCommission?: number;
        classCommission?: number;
      };
    };
    return {
      id: row.empId,
      empCode: row.empCode,
      employeeName: row.empName,
      jobTitle: row.mosmaWazefyN,
      branchId: row.branchId,
      branchName: row.branchId === 0 ? 'الإدارة' : branchName ?? '—',
      basicSalary: row.ratebAsasy,
      fixedAllowance: row.badalSakn,
      variableAllowance: row.badalMowaslat,
      bonusAllowance: row.badalTabe3aAmal,
      grantAllowance: row.badalTaklef,
      incentiveAllowance: row.badalEtsal,
      dayWage: row.agrYom,
      hourWage: row.agrSa3a,
      overtimeHours: breakdown.hoursEdafi ?? 0,
      overtimeHoursValue: breakdown.hoursEdafiValue ?? 0,
      overtimeDays: breakdown.sheftEdafi ?? 0,
      overtimeDaysValue: breakdown.daysEdafiValue ?? 0,
      salaryIncrease: row.zeyadaRateb,
      rewards: row.totMokafaa,
      classCommission: breakdown.incentives?.classCommission ?? 0,
      proteinCommission: breakdown.incentives?.proteinCommission ?? 0,
      targetBase: breakdown.incentives?.targetBase ?? 0,
      targetCommission: breakdown.incentives?.targetCommission ?? 0,
      totalEarnings: row.totalEsthkak,
      absenceDays: breakdown.absenceDays ?? 0,
      absenceValue: row.khasmKeyab,
      paidLeaveDays: breakdown.paidLeaveDays ?? 0,
      paidLeaveValue: row.khasmAgazat,
      unpaidLeaveDays: breakdown.unpaidLeaveDays ?? 0,
      unpaidLeaveValue: row.agazaBdonRateb,
      lateMinutes: breakdown.late?.lateWithoutPermission ?? 0,
      lateValue: breakdown.khasmTakherAmount ?? 0,
      permissionMinutes: breakdown.late?.lateWithPermission ?? 0,
      permissionValue: breakdown.khasmEznAmount ?? 0,
      forgottenFingerprintCount: breakdown.forgottenFingerprint?.count ?? 0,
      forgottenFingerprintValue: row.khasmBasma,
      penalties: row.khasmGezaa,
      insurance: row.khasmTamen,
      loans: row.khasmSolaf,
      totalDeductions: row.totalKhsomat,
      netSalary: row.safi,
    };
  }

  private toSalaryIncreaseRow(row: {
    id: number;
    emp_id_fk: number;
    emp_code: number;
    emp_name: string;
    value: Prisma.Decimal;
    date_ar: string;
    publisher: number;
  }) {
    return {
      id: row.id,
      employeeId: row.emp_id_fk,
      employeeCode: row.emp_code,
      employeeName: row.emp_name,
      value: decimal(row.value),
      date: row.date_ar,
      publisher: row.publisher,
    };
  }
}

function unixDate(date: string): string {
  return String(Math.floor(new Date(`${date}T00:00:00Z`).getTime() / 1000));
}
