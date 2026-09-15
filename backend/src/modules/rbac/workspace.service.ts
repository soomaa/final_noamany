import { Injectable } from '@nestjs/common';
import { PermissionEngineService } from './engine/permission-engine.service';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface WorkspaceConfig {
  homeRoute: string;
  roleHint: string;
  widgets: string[];
}

@Injectable()
export class WorkspaceService {
  constructor(
    private readonly engine: PermissionEngineService,
    private readonly prisma: PrismaService,
  ) {}

  async getWorkspace(userId: number): Promise<WorkspaceConfig> {
    const user = await this.prisma.users.findUnique({
      where: { user_id: userId },
      select: { emp_code: true },
    });
    if (user?.emp_code) {
      const trainer = await this.prisma.club_trainers.findUnique({
        where: { employee_id: user.emp_code },
        select: { is_active: true, is_deleted: true },
      });
      if (trainer?.is_active && !trainer.is_deleted) {
        return {
          homeRoute: '/trainer',
          roleHint: 'trainer',
          widgets: ['my_schedule', 'attendance', 'earnings', 'trainer_statistics'],
        };
      }
    }
    const eff = await this.engine.getEffective(userId);
    const canView = (key: string) => eff.superAdmin || eff.keys.has(`${key}:view`);
    const canCreate = (key: string) => eff.superAdmin || eff.keys.has(`${key}:create`);

    if (eff.superAdmin) {
      return {
        homeRoute: '/dashboard',
        roleHint: 'owner',
        widgets: ['club_kpis', 'pending_renewals', 'attendance_rate', 'treasury_today'],
      };
    }

    // Land the user on the home of the department they actually belong to, from most-specific
    // role to least. `club.dashboard:view` is the BROADEST club signal (many roles are granted
    // club view for reference), so it must be the LAST landing before /profile — otherwise an HR
    // manager who happens to have club view lands on the club dashboard instead of the HR hub.
    if (canView('sales.portal')) {
      return {
        homeRoute: '/sales-portal?tab=today',
        roleHint: 'sales',
        widgets: ['sales_today', 'sales_followups', 'sales_renewals', 'sales_results'],
      };
    }

    if (canCreate('club.members')) {
      return {
        homeRoute: '/club/reception',
        roleHint: 'reception',
        widgets: ['treasury_today', 'recent_checkins', 'expiring_subscriptions', 'outstanding_balances'],
      };
    }

    if (canView('gym-sales.sales.new_receipt')) {
      return {
        homeRoute: '/sales/new',
        roleHint: 'cafe',
        widgets: ['pos_shift', 'today_sales', 'low_stock_alerts'],
      };
    }

    if (canView('gym-sales.sales')) {
      return {
        homeRoute: '/sales',
        roleHint: 'sales',
        widgets: ['pos_shift', 'today_sales', 'low_stock_alerts'],
      };
    }

    if (canView('accounting.dashboard')) {
      return {
        homeRoute: '/accounting',
        roleHint: 'accountant',
        widgets: ['trial_balance', 'pending_journal', 'cash_position'],
      };
    }

    if (canView('financial-reports.dashboard')) {
      return {
        homeRoute: '/finance',
        roleHint: 'finance',
        widgets: ['revenue_summary', 'expense_summary', 'sync_status'],
      };
    }

    if (canView('hr.hub') || canView('hr')) {
      return {
        homeRoute: '/hub/hr',
        roleHint: 'hr',
        widgets: ['notifications', 'quick_links'],
      };
    }

    if (canView('admin.hub') || canView('admin')) {
      return {
        homeRoute: '/hub/settings',
        roleHint: 'settings',
        widgets: ['notifications', 'quick_links'],
      };
    }

    // Club manager (only club access, no more specific department home) → club dashboard.
    if (canView('club.dashboard')) {
      return {
        homeRoute: '/club',
        roleHint: 'club_manager',
        widgets: ['club_kpis', 'pending_renewals', 'attendance_rate', 'treasury_today'],
      };
    }

    return {
      homeRoute: '/profile',
      roleHint: 'staff',
      widgets: ['notifications', 'quick_links'],
    };
  }
}
