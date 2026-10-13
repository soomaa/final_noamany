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
    const eff = await this.engine.getEffective(userId);
    const hasAdministrativeAccess = eff.superAdmin || eff.keys.size > 0;
    const user = await this.prisma.users.findUnique({
      where: { user_id: userId },
      select: { emp_code: true },
    });
    if (user?.emp_code) {
      const trainer = await this.prisma.club_trainers.findUnique({
        where: { employee_id: user.emp_code },
        select: { is_active: true, is_deleted: true },
      });
      // Keep the dedicated portal as the home only for trainers who do not
      // have an administrative role. Trainers with granted pages use the
      // normal workspace and can still open their portal from the sidebar.
      if (trainer?.is_active && !trainer.is_deleted && !hasAdministrativeAccess) {
        return {
          homeRoute: '/trainer',
          roleHint: 'trainer',
          widgets: ['my_schedule', 'attendance', 'earnings', 'trainer_statistics'],
        };
      }
    }
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
    if (canCreate('club.members')) {
      const widgets: string[] = [];
      if (canView('club.subscriptions.daily_cashier')) widgets.push('treasury_today');
      if (canView('club.members.attendance')) widgets.push('recent_checkins');
      if (canView('club.subscriptions.list')) widgets.push('expiring_subscriptions');
      if (canView('club.subscriptions.outstanding')) widgets.push('outstanding_balances');
      return {
        homeRoute: '/workspace',
        roleHint: 'reception',
        widgets,
      };
    }

    if (canView('club.subscriptions.new') && canCreate('club.subscriptions.new')) {
      const widgets = ['my_subscriptions_today'];
      if (canView('club.subscriptions.daily_cashier')) widgets.push('treasury_today');
      return {
        homeRoute: '/workspace',
        roleHint: 'subscriptions',
        widgets,
      };
    }

    if (canView('gym-sales.sales.new_receipt')) {
      return {
        homeRoute: '/workspace',
        roleHint: 'cafe',
        widgets: ['pos_shift', 'today_sales', 'low_stock_alerts'],
      };
    }

    if (canView('gym-sales.sales')) {
      return {
        homeRoute: '/workspace',
        roleHint: 'sales',
        widgets: ['pos_shift', 'today_sales', 'low_stock_alerts'],
      };
    }

    if (canView('accounting.dashboard')) {
      return {
        homeRoute: '/workspace',
        roleHint: 'accountant',
        widgets: ['trial_balance', 'pending_journal', 'cash_position'],
      };
    }

    if (canView('financial-reports.dashboard')) {
      return {
        homeRoute: '/workspace',
        roleHint: 'finance',
        widgets: ['revenue_summary', 'expense_summary', 'sync_status'],
      };
    }

    if (canView('hr.hub') || canView('hr')) {
      return {
        homeRoute: '/workspace',
        roleHint: 'hr',
        widgets: [],
      };
    }

    if (canView('admin.hub') || canView('admin')) {
      return {
        homeRoute: '/workspace',
        roleHint: 'settings',
        widgets: [],
      };
    }

    // Club manager (only club access, no more specific department home) → club dashboard.
    if (canView('club.dashboard')) {
      return {
        homeRoute: '/workspace',
        roleHint: 'club_manager',
        widgets: ['club_kpis', 'pending_renewals', 'attendance_rate', 'treasury_today'],
      };
    }

    return {
      homeRoute: '/workspace',
      roleHint: 'staff',
      widgets: [],
    };
  }
}
