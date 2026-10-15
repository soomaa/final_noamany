import { Module } from '@nestjs/common';
import { ClubBranchProfilesController } from './club-branch-profiles.controller';
import { ClubBranchProfilesService } from './club-branch-profiles.service';

@Module({
  controllers: [ClubBranchProfilesController],
  providers: [ClubBranchProfilesService],
  exports: [ClubBranchProfilesService],
})
export class ClubBranchesModule {}
