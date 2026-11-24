import { Module } from '@nestjs/common';
import { LoansModule } from '../loans/loans.module';
import { LeavesModule } from '../leaves/leaves.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { OvertimeRequestsModule } from '../overtime-requests/overtime-requests.module';
import { PushModule } from '../push/push.module';
import { RequestsController } from './requests.controller';
import { RequestsService } from './requests.service';

@Module({
  imports: [LoansModule, LeavesModule, PermissionsModule, OvertimeRequestsModule, PushModule],
  controllers: [RequestsController],
  providers: [RequestsService],
  exports: [RequestsService],
})
export class RequestsModule {}
