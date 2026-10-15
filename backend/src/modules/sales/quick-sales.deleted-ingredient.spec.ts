import { QuickSalesService } from './quick-sales.service';

function service() {
  return new QuickSalesService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
}

describe('quick-sale recipe ingredient availability', () => {
  it('refuses to create stock consumption from a deleted ingredient', async () => {
    const recipes = [{
      ingredient_id: 83,
      quantity: 180,
      unit: 'ml',
      ingredient: {
        id: 83,
        name_ar: 'لبن قديم',
        unit_of_measure: 'L',
        cost_price: 1,
        inventory_kind: 'raw_material',
        is_deleted: true,
        status: 'inactive',
      },
    }];

    await expect(
      (service() as any).resolvePreparedConsumption(recipes, 1),
    ).rejects.toThrow('خامة محذوفة أو غير نشطة: لبن قديم');
  });
});
