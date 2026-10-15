import { Module } from '@nestjs/common';
import { BranchesModule } from '../branches/branches.module';
import { PosCompatController } from './pos-compat.controller';

@Module({
  imports: [BranchesModule],
  controllers: [PosCompatController],
})
export class PosCompatModule {}
