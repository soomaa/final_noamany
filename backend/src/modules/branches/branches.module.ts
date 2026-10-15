import { Module } from '@nestjs/common';
import { BranchesController } from './branches.controller';
import { BranchesService } from './branches.service';
import { BranchOptionsController } from './branch-options.controller';

@Module({
  controllers: [BranchesController, BranchOptionsController],
  providers: [BranchesService],
  exports: [BranchesService],
})
export class BranchesModule {}
