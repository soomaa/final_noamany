export type PortalPreviewEntityId = number | 'new' | 'settings';
export type PortalPreviewSurface = 'home' | 'shop' | 'product';

export type PortalPreviewTarget = {
  surface: PortalPreviewSurface;
  path: string;
};

export type PortalPreviewNormalizationOptions = {
  categoryName?: string;
  categories?: Array<{ id: number | string; name: string }>;
  badgeName?: string;
  badges?: Array<{
    id: number | string;
    name: string;
    nameEn?: string | null;
    type?: string | null;
    backgroundColor?: string | null;
    textColor?: string | null;
  }>;
};

export type PortalPreviewProduct = {
  id: number;
  categoryId: number;
  category: string;
  name: string;
  nameEn: string;
  stock: number;
  stockStatus: 'in_stock' | 'out_of_stock';
  image: string | null;
  images: string[];
  description: string;
  shortDescription: string;
  specifications: unknown;
  price: number;
  oldPrice: number | null;
  displayOrder: number;
  featured: boolean;
  isNew: boolean;
  badge: { id: number; name: string; nameEn: string; type: string; backgroundColor: unknown; textColor: unknown } | null;
};

const HOME_TYPES = new Set([
  'company',
  'about',
  'sliders',
  'photos',
  'videos',
  'hero-videos',
  'branches',
  'trainers',
  'classes',
  'offers',
  'stats',
  'services',
  'class-showcase',
  'about-features',
  'coach-features',
  'section-settings',
]);

const SHOP_TYPES = new Set(['categories', 'badges']);

export function getPortalPreviewTarget(
  configType: string,
  entityId: PortalPreviewEntityId,
  preferredProductSurface?: 'shop' | 'product',
): PortalPreviewTarget | null {
  if (HOME_TYPES.has(configType)) return { surface: 'home', path: '/' };
  if (SHOP_TYPES.has(configType)) return { surface: 'shop', path: '/shop.html' };
  if (configType !== 'products') return null;
  if (preferredProductSurface === 'shop') return { surface: 'shop', path: '/shop.html' };
  if (typeof entityId === 'number' && Number.isSafeInteger(entityId) && entityId > 0) {
    return { surface: 'product', path: `/product.html?id=${entityId}` };
  }
  return { surface: 'shop', path: '/shop.html' };
}

function finiteNumber(value: unknown, fallback = 0) {
  if (value === '' || value == null) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function optionalNumber(value: unknown) {
  if (value === '' || value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function booleanValue(value: unknown) {
  if (typeof value === 'string') return ['1', 'true', 'yes', 'on', 'active'].includes(value.toLowerCase());
  return Boolean(value);
}

function recordId(entityId: PortalPreviewEntityId) {
  return typeof entityId === 'number' && Number.isSafeInteger(entityId) ? entityId : -1;
}

function uniqueStrings(values: unknown[]) {
  return [...new Set(values.filter((value): value is string => typeof value === 'string' && value.length > 0))];
}

function normalizeProduct(
  entityId: PortalPreviewEntityId,
  draft: Record<string, unknown>,
  options: PortalPreviewNormalizationOptions,
): PortalPreviewProduct {
  const categoryId = finiteNumber(draft.categoryId);
  const category = String(
    options.categoryName
      ?? draft.categoryName
      ?? options.categories?.find((item) => Number(item.id) === categoryId)?.name
      ?? '',
  );
  const stock = Math.max(0, finiteNumber(draft.currentStock ?? draft.stock));
  const selectedBadge = draft.selectedBadge;
  const badgeOption = options.badges?.find((item) => String(item.id) === String(selectedBadge));
  const badgeName = options.badgeName ?? draft.badgeName ?? badgeOption?.name;
  const legacyImage = typeof draft.image === 'string' && draft.image ? draft.image : null;
  const gallery = uniqueStrings(Array.isArray(draft.images) ? draft.images : []);
  const image = gallery[0] ?? legacyImage;

  return {
    id: recordId(entityId),
    categoryId,
    category,
    name: String(draft.name ?? draft.title ?? ''),
    nameEn: String(draft.nameEn ?? ''),
    stock,
    stockStatus: stock > 0 ? 'in_stock' : 'out_of_stock',
    image,
    images: uniqueStrings([image, ...gallery]),
    description: String(draft.description ?? ''),
    shortDescription: String(draft.shortDescription ?? ''),
    specifications: draft.specifications ?? null,
    price: finiteNumber(draft.price),
    oldPrice: optionalNumber(draft.oldPrice),
    displayOrder: finiteNumber(draft.displayOrder, 1),
    featured: booleanValue(draft.isFeatured ?? draft.featured),
    isNew: booleanValue(draft.isNew),
    badge: badgeName
      ? {
          id: finiteNumber(badgeOption?.id ?? selectedBadge),
          name: String(badgeName),
          nameEn: String(badgeOption?.nameEn ?? ''),
          type: String(badgeOption?.type ?? 'custom'),
          backgroundColor: badgeOption?.backgroundColor ?? draft.backgroundColor ?? null,
          textColor: badgeOption?.textColor ?? draft.textColor ?? null,
        }
      : null,
  };
}

export function normalizePortalPreviewDraft(
  configType: 'products',
  entityId: PortalPreviewEntityId,
  draft: Record<string, unknown>,
  options?: PortalPreviewNormalizationOptions,
): PortalPreviewProduct;
export function normalizePortalPreviewDraft(
  configType: string,
  entityId: PortalPreviewEntityId,
  draft: Record<string, unknown>,
  options?: PortalPreviewNormalizationOptions,
): Record<string, unknown>;
export function normalizePortalPreviewDraft(
  configType: string,
  entityId: PortalPreviewEntityId,
  draft: Record<string, unknown>,
  options: PortalPreviewNormalizationOptions = {},
): Record<string, unknown> {
  if (configType === 'products') return normalizeProduct(entityId, draft, options);

  const normalized: Record<string, unknown> = {
    ...draft,
    id: recordId(entityId),
    type: configType,
  };
  if ('isFeatured' in draft) normalized.featured = booleanValue(draft.isFeatured);
  if ('numericValue' in draft) normalized.numericValue = optionalNumber(draft.numericValue);
  if ('displayOrder' in draft) normalized.displayOrder = finiteNumber(draft.displayOrder, 1);
  if ('branchId' in draft) normalized.branchId = optionalNumber(draft.branchId);
  if ('value' in draft) normalized.value = finiteNumber(draft.value);
  normalized.isActive = draft.status !== 'inactive' && draft.isActive !== false;
  return normalized;
}
