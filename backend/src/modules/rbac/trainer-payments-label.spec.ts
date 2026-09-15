import { flattenCatalog } from './catalog/rbac.catalog';

describe('trainer payments client terminology', () => {
  it('uses the familiar Arabic name in the permission and navigation catalog', () => {
    const resource = flattenCatalog().find((item) => item.key === 'club.fitness.trainer_payments');
    expect(resource?.nameAr).toBe('مستحقات المدربين');
    expect(resource?.route).toBe('/club/fitness/trainer-payments');
  });
});
