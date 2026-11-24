import { Prisma } from '@prisma/client';
import { salesCashCommissions } from './sales-cash-commission';
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
import { effectiveTarget } from './target-period';
import { targetWindowAfterSettlement } from './target-settlement';

/**
 * The branch list a team report must restrict its reps to, or `null` when every rep is shown.
 * Level-1 users stay unrestricted even when they filter by one branch (unchanged behaviour);
 * a scoped user gets the same resolved branch list the report's money is filtered by.
 */
export function repFilterScope(user: JwtUser | undefined, scope: number[] | null): number[] | null {
  if (scope === null || !user || user.level === 1) return null;
  return scope;
}

/**
 * Whether a rep belongs on a scoped team report: assigned to one of the report's branches, or
 * holding activity (leads, sales, commission) inside them — that activity is the viewer's own
 * branch data and payroll settles commission from it. A rep list without branch data is not
 * filtered.
 */
export function repVisibleInScope(
  rep: { branchIds?: number[] },
  scope: number[] | null,
  hasActivityInScope: boolean,
): boolean {
  if (scope === null || !rep.branchIds) return true;
  return hasActivityInScope || rep.branchIds.some((branchId) => scope.includes(branchId));
}

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

  async salesRepsReport(query: DashboardQueryDto, user: JwtUser, db: Prisma.TransactionClient = this.prisma) {
    await this.assertManagementUser(user);
    const { start, end } = this.dates(query);
    const scope = this.branchScope.resolveListFilter(user, query.branchId ?? null);
    const reps = (await this.employees.salesReps()).filter(rep => !query.salesRepId || rep.id === query.salesRepId);
    const computed = await salesCashCommissions(db, start, end, scope, reps, this.commissions);
    // Each row is computed independently, so dropping out-of-scope reps leaves the rest intact.
    const repScope = repFilterScope(user, scope);
    const repsById = new Map(reps.map(rep => [rep.id, rep]));
    const rows = computed.filter(row => repVisibleInScope(
      repsById.get(row.salesRepId) ?? {},
      repScope,
      row.sources.length > 0 || row.periodRevenue !== 0,
    ));
    return { start, end, rows };
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
}
