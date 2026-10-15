import { Navigate } from 'react-router-dom';
import { GYM_SALES_ROUTES } from '@/lib/gym-sales-routes';

/** `/inventory` → dashboard (matches old app default). */
export function InventoryIndexPage() {
  return <Navigate to={GYM_SALES_ROUTES.inventory.dashboard} replace />;
}
