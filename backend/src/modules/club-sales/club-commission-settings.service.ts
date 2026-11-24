import { Prisma } from '@prisma/client';
import { effectiveSalesSettings, readSalesDefaults } from './sales-defaults';
import { resolveSalesCommission } from './sales-commission-calculation';
import { BadRequestException, ForbiddenException, Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { JwtUser } from '../../common/types/jwt-user';
import { EmployeesService } from '../employees/employees.service';
import { pickCommissionTier, type CommissionTierInput } from './club-sales.constants';
import { SalesDefaultsDto, UpsertSalesRepSettingsDto } from './dto/leads.dto';
import { localDateString } from '../club-fitness/club-fitness.utils';
import { normalizeTargetPeriod, resolveTargetCycle } from './target-period';

@Injectable()
export class ClubCommissionSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly employees: EmployeesService,
    @Optional() private readonly branchScope?: BranchScopeService,
  ) {}

  /**
   * `null` = unrestricted (level 1, or an internal call without a user). Without the scope
   * service only level 1 stays unrestricted and every other user fails closed.
   */
  private allowedBranchIds(user: JwtUser | undefined): number[] | null {
    if (!user) return null;
    if (this.branchScope) return this.branchScope.allowedBranchIds(user);
    return user.level === 1 ? null : [];
  }

  /** A rep's current branches: the employee's primary branch plus the extra sales assignments. */
  private async repCurrentBranchIds(employeeId: number): Promise<number[]> {
    const [employee, assignments] = await Promise.all([
      this.prisma.employees.findUnique({ where: { id: employeeId }, select: { branch_id_fk: true } }),
      this.prisma.club_sales_rep_branches.findMany({
        where: { employee_id: employeeId },
        select: { branch_id: true },
      }),
    ]);
    return [...new Set([
      ...(employee?.branch_id_fk ? [employee.branch_id_fk] : []),
      ...assignments.map((row) => row.branch_id),
    ])];
  }

  private validateTiers(tiers: CommissionTierInput[] | undefined) {
    const rows = (tiers ?? []).map((tier) => ({
      minAchievementPct: Number(tier.minAchievementPct),
      maxAchievementPct: tier.maxAchievementPct == null || tier.maxAchievementPct === undefined
        ? null
        : Number(tier.maxAchievementPct),
      commissionPercent: Number(tier.commissionPercent),
      label: tier.label ?? null,
    }));
    for (const tier of rows) {
      if (!Number.isFinite(tier.minAchievementPct) || tier.minAchievementPct < 0) {
        throw new BadRequestException('حد النسبة الأدنى غير صالح');
      }
      if (tier.maxAchievementPct != null && tier.maxAchievementPct < tier.minAchievementPct) {
        throw new BadRequestException('الحد الأعلى يجب أن يكون أكبر من الأدنى');
      }
      if (!Number.isFinite(tier.commissionPercent) || tier.commissionPercent < 0 || tier.commissionPercent > 100) {
        throw new BadRequestException('نسبة العمولة يجب أن تكون بين 0 و 100');
      }
    }
    return rows;
  }

  async listSalesRepsWithSettings(user?: JwtUser) {
    const allowed = this.allowedBranchIds(user);
    // A scoped manager only sees the reps who work in (at least one of) their branches.
    const reps = (await this.employees.salesReps()).filter((rep) =>
      allowed === null || rep.branchIds.some((branchId) => allowed.includes(branchId)));
    const settings = await this.prisma.club_sales_rep_settings.findMany({
      include: { tiers: { orderBy: { min_achievement_pct: 'asc' } } },
    });
    const defaults = await readSalesDefaults(this.prisma);
    const byEmployee = new Map(settings.map((row) => [row.employee_id, row]));
    const today = localDateString();
    return reps.map((rep) => {
      const row = effectiveSalesSettings(byEmployee.get(rep.id), defaults);
      return {
        ...rep,
        isActive: row.is_active,
        useDefaultSettings: row.use_default_settings,
        monthlyTarget: row ? Number(row.monthly_target) : 0,
        commissionMode: row?.commission_mode ?? 'flat',
        flatCommissionPercent: row ? Number(row.flat_commission_percent) : 0,
        targetPeriodMode: row?.target_period_mode ?? 'monthly',
        targetStartDate: row?.target_start_date ?? null,
        targetEndDate: row?.target_end_date ?? null,
        targetDays: row?.target_days ?? null,
        currentCycle: resolveTargetCycle({
          mode: row?.target_period_mode,
          startDate: row?.target_start_date,
          endDate: row?.target_end_date,
          days: row?.target_days,
        }, today),
        tiers: (row?.tiers ?? []).map((tier) => ({
          id: tier.id,
          minAchievementPct: Number(tier.min_achievement_pct),
          maxAchievementPct: tier.max_achievement_pct == null ? null : Number(tier.max_achievement_pct),
          commissionPercent: Number(tier.commission_percent),
          label: tier.label,
        })),
      };
    });
  }

  async getSalesDefaults() {
    const row = await readSalesDefaults(this.prisma);
    return { monthlyTarget: Number(row.monthly_target), commissionMode: row.commission_mode, flatCommissionPercent: Number(row.flat_commission_percent),
      targetPeriodMode: row.target_period_mode, targetStartDate: row.target_start_date, targetEndDate: row.target_end_date, targetDays: row.target_days,
      tiers: row.tiers.map(t => ({ minAchievementPct: Number(t.min_achievement_pct), maxAchievementPct: t.max_achievement_pct == null ? null : Number(t.max_achievement_pct), commissionPercent: Number(t.commission_percent), label: t.label })) };
  }

  async saveSalesDefaults(dto: SalesDefaultsDto) {
    const tiers = this.validateTiers(dto.tiers);
    if (dto.commissionMode === 'tiered' && !tiers.length) throw new BadRequestException('أضف شرائح عمولة عند اختيار النظام المتدرج');
    if (!Number.isFinite(Number(dto.flatCommissionPercent ?? 0)) || Number(dto.flatCommissionPercent ?? 0) < 0 || Number(dto.flatCommissionPercent ?? 0) > 100) throw new BadRequestException('نسبة العمولة يجب أن تكون بين 0 و100');
    const period = normalizeTargetPeriod({ mode: dto.targetPeriodMode, startDate: dto.targetPeriodMode === 'days' ? dto.targetStartDate || localDateString() : dto.targetStartDate, endDate: dto.targetEndDate, days: dto.targetDays });
    const settings = { monthly_target: dto.monthlyTarget, commission_mode: dto.commissionMode, flat_commission_percent: dto.flatCommissionPercent ?? 0,
      target_period_mode: period.mode, target_start_date: period.startDate, target_end_date: period.endDate, target_days: period.days,
      tiers: tiers.map(t => ({ min_achievement_pct: t.minAchievementPct, max_achievement_pct: t.maxAchievementPct, commission_percent: t.commissionPercent, label: t.label })) } as Prisma.InputJsonValue;
    await this.prisma.club_sales_defaults.upsert({ where: { id: 1 }, create: { id: 1, settings }, update: { settings } });
    return this.getSalesDefaults();
  }

  async upsertSalesRep(dto: UpsertSalesRepSettingsDto, user?: JwtUser) {
    if (!user) throw new ForbiddenException('هوية منفّذ العملية مطلوبة');
    const allowed = this.allowedBranchIds(user);
    // A scoped manager may only configure a rep who currently works in one of their branches.
    const currentBranchIds = allowed === null ? null : await this.repCurrentBranchIds(dto.employeeId);
    if (allowed !== null && (!currentBranchIds!.length || !currentBranchIds!.every((branchId) => allowed.includes(branchId)))) {
      throw new ForbiddenException('لا تملك صلاحية الوصول لبيانات هذا الفرع');
    }
    if (dto.isActive !== undefined) throw new BadRequestException('غيّر الحالة من زر نشاط الأخصائي لنقل العملاء معه');
    if (Number(dto.flatCommissionPercent ?? 0) < 0 || Number(dto.flatCommissionPercent ?? 0) > 100) throw new BadRequestException('نسبة العمولة يجب أن تكون بين 0 و100');
    const tiers = this.validateTiers(dto.tiers);
    const period = normalizeTargetPeriod({
      mode: dto.targetPeriodMode,
      startDate: dto.targetPeriodMode === 'days' ? (dto.targetStartDate || localDateString()) : dto.targetStartDate,
      endDate: dto.targetEndDate,
      days: dto.targetDays,
    });
    if (dto.commissionMode === 'tiered' && !tiers.length) {
      throw new BadRequestException('أضف شرائح عمولة عند اختيار النظام المتدرج');
    }
    let assignedBranchIds: number[] | null = null;
    if (dto.branchIds !== undefined) {
      const rep = (await this.employees.salesReps()).find((row) => row.id === dto.employeeId);
      if (!rep) throw new BadRequestException('أخصائي المبيعات غير موجود أو غير نشط');
      let requested = [...new Set(dto.branchIds.map(Number))]
        .filter((branchId) => Number.isInteger(branchId) && branchId > 0);
      if (allowed !== null) {
        // Adding a branch outside the caller's scope is denied; an out-of-scope branch the rep
        // already holds may be echoed back unchanged, and is kept even when omitted, so a scoped
        // manager can neither move a rep into nor pull them out of another branch.
        const current = currentBranchIds!;
        const foreign = requested.filter((branchId) =>
          branchId !== rep.branchId && !allowed.includes(branchId) && !current.includes(branchId));
        if (foreign.length) throw new ForbiddenException('لا تملك صلاحية الوصول لبيانات هذا الفرع');
        const keptOutOfScope = current.filter((branchId) =>
          branchId !== rep.branchId && !allowed.includes(branchId));
        requested = [...new Set([...requested, ...keptOutOfScope])];
      }
      assignedBranchIds = [
        ...(rep.branchId ? [rep.branchId] : []),
        ...requested.filter((branchId) => branchId !== rep.branchId).sort((a, b) => a - b),
      ];
      const existingBranches = await this.prisma.tbl_branches.count({
        where: { branch_id: { in: assignedBranchIds } },
      });
      if (!assignedBranchIds.length || existingBranches !== assignedBranchIds.length) {
        throw new BadRequestException('اختيارات الفروع غير صحيحة');
      }
    }
    const row = await this.prisma.$transaction(async (tx) => {
      const employee = await tx.employees.findUnique({ where: { id: dto.employeeId }, select: { branch_id_fk: true } });
      const extras = await tx.club_sales_rep_branches.findMany({ where: { employee_id: dto.employeeId }, select: { branch_id: true } });
      const current = [employee?.branch_id_fk ?? 0, ...extras.map(row => row.branch_id)];
      if (!employee || (allowed !== null && current.some(id => !allowed.includes(id)))) throw new ForbiddenException('إعدادات الأخصائي اللي بيعمل في فروع تانية يحددها مدير النظام');
      if (allowed !== null && assignedBranchIds?.some(id => !allowed.includes(id))) throw new ForbiddenException('لا تملك صلاحية الوصول لبيانات هذا الفرع');
      const settings = await tx.club_sales_rep_settings.upsert({
        where: { employee_id: dto.employeeId },
        create: {
          employee_id: dto.employeeId,
          use_default_settings: dto.useDefaultSettings ?? false,
          ...(dto.isActive !== undefined ? { is_active: dto.isActive } : {}),
          monthly_target: Number(dto.monthlyTarget) || 0,
          commission_mode: dto.commissionMode,
          flat_commission_percent: Number(dto.flatCommissionPercent) || 0,
          target_period_mode: period.mode,
          target_start_date: period.startDate,
          target_end_date: period.endDate,
          target_days: period.days,
        },
        update: {
          use_default_settings: dto.useDefaultSettings ?? false,
          ...(dto.isActive !== undefined ? { is_active: dto.isActive } : {}),
          monthly_target: Number(dto.monthlyTarget) || 0,
          commission_mode: dto.commissionMode,
          flat_commission_percent: Number(dto.flatCommissionPercent) || 0,
          target_period_mode: period.mode,
          target_start_date: period.startDate,
          target_end_date: period.endDate,
          target_days: period.days,
        },
      });
      // Tiers are stored whatever the active mode is. Wiping them on the flat mode meant
      // switching back to tiered handed the manager the built-in defaults again, which read
      // as "my settings were never saved".
      if (tiers.length) {
        await tx.club_sales_commission_tiers.deleteMany({ where: { settings_id: settings.id } });
        await tx.club_sales_commission_tiers.createMany({
          data: tiers.map((tier) => ({
            settings_id: settings.id,
            min_achievement_pct: tier.minAchievementPct,
            max_achievement_pct: tier.maxAchievementPct,
            commission_percent: tier.commissionPercent,
            label: tier.label ?? null,
          })),
        });
      }
      if (assignedBranchIds) {
        await tx.club_sales_rep_branches.deleteMany({ where: { employee_id: dto.employeeId } });
        await tx.club_sales_rep_branches.createMany({
          data: assignedBranchIds.map((branchId) => ({
            employee_id: dto.employeeId,
            branch_id: branchId,
          })),
          skipDuplicates: true,
        });
      }
      return tx.club_sales_rep_settings.findUnique({
        where: { id: settings.id },
        include: { tiers: { orderBy: { min_achievement_pct: 'asc' } } },
      });
    });
    return row;
  }

  resolveSalesCommission(...args: Parameters<typeof resolveSalesCommission>) {
    return resolveSalesCommission(...args);
  }
}
