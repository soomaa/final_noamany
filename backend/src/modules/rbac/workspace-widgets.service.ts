import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { localDateString } from '../club-members/club-member.utils';
import { addDays, deriveSubStatus, toNum } from '../club-subscriptions/club-subscription.utils';
import { WorkspaceService, WorkspaceConfig } from './workspace.service';
import { PermissionEngineService } from './engine/permission-engine.service';
import type { JwtUser } from '../../common/types/jwt-user';

export type WidgetPayload = Record<string, unknown>;

@Injectable()
export class WorkspaceWidgetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspace: WorkspaceService,
    private readonly permissions: PermissionEngineService,
  ) {}

  async getWidgets(user: JwtUser, requestedBranchId?: number): Promise<{ config: WorkspaceConfig; data: WidgetPayload }> {
    const config = await this.workspace.getWorkspace(user.sub);
    const data: WidgetPayload = {};
    const branchIds = user.level === 1
      ? (requestedBranchId != null && Number.isFinite(requestedBranchId) ? [requestedBranchId] : null)
      : (Number(user.branch ?? 0) > 0 ? [Number(user.branch)] : []);

    for (const key of config.widgets) {
      data[key] = await this.loadWidget(key, user, branchIds);
    }

    return { config, data };
  }

  private async loadWidget(key: string, user: JwtUser, branchIds: number[] | null): Promise<unknown> {
    const today = localDateString();
    const in7 = addDays(today, 7);
    const branchWhere = branchIds === null ? {} : { branch_id: { in: branchIds } };

    switch (key) {
      case 'recent_checkins': {
        const rows = await this.prisma.club_attendance.findMany({
          where: branchWhere,
          orderBy: [{ attendance_date: 'desc' }, { check_in_time: 'desc' }],
          take: 8,
          include: { member: { select: { name: true, member_code: true } } },
        });
        return rows.map((r) => ({
          memberId: r.member_id,
          memberName: r.member?.name ?? '—',
          memberCode: r.member?.member_code,
          checkInTime: r.check_in_time,
          date: r.attendance_date,
        }));
      }
      case 'pending_tasks': {
        const tasks = await this.prisma.staff_tasks.findMany({
          where: {
            status: { in: ['open', 'in_progress'] },
            ...(branchIds === null ? {} : { OR: [{ branch_id: null }, branchWhere] }),
          },
          orderBy: { due_date: 'asc' },
          take: 8,
        });
        return { count: tasks.length, items: tasks };
      }
      case 'expiring_subscriptions': {
        const rows = await this.prisma.club_subscriptions.findMany({
          where: { subscription_end_date: { gte: today, lte: in7 }, ...branchWhere },
          take: 10,
          orderBy: { subscription_end_date: 'asc' },
        });
        return {
          count: rows.length,
          items: rows.map((s) => ({
            id: s.id,
            customerName: s.customer_name,
            subscriptionNumber: s.subscription_number,
            endDate: s.subscription_end_date,
          })),
        };
      }
      case 'outstanding_balances': {
        const rows = await this.prisma.club_subscriptions.findMany({
          where: { remaining_amount: { gt: 0 }, status: { in: ['active', 'upcoming'] }, ...branchWhere },
          take: 10,
          orderBy: { remaining_amount: 'desc' },
        });
        const total = rows.reduce((s, r) => s + toNum(r.remaining_amount), 0);
        return {
          count: rows.length,
          totalOutstanding: total,
          items: rows.map((r) => ({
            id: r.id,
            customerName: r.customer_name,
            remaining: toNum(r.remaining_amount),
          })),
        };
      }
      case 'club_kpis': {
        const [members, subs, attendance] = await Promise.all([
          this.prisma.club_members.count({ where: { is_deleted: false, ...branchWhere } }),
          this.prisma.club_subscriptions.count({ where: branchWhere }),
          this.prisma.club_attendance.count({ where: { attendance_date: today, ...branchWhere } }),
        ]);
        return { totalMembers: members, totalSubscriptions: subs, checkInsToday: attendance };
      }
      case 'pending_renewals': {
        const rows = await this.prisma.club_subscriptions.findMany({
          where: { subscription_end_date: { gte: today, lte: in7 }, ...branchWhere },
        });
        const pending = rows.filter(
          (s) => deriveSubStatus(s.subscription_start_date, s.subscription_end_date) === 'active',
        );
        return { count: pending.length };
      }
      case 'attendance_rate': {
        const monthStart = today.slice(0, 8) + '01';
        const [attendance, members] = await Promise.all([
          this.prisma.club_attendance.findMany({
            where: { attendance_date: { gte: monthStart, lte: today }, ...branchWhere },
            select: { member_id: true },
          }),
          this.prisma.club_members.count({ where: { is_deleted: false, is_active: true, ...branchWhere } }),
        ]);
        const unique = new Set(attendance.map((a) => a.member_id)).size;
        return {
          rate: members > 0 ? Math.round((unique / members) * 100) : 0,
          uniqueAttendees: unique,
          activeMembers: members,
        };
      }
      case 'treasury_today': {
        const [effective, account] = await Promise.all([
          this.permissions.getEffective(user.sub),
          this.prisma.users.findUnique({
            where: { user_id: user.sub },
            select: { name: true, username: true },
          }),
        ]);
        const creatorWhere = effective.superAdmin ? {} : { created_by: user.sub };
        const [receipts, expenses] = await Promise.all([
          this.prisma.club_receipts.findMany({
            where: {
              receipt_date: today,
              ...branchWhere,
              ...creatorWhere,
            },
            select: { amount: true },
          }),
          this.prisma.fin_expenses.findMany({
            where: {
              expense_date: today,
              is_deleted: false,
              ...branchWhere,
              ...creatorWhere,
            },
            select: { total_amount: true },
          }),
        ]);
        const incomeTotal = receipts.reduce((sum, receipt) => sum + toNum(receipt.amount), 0);
        const expensesTotal = expenses.reduce((sum, expense) => sum + toNum(expense.total_amount), 0);
        const netTotal = incomeTotal - expensesTotal;
        return {
          date: today,
          // Keep `total` for older clients, but its accounting meaning is now the daily net.
          total: netTotal,
          incomeTotal,
          expensesTotal,
          netTotal,
          receiptCount: receipts.length,
          expenseCount: expenses.length,
          userScoped: !effective.superAdmin,
          collectorName: account?.name || account?.username || `#${user.sub}`,
        };
      }
      case 'today_sales': {
        const sales = await this.prisma.sales_quick_sales.findMany({
          where: { sale_date: today, status: 'completed', ...branchWhere },
        });
        const total = sales.reduce((s, r) => s + toNum(r.total_amount), 0);
        return { count: sales.length, total };
      }
      case 'pos_shift': {
        const session = await this.prisma.sales_shift_sessions.findFirst({
          where: { status: 'open', ...branchWhere },
          orderBy: { start_time: 'desc' },
        });
        return session
          ? { open: true, sessionId: session.id, branchId: session.branch_id }
          : { open: false };
      }
      case 'notifications': {
        const count = await this.prisma.tbl_notifications.count({ where: { seen: 0 } });
        return { unread: count };
      }
      case 'quick_links':
        return { links: ['/club/reception', '/club/members', '/club/subscriptions'] };
      default:
        return null;
    }
  }
}
