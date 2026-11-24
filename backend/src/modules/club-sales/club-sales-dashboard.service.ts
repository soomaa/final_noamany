import { FOLLOW_LATER_STATUSES, IN_PROGRESS_STATUSES, QUALIFIED_STATUSES } from './club-sales.constants';
import { effectiveSalesSettings, readSalesDefaults } from './sales-defaults';
import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Response } from 'express';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { ExportService } from '../../common/export/export.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtUser } from '../../common/types/jwt-user';
import { EmployeesService } from '../employees/employees.service';
import { monthBounds, roundMoney, summarizeLeadPipeline } from './club-sales.constants';
import { DashboardQueryDto } from './dto/leads.dto';
import { effectiveTarget } from './target-period';
import { repFilterScope, repVisibleInScope } from './club-sales-reports.service';

function rangeDates(query: DashboardQueryDto) {
  const today = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  if (query.range === 'custom' && query.dateFrom && query.dateTo) {
    return { start: query.dateFrom, end: query.dateTo };
  }
  if (query.range === 'today') {
    const day = iso(today);
    return { start: day, end: day };
  }
  if (query.range === 'week') {
    const start = new Date(today);
    start.setDate(today.getDate() - 6);
    return { start: iso(start), end: iso(today) };
  }
  const month = monthBounds(today);
  return { start: month.startStr, end: month.endStr };
}

