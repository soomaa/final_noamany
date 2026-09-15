import { useMemo, useState } from 'react';
import { Minus, Plus, ShoppingCart, Trash2, Coffee } from 'lucide-react';
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
import { toast } from 'sonner';
import type { CafeProductListItem, CafeCategory, CafeCartItem, CafeProductVariant } from '@/types/cafe';

interface CafeSellCartResult {
  saleNumber: string;
  totalAmount: number;
  items: { productName: string; quantity: number; lineTotal: number }[];
}

export function CafePosPage() {
  const { ui } = useLocale();
  const { can } = usePermission();
  const canSell = can('gym-sales.sales.new_receipt:create');
  const { data: branches } = useBranches();
  const [branchId, setBranchId] = useState<number>(0);
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CafeCartItem[]>([]);
  const [checkingOut, setCheckingOut] = useState(false);
  const [variantProduct, setVariantProduct] = useState<CafeProductListItem | null>(null);

  const lineKey = (item: CafeCartItem) => `${item.product.id}:${item.variant?.id ?? 'base'}`;

  const effectiveBranchId = branchId || branches?.[0]?.id || 0;

  const { data: productsData, isLoading, isError, error, refetch } = usePaginatedList<CafeProductListItem>(
    'cafe-products',
    { page: 1, pageSize: 200, search: '', filters: {} },
  );
  const { data: categories } = useArrayResource<CafeCategory>('categories');

  const products = productsData?.data ?? [];

  const filtered = useMemo(() => {
    let list = products;
    if (activeCategory !== 'all') {
      list = list.filter((p) => p.categoryId === Number(activeCategory));
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(q) || p.productCode.toLowerCase().includes(q));
    }
    return list.filter((p) => p.isActive && p.productType !== 'internal');
  }, [products, activeCategory, search]);

  const cartTotal = cart.reduce((sum, item) => sum + (item.variant?.sellPrice ?? item.product.sellPrice) * item.quantity, 0);

  const addResolvedToCart = (product: CafeProductListItem, variant?: CafeProductVariant) => {
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

  const sellMutation = async (items: CafeCartItem[]) => {
    if (!effectiveBranchId) {
      toast.error(ui('اختر الفرع'));
      throw new Error('no branch');
    }
    const ok = await confirmWithPreview(
      {
        title: ui('إتمام البيع'),
        description: ui('مراجعة ما سيُخصم من المخزون ويُسجَّل كإيراد'),
        confirmLabel: ui('تأكيد البيع'),
      },
      async () => {
        const { data } = await api.post('/cafe-products/sell-cart?dryRun=true', {
          branchId: effectiveBranchId,
          items: items.map((i) => ({ productId: i.product.id, variantId: i.variant?.id, quantity: i.quantity })),
        });
        const rows = (data as { rows?: { label: string; after?: string }[] }).rows ?? [];
        return {
          rows,
          warning: (data as { warning?: string }).warning,
        };
      },
      async () => {
        const { data } = await api.post<CafeSellCartResult>('/cafe-products/sell-cart', {
          branchId: effectiveBranchId,
          items: items.map((i) => ({ productId: i.product.id, variantId: i.variant?.id, quantity: i.quantity })),
        });
        toast.success(`${ui('فاتورة')} ${data.saleNumber} · ${formatMoney(data.totalAmount)}`);
      },
    );
    if (ok) setCart([]);
  };

  const handleCheckout = () => {
    if (cart.length === 0 || !effectiveBranchId) return;
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
            <Tabs value={activeCategory} onValueChange={setActiveCategory}>
              <TabsList>
                <TabsTrigger value="all">{ui('الكل')}</TabsTrigger>
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
                      <span className="text-xs text-muted-foreground">{ui('جنيه')}</span>
                    </div>
                    {product.recipeCount > 0 && (
                      <Badge variant="secondary" className="w-fit text-[10px]">
                        {product.recipeCount} {ui('مكون')}
                      </Badge>
                    )}
                    {product.variantCount > 0 ? <Badge variant="outline" className="w-fit text-[10px]">{product.variantCount} {ui('اختيار')}</Badge> : null}
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
                <Badge variant="secondary">{cart.reduce((n, i) => n + i.quantity, 0)}</Badge>
              </div>

              {cart.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">{ui('السلة فارغة')}</p>
              ) : (
                <div className="space-y-3">
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
                        <span className="w-6 text-center text-sm">{item.quantity}</span>
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
                    <span className="text-sm text-muted-foreground">{ui('جنيه')}</span>
                  </div>
                </div>
                <Button
                  variant="brand"
                  className="w-full"
                  size="lg"
                  disabled={!canSell || cart.length === 0 || checkingOut || !effectiveBranchId}
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
                <span className="nums mt-2 block text-xl font-black text-primary">{variant.sellPrice.toFixed(2)} {ui('جنيه')}</span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </ListPageShell>
  );
}
