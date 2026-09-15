import { Navigate } from 'react-router-dom';
import { GYM_SALES_ROUTES } from '@/lib/gym-sales-routes';

export { ProcurementQuickPoPage } from './quick-po';
export { ProcurementReturnsPage } from './returns';
export { ProcurementSettingsPage } from './settings';
export { ProcurementRequisitionsPage } from './requisitions';
export { ProcurementPurchaseOrdersPage } from './purchase-orders';
export { ProcurementGoodsReceiptsPage } from './goods-receipts';
export { ProcurementInvoicesPage } from './invoices';
export { ProcurementReturnsDebitPage } from './returns-debit';
export { ProcurementDashboardPage } from './dashboard';

export function ProcurementIndexPage() {
  return <Navigate to={GYM_SALES_ROUTES.procurement.requisitions} replace />;
}
