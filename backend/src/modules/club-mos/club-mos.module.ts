import { Module } from '@nestjs/common';
import { EmployeesModule } from '../employees/employees.module';
import { LeadCommentsService } from './lead-comments.service';
import { MosCallsLogController } from './mos-calls-log.controller';
import { MosCallsLogService } from './mos-calls-log.service';

/**
 * The slice of FIT90's MOS module EMS uses: the calls log (`/mos/calls`) and lead comments.
 * The generic MOS entity engine is deliberately not ported — EMS's leads screen runs on its own
 * `/club-leads` API, which exposes these comments.
 */
@Module({
  imports: [EmployeesModule],
  controllers: [MosCallsLogController],
  providers: [MosCallsLogService, LeadCommentsService],
  exports: [LeadCommentsService],
})
export class ClubMosModule {}
