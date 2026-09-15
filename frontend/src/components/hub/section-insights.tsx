import { Calculator, Package, Warehouse } from 'lucide-react';
import { AppManagementDashboardBody } from '@/components/hub/app-management-dashboard-body';
import { ClubDashboardBody } from '@/components/hub/club-dashboard-body';
import { GymSalesHubBody } from '@/components/hub/gym-sales-hub-body';
import { SettingsDashboardBody } from '@/components/hub/settings-dashboard-body';
import { PortalManagementDashboardBody } from '@/components/hub/portal-management-dashboard-body';
import { FinanceDashboardBody } from '@/pages/finance/dashboard';
import { AccountingDashboardBody } from '@/pages/accounting/dashboard';
import { HrSectionDashboard } from '@/pages/dashboard';

export function SectionDashboard({ sectionId }: { sectionId: string }) {
  switch (sectionId) {
    case 'club':
      return <ClubDashboardBody embedded />;
    case 'gym-sales':
      return <GymSalesHubBody />;
    case 'financial-reports':
      return <FinanceDashboardBody />;
    case 'accounting':
      return <AccountingDashboardBody />;
    case 'hr':
      return <HrSectionDashboard />;
    case 'app-management':
      return <AppManagementDashboardBody />;
    case 'portal-management':
      return <PortalManagementDashboardBody />;
    case 'settings':
      return <SettingsDashboardBody />;
    default:
      return null;
  }
}
