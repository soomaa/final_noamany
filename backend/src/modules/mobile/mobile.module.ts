import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MobileController } from './mobile.controller';
import { MobileService } from './mobile.service';
import { LeavesModule } from '../leaves/leaves.module';

@Module({
  imports: [AuthModule, LeavesModule],
  controllers: [MobileController],
  providers: [MobileService],
  exports: [MobileService],
})
export class MobileModule {}
