import { PosEmployeeOptionsController } from './pos-employee-options.controller';
import { PosStockWatchController } from './pos-stock-watch.controller';
import { PosStockWatchService } from './pos-stock-watch.service';
import { Module } from '@nestjs/common';
import { AccountingModule } from '../accounting/accounting.module';
import { InventoryModule } from '../inventory/inventory.module';
import { AuthModule } from '../auth/auth.module';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { QuickSalesController } from './quick-sales.controller';
import { QuickSalesService } from './quick-sales.service';
import { PosReportsNotificationsCron } from './pos-reports-notifications.cron';
import { ShiftSessionsController } from './shift-sessions.controller';
import { ShiftSessionsService } from './shift-sessions.service';
import { ShiftWindowService } from './shift-window.service';
import { ShiftsController } from './shifts.controller';
import { ShiftsService } from './shifts.service';
import {
  PosDevicesController, PosInvoiceTemplatesController, PosNotificationRulesController,
  PosPaymentMethodsController, PosReportTemplatesController, PosSettingsController,
} from './pos-admin/pos-admin.controller';
import { PosDevicesService } from './pos-admin/pos-devices.service';
import { PosInvoiceTemplatesService, PosPaymentMethodsService } from './pos-admin/pos-payment-methods.service';
import { PosNotificationRulesService, PosReportTemplatesService, PosSettingsService } from './pos-admin/pos-reports-notifications.service';
import { BillingStatementsController } from './billing-statements.controller';
import { BillingStatementsService } from './billing-statements.service';
import { CafeBundlesModule } from '../cafe/cafe-bundles.module';

@Module({
  imports: [InventoryModule, AccountingModule, AuthModule, CafeBundlesModule],
  controllers: [PosEmployeeOptionsController,
    PosStockWatchController,
    QuickSalesController,
    ShiftsController,
    ShiftSessionsController,
    BookingsController,
    PosDevicesController,
    PosPaymentMethodsController,
    PosInvoiceTemplatesController,
    PosReportTemplatesController,
    PosNotificationRulesController,
    PosSettingsController,
    BillingStatementsController,
  ],
  providers: [
    QuickSalesService,
    PosStockWatchService,
    ShiftsService,
    ShiftSessionsService,
    ShiftWindowService,
    BookingsService,
    PosReportsNotificationsCron,
    PosDevicesService,
    PosPaymentMethodsService,
    PosInvoiceTemplatesService,
    PosReportTemplatesService,
    PosNotificationRulesService,
    PosSettingsService,
    BillingStatementsService,
  ],
  exports: [
    QuickSalesService,
    ShiftsService,
    ShiftSessionsService,
    ShiftWindowService,
    BookingsService,
    PosSettingsService,
  ],
})
export class SalesModule {}
