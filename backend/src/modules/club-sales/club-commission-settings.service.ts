import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EmployeesService } from '../employees/employees.service';
import { pickCommissionTier, type CommissionTierInput } from './club-sales.constants';
import { UpsertSalesDefaultsDto, UpsertSalesRepSettingsDto, UpsertTrainerCommissionDto } from './dto/leads.dto';
import { localDateString } from '../club-fitness/club-fitness.utils';
import { normalizeTargetPeriod, resolveTargetCycle } from './target-period';
import { resolveSalesSettings, validateCommissionTiers, type SalesFinancialSettings } from './sales-defaults';

@Injectable()
export class ClubCommissionSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly employees: EmployeesService,
  ) {}

  private validateTiers(tiers: CommissionTierInput[] | undefined) {
    try {
      return validateCommissionTiers(tiers ?? []);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'شرائح العمولة غير صالحة');
    }
  }

  async getSalesDefaults(): Promise<SalesFinancialSettings> {
    const row = await this.prisma.club_sales_default_settings.findUnique({
      where: { id: 1 },
      include: { tiers: { orderBy: { min_achievement_pct: 'asc' } } },
    });
    return {
      monthlyTarget: Number(row?.monthly_target ?? 0),
      commissionMode: row?.commission_mode === 'tiered' ? 'tiered' as const : 'flat' as const,
      flatCommissionPercent: Number(row?.flat_commission_percent ?? 0),
      targetPeriodMode: row?.target_period_mode === 'custom' || row?.target_period_mode === 'days' ? row.target_period_mode : 'monthly' as const,
      targetStartDate: row?.target_start_date ?? null,
      targetEndDate: row?.target_end_date ?? null,
      targetDays: row?.target_days ?? null,
      tiers: (row?.tiers ?? []).map((tier) => ({
        minAchievementPct: Number(tier.min_achievement_pct),
        maxAchievementPct: tier.max_achievement_pct == null ? null : Number(tier.max_achievement_pct),
        commissionPercent: Number(tier.commission_percent),
        label: tier.label,
      })),
    };
  }

  async upsertSalesDefaults(dto: UpsertSalesDefaultsDto) {
    const tiers = this.validateTiers(dto.tiers);
    if (dto.commissionMode === 'tiered' && !tiers.length) throw new BadRequestException('أضف شرائح عمولة للإعدادات الافتراضية');
    const period = normalizeTargetPeriod({
      mode: dto.targetPeriodMode,
      startDate: dto.targetPeriodMode === 'days' ? (dto.targetStartDate || localDateString()) : dto.targetStartDate,
      endDate: dto.targetEndDate,
      days: dto.targetDays,
    });
    await this.prisma.$transaction(async (tx) => {
      await tx.club_sales_default_settings.upsert({
        where: { id: 1 },
        create: { id: 1, monthly_target: Number(dto.monthlyTarget) || 0, commission_mode: dto.commissionMode, flat_commission_percent: Number(dto.flatCommissionPercent) || 0, target_period_mode: period.mode, target_start_date: period.startDate, target_end_date: period.endDate, target_days: period.days },
        update: { monthly_target: Number(dto.monthlyTarget) || 0, commission_mode: dto.commissionMode, flat_commission_percent: Number(dto.flatCommissionPercent) || 0, target_period_mode: period.mode, target_start_date: period.startDate, target_end_date: period.endDate, target_days: period.days },
      });
      await tx.club_sales_default_commission_tiers.deleteMany({ where: { settings_id: 1 } });
      if (dto.commissionMode === 'tiered' && tiers.length) await tx.club_sales_default_commission_tiers.createMany({ data: tiers.map((tier) => ({ settings_id: 1, min_achievement_pct: tier.minAchievementPct, max_achievement_pct: tier.maxAchievementPct, commission_percent: tier.commissionPercent, label: tier.label })) });
    });
    return this.getSalesDefaults();
  }

  async listSalesRepsWithSettings() {
    const reps = await this.employees.salesReps({ includeInactive: true });
    const settings = await this.prisma.club_sales_rep_settings.findMany({
      include: { tiers: { orderBy: { min_achievement_pct: 'asc' } } },
    });
    const byEmployee = new Map(settings.map((row) => [row.employee_id, row]));
    const today = localDateString();
    const defaults = await this.getSalesDefaults();
    return reps.map((rep) => {
      const row = byEmployee.get(rep.id);
      const effective = resolveSalesSettings({
        useDefaults: row?.use_defaults ?? true,
        monthlyTarget: Number(row?.monthly_target ?? 0),
        commissionMode: row?.commission_mode === 'tiered' ? 'tiered' : 'flat',
        flatCommissionPercent: Number(row?.flat_commission_percent ?? 0),
        targetPeriodMode: row?.target_period_mode === 'custom' || row?.target_period_mode === 'days' ? row.target_period_mode : 'monthly',
        targetStartDate: row?.target_start_date,
        targetEndDate: row?.target_end_date,
        targetDays: row?.target_days,
        tiers: (row?.tiers ?? []).map((tier) => ({ minAchievementPct: Number(tier.min_achievement_pct), maxAchievementPct: tier.max_achievement_pct == null ? null : Number(tier.max_achievement_pct), commissionPercent: Number(tier.commission_percent), label: tier.label })),
      }, defaults);
      return {
        ...rep,
        useDefaults: row?.use_defaults ?? true,
        isActive: row?.is_active ?? rep.isActive,
        monthlyTarget: effective.monthlyTarget,
        commissionMode: effective.commissionMode,
        flatCommissionPercent: effective.flatCommissionPercent,
        targetPeriodMode: effective.targetPeriodMode,
        targetStartDate: effective.targetStartDate ?? null,
        targetEndDate: effective.targetEndDate ?? null,
        targetDays: effective.targetDays ?? null,
        currentCycle: resolveTargetCycle({
          mode: effective.targetPeriodMode,
          startDate: effective.targetStartDate,
          endDate: effective.targetEndDate,
          days: effective.targetDays,
        }, today),
        tiers: effective.tiers,
      };
    });
  }

  async upsertSalesRep(dto: UpsertSalesRepSettingsDto) {
    const rep = (await this.employees.salesReps({ includeInactive: true })).find((row) => row.id === dto.employeeId);
    if (!rep) throw new BadRequestException('أنشئ الموظف أولًا بمسمى أخصائي مبيعات من شاشة الموظفين');
    if (dto.branchIds && !dto.branchIds.length) throw new BadRequestException('اختر فرعًا واحدًا على الأقل للأخصائي');
    if (dto.branchIds?.length) {
      const validBranches = await this.prisma.tbl_branches.count({ where: { branch_id: { in: [...new Set(dto.branchIds)] } } });
      if (validBranches !== new Set(dto.branchIds).size) throw new BadRequestException('يوجد فرع غير صالح ضمن الاختيار');
    }
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
    const row = await this.prisma.$transaction(async (tx) => {
      const settings = await tx.club_sales_rep_settings.upsert({
        where: { employee_id: dto.employeeId },
        create: {
          employee_id: dto.employeeId,
          monthly_target: Number(dto.monthlyTarget) || 0,
          commission_mode: dto.commissionMode,
          flat_commission_percent: Number(dto.flatCommissionPercent) || 0,
          target_period_mode: period.mode,
          target_start_date: period.startDate,
          target_end_date: period.endDate,
          target_days: period.days,
          use_defaults: dto.useDefaults ?? false,
          is_active: dto.isActive ?? true,
        },
        update: {
          monthly_target: Number(dto.monthlyTarget) || 0,
          commission_mode: dto.commissionMode,
          flat_commission_percent: Number(dto.flatCommissionPercent) || 0,
          target_period_mode: period.mode,
          target_start_date: period.startDate,
          target_end_date: period.endDate,
          target_days: period.days,
          use_defaults: dto.useDefaults ?? false,
          ...(dto.isActive !== undefined ? { is_active: dto.isActive } : {}),
        },
      });
      await tx.club_sales_commission_tiers.deleteMany({ where: { settings_id: settings.id } });
      if (dto.commissionMode === 'tiered' && tiers.length) {
        await tx.club_sales_commission_tiers.createMany({
          data: tiers.map((tier) => ({
            settings_id: settings.id,
            min_achievement_pct: tier.minAchievementPct,
            max_achievement_pct: tier.maxAchievementPct,
            commission_percent: tier.commissionPercent,
            label: tier.label,
          })),
        });
      }
      if (dto.branchIds) {
        await tx.club_sales_rep_branches.deleteMany({ where: { employee_id: dto.employeeId } });
        if (dto.branchIds.length) await tx.club_sales_rep_branches.createMany({ data: [...new Set(dto.branchIds)].map((branchId) => ({ employee_id: dto.employeeId, branch_id: branchId })) });
      }
      return tx.club_sales_rep_settings.findUnique({
        where: { id: settings.id },
        include: { tiers: { orderBy: { min_achievement_pct: 'asc' } } },
      });
    });
    return row;
  }

  async previewSalesRepDeactivation(employeeId: number, today = localDateString()) {
    const [leads, activeSubscriptions] = await Promise.all([
      this.prisma.club_sales_crm_leads.count({ where: { assigned_to_id: employeeId, status: { not: 'lost' } } }),
      this.prisma.club_subscriptions.count({ where: { sales_id: employeeId, subscription_end_date: { gte: today } } }),
    ]);
    return { leads, activeSubscriptions, total: leads + activeSubscriptions };
  }

  async setSalesRepActive(employeeId: number, isActive: boolean, transferToId?: number | null, today = localDateString()) {
    const plan = await this.previewSalesRepDeactivation(employeeId, today);
    let target: Awaited<ReturnType<EmployeesService['salesReps']>>[number] | undefined;
    if (!isActive && plan.total > 0) {
      target = (await this.employees.salesReps()).find((rep) => rep.id === transferToId && rep.id !== employeeId);
      if (!target) throw new BadRequestException('اختر أخصائيًا نشطًا لنقل العملاء والاشتراكات الحالية إليه');
      const [leadBranches, subscriptionBranches] = await Promise.all([
        this.prisma.club_sales_crm_leads.findMany({ where: { assigned_to_id: employeeId, status: { not: 'lost' } }, select: { branch_id: true }, distinct: ['branch_id'] }),
        this.prisma.club_subscriptions.findMany({ where: { sales_id: employeeId, subscription_end_date: { gte: today } }, select: { branch_id: true }, distinct: ['branch_id'] }),
      ]);
      const requiredBranches = [...new Set([...leadBranches, ...subscriptionBranches].map((row) => row.branch_id))];
      if (requiredBranches.some((branchId) => !target!.branchIds.includes(branchId))) {
        throw new BadRequestException('الأخصائي البديل غير مفعّل في كل فروع العمل المطلوب نقله');
      }
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.club_sales_rep_settings.upsert({
        where: { employee_id: employeeId },
        create: { employee_id: employeeId, is_active: isActive },
        update: { is_active: isActive },
      });
      if (!isActive && target) {
        await tx.club_sales_crm_leads.updateMany({ where: { assigned_to_id: employeeId, status: { not: 'lost' } }, data: { assigned_to_id: target.id, assignment_mode: 'manual' } });
        await tx.club_subscriptions.updateMany({ where: { sales_id: employeeId, subscription_end_date: { gte: today } }, data: { sales_id: target.id } });
      }
    });
    return { employeeId, isActive, transferredToId: target?.id ?? null, ...plan };
  }

  async listTrainersWithSettings() {
    const trainers = await this.prisma.club_trainers.findMany({
      where: { is_active: true, is_deleted: false },
      select: { id: true, name: true, employee_id: true },
      orderBy: { name: 'asc' },
    });
    const settings = await this.prisma.club_trainer_commission_settings.findMany({
      include: { tiers: { orderBy: { min_achievement_pct: 'asc' } } },
    });
    const byEmployee = new Map(settings.map((row) => [row.employee_id, row]));
    const today = localDateString();
    return trainers
      .filter((trainer) => trainer.employee_id != null)
      .map((trainer) => {
        const row = byEmployee.get(trainer.employee_id!);
        return {
          trainerId: trainer.id,
          employeeId: trainer.employee_id,
          name: trainer.name,
          targetUnit: row?.target_unit === 'money' ? 'money' : 'members',
          baseTarget: row ? Number(row.base_target) : 0,
          commissionMode: row?.commission_mode === 'tiered' || row?.commission_mode === 'combined'
            ? row.commission_mode
            : 'attendance',
          privateCommissionMode: row?.private_commission_mode === 'fixed' ? 'fixed' : 'salary',
          privateCommissionPercent: Number(row?.private_commission_percent ?? 0),
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

  async upsertTrainer(dto: UpsertTrainerCommissionDto) {
    const tiers = this.validateTiers(dto.tiers);
    const period = normalizeTargetPeriod({
      mode: dto.targetPeriodMode,
      startDate: dto.targetPeriodMode === 'days' ? (dto.targetStartDate || localDateString()) : dto.targetStartDate,
      endDate: dto.targetEndDate,
      days: dto.targetDays,
    });
    if (!tiers.length) throw new BadRequestException('أضف شرائح العمولة القابلة للتخصيص');
    return this.prisma.$transaction(async (tx) => {
      const settings = await tx.club_trainer_commission_settings.upsert({
        where: { employee_id: dto.employeeId },
        create: {
          employee_id: dto.employeeId,
          trainer_id: dto.trainerId ?? null,
          target_unit: dto.targetUnit,
          base_target: Number(dto.baseTarget) || 0,
          target_period_mode: period.mode,
          target_start_date: period.startDate,
          target_end_date: period.endDate,
          target_days: period.days,
          commission_mode: dto.commissionMode ?? 'attendance',
          private_commission_mode: dto.privateCommissionMode ?? 'salary',
          private_commission_percent: Number(dto.privateCommissionPercent) || 0,
        },
        update: {
          trainer_id: dto.trainerId ?? null,
          target_unit: dto.targetUnit,
          base_target: Number(dto.baseTarget) || 0,
          target_period_mode: period.mode,
          target_start_date: period.startDate,
          target_end_date: period.endDate,
          target_days: period.days,
          commission_mode: dto.commissionMode,
          private_commission_mode: dto.privateCommissionMode,
          private_commission_percent: dto.privateCommissionPercent == null
            ? undefined
            : Number(dto.privateCommissionPercent) || 0,
        },
      });
      await tx.club_trainer_commission_tiers.deleteMany({ where: { settings_id: settings.id } });
      await tx.club_trainer_commission_tiers.createMany({
        data: tiers.map((tier) => ({
          settings_id: settings.id,
          min_achievement_pct: tier.minAchievementPct,
          max_achievement_pct: tier.maxAchievementPct,
          commission_percent: tier.commissionPercent,
          label: tier.label ?? null,
        })),
      });
      return tx.club_trainer_commission_settings.findUnique({
        where: { id: settings.id },
        include: { tiers: { orderBy: { min_achievement_pct: 'asc' } } },
      });
    });
  }

  resolveSalesCommission(
    settings: {
      commission_mode: string;
      flat_commission_percent: unknown;
      tiers: Array<{ min_achievement_pct: unknown; max_achievement_pct: unknown; commission_percent: unknown; label?: string | null }>;
    } | null,
    achievementPct: number,
    revenue: number,
  ) {
    if (!settings) return { mode: 'flat', percent: 0, amount: 0, tierLabel: null as string | null };
    if (settings.commission_mode === 'tiered') {
      const tier = pickCommissionTier(
        settings.tiers.map((row) => ({
          minAchievementPct: Number(row.min_achievement_pct),
          maxAchievementPct: row.max_achievement_pct == null ? null : Number(row.max_achievement_pct),
          commissionPercent: Number(row.commission_percent),
          label: row.label ?? null,
        })),
        achievementPct,
      );
      const percent = tier?.commissionPercent ?? 0;
      return { mode: 'tiered', percent, amount: Math.round(revenue * percent) / 100, tierLabel: tier?.label ?? null };
    }
    const percent = Number(settings.flat_commission_percent) || 0;
    return { mode: 'flat', percent, amount: Math.round(revenue * percent) / 100, tierLabel: null };
  }
}
