import { Module } from '@nestjs/common';
import { AccountingModule } from '../accounting/accounting.module';
import { InventoryModule } from '../inventory/inventory.module';
import { ApprovalsController } from './approvals.controller';
import { ApprovalsService } from './approvals.service';
import { DebitNotesController } from './debit-notes.controller';
import { DebitNotesService } from './debit-notes.service';
import { GoodsReceiptsController } from './goods-receipts.controller';
import { GoodsReceiptsService } from './goods-receipts.service';
import { ProcurementLookupController } from './procurement-lookup.controller';
import { ProcurementLookupService } from './procurement-lookup.service';
import { ProcurementSettingsController } from './procurement-settings.controller';
import { ProcurementSettingsService } from './procurement-settings.service';
import { PurchaseInvoicesController } from './purchase-invoices.controller';
import { PurchaseInvoicesService } from './purchase-invoices.service';
import { PurchaseOrdersController } from './purchase-orders.controller';
import { PurchaseOrdersService } from './purchase-orders.service';
import { PurchaseReturnsController } from './purchase-returns.controller';
import { PurchaseReturnsService } from './purchase-returns.service';
import { QuickPurchaseOrdersController } from './quick-purchase-orders.controller';
import { QuickPurchaseOrdersService } from './quick-purchase-orders.service';
import { QuotationsController } from './quotations.controller';
import { QuotationsService } from './quotations.service';
import { RequisitionsController } from './requisitions.controller';
import { RequisitionsService } from './requisitions.service';
import { RfqsController } from './rfqs.controller';
import { RfqsService } from './rfqs.service';
import { SupplierContractsController } from './supplier-contracts.controller';
import { SupplierContractsService } from './supplier-contracts.service';
import { SupplierDashboardController } from './supplier-dashboard.controller';
import { SupplierDashboardService } from './supplier-dashboard.service';
import { SupplierInvoicesController } from './supplier-invoices.controller';
import { SupplierInvoicesService } from './supplier-invoices.service';
import { SupplierPaymentSchedulesController } from './supplier-payment-schedules.controller';
import { SupplierPaymentSchedulesService } from './supplier-payment-schedules.service';
import { SupplierPaymentsController } from './supplier-payments.controller';
import { SupplierPaymentsService } from './supplier-payments.service';
import { SupplierReportsController } from './supplier-reports.controller';
import { SupplierReportsService } from './supplier-reports.service';
import { SupplierSettingsController } from './supplier-settings.controller';
import { SupplierSettingsService } from './supplier-settings.service';

@Module({
  imports: [InventoryModule, AccountingModule],
  controllers: [
    QuickPurchaseOrdersController,
    PurchaseReturnsController,
    ProcurementSettingsController,
    SupplierSettingsController,
    RequisitionsController,
    RfqsController,
    QuotationsController,
    ApprovalsController,
    PurchaseOrdersController,
    GoodsReceiptsController,
    PurchaseInvoicesController,
    DebitNotesController,
    SupplierContractsController,
    SupplierInvoicesController,
    SupplierPaymentsController,
    SupplierPaymentSchedulesController,
    ProcurementLookupController,
    SupplierDashboardController,
    SupplierReportsController,
  ],
  providers: [
    QuickPurchaseOrdersService,
    PurchaseReturnsService,
    ProcurementSettingsService,
    SupplierSettingsService,
    RequisitionsService,
    RfqsService,
    QuotationsService,
    ApprovalsService,
    PurchaseOrdersService,
    GoodsReceiptsService,
    PurchaseInvoicesService,
    DebitNotesService,
    SupplierContractsService,
    SupplierInvoicesService,
    SupplierPaymentsService,
    SupplierPaymentSchedulesService,
    ProcurementLookupService,
    SupplierDashboardService,
    SupplierReportsService,
  ],
})
export class ProcurementModule {}
