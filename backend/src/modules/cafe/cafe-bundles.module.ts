import { Module } from '@nestjs/common';
import { CafeBundlesController } from './cafe-bundles.controller';
import { CafeBundlesService } from './cafe-bundles.service';

/**
 * Standalone module so both the café POS (CafeProductsModule) and the full receipt
 * POS (SalesModule) can price bundles without a circular import — the service depends
 * only on Prisma and takes a component resolver from each caller.
 */
@Module({
  controllers: [CafeBundlesController],
  providers: [CafeBundlesService],
  exports: [CafeBundlesService],
})
export class CafeBundlesModule {}
