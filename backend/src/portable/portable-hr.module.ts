import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { BusinessAuditModule } from '../common/audit/business-audit.module';
import { HrMutationAuditInterceptor } from '../common/audit/hr-mutation-audit.interceptor';
import { BranchScopeModule } from '../common/branch-scope/branch-scope.module';
import configuration from '../common/config/configuration';
import { AllExceptionsFilter } from '../common/filters/all-exceptions.filter';
import { BranchScopeGuard } from '../common/guards/branch-scope.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { HealthService } from '../common/health/health.service';
import { HrDataScopeModule } from '../common/hr-scope/hr-data-scope.module';
import { HrDataScopeEnforcementGuard } from '../common/hr-scope/hr-data-scope-enforcement.guard';
import { RequestContextModule } from '../common/http/request-context.module';
import { RequestMetricsService } from '../common/metrics/request-metrics.service';
import { PrismaModule } from '../common/prisma/prisma.module';
import { ActionScreenModule } from '../modules/action-screen/action-screen.module';
import { ActivitiesModule } from '../modules/activities/activities.module';
import { AttendanceModule } from '../modules/attendance/attendance.module';
import { AuthModule } from '../modules/auth/auth.module';
import { BranchesModule } from '../modules/branches/branches.module';
import { CircularsModule } from '../modules/circulars/circulars.module';
import { CustodyModule } from '../modules/custody/custody.module';
import { DailyReportsModule } from '../modules/daily-reports/daily-reports.module';
import { DocumentsModule } from '../modules/documents/documents.module';
import { EmployeesModule } from '../modules/employees/employees.module';
import { EvaluationsModule } from '../modules/evaluations/evaluations.module';
import { FormsSettingsModule } from '../modules/forms-settings/forms-settings.module';
import { HrWarningsModule } from '../modules/hr-warnings/hr-warnings.module';
import { InitiativesModule } from '../modules/initiatives/initiatives.module';
import { InsuranceSettingsModule } from '../modules/insurance-settings/insurance-settings.module';
import { JobRequestsModule } from '../modules/job-requests/job-requests.module';
import { LeavesModule } from '../modules/leaves/leaves.module';
import { LegalFilesModule } from '../modules/legal-files/legal-files.module';
import { LoanSettingsModule } from '../modules/loan-settings/loan-settings.module';
import { LoansModule } from '../modules/loans/loans.module';
import { LookupsModule } from '../modules/lookups/lookups.module';
import { MessagingModule } from '../modules/messaging/messaging.module';
import { MissionsModule } from '../modules/missions/missions.module';
import { MobileModule } from '../modules/mobile/mobile.module';
import { NotificationsModule } from '../modules/notifications/notifications.module';
import { OrgModule } from '../modules/org/org.module';
import { PayrollModule } from '../modules/payroll/payroll.module';
import { PenaltiesModule } from '../modules/penalties/penalties.module';
import { PermissionsModule } from '../modules/permissions/permissions.module';
import { PushModule } from '../modules/push/push.module';
import { ReportsModule } from '../modules/reports/reports.module';
import { RequestsModule } from '../modules/requests/requests.module';
import { RewardsModule } from '../modules/rewards/rewards.module';
import { SalaryScaleModule } from '../modules/salary-scale/salary-scale.module';
import { SettingsModule } from '../modules/settings/settings.module';
import { SiteVisitsModule } from '../modules/site-visits/site-visits.module';
import { TasksModule } from '../modules/tasks/tasks.module';
import { TerminationModule } from '../modules/termination/termination.module';
import { UploadsModule } from '../modules/uploads/uploads.module';
import { UserAdminModule } from '../modules/user-admin/user-admin.module';
import { UsersModule } from '../modules/users/users.module';
import { WeeklyLeavesModule } from '../modules/weekly-leaves/weekly-leaves.module';
import { PortableHealthController } from './portable-health.controller';
import { PortableAppUserController } from './portable-app-user.controller';
import { PortableRbacModule } from './portable-rbac.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 10 }]),
    PrismaModule, RequestContextModule, BusinessAuditModule, BranchScopeModule, PortableRbacModule, HrDataScopeModule,
    AuthModule, BranchesModule, LookupsModule, NotificationsModule, OrgModule, SettingsModule, UsersModule, UserAdminModule,
    EmployeesModule, AttendanceModule, DocumentsModule, LeavesModule, PermissionsModule, RequestsModule, ReportsModule,
    PayrollModule, LoansModule, LoanSettingsModule, MissionsModule, PenaltiesModule, RewardsModule, SalaryScaleModule,
    FormsSettingsModule, InsuranceSettingsModule, WeeklyLeavesModule, SiteVisitsModule, JobRequestsModule, TerminationModule,
    ActionScreenModule, ActivitiesModule, CircularsModule, CustodyModule, DailyReportsModule, EvaluationsModule,
    HrWarningsModule, InitiativesModule, LegalFilesModule, MessagingModule, TasksModule, UploadsModule, PushModule, MobileModule,
  ],
  controllers: [PortableHealthController, PortableAppUserController],
  providers: [
    HealthService,
    RequestMetricsService,
    { provide: APP_INTERCEPTOR, useClass: HrMutationAuditInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_GUARD, useClass: BranchScopeGuard },
    { provide: APP_GUARD, useClass: HrDataScopeEnforcementGuard },
  ],
})
export class PortableHrModule {}
