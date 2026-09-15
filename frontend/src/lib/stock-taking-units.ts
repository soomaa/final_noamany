export type StockCountMode = 'unit' | 'package';

export interface PhysicalCountInput {
  baseUnit: string;
  mode: StockCountMode;
  quantity: number;
  unit?: string;
  packageBaseQuantity?: number;
  remainderQuantity?: number;
  remainderUnit?: string;
}

const WEIGHT_FACTORS: Record<string, number> = { g: 1, kg: 1000, oz: 28.349523125 };
const VOLUME_FACTORS: Record<string, number> = { ml: 1, L: 1000, fl_oz: 29.5735295625 };
const UNIT_LABELS: Record<string, string> = {
  g: 'جرام',
  kg: 'كيلوجرام',
  oz: 'أونصة وزن',
  ml: 'مل',
  L: 'لتر',
  fl_oz: 'أونصة سائلة',
  piece: 'قطعة',
};

export function normalizeStockUnit(unit: string): string {
  const normalized = unit.trim().toLowerCase();
  if (normalized === 'l') return 'L';
  if (normalized === 'pieces' || normalized === 'pcs' || normalized === 'pc') return 'piece';
  return normalized || 'piece';
}

export function stockUnitLabel(unit: string): string {
  const normalized = normalizeStockUnit(unit);
  return UNIT_LABELS[normalized] ?? unit;
}

export function compatibleStockUnits(baseUnit: string): string[] {
  const normalized = normalizeStockUnit(baseUnit);
  if (normalized in WEIGHT_FACTORS) return ['g', 'kg', 'oz'];
  if (normalized in VOLUME_FACTORS) return ['ml', 'L', 'fl_oz'];
  return [normalized];
}

export function convertStockQuantity(quantity: number, fromUnit: string, toUnit: string): number | null {
  if (!Number.isFinite(quantity) || quantity < 0) return null;
  const from = normalizeStockUnit(fromUnit);
  const to = normalizeStockUnit(toUnit);
  if (from === to) return quantity;

  const factors = from in WEIGHT_FACTORS && to in WEIGHT_FACTORS
    ? WEIGHT_FACTORS
    : from in VOLUME_FACTORS && to in VOLUME_FACTORS
      ? VOLUME_FACTORS
      : null;
  if (!factors) return null;
  return quantity * factors[from] / factors[to];
}

export function calculatePhysicalBaseQuantity(input: PhysicalCountInput): number | null {
  if (!Number.isFinite(input.quantity) || input.quantity < 0) return null;
  const baseUnit = normalizeStockUnit(input.baseUnit);

  if (input.mode === 'unit') {
    return convertStockQuantity(input.quantity, input.unit ?? baseUnit, baseUnit);
  }

  if (!Number.isFinite(input.packageBaseQuantity) || (input.packageBaseQuantity ?? 0) <= 0) return null;
  const packageQuantity = input.quantity * Number(input.packageBaseQuantity);
  const remainder = input.remainderQuantity ?? 0;
  if (!Number.isFinite(remainder) || remainder < 0) return null;
  if (remainder === 0) return packageQuantity;
  const convertedRemainder = convertStockQuantity(remainder, input.remainderUnit ?? baseUnit, baseUnit);
  return convertedRemainder == null ? null : packageQuantity + convertedRemainder;
}
