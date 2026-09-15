import { Module } from '@nestjs/common';
import { PushModule } from '../push/push.module';
import { JobRequestsController } from './job-requests.controller';
import { JobRequestsService } from './job-requests.service';

@Module({
  imports: [PushModule],
  controllers: [JobRequestsController],
  providers: [JobRequestsService],
  exports: [JobRequestsService],
})
export class JobRequestsModule {}
