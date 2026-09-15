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
import { PosEmployeeOptionsController } from './pos-employee-options.controller';
import {
  CAFE_PAYROLL_ALLOCATION_ADAPTER,
  DeferredCafePayrollAllocationAdapter,
} from './cafe-payroll-allocation.adapter';

@Module({
  imports: [InventoryModule, AccountingModule, AuthModule],
  controllers: [
    PosEmployeeOptionsController,
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
    {
      provide: CAFE_PAYROLL_ALLOCATION_ADAPTER,
      useClass: DeferredCafePayrollAllocationAdapter,
    },
    QuickSalesService,
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
