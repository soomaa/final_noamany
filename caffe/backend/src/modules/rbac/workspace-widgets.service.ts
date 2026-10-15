import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { localDateString } from '../club-members/club-member.utils';
import { addDays, deriveSubStatus, toNum } from '../club-subscriptions/club-subscription.utils';
import { WorkspaceService, WorkspaceConfig } from './workspace.service';

export type WidgetPayload = Record<string, unknown>;

@Injectable()
export class WorkspaceWidgetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspace: WorkspaceService,
  ) {}

  async getWidgets(userId: number): Promise<{ config: WorkspaceConfig; data: WidgetPayload }> {
    const config = await this.workspace.getWorkspace(userId);
    const data: WidgetPayload = {};

    for (const key of config.widgets) {
      data[key] = await this.loadWidget(key, userId);
    }

    return { config, data };
  }

  private async loadWidget(key: string, userId: number): Promise<unknown> {
    const today = localDateString();
    const in7 = addDays(today, 7);

    switch (key) {
      case 'recent_checkins': {
        const rows = await this.prisma.club_attendance.findMany({
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
          where: { status: { in: ['open', 'in_progress'] } },
          orderBy: { due_date: 'asc' },
          take: 8,
        });
        return { count: tasks.length, items: tasks };
      }
      case 'expiring_subscriptions': {
        const rows = await this.prisma.club_subscriptions.findMany({
          where: { subscription_end_date: { gte: today, lte: in7 } },
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
          where: { remaining_amount: { gt: 0 }, status: { in: ['active', 'upcoming'] } },
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
          this.prisma.club_members.count({ where: { is_deleted: false } }),
          this.prisma.club_subscriptions.count(),
          this.prisma.club_attendance.count({ where: { attendance_date: today } }),
        ]);
        return { totalMembers: members, totalSubscriptions: subs, checkInsToday: attendance };
      }
      case 'pending_renewals': {
        const rows = await this.prisma.club_subscriptions.findMany({
          where: { subscription_end_date: { gte: today, lte: in7 } },
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
            where: { attendance_date: { gte: monthStart, lte: today } },
            select: { member_id: true },
          }),
          this.prisma.club_members.count({ where: { is_deleted: false, is_active: true } }),
        ]);
        const unique = new Set(attendance.map((a) => a.member_id)).size;
        return {
          rate: members > 0 ? Math.round((unique / members) * 100) : 0,
          uniqueAttendees: unique,
          activeMembers: members,
        };
      }
      case 'treasury_today': {
        const receipts = await this.prisma.club_receipts.findMany({ where: { receipt_date: today } });
        const total = receipts.reduce((s, r) => s + toNum(r.amount), 0);
        return { date: today, total, receiptCount: receipts.length };
      }
      case 'today_sales': {
        const sales = await this.prisma.sales_quick_sales.findMany({
          where: { sale_date: today, status: 'completed' },
        });
        const total = sales.reduce((s, r) => s + toNum(r.total_amount), 0);
        return { count: sales.length, total };
      }
      case 'pos_shift': {
        const session = await this.prisma.sales_shift_sessions.findFirst({
          where: { status: 'open' },
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
