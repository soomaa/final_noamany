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
import { LookupsModule } from './modules/lookups/lookups.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { OrgModule } from './modules/org/org.module';
import { PartnersModule } from './modules/partners/partners.module';
import { EmployeesModule } from './modules/employees/employees.module';
import { RbacModule } from './modules/rbac/rbac.module';
import { RbacAdminModule } from './modules/rbac/admin/rbac-admin.module';
import { SettingsModule } from './modules/settings/settings.module';
import { UsersModule } from './modules/users/users.module';
import { UserAdminModule } from './modules/user-admin/user-admin.module';
import { UploadsModule } from './modules/uploads/uploads.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { CafeProductsModule } from './modules/cafe/cafe-products.module';
import { ProcurementModule } from './modules/procurement/procurement.module';
import { SalesModule } from './modules/sales/sales.module';
import { AccountingModule } from './modules/accounting/accounting.module';
import { FinanceModule } from './modules/finance/finance.module';
import { PosCompatModule } from './modules/pos-compat/pos-compat.module';

/**
 * Ordera — standalone cafe management API.
 * Gym / club / mobile modules intentionally omitted.
 * HR is limited to employees + partners (POS / settlements).
 * PosCompatModule exposes cafe-safe aliases for POS lookup routes.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 10 }]),
    ExportModule,
    PrismaModule,
    BranchScopeModule,
    AuthModule,
    RbacModule,
    RbacAdminModule,
    UsersModule,
    UserAdminModule,
    BranchesModule,
    OrgModule,
    LookupsModule,
    SettingsModule,
    NotificationsModule,
    EmployeesModule,
    PartnersModule,
    UploadsModule,
    InventoryModule,
    CafeProductsModule,
    ProcurementModule,
    SalesModule,
    AccountingModule,
    FinanceModule,
    PosCompatModule,
  ],
  controllers: [AppController],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_GUARD, useClass: BranchScopeGuard },
  ],
})
export class AppModule {}
