import { Module } from '@nestjs/common';
import { BrandsController } from './brands.controller';
import { BrandsService } from './brands.service';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';
import { CompositeProductsController } from './composite-products.controller';
import { CompositeProductsService } from './composite-products.service';
import { ConsumablesController } from './consumables.controller';
import { ConsumablesService } from './consumables.service';
import { InventoryDashboardController } from './inventory-dashboard.controller';
import { InventoryDashboardService } from './inventory-dashboard.service';
import { InventoryLowStockCron } from './inventory-low-stock.cron';
import { InventoryLocationService } from './inventory-location.service';
import { InventoryMovementsController } from './inventory-movements.controller';
import { InventoryMovementsService } from './inventory-movements.service';
import { InventoryStockService } from './inventory-stock.service';
import { InventoryTransactionsController } from './inventory-transactions.controller';
import { InventoryTransactionsService } from './inventory-transactions.service';
import { MainCategoriesController } from './main-categories.controller';
import { MainCategoriesService } from './main-categories.service';
import { ManufacturersController } from './manufacturers.controller';
import { ManufacturersService } from './manufacturers.service';
import { OpeningStocksController } from './opening-stocks.controller';
import { OpeningStocksService } from './opening-stocks.service';
import { ProductBranchesController } from './product-branches.controller';
import { ProductBranchesService } from './product-branches.service';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { ServiceConsumablesController } from './service-consumables.controller';
import { ServiceConsumablesService } from './service-consumables.service';
import { SparePartsController } from './spare-parts.controller';
import { SparePartsService } from './spare-parts.service';
import { StockController } from './stock.controller';
import { StockService } from './stock.service';
import { StockTakingController } from './stock-taking.controller';
import { StockTakingService } from './stock-taking.service';
import { StoragesController } from './storages.controller';
import { StoragesService } from './storages.service';
import { SubCategoriesController } from './sub-categories.controller';
import { SubCategoriesService } from './sub-categories.service';
import { SuppliersController } from './suppliers.controller';
import { SuppliersService } from './suppliers.service';
import { UnitTemplatesController } from './unit-templates.controller';
import { UnitTemplatesService } from './unit-templates.service';
import { WarehousesController } from './warehouses.controller';
import { WarehousesService } from './warehouses.service';
import { AccountingModule } from '../accounting/accounting.module';

@Module({
  imports: [AccountingModule],
  controllers: [
    ProductsController,
    CategoriesController,
    MainCategoriesController,
    SubCategoriesController,
    BrandsController,
    ManufacturersController,
    SuppliersController,
    WarehousesController,
    StoragesController,
    StockController,
    ProductBranchesController,
    InventoryTransactionsController,
    InventoryMovementsController,
    OpeningStocksController,
    StockTakingController,
    SparePartsController,
    ConsumablesController,
    CompositeProductsController,
    UnitTemplatesController,
    ServiceConsumablesController,
    InventoryDashboardController,
  ],
  providers: [
    InventoryStockService,
    InventoryLocationService,
    ProductsService,
    CategoriesService,
    MainCategoriesService,
    SubCategoriesService,
    BrandsService,
    ManufacturersService,
    SuppliersService,
    WarehousesService,
    StoragesService,
    StockService,
    ProductBranchesService,
    InventoryTransactionsService,
    InventoryMovementsService,
    OpeningStocksService,
    StockTakingService,
    SparePartsService,
    ConsumablesService,
    CompositeProductsService,
    UnitTemplatesService,
    ServiceConsumablesService,
    InventoryDashboardService,
    InventoryLowStockCron,
  ],
  exports: [InventoryStockService, InventoryLocationService],
})
export class InventoryModule {}
