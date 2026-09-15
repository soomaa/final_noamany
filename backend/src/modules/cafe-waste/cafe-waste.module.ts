import { Module } from '@nestjs/common';
import { AccountingModule } from '../accounting/accounting.module';
import { InventoryModule } from '../inventory/inventory.module';
import { CafeWasteController } from './cafe-waste.controller';
import { CafeWasteService } from './cafe-waste.service';

@Module({
  imports: [InventoryModule, AccountingModule],
  controllers: [CafeWasteController],
  providers: [CafeWasteService],
  exports: [CafeWasteService],
})
export class CafeWasteModule {}

