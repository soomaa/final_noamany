import { convertToBaseUnit, normalizeUnit } from './units';

describe('cafe and inventory unit conversion', () => {
  it('converts weight ounces to grams and kilograms', () => {
    expect(convertToBaseUnit(1, 'oz', 'g')).toBeCloseTo(28.349523125, 8);
    expect(convertToBaseUnit(10, 'oz', 'kg')).toBeCloseTo(0.28349523125, 8);
  });

  it('converts fluid ounces to milliliters and keeps litre codes case-insensitive', () => {
    expect(convertToBaseUnit(1, 'fl_oz', 'ml')).toBeCloseTo(29.5735295625, 8);
    expect(convertToBaseUnit(1, 'L', 'ml')).toBe(1000);
    expect(normalizeUnit('fluid oz')).toBe('fl_oz');
  });

  it('rejects incompatible dimensions', () => {
    expect(convertToBaseUnit(1, 'oz', 'ml')).toBeNull();
  });
});