@Injectable()
export class ClubSalesDashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branchScope: BranchScopeService,
    private readonly employees: EmployeesService,
    private readonly exporter: ExportService,
  ) {}

  private async assertManagementUser(user: JwtUser) {
    if (user.emp_code && await this.employees.isSalesEmployee(user.emp_code)) {
      throw new ForbiddenException('تقارير الفريق متاحة للإدارة فقط');
    }
  }

  private leadWhere(user: JwtUser, branchId?: number, start?: Date, end?: Date): Prisma.club_leadsWhereInput {
    const scope = this.branchScope.resolveListFilter(user, branchId ?? null);
    return {
      ...(scope === null ? {} : { branch_id: { in: scope } }),
      ...(start && end ? { created_at: { gte: start, lte: end } } : {}),
    };
  }

  async overview(query: DashboardQueryDto, user: JwtUser) {
    await this.assertManagementUser(user);
    const { start, end } = rangeDates(query);
    const startAt = new Date(`${start}T00:00:00`);
    const endAt = new Date(`${end}T23:59:59`);
    const overdueAfter = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const leadWhere = this.leadWhere(user, query.branchId, startAt, endAt);
    const scope = this.branchScope.resolveListFilter(user, query.branchId ?? null);
    const subWhere: Prisma.club_subscriptionsWhereInput = {
      registration_date: { gte: start, lte: end },
      ...(scope === null ? {} : { branch_id: { in: scope } }),
    };

    const allReps = await this.employees.salesReps();
    const settings = await this.prisma.club_sales_rep_settings.findMany({
      include: { tiers: true },
    });
    const defaults = await readSalesDefaults(this.prisma);
    const settingsByEmp = new Map(allReps.map(rep => [rep.id, effectiveSalesSettings(settings.find(row => row.employee_id === rep.id), defaults)]));

    const [leads, subscriptions, overdue] = await Promise.all([
      this.prisma.club_leads.findMany({
        where: leadWhere,
        select: {
          id: true,
          assigned_to: true,
          status: true,
          last_contacted_at: true,
          created_at: true,
          follow_ups: { select: { id: true }, take: 1 },
        },
      }),
      this.prisma.club_subscriptions.findMany({
        where: subWhere,
        select: {
          id: true,
          sales_id: true,
          paid_amount: true,
          subscription_value: true,
          discount_value: true,
          discount_enabled: true,
        },
      }),
      this.prisma.club_leads.count({
        where: {
          ...this.leadWhere(user, query.branchId),
          status: { in: ['new', ...IN_PROGRESS_STATUSES] },
          OR: [
            { last_contacted_at: null, created_at: { lte: overdueAfter } },
            { last_contacted_at: { lte: overdueAfter } },
          ],
        },
      }),
    ]);

    // A scoped manager sees the reps of their branches plus any rep holding leads or sales in
    // them. The team target and the table below are both built from this same list.
    const repScope = repFilterScope(user, scope);
    const reps = allReps.filter((rep) => repVisibleInScope(
      rep,
      repScope,
      leads.some((lead) => lead.assigned_to === rep.id) || subscriptions.some((row) => row.sales_id === rep.id),
    ));

    const contactedIds = new Set(
      leads.filter((lead) => lead.last_contacted_at || lead.follow_ups.length || lead.status !== 'new').map((lead) => lead.id),
    );
    const converted = leads.filter((lead) => lead.status === 'converted').length;
    const assigned = leads.filter((lead) => lead.assigned_to != null).length;
    const totalSales = roundMoney(subscriptions.reduce((sum, row) => sum + Number(row.paid_amount), 0));
    const targetFor = (employeeId: number) => {
      const setting = settingsByEmp.get(employeeId);
      return effectiveTarget(Number(setting?.monthly_target ?? 0), {
        mode: setting?.target_period_mode,
        startDate: setting?.target_start_date,
        endDate: setting?.target_end_date,
        days: setting?.target_days,
      }, start, end);
    };
    const teamTarget = roundMoney(reps.reduce((sum, rep) => sum + targetFor(rep.id), 0));

    const table = reps.map((rep) => {
      const received = leads.filter((lead) => lead.assigned_to === rep.id);
      const contacted = received.filter((lead) => contactedIds.has(lead.id)).length;
      const convertedCount = received.filter((lead) => lead.status === 'converted').length;
      const actual = roundMoney(
        subscriptions
          .filter((row) => row.sales_id === rep.id)
          .reduce((sum, row) => sum + Number(row.paid_amount), 0),
      );
      const target = targetFor(rep.id);
      // A rep with no target on file is 0% achieved, not 100%.
      const achievement = target > 0 ? roundMoney((actual / target) * 100) : 0;
      return {
        salesRepId: rep.id,
        name: rep.name,
        isActive: settingsByEmp.get(rep.id)?.is_active ?? true,
        receivedLeads: received.length,
        contacted,
        converted: convertedCount,
        financialTarget: target,
        actual,
        achievementPct: achievement,
      };
    });

    return {
      range: { start, end },
      pipeline: summarizeLeadPipeline(leads),
      kpis: {
        totalSales,
        teamTarget,
        achievementPct: teamTarget > 0 ? roundMoney((totalSales / teamTarget) * 100) : 0,
        conversionRate: leads.length ? roundMoney((converted / leads.length) * 100) : 0,
        assignedLeads: assigned,
        overdueLeads: overdue,
        totalLeads: leads.length,
      },
      table,
    };
  }

  async drilldown(salesRepId: number, query: DashboardQueryDto, user: JwtUser) {
    await this.assertManagementUser(user);
    const { start, end } = rangeDates(query);
    const startAt = new Date(`${start}T00:00:00`);
    const endAt = new Date(`${end}T23:59:59`);
    const scope = this.branchScope.resolveListFilter(user, query.branchId ?? null);
    const leadWhere: Prisma.club_leadsWhereInput = {
      ...this.leadWhere(user, query.branchId, startAt, endAt),
      assigned_to: salesRepId,
    };
    const [leads, followUps, subscriptions] = await Promise.all([
      this.prisma.club_leads.findMany({
        where: leadWhere,
        include: {
          follow_ups: {
            orderBy: { created_at: 'desc' },
            take: 1,
            select: { note: true, status: true, created_at: true },
          },
        },
        orderBy: { updated_at: 'desc' },
        take: 80,
      }),
      this.prisma.club_lead_follow_ups.findMany({
        where: {
          created_at: { gte: startAt, lte: endAt },
          lead: {
            assigned_to: salesRepId,
            ...(scope === null ? {} : { branch_id: { in: scope } }),
          },
        },
        include: { lead: { select: { name: true, id: true } } },
        orderBy: { created_at: 'desc' },
        take: 80,
      }),
      this.prisma.club_subscriptions.findMany({
        where: {
          sales_id: salesRepId,
          registration_date: { gte: start, lte: end },
          ...(scope === null ? {} : { branch_id: { in: scope } }),
        },
        select: {
          id: true,
          subscription_number: true,
          customer_name: true,
          paid_amount: true,
          registration_date: true,
          subscription_type: true,
        },
        orderBy: { id: 'desc' },
        take: 50,
      }),
    ]);

    // Counted in SQL, not from the `take: 80` page above.
    //
    // The stage counts used to be derived by filtering that truncated array, so any
    // specialist with more than 80 leads in range got a pipeline that silently summed to
    // exactly 80. Wrong numbers on a manager's screen are worse than missing ones: nothing
    // signals they cannot be trusted.
    const stageCounts = await this.prisma.club_leads.groupBy({
      by: ['status'],
      where: leadWhere,
      _count: { _all: true },
    });
    const countFor = (...statuses: readonly string[]) =>
      stageCounts.filter((row) => statuses.includes(row.status)).reduce((sum, row) => sum + row._count._all, 0);
    // Buckets, not single statuses: FIT90's finer outcomes roll up into EMS's report shape.
    const pipeline = {
      new: countFor('new'),
      in_progress: countFor(...IN_PROGRESS_STATUSES),
      follow_later: countFor(...FOLLOW_LATER_STATUSES),
      qualified: countFor(...QUALIFIED_STATUSES),
      converted: countFor('converted'),
      lost: countFor('lost'),
    };
    // Still derived from the 80-row page: an average over a recent sample is a reasonable
    // approximation, unlike a count that claims to be a total.
    const responseHours = leads
      .filter((row) => row.last_contacted_at)
      .map((row) => (row.last_contacted_at!.getTime() - row.created_at.getTime()) / 36e5);
    const avgResponseHours = responseHours.length
      ? roundMoney(responseHours.reduce((sum, h) => sum + h, 0) / responseHours.length)
      : null;
    const activitySummary = {
      total: followUps.filter((row) => ['call', 'conversation', 'meeting'].includes(row.activity_type)).length,
      calls: followUps.filter((row) => row.activity_type === 'call').length,
      answeredCalls: followUps.filter((row) => row.activity_type === 'call' && row.answered === true).length,
      conversations: followUps.filter((row) => row.activity_type === 'conversation').length,
      meetings: followUps.filter((row) => row.activity_type === 'meeting').length,
    };

    return {
      salesRepId,
      pipeline,
      avgResponseHours,
      activitySummary,
      leads: leads.map((row) => ({
        id: row.id,
        fullName: row.name,
        phone: row.phone,
        status: row.status,
        assignedToId: row.assigned_to,
        createdAt: row.created_at,
        lastContactedAt: row.last_contacted_at,
        notes: row.follow_ups[0]?.note ?? row.notes,
      })),
      activity: followUps.map((row) => ({
        id: row.id,
        leadId: row.lead_id,
        leadName: row.lead.name,
        note: row.note,
        status: row.status,
        activityType: row.activity_type,
        answered: row.answered,
        interests: row.interests,
        nextFollowUpAt: row.next_follow_up_at,
        createdAt: row.created_at,
      })),
      closedDeals: subscriptions.map((row) => ({
        id: row.id,
        subscriptionNumber: row.subscription_number,
        customerName: row.customer_name,
        paidAmount: Number(row.paid_amount),
        date: row.registration_date,
        type: row.subscription_type,
      })),
    };
  }

  async exportExcel(query: DashboardQueryDto, user: JwtUser, res: Response) {
    const data = await this.overview(query, user);
    await this.exporter.sendXlsx(res, 'sales-dashboard.xlsx', [
      {
        name: 'ملخص الفريق',
        columns: [
          { key: 'name', header: 'أخصائي المبيعات', width: 24 },
          { key: 'receivedLeads', header: 'العملاء المستلمون', width: 16 },
          { key: 'contacted', header: 'تم التواصل', width: 14 },
          { key: 'converted', header: 'تم التحويل', width: 14 },
          { key: 'financialTarget', header: 'التارجت', width: 14 },
          { key: 'actual', header: 'الفعلي', width: 14 },
          { key: 'achievementPct', header: 'نسبة التحقيق %', width: 16 },
        ],
        rows: data.table,
      },
    ]);
  }
}
