import { formatDisplayNumber } from '@/lib/number-display';
import { useMemo, useState } from 'react';
import { Minus, Plus, ShoppingCart, Trash2, Coffee, Layers, Sparkles, Percent } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ListPageShell } from '@/components/common/list-page-shell';
import { useLocale } from '@/store/locale';
import { api, apiError } from '@/lib/api';
import { usePaginatedList, useArrayResource } from '@/lib/api-hooks';
import { useBranches } from '@/hooks/use-branches';
import { usePermission } from '@/hooks/use-permission';
import { confirmWithPreview } from '@/lib/confirm';
import { formatMoney } from '@/lib/formatters';
import { DEFAULT_PRODUCT_IMAGE, resolveProductImageUrl } from '@/lib/product-image';
import { cafeProductMatchesCategory } from '@/lib/cafe-category-selection';
import { cafeInvoiceLineMatchesCategory, cafeBundleForInvoiceCategory, cafeBundleInvoiceCategoryIds } from '@/lib/cafe-invoice-classification';
import { toast } from 'sonner';
import type {
  CafeProductListItem,
  CafeCategory,
  CafeCartItem,
  CafeProductVariant,
  CafeBundleListItem,
  CafeBundleDetail,
  CafeBundleCartItem,
} from '@/types/cafe';

interface CafeSellCartResult {
  saleNumber: string;
  totalAmount: number;
  items: { productName: string; quantity: number; lineTotal: number }[];
}

/** Key for one option within a group: "cafeProductId:variantId|base". */
function optionKey(cafeProductId: number, cafeVariantId: number | null) {
  return `${cafeProductId}:${cafeVariantId ?? 'base'}`;
}

