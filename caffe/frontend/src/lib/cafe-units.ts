import type { RecipeUnit } from '@/types/cafe';

export const CAFE_UNIT_OPTIONS: Array<{ value: RecipeUnit; label: string }> = [
  { value: 'g', label: 'جرام (g)' },
  { value: 'kg', label: 'كيلوجرام (kg)' },
  { value: 'oz', label: 'أونصة وزن (oz)' },
  { value: 'ml', label: 'مل (ml)' },
  { value: 'L', label: 'لتر (L)' },
  { value: 'fl_oz', label: 'أونصة سائلة (fl oz)' },
  { value: 'piece', label: 'قطعة (piece)' },
];

export function cafeUnitLabel(unit: string): string {
  const normalized = normalizeCafeUnit(unit);
  return CAFE_UNIT_OPTIONS.find((option) => option.value === normalized)?.label ?? unit;
}

const WEIGHT_UNITS = ['g', 'kg'];
const VOLUME_UNITS = ['ml', 'L'];

export function compatibleCafeUnits(baseUnit: string): RecipeUnit[] {
  const normalized = normalizeCafeUnit(baseUnit);
  if (WEIGHT_UNITS.includes(normalized)) return WEIGHT_UNITS as RecipeUnit[];
  if (VOLUME_UNITS.includes(normalized)) return VOLUME_UNITS as RecipeUnit[];
  if (normalized === 'oz') return ['oz'];
  if (normalized === 'fl_oz') return ['fl_oz'];
  return [(normalized || 'piece') as RecipeUnit];
}

export function compatibleCafeUnitOptions(baseUnit: string) {
  const allowed = new Set(compatibleCafeUnits(baseUnit));
  return CAFE_UNIT_OPTIONS.filter((option) => allowed.has(option.value));
}

export function defaultCafeRecipeUnit(baseUnit: string): RecipeUnit {
  const normalized = normalizeCafeUnit(baseUnit);
  if (normalized === 'kg') return 'g';
  if (normalized === 'L') return 'ml';
  return compatibleCafeUnits(normalized)[0] ?? 'piece';
}

export function convertCafeUnit(quantity: number, from: string, to: string): number | null {
  const normalizedFrom = normalizeCafeUnit(from).toLowerCase();
  const normalizedTo = normalizeCafeUnit(to).toLowerCase();
  if (normalizedFrom === normalizedTo) return quantity;
  const grams: Record<string, number> = { g: 1, kg: 1000, oz: 28.349523125 };
  const milliliters: Record<string, number> = { ml: 1, l: 1000, fl_oz: 29.5735295625 };
  if (grams[normalizedFrom] && grams[normalizedTo]) return quantity * grams[normalizedFrom] / grams[normalizedTo];
  if (milliliters[normalizedFrom] && milliliters[normalizedTo]) return quantity * milliliters[normalizedFrom] / milliliters[normalizedTo];
  return null;
}

function normalizeCafeUnit(unit: string): string {
  const trimmed = unit.trim();
  return trimmed.toLowerCase() === 'l' ? 'L' : trimmed.toLowerCase();
}
