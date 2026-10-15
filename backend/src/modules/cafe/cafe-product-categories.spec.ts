import {
  buildCafeCategoryFilter,
  cafeProductHasAnyCategory,
  mapCafeCategories,
  normalizeCafeCategoryIds,
} from './cafe-product-categories';

describe('cafe product categories', () => {
  it('deduplicates category ids while preserving selection order', () => {
    expect(normalizeCafeCategoryIds([7, 3, 7, 5])).toEqual([7, 3, 5]);
  });

  it('falls back to the legacy category when categoryIds are omitted', () => {
    expect(normalizeCafeCategoryIds(undefined, 4)).toEqual([4]);
    expect(normalizeCafeCategoryIds([], 4)).toEqual([]);
  });

  it('maps ordered category assignments to the public API shape', () => {
    expect(mapCafeCategories([
      { sort_order: 0, category: { id: 7, name_ar: 'قهوة' } },
      { sort_order: 1, category: { id: 3, name_ar: 'إضافات' } },
    ])).toEqual([
      { id: 7, name: 'قهوة' },
      { id: 3, name: 'إضافات' },
    ]);
  });

  it('matches either a normalized assignment or legacy category during rollout', () => {
    expect(buildCafeCategoryFilter(9)).toEqual({
      OR: [
        { category_assignments: { some: { category_id: 9 } } },
        { category_id: 9 },
      ],
    });
  });

  it('matches employee-benefit categories against every product assignment', () => {
    expect(cafeProductHasAnyCategory({
      category_id: 99,
      category_assignments: [{ category_id: 3 }, { category_id: 5 }],
    }, [3])).toBe(true);
    expect(cafeProductHasAnyCategory({ category_id: 3 }, [3])).toBe(true);
    expect(cafeProductHasAnyCategory({ category_id: 99, category_assignments: [] }, [3])).toBe(false);
  });
});