export function CafePosPage() {
  const { ui } = useLocale();
  const { can } = usePermission();
  const canSell = can('gym-sales.sales.new_receipt:create');
  const { data: branches } = useBranches();
  const [branchId, setBranchId] = useState<number>(0);
  const [activeCategory, setActiveCategory] = useState('');
  const [gender, setGender] = useState<'male' | 'female' | ''>('');
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CafeCartItem[]>([]);
  const [bundleCart, setBundleCart] = useState<CafeBundleCartItem[]>([]);
  const [checkingOut, setCheckingOut] = useState(false);
  const [variantProduct, setVariantProduct] = useState<CafeProductListItem | null>(null);
  const [pickBundle, setPickBundle] = useState<CafeBundleDetail | null>(null);
  const [pickChoices, setPickChoices] = useState<Record<number, string[]>>({});
  const [loadingBundle, setLoadingBundle] = useState(false);

  const lineKey = (item: CafeCartItem) => `${item.product.id}:${item.variant?.id ?? 'base'}`;

  const effectiveBranchId = branchId || branches?.[0]?.id || 0;

  const { data: productsData, isLoading, isError, error, refetch } = usePaginatedList<CafeProductListItem>(
    'cafe-products',
    { page: 1, pageSize: 200, search: '', filters: {} },
  );
  const { data: categories } = useArrayResource<CafeCategory>('categories');
  const { data: bundlesData } = usePaginatedList<CafeBundleListItem>('cafe-bundles', {
    page: 1,
    pageSize: 100,
    search: '',
    filters: { status: 'active' },
  });

  const products = productsData?.data ?? [];
  const productMap = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const activeBundles = useMemo(
    () => (bundlesData?.data ?? []).filter((b) => b.isActive),
    [bundlesData?.data],
  );

  const filtered = useMemo(() => {
    let list = products;
    if (activeCategory !== 'all') {
      list = list.filter((p) => cafeProductMatchesCategory(p, Number(activeCategory)));
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(q) || p.productCode.toLowerCase().includes(q));
    }
    return list.filter((p) => p.isActive && p.productType !== 'internal');
  }, [products, activeCategory, search]);

  const cartTotal =
    cart.reduce((sum, item) => sum + (item.variant?.sellPrice ?? item.product.sellPrice) * item.quantity, 0) +
    bundleCart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  const cartCount = cart.reduce((n, i) => n + i.quantity, 0) + bundleCart.reduce((n, i) => n + i.quantity, 0);
  const isCartEmpty = cart.length === 0 && bundleCart.length === 0;

  const addResolvedToCart = (product: CafeProductListItem, variant?: CafeProductVariant) => {
    if (!cafeInvoiceLineMatchesCategory(product, activeCategory)) return toast.error(ui('اختر فئة الفاتورة وأضف منتجات تنتمي إليها'));
    setCart((prev) => {
      const targetKey = `${product.id}:${variant?.id ?? 'base'}`;
      const existing = prev.find((item) => lineKey(item) === targetKey);
      if (existing) {
        return prev.map((item) => (lineKey(item) === targetKey ? { ...item, quantity: item.quantity + 1 } : item));
      }
      return [...prev, { product, variant, quantity: 1 }];
    });
  };

  const addToCart = (product: CafeProductListItem) => {
    if (!canSell) return;
    const variants = product.variants.filter((variant) => variant.isActive);
    if (variants.length) return setVariantProduct(product);
    addResolvedToCart(product);
  };

  const updateQty = (targetKey: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) => (lineKey(item) === targetKey ? { ...item, quantity: item.quantity + delta } : item))
        .filter((i) => i.quantity > 0),
    );
  };

  const removeFromCart = (targetKey: string) => {
    setCart((prev) => prev.filter((item) => lineKey(item) !== targetKey));
  };

  // ── Bundles ────────────────────────────────────────────────────────────────
  const openBundlePicker = async (bundle: CafeBundleListItem) => {
    if (!activeCategory) return toast.error(ui('اختر فئة الفاتورة أولًا'));
    if (!canSell) return;
    setLoadingBundle(true);
    try {
      const { data } = await api.get<CafeBundleDetail>(`/cafe-bundles/${bundle.id}`);
      const detail = cafeBundleForInvoiceCategory(data, activeCategory);
      if (!detail) return toast.error(ui('الباندل لا يتوافق مع فئة الفاتورة'));
      // Pre-select single-option groups so a fixed combo needs no clicks.
      const initial: Record<number, string[]> = {};
      for (const group of detail.groups) {
        const active = group.options.filter((o) => o.isActive);
        if (active.length === 1) initial[group.id] = [optionKey(active[0].cafeProductId, active[0].cafeVariantId)];
      }
      setPickChoices(initial);
      setPickBundle(detail);
    } catch (err) {
      toast.error(apiError(err));
    } finally {
      setLoadingBundle(false);
    }
  };

  const toggleChoice = (groupId: number, key: string, maxSelect: number) => {
    setPickChoices((prev) => {
      const current = prev[groupId] ?? [];
      if (current.includes(key)) return { ...prev, [groupId]: current.filter((k) => k !== key) };
      if (maxSelect <= 1) return { ...prev, [groupId]: [key] };
      if (current.length >= maxSelect) return prev;
      return { ...prev, [groupId]: [...current, key] };
    });
  };

  /** Estimate the bundle price client-side (server recomputes authoritatively). */
  const priceBundle = (detail: CafeBundleDetail, choices: Record<number, string[]>) => {
    let sum = 0;
    let deltaSum = 0;
    for (const group of detail.groups) {
      for (const key of choices[group.id] ?? []) {
        const option = group.options.find((o) => optionKey(o.cafeProductId, o.cafeVariantId) === key);
        if (!option) continue;
        const product = productMap.get(option.cafeProductId);
        const variant = product?.variants?.find((v) => v.id === option.cafeVariantId);
        const base = option.sellPrice ?? variant?.sellPrice ?? product?.sellPrice ?? 0;
        sum += base + option.priceDelta;
        deltaSum += option.priceDelta;
      }
    }
    return detail.pricingMode === 'percent'
      ? Math.round(sum * (1 - detail.discountPercentage / 100) * 100) / 100
      : Math.round((detail.fixedPrice + deltaSum) * 100) / 100;
  };

  const confirmBundle = () => {
    if (!pickBundle) return;
    // Validate min/max per group.
    for (const group of pickBundle.groups) {
      const chosen = pickChoices[group.id] ?? [];
      if (chosen.length < group.minSelect) {
        toast.error(`${ui('اختر من')} «${group.name}»`);
        return;
      }
    }
    const selections: CafeBundleCartItem['selections'] = [];
    const labelParts: string[] = [];
    for (const group of pickBundle.groups) {
      for (const key of pickChoices[group.id] ?? []) {
        const option = group.options.find((o) => optionKey(o.cafeProductId, o.cafeVariantId) === key);
        if (!option) continue;
        selections.push({
          groupId: group.id,
          cafeProductId: option.cafeProductId,
          cafeVariantId: option.cafeVariantId ?? undefined,
        });
        labelParts.push(option.variantName ? `${option.productName} · ${option.variantName}` : option.productName ?? '');
      }
    }
    const listItem: CafeBundleListItem = {
      id: pickBundle.id,
      bundleCode: pickBundle.bundleCode,
      name: pickBundle.name,
      imageUrl: pickBundle.imageUrl,
      pricingMode: pickBundle.pricingMode,
      fixedPrice: pickBundle.fixedPrice,
      discountPercentage: pickBundle.discountPercentage,
      isActive: pickBundle.isActive,
      groupCount: pickBundle.groups.length,
      optionCount: pickBundle.groups.reduce((n, g) => n + g.options.length, 0),
    };
    setBundleCart((prev) => [
      ...prev,
      {
        key: `${pickBundle.id}-${Date.now()}`,
        bundle: listItem,
        quantity: 1,
        selections,
        label: labelParts.filter(Boolean).join(' + '),
        unitPrice: priceBundle(pickBundle, pickChoices),
        categoryIds: cafeBundleInvoiceCategoryIds(pickBundle, selections),
      },
    ]);
    setPickBundle(null);
    setPickChoices({});
  };

  const updateBundleQty = (key: string, delta: number) =>
    setBundleCart((prev) =>
      prev.map((item) => (item.key === key ? { ...item, quantity: item.quantity + delta } : item)).filter((i) => i.quantity > 0),
    );
  const removeBundle = (key: string) => setBundleCart((prev) => prev.filter((item) => item.key !== key));

  const bundlePayload = () =>
    bundleCart.map((item) => ({ bundleId: item.bundle.id, quantity: item.quantity, selections: item.selections }));

  const sellMutation = async (items: CafeCartItem[]) => {
    if (!activeCategory) throw new Error(ui('اختر فئة الفاتورة'));
    if (!gender) throw new Error(ui('اختر جنس العميل'));
    if (items.some(item => !cafeInvoiceLineMatchesCategory(item.product, activeCategory)) ||
        bundleCart.some(item => !cafeInvoiceLineMatchesCategory(item, activeCategory))) {
      throw new Error(ui('كل منتجات الفاتورة يجب أن تنتمي إلى الفئة المختارة'));
    }
    if (!effectiveBranchId) {
      toast.error(ui('اختر الفرع'));
      throw new Error('no branch');
    }
    const body = {
      branchId: effectiveBranchId,
      gender,
      cafeCategoryId: Number(activeCategory),
      items: items.map((i) => ({ productId: i.product.id, variantId: i.variant?.id, quantity: i.quantity })),
      bundles: bundlePayload(),
    };
    const ok = await confirmWithPreview(
      {
        title: ui('إتمام البيع'),
        description: ui('مراجعة ما سيُخصم من المخزون ويُسجَّل كإيراد'),
        confirmLabel: ui('تأكيد البيع'),
      },
      async () => {
        const { data } = await api.post('/cafe-products/sell-cart?dryRun=true', body);
        const rows = (data as { rows?: { label: string; after?: string }[] }).rows ?? [];
        return {
          rows,
          warning: (data as { warning?: string }).warning,
        };
      },
      async () => {
        const { data } = await api.post<CafeSellCartResult>('/cafe-products/sell-cart', body);
        toast.success(`${ui('فاتورة')} ${data.saleNumber} · ${formatMoney(data.totalAmount)}`);
      },
    );
    if (ok) {
      setCart([]);
      setBundleCart([]);
      setGender('');
    }
  };

  const handleCheckout = () => {
    if (checkingOut || isCartEmpty || !effectiveBranchId) return;
    setCheckingOut(true);
    void sellMutation(cart)
      .catch((err) => toast.error(apiError(err)))
      .finally(() => setCheckingOut(false));
  };

  return (
    <ListPageShell
      title={ui('نقطة بيع الكافيه')}
      description={ui('بيع منتجات الكافيه مع خصم المخزون تلقائياً')}
      isLoading={isLoading}
      isError={isError}
      error={error}
      onRetry={refetch}
    >
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_17.5rem] xl:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="cafe-invoice-gender" className="text-xs text-muted-foreground">{ui('جنس العميل')}</Label>
              <select id="cafe-invoice-gender" required value={gender} onChange={event => setGender(event.target.value as typeof gender)}
                className="min-h-11 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <option value="" disabled>{ui('اختر جنس العميل')}</option>
                <option value="male">{ui('ذكر')}</option><option value="female">{ui('أنثى')}</option>
              </select>
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs text-muted-foreground">{ui('الفرع')}</Label>
              <select
                className="flex h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={effectiveBranchId || ''}
                onChange={(e) => setBranchId(Number(e.target.value))}
              >
                {(branches ?? []).map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Tabs value={activeCategory} onValueChange={value => {
              if (cart.some(item => !cafeInvoiceLineMatchesCategory(item.product, value)) ||
                  bundleCart.some(item => !cafeInvoiceLineMatchesCategory(item, value))) {
                toast.error(ui('احذف المنتجات غير المتوافقة أو أفرغ السلة قبل تغيير فئة الفاتورة'));
                return;
              }
              setActiveCategory(value); setPickBundle(null); setPickChoices({});
            }}>
              <TabsList>
                {(categories ?? [])
                  .filter((c) => c.isActive)
                  .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
                  .map((c) => (
                    <TabsTrigger key={c.id} value={String(c.id)}>
                      {c.nameAr}
                    </TabsTrigger>
                  ))}
              </TabsList>
            </Tabs>
            <Input
              className="max-w-xs"
              placeholder={ui('بحث بمنتج…')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {activeBundles.length > 0 && !search.trim() ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Sparkles className="size-4 text-primary" />
                <h2 className="text-sm font-semibold">{ui('العروض والباندلات')}</h2>
                <span className="h-px flex-1 bg-border/60" />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {activeBundles.map((bundle) => (
                  <button
                    key={bundle.id}
                    type="button"
                    disabled={!canSell || loadingBundle}
                    onClick={() => openBundlePicker(bundle)}
                    className="group relative flex items-stretch gap-3 overflow-hidden rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/5 to-transparent p-2 text-start shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <span className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-xl bg-muted">
                      {bundle.imageUrl ? (
                        <img
                          src={resolveProductImageUrl(bundle.imageUrl)}
                          alt=""
                          className="size-full object-cover transition-transform duration-300 group-hover:scale-110"
                          loading="lazy"
                          onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = DEFAULT_PRODUCT_IMAGE; }}
                        />
                      ) : (
                        <Layers className="size-8 text-primary" />
                      )}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col justify-between py-1">
                      <span>
                        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
                          <Sparkles className="size-2.5" /> {ui('عرض')}
                        </span>
                        <span className="mt-1 block truncate text-sm font-semibold">{bundle.name}</span>
                        <span className="block truncate text-[11px] text-muted-foreground">
                          {formatDisplayNumber(bundle.groupCount)} {ui('مجموعات')} · {formatDisplayNumber(bundle.optionCount)} {ui('خيار')}
                        </span>
                      </span>
                      <span className="mt-1 flex items-center gap-1">
                        {bundle.pricingMode === 'fixed' ? (
                          <>
                            <span className="nums text-lg font-black text-primary" dir="ltr">{bundle.fixedPrice.toFixed(0)}</span>
                            <span className="text-[11px] text-muted-foreground">{ui('EGP')}</span>
                          </>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                            <Percent className="size-3" /> {bundle.discountPercentage.toFixed(0)}% {ui('خصم')}
                          </span>
                        )}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 pt-1">
                <Coffee className="size-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold text-muted-foreground">{ui('المنتجات')}</h2>
                <span className="h-px flex-1 bg-border/60" />
              </div>
            </div>
          ) : null}

          {filtered.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border/60 bg-card/50 p-12 text-center text-muted-foreground">
              <Coffee className="mx-auto mb-3 size-12 opacity-40" />
              <p className="text-base font-medium">{ui('لا توجد منتجات متاحة')}</p>
              <p className="mt-1 text-sm">{ui('جرّب تغيير التصنيف أو البحث')}</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
              {filtered.map((product) => (
                <button
                  key={product.id}
                  type="button"
                  disabled={!canSell}
                  onClick={() => addToCart(product)}
                  className="group relative flex flex-col overflow-hidden rounded-2xl border border-border/60 bg-card text-start shadow-sm transition-all hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
                >
                  <div className="relative aspect-square overflow-hidden bg-muted">
                    {product.imageUrl ? (
                      <img
                        src={resolveProductImageUrl(product.imageUrl)}
                        alt={product.name}
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-110"
                        loading="lazy"
                        onError={(event) => {
                          event.currentTarget.onerror = null;
                          event.currentTarget.src = DEFAULT_PRODUCT_IMAGE;
                        }}
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-muted-foreground/40">
                        <Coffee className="size-14" />
                      </div>
                    )}
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/40 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                  </div>
                  <div className="flex flex-col gap-1 p-3">
                    <h3 className="truncate text-sm font-medium">{product.name}</h3>
                    <div className="flex items-baseline justify-between">
                      <p className="text-lg font-bold text-primary nums">{product.sellPrice.toFixed(2)}</p>
                      <span className="text-xs text-muted-foreground">{ui('EGP')}</span>
                    </div>
                    {product.recipeCount > 0 && (
                      <Badge variant="secondary" className="w-fit text-[10px]">
                        {formatDisplayNumber(product.recipeCount)} {ui('مكون')}
                      </Badge>
                    )}
                    {product.variantCount > 0 ? <Badge variant="outline" className="w-fit text-[10px]">{formatDisplayNumber(product.variantCount)} {ui('اختيار')}</Badge> : null}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          <Card className="overflow-hidden rounded-2xl border-border/60 shadow-sm">
            <CardContent className="p-5">
              <div className="mb-4 flex items-center justify-between border-b border-border/60 pb-3">
                <h2 className="flex items-center gap-2 text-base font-semibold">
                  <ShoppingCart className="size-5 text-primary" />
                  {ui('السلة')}
                </h2>
                <Badge variant="secondary">{formatDisplayNumber(cartCount)}</Badge>
              </div>

              {isCartEmpty ? (
                <p className="py-6 text-center text-sm text-muted-foreground">{ui('السلة فارغة')}</p>
              ) : (
                <div className="space-y-3">
                  {bundleCart.map((item) => (
                    <div key={item.key} className="rounded-lg border border-primary/30 bg-primary/5 p-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="flex items-center gap-1 truncate text-sm font-semibold">
                            <Layers className="size-3.5 shrink-0 text-primary" />
                            {item.bundle.name}
                          </p>
                          {item.label ? <p className="truncate text-[11px] text-muted-foreground">{item.label}</p> : null}
                          <p className="nums text-xs text-muted-foreground" dir="ltr">
                            {(item.unitPrice * item.quantity).toFixed(2)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button variant="outline" size="icon" className="size-7" onClick={() => updateBundleQty(item.key, -1)}>
                            <Minus className="size-3" />
                          </Button>
                          <span className="w-6 text-center text-sm">{formatDisplayNumber(item.quantity)}</span>
                          <Button variant="outline" size="icon" className="size-7" onClick={() => updateBundleQty(item.key, 1)}>
                            <Plus className="size-3" />
                          </Button>
                          <Button variant="ghost" size="icon" className="size-7 text-destructive" onClick={() => removeBundle(item.key)}>
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                  {cart.map((item) => {
                    const targetKey = lineKey(item);
                    const price = item.variant?.sellPrice ?? item.product.sellPrice;
                    return (
                    <div
                      key={targetKey}
                      className="flex items-center justify-between rounded-lg border border-border p-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{item.product.name}</p>
                        {item.variant ? <p className="truncate text-xs font-medium text-primary">{item.variant.name}</p> : null}
                        <p className="text-xs text-muted-foreground">
                          {(price * item.quantity).toFixed(2)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="icon"
                          className="size-7"
                          onClick={() => updateQty(targetKey, -1)}
                        >
                          <Minus className="size-3" />
                        </Button>
                        <span className="w-6 text-center text-sm">{formatDisplayNumber(item.quantity)}</span>
                        <Button
                          variant="outline"
                          size="icon"
                          className="size-7"
                          onClick={() => updateQty(targetKey, 1)}
                        >
                          <Plus className="size-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7 text-destructive"
                          onClick={() => removeFromCart(targetKey)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </div>
                    );
                  })}
                </div>
              )}

              <div className="mt-4 space-y-3 border-t border-border/60 pt-4">
                <div className="flex items-baseline justify-between">
                  <span className="text-sm text-muted-foreground">{ui('الإجمالي')}</span>
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-bold text-primary nums">{cartTotal.toFixed(2)}</span>
                    <span className="text-sm text-muted-foreground">{ui('EGP')}</span>
                  </div>
                </div>
                <Button
                  variant="brand"
                  className="w-full"
                  size="lg"
                  disabled={!canSell || isCartEmpty || checkingOut || !effectiveBranchId}
                  onClick={handleCheckout}
                >
                  {checkingOut ? ui('جاري البيع…') : ui('إتمام البيع')}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
      <Dialog open={!!variantProduct} onOpenChange={(open) => { if (!open) setVariantProduct(null); }}>
        <DialogContent size="md">
          <DialogHeader><DialogTitle>{ui('اختر الحجم أو النوع')} — {variantProduct?.name}</DialogTitle></DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            {(variantProduct?.variants ?? []).filter((variant) => variant.isActive).map((variant) => (
              <button key={variant.id} type="button" onClick={() => { if (variantProduct) addResolvedToCart(variantProduct, variant); setVariantProduct(null); }} className={`rounded-2xl border p-4 text-start transition hover:border-primary hover:shadow-md ${variant.isDefault ? 'border-primary bg-primary/5' : 'bg-card'}`}>
                <span className="font-semibold">{variant.name}</span>
                <span className="nums mt-2 block text-xl font-black text-primary" dir="ltr">{formatMoney(variant.sellPrice)}</span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!pickBundle} onOpenChange={(open) => { if (!open) { setPickBundle(null); setPickChoices({}); } }}>
        <DialogContent size="lg" className="flex max-h-[calc(100dvh-2rem)] flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Layers className="size-5 text-primary" />
              {pickBundle?.name}
            </DialogTitle>
          </DialogHeader>
          {pickBundle ? (
            <>
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto py-1">
                {pickBundle.description ? (
                  <p className="text-sm text-muted-foreground">{pickBundle.description}</p>
                ) : null}
                {pickBundle.groups.map((group) => {
                  const chosen = pickChoices[group.id] ?? [];
                  const active = group.options.filter((o) => o.isActive);
                  return (
                    <div key={group.id} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold">{group.name}</h3>
                        <span className="text-xs text-muted-foreground">
                          {group.minSelect === group.maxSelect
                            ? `${ui('اختر')} ${formatDisplayNumber(group.minSelect)}`
                            : `${ui('اختر')} ${formatDisplayNumber(group.minSelect)}–${formatDisplayNumber(group.maxSelect)}`}
                        </span>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {active.map((option) => {
                          const key = optionKey(option.cafeProductId, option.cafeVariantId);
                          const selected = chosen.includes(key);
                          const product = productMap.get(option.cafeProductId);
                          const variant = product?.variants?.find((v) => v.id === option.cafeVariantId);
                          const base = variant?.sellPrice ?? product?.sellPrice ?? 0;
                          return (
                            <button
                              key={key}
                              type="button"
                              onClick={() => toggleChoice(group.id, key, group.maxSelect)}
                              className={`flex items-center justify-between gap-2 rounded-xl border p-3 text-start transition ${
                                selected ? 'border-primary bg-primary/5 ring-2 ring-primary/20' : 'border-border/60 hover:border-primary/40'
                              }`}
                            >
                              <span className="min-w-0">
                                <span className="block truncate text-sm font-medium">
                                  {option.productName}
                                  {option.variantName ? ` · ${option.variantName}` : ''}
                                </span>
                                {base ? (
                                  <span className="nums text-xs text-muted-foreground" dir="ltr">{formatMoney(base)}</span>
                                ) : null}
                              </span>
                              {option.priceDelta ? (
                                <span className="nums shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" dir="ltr">
                                  +{option.priceDelta.toFixed(0)}
                                </span>
                              ) : null}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-border/60 pt-3">
                <div>
                  <div className="text-xs text-muted-foreground">{ui('سعر الباندل')}</div>
                  <div className="nums text-xl font-black text-primary" dir="ltr">{formatMoney(priceBundle(pickBundle, pickChoices))}</div>
                </div>
                <Button variant="brand" size="lg" onClick={confirmBundle}>
                  <Plus className="me-1 size-4" />
                  {ui('أضف للسلة')}
                </Button>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </ListPageShell>
  );
}
