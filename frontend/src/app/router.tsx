import { Suspense, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation, Outlet } from 'react-router-dom';
import { AppShell } from '@/components/layout/app-shell';
import { PersistentScannerProvider } from '@/components/club/persistent-scanner';
import { HomeRedirect } from '@/components/auth/home-redirect';
import { ConfirmDialogProvider } from '@/components/common/confirm-dialog';
import { PageSkeleton } from '@/components/common/page-skeleton';
import { LoginPage } from '@/pages/login';
import { useAuth } from '@/store/auth';
import {
  ArchivePage,
  AttendanceBoardPage,
  AttendanceDevicesPage,
  AttendanceRulesPage,
  AttendanceSettingsPage,
  AttendanceReportsPage,
  AttendanceAdjustmentsPage,
  AttendanceImportPage,
  CircularsPage,
  ClearancePage,
  CompanyPage,
  CustodyPage,
  DashboardPage,
  TrainerPortalPage,
  DepartmentHubPage,
  DocumentsPage,
  EmployeeAttendancePage,
  EmployeeFinancePage,
  EmployeeFormPage,
  EmployeeProfilePage,
  EmployeeWeeklyLeavePage,
  EmployeesListPage,
  HrPartnersPage,
  EvaluationWorkspacePage,
  MyEvaluationsPage,
  MyPermissionsPage,
  FormsSettingsPage,
  GymRatesPage,
  HrActionScreenPage,
  AdministrativeDecisionsPage,
  AdministrativeDecisionPrintPage,
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
  PayrollRunDetailPage,
  PayrollRunsPage,
  SalaryIncreasesPage,
  SalaryIncreasesReportPage,
  PayrollSetupPage,
  PayrollSlipPage,
  PenaltiesBylawPage,
  PenaltiesPage,
  PermissionsPage,
  ProfilePage,
  ReportDetailPage,
  ReportsHubPage,
  // Part 6A — club report pages
  ClubMembersReportPage,
  ClubSubscriptionsReportPage,
  ClubSubscriptionsExpiredReportPage,
  ClubSubscriptionsActiveReportPage,
  ClubSubscriptionsExpiringReportPage,
  ClubSubscriptionSessionsReportPage,
  ClubSubscriptionReportsPage,
  ClubDailyCashierPage,
  ClubAttendanceReportPage,
  ClubTrainersReportPage,
  ClubLockersReportPage,
  // Part 6B — finance report pages
  FinanceRevenueReportPage,
  FinanceExpensesReportPage,
  FinancePnlReportPage,
  FinanceCashFlowReportPage,
  FinanceTreasuryReportPage,
  FinancePaymentMethodsReportPage,
  FinanceOutstandingReportPage,
  RequestDetailPage,
  RequestNewPage,
  RequestsPage,
  RewardsPage,
  SalaryScalePage,
  SiteVisitsPage,
  WarningsPage,
  WarningTemplatesPage,
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
  HrMobileContentPage,
  AppUsersPage,
  UsersManagePage,
  UserPermissionsPage,
  PushBroadcastPage,
  AutomationPage,
  GymPoliciesPage,
  BusinessAuditPage,
  BackupSettingsPage,
  WebhooksSettingsPage,
  ClubMembersManagementPage,
  ClubMembersAttendancePage,
  ClubMemberFinancialPage,
  ClubReceptionPage,
  ClubReceptionQuickServicesPage,
  ClubBarcodeManagementPage,
  ClubSubscriptionsPage,
  OnlineSubscriptionsPage,
  ClubSubscriptionsNewPage,
  ClubSubscriptionsSpecialPage,
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
  ClubFinancialReportsPage,
  ClubDiscountsPage,
  ClubTargetsPage,
  CustomerServicePage,
  LockerInventoryPage,
  ClubTimeBasedSubscriptionsPage,
  ClubMemberFormPage,
  ClubLockersNewPage,
  ClubLockersSettingsPage,
  InventoryIndexPage,
  InventoryDashboardPage,
  InventorySettingsPage,
  InventoryProductsPage,
  InventoryPriceListPage,
  InventoryOpeningStockPage,
  InventoryTransactionsPage,
  InventoryMovementLogPage,
  InventoryStockTakingPage,
  InventoryStockTakingWorkspacePage,
  InventoryPoliciesPage,
  InventoryAnalyticsPage,
  InventoryGymIssuePage,
  CafeSupplierPaymentsPage,
  CafeDashboardPage,
  CafeWastePage,
  CafeCustomersPage,
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
  SalesPortalPage,
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
  SentInvitationsPage,
  AcceptedInvitationsPage,
  AttendedInvitationsPage,
  RejectedInvitationsPage,
  AppOffersPage,
  AppTrainersPage,
  ExerciseCategoriesPage,
  AppExercisesPage,
  AppNewsPage,
  AppCommunityPage,
  AppAdsPage,
  PortalManagementPage,
  PaymentMethodsPage,
  FitnessProgramsPage,
  FitnessTemplatesPage,
  FitnessStrengthPage,
  FitnessProgressPage,
  FitnessAssessmentsPage,
  FitnessRoomBookingsPage,
  FitnessPersonalSessionsPage,
  FitnessTrainersPage,
  FitnessTrainerProfilePage,
  FitnessTrainerPaymentsPage,
  FitnessTrainerSearchPage,
  FitnessTrainerRatingsPage,
  FitnessTrainerSettingsPage,
  FitnessFacilitiesPage,
  FitnessEquipmentPage,
  FitnessMaintenancePage,
  FitnessSpaServicesPage,
  FitnessSpaBookingsPage,
  FitnessSpaInvoicesPage,
  FitnessBarcodeCheckInPage,
  FitnessSpaAttendancePage,
  FitnessClassAttendancePage,
  FitnessInbodyInvoicesPage,
  FitnessFacilitySettingsPage,
  ClubEventsPage,
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
  CafeCategoriesPage,
  CafeRawMaterialsPage,
  CafeReportsPage,
  CafeManagementWithdrawalsPage,
  CafeItemFeedbackReportPage,
  CafePurchasesPage,
  CafeSuppliersPage,
  // Enterprise RBAC admin
  AdminLayout,
  RolesPage,
  UserExceptionsPage,
  AuditPage,
} from '@/app/lazy-pages';

