import { Module } from '@nestjs/common';
import { LegalFilesController } from './legal-files.controller';
import { LegalFilesService } from './legal-files.service';

@Module({
  controllers: [LegalFilesController],
  providers: [LegalFilesService],
  exports: [LegalFilesService],
})
export class LegalFilesModule {}
