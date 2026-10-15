import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Response } from 'express';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { ExportService } from '../../common/export/export.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtUser } from '../../common/types/jwt-user';
import { EmployeesService } from '../employees/employees.service';
import { ClubCommissionSettingsService } from './club-commission-settings.service';
import { monthBounds, pickCommissionTier, roundMoney } from './club-sales.constants';
import { DashboardQueryDto } from './dto/leads.dto';
import { summarizeTrainerPerformance } from './trainer-performance';
import { effectiveTarget } from './target-period';
import { targetWindowAfterSettlement } from './target-settlement';
import { resolveDatabaseSalesSettings } from './sales-defaults';

@Injectable()
export class ClubSalesReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branchScope: BranchScopeService,
    private readonly employees: EmployeesService,
    private readonly commissions: ClubCommissionSettingsService,
    private readonly exporter: ExportService,
  ) {}

  private async assertManagementUser(user: JwtUser) {
    if (user.emp_code && await this.employees.isSalesEmployee(user.emp_code)) {
      throw new ForbiddenException('تقارير الفريق متاحة للإدارة فقط');
    }
  }

  private dates(query: DashboardQueryDto) {
    if (query.dateFrom && query.dateTo) return { start: query.dateFrom, end: query.dateTo };
    const month = monthBounds();
    return { start: month.startStr, end: month.endStr };
  }

  async salesRepsReport(query: DashboardQueryDto, user: JwtUser) {
    await this.assertManagementUser(user);
    const { start, end } = this.dates(query);
    const scope = this.branchScope.resolveListFilter(user, query.branchId ?? null);
    const reps = await this.employees.salesReps();
    const settings = await this.prisma.club_sales_rep_settings.findMany({ include: { tiers: true } });
    const defaults = await this.prisma.club_sales_default_settings?.findUnique({ where: { id: 1 }, include: { tiers: true } }) ?? null;
    const settingsByEmp = new Map(settings.map((row) => [row.employee_id, row]));
    const settlements = await this.prisma.club_target_settlements.findMany({
      where: { target_type: 'sales', employee_id: { in: reps.map((rep) => rep.id) }, cycle_end: { lte: end } },
      select: { employee_id: true, cycle_end: true },
      orderBy: { cycle_end: 'desc' },
    });
    const settledEndByEmployee = new Map<number, string>();
    settlements.forEach((row) => { if (!settledEndByEmployee.has(row.employee_id)) settledEndByEmployee.set(row.employee_id, row.cycle_end); });
    const subscriptions = await this.prisma.club_subscriptions.findMany({
      where: {
        registration_date: { gte: start, lte: end },
        sales_id: { not: null },
        ...(scope === null ? {} : { branch_id: { in: scope } }),
        ...(query.salesRepId ? { sales_id: query.salesRepId } : {}),
      },
      select: { sales_id: true, paid_amount: true, id: true, registration_date: true },
    });
    const rows = reps
      .filter((rep) => !query.salesRepId || rep.id === query.salesRepId)
      .map((rep) => {
        const window = targetWindowAfterSettlement(start, end, settledEndByEmployee.get(rep.id) ?? null);
        const deals = window.active ? subscriptions.filter((row) => row.sales_id === rep.id && row.registration_date >= window.start) : [];
        const revenue = roundMoney(deals.reduce((sum, row) => sum + Number(row.paid_amount), 0));
        const setting = settingsByEmp.get(rep.id) ?? null;
        const effective = resolveDatabaseSalesSettings(setting, defaults);
        const target = window.active ? effectiveTarget(effective.monthlyTarget, {
          mode: effective.targetPeriodMode,
          startDate: effective.targetStartDate,
          endDate: effective.targetEndDate,
          days: effective.targetDays,
        }, window.start, window.end) : 0;
        const achievementPct = target > 0 ? roundMoney((revenue / target) * 100) : revenue > 0 ? 100 : 0;
        const commission = this.commissions.resolveSalesCommission({
          commission_mode: effective.commissionMode,
          flat_commission_percent: effective.flatCommissionPercent,
          tiers: effective.tiers.map((tier) => ({ min_achievement_pct: tier.minAchievementPct, max_achievement_pct: tier.maxAchievementPct, commission_percent: tier.commissionPercent, label: tier.label })),
        }, achievementPct, revenue);
        return {
          salesRepId: rep.id,
          name: rep.name,
          subscriptions: deals.length,
          revenue,
          target,
          achievementPct,
          commissionPercent: commission.percent,
          commissionDue: commission.amount,
        };
      });
    return { start, end, rows };
  }

  async trainersReport(query: DashboardQueryDto, user: JwtUser) {
    await this.assertManagementUser(user);
    const { start, end } = this.dates(query);
    const scope = this.branchScope.resolveListFilter(user, query.branchId ?? null);
    const trainers = await this.prisma.club_trainers.findMany({
      where: { is_active: true, is_deleted: false, employee_id: { not: null } },
      select: { id: true, name: true, employee_id: true },
    });
    const settings = await this.prisma.club_trainer_commission_settings.findMany({
      include: { tiers: { orderBy: { min_achievement_pct: 'asc' } } },
    });
    const settingsByEmp = new Map(settings.map((row) => [row.employee_id, row]));
    const settlements = await this.prisma.club_target_settlements.findMany({
      where: { target_type: 'trainer', employee_id: { in: trainers.flatMap((trainer) => trainer.employee_id == null ? [] : [trainer.employee_id]) }, cycle_end: { lte: end } },
      select: { employee_id: true, cycle_end: true },
      orderBy: { cycle_end: 'desc' },
    });
    const settledEndByEmployee = new Map<number, string>();
    settlements.forEach((row) => { if (!settledEndByEmployee.has(row.employee_id)) settledEndByEmployee.set(row.employee_id, row.cycle_end); });
    const classes = await this.prisma.club_classes.findMany({
      where: {
        class_date: { gte: start, lte: end },
        status: { not: 'cancelled' },
        is_deleted: false,
        ...(scope === null ? {} : { branch_id: { in: scope } }),
      },
      select: {
        id: true,
        trainer_id: true,
        class_date: true,
        price: true,
        enrollments: {
          where: { attendance_status: { not: 'cancelled' } },
          select: { member_id: true },
        },
      },
    });
    const privateCommissions = await this.prisma.club_private_attendance_commissions.findMany({
      where: { attendance_date: { gte: start, lte: end } },
      select: {
        trainer_id: true,
        attendance_date: true,
        revenue_base: true,
        commission_amount: true,
        refunded_amount: true,
        attendance: { select: { member_id: true } },
      },
    });

    const rows = trainers.map((trainer) => {
      const window = targetWindowAfterSettlement(start, end, trainer.employee_id ? settledEndByEmployee.get(trainer.employee_id) ?? null : null);
      const trainerClasses = window.active ? classes.filter((row) => row.trainer_id === trainer.id && row.class_date >= window.start) : [];
      const privates = window.active ? privateCommissions.filter((row) => row.trainer_id === trainer.id && row.attendance_date >= window.start) : [];
      const sessions = trainerClasses.length + privates.length;
      const revenue = roundMoney(
        trainerClasses.reduce((sum, row) => sum + Number(row.price ?? 0), 0)
        + privates.reduce((sum, row) => sum + Number(row.revenue_base ?? 0), 0),
      );
      const setting = trainer.employee_id ? settingsByEmp.get(trainer.employee_id) ?? null : null;
      const target = window.active ? effectiveTarget(Number(setting?.base_target ?? 0), {
        mode: setting?.target_period_mode,
        startDate: setting?.target_start_date,
        endDate: setting?.target_end_date,
        days: setting?.target_days,
      }, window.start, window.end) : 0;
      const unit = setting?.target_unit === 'money' ? 'money' : 'members';
      const memberIds = new Set<number>();
      trainerClasses.forEach((row) => row.enrollments.forEach((enrollment) => memberIds.add(enrollment.member_id)));
      privates.forEach((row) => memberIds.add(row.attendance.member_id));
      const achieved = unit === 'money' ? revenue : memberIds.size;
      const achievementPct = target > 0 ? roundMoney((achieved / target) * 100) : achieved > 0 ? 100 : 0;
      const mappedTiers = (setting?.tiers ?? []).map((tier) => ({
        minAchievementPct: Number(tier.min_achievement_pct),
        maxAchievementPct: tier.max_achievement_pct == null ? null : Number(tier.max_achievement_pct),
        commissionPercent: Number(tier.commission_percent),
        label: tier.label,
      }));
      const tier = pickCommissionTier(mappedTiers, achievementPct);
      const percent = tier?.commissionPercent ?? 0;
      return {
        trainerId: trainer.id,
        employeeId: trainer.employee_id,
        name: trainer.name,
        sessions,
        revenue,
        target,
        targetUnit: unit,
        achieved,
        achievementPct,
        achievedTier: tier?.label ?? (tier ? `${tier.minAchievementPct}%+` : 'بدون شريحة'),
        commissionPercent: percent,
        commissionDue: roundMoney(revenue * percent / 100),
      };
    });
    return { start, end, rows };
  }

  async trainerDrilldown(trainerId: number, query: DashboardQueryDto, user: JwtUser) {
    await this.assertManagementUser(user);
    const { start, end } = this.dates(query);
    const scope = this.branchScope.resolveListFilter(user, query.branchId ?? null);
    const trainer = await this.prisma.club_trainers.findFirst({
      where: { id: trainerId, is_active: true, is_deleted: false },
      select: { id: true, employee_id: true, name: true, specialization: true, rating_avg: true },
    });
    if (!trainer) throw new NotFoundException('المدرب غير موجود');

    const [classes, privateRows, setting] = await Promise.all([
      this.prisma.club_classes.findMany({
        where: {
          trainer_id: trainerId,
          class_date: { gte: start, lte: end },
          is_deleted: false,
          ...(scope === null ? {} : { branch_id: { in: scope } }),
        },
        include: { enrollments: true, hall: { select: { name: true } } },
        orderBy: [{ class_date: 'desc' }, { start_time: 'desc' }],
        take: 80,
      }),
      this.prisma.club_private_attendance_commissions.findMany({
        where: {
          trainer_id: trainerId,
          attendance_date: { gte: start, lte: end },
          ...(scope === null ? {} : { subscription: { branch_id: { in: scope } } }),
        },
        include: {
          attendance: { select: { member_id: true, member_name: true } },
          subscription: { select: { subscription_number: true, subscription_type: true } },
        },
        orderBy: [{ attendance_date: 'desc' }, { id: 'desc' }],
        take: 80,
      }),
      trainer.employee_id
        ? this.prisma.club_trainer_commission_settings.findUnique({
            where: { employee_id: trainer.employee_id },
            include: { tiers: { orderBy: { min_achievement_pct: 'asc' } } },
          })
        : null,
    ]);

    const target = effectiveTarget(Number(setting?.base_target ?? 0), {
      mode: setting?.target_period_mode,
      startDate: setting?.target_start_date,
      endDate: setting?.target_end_date,
      days: setting?.target_days,
    }, start, end);
    const targetUnit = setting?.target_unit === 'money' ? 'money' : 'members';
    const privateSessions = privateRows.map((row) => ({
      memberId: row.attendance.member_id,
      revenue: Number(row.revenue_base),
    }));
    const baseSummary = summarizeTrainerPerformance({
      classes,
      privateSessions,
      target,
      targetUnit,
      commissionDue: 0,
    });
    const tiers = (setting?.tiers ?? []).map((tier) => ({
      minAchievementPct: Number(tier.min_achievement_pct),
      maxAchievementPct: tier.max_achievement_pct == null ? null : Number(tier.max_achievement_pct),
      commissionPercent: Number(tier.commission_percent),
      label: tier.label,
    }));
    const tier = pickCommissionTier(tiers, baseSummary.achievementPct);
    const summary = {
      ...baseSummary,
      commissionPercent: Number(tier?.commissionPercent ?? 0),
      commissionDue: roundMoney(baseSummary.revenue * Number(tier?.commissionPercent ?? 0) / 100),
      achievedTier: tier?.label ?? 'بدون شريحة',
    };

    return {
      range: { start, end },
      trainer: {
        id: trainer.id,
        name: trainer.name,
        specialization: trainer.specialization,
        rating: Number(trainer.rating_avg),
      },
      summary,
      classes: classes.map((row) => {
        const active = row.enrollments.filter((item) => item.attendance_status !== 'cancelled');
        const attended = active.filter((item) => item.attendance_status === 'attended').length;
        const absent = active.filter((item) => item.attendance_status === 'absent').length;
        return {
          id: row.id,
          name: row.class_name,
          date: row.class_date,
          startTime: row.start_time,
          status: row.status,
          hall: row.hall?.name ?? null,
          registered: active.length,
          attended,
          absent,
          attendanceRate: active.length ? roundMoney((attended / active.length) * 100) : 0,
          revenue: Number(row.price ?? 0),
        };
      }),
      privateSessions: privateRows.map((row) => ({
        id: row.id,
        memberId: row.attendance.member_id,
        memberName: row.attendance.member_name,
        subscriptionNumber: row.subscription.subscription_number,
        subscriptionType: row.subscription.subscription_type,
        date: row.attendance_date,
        revenue: Number(row.revenue_base),
        commissionDue: Math.max(0, Number(row.commission_amount) - Number(row.refunded_amount)),
        refundedCommission: Number(row.refunded_amount),
      })),
    };
  }

  async exportSales(query: DashboardQueryDto, user: JwtUser, res: Response) {
    const data = await this.salesRepsReport(query, user);
    await this.exporter.sendXlsx(res, 'sales-reps-report.xlsx', [
      {
        name: 'مندوبو المبيعات',
        columns: [
          { key: 'name', header: 'الأخصائي', width: 22 },
          { key: 'subscriptions', header: 'الاشتراكات', width: 14 },
          { key: 'revenue', header: 'الإيراد', width: 14 },
          { key: 'target', header: 'التارجت', width: 14 },
          { key: 'achievementPct', header: 'التحقيق %', width: 14 },
          { key: 'commissionDue', header: 'العمولة المستحقة', width: 16 },
        ],
        rows: data.rows,
      },
    ]);
  }

  async exportTrainers(query: DashboardQueryDto, user: JwtUser, res: Response) {
    const data = await this.trainersReport(query, user);
    await this.exporter.sendXlsx(res, 'trainers-report.xlsx', [
      {
        name: 'المدربون',
        columns: [
          { key: 'name', header: 'المدرب', width: 22 },
          { key: 'sessions', header: 'الحصص', width: 12 },
          { key: 'revenue', header: 'الإيراد', width: 14 },
          { key: 'achievementPct', header: 'التحقيق %', width: 14 },
          { key: 'achievedTier', header: 'الشريحة', width: 16 },
          { key: 'commissionDue', header: 'العمولة المستحقة', width: 16 },
        ],
        rows: data.rows,
      },
    ]);
  }
}
