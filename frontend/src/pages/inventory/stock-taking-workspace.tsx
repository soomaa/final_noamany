import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowRight,
  Boxes,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Edit3,
  Loader2,
  Package,
  PackageCheck,
  Search,
  Send,
  Trash2,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { toast } from 'sonner';
import { api, apiError } from '@/lib/api';
import { confirm, confirmWithPreview } from '@/lib/confirm';
import { toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';
import { usePermission } from '@/hooks/use-permission';
import type { PaginatedResponse } from '@/components/common/data-table';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import type { ProductListItem } from '@/types/inventory';
import {
  calculatePhysicalBaseQuantity,
  compatibleStockUnits,
  stockUnitLabel,
  type StockCountMode,
} from '@/lib/stock-taking-units';
import { resolveStockTakingCatalogBranch } from '@/lib/stock-taking-branch';

interface StockTakingItem {
  id: number;
  productId?: number | null;
  itemCode?: string | null;
  itemName: string;
  systemQuantity: number;
  countedQuantity: number;
  variance: number;
  varianceReason?: string | null;
}

interface CountSessionDetail {
  id: number;
  sessionNumber: string;
  warehouseId: number;
  branchId?: number | null;
  status: string;
  notes?: string | null;
  adjustmentId: number | null;
  adjustmentStatus: string | null;
  items: StockTakingItem[];
}

type CatalogFilter = 'all' | 'raw_material' | 'ready_product' | 'prepared_product' | 'packaging';

const FILTERS: Array<{ value: CatalogFilter; label: string }> = [
  { value: 'all', label: 'الكل' },
  { value: 'raw_material', label: 'الخامات' },
  { value: 'ready_product', label: 'المنتجات الجاهزة' },
  { value: 'prepared_product', label: 'المنتجات المحضرة' },
  { value: 'packaging', label: 'التغليف' },
];

const STATUS_LABELS: Record<string, string> = {
  draft: 'جاري الجرد',
  awaiting_approval: 'في انتظار الاعتماد',
  completed: 'مكتملة',
};

const money = (value: number) => `${toArabicDigits(value.toFixed(2))} ج.م`;

export function InventoryStockTakingWorkspacePage() {
  const { id } = useParams<{ id: string }>();
  const sessionId = Number(id);
  const navigate = useNavigate();
  const { ui, isRtl } = useLocale();
  const { can } = usePermission();
  const canCreate = can('gym-sales.inventory.stock_taking:create');
  const canUpdate = can('gym-sales.inventory.stock_taking:update');
  const canDelete = can('gym-sales.inventory.stock_taking:delete');
  const canApprove = can('gym-sales.inventory.stock_taking:approve');

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<CatalogFilter>('all');
  const [mobileSection, setMobileSection] = useState<'catalog' | 'review'>('catalog');
  const [editorOpen, setEditorOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<ProductListItem | null>(null);
  const [editingItem, setEditingItem] = useState<StockTakingItem | null>(null);
  const [countMode, setCountMode] = useState<StockCountMode>('unit');
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState('piece');
  const [packageId, setPackageId] = useState('');
  const [remainderQuantity, setRemainderQuantity] = useState('');
  const [remainderUnit, setRemainderUnit] = useState('piece');
  const [varianceReason, setVarianceReason] = useState('');
  const [saving, setSaving] = useState(false);

  const sessionQuery = useQuery({
    queryKey: ['stock-taking', 'workspace', sessionId],
    queryFn: async () => (await api.get<CountSessionDetail>(`/stock-taking/${sessionId}`)).data,
    enabled: Number.isInteger(sessionId) && sessionId > 0,
  });

  const session = sessionQuery.data;
  const productBranchId = resolveStockTakingCatalogBranch(session?.branchId);

  const productsQuery = useQuery({
    queryKey: ['products', 'stock-taking-workspace', productBranchId],
    queryFn: async () => {
      const params = { pageSize: 500, branchId: productBranchId, status: 'active' };
      const response = await api.get<PaginatedResponse<ProductListItem>>('/products', {
        params: { ...params, page: 1 },
      });
      const remainingPages = Math.ceil(response.data.total / 500) - 1;
      if (remainingPages <= 0) return response.data.data;
      const responses = await Promise.all(Array.from({ length: remainingPages }, (_, index) => api.get<PaginatedResponse<ProductListItem>>('/products', {
        params: { ...params, page: index + 2 },
      })));
      return [response.data, ...responses.map((result) => result.data)].flatMap((page) => page.data);
    },
    enabled: productBranchId != null,
  });

  const products = productsQuery.data ?? [];
  const productById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const countedByProduct = useMemo(
    () => new Map((session?.items ?? []).flatMap((item) => item.productId ? [[item.productId, item] as const] : [])),
    [session?.items],
  );

  const filteredProducts = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    return products.filter((product) => {
      const matchesSearch = !needle || [product.nameAr, product.nameEn, product.productCode, product.barcode, product.size]
        .some((value) => value?.toLocaleLowerCase().includes(needle));
      if (!matchesSearch) return false;
      if (filter === 'all') return true;
      if (filter === 'packaging') return product.inventorySection === 'serving_packaging';
      if (filter === 'prepared_product') return product.inventoryKind === 'manufactured_internal';
      return product.inventoryKind === filter;
    });
  }, [filter, products, search]);

  const summary = useMemo(() => (session?.items ?? []).reduce(
    (result, item) => {
      const product = item.productId ? productById.get(item.productId) : undefined;
      const varianceValue = Math.abs(item.variance) * Number(product?.costPrice ?? 0);
      if (item.variance < 0) {
        result.shortageItems += 1;
        result.shortageValue += varianceValue;
      } else if (item.variance > 0) {
        result.surplusItems += 1;
        result.surplusValue += varianceValue;
      } else {
        result.matchedItems += 1;
      }
      return result;
    },
    { shortageItems: 0, shortageValue: 0, surplusItems: 0, surplusValue: 0, matchedItems: 0 },
  ), [productById, session?.items]);

  const selectedPackage = selectedProduct?.packages?.find((pack) => pack.id === Number(packageId));
  const quantityNumber = quantity.trim() === '' ? Number.NaN : Number(quantity);
  const remainderNumber = remainderQuantity.trim() === '' ? 0 : Number(remainderQuantity);
  const physicalQuantity = selectedProduct ? calculatePhysicalBaseQuantity({
    baseUnit: selectedProduct.unitOfMeasure,
    mode: countMode,
    quantity: quantityNumber,
    unit,
    packageBaseQuantity: selectedPackage?.packageBaseQuantity,
    remainderQuantity: remainderNumber,
    remainderUnit,
  }) : null;
  const systemQuantity = editingItem?.systemQuantity ?? Number(selectedProduct?.currentStock ?? 0);
  const variance = physicalQuantity == null ? null : physicalQuantity - systemQuantity;
  const varianceValue = variance == null ? 0 : Math.abs(variance) * Number(selectedProduct?.costPrice ?? 0);

  const refreshSession = async () => {
    await sessionQuery.refetch();
  };

  const openProduct = (product: ProductListItem) => {
    const counted = countedByProduct.get(product.id);
    if (counted) {
      if (!canUpdate) return;
      setEditingItem(counted);
      setCountMode('unit');
      setQuantity(String(counted.countedQuantity));
      setVarianceReason(counted.varianceReason ?? '');
    } else {
      if (!canCreate) return;
      setEditingItem(null);
      const hasPackages = Boolean(product.isPackaged && product.packages?.length);
      setCountMode(hasPackages ? 'package' : 'unit');
      setQuantity('');
      setVarianceReason('');
    }
    setSelectedProduct(product);
    setUnit(product.unitOfMeasure || 'piece');
    setPackageId(product.packages?.[0] ? String(product.packages[0].id) : '');
    setRemainderQuantity('');
    setRemainderUnit(product.unitOfMeasure || 'piece');
    setEditorOpen(true);
  };

  const saveCount = async () => {
    if (!selectedProduct || physicalQuantity == null || variance == null || saving) return;
    if (variance !== 0 && !varianceReason.trim()) {
      toast.error(ui('اكتب سبب العجز أو الزيادة قبل حفظ الصنف'));
      return;
    }
    setSaving(true);
    try {
      const payload = {
        productId: selectedProduct.id,
        itemCode: selectedProduct.productCode,
        itemName: selectedProduct.nameAr,
        countedQuantity: physicalQuantity,
        varianceReason: varianceReason.trim() || undefined,
      };
      if (editingItem) {
        await api.patch(`/stock-taking/${sessionId}/items/${editingItem.id}`, payload);
        toast.success(ui('تم تحديث نتيجة العد'));
      } else {
        await api.post(`/stock-taking/${sessionId}/items`, payload);
        toast.success(ui('تمت إضافة الصنف إلى الجلسة'));
      }
      setEditorOpen(false);
      await refreshSession();
      setMobileSection('review');
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setSaving(false);
    }
  };

  const removeItem = async (item: StockTakingItem) => {
    const approved = await confirm({
      title: ui('حذف الصنف من جلسة الجرد؟'),
      description: ui(`سيتم حذف نتيجة عد ${item.itemName} ويمكنك إضافته مرة أخرى قبل إنهاء الجلسة.`),
      confirmLabel: ui('حذف الصنف'),
      variant: 'destructive',
    });
    if (!approved) return;
    try {
      await api.delete(`/stock-taking/${sessionId}/items/${item.id}`);
      toast.success(ui('تم حذف الصنف من الجلسة'));
      await refreshSession();
    } catch (error) {
      toast.error(apiError(error));
    }
  };

  const finalizeSession = async () => {
    if (!session?.items.length || saving) return;
    const approved = await confirm({
      title: ui('إنهاء الجرد وإرساله للاعتماد؟'),
      description: ui('بعد الإرسال لن تتمكن من تعديل أو حذف نتائج العد.'),
      confirmLabel: ui('إنهاء وإرسال'),
      rows: [
        { label: ui('الأصناف المعدودة'), after: toArabicDigits(session.items.length) },
        { label: ui('العجز'), after: `${toArabicDigits(summary.shortageItems)} · ${money(summary.shortageValue)}` },
        { label: ui('الزيادة'), after: `${toArabicDigits(summary.surplusItems)} · ${money(summary.surplusValue)}` },
      ],
      warning: ui('راجع كل النتائج قبل الإرسال؛ التعديل متاح فقط أثناء حالة جاري الجرد.'),
    });
    if (!approved) return;
    setSaving(true);
    try {
      await api.post(`/stock-taking/${sessionId}/finalize`);
      toast.success(ui('تم إرسال الجرد للاعتماد'));
      await refreshSession();
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setSaving(false);
    }
  };

  const approveAdjustment = async () => {
    if (!session?.adjustmentId || saving) return;
    setSaving(true);
    try {
      const approved = await confirmWithPreview(
        {
          title: ui('اعتماد تسوية الجرد'),
          description: ui('سيتم تطبيق فروقات الجرد وتسجيل القيد المحاسبي.'),
          confirmLabel: ui('اعتماد وتحديث المخزون'),
        },
        async () => {
          const response = await api.post<{ rows?: Array<{ label: string; before?: string; after?: string }>; warning?: string }>(
            `/stock-taking/adjustments/${session.adjustmentId}/approve?dryRun=true`,
          );
          return response.data;
        },
        async () => {
          await api.post(`/stock-taking/adjustments/${session.adjustmentId}/approve`);
        },
      );
      if (approved) {
        toast.success(ui('تم اعتماد الجرد وتحديث المخزون والقيد المحاسبي'));
        await refreshSession();
      }
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setSaving(false);
    }
  };

  if (!Number.isInteger(sessionId) || sessionId <= 0) {
    return <Card><CardContent className="py-16 text-center text-destructive">{ui('رقم جلسة الجرد غير صالح')}</CardContent></Card>;
  }

  if (sessionQuery.isLoading) {
    return <div className="space-y-5"><Skeleton className="h-24 rounded-2xl" /><Skeleton className="h-[560px] rounded-2xl" /></div>;
  }

  if (sessionQuery.isError || !session) {
    return (
      <Card>
        <CardContent className="space-y-4 py-16 text-center">
          <p className="font-semibold text-destructive">{apiError(sessionQuery.error)}</p>
          <Button permissionAction={null} variant="outline" onClick={() => navigate('/club/cafe/stock-taking')}>{ui('العودة إلى جلسات الجرد')}</Button>
        </CardContent>
      </Card>
    );
  }

  const isDraft = session.status === 'draft';
  const isAwaitingApproval = session.status === 'awaiting_approval';
  const unitOptions = selectedProduct ? compatibleStockUnits(selectedProduct.unitOfMeasure) : ['piece'];
  const canSaveCount = physicalQuantity != null
    && variance != null
    && (variance === 0 || varianceReason.trim().length > 0)
    && !saving;

  const catalog = (
    <section className={`${mobileSection === 'catalog' ? 'block' : 'hidden'} min-w-0 space-y-4 lg:block`} aria-label={ui('أصناف الجرد')}>
      <Card className="overflow-hidden border-primary/10 bg-gradient-to-l from-primary/10 via-card to-card">
        <CardContent className="space-y-4 p-4 sm:p-5">
          <div className="relative">
            <Search className="absolute start-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              className="h-12 rounded-xl ps-12 text-base"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={ui('ابحث باسم الصنف أو الكود أو الباركود…')}
            />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {FILTERS.map((option) => (
              <Button
                key={option.value}
                permissionAction={null}
                size="sm"
                variant={filter === option.value ? 'default' : 'outline'}
                className="h-11 shrink-0"
                onClick={() => setFilter(option.value)}
              >
                {ui(option.label)}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {productsQuery.isLoading && <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-40 rounded-2xl" />)}</div>}
      {productBranchId == null && <Card><CardContent className="py-12 text-center text-destructive">{ui('جلسة الجرد غير مرتبطة بفرع. أنشئ جلسة جديدة وحدد الفرع.')}</CardContent></Card>}
      {productsQuery.isError && <Card><CardContent className="space-y-3 py-12 text-center"><p className="text-destructive">{apiError(productsQuery.error)}</p><Button permissionAction={null} variant="outline" onClick={() => void productsQuery.refetch()}>{ui('إعادة تحميل المنتجات')}</Button></CardContent></Card>}
      {productBranchId != null && !productsQuery.isLoading && !productsQuery.isError && !filteredProducts.length && (
        <Card><CardContent className="py-14 text-center"><Boxes className="mx-auto size-10 text-muted-foreground" /><p className="mt-3 font-semibold">{search.trim() || filter !== 'all' ? ui('لا توجد أصناف مطابقة') : ui('لا توجد منتجات أو خامات نشطة لهذا الفرع')}</p><p className="mt-1 text-sm text-muted-foreground">{search.trim() || filter !== 'all' ? ui('جرّب تغيير البحث أو نوع الصنف') : ui('أضف المنتجات إلى المخزون ثم أعد تحميل الجلسة')}</p></CardContent></Card>
      )}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {filteredProducts.map((product) => {
          const counted = countedByProduct.get(product.id);
          const baseUnit = stockUnitLabel(product.unitOfMeasure);
          const disabled = !isDraft || (counted ? !canUpdate : !canCreate);
          return (
            <button
              key={product.id}
              type="button"
              disabled={disabled}
              onClick={() => openProduct(product)}
              className="group min-h-40 rounded-2xl border bg-card p-4 text-start shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-default disabled:opacity-65 enabled:hover:-translate-y-0.5 enabled:hover:border-primary/40 enabled:hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-primary/10 text-primary">
                    {product.imageUrl ? <img src={product.imageUrl} alt="" loading="lazy" decoding="async" className="size-full object-cover" /> : <Package className="size-6" aria-hidden="true" />}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-bold">{product.nameAr}</p>
                    <p className="nums mt-1 truncate text-xs text-muted-foreground">{product.productCode}{product.size ? ` · ${product.size}` : ''}</p>
                  </div>
                </div>
                {counted ? <Badge variant="success"><Check className="size-3" />{ui('تم عده')}</Badge> : product.isPackaged ? <Badge variant="secondary">{ui('عبوات')}</Badge> : null}
              </div>
              <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-xl bg-muted/45 p-3">
                  <p className="text-xs text-muted-foreground">{ui('رصيد النظام')}</p>
                  <p className="nums mt-1 font-bold">{toArabicDigits(Number(product.currentStock ?? 0))} {ui(baseUnit)}</p>
                </div>
                <div className="rounded-xl bg-muted/45 p-3">
                  <p className="text-xs text-muted-foreground">{ui('التكلفة')}</p>
                  <p className="nums mt-1 font-bold">{money(Number(product.costPrice ?? 0))}</p>
                </div>
              </div>
              <p className="mt-3 text-xs font-medium text-primary">{counted ? ui('اضغط لتعديل نتيجة العد') : ui('اضغط لعد الصنف')}</p>
            </button>
          );
        })}
      </div>
    </section>
  );

  const review = (
    <aside className={`${mobileSection === 'review' ? 'block' : 'hidden'} min-w-0 space-y-4 lg:block`} aria-label={ui('نتائج جلسة الجرد')}>
      <Card className="lg:sticky lg:top-4">
        <CardContent className="space-y-4 p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-bold">{ui('نتائج الجرد')}</h2>
              <p className="mt-1 text-xs text-muted-foreground">{toArabicDigits(session.items.length)} {ui('صنف تمت إضافته')}</p>
            </div>
            <Badge variant="outline">{toArabicDigits(session.items.length)} / {toArabicDigits(products.length)}</Badge>
          </div>

          {!session.items.length && (
            <div className="rounded-2xl border border-dashed p-8 text-center">
              <ClipboardCheck className="mx-auto size-10 text-muted-foreground" />
              <p className="mt-3 font-semibold">{ui('لم يتم عد أي صنف بعد')}</p>
              <p className="mt-1 text-sm text-muted-foreground">{ui('اختر صنفًا من القائمة وابدأ تسجيل الكمية الفعلية')}</p>
              <Button permissionAction={null} variant="outline" className="mt-4 lg:hidden" onClick={() => setMobileSection('catalog')}>{ui('عرض الأصناف')}</Button>
            </div>
          )}

          <div className="max-h-[54vh] space-y-3 overflow-y-auto pe-1">
            {session.items.map((item) => {
              const product = item.productId ? productById.get(item.productId) : undefined;
              const baseUnit = stockUnitLabel(product?.unitOfMeasure ?? 'piece');
              return (
                <div key={item.id} className="rounded-2xl border bg-muted/20 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-bold">{item.itemName}</p>
                      <p className="nums mt-1 text-xs text-muted-foreground">{item.itemCode ?? product?.productCode}</p>
                    </div>
                    <Badge variant={item.variance < 0 ? 'destructive' : item.variance > 0 ? 'success' : 'secondary'}>
                      {item.variance < 0 ? ui('عجز') : item.variance > 0 ? ui('زيادة') : ui('مطابق')}
                    </Badge>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="rounded-lg bg-background p-2"><p className="text-muted-foreground">{ui('النظام')}</p><p className="nums mt-1 font-bold">{toArabicDigits(item.systemQuantity)}</p></div>
                    <div className="rounded-lg bg-background p-2"><p className="text-muted-foreground">{ui('الفعلي')}</p><p className="nums mt-1 font-bold">{toArabicDigits(item.countedQuantity)}</p></div>
                    <div className="rounded-lg bg-background p-2"><p className="text-muted-foreground">{ui('الفرق')}</p><p className={`nums mt-1 font-bold ${item.variance < 0 ? 'text-destructive' : item.variance > 0 ? 'text-success' : ''}`}>{item.variance > 0 ? '+' : ''}{toArabicDigits(item.variance)}</p></div>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">{ui(baseUnit)}{item.varianceReason ? ` · ${item.varianceReason}` : ''}</p>
                  {isDraft && (canUpdate || canDelete) && product && (
                    <div className="mt-3 flex gap-2 border-t pt-3">
                      {canUpdate && <Button permissionAction="update" variant="outline" size="sm" className="min-h-11 flex-1" onClick={() => openProduct(product)}><Edit3 className="size-4" />{ui('تعديل')}</Button>}
                      {canDelete && <Button permissionAction="delete" variant="ghost" size="icon" className="size-11 text-destructive" aria-label={ui(`حذف ${item.itemName}`)} onClick={() => void removeItem(item)}><Trash2 className="size-4" /></Button>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {isDraft && canUpdate && (
            <Button permissionAction="update" variant="brand" className="h-12 w-full font-bold" disabled={!session.items.length || saving} onClick={() => void finalizeSession()}>
              {saving ? <Loader2 className="animate-spin" /> : <Send />}{ui('إنهاء الجرد وإرساله للاعتماد')}
            </Button>
          )}
          {isAwaitingApproval && session.adjustmentId && canApprove && (
            <Button permissionAction="approve" variant="brand" className="h-12 w-full font-bold" disabled={saving} onClick={() => void approveAdjustment()}>
              {saving ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}{ui('اعتماد التسوية وتحديث المخزون')}
            </Button>
          )}
          {!isDraft && !isAwaitingApproval && (
            <div className="flex items-center gap-2 rounded-xl border border-success/25 bg-success/10 p-3 text-sm font-semibold text-success"><PackageCheck className="size-5" />{ui('تم إغلاق جلسة الجرد')}</div>
          )}
        </CardContent>
      </Card>
    </aside>
  );

  return (
    <div className="space-y-5 pb-24 lg:pb-8" dir={isRtl ? 'rtl' : 'ltr'}>
      <PageHeader
        eyebrow={ui('إدارة مخزون الكافيه')}
        title={`${ui('جلسة')} ${session.sessionNumber}`}
        description={ui('اختر الأصناف وسجّل الكمية الفعلية بوحدة القياس أو العبوة المناسبة')}
        actions={(
          <div className="flex items-center gap-2">
            <Badge variant={isDraft ? 'warning' : isAwaitingApproval ? 'default' : 'success'}>{ui(STATUS_LABELS[session.status] ?? session.status)}</Badge>
            <Button permissionAction={null} variant="outline" onClick={() => navigate('/club/cafe/stock-taking')}><ArrowRight className="size-4" />{ui('الجلسات')}</Button>
          </div>
        )}
      />

      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <Card className="border-destructive/20 bg-destructive/5"><CardContent className="p-3 sm:p-4"><div className="flex items-center gap-2 text-destructive"><TrendingDown className="size-4" /><span className="text-xs font-semibold sm:text-sm">{ui('عجز')}</span></div><p className="nums mt-2 text-lg font-bold sm:text-xl">{toArabicDigits(summary.shortageItems)}</p><p className="nums mt-1 text-[10px] leading-tight text-muted-foreground sm:text-xs"><span className="sm:hidden">{toArabicDigits(Math.round(summary.shortageValue))} {ui('ج.م')}</span><span className="hidden sm:inline">{money(summary.shortageValue)}</span></p></CardContent></Card>
        <Card className="border-success/20 bg-success/5"><CardContent className="p-3 sm:p-4"><div className="flex items-center gap-2 text-success"><TrendingUp className="size-4" /><span className="text-xs font-semibold sm:text-sm">{ui('زيادة')}</span></div><p className="nums mt-2 text-lg font-bold sm:text-xl">{toArabicDigits(summary.surplusItems)}</p><p className="nums mt-1 text-[10px] leading-tight text-muted-foreground sm:text-xs"><span className="sm:hidden">{toArabicDigits(Math.round(summary.surplusValue))} {ui('ج.م')}</span><span className="hidden sm:inline">{money(summary.surplusValue)}</span></p></CardContent></Card>
        <Card><CardContent className="p-3 sm:p-4"><div className="flex items-center gap-2 text-muted-foreground"><CheckCircle2 className="size-4 text-success" /><span className="text-xs font-semibold sm:text-sm">{ui('مطابق')}</span></div><p className="nums mt-2 text-lg font-bold sm:text-xl">{toArabicDigits(summary.matchedItems)}</p><p className="mt-1 truncate text-[11px] text-muted-foreground sm:text-xs">{ui('بدون فرق')}</p></CardContent></Card>
      </div>

      <div className="sticky top-2 z-20 grid grid-cols-2 rounded-xl border bg-background/95 p-1 shadow-sm backdrop-blur lg:hidden">
        <Button permissionAction={null} variant={mobileSection === 'catalog' ? 'default' : 'ghost'} className="h-11" onClick={() => setMobileSection('catalog')}><Boxes />{ui('الأصناف')}</Button>
        <Button permissionAction={null} variant={mobileSection === 'review' ? 'default' : 'ghost'} className="h-11" onClick={() => setMobileSection('review')}><ClipboardCheck />{ui('نتائج الجرد')} <Badge variant="secondary">{toArabicDigits(session.items.length)}</Badge></Button>
      </div>

      <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        {catalog}
        {review}
      </div>

      <Sheet open={editorOpen} onOpenChange={setEditorOpen}>
        <SheetContent side={isRtl ? 'start' : 'end'} className="w-full overflow-y-auto pb-[max(1.5rem,env(safe-area-inset-bottom))] [&>button]:flex [&>button]:size-11 [&>button]:items-center [&>button]:justify-center sm:max-w-xl">
          <SheetHeader className="pe-8">
            <SheetTitle className="text-xl">{editingItem ? ui('تعديل نتيجة العد') : ui('عد الصنف')}</SheetTitle>
            <SheetDescription>{selectedProduct?.nameAr} · {selectedProduct?.productCode}</SheetDescription>
          </SheetHeader>

          {selectedProduct && (
            <div className="mt-6 space-y-5">
              <Card className="border-primary/15 bg-primary/5">
                <CardContent className="grid grid-cols-2 gap-3 p-4">
                  <div><p className="text-xs text-muted-foreground">{ui('رصيد النظام')}</p><p className="nums mt-1 text-lg font-bold">{toArabicDigits(systemQuantity)} {ui(stockUnitLabel(selectedProduct.unitOfMeasure))}</p></div>
                  <div><p className="text-xs text-muted-foreground">{ui('تكلفة الوحدة')}</p><p className="nums mt-1 text-lg font-bold">{money(Number(selectedProduct.costPrice ?? 0))}</p></div>
                </CardContent>
              </Card>

              {!editingItem && Boolean(selectedProduct.packages?.length) && (
                <div className="grid grid-cols-2 rounded-xl bg-muted p-1">
                  <Button permissionAction={null} variant={countMode === 'unit' ? 'default' : 'ghost'} className="h-11" onClick={() => setCountMode('unit')}>{ui('وحدة قياس')}</Button>
                  <Button permissionAction={null} variant={countMode === 'package' ? 'default' : 'ghost'} className="h-11" onClick={() => setCountMode('package')}>{ui('عبوات')}</Button>
                </div>
              )}

              {countMode === 'unit' ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2"><Label htmlFor="physical-count">{ui('الكمية الفعلية')}</Label><Input id="physical-count" inputMode="decimal" type="number" min="0" step="0.001" className="nums h-12 text-base" value={quantity} onChange={(event) => setQuantity(event.target.value)} placeholder="0" autoFocus /></div>
                  <div className="space-y-2"><Label>{ui('وحدة القياس')}</Label><Select value={unit} onValueChange={setUnit}><SelectTrigger className="h-12"><SelectValue /></SelectTrigger><SelectContent>{unitOptions.map((option) => <SelectItem key={option} value={option}>{ui(stockUnitLabel(option))} ({option})</SelectItem>)}</SelectContent></Select></div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="space-y-2"><Label>{ui('حجم العبوة')}</Label><Select value={packageId} onValueChange={setPackageId}><SelectTrigger className="h-12"><SelectValue placeholder={ui('اختر العبوة')} /></SelectTrigger><SelectContent>{(selectedProduct.packages ?? []).map((pack) => <SelectItem key={pack.id} value={String(pack.id)}>{toArabicDigits(pack.packageSize)} {ui(stockUnitLabel(pack.packageUnit))} · {money(Number(pack.packagePrice))}</SelectItem>)}</SelectContent></Select></div>
                  <div className="space-y-2"><Label htmlFor="package-count">{ui('عدد العبوات الكاملة')}</Label><Input id="package-count" inputMode="decimal" type="number" min="0" step="1" className="nums h-12 text-base" value={quantity} onChange={(event) => setQuantity(event.target.value)} placeholder="0" autoFocus /></div>
                  <div className="rounded-2xl border border-dashed p-4">
                    <p className="font-semibold">{ui('كمية مفتوحة أو متبقية')}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{ui(`اختياري — مثال: عبوتان كاملتان + 250 ${stockUnitLabel(selectedProduct.unitOfMeasure)}`)}</p>
                    <div className="mt-3 grid grid-cols-2 gap-3">
                      <Input aria-label={ui('الكمية المتبقية')} inputMode="decimal" type="number" min="0" step="0.001" className="nums h-12" value={remainderQuantity} onChange={(event) => setRemainderQuantity(event.target.value)} placeholder="0" />
                      <Select value={remainderUnit} onValueChange={setRemainderUnit}><SelectTrigger className="h-12"><SelectValue /></SelectTrigger><SelectContent>{unitOptions.map((option) => <SelectItem key={option} value={option}>{ui(stockUnitLabel(option))}</SelectItem>)}</SelectContent></Select>
                    </div>
                  </div>
                </div>
              )}

              <div className="rounded-2xl border bg-muted/25 p-4">
                <div className="flex items-center justify-between gap-3"><span className="text-sm text-muted-foreground">{ui('إجمالي الكمية الفعلية')}</span><span className="nums font-bold">{physicalQuantity == null ? ui('—') : `${toArabicDigits(physicalQuantity)} ${ui(stockUnitLabel(selectedProduct.unitOfMeasure))}`}</span></div>
                <div className="mt-3 flex items-center justify-between gap-3 border-t pt-3"><span className="text-sm text-muted-foreground">{ui('الفرق المتوقع')}</span>{variance == null ? <span>{ui('—')}</span> : <Badge variant={variance < 0 ? 'destructive' : variance > 0 ? 'success' : 'secondary'} className="nums text-sm">{variance > 0 ? '+' : ''}{toArabicDigits(variance)} · {variance < 0 ? ui('عجز') : variance > 0 ? ui('زيادة') : ui('مطابق')}</Badge>}</div>
                {variance != null && variance !== 0 && <p className="nums mt-2 text-xs text-muted-foreground">{ui('قيمة الفرق التقديرية')}: {money(varianceValue)}</p>}
              </div>

              {variance != null && variance !== 0 && (
                <div className="space-y-2">
                  <Label htmlFor="variance-reason">{ui('سبب الفرق')} <span className="text-destructive">*</span></Label>
                  <Textarea id="variance-reason" rows={3} maxLength={255} value={varianceReason} onChange={(event) => setVarianceReason(event.target.value)} placeholder={ui('مثال: كسر، هالك، خطأ تسجيل، أو استلام غير مسجل')} />
                </div>
              )}

              <Button permissionAction={editingItem ? 'update' : 'create'} className="h-12 w-full text-base font-bold" disabled={!canSaveCount} onClick={() => void saveCount()}>
                {saving ? <Loader2 className="animate-spin" /> : <Check />}{editingItem ? ui('حفظ تعديل نتيجة العد') : ui('إضافة الصنف إلى الجلسة')}
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
