import { buildRouteMap, flattenCatalog } from './rbac.catalog';

describe('RBAC catalog', () => {
  it('contains the trainer management page and its view permission', () => {
    const resource = flattenCatalog().find(
      (item) => item.key === 'club.fitness.trainers',
    );

    expect(resource).toBeDefined();
    expect(resource?.route).toBe('/club/fitness/trainers');
    expect(resource?.actions).toContain('view');
  });

  it('does not contain duplicate resource keys', () => {
    const resources = flattenCatalog();
    expect(new Set(resources.map((resource) => resource.key)).size).toBe(
      resources.length,
    );
  });

  it('uses the Arabic job titles label in the permissions catalog', () => {
    const resource = flattenCatalog().find((item) => item.key === 'org.departments');

    expect(resource?.nameAr).toBe('مسميات وظيفية');
    expect(resource?.route).toBe('/org/job-titles');
  });

  it('matches the current Cafe & Inventory sidebar screens exactly', () => {
    const resources = flattenCatalog();
    const cafeModule = resources.find((resource) => resource.key === 'gym-sales');
    const currentRoutes = resources
      .filter((resource) => resource.parentKey === 'gym-sales.sales'
        || resource.parentKey === 'gym-sales.cafe'
        || resource.parentKey === 'gym-sales.inventory'
        || resource.parentKey === 'gym-sales.procurement')
      .map((resource) => resource.route);

    expect(cafeModule?.nameAr).toBe('إدارة الكافيه والمخزون');
    expect(currentRoutes).toEqual([
      '/sales/new',
      '/sales/drafts',
      '/sales/shifts',
      '/sales/treasury',
      '/sales/settlements',
      '/sales/pos-admin',
      '/club/cafe/categories',
      '/club/cafe/products',
      '/inventory/price-list',
      '/club/cafe/reports',
      '/cafe/customers',
      '/club/cafe/reports/feedback',
      '/inventory/dashboard',
      '/club/cafe/raw-materials',
      '/inventory/gym-issue',
      '/club/cafe/stock-taking',
      '/club/cafe/movements',
      '/club/cafe/suppliers',
      '/club/cafe/purchases',
      '/club/cafe/supplier-payments',
    ]);
  });

  it('maps current Cafe routes and retires legacy Cafe routes', () => {
    const routes = buildRouteMap();

    expect(routes['/sales/new']).toBe('gym-sales.sales.new_receipt');
    expect(routes['/sales/shifts']).toBe('gym-sales.sales.shifts');
    expect(routes['/sales/treasury']).toBe('gym-sales.sales.treasury');
    expect(routes['/sales/settlements']).toBe('gym-sales.sales.settlements');
    expect(routes['/hr/partners']).toBe('hr.partners');
    expect(routes['/inventory/price-list']).toBe('club.cafe.price_list');
    expect(routes['/club/cafe/reports/feedback']).toBe('club.cafe.feedback_reports');
    expect(routes['/cafe/customers']).toBe('club.cafe.customers');
    expect(routes['/club/cafe/stock-taking']).toBe('gym-sales.inventory.stock_taking');
    expect(routes['/club/cafe/movements']).toBe('gym-sales.inventory.movement_log');
    expect(routes['/club/cafe/pos']).toBeUndefined();
    expect(routes['/inventory/settings']).toBeUndefined();
    expect(routes['/sales/invoices']).toBeUndefined();
  });
});
