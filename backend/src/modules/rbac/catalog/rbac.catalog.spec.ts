import { buildRouteMap, flattenCatalog } from './rbac.catalog';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

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

  it('does not contain duplicate navigable routes', () => {
    const routes = flattenCatalog().flatMap((resource) => resource.route ? [resource.route] : []);
    expect(new Set(routes).size).toBe(routes.length);
  });

  it('lets every parent inherit all actions used by its descendants', () => {
    const resources = flattenCatalog();
    for (const parent of resources.filter((item) => item.type !== 'page')) {
      const descendants = resources.filter((candidate) => {
        let current = candidate;
        while (current.parentKey) {
          if (current.parentKey === parent.key) return true;
          const next = resources.find((item) => item.key === current.parentKey);
          if (!next) return false;
          current = next;
        }
        return false;
      });
      const descendantActions = new Set(descendants.flatMap((item) => item.actions));
      expect(parent.actions).toEqual(expect.arrayContaining([...descendantActions]));
    }
  });

  it('contains every literal permission key referenced by the backend', () => {
    const valid = new Set(
      flattenCatalog().flatMap((resource) =>
        resource.actions.map((action) => `${resource.key}:${action}`),
      ),
    );
    const files = (directory: string): string[] =>
      readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const path = join(directory, entry.name);
        return entry.isDirectory()
          ? files(path)
          : entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')
            ? [path]
            : [];
      });
    const pattern = /['"]([a-z][a-z0-9_.-]*):(view|create|update|delete|approve|reject|export|print|audit|configure|execute|manage|use)['"]/g;
    const invalid = new Set<string>();
    for (const file of files(join(process.cwd(), 'src'))) {
      for (const match of readFileSync(file, 'utf8').matchAll(pattern)) {
        const key = `${match[1]}:${match[2]}`;
        if (!valid.has(key)) invalid.add(key);
      }
    }
    expect([...invalid]).toEqual([]);
  });

  it('enforces controller permissions at page level, never at a broad module or group', () => {
    const resourceTypes = new Map(flattenCatalog().map((resource) => [resource.key, resource.type]));
    const controllers = (directory: string): string[] =>
      readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const path = join(directory, entry.name);
        return entry.isDirectory()
          ? controllers(path)
          : entry.name.endsWith('.controller.ts')
            ? [path]
            : [];
      });
    const pattern = /@RequiresPermission\([\s\S]*?\)/g;
    const keyPattern = /['"]([a-z][a-z0-9_.-]*):(view|create|update|delete|approve|reject|export|print|audit|configure|execute|manage|use)['"]/g;
    const broad = new Set<string>();

    for (const file of controllers(join(process.cwd(), 'src', 'modules'))) {
      const source = readFileSync(file, 'utf8');
      for (const decorator of source.matchAll(pattern)) {
        for (const match of decorator[0].matchAll(keyPattern)) {
          if (resourceTypes.get(match[1]) !== 'page') broad.add(`${match[1]} (${file})`);
        }
      }
    }

    expect([...broad]).toEqual([]);
  });

  it('never protects a destructive DELETE endpoint with update/configure/execute', () => {
    const controllers = (directory: string): string[] =>
      readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const path = join(directory, entry.name);
        return entry.isDirectory()
          ? controllers(path)
          : entry.name.endsWith('.controller.ts')
            ? [path]
            : [];
      });
    const invalid = new Set<string>();
    const deleteBlock = /@Delete\([^\n]*\)[\s\S]{0,700}?@RequiresPermission\(([\s\S]*?)\)/g;
    const action = /['"][a-z][a-z0-9_.-]*:(update|configure|execute)['"]/g;

    for (const file of controllers(join(process.cwd(), 'src', 'modules'))) {
      const source = readFileSync(file, 'utf8');
      for (const block of source.matchAll(deleteBlock)) {
        for (const match of block[1].matchAll(action)) {
          invalid.add(`${match[0]} (${file})`);
        }
      }
    }

    expect([...invalid]).toEqual([]);
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
      '/sales/bookings',
      '/sales/new',
      '/sales/drafts',
      '/sales/shifts',
      '/sales/treasury',
      '/sales/settlements',
      '/sales/hospitality',
      '/sales/pos-admin',
      '/club/cafe/dashboard',
      '/club/cafe/categories',
      '/club/cafe/products',
      '/club/cafe/bundles',
      '/inventory/price-list',
      '/club/cafe/waste',
      '/club/cafe/reports',
      '/club/cafe/customers',
      '/club/cafe/reports/feedback',
      '/inventory/dashboard',
      '/club/cafe/raw-materials',
      '/inventory/gym-issue',
      '/club/cafe/stock-taking',
      '/club/cafe/movements',
      '/club/cafe/stock-health',
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
    expect(routes['/club/cafe/waste']).toBe('club.cafe.waste');
    expect(routes['/club/cafe/reports/feedback']).toBe('club.cafe.feedback_reports');
    expect(routes['/club/cafe/customers']).toBe('club.cafe.customers');
    expect(routes['/club/cafe/stock-taking']).toBe('gym-sales.inventory.stock_taking');
    expect(routes['/club/cafe/movements']).toBe('gym-sales.inventory.movement_log');
    expect(routes['/club/cafe/pos']).toBeUndefined();
    expect(routes['/inventory/settings']).toBeUndefined();
    expect(routes['/sales/invoices']).toBeUndefined();
  });

  it('registers the cashier journal with its exact page owner', () => {
    const routes = buildRouteMap();
    const resources = new Map(flattenCatalog().map((resource) => [resource.key, resource]));

    expect(routes['/club/subscriptions/daily-cashier']).toBe(
      'club.subscriptions.daily_cashier',
    );
    expect(resources.get('club.subscriptions.daily_cashier')?.actions).toContain('view');
  });
});
