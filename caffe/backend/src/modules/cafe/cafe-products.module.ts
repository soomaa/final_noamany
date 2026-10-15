import { Module } from '@nestjs/common';
import { AccountingModule } from '../accounting/accounting.module';
import { InventoryModule } from '../inventory/inventory.module';
import { SalesModule } from '../sales/sales.module';
import { CafeProductsController } from './cafe-products.controller';
import { CafeProductsService } from './cafe-products.service';

@Module({
  imports: [InventoryModule, AccountingModule, SalesModule],
  controllers: [CafeProductsController],
  providers: [CafeProductsService],
  exports: [CafeProductsService],
})
export class CafeProductsModule {}
