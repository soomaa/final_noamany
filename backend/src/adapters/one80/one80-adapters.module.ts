import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AccountingModule } from '../../modules/accounting/accounting.module';
import { FILE_CATEGORY_ADAPTER } from '../../ports/files/file-category.adapter';
import { HR_LEDGER_ADAPTER } from '../../ports/accounting/hr-ledger.adapter';
import { GYM_INCENTIVE_ADAPTER } from '../../ports/payroll/gym-incentive.adapter';
import { WORKFORCE_ADAPTER } from '../../ports/workforce/workforce.adapter';
import { One80HrLedgerAdapter } from './accounting/one80-hr-ledger.adapter';
import { One80FileCategoryAdapter } from './files/one80-file-category.adapter';
import { One80GymIncentiveAdapter } from './payroll/one80-gym-incentive.adapter';
import { One80WorkforceAdapter } from './workforce/one80-workforce.adapter';
import { EmployeesModule } from '../../modules/employees/employees.module';
import { One80EmployeeOptionsController } from './workforce/one80-employee-options.controller';
import { PERMISSION_CATALOG_ADAPTER } from '../../ports/rbac/permission-catalog.adapter';
import { One80PermissionCatalogAdapter } from './rbac/one80-permission-catalog.adapter';
import { EXTERNAL_IDENTITY_ADAPTER } from '../../ports/identity/external-identity.adapter';
import { One80ExternalIdentityAdapter } from './identity/one80-external-identity.adapter';
import { MemberModule } from '../../modules/member/member.module';

@Global()
@Module({
  imports: [AccountingModule, EmployeesModule, MemberModule, JwtModule.register({})],
  controllers: [One80EmployeeOptionsController],
  providers: [
    One80HrLedgerAdapter,
    One80FileCategoryAdapter,
    One80GymIncentiveAdapter,
    One80WorkforceAdapter,
    One80PermissionCatalogAdapter,
    One80ExternalIdentityAdapter,
    { provide: HR_LEDGER_ADAPTER, useExisting: One80HrLedgerAdapter },
    { provide: FILE_CATEGORY_ADAPTER, useExisting: One80FileCategoryAdapter },
    { provide: GYM_INCENTIVE_ADAPTER, useExisting: One80GymIncentiveAdapter },
    { provide: WORKFORCE_ADAPTER, useExisting: One80WorkforceAdapter },
    { provide: PERMISSION_CATALOG_ADAPTER, useExisting: One80PermissionCatalogAdapter },
    { provide: EXTERNAL_IDENTITY_ADAPTER, useExisting: One80ExternalIdentityAdapter },
  ],
  exports: [HR_LEDGER_ADAPTER, FILE_CATEGORY_ADAPTER, GYM_INCENTIVE_ADAPTER, WORKFORCE_ADAPTER, PERMISSION_CATALOG_ADAPTER, EXTERNAL_IDENTITY_ADAPTER],
})
export class One80AdaptersModule {}