function Lazy({ children }: { children: ReactNode }) {
  return <Suspense fallback={<PageSkeleton />}>{children}</Suspense>;
}

const TRAINER_ALLOWED_PATHS = new Set(['/trainer', '/profile', '/notifications']);

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { status, user } = useAuth();
  const { pathname } = useLocation();
  if (status === 'unauthenticated') return <Navigate to="/login" replace />;
  const normalizedPath = pathname.replace(/\/+$/, '') || '/';
  if (user?.is_trainer && !TRAINER_ALLOWED_PATHS.has(normalizedPath)) {
    return <Navigate to="/trainer" replace />;
  }
  return <>{children}</>;
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
              <Outlet />
            </ProtectedRoute>
          }
        >
          <Route path="trainer" element={<Lazy><TrainerPortalPage /></Lazy>} />
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
              <PersistentScannerProvider>
                <AppShell />
              </PersistentScannerProvider>
            </ProtectedRoute>
          }
        >
          <Route index element={<HomeRedirect />} />
          <Route path="dashboard" element={<Lazy><DashboardPage /></Lazy>} />
          <Route path="hub/:section" element={<Lazy><DepartmentHubPage /></Lazy>} />
          <Route path="portal/payment-methods" element={<Lazy><PaymentMethodsPage /></Lazy>} />
          <Route path="portal/membership-plans" element={<Navigate to="/club/packages/settings" replace />} />
          <Route path="portal/ticker" element={<Navigate to="/portal/section-settings" replace />} />
          <Route path="portal/:screen" element={<Lazy><PortalManagementPage /></Lazy>} />

          <Route path="org/branches" element={<Lazy><OrgBranchesPage /></Lazy>} />
          <Route path="org/job-titles" element={<Lazy><OrgJobTitlesPage /></Lazy>} />
          <Route path="org/departments" element={<Lazy><OrgDepartmentsPage /></Lazy>} />

          <Route path="employees/weekly-leaves" element={<Lazy><WeeklyLeavesPage /></Lazy>} />
          <Route path="employees" element={<Lazy><EmployeesListPage /></Lazy>} />
          <Route path="employees/active" element={<Navigate to="/employees?status=1" replace />} />
          <Route path="employees/inactive" element={<Navigate to="/employees?status=2" replace />} />
          <Route path="employees/new" element={<Lazy><EmployeeFormPage /></Lazy>} />
          <Route path="employees/:id/finance" element={<Lazy><EmployeeFinancePage /></Lazy>} />
          <Route path="employees/:id/attendance" element={<Lazy><EmployeeAttendancePage /></Lazy>} />
          <Route path="employees/:id/weekly-leave" element={<Lazy><EmployeeWeeklyLeavePage /></Lazy>} />
          <Route path="employees/:id/edit" element={<Lazy><EmployeeFormPage /></Lazy>} />
          <Route path="employees/:id" element={<Lazy><EmployeeProfilePage /></Lazy>} />
          <Route path="hr/partners" element={<Lazy><HrPartnersPage /></Lazy>} />

          <Route path="settings/forms" element={<Lazy><FormsSettingsPage /></Lazy>} />
          <Route path="settings/pay-components" element={<Lazy><PayComponentsPage /></Lazy>} />
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
          <Route path="attendance/reports" element={<Lazy><AttendanceReportsPage /></Lazy>} />
          <Route path="attendance/adjustments" element={<Lazy><AttendanceAdjustmentsPage /></Lazy>} />
          <Route path="attendance/import" element={<Lazy><AttendanceImportPage /></Lazy>} />
          <Route path="reports/attendance-daily" element={<Lazy><AttendanceReportsPage /></Lazy>} />
          <Route path="reports/attendance-absence" element={<Lazy><AttendanceReportsPage /></Lazy>} />
          <Route path="reports/attendance-late" element={<Lazy><AttendanceReportsPage /></Lazy>} />
          <Route path="reports/attendance-hours" element={<Lazy><AttendanceReportsPage /></Lazy>} />
          <Route path="reports/attendance-overtime" element={<Lazy><AttendanceReportsPage /></Lazy>} />
          <Route path="reports/attendance-shift" element={<Lazy><AttendanceReportsPage /></Lazy>} />
          <Route path="attendance" element={<Lazy><AttendanceBoardPage /></Lazy>} />

          <Route path="payroll/salary-scale" element={<Lazy><SalaryScalePage /></Lazy>} />
          <Route path="payroll/setup" element={<Lazy><PayrollSetupPage /></Lazy>} />
          <Route path="payroll/runs" element={<Lazy><PayrollRunsPage /></Lazy>} />
          <Route path="payroll/increases" element={<Lazy><SalaryIncreasesPage /></Lazy>} />
          <Route path="payroll/increases/report" element={<Lazy><SalaryIncreasesReportPage /></Lazy>} />
          <Route path="payroll/runs/:id/slip/:empId" element={<Lazy><PayrollSlipPage /></Lazy>} />
          <Route path="payroll/runs/:id" element={<Lazy><PayrollRunDetailPage /></Lazy>} />

          <Route path="leaves" element={<Lazy><LeavesPage /></Lazy>} />
          <Route path="leaves/new" element={<Lazy><LeaveFormPage /></Lazy>} />
          <Route path="leaves/types" element={<Lazy><LeaveTypesPage /></Lazy>} />
          <Route path="leaves/balances" element={<Lazy><LeaveBalancesPage /></Lazy>} />

          <Route path="missions" element={<Lazy><MissionsPage /></Lazy>} />
          <Route path="permissions" element={<Lazy><PermissionsPage /></Lazy>} />
          <Route path="me/evaluations" element={<Lazy><MyEvaluationsPage /></Lazy>} />
          <Route path="me/permissions" element={<Lazy><MyPermissionsPage /></Lazy>} />

          <Route path="sites/visits" element={<Lazy><SiteVisitsPage /></Lazy>} />

          <Route path="hr/action-screen" element={<Lazy><HrActionScreenPage /></Lazy>} />
          <Route path="hr/administrative-decisions" element={<Lazy><AdministrativeDecisionsPage /></Lazy>} />
          <Route path="hr/administrative-decisions/:id/print" element={<Lazy><AdministrativeDecisionPrintPage /></Lazy>} />
          <Route path="hr/gym-rates" element={<Lazy><GymRatesPage /></Lazy>} />
          <Route path="hr/circulars" element={<Lazy><CircularsPage /></Lazy>} />
          <Route path="hr/warnings" element={<Lazy><WarningsPage /></Lazy>} />
          <Route path="hr/warnings/templates" element={<Lazy><WarningTemplatesPage /></Lazy>} />
          <Route path="hr/evaluations" element={<Lazy><EvaluationWorkspacePage /></Lazy>} />
          <Route path="hr/custody" element={<Lazy><CustodyPage /></Lazy>} />
          <Route path="hr/job-requests" element={<Lazy><JobRequestsPage /></Lazy>} />
          <Route path="hr/messages" element={<Lazy><MessagesPage /></Lazy>} />
          <Route path="hr/daily-reports" element={<Lazy><DailyReportsPage /></Lazy>} />
          <Route path="hr/initiatives" element={<Lazy><InitiativesPage /></Lazy>} />
          <Route path="hr/activities" element={<Lazy><ActivitiesPage /></Lazy>} />
          <Route path="hr/tasks" element={<Lazy><TasksPage /></Lazy>} />
          <Route path="hr/legal-files" element={<Lazy><LegalFilesPage /></Lazy>} />
          <Route path="hr/mobile-content" element={<Lazy><HrMobileContentPage /></Lazy>} />

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
          <Route path="reports/club/members-daily" element={<Lazy><ClubMembersReportPage /></Lazy>} />
          <Route path="reports/club/subscriptions-daily" element={<Lazy><ClubSubscriptionsReportPage /></Lazy>} />
          <Route path="reports/club/subscriptions-expired" element={<Lazy><ClubSubscriptionsExpiredReportPage /></Lazy>} />
          <Route path="reports/club/subscriptions-active" element={<Lazy><ClubSubscriptionsActiveReportPage /></Lazy>} />
          <Route path="reports/club/subscriptions-expiring" element={<Lazy><ClubSubscriptionsExpiringReportPage /></Lazy>} />
          <Route path="reports/club/subscription-sessions" element={<Lazy><ClubSubscriptionSessionsReportPage /></Lazy>} />
          <Route path="reports/club/sales-staff" element={<Navigate to="/club/subscriptions/user-analytics" replace />} />
          <Route path="reports/club/attendance" element={<Lazy><ClubAttendanceReportPage /></Lazy>} />
          <Route path="reports/club/trainers" element={<Lazy><ClubTrainersReportPage /></Lazy>} />
          <Route path="reports/club/lockers" element={<Lazy><ClubLockersReportPage /></Lazy>} />
          {/* Finance report pages — added Part 6B */}
          <Route path="reports/finance/revenue" element={<Lazy><FinanceRevenueReportPage /></Lazy>} />
          <Route path="reports/finance/expenses" element={<Lazy><FinanceExpensesReportPage /></Lazy>} />
          <Route path="reports/finance/pnl" element={<Lazy><FinancePnlReportPage /></Lazy>} />
          <Route path="reports/finance/cash-flow" element={<Lazy><FinanceCashFlowReportPage /></Lazy>} />
          <Route path="reports/finance/treasury" element={<Lazy><FinanceTreasuryReportPage /></Lazy>} />
          <Route path="reports/finance/payment-methods" element={<Lazy><FinancePaymentMethodsReportPage /></Lazy>} />
          <Route path="reports/finance/outstanding" element={<Lazy><FinanceOutstandingReportPage /></Lazy>} />
          {/* Fallback to legacy HR reports handler */}
          <Route path="reports/:key" element={<Lazy><ReportDetailPage /></Lazy>} />

          <Route path="club" element={<Navigate to="/hub/club" replace />} />
          <Route path="club/reception" element={<Lazy><ClubReceptionPage /></Lazy>} />
          <Route path="club/reception/quick-services" element={<Lazy><ClubReceptionQuickServicesPage /></Lazy>} />
          <Route path="club/customer-service" element={<Lazy><CustomerServicePage /></Lazy>} />
          <Route path="club/targets" element={<Lazy><ClubTargetsPage /></Lazy>} />
          <Route path="club/members/cards" element={<Navigate to="/club/members/barcode-management?tab=membership" replace />} />
          <Route path="club/members/barcode-management/print-range" element={<Lazy><ClubBarcodeManagementPage /></Lazy>} />
          <Route path="club/members/barcode-management/spa-check-in" element={<Lazy><ClubBarcodeManagementPage /></Lazy>} />
          <Route path="club/members/barcode-management/classes-check-in" element={<Lazy><ClubBarcodeManagementPage /></Lazy>} />
          <Route path="club/members/barcode-management/spa-attendance" element={<Lazy><ClubBarcodeManagementPage /></Lazy>} />
          <Route path="club/members/barcode-management/classes-attendance" element={<Lazy><ClubBarcodeManagementPage /></Lazy>} />
          <Route path="club/members/barcode-management" element={<Lazy><ClubBarcodeManagementPage /></Lazy>} />
          <Route path="club/members/attendance" element={<Lazy><ClubMembersAttendancePage /></Lazy>} />
          <Route path="club/members/groups" element={<Navigate to="/club/members" replace />} />
          <Route path="club/members/surveys" element={<Navigate to="/club/members" replace />} />
          <Route path="club/members/settings" element={<Navigate to="/club/packages/settings?tab=membership" replace />} />
          <Route path="club/members" element={<Lazy><ClubMembersManagementPage /></Lazy>} />
          <Route path="club/members/:id" element={<Lazy><ClubMembersManagementPage /></Lazy>} />
          <Route path="club/packages/settings" element={<Lazy><ClubPackageSettingsPage /></Lazy>} />
          <Route path="club/subscriptions/new" element={<Lazy><ClubSubscriptionsNewPage /></Lazy>} />
          <Route path="club/subscriptions/online" element={<Lazy><OnlineSubscriptionsPage /></Lazy>} />
          <Route path="club/subscriptions/special" element={<Lazy><ClubSubscriptionsSpecialPage /></Lazy>} />
          <Route path="club/subscriptions/daily-cashier" element={<Navigate to="/club/subscriptions/reports?tab=daily-close" replace />} />
          <Route path="club/subscriptions/reports" element={<Lazy><ClubSubscriptionReportsPage /></Lazy>} />
          <Route path="club/subscriptions/time-based" element={<Lazy><ClubTimeBasedSubscriptionsPage /></Lazy>} />
          <Route path="club/subscriptions/transfers" element={<Lazy><ClubSubscriptionsTransfersPage /></Lazy>} />
          <Route path="club/subscriptions/member-transfer" element={<Lazy><ClubMemberTransferPage /></Lazy>} />
          <Route path="club/subscriptions/refunds" element={<Lazy><ClubSubscriptionsRefundsPage /></Lazy>} />
          <Route path="club/subscriptions/receipts" element={<Lazy><ClubSubscriptionsReceiptsPage /></Lazy>} />
          <Route path="club/subscriptions/financial-reports" element={<Lazy><ClubFinancialReportsPage /></Lazy>} />
          <Route path="club/subscriptions/expired" element={<Lazy><ClubSubscriptionsExpiredPage /></Lazy>} />
          <Route path="club/subscriptions/outstanding" element={<Lazy><ClubSubscriptionsOutstandingPage /></Lazy>} />
          <Route path="club/subscriptions/member-financial" element={<Lazy><ClubMemberFinancialPage /></Lazy>} />
          <Route path="club/subscriptions/treasury" element={<Lazy><ClubTreasuryPage /></Lazy>} />
          <Route path="club/unified-treasury" element={<Lazy><UnifiedTreasuryPage /></Lazy>} />
          <Route path="club/subscriptions/discounts" element={<Lazy><ClubDiscountsPage /></Lazy>} />
          <Route path="club/subscriptions/customer-sources" element={<Lazy><ClubCustomerSourcesPage /></Lazy>} />
          <Route path="club/subscriptions/user-analytics" element={<Navigate to="/club/subscriptions/reports" replace />} />
          <Route path="club/subscriptions/settings" element={<Navigate to="/club/packages/settings?tab=subscriptions" replace />} />
          <Route path="club/subscriptions/member-form" element={<Lazy><ClubMemberFormPage /></Lazy>} />
          <Route path="club/subscriptions" element={<Lazy><ClubSubscriptionsPage /></Lazy>} />
          <Route path="club/lockers/new" element={<Lazy><ClubLockersNewPage /></Lazy>} />
          <Route path="club/lockers/settings" element={<Lazy><ClubLockersSettingsPage /></Lazy>} />
          <Route path="club/lockers" element={<Lazy><LockerInventoryPage /></Lazy>} />

          <Route path="club/fitness/trainer-payments" element={<Lazy><FitnessTrainerPaymentsPage /></Lazy>} />
          <Route path="club/fitness/trainer-search" element={<Lazy><FitnessTrainerSearchPage /></Lazy>} />
          <Route path="club/fitness/trainer-ratings" element={<Lazy><FitnessTrainerRatingsPage /></Lazy>} />
          <Route path="club/fitness/trainer-settings" element={<Lazy><FitnessTrainerSettingsPage /></Lazy>} />
          <Route path="club/fitness/equipment-maintenance" element={<Lazy><FitnessMaintenancePage /></Lazy>} />
          <Route path="club/fitness/spa-invoices" element={<Lazy><FitnessSpaInvoicesPage /></Lazy>} />
          <Route path="club/fitness/barcode-check-in" element={<Navigate to="/club/members/barcode-management?tab=spa" replace />} />
          <Route path="club/fitness/spa-attendance" element={<Navigate to="/club/members/barcode-management?tab=spa-attendance" replace />} />
          <Route path="club/fitness/classes-attendance" element={<Navigate to="/club/members/barcode-management?tab=class-attendance" replace />} />
          <Route path="club/fitness/spa-bookings" element={<Lazy><FitnessSpaBookingsPage /></Lazy>} />
          <Route path="club/subscriptions/inbody-invoices" element={<Lazy><FitnessInbodyInvoicesPage /></Lazy>} />
          <Route path="club/fitness/inbody-invoices" element={<Navigate to="/club/subscriptions/inbody-invoices" replace />} />
          <Route path="club/fitness/facility-settings" element={<Lazy><FitnessFacilitySettingsPage /></Lazy>} />
          <Route path="club/fitness/class-booking" element={<Navigate to="/club/subscriptions/special?section=scheduling" replace />} />
          <Route path="club/fitness/room-bookings" element={<Lazy><FitnessRoomBookingsPage /></Lazy>} />
          <Route path="club/fitness/personal-sessions" element={<Lazy><FitnessPersonalSessionsPage /></Lazy>} />
          <Route path="club/fitness/programs" element={<Lazy><FitnessProgramsPage /></Lazy>} />
          <Route path="club/fitness/templates" element={<Lazy><FitnessTemplatesPage /></Lazy>} />
          <Route path="club/fitness/strength" element={<Lazy><FitnessStrengthPage /></Lazy>} />
          <Route path="club/fitness/progress" element={<Lazy><FitnessProgressPage /></Lazy>} />
          <Route path="club/fitness/assessments" element={<Lazy><FitnessAssessmentsPage /></Lazy>} />
          <Route path="club/fitness/scheduling" element={<Navigate to="/club/subscriptions/special?section=scheduling" replace />} />
          <Route path="club/fitness/classes" element={<Navigate to="/club/subscriptions/special" replace />} />
          <Route path="club/fitness/trainers" element={<Lazy><FitnessTrainersPage /></Lazy>} />
          <Route path="club/fitness/trainers/:id" element={<Lazy><FitnessTrainerProfilePage /></Lazy>} />
          <Route path="club/fitness/facilities" element={<Lazy><FitnessFacilitiesPage /></Lazy>} />
          <Route path="club/fitness/equipment" element={<Lazy><FitnessEquipmentPage /></Lazy>} />
          <Route path="club/fitness/spa-services" element={<Lazy><FitnessSpaServicesPage /></Lazy>} />

          <Route path="club/events" element={<Lazy><ClubEventsPage /></Lazy>} />
          <Route path="club/events/create" element={<Lazy><ClubEventCreateWizardPage /></Lazy>} />
          <Route path="club/events/registrations" element={<Lazy><ClubEventsRegistrationsPage /></Lazy>} />
          <Route path="club/events/checkin" element={<Lazy><ClubEventCheckinPage /></Lazy>} />
          <Route path="club/events/settings" element={<Lazy><ClubEventSettingsPage /></Lazy>} />
          <Route path="club/events/:id" element={<Lazy><ClubEventWorkspacePage /></Lazy>} />

          <Route path="club/cafe" element={<Navigate to="/sales/new" replace />} />
          <Route path="club/cafe/dashboard" element={<Lazy><CafeDashboardPage /></Lazy>} />
          <Route path="club/cafe/products" element={<Lazy><CafeProductsPage /></Lazy>} />
          <Route path="club/cafe/categories" element={<Lazy><CafeCategoriesPage /></Lazy>} />
          <Route path="club/cafe/raw-materials" element={<Lazy><CafeRawMaterialsPage /></Lazy>} />
          <Route path="club/cafe/reports" element={<Lazy><CafeReportsPage /></Lazy>} />
          <Route path="club/cafe/inventory" element={<Lazy><CafeManagementWithdrawalsPage /></Lazy>} />
          <Route path="club/cafe/waste" element={<Lazy><CafeWastePage /></Lazy>} />
          <Route path="club/cafe/customers" element={<Lazy><CafeCustomersPage /></Lazy>} />
          <Route path="club/cafe/reports/feedback" element={<Lazy><CafeItemFeedbackReportPage /></Lazy>} />
          <Route path="club/cafe/purchases" element={<Lazy><CafePurchasesPage /></Lazy>} />
          <Route path="club/cafe/suppliers" element={<Lazy><CafeSuppliersPage /></Lazy>} />
          <Route path="club/cafe/supplier-payments" element={<Lazy><CafeSupplierPaymentsPage /></Lazy>} />
          <Route path="club/cafe/stock-taking" element={<Lazy><InventoryStockTakingPage /></Lazy>} />
          <Route path="club/cafe/stock-taking/:id" element={<Lazy><InventoryStockTakingWorkspacePage /></Lazy>} />
          <Route path="club/cafe/movements" element={<Lazy><InventoryMovementLogPage /></Lazy>} />
          <Route path="club/cafe/pos" element={<Navigate to="/sales/new" replace />} />

          <Route path="inventory" element={<Navigate to="/club/cafe/raw-materials" replace />} />
          <Route path="inventory/dashboard" element={<Lazy><InventoryDashboardPage /></Lazy>} />
          <Route path="inventory/settings" element={<Navigate to="/club/cafe/raw-materials" replace />} />
          <Route path="inventory/products" element={<Navigate to="/club/cafe/products" replace />} />
          <Route path="inventory/price-list" element={<Lazy><InventoryPriceListPage /></Lazy>} />
          <Route path="inventory/opening-stock" element={<Navigate to="/club/cafe/movements" replace />} />
          <Route path="inventory/gym-issue" element={<Navigate to="/club/cafe/inventory" replace />} />
          <Route path="inventory/transactions" element={<Navigate to="/club/cafe/movements" replace />} />
          <Route path="inventory/movement-log" element={<Lazy><InventoryMovementLogPage /></Lazy>} />
          <Route path="inventory/stock-taking" element={<Lazy><InventoryStockTakingPage /></Lazy>} />
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

          <Route path="sales-portal" element={<Lazy><SalesPortalPage /></Lazy>} />
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
          <Route path="app/invitations/sent" element={<Lazy><SentInvitationsPage /></Lazy>} />
          <Route path="app/invitations/accepted" element={<Lazy><AcceptedInvitationsPage /></Lazy>} />
          <Route path="app/invitations/attended" element={<Lazy><AttendedInvitationsPage /></Lazy>} />
          <Route path="app/invitations/rejected" element={<Lazy><RejectedInvitationsPage /></Lazy>} />
          <Route path="app/offers" element={<Lazy><AppOffersPage /></Lazy>} />
          <Route path="app/trainers" element={<Lazy><AppTrainersPage /></Lazy>} />
          <Route path="app/exercise-categories" element={<Lazy><ExerciseCategoriesPage /></Lazy>} />
          <Route path="app/exercises" element={<Lazy><AppExercisesPage /></Lazy>} />
          <Route path="app/news" element={<Lazy><AppNewsPage /></Lazy>} />
          <Route path="app/community" element={<Lazy><AppCommunityPage /></Lazy>} />
          <Route path="app/ads" element={<Lazy><AppAdsPage /></Lazy>} />

          <Route path="users" element={<Lazy><UsersManagePage /></Lazy>} />
          <Route path="users/manage" element={<Lazy><UsersManagePage /></Lazy>} />
          <Route path="users/:id/permissions" element={<Lazy><UserPermissionsPage /></Lazy>} />

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
