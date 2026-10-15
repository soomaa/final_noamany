import { registerAuthenticatedHostRoutes } from '@/ports/authenticated-route-registry';

export function installOne80AuthenticatedRoutes(): void {
  registerAuthenticatedHostRoutes({
    prefixes: ['/m/'],
    routes: [
      '/club', '/club/members/cards', '/club/members/settings',
      '/club/subscriptions/user-analytics', '/club/subscriptions/settings',
      '/club/fitness/inbody', '/club/fitness/class-booking',
      '/club/fitness/scheduling', '/club/fitness/classes', '/club/fitness/trainers',
      '/club/fitness/booking-board',
      '/club/cafe', '/club/cafe/pos', '/inventory', '/inventory/settings',
      '/inventory/products', '/inventory/opening-stock', '/inventory/transactions',
      '/inventory/movement-log', '/inventory/stock-taking', '/inventory/policies',
      '/inventory/analytics', '/procurement', '/procurement/settings',
      '/procurement/requisitions', '/procurement/purchase-orders', '/procurement/quick-po',
      '/procurement/goods-receipts', '/procurement/invoices', '/procurement/returns',
      '/procurement/returns-debit', '/procurement/dashboard', '/sales', '/sales/invoices',
      '/sales/revenue', '/reports/club/sales-staff', '/reports/club/members-daily',
      '/reports/club/subscriptions-daily', '/reports/club/subscriptions-expired',
      '/reports/club/subscriptions-active', '/reports/club/subscriptions-expiring',
      '/reports/club/subscription-sessions', '/reports/club/attendance',
      '/reports/club/trainers', '/reports/club/lockers', '/reports/finance/revenue',
      '/reports/finance/expenses', '/reports/finance/pnl', '/reports/finance/cash-flow',
      '/reports/finance/treasury', '/reports/finance/payment-methods',
      '/reports/finance/outstanding',
    ],
  });
}
