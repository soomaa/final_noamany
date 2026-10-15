import { CafeDashboardPage, FinancePayrollPreparationPage, FinancePayrollApprovalPage } from './lazy-pages';
import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation, useParams, Outlet } from 'react-router-dom';
import { AppShell } from '@/components/layout/app-shell';
import { HomeRedirect } from '@/components/auth/home-redirect';
import { ConfirmDialogProvider } from '@/components/common/confirm-dialog';
import { PageSkeleton } from '@/components/common/page-skeleton';
import { RouteGuard } from '@/components/auth/route-guard';
import { LoginPage } from '@/pages/login';
import { useAuth } from '@/store/auth';
import { usePermission } from '@/hooks/use-permission';
import {
  ArchivePage,
  AttendanceBoardPage,
  AttendanceDevicesPage,
  AttendanceRulesPage,
  AttendanceSettingsPage,
  CircularsPage,
  ClearancePage,
  CompanyPage,
  CustodyPage,
  DashboardPage,
  TrainerPortalPage,
  SalesPortalPage,
  SalesCallsLogPage,
  ClubLeadsPage,
  ClubSalesReportsPage,
  DepartmentHubPage,
  DocumentsPage,
  EmployeeFormPage,
  EmployeeProfilePage,
  EmployeesListPage,
  HrPartnersPage,
  EvaluationsPage,
  FormsSettingsPage,
  GymRatesPage,
  HrActionScreenPage,
  JobRequestsPage,
  LeaveBalancesPage,
  LeaveFormPage,
  LeavesPage,
  LeaveTypesPage,
  LoanSettingsPage,
  LoansPage,
  MenuPlaceholderPage,
  MissionsPage,
  NotificationsPage,
  OrgBranchesPage,
  OrgDepartmentsPage,
  OrgJobTitlesPage,
  PayComponentsPage,
  InsuranceSettingsPage,
  PayrollRunDetailPage,
  PayrollRunsPage,
  PayrollSetupPage,
  PayrollSlipPage,
  FinalSettlementsPage,
  PenaltiesBylawPage,
  PenaltiesPage,
  PermissionsPage,
  ProfilePage,
  ReportDetailPage,
  ReportsHubPage,
  ClubSubscriptionReportsPage,
  RequestDetailPage,
  RequestNewPage,
  RequestsPage,
  RewardsPage,
  SalaryScalePage,
  SiteVisitsPage,
  UsersPage,
  WarningsPage,
  WeeklyLeavesPage,
  // Wave 4 — parity new pages
  LocationsPage,
  AgentsPage,
  MessagesPage,
  DailyReportsPage,
  InitiativesPage,
  ActivitiesPage,
  TasksPage,
  LegalFilesPage,
  AppUsersPage,
  UsersManagePage,
  PushBroadcastPage,
  AutomationPage,
  GymPoliciesPage,
  BusinessAuditPage,
  BackupSettingsPage,
  WebhooksSettingsPage,
  ClubMembersManagementPage,
  ClubMembersAttendancePage,
  ClubReceptionPage,
  ClubReceptionQuickServicesPage,
  ClubBarcodeManagementPage,
  ClubMemberGroupsPage,
  ClubSurveysPage,
  ClubSubscriptionsPage,
  ClubFreezeRequestsPage,
  ClubSubscriptionsNewPage,
  ClubDailyCashierPage,
  ClubSubscriptionsTransfersPage,
  ClubSubscriptionsRefundsPage,
  ClubSubscriptionsReceiptsPage,
  ClubPackageSettingsPage,
  ClubCustomerSourcesPage,
  ClubSubscriptionsExpiredPage,
  ClubSubscriptionsOutstandingPage,
  ClubTreasuryPage,
  UnifiedTreasuryPage,
  ClubMemberTransferPage,
  ClubDiscountsPage,
  ClubTimeBasedSubscriptionsPage,
  ClubLockersPage,
  InventoryIndexPage,
  InventoryDashboardPage,
  InventorySettingsPage,
  InventoryProductsPage,
  InventoryPriceListPage,
  InventoryOpeningStockPage,
  InventoryTransactionsPage,
  InventoryMovementLogPage,
  InventoryStockHealthPage,
  InventoryStockTakingPage,
  InventoryStockTakingWorkspacePage,
  InventoryPoliciesPage,
  InventoryAnalyticsPage,
  InventoryGymIssuePage,
  CafeSupplierPaymentsPage,
  ProcurementDashboardPage,
  ProcurementGoodsReceiptsPage,
  ProcurementIndexPage,
  ProcurementInvoicesPage,
  ProcurementPurchaseOrdersPage,
  ProcurementQuickPoPage,
  ProcurementRequisitionsPage,
  ProcurementReturnsDebitPage,
  ProcurementReturnsPage,
  ProcurementSettingsPage,
  SalesIndexPage,
  SalesBookingsPage,
  SalesNewReceiptPage,
  SalesDraftsPage,
  SalesShiftsPage,
  SalesRevenuePage,
  SalesTreasuryPage,
  PosAdminPage,
  SalesSettlementsPage,
  FinanceIndexPage,
  FinanceDashboardPage,
  FinanceExpensesPage,
  FinanceRevenuesPage,
  FinanceExpenseReportsPage,
  FinanceRevenueReportsPage,
  FinanceAnalysisPage,
  FinanceProfitLossPage,
  AccountingIndexPage,
  AccountingDashboardPage,
  JournalEntriesPage,
  ChartOfAccountsPage,
  GeneralLedgerPage,
  AccountStatementPage,
  TrialBalancePage,
  IncomeStatementPage,
  BalanceSheetPage,
  CashFlowPage,
  AccountingSettingsPage,
  AboutAppPage,
  AppPaymentMethodsPage,
  AppBranchesPage,
  SentInvitationsPage,
  AcceptedInvitationsPage,
  AttendedInvitationsPage,
  RejectedInvitationsPage,
  AppOffersPage,
  MemberNotificationsPage,
  AppTrainersPage,
  ExerciseCategoriesPage,
  AppExercisesPage,
  AppNewsPage,
  AppAdsPage,
  FitnessProgramsPage,
  FitnessTemplatesPage,
  FitnessStrengthPage,
  FitnessProgressPage,
  FitnessAssessmentsPage,
  FitnessRoomBookingsPage,
  FitnessPersonalSessionsPage,
  FitnessBookingBoardPage,
  FitnessTrainerPaymentsPage,
  FitnessTrainersAdminPage,
  FitnessTrainerProfilePage,
  FitnessTrainerSearchPage,
  FitnessTrainerRatingsPage,
  FitnessTrainerSettingsPage,
  FitnessFacilitiesPage,
  FitnessEquipmentPage,
  FitnessMaintenancePage,
  FitnessSpaServicesPage,
  FitnessSpaBookingsPage,
  FitnessSpaInvoicesPage,
  FitnessInbodyPage,
  FitnessFacilitySettingsPage,
  ClubEventsPage,
  GateAccessPage,
  ClubEventWorkspacePage,
  ClubEventsRegistrationsPage,
  ClubEventCheckinPage,
  ClubEventSettingsPage,
  ClubEventCreateWizardPage,
  ClubEventLiveDisplayPage,
  ClubEventLiveCheckInPage,
  ClubEventLiveGuestPage,
  ClubEventLiveProgramPage,
  ClubEventLiveSettingsPage,
  ClubEventLiveKioskRedirectPage,
  CafeProductsPage,
  CafeBundlesPage,
  CafeCategoriesPage,
  CafeRawMaterialsPage,
  CafeReportsPage,
  CafeWastePage,
  CafeCustomersPage,
  CafeItemFeedbackReportPage,
  CafePurchasesPage,
  CafeSuppliersPage,
  // Enterprise RBAC admin
  AdminLayout,
  RolesPage,
  UserExceptionsPage,
  AuditPage,
} from '@/app/lazy-pages';

