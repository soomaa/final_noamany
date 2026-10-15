import { CafeProductsService } from './cafe-products.service';

function serviceWith(prisma: Record<string, unknown>) {
  return new CafeProductsService(prisma as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never);
}

describe('ingredient swap', () => {
  it('previews product and variant recipes and marks duplicate-target conflicts', async () => {
    const productRows = [{ id: 11, product_id: 3, quantity: 150, unit: 'ml', product: { id: 3, name: 'لاتيه', category: { name_ar: 'ساخن' } } }];
    const variantRows = [{ id: 12, variant_id: 7, quantity: 200, unit: 'ml', variant: { id: 7, name: 'كبير', product: { id: 4, name: 'كابتشينو', category: null } } }];
    const prisma = {
      inv_products: { findMany: jest.fn().mockResolvedValue([
        { id: 1, name_ar: 'لبن قديم', unit_of_measure: 'ml', cost_price: 0.04, is_deleted: true, status: 'inactive' },
        { id: 2, name_ar: 'لبن جديد', unit_of_measure: 'ml', cost_price: 0.05, is_deleted: false, status: 'active' },
      ]) },
      cafe_product_recipes: { findMany: jest.fn().mockImplementation(({ where }: any) => Promise.resolve(where.ingredient_id === 1 ? productRows : [{ product_id: 3 }])) },
      cafe_variant_recipes: { findMany: jest.fn().mockImplementation(({ where }: any) => Promise.resolve(where.ingredient_id === 1 ? variantRows : [])) },
    };

    const result = await (serviceWith(prisma) as any).previewIngredientSwap(1, 2);

    expect(result.rows).toEqual([
      expect.objectContaining({ recipeType: 'product', recipeId: 11, productName: 'لاتيه', conflict: true }),
      expect.objectContaining({ recipeType: 'variant', recipeId: 12, productName: 'كابتشينو', variantName: 'كبير', conflict: false }),
    ]);
  });

  it('allows replacement across different units and prices the proposed quantity in the target unit', async () => {
    const prisma = {
      inv_products: { findMany: jest.fn().mockResolvedValue([
        { id: 1, name_ar: 'سكر أبيض', unit_of_measure: 'piece', cost_price: 2.15, is_deleted: false, status: 'active' },
        { id: 2, name_ar: 'باكيت سكر', unit_of_measure: 'bag', cost_price: 1, is_deleted: false, status: 'active' },
      ]) },
      cafe_product_recipes: { findMany: jest.fn().mockImplementation(({ where }: any) => Promise.resolve(where.ingredient_id === 1
        ? [{ id: 11, product_id: 3, quantity: 2, unit: 'piece', product: { id: 3, name: 'شاي', category: null } }]
        : [])) },
      cafe_variant_recipes: { findMany: jest.fn().mockResolvedValue([]) },
    };

    const result = await (serviceWith(prisma) as any).previewIngredientSwap(1, 2);

    expect(result.eligibleCount).toBe(1);
    expect(result.rows[0]).toEqual(expect.objectContaining({
      quantity: 2,
      unit: 'piece',
      currentCost: 4.3,
      targetUnit: 'bag',
      targetUnitCost: 1,
      targetCost: 2,
    }));
  });

  it('updates selected recipes atomically and records one audit row', async () => {
    const tx = {
      cafe_product_recipes: {
        findFirst: jest.fn().mockResolvedValue({ id: 11, product_id: 3, ingredient_id: 1 }),
        count: jest.fn().mockResolvedValue(0),
        update: jest.fn().mockResolvedValue({}),
      },
      cafe_variant_recipes: { findFirst: jest.fn(), count: jest.fn(), update: jest.fn() },
      business_audit_log: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      inv_products: { findMany: jest.fn().mockResolvedValue([
        { id: 1, name_ar: 'لبن قديم', unit_of_measure: 'ml', cost_price: 0.04, is_deleted: true, status: 'inactive' },
        { id: 2, name_ar: 'لبن جديد', unit_of_measure: 'ml', cost_price: 0.05, is_deleted: false, status: 'active' },
      ]) },
      $transaction: jest.fn((fn: (client: typeof tx) => unknown) => fn(tx)),
    };

    const result = await (serviceWith(prisma) as any).applyIngredientSwap({
      sourceIngredientId: 1,
      targetIngredientId: 2,
      rows: [{ recipeType: 'product', recipeId: 11, quantity: 140 }],
    }, { sub: 9, name: 'Manager' });

    expect(tx.cafe_product_recipes.update).toHaveBeenCalledWith({ where: { id: 11 }, data: { ingredient_id: 2, quantity: 140, unit: 'ml' } });
    expect(tx.business_audit_log.create).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ updatedCount: 1, productCount: 1 });
  });

  it('stores the target ingredient unit instead of carrying over the source recipe unit', async () => {
    const tx = {
      cafe_product_recipes: {
        findFirst: jest.fn().mockResolvedValue({ id: 11, product_id: 3, ingredient_id: 1 }),
        count: jest.fn().mockResolvedValue(0),
        update: jest.fn().mockResolvedValue({}),
      },
      cafe_variant_recipes: { findFirst: jest.fn(), count: jest.fn(), update: jest.fn() },
      business_audit_log: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      inv_products: { findMany: jest.fn().mockResolvedValue([
        { id: 1, name_ar: 'سكر أبيض', unit_of_measure: 'piece', cost_price: 2.15, is_deleted: false, status: 'active' },
        { id: 2, name_ar: 'باكيت سكر', unit_of_measure: 'bag', cost_price: 1, is_deleted: false, status: 'active' },
      ]) },
      $transaction: jest.fn((fn: (client: typeof tx) => unknown) => fn(tx)),
    };

    await (serviceWith(prisma) as any).applyIngredientSwap({
      sourceIngredientId: 1,
      targetIngredientId: 2,
      rows: [{ recipeType: 'product', recipeId: 11, quantity: 6 }],
    }, { sub: 9, name: 'Manager' });

    expect(tx.cafe_product_recipes.update).toHaveBeenCalledWith({
      where: { id: 11 },
      data: { ingredient_id: 2, quantity: 6, unit: 'bag' },
    });
  });

  it.each([
    ['product', 'cafe_product_recipes', { id: 11, product_id: 3 }, 3],
    ['variant', 'cafe_variant_recipes', { id: 12, variant_id: 7, variant: { product_id: 4 } }, 4],
  ] as const)('removes a linked %s recipe row and audits the change', async (recipeType, delegate, found, productId) => {
    const recipeDelegate = {
      findFirst: jest.fn().mockResolvedValue(found),
      delete: jest.fn().mockResolvedValue({}),
    };
    const tx = {
      inv_products: { findUnique: jest.fn().mockResolvedValue({ id: 1, name_ar: 'لبن قديم' }) },
      cafe_product_recipes: delegate === 'cafe_product_recipes'
        ? recipeDelegate
        : { findFirst: jest.fn(), delete: jest.fn() },
      cafe_variant_recipes: delegate === 'cafe_variant_recipes'
        ? recipeDelegate
        : { findFirst: jest.fn(), delete: jest.fn() },
      business_audit_log: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = { $transaction: jest.fn((fn: (client: typeof tx) => unknown) => fn(tx)) };

    const result = await (serviceWith(prisma) as any).removeIngredientUsage({
      sourceIngredientId: 1,
      recipeType,
      recipeId: found.id,
    }, { sub: 9, name: 'Manager' });

    expect(recipeDelegate.delete).toHaveBeenCalledWith({ where: { id: found.id } });
    expect(tx.business_audit_log.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      action: 'ingredient.remove',
      actor_user_id: 9,
    }) });
    expect(result).toEqual({ removed: true, productId });
  });
});
