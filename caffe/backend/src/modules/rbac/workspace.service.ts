import { Injectable } from '@nestjs/common';
import { PermissionEngineService } from './engine/permission-engine.service';

export interface WorkspaceConfig {
  homeRoute: string;
  roleHint: string;
  widgets: string[];
}

/** Ordera cafe — role-aware home routes (no gym/club/trainer paths). */
@Injectable()
export class WorkspaceService {
  constructor(private readonly engine: PermissionEngineService) {}

  async getWorkspace(userId: number): Promise<WorkspaceConfig> {
    const eff = await this.engine.getEffective(userId);
    const canView = (key: string) => eff.superAdmin || eff.keys.has(`${key}:view`);

    if (eff.superAdmin) {
      return {
        homeRoute: '/dashboard',
        roleHint: 'owner',
        widgets: ['today_sales', 'low_stock_alerts', 'shift_status', 'finance_summary'],
      };
    }

    if (canView('gym-sales.sales.new_receipt')) {
      return {
        homeRoute: '/sales/new',
        roleHint: 'cafe',
        widgets: ['pos_shift', 'today_sales', 'low_stock_alerts'],
      };
    }

    if (canView('financial-reports.dashboard')) {
      return {
        homeRoute: '/finance/dashboard',
        roleHint: 'finance',
        widgets: ['revenue_summary', 'expense_summary', 'sync_status'],
      };
    }

    if (canView('accounting.dashboard')) {
      return {
        homeRoute: '/accounting',
        roleHint: 'accountant',
        widgets: ['trial_balance', 'pending_journal', 'cash_position'],
      };
    }

    if (canView('admin.hub') || canView('admin')) {
      return {
        homeRoute: '/hub/settings',
        roleHint: 'settings',
        widgets: ['notifications', 'quick_links'],
      };
    }

    return {
      homeRoute: '/profile',
      roleHint: 'staff',
      widgets: ['notifications', 'quick_links'],
    };
  }
}
