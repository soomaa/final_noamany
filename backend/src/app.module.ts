import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import configuration from './common/config/configuration';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { BranchScopeGuard } from './common/guards/branch-scope.guard';
import { BranchScopeModule } from './common/branch-scope/branch-scope.module';
import { PrismaModule } from './common/prisma/prisma.module';
import { ExportModule } from './common/export/export.module';
import { AuthModule } from './modules/auth/auth.module';
import { BranchesModule } from './modules/branches/branches.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { EmployeesModule } from './modules/employees/employees.module';
import { PartnersModule } from './modules/partners/partners.module';
import { LookupsModule } from './modules/lookups/lookups.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { OrgModule } from './modules/org/org.module';
import { PayrollModule } from './modules/payroll/payroll.module';
import { RbacModule } from './modules/rbac/rbac.module';
import { RbacAdminModule } from './modules/rbac/admin/rbac-admin.module';
import { SettingsModule } from './modules/settings/settings.module';
import { UsersModule } from './modules/users/users.module';
// Wave 2 — HR operations
import { LoansModule } from './modules/loans/loans.module';
import { MissionsModule } from './modules/missions/missions.module';
import { PenaltiesModule } from './modules/penalties/penalties.module';
import { RewardsModule } from './modules/rewards/rewards.module';
import { RequestsModule } from './modules/requests/requests.module';
import { AttendanceModule } from './modules/attendance/attendance.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { LeavesModule } from './modules/leaves/leaves.module';
import { PermissionsModule } from './modules/permissions/permissions.module';
import { ReportsModule } from './modules/reports/reports.module';
// Wave 3 — remaining PHP features
import { FormsSettingsModule } from './modules/forms-settings/forms-settings.module';
import { LoanSettingsModule } from './modules/loan-settings/loan-settings.module';
import { SalaryScaleModule } from './modules/salary-scale/salary-scale.module';
import { GymRatesModule } from './modules/gym-rates/gym-rates.module';
import { ActionScreenModule } from './modules/action-screen/action-screen.module';
import { WeeklyLeavesModule } from './modules/weekly-leaves/weekly-leaves.module';
import { SiteVisitsModule } from './modules/site-visits/site-visits.module';
import { HrWarningsModule } from './modules/hr-warnings/hr-warnings.module';
import { CircularsModule } from './modules/circulars/circulars.module';
import { TerminationModule } from './modules/termination/termination.module';
import { EvaluationsModule } from './modules/evaluations/evaluations.module';
import { CustodyModule } from './modules/custody/custody.module';
import { JobRequestsModule } from './modules/job-requests/job-requests.module';
import { InsuranceSettingsModule } from './modules/insurance-settings/insurance-settings.module';
import { UploadsModule } from './modules/uploads/uploads.module';
// Wave 4 — parity: brand-new modules (areas not previously migrated)
import { LocationsModule } from './modules/locations/locations.module';
import { AgentsModule } from './modules/agents/agents.module';
import { MessagingModule } from './modules/messaging/messaging.module';
import { DailyReportsModule } from './modules/daily-reports/daily-reports.module';
import { InitiativesModule } from './modules/initiatives/initiatives.module';
import { ActivitiesModule } from './modules/activities/activities.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { LegalFilesModule } from './modules/legal-files/legal-files.module';
import { AppUsersModule } from './modules/app-users/app-users.module';
import { UserAdminModule } from './modules/user-admin/user-admin.module';
import { PushModule } from './modules/push/push.module';
import { MobileModule } from './modules/mobile/mobile.module';
import { MemberModule } from './modules/member/member.module';
import { ClubMembersModule } from './modules/club-members/club-members.module';
import { ClubSubscriptionsModule } from './modules/club-subscriptions/club-subscriptions.module';
import { ClubQuickServicesModule } from './modules/club-quick-services/club-quick-services.module';
import { ClubCustomerSourcesModule } from './modules/club-customer-sources/club-customer-sources.module';
import { ClubLockersModule } from './modules/club-lockers/club-lockers.module';
import { ClubFitnessModule } from './modules/club-fitness/club-fitness.module';
import { ClubDashboardModule } from './modules/club-dashboard/club-dashboard.module';
import { ClubEventsModule } from './modules/club-events/club-events.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { CafeProductsModule } from './modules/cafe/cafe-products.module';
import { CafeDashboardModule } from './modules/cafe-dashboard/cafe-dashboard.module';
import { CafeWasteModule } from './modules/cafe-waste/cafe-waste.module';
import { ProcurementModule } from './modules/procurement/procurement.module';
import { SalesModule } from './modules/sales/sales.module';
import { FinanceModule } from './modules/finance/finance.module';
import { AccountingModule } from './modules/accounting/accounting.module';
import { AppManagementModule } from './modules/app-management/app-management.module';
import { CommunityModule } from './modules/community/community.module';
import { PortalManagementModule } from './modules/portal-management/portal-management.module';
import { PublicPortalModule } from './modules/public-portal/public-portal.module';
import { GymOpsModule } from './modules/gym-ops/gym-ops.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';
import { JobsModule } from './modules/jobs/jobs.module';
import { AdministrativeDecisionsModule } from './modules/administrative-decisions/administrative-decisions.module';
import { HrMobileContentModule } from './modules/hr-mobile-content/hr-mobile-content.module';
import { TargetsModule } from './modules/targets/targets.module';
import { CustomerServiceModule } from './modules/customer-service/customer-service.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    ScheduleModule.forRoot(),
    // Default throttle config; enforced only where ThrottlerGuard is applied (login routes).
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 10 }]),
    ExportModule,
    PrismaModule,
    BranchScopeModule,
    AuthModule,
    RbacModule,
    RbacAdminModule,
    UsersModule,
    DashboardModule,
    BranchesModule,
    OrgModule,
    LookupsModule,
    SettingsModule,
    NotificationsModule,
    EmployeesModule,
    PartnersModule,
    // Wave 2
    PayrollModule,
    LoansModule,
    MissionsModule,
    PenaltiesModule,
    RewardsModule,
    RequestsModule,
    // --- Wave 2 ---
    DocumentsModule,
    ReportsModule,
    AttendanceModule,
    LeavesModule,
    PermissionsModule,
    // --- Wave 3 ---
    FormsSettingsModule,
    LoanSettingsModule,
    SalaryScaleModule,
    GymRatesModule,
    ActionScreenModule,
    WeeklyLeavesModule,
    SiteVisitsModule,
    HrWarningsModule,
    CircularsModule,
    TerminationModule,
    EvaluationsModule,
    CustodyModule,
    JobRequestsModule,
    InsuranceSettingsModule,
    UploadsModule,
    // --- Wave 4 — parity new modules ---
    LocationsModule,
    AgentsModule,
    MessagingModule,
    DailyReportsModule,
    InitiativesModule,
    ActivitiesModule,
    TasksModule,
    LegalFilesModule,
    AppUsersModule,
    UserAdminModule,
    PushModule,
    MobileModule,
    MemberModule,
    ClubMembersModule,
    ClubSubscriptionsModule,
    ClubQuickServicesModule,
    ClubCustomerSourcesModule,
    ClubLockersModule,
    ClubFitnessModule,
    ClubDashboardModule,
    ClubEventsModule,
    // --- Wave 5 — gym-sales retail ---
    InventoryModule,
    CafeProductsModule,
    CafeDashboardModule,
    CafeWasteModule,
    // --- Wave 5 — gym-sales: procurement ---
    ProcurementModule,
    SalesModule,
    FinanceModule,
    AccountingModule,
    AppManagementModule,
    CommunityModule,
    PortalManagementModule,
    PublicPortalModule,
    GymOpsModule,
    WebhooksModule,
    JobsModule,
    AdministrativeDecisionsModule,
    HrMobileContentModule,
    TargetsModule,
    CustomerServiceModule,
  ],
  controllers: [AppController],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    // Global auth: every route requires a valid JWT unless marked @Public().
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // Global RBAC: opt-in per route via @RequiresPage('Legacy/Link').
    { provide: APP_GUARD, useClass: PermissionsGuard },
    // Global branch isolation: reject explicit access to a branch outside the user's scope.
    { provide: APP_GUARD, useClass: BranchScopeGuard },
  ],
})
export class AppModule {}
