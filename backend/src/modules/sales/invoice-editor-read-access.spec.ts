import 'reflect-metadata';
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { CafeProductsController } from '../cafe/cafe-products.controller';
import { CategoriesController } from '../inventory/categories.controller';
import { EmployeesController } from '../employees/employees.controller';
import { One80EmployeeOptionsController } from '../../adapters/one80/workforce/one80-employee-options.controller';
import { PosPaymentMethodsController, PosSettingsController, PosInvoiceTemplatesController } from './pos-admin/pos-admin.controller';

const grants = new Set(['gym-sales.sales.drafts:view', 'gym-sales.sales.drafts:update']);
const guard = new PermissionsGuard(new Reflector(), {} as never, {
  canAny: async (_uid: number, keys: string[]) => keys.some((key) => grants.has(key)),
} as never);

function access(controller: any, method: string) {
  return guard.canActivate({
    getClass: () => controller,
    getHandler: () => controller.prototype[method],
    switchToHttp: () => ({ getRequest: () => ({ user: { sub: 7 } }) }),
  } as unknown as ExecutionContext);
}

describe('invoice editor read dependencies', () => {
  it.each([
    [CafeProductsController, 'list'],
    [CafeProductsController, 'partners'],
    [CategoriesController, 'list'],
    [One80EmployeeOptionsController, 'posOptions'],
    [PosPaymentMethodsController, 'list'],
    [PosSettingsController, 'getCategory'],
    [PosInvoiceTemplatesController, 'list'],
  ])('allows the invoice editor to load %p.%s', async (controller, method) => {
    await expect(access(controller, method as string)).resolves.toBe(true);
  });

  it.each([
    [CafeProductsController, 'create'],
    [CafeProductsController, 'update'],
    [CafeProductsController, 'sellCart'],
    [CafeProductsController, 'sell'],
    [CategoriesController, 'create'],
    [CategoriesController, 'update'],
    [EmployeesController, 'list'],
    [EmployeesController, 'update'],
    [PosPaymentMethodsController, 'create'],
    [PosPaymentMethodsController, 'update'],
    [PosSettingsController, 'save'],
    [PosInvoiceTemplatesController, 'update'],
  ])('does not grant unrelated access to %p.%s', async (controller, method) => {
    await expect(access(controller, method as string)).rejects.toThrow('ليس لديك صلاحية للوصول');
  });
});
