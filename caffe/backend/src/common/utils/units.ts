export type RecipeUnit = 'g' | 'kg' | 'oz' | 'ml' | 'L' | 'fl_oz' | 'piece';

const CONVERSIONS: Record<string, number> = {
  'kg->g': 1000,
  'g->kg': 0.001,
  'oz->g': 28.349523125,
  'g->oz': 1 / 28.349523125,
  'oz->kg': 0.028349523125,
  'kg->oz': 1 / 0.028349523125,
  'l->ml': 1000,
  'ml->l': 0.001,
  'fl_oz->ml': 29.5735295625,
  'ml->fl_oz': 1 / 29.5735295625,
  'fl_oz->l': 0.0295735295625,
  'l->fl_oz': 1 / 0.0295735295625,
  'piece->piece': 1,
};

function normalizeUnitCode(unit: string): string {
  const normalized = unit.trim().toLowerCase().replace(/\s+/g, '_');
  if (normalized === 'floz' || normalized === 'fluid_oz' || normalized === 'fluid_ounce') return 'fl_oz';
  if (normalized === 'liter' || normalized === 'litre') return 'l';
  return normalized;
}

/** Convert a recipe quantity into the ingredient's base unit. Returns null if incompatible. */
export function convertToBaseUnit(
  quantity: number,
  fromUnit: RecipeUnit,
  baseUnit: string,
): number | null {
  const normalizedBase = normalizeUnitCode(baseUnit);
  const normalizedFrom = normalizeUnitCode(fromUnit);
  if (normalizedFrom === normalizedBase) return quantity;
  const key = `${normalizedFrom}->${normalizedBase}`;
  const factor = CONVERSIONS[key];
  if (factor == null) return null;
  return quantity * factor;
}

export function normalizeUnit(unit: string): string {
  return normalizeUnitCode(unit);
}
