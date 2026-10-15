import { BadRequestException } from '@nestjs/common';
import { CafeBundlesService, type BundleComponentResolver } from './cafe-bundles.service';

/**
 * Unit tests for bundle sale-time pricing/expansion. The service takes a component
 * resolver callback, so we can exercise pricing and validation without a database:
 * a fake `db.cafe_bundles.findFirst` returns the bundle definition, and a stub
 * resolver returns deterministic component prices/costs/consumption.
 */

type Overrides = Partial<{
  pricing_mode: string;
  fixed_price: number;
  discount_percentage: number;
  groups: any[];
}>;

function option(cafeProductId: number, extra: Partial<Record<string, unknown>> = {}) {
  return {
    id: cafeProductId * 100,
    cafe_product_id: cafeProductId,
    cafe_variant_id: null,
    price_delta: 0,
    sort_order: 0,
    is_active: true,
    cafe_product: { id: cafeProductId, name: `P${cafeProductId}`, product_code: `C${cafeProductId}`, is_active: true, product_type: 'prepared' },
    cafe_variant: null,
    ...extra,
  };
}

function makeBundle(overrides: Overrides = {}) {
  return {
    id: 1,
    bundle_code: 'BND-0001',
    name: 'Pre-Workout',
    description: null,
    image_url: null,
    pricing_mode: 'fixed',
    fixed_price: 245,
    discount_percentage: 0,
    is_active: true,
    groups: [
      { id: 10, name: 'المشروب', min_select: 1, max_select: 1, sort_order: 0, options: [option(5)] },
      { id: 11, name: 'الأكل', min_select: 1, max_select: 1, sort_order: 1, options: [option(6)] },
    ],
    ...overrides,
  };
}

// Americano (id 5): price 60, cost 10. Wrap (id 6): price 200, cost 40. Sum = 260 / 50.
const resolver: BundleComponentResolver = async (_db, cafeProductId, variantId, quantity) => ({
  cafeProductId,
  productName: cafeProductId === 5 ? 'Americano' : 'Wrap',
  variantId,
  variantName: null,
  unitPrice: cafeProductId === 5 ? 60 : 200,
  unitCost: cafeProductId === 5 ? 10 : 40,
  inventoryProductId: null,
  consumption: [
    { productId: cafeProductId * 10, quantity, unitCost: cafeProductId === 5 ? 10 : 40, ingredientName: `ing${cafeProductId}`, unit: 'each' },
  ],
});

function dbWith(bundle: unknown) {
  return { cafe_bundles: { findFirst: jest.fn().mockResolvedValue(bundle) } } as never;
}

function makeService() {
  return new CafeBundlesService({} as never);
}

describe('CafeBundlesService.resolveBundleSale', () => {
  it('fixed pricing charges the bundle price regardless of component prices', async () => {
    const service = makeService();
    const result = await service.resolveBundleSale(dbWith(makeBundle()), { bundleId: 1, quantity: 1, selections: [] }, 0, resolver);
    expect(result.unitPrice).toBe(245); // not 260
    expect(result.unitCost).toBe(50); // 10 + 40
    expect(result.consumption).toHaveLength(2);
    expect(result.selection.map((s) => s.productName)).toEqual(['Americano', 'Wrap']);
  });

  it('percent pricing discounts the component sum', async () => {
    const service = makeService();
    const bundle = makeBundle({ pricing_mode: 'percent', discount_percentage: 25 });
    const result = await service.resolveBundleSale(dbWith(bundle), { bundleId: 1, quantity: 1, selections: [] }, 0, resolver);
    expect(result.unitPrice).toBe(195); // 260 * 0.75
    expect(result.unitCost).toBe(50);
  });

  it('adds a fixed price_delta surcharge onto the fixed price', async () => {
    const service = makeService();
    const bundle = makeBundle({
      groups: [
        { id: 10, name: 'المشروب', min_select: 1, max_select: 1, sort_order: 0, options: [option(5, { price_delta: 15 })] },
        { id: 11, name: 'الأكل', min_select: 1, max_select: 1, sort_order: 1, options: [option(6)] },
      ],
    });
    const result = await service.resolveBundleSale(dbWith(bundle), { bundleId: 1, quantity: 1, selections: [] }, 0, resolver);
    expect(result.unitPrice).toBe(260); // 245 + 15
  });

  it('scales component consumption by bundle quantity', async () => {
    const service = makeService();
    const result = await service.resolveBundleSale(dbWith(makeBundle()), { bundleId: 1, quantity: 3, selections: [] }, 0, resolver);
    expect(result.quantity).toBe(3);
    expect(result.consumption.every((c) => c.quantity === 3)).toBe(true);
  });

  it('honours an explicit choice in a multi-option group', async () => {
    const service = makeService();
    const bundle = makeBundle({
      groups: [
        { id: 10, name: 'المشروب', min_select: 1, max_select: 1, sort_order: 0, options: [option(5), option(7)] },
      ],
    });
    const result = await service.resolveBundleSale(
      dbWith(bundle),
      { bundleId: 1, quantity: 1, selections: [{ groupId: 10, cafeProductId: 7 }] },
      0,
      resolver,
    );
    expect(result.selection).toHaveLength(1);
    expect(result.selection[0].cafeProductId).toBe(7);
  });

  it('rejects when a multi-option group has no selection', async () => {
    const service = makeService();
    const bundle = makeBundle({
      groups: [
        { id: 10, name: 'المشروب', min_select: 1, max_select: 1, sort_order: 0, options: [option(5), option(7)] },
      ],
    });
    await expect(
      service.resolveBundleSale(dbWith(bundle), { bundleId: 1, quantity: 1, selections: [] }, 0, resolver),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an invalid selection that is not an offered option', async () => {
    const service = makeService();
    await expect(
      service.resolveBundleSale(
        dbWith(makeBundle()),
        { bundleId: 1, quantity: 1, selections: [{ groupId: 10, cafeProductId: 999 }] },
        0,
        resolver,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an inactive or missing bundle', async () => {
    const service = makeService();
    await expect(
      service.resolveBundleSale(dbWith(null), { bundleId: 1, quantity: 1, selections: [] }, 0, resolver),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
