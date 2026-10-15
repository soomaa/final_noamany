import { BadRequestException } from '@nestjs/common';
import { ProductsService } from './products.service';

// Regression: archiving an ingredient must not leave café recipes pointing at
// an unavailable material, even when another material has the same name.
function setup(productReferences = 0, variantReferences = 0, packaged = false) {
  const existing = {
    id: 154,
    name_ar: 'Espresso',
    product_code: 'PRD000118',
    unit_of_measure: packaged ? 'g' : 'kg',
    inventory_kind: 'raw_material',
    inventory_section: 'preparation_ingredients',
    status: 'active',
    is_deleted: false,
    is_packaged: packaged,
    cost_price: 500,
    selling_price: 0,
    supplier_id: null,
    apply_to_all_branches: false,
    packages: packaged ? [{ id: 1, package_base_quantity: 1000 }] : [],
  };
  const tx = {
    inv_products: {
      findUnique: jest.fn().mockResolvedValue({ id: existing.id, name_ar: existing.name_ar, product_code: existing.product_code }),
      update: jest.fn().mockImplementation(async ({ data }) => ({ ...existing, ...data })),
    },
    inv_supplier_products: { updateMany: jest.fn() },
    inv_product_packages: { updateMany: jest.fn(), update: jest.fn() },
    cafe_products: { updateMany: jest.fn(), findUnique: jest.fn().mockResolvedValue(null) },
    cafe_product_recipes: {
      count: jest.fn().mockResolvedValue(productReferences),
      findMany: jest.fn().mockResolvedValue(productReferences ? [{
        id: 21,
        quantity: 10,
        unit: 'g',
        product: { id: 31, name: 'لاتيه', product_code: 'CF-31', product_type: 'prepared', is_active: true },
      }] : []),
    },
    cafe_variant_recipes: {
      count: jest.fn().mockResolvedValue(variantReferences),
      findMany: jest.fn().mockResolvedValue(variantReferences ? [{
        id: 22,
        quantity: 20,
        unit: 'g',
        variant: {
          id: 41,
          name: 'كبير',
          product: { id: 32, name: 'كابتشينو', product_code: 'CF-32', product_type: 'prepared', is_active: true },
        },
      }] : []),
    },
  };
  const prisma = {
    ...tx,
    inv_products: { ...tx.inv_products, findFirst: jest.fn().mockResolvedValue(existing) },
    $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
  };
  const service = new ProductsService(prisma as never, {} as never, {} as never, {} as never, {} as never);
  return { service, prisma, tx };
}

describe('ProductsService recipe ingredient archive protection', () => {
  it.each([
    ['a product or manufactured-material recipe', 1, 0],
    ['a variant recipe without a base-product recipe', 0, 1],
  ])('refuses to archive an ingredient referenced by %s', async (_name, products, variants) => {
    const { service, tx } = setup(products as number, variants as number);

    await expect(service.remove(154)).rejects.toBeInstanceOf(BadRequestException);

    expect(tx.inv_products.update).not.toHaveBeenCalled();
    expect(tx.inv_supplier_products.updateMany).not.toHaveBeenCalled();
    expect(tx.cafe_products.updateMany).not.toHaveBeenCalled();
    expect(tx.cafe_product_recipes.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { ingredient_id: 154 } }));
    expect(tx.cafe_variant_recipes.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { ingredient_id: 154 } }));
  });

  it('returns every linked base and variant recipe for the resolution dialog', async () => {
    const { service } = setup(1, 1);

    await expect(service.recipeUsage(154)).resolves.toMatchObject({
      ingredient: { id: 154, name: 'Espresso', code: 'PRD000118' },
      rows: [
        { recipeType: 'product', recipeId: 21, productId: 31, productName: 'لاتيه' },
        { recipeType: 'variant', recipeId: 22, productId: 32, variantId: 41, variantName: 'كبير' },
      ],
    });
  });

  it('refuses to deactivate a recipe ingredient through a normal product edit', async () => {
    const { service, tx } = setup(1);

    await expect(service.update(154, { status: 'inactive' })).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.inv_products.update).not.toHaveBeenCalled();
  });

  it('refuses to deactivate a packaged ingredient through the packaged-material edit path', async () => {
    const { service, tx } = setup(0, 1, true);
    jest.spyOn(service, 'findOne').mockResolvedValue({ id: 154 } as never);

    await expect(service.update(154, {
      status: 'inactive',
      packages: [{ id: 1, packageSize: 1, packageUnit: 'kg', packagePrice: 500 }],
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.inv_products.update).not.toHaveBeenCalled();
    expect(tx.inv_product_packages.updateMany).not.toHaveBeenCalled();
  });

  it('allows archiving after recipe references have been removed or replaced', async () => {
    const { service, tx } = setup();

    await expect(service.remove(154)).resolves.toEqual({ success: true });
    expect(tx.inv_products.update).toHaveBeenCalledWith({
      where: { id: 154 }, data: { is_deleted: true, status: 'inactive' },
    });
    expect(tx.inv_supplier_products.updateMany).toHaveBeenCalled();
    expect(tx.cafe_products.updateMany).toHaveBeenCalled();
  });

  it('allows deactivating an ingredient with no recipe references', async () => {
    const { service } = setup();
    await expect(service.update(154, { status: 'inactive' })).resolves.toMatchObject({ status: 'inactive' });
  });

  it('continues to allow a name correction while the ingredient is used in recipes', async () => {
    const { service } = setup(1, 1);
    await expect(service.update(154, { nameAr: 'Espresso beans' })).resolves.toMatchObject({
      nameAr: 'Espresso beans', status: 'active',
    });
  });
});
