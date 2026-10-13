import { Global, Module } from '@nestjs/common';
import { ClubBranchGroupService } from './club-branch-group.service';
import { ClubBranchGroupsAdminController } from '../../modules/club-members/club-branch-groups-admin.controller';

@Global()
@Module({
  controllers: [ClubBranchGroupsAdminController],
  providers: [ClubBranchGroupService],
  exports: [ClubBranchGroupService],
})
export class ClubBranchGroupModule {}
