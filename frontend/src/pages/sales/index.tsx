import { Navigate } from 'react-router-dom';
import { GYM_SALES_ROUTES } from '@/lib/gym-sales-routes';

export { SalesBookingsPage } from './bookings';
export { SalesNewReceiptPage } from './new-receipt';
export { SalesInvoicesPage } from './invoices';
export { SalesDraftsPage } from './drafts';
export { SalesShiftsPage } from './shifts';
export { SalesRevenuePage } from './revenue';
export { SalesTreasuryPage } from './treasury';
export { PosAdminPage } from './pos-admin';
export { SalesSettlementsPage } from './settlements';

export function SalesIndexPage() {
  return <Navigate to={GYM_SALES_ROUTES.sales.newReceipt} replace />;
}
