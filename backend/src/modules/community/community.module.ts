import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { CommunityAdminController } from './community-admin.controller';
import { CommunityMemberController } from './community-member.controller';
import { CommunityService } from './community.service';

@Module({
  imports: [PrismaModule],
  controllers: [CommunityMemberController, CommunityAdminController],
  providers: [CommunityService],
})
export class CommunityModule {}
