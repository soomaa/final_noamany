import { Module } from '@nestjs/common';
import { PushModule } from '../push/push.module';
import { MemberPushController } from './member-push.controller';
import { MemberPushCron } from './member-push.cron';
import { MemberPushService } from './member-push.service';

@Module({
  imports: [PushModule],
  controllers: [MemberPushController],
  providers: [MemberPushService, MemberPushCron],
  exports: [MemberPushService],
})
export class MemberPushModule {}
