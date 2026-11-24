import { normalizeName } from './cleanup-cafe-warehouses';

describe('cleanup-cafe-warehouses name matching', () => {
  it('treats «البر الشرقى» and «البر الشرقي» as the same bar', () => {
    expect(normalizeName('بار البر الشرقى')).toBe(normalizeName('بار البر الشرقي'));
    expect(normalizeName(' بار  البرالشرقي ')).toBe(normalizeName('بار البر الشرقي'));
  });

  it('keeps different places apart', () => {
    expect(normalizeName('بار الجلاء')).not.toBe(normalizeName('بار البر الشرقي'));
    expect(normalizeName('مخزن البر الشرقي')).not.toBe(normalizeName('بار البر الشرقي'));
    expect(normalizeName(null)).toBe('');
  });
});