const MembershipAddPage = lazy(() => import('@/pages/club/membership-add').then(module => ({ default: module.MembershipAddPage })));

function Lazy({ children }: { children: ReactNode }) {
  return <Suspense fallback={<PageSkeleton />}>{children}</Suspense>;
}

const TRAINER_ALLOWED_PATHS = new Set(['/trainer', '/trainer/training', '/profile', '/notifications']);

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { status, user } = useAuth();
  const { can, isReady } = usePermission();
  const { pathname } = useLocation();
  if (status === 'unauthenticated') return <Navigate to="/login" replace />;
  const normalizedPath = pathname.replace(/\/+$/, '') || '/';
  if (user?.is_trainer && isReady && can('trainer.portal:view') && !TRAINER_ALLOWED_PATHS.has(normalizedPath)) {
    return <Navigate to="/trainer" replace />;
  }
  return <>{children}</>;
}

/** Legacy per-user permission tree is superseded by enterprise RBAC user exceptions. */
function LegacyUserPermsRedirect() {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={`/admin/exceptions?user=${id ?? ''}`} replace />;
}

export function AppRouter() {
  return (
    <>
      <ConfirmDialogProvider />
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        {/* شاشات العرض الحي — ملء الشاشة بدون شريط النظام */}
        <Route
          element={
            <ProtectedRoute>
              <RouteGuard>
                <Outlet />
              </RouteGuard>
            </ProtectedRoute>
          }
        >
          <Route path="trainer" element={<Lazy><TrainerPortalPage /></Lazy>} />
          <Route path="trainer/training" element={<Lazy><TrainerPortalPage /></Lazy>} />
          <Route path="club/events/:id/live/display" element={<Lazy><ClubEventLiveDisplayPage /></Lazy>} />
          <Route path="club/events/:id/live/checkin" element={<Lazy><ClubEventLiveCheckInPage /></Lazy>} />
          <Route path="club/events/:id/live/guest" element={<Lazy><ClubEventLiveGuestPage /></Lazy>} />
          <Route path="club/events/:id/live/kiosk" element={<Lazy><ClubEventLiveKioskRedirectPage /></Lazy>} />
          <Route path="club/events/:id/live/program" element={<Lazy><ClubEventLiveProgramPage /></Lazy>} />
          <Route path="club/events/:id/live/settings" element={<Lazy><ClubEventLiveSettingsPage /></Lazy>} />
        </Route>

        <Route
          element={
            <ProtectedRoute>
              <AppShell />
            </ProtectedRoute>
          }
        >
          <Route index element={<HomeRedirect />} />
          <Route path="dashboard" element={<Lazy><DashboardPage /></Lazy>} />
          <Route path="sales-portal" element={<Lazy><SalesPortalPage /></Lazy>} />
          <Route path="sales-portal/leads" element={<Lazy><SalesPortalPage /></Lazy>} />
          <Route path="sales-portal/renewals" element={<Lazy><SalesPortalPage /></Lazy>} />
          <Route path="sales-portal/results" element={<Lazy><SalesPortalPage /></Lazy>} />
          <Route path="sales-portal/reminders" element={<Lazy><SalesPortalPage /></Lazy>} />
          <Route path="sales-portal/calls" element={<Lazy><SalesCallsLogPage /></Lazy>} />
          <Route path="club/leads" element={<Lazy><ClubLeadsPage /></Lazy>} />
          <Route path="club/sales-dashboard" element={<Lazy><ClubSalesReportsPage /></Lazy>} />
          <Route path="club/sales-settings" element={<Lazy><ClubSalesReportsPage /></Lazy>} />
          <Route path="club/sales-reports" element={<Lazy><ClubSalesReportsPage /></Lazy>} />
          <Route path="hub/:section" element={<Lazy><DepartmentHubPage /></Lazy>} />

          <Route path="org/branches" element={<Lazy><OrgBranchesPage /></Lazy>} />
          <Route path="org/job-titles" element={<Lazy><OrgJobTitlesPage /></Lazy>} />
          <Route path="org/departments" element={<Lazy><OrgDepartmentsPage /></Lazy>} />

          <Route path="employees/weekly-leaves" element={<Lazy><WeeklyLeavesPage /></Lazy>} />
          <Route path="employees" element={<Lazy><EmployeesListPage /></Lazy>} />
          <Route path="employees/new" element={<Lazy><EmployeeFormPage /></Lazy>} />
          <Route path="employees/:id/edit" element={<Lazy><EmployeeFormPage /></Lazy>} />
          <Route path="employees/:id" element={<Lazy><EmployeeProfilePage /></Lazy>} />
          <Route path="hr/partners" element={<Lazy><HrPartnersPage /></Lazy>} />

          <Route path="settings/forms" element={<Lazy><FormsSettingsPage /></Lazy>} />
          <Route path="settings/pay-components" element={<Lazy><PayComponentsPage /></Lazy>} />
          <Route path="settings/insurance" element={<Lazy><InsuranceSettingsPage /></Lazy>} />
          <Route path="settings/locations" element={<Lazy><LocationsPage /></Lazy>} />
          <Route path="settings/app-users" element={<Lazy><AppUsersPage /></Lazy>} />
          <Route path="settings/push" element={<Lazy><PushBroadcastPage /></Lazy>} />
          <Route path="settings/automation" element={<Lazy><AutomationPage /></Lazy>} />
          <Route path="settings/gym-policies" element={<Lazy><GymPoliciesPage /></Lazy>} />
          <Route path="settings/business-audit" element={<Lazy><BusinessAuditPage /></Lazy>} />
          <Route path="settings/backup" element={<Lazy><BackupSettingsPage /></Lazy>} />
          <Route path="settings/webhooks" element={<Lazy><WebhooksSettingsPage /></Lazy>} />
          <Route path="agents" element={<Lazy><AgentsPage /></Lazy>} />

          <Route path="attendance/devices" element={<Lazy><AttendanceDevicesPage /></Lazy>} />
          <Route path="attendance/settings" element={<Lazy><AttendanceSettingsPage /></Lazy>} />
          <Route path="attendance/rules" element={<Lazy><AttendanceRulesPage /></Lazy>} />
          <Route path="attendance" element={<Lazy><AttendanceBoardPage /></Lazy>} />

          <Route path="payroll/salary-scale" element={<Lazy><SalaryScalePage /></Lazy>} />
          <Route path="payroll/setup" element={<Lazy><PayrollSetupPage /></Lazy>} />
          <Route path="payroll/runs" element={<Lazy><PayrollRunsPage /></Lazy>} />
          <Route path="payroll/runs/:id/slip/:empId" element={<Lazy><PayrollSlipPage /></Lazy>} />
          <Route path="payroll/runs/:id" element={<Lazy><PayrollRunDetailPage /></Lazy>} />
          <Route path="payroll/final-settlements" element={<Lazy><FinalSettlementsPage /></Lazy>} />

          <Route path="leaves" element={<Lazy><LeavesPage /></Lazy>} />
          <Route path="leaves/new" element={<Lazy><LeaveFormPage /></Lazy>} />
          <Route path="leaves/types" element={<Lazy><LeaveTypesPage /></Lazy>} />
          <Route path="leaves/balances" element={<Lazy><LeaveBalancesPage /></Lazy>} />

          <Route path="missions" element={<Lazy><MissionsPage /></Lazy>} />
          <Route path="permissions" element={<Lazy><PermissionsPage /></Lazy>} />

          <Route path="sites/visits" element={<Lazy><SiteVisitsPage /></Lazy>} />

          <Route path="hr/action-screen" element={<Lazy><HrActionScreenPage /></Lazy>} />
          <Route path="hr/gym-rates" element={<Lazy><GymRatesPage /></Lazy>} />
          <Route path="hr/circulars" element={<Lazy><CircularsPage /></Lazy>} />
          <Route path="hr/warnings" element={<Lazy><WarningsPage /></Lazy>} />
          <Route path="hr/evaluations" element={<Lazy><EvaluationsPage /></Lazy>} />
          <Route path="hr/custody" element={<Lazy><CustodyPage /></Lazy>} />
          <Route path="hr/job-requests" element={<Lazy><JobRequestsPage /></Lazy>} />
          <Route path="hr/messages" element={<Lazy><MessagesPage /></Lazy>} />
          <Route path="hr/daily-reports" element={<Lazy><DailyReportsPage /></Lazy>} />
          <Route path="hr/initiatives" element={<Lazy><InitiativesPage /></Lazy>} />
          <Route path="hr/activities" element={<Lazy><ActivitiesPage /></Lazy>} />
          <Route path="hr/tasks" element={<Lazy><TasksPage /></Lazy>} />
          <Route path="hr/legal-files" element={<Lazy><LegalFilesPage /></Lazy>} />

          <Route path="termination/clearance" element={<Lazy><ClearancePage /></Lazy>} />
          <Route path="termination/archive" element={<Lazy><ArchivePage /></Lazy>} />

          <Route path="loans/settings" element={<Lazy><LoanSettingsPage /></Lazy>} />
          <Route path="loans" element={<Lazy><LoansPage /></Lazy>} />
          <Route path="penalties/bylaw" element={<Lazy><PenaltiesBylawPage /></Lazy>} />
          <Route path="penalties" element={<Lazy><PenaltiesPage /></Lazy>} />
          <Route path="rewards" element={<Lazy><RewardsPage /></Lazy>} />
          <Route path="documents" element={<Lazy><DocumentsPage /></Lazy>} />
          <Route path="requests/new/:type" element={<Lazy><RequestNewPage /></Lazy>} />
          <Route path="requests/:id" element={<Lazy><RequestDetailPage /></Lazy>} />
          <Route path="requests" element={<Lazy><RequestsPage /></Lazy>} />
          <Route path="notifications" element={<Lazy><NotificationsPage /></Lazy>} />

          <Route path="reports" element={<Lazy><ReportsHubPage /></Lazy>} />
          {/* Club report pages — added Part 6A */}
          <Route path="reports/club/members-daily" element={<Navigate to="/club/members" replace />} />
          <Route path="reports/club/subscriptions-daily" element={<Navigate to="/club/subscriptions/reports" replace />} />
          <Route path="reports/club/subscriptions-expired" element={<Navigate to="/club/subscriptions/reports" replace />} />
          <Route path="reports/club/subscriptions-active" element={<Navigate to="/club/subscriptions/reports" replace />} />
          <Route path="reports/club/subscriptions-expiring" element={<Navigate to="/club/subscriptions/reports" replace />} />
          <Route path="reports/club/subscription-sessions" element={<Navigate to="/club/packages/settings" replace />} />
          <Route path="reports/club/sales-staff" element={<Navigate to="/club/subscriptions/user-analytics" replace />} />
          <Route path="reports/club/attendance" element={<Navigate to="/club/members/attendance" replace />} />
          <Route path="reports/club/trainers" element={<Navigate to="/club/fitness/trainers" replace />} />
          <Route path="reports/club/lockers" element={<Navigate to="/club/lockers" replace />} />
          {/* Finance report pages — added Part 6B */}
          <Route path="reports/finance/revenue" element={<Navigate to="/finance/revenue-reports" replace />} />
          <Route path="reports/finance/expenses" element={<Navigate to="/finance/expense-reports" replace />} />
          <Route path="reports/finance/pnl" element={<Navigate to="/finance/profit-loss" replace />} />
          <Route path="reports/finance/cash-flow" element={<Navigate to="/accounting/cash-flow" replace />} />
          <Route path="reports/finance/treasury" element={<Navigate to="/club/unified-treasury" replace />} />
          <Route path="reports/finance/payment-methods" element={<Navigate to="/club/subscriptions/reports" replace />} />
          <Route path="reports/finance/outstanding" element={<Navigate to="/club/subscriptions/outstanding" replace />} />
          {/* Fallback to legacy HR reports handler */}
          <Route path="reports/:key" element={<Lazy><ReportDetailPage /></Lazy>} />

          <Route path="club" element={<Navigate to="/hub/club" replace />} />
          <Route path="club/reception" element={<Lazy><ClubReceptionPage /></Lazy>} />
          <Route path="club/reception/quick-services" element={<Lazy><ClubReceptionQuickServicesPage /></Lazy>} />
          <Route path="club/members/cards" element={<Navigate to="/club/members/barcode-management?tab=membership" replace />} />
          <Route path="club/members/barcode-management" element={<Lazy><ClubBarcodeManagementPage /></Lazy>} />
          <Route path="club/members/attendance" element={<Lazy><ClubMembersAttendancePage /></Lazy>} />
          <Route path="club/gate-access" element={<Lazy><GateAccessPage /></Lazy>} />
          <Route path="club/members/groups" element={<Lazy><ClubMemberGroupsPage /></Lazy>} />
          <Route path="club/members/surveys" element={<Lazy><ClubSurveysPage /></Lazy>} />
          <Route path="club/members/settings" element={<Navigate to="/club/packages/settings" replace />} />
          <Route path="club/members" element={<Lazy><ClubMembersManagementPage /></Lazy>} />
          <Route path="club/packages/settings" element={<Lazy><ClubPackageSettingsPage /></Lazy>} />
          <Route path="club/subscriptions/new" element={<Lazy><ClubSubscriptionsNewPage /></Lazy>} />
          <Route path="club/subscriptions/special" element={<Navigate to="/club/packages/settings" replace />} />
          <Route path="club/subscriptions/daily-cashier" element={<Lazy><ClubDailyCashierPage /></Lazy>} />
          <Route path="club/subscriptions/reports" element={<Lazy><ClubSubscriptionReportsPage /></Lazy>} />
          <Route path="club/subscriptions/time-based" element={<Lazy><ClubTimeBasedSubscriptionsPage /></Lazy>} />
          <Route path="club/subscriptions/transfers" element={<Lazy><ClubSubscriptionsTransfersPage /></Lazy>} />
          <Route path="club/subscriptions/member-transfer" element={<Lazy><ClubMemberTransferPage /></Lazy>} />
          <Route path="club/subscriptions/refunds" element={<Lazy><ClubSubscriptionsRefundsPage /></Lazy>} />
          <Route path="club/subscriptions/receipts" element={<Lazy><ClubSubscriptionsReceiptsPage /></Lazy>} />
          <Route path="club/subscriptions/financial-reports" element={<Navigate to="/finance/revenue-reports" replace />} />
          <Route path="club/subscriptions/expired" element={<Lazy><ClubSubscriptionsExpiredPage /></Lazy>} />
          <Route path="club/subscriptions/outstanding" element={<Lazy><ClubSubscriptionsOutstandingPage /></Lazy>} />
          <Route path="club/subscriptions/member-financial" element={<Navigate to="/club/members" replace />} />
          <Route path="club/subscriptions/treasury" element={<Lazy><ClubTreasuryPage /></Lazy>} />
          <Route path="club/unified-treasury" element={<Lazy><UnifiedTreasuryPage /></Lazy>} />
          <Route path="club/subscriptions/discounts" element={<Lazy><ClubDiscountsPage /></Lazy>} />
          <Route path="club/subscriptions/customer-sources" element={<Lazy><ClubCustomerSourcesPage /></Lazy>} />
          <Route path="club/subscriptions/user-analytics" element={<Navigate to="/club/subscriptions/reports" replace />} />
          <Route path="club/subscriptions/settings" element={<Navigate to="/club/packages/settings" replace />} />
          <Route path="club/subscriptions/member-form" element={<Navigate to="/club/members" replace />} />
          <Route path="club/membership-add/new" element={<Lazy><MembershipAddPage form /></Lazy>} />
          <Route path="club/membership-add" element={<Lazy><MembershipAddPage /></Lazy>} />
          <Route path="club/subscriptions" element={<Lazy><ClubSubscriptionsPage /></Lazy>} />
          <Route path="club/subscriptions/freeze-requests" element={<Lazy><ClubFreezeRequestsPage /></Lazy>} />
          <Route path="club/lockers/new" element={<Navigate to="/club/lockers?tab=lockers" replace />} />
          <Route path="club/lockers/settings" element={<Navigate to="/club/lockers?tab=types" replace />} />
          <Route path="club/lockers" element={<Lazy><ClubLockersPage /></Lazy>} />

          <Route path="club/fitness/trainer-payments" element={<Navigate to="/club/fitness/trainers?tab=overview" replace />} />
          <Route path="club/fitness/trainer-search" element={<Navigate to="/club/fitness/trainers?tab=team" replace />} />
          <Route path="club/fitness/trainer-ratings" element={<Navigate to="/club/fitness/trainers?tab=team" replace />} />
          <Route path="club/fitness/trainer-settings" element={<Navigate to="/club/fitness/trainers?tab=settings" replace />} />
          <Route path="club/fitness/trainer-performance" element={<Navigate to="/club/fitness/trainers?tab=overview" replace />} />
          <Route path="club/fitness/trainers/:id" element={<Lazy><FitnessTrainerProfilePage /></Lazy>} />
          <Route path="club/fitness/equipment-maintenance" element={<Lazy><FitnessMaintenancePage /></Lazy>} />
          <Route path="club/fitness/spa-invoices" element={<Lazy><FitnessSpaInvoicesPage /></Lazy>} />
          <Route path="club/fitness/spa-bookings" element={<Lazy><FitnessSpaBookingsPage /></Lazy>} />
          <Route path="club/fitness/inbody" element={<Lazy><FitnessInbodyPage /></Lazy>} />
          <Route path="club/subscriptions/inbody-invoices" element={<Navigate to="/club/fitness/inbody" replace />} />
          <Route path="club/fitness/inbody-invoices" element={<Navigate to="/club/fitness/inbody" replace />} />
          <Route path="club/fitness/facility-settings" element={<Lazy><FitnessFacilitySettingsPage /></Lazy>} />
          <Route path="club/fitness/class-booking" element={<Navigate to="/club/packages/settings?tab=scheduling" replace />} />
          <Route path="club/fitness/room-bookings" element={<Lazy><FitnessRoomBookingsPage /></Lazy>} />
          <Route path="club/fitness/personal-sessions" element={<Lazy><FitnessPersonalSessionsPage /></Lazy>} />
          <Route path="club/fitness/booking-board" element={<Lazy><FitnessBookingBoardPage /></Lazy>} />
          <Route path="club/fitness/programs" element={<Lazy><FitnessProgramsPage /></Lazy>} />
          <Route path="club/fitness/templates" element={<Lazy><FitnessTemplatesPage /></Lazy>} />
          <Route path="club/fitness/strength" element={<Lazy><FitnessStrengthPage /></Lazy>} />
          <Route path="club/fitness/progress" element={<Lazy><FitnessProgressPage /></Lazy>} />
          <Route path="club/fitness/assessments" element={<Lazy><FitnessAssessmentsPage /></Lazy>} />
          <Route path="club/fitness/scheduling" element={<Navigate to="/club/packages/settings?tab=scheduling" replace />} />
          <Route path="club/fitness/classes" element={<Navigate to="/club/packages/settings" replace />} />
          <Route path="club/fitness/trainers" element={<Lazy><FitnessTrainersAdminPage /></Lazy>} />
          <Route path="club/fitness/facilities" element={<Lazy><FitnessFacilitiesPage /></Lazy>} />
          <Route path="club/fitness/equipment" element={<Lazy><FitnessEquipmentPage /></Lazy>} />
          <Route path="club/fitness/spa-services" element={<Lazy><FitnessSpaServicesPage /></Lazy>} />

          <Route path="club/events" element={<Lazy><ClubEventsPage /></Lazy>} />
          <Route path="club/events/create" element={<Lazy><ClubEventCreateWizardPage /></Lazy>} />
          <Route path="club/events/registrations" element={<Lazy><ClubEventsRegistrationsPage /></Lazy>} />
          <Route path="club/events/checkin" element={<Lazy><ClubEventCheckinPage /></Lazy>} />
          <Route path="club/events/settings" element={<Lazy><ClubEventSettingsPage /></Lazy>} />
          <Route path="club/events/:id" element={<Lazy><ClubEventWorkspacePage /></Lazy>} />

          <Route path="club/cafe/dashboard" element={<Lazy><CafeDashboardPage /></Lazy>} />
          <Route path="cafe/dashboard" element={<Navigate to="/club/cafe/dashboard" replace />} />
          <Route path="finance/payroll-preparation" element={<Lazy><FinancePayrollPreparationPage /></Lazy>} />
          <Route path="finance/payroll-approval" element={<Lazy><FinancePayrollApprovalPage /></Lazy>} />
          <Route path="club/cafe" element={<Navigate to="/sales/new" replace />} />
          <Route path="club/cafe/products" element={<Lazy><CafeProductsPage /></Lazy>} />
          <Route path="club/cafe/bundles" element={<Lazy><CafeBundlesPage /></Lazy>} />
          <Route path="club/cafe/categories" element={<Lazy><CafeCategoriesPage /></Lazy>} />
          <Route path="club/cafe/raw-materials" element={<Lazy><CafeRawMaterialsPage /></Lazy>} />
          <Route path="club/cafe/reports" element={<Lazy><CafeReportsPage /></Lazy>} />
          <Route path="club/cafe/waste" element={<Lazy><CafeWastePage /></Lazy>} />
          <Route path="club/cafe/customers" element={<Lazy><CafeCustomersPage /></Lazy>} />
          <Route path="club/cafe/reports/feedback" element={<Lazy><CafeItemFeedbackReportPage /></Lazy>} />
          <Route path="club/cafe/purchases" element={<Lazy><CafePurchasesPage /></Lazy>} />
          <Route path="club/cafe/suppliers" element={<Lazy><CafeSuppliersPage /></Lazy>} />
          <Route path="club/cafe/supplier-payments" element={<Lazy><CafeSupplierPaymentsPage /></Lazy>} />
          <Route path="club/cafe/stock-taking" element={<Lazy><InventoryStockTakingPage /></Lazy>} />
          <Route path="club/cafe/stock-taking/:id" element={<Lazy><InventoryStockTakingWorkspacePage /></Lazy>} />
          <Route path="club/cafe/movements" element={<Lazy><InventoryMovementLogPage /></Lazy>} />
          <Route path="club/cafe/stock-health" element={<Lazy><InventoryStockHealthPage /></Lazy>} />
          <Route path="club/cafe/pos" element={<Navigate to="/sales/new" replace />} />

          <Route path="inventory" element={<Navigate to="/club/cafe/raw-materials" replace />} />
          <Route path="inventory/dashboard" element={<Lazy><InventoryDashboardPage /></Lazy>} />
          <Route path="inventory/settings" element={<Navigate to="/club/cafe/raw-materials" replace />} />
          <Route path="inventory/products" element={<Navigate to="/club/cafe/products" replace />} />
          <Route path="inventory/price-list" element={<Lazy><InventoryPriceListPage /></Lazy>} />
          <Route path="inventory/opening-stock" element={<Navigate to="/club/cafe/movements" replace />} />
          <Route path="inventory/gym-issue" element={<Lazy><InventoryGymIssuePage /></Lazy>} />
          <Route path="inventory/transactions" element={<Navigate to="/club/cafe/movements" replace />} />
          <Route path="inventory/movement-log" element={<Navigate to="/club/cafe/movements" replace />} />
          <Route path="inventory/stock-taking" element={<Navigate to="/club/cafe/stock-taking" replace />} />
          <Route path="inventory/policies" element={<Navigate to="/club/cafe/raw-materials" replace />} />
          <Route path="inventory/analytics" element={<Navigate to="/club/cafe/reports" replace />} />

          <Route path="procurement" element={<Navigate to="/club/cafe/purchases" replace />} />
          <Route path="procurement/settings" element={<Navigate to="/club/cafe/suppliers" replace />} />
          <Route path="procurement/requisitions" element={<Navigate to="/club/cafe/purchases" replace />} />
          <Route path="procurement/purchase-orders" element={<Navigate to="/club/cafe/purchases" replace />} />
          <Route path="procurement/quick-po" element={<Navigate to="/club/cafe/purchases" replace />} />
          <Route path="procurement/goods-receipts" element={<Navigate to="/club/cafe/purchases" replace />} />
          <Route path="procurement/invoices" element={<Navigate to="/club/cafe/purchases" replace />} />
          <Route path="procurement/returns" element={<Navigate to="/club/cafe/movements" replace />} />
          <Route path="procurement/returns-debit" element={<Navigate to="/club/cafe/reports" replace />} />
          <Route path="procurement/dashboard" element={<Navigate to="/club/cafe/purchases" replace />} />

          <Route path="sales" element={<Navigate to="/sales/new" replace />} />
          <Route path="sales/bookings" element={<Lazy><SalesBookingsPage /></Lazy>} />
          <Route path="sales/new" element={<Lazy><SalesNewReceiptPage /></Lazy>} />
          <Route path="sales/drafts" element={<Lazy><SalesDraftsPage /></Lazy>} />
          <Route path="sales/invoices" element={<Navigate to="/sales/drafts" replace />} />
          <Route path="sales/shifts" element={<Lazy><SalesShiftsPage /></Lazy>} />
          <Route path="sales/revenue" element={<Navigate to="/club/cafe/reports" replace />} />
          <Route path="sales/treasury" element={<Lazy><SalesTreasuryPage /></Lazy>} />
          <Route path="sales/settlements" element={<Lazy><SalesSettlementsPage /></Lazy>} />
          <Route path="sales/pos-admin" element={<Lazy><PosAdminPage /></Lazy>} />

          <Route path="finance" element={<Lazy><FinanceIndexPage /></Lazy>} />
          <Route path="finance/dashboard" element={<Lazy><FinanceDashboardPage /></Lazy>} />
          <Route path="finance/expenses" element={<Lazy><FinanceExpensesPage /></Lazy>} />
          <Route path="finance/revenues" element={<Lazy><FinanceRevenuesPage /></Lazy>} />
          <Route path="finance/expense-reports" element={<Lazy><FinanceExpenseReportsPage /></Lazy>} />
          <Route path="finance/revenue-reports" element={<Lazy><FinanceRevenueReportsPage /></Lazy>} />
          <Route path="finance/analysis" element={<Lazy><FinanceAnalysisPage /></Lazy>} />
          <Route path="finance/profit-loss" element={<Lazy><FinanceProfitLossPage /></Lazy>} />

          <Route path="accounting" element={<Lazy><AccountingDashboardPage /></Lazy>} />
          <Route path="accounting/journal-entries" element={<Lazy><JournalEntriesPage /></Lazy>} />
          <Route path="accounting/accounts" element={<Lazy><ChartOfAccountsPage /></Lazy>} />
          <Route path="accounting/general-ledger" element={<Lazy><GeneralLedgerPage /></Lazy>} />
          <Route path="accounting/account-statement" element={<Lazy><AccountStatementPage /></Lazy>} />
          <Route path="accounting/trial-balance" element={<Lazy><TrialBalancePage /></Lazy>} />
          <Route path="accounting/income-statement" element={<Lazy><IncomeStatementPage /></Lazy>} />
          <Route path="accounting/balance-sheet" element={<Lazy><BalanceSheetPage /></Lazy>} />
          <Route path="accounting/cash-flow" element={<Lazy><CashFlowPage /></Lazy>} />
          <Route path="accounting/settings" element={<Lazy><AccountingSettingsPage /></Lazy>} />

          <Route path="app/about" element={<Lazy><AboutAppPage /></Lazy>} />
          <Route path="app/payment-methods" element={<Lazy><AppPaymentMethodsPage /></Lazy>} />
          <Route path="app/branches" element={<Lazy><AppBranchesPage /></Lazy>} />
          <Route path="app/invitations/sent" element={<Lazy><SentInvitationsPage /></Lazy>} />
          <Route path="app/invitations/accepted" element={<Lazy><AcceptedInvitationsPage /></Lazy>} />
          <Route path="app/invitations/attended" element={<Lazy><AttendedInvitationsPage /></Lazy>} />
          <Route path="app/invitations/rejected" element={<Lazy><RejectedInvitationsPage /></Lazy>} />
          <Route path="app/offers" element={<Lazy><AppOffersPage /></Lazy>} />
          <Route path="app/notifications" element={<Lazy><MemberNotificationsPage /></Lazy>} />
          <Route path="app/trainers" element={<Lazy><AppTrainersPage /></Lazy>} />
          <Route path="app/exercise-categories" element={<Lazy><ExerciseCategoriesPage /></Lazy>} />
          <Route path="app/exercises" element={<Lazy><AppExercisesPage /></Lazy>} />
          <Route path="app/news" element={<Lazy><AppNewsPage /></Lazy>} />
          <Route path="app/ads" element={<Lazy><AppAdsPage /></Lazy>} />

          <Route path="users" element={<Lazy><UsersPage /></Lazy>} />
          <Route path="users/manage" element={<Lazy><UsersManagePage /></Lazy>} />
          <Route path="users/:id/permissions" element={<LegacyUserPermsRedirect />} />

          <Route path="admin" element={<Lazy><AdminLayout /></Lazy>}>
            <Route index element={<Navigate to="/admin/roles" replace />} />
            <Route path="roles" element={<Lazy><RolesPage /></Lazy>} />
            <Route path="exceptions" element={<Lazy><UserExceptionsPage /></Lazy>} />
            <Route path="audit" element={<Lazy><AuditPage /></Lazy>} />
          </Route>

          <Route path="company" element={<Lazy><CompanyPage /></Lazy>} />
          <Route path="profile" element={<Lazy><ProfilePage /></Lazy>} />
          <Route path="m/:link" element={<Lazy><MenuPlaceholderPage /></Lazy>} />
        </Route>
        <Route path="*" element={<HomeRedirect />} />
      </Routes>
    </>
  );
}
