import { Global, Module } from '@nestjs/common';
import { HrDataScopeService } from './hr-data-scope.service';
import { EmployeeRecordScopeGuard } from './employee-record-scope.guard';

@Global()
@Module({
  providers: [HrDataScopeService, EmployeeRecordScopeGuard],
  exports: [HrDataScopeService, EmployeeRecordScopeGuard],
})
export class HrDataScopeModule {}
