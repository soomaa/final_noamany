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

  it('places subscription transfers after the subscription list in the permissions tree', () => {
    const resources = flattenCatalog();
    const list = resources.find((item) => item.key === 'club.subscriptions.list');
    const transfers = resources.find((item) => item.key === 'club.subscriptions.member_transfer');

    expect(transfers).toMatchObject({
      parentKey: 'club.subscriptions',
      nameAr: 'تحويلات الاشتراكات',
      route: '/club/subscriptions/member-transfer',
      actions: ['view', 'create', 'update', 'delete', 'export'],
      sortOrder: (list?.sortOrder ?? 0) + 1,
    });
    expect(buildRouteMap()['/club/subscriptions/member-transfer']).toBe('club.subscriptions.member_transfer');
  });

  it('uses the Arabic job titles label in the permissions catalog', () => {
    const resource = flattenCatalog().find((item) => item.key === 'org.departments');

    expect(resource?.nameAr).toBe('مسميات وظيفية');
    expect(resource?.route).toBe('/org/job-titles');
  });

  it('matches every current sales, cafe, inventory, and procurement sidebar screen', () => {
    const resources = flattenCatalog();
    const cafeModule = resources.find((resource) => resource.key === 'gym-sales');
    const currentRoutes = resources
      .filter((resource) => resource.parentKey === 'gym-sales.sales'
        || resource.parentKey === 'gym-sales.cafe'
        || resource.parentKey === 'gym-sales.inventory'
        || resource.parentKey === 'gym-sales.procurement')
      .map((resource) => resource.route);

    expect(cafeModule?.nameAr).toBe('إدارة الكافيه والمخزون');
    expect(currentRoutes).toEqual(expect.arrayContaining([
      '/sales/new',
      '/sales/drafts',
      '/sales/invoices',
      '/sales/revenue',
      '/sales/shifts',
      '/sales/treasury',
      '/sales/settlements',
      '/sales/pos-admin',
      '/club/cafe/categories',
      '/club/cafe/products',
      '/inventory/price-list',
      '/club/cafe/reports',
      '/club/cafe/reports/feedback',
      '/inventory/dashboard',
      '/club/cafe/raw-materials',
      '/inventory/gym-issue',
      '/club/cafe/stock-taking',
      '/club/cafe/movements',
      '/procurement/requisitions',
      '/procurement/purchase-orders',
      '/procurement/goods-receipts',
      '/procurement/invoices',
      '/procurement/returns',
      '/procurement/dashboard',
      '/procurement/settings',
    ]));
  });

  it('exposes evaluation management and customer service as independent sidebar departments', () => {
    const resources = flattenCatalog();
    const byKey = new Map(resources.map((resource) => [resource.key, resource]));

    expect(byKey.get('evaluation-management')?.type).toBe('module');
    expect(byKey.get('evaluation-management.categories')?.parentKey).toBe('evaluation-management');
    expect(byKey.get('customer-service')?.type).toBe('module');
    expect(byKey.get('affairs.customer_service')?.parentKey).toBe('customer-service');
    expect(byKey.get('customer-service.questions')?.route).toBe('/customer-service/questions');
    expect(byKey.get('customer-service.feedback')?.route).toBe('/customer-service/add-feedback');
    expect(byKey.get('customer-service.reports')?.route).toBe('/customer-service/reports');
  });

  it('maps all current sales and customer-service sidebar routes', () => {
    const routes = buildRouteMap();

    expect(routes['/sales/new']).toBe('gym-sales.sales.new_receipt');
    expect(routes['/sales/shifts']).toBe('gym-sales.sales.shifts');
    expect(routes['/sales/treasury']).toBe('gym-sales.sales.treasury');
    expect(routes['/sales/settlements']).toBe('gym-sales.sales.settlements');
    expect(routes['/hr/partners']).toBe('hr.partners');
    expect(routes['/inventory/price-list']).toBe('club.cafe.price_list');
    expect(routes['/club/cafe/reports/feedback']).toBe('club.cafe.feedback_reports');
    expect(routes['/club/cafe/stock-taking']).toBe('gym-sales.inventory.stock_taking');
    expect(routes['/club/cafe/movements']).toBe('gym-sales.inventory.movement_log');
    expect(routes['/sales/invoices']).toBe('gym-sales.sales.invoices');
    expect(routes['/sales/revenue']).toBe('gym-sales.sales.revenue');
    expect(routes['/procurement/requisitions']).toBe('gym-sales.procurement.requisitions');
    expect(routes['/customer-service/questions']).toBe('customer-service.questions');
    expect(routes['/customer-service/add-feedback']).toBe('customer-service.feedback');
    expect(routes['/customer-service/reports']).toBe('customer-service.reports');
  });
});
