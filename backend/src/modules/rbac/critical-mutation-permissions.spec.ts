import 'reflect-metadata';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRES_PERMISSION_KEY } from '../../common/decorators/requires-permission.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CafeProductsController } from '../cafe/cafe-products.controller';
import { ClubMembersController } from '../club-members/club-members.controller';
import { ClubSubscriptionsController } from '../club-subscriptions/club-subscriptions.controller';
import { CategoriesController } from '../inventory/categories.controller';
import { SuppliersController } from '../inventory/suppliers.controller';
import { SupplierInvoicesController } from '../procurement/supplier-invoices.controller';
import { QuickSalesController } from '../sales/quick-sales.controller';
import { PermissionEngineService } from './engine/permission-engine.service';

function permissionsFor(
  controller: { prototype: object },
  method: string,
): string[] {
  const handler = (controller.prototype as Record<string, object>)[method];
  return Reflect.getMetadata(
    REQUIRES_PERMISSION_KEY,
    handler,
  ) ?? [];
}

describe('critical mutation permission metadata', () => {
  it('separates member update and delete permissions', () => {
    expect(permissionsFor(ClubMembersController, 'update')).toEqual([
      'club.members:update',
    ]);
    expect(permissionsFor(ClubMembersController, 'remove')).toEqual([
      'club.members:delete',
    ]);
  });

  it('separates subscription update and delete permissions', () => {
    expect(permissionsFor(ClubSubscriptionsController, 'update')).toEqual(
      expect.arrayContaining([
        'club.subscriptions:update',
        'club.subscriptions.list:update',
        'club.reception:update',
      ]),
    );
    expect(permissionsFor(ClubSubscriptionsController, 'remove')).toEqual(
      expect.arrayContaining([
        'club.subscriptions:delete',
        'club.subscriptions.list:delete',
        'club.reception:delete',
      ]),
    );
  });

  it.each([
    [CafeProductsController, 'update', 'club.cafe.products:update'],
    [CafeProductsController, 'remove', 'club.cafe.products:delete'],
    [CategoriesController, 'update', 'club.cafe.categories:update'],
    [CategoriesController, 'remove', 'club.cafe.categories:delete'],
    [SuppliersController, 'update', 'gym-sales.procurement.suppliers:update'],
    [SuppliersController, 'remove', 'gym-sales.procurement.suppliers:delete'],
    [
      SupplierInvoicesController,
      'update',
      'gym-sales.procurement.cafe_purchases:update',
    ],
    [
      SupplierInvoicesController,
      'remove',
      'gym-sales.procurement.cafe_purchases:delete',
    ],
    [QuickSalesController, 'update', 'gym-sales.sales.drafts:approve'],
    [
      QuickSalesController,
      'cancelCompleted',
      'gym-sales.sales.drafts:delete',
    ],
  ])(
    'protects %s.%s with %s',
    (controller, method, permission) => {
      expect(permissionsFor(controller, method)).toContain(permission);
    },
  );

  it('uses the current cafe sale permission key', () => {
    expect(permissionsFor(CafeProductsController, 'sellCart')).toEqual([
      'gym-sales.sales.new_receipt:create',
    ]);
    expect(permissionsFor(CafeProductsController, 'sell')).toEqual([
      'gym-sales.sales.new_receipt:create',
    ]);
  });
});

describe('PermissionsGuard mutation enforcement', () => {
  function contextWithUser(userId: number): ExecutionContext {
    return {
      getHandler: () => function mutationHandler() {},
      getClass: () => class MutationController {},
      switchToHttp: () => ({
        getRequest: () => ({ user: { sub: userId } }),
      }),
    } as unknown as ExecutionContext;
  }

  it('rejects the request when the permission engine denies every required key', async () => {
    const reflector = {
      getAllAndOverride: jest
        .fn()
        .mockReturnValueOnce(false)
        .mockReturnValueOnce(['club.members:update']),
    } as unknown as Reflector;
    const engine = {
      canAny: jest.fn().mockResolvedValue(false),
    } as unknown as PermissionEngineService;
    const guard = new PermissionsGuard(
      reflector,
      {} as PrismaService,
      engine,
    );

    await expect(guard.canActivate(contextWithUser(44))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(engine.canAny).toHaveBeenCalledWith(44, ['club.members:update']);
  });

  it('allows the request only when one required key is granted', async () => {
    const reflector = {
      getAllAndOverride: jest
        .fn()
        .mockReturnValueOnce(false)
        .mockReturnValueOnce(['club.members:delete']),
    } as unknown as Reflector;
    const engine = {
      canAny: jest.fn().mockResolvedValue(true),
    } as unknown as PermissionEngineService;
    const guard = new PermissionsGuard(
      reflector,
      {} as PrismaService,
      engine,
    );

    await expect(guard.canActivate(contextWithUser(45))).resolves.toBe(true);
    expect(engine.canAny).toHaveBeenCalledWith(45, ['club.members:delete']);
  });
});
