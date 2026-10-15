import { formatDisplayNumber } from '@/lib/number-display';
import { useMemo, useState } from 'react';
import {
  Archive,
  Layers,
  Lock,
  PackageCheck,
  Percent,
  Plus,
  Shuffle,
  Sparkles,
  Trash2,
  Edit2,
  Wallet,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Combobox, type ComboboxOption } from '@/components/common/combobox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DataTable, type PaginatedResponse } from '@/components/common/data-table';
import { ListPageShell } from '@/components/common/list-page-shell';
import { useLocale } from '@/store/locale';
import { api, apiError } from '@/lib/api';
import { useListQuery } from '@/lib/use-list-query';
import { useQuery } from '@tanstack/react-query';
import { usePaginatedList, useMutationWithToast } from '@/lib/api-hooks';
import { confirm } from '@/lib/confirm';
import { toast } from 'sonner';
import { formatMoneyNumber } from '@/lib/formatters';
import { usePermission } from '@/hooks/use-permission';
import { UploadField } from '@/components/employees/upload-fields';
import { DEFAULT_PRODUCT_IMAGE, resolveProductImageUrl } from '@/lib/product-image';
import type {
  CafeBundleDetail,
  CafeBundleListItem,
  CafeBundlePricingMode,
  CafeProductListItem,
  UpsertCafeBundleDto,
} from '@/types/cafe';

// ── Form model ───────────────────────────────────────────────────────────────
// A "fixed" bundle is a flat list of items. Each item is persisted as a group
// with a single option (min=max=1), so the backend model is unchanged.
interface ItemForm {
  cafeProductId: number | null;
  cafeVariantId: number | null;
}
interface BundleFormState {
  name: string;
  bundleCode: string;
  description: string;
  imageUrl: string;
  pricingMode: CafeBundlePricingMode;
  fixedPrice: number;
  discountPercentage: number;
  isActive: boolean;
  items: ItemForm[];
}

const emptyItem = (): ItemForm => ({ cafeProductId: null, cafeVariantId: null });
const emptyForm = (): BundleFormState => ({
  name: '',
  bundleCode: '',
  description: '',
  imageUrl: '',
  pricingMode: 'fixed',
  fixedPrice: 0,
  discountPercentage: 0,
  isActive: true,
  items: [emptyItem()],
});

function money(value: number) {
  return formatMoneyNumber(value);
}

export function CafeBundlesPage() {
  const { ui } = useLocale();
  const { can } = usePermission();
  const { params, setParams } = useListQuery({ pageSize: 25, filters: { status: 'active' } });
  const [tab, setTab] = useState<'active' | 'archived'>(
    params.filters.status === 'inactive' ? 'archived' : 'active',
  );

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<BundleFormState>(emptyForm);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hydrating, setHydrating] = useState(false);

  const { data, isLoading, isError, error, refetch } = usePaginatedList<CafeBundleListItem>('cafe-bundles', params);

  // Active café products used as bundle items. The list endpoint caps pageSize at 100,
  // so page through it to load every product (a café can have far more than 100).
  const { data: productsData } = useQuery({
    queryKey: ['cafe-products', 'bundle-picker'],
    queryFn: async () => {
      const pageSize = 100;
      const all: CafeProductListItem[] = [];
      for (let page = 1; ; page += 1) {
        const { data } = await api.get<PaginatedResponse<CafeProductListItem>>('/cafe-products', {
          params: { page, pageSize, isActive: true },
        });
        all.push(...data.data);
        if (data.data.length < pageSize || all.length >= (data.total ?? all.length)) break;
      }
      return all;
    },
  });
  const products = useMemo(
    () => (productsData ?? []).filter((p) => p.productType !== 'internal'),
    [productsData],
  );
  const productMap = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const productOptions = useMemo<ComboboxOption[]>(
    () =>
      products.map((p) => ({
        value: String(p.id),
        label: p.name,
        description: `${money(p.sellPrice)} ${ui('ج.م')}`,
        searchText: p.productCode,
      })),
    [products, ui],
  );

  const itemPrice = (item: ItemForm) => {
    if (item.cafeProductId == null) return 0;
    const product = productMap.get(item.cafeProductId);
    const variant = product?.variants?.find((v) => v.id === item.cafeVariantId);
    return variant?.sellPrice ?? product?.sellPrice ?? 0;
  };
  const itemName = (item: ItemForm) => (item.cafeProductId != null ? productMap.get(item.cafeProductId)?.name ?? '' : '');

  // ── Hydrate the form when editing (each group → one item) ──────────────────
  const hydrateForm = (detail: CafeBundleDetail) => {
    setForm({
      name: detail.name,
      bundleCode: detail.bundleCode,
      description: detail.description ?? '',
      imageUrl: detail.imageUrl ?? '',
      pricingMode: detail.pricingMode,
      fixedPrice: detail.fixedPrice,
      discountPercentage: detail.discountPercentage,
      isActive: detail.isActive,
      items: detail.groups.length
        ? detail.groups.map((group) => ({
            cafeProductId: group.options[0]?.cafeProductId ?? null,
            cafeVariantId: group.options[0]?.cafeVariantId ?? null,
          }))
        : [emptyItem()],
    });
  };

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm());
    setDialogOpen(true);
  };

  const openEdit = async (row: CafeBundleListItem) => {
    setEditingId(row.id);
    setDialogOpen(true);
    setHydrating(true);
    try {
      const { data: detail } = await api.get<CafeBundleDetail>(`/cafe-bundles/${row.id}`);
      hydrateForm(detail);
    } catch (err) {
      toast.error(apiError(err));
    } finally {
      setHydrating(false);
    }
  };

  // ── Pricing preview ────────────────────────────────────────────────────────
  const itemsTotal = useMemo(() => form.items.reduce((sum, item) => sum + itemPrice(item), 0), [form.items, productMap]);
  const previewPrice = useMemo(() => {
    if (form.pricingMode === 'percent') {
      return Math.round(itemsTotal * (1 - form.discountPercentage / 100) * 100) / 100;
    }
    return form.fixedPrice;
  }, [form.pricingMode, form.fixedPrice, form.discountPercentage, itemsTotal]);
  const savings = Math.max(0, Math.round((itemsTotal - previewPrice) * 100) / 100);
  const savingsPct = itemsTotal > 0 ? Math.round((savings / itemsTotal) * 100) : 0;

  // ── Save ───────────────────────────────────────────────────────────────────
  const buildPayload = (): UpsertCafeBundleDto => ({
    name: form.name.trim(),
    bundleCode: form.bundleCode.trim() || undefined,
    description: form.description.trim() || undefined,
    imageUrl: form.imageUrl.trim() || undefined,
    pricingMode: form.pricingMode,
    fixedPrice: form.pricingMode === 'fixed' ? form.fixedPrice : undefined,
    discountPercentage: form.pricingMode === 'percent' ? form.discountPercentage : undefined,
    isActive: form.isActive,
    // Each fixed item becomes a single-option group.
    groups: form.items
      .filter((item) => item.cafeProductId != null)
      .map((item, i) => ({
        name: itemName(item) || `${ui('صنف')} ${i + 1}`,
        minSelect: 1,
        maxSelect: 1,
        sortOrder: i,
        options: [
          {
            cafeProductId: item.cafeProductId!,
            cafeVariantId: item.cafeVariantId ?? null,
            priceDelta: 0,
            sortOrder: 0,
            isActive: true,
          },
        ],
      })),
  });

  const saveMutation = useMutationWithToast(
    async (vars: { id?: number; payload: UpsertCafeBundleDto }) => {
      if (vars.id) await api.put(`/cafe-bundles/${vars.id}`, vars.payload);
      else await api.post('/cafe-bundles', vars.payload);
    },
    {
      success: editingId ? ui('تم تحديث الباندل') : ui('تم إضافة الباندل'),
      invalidate: ['cafe-bundles'],
      onSuccess: () => {
        setDialogOpen(false);
        setForm(emptyForm());
        setEditingId(null);
      },
    },
  );

  const statusMutation = useMutationWithToast(
    async (vars: { id: number; isActive: boolean }) => {
      await api.patch(`/cafe-bundles/${vars.id}/status`, { isActive: vars.isActive });
    },
    { success: ui('تم تحديث حالة الباندل'), invalidate: ['cafe-bundles'] },
  );

  const deleteMutation = useMutationWithToast(
    async (id: number) => {
      await api.delete(`/cafe-bundles/${id}`);
    },
    { success: ui('تم حذف الباندل نهائيًا'), invalidate: ['cafe-bundles'] },
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return toast.error(ui('اسم الباندل مطلوب'));
    if (!form.items.some((item) => item.cafeProductId != null)) return toast.error(ui('أضف صنف واحد على الأقل'));
    if (form.pricingMode === 'fixed' && form.fixedPrice <= 0) return toast.error(ui('حدد سعرًا للباندل'));
    if (form.pricingMode === 'percent' && (form.discountPercentage <= 0 || form.discountPercentage > 100)) {
      return toast.error(ui('حدد نسبة خصم صحيحة'));
    }
    setIsSubmitting(true);
    try {
      await saveMutation.mutateAsync({ id: editingId ?? undefined, payload: buildPayload() });
    } catch (err) {
      toast.error(apiError(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (row: CafeBundleListItem) => {
    const ok = await confirm({
      title: ui('حذف الباندل نهائيًا'),
      description: `${ui('سيتم حذف')} "${row.name}" ${ui('نهائيًا. الفواتير السابقة تحتفظ بتفاصيلها.')}`,
      variant: 'destructive',
    });
    if (ok) deleteMutation.mutate(row.id);
  };

  // ── Item mutators ──────────────────────────────────────────────────────────
  const patchItem = (i: number, patch: Partial<ItemForm>) =>
    setForm((f) => ({ ...f, items: f.items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)) }));
  const addItem = () => setForm((f) => ({ ...f, items: [...f.items, emptyItem()] }));
  const removeItem = (i: number) => setForm((f) => ({ ...f, items: f.items.filter((_, idx) => idx !== i) }));

  // ── Columns ────────────────────────────────────────────────────────────────
  const columns = useMemo(
    () => [
      {
        header: ui('الباندل'),
        accessorKey: 'name',
        cell: ({ row }: { row: { original: CafeBundleListItem } }) => {
          const b = row.original;
          return (
            <div className="flex items-center gap-3">
              <span className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-xl border border-border/60 bg-muted">
                {b.imageUrl ? (
                  <img
                    src={resolveProductImageUrl(b.imageUrl)}
                    alt=""
                    className="size-full object-cover"
                    onError={(e) => (e.currentTarget.src = DEFAULT_PRODUCT_IMAGE)}
                  />
                ) : (
                  <Layers className="size-5 text-primary" />
                )}
              </span>
              <div className="min-w-0">
                <div className="truncate font-medium">{b.name}</div>
                <div className="text-xs text-muted-foreground nums" dir="ltr">{b.bundleCode}</div>
              </div>
            </div>
          );
        },
      },
      {
        header: ui('التسعير'),
        accessorKey: 'pricingMode',
        cell: ({ row }: { row: { original: CafeBundleListItem } }) => {
          const b = row.original;
          return b.pricingMode === 'fixed' ? (
            <span className="inline-flex items-center gap-1 font-semibold text-primary nums" dir="ltr">
              {money(b.fixedPrice)} <span className="text-xs font-normal text-muted-foreground">{ui('ج.م')}</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
              <Percent className="size-3" /> {money(b.discountPercentage)}% {ui('خصم')}
            </span>
          );
        },
      },
      {
        header: ui('الأصناف'),
        accessorKey: 'optionCount',
        cell: ({ row }: { row: { original: CafeBundleListItem } }) => (
          <span className="text-sm text-muted-foreground">
            {formatDisplayNumber(row.original.optionCount)} {ui('صنف')}
          </span>
        ),
      },
      {
        header: ui('الحالة'),
        accessorKey: 'isActive',
        cell: ({ row }: { row: { original: CafeBundleListItem } }) => {
          const b = row.original;
          return can('club.cafe.bundles:update') ? (
            <div className="flex min-w-24 items-center gap-2">
              <Switch
                checked={b.isActive}
                onCheckedChange={(isActive) => statusMutation.mutate({ id: b.id, isActive })}
                aria-label={b.isActive ? ui('تعطيل الباندل') : ui('تنشيط الباندل')}
              />
              <span className={b.isActive ? 'text-xs font-semibold text-success' : 'text-xs text-muted-foreground'}>
                {b.isActive ? ui('نشط') : ui('معطل')}
              </span>
            </div>
          ) : (
            <Badge variant={b.isActive ? 'success' : 'secondary'}>{b.isActive ? ui('نشط') : ui('معطل')}</Badge>
          );
        },
      },
      {
        header: ui('إجراءات'),
        id: 'actions',
        cell: ({ row }: { row: { original: CafeBundleListItem } }) => (
          <div className="flex items-center gap-1">
            {can('club.cafe.bundles:update') ? (
              <Button variant="ghost" size="icon" onClick={() => openEdit(row.original)}>
                <Edit2 className="size-4" />
              </Button>
            ) : null}
            {!row.original.isActive && can('club.cafe.bundles:delete') ? (
              <Button
                variant="ghost"
                size="icon"
                className="text-destructive"
                title={ui('حذف نهائي')}
                disabled={deleteMutation.isPending}
                onClick={() => handleDelete(row.original)}
              >
                <Trash2 className="size-4" />
              </Button>
            ) : null}
          </div>
        ),
      },
    ],
    [can, deleteMutation.isPending, statusMutation, ui],
  );

  const table = (
    <DataTable
      exportSource={{ resource: 'cafe-bundles', params }}
      columns={columns}
      data={data?.data ?? []}
      total={data?.total ?? 0}
      page={params.page}
      pageSize={params.pageSize}
      onPageChange={(page) => setParams({ page })}
      onPageSizeChange={(pageSize) => setParams({ pageSize, page: 1 })}
      isLoading={isLoading}
      isError={isError}
      errorMessage={apiError(error)}
      onRetry={refetch}
      search={params.search}
      onSearchChange={(search) => setParams({ search, page: 1 })}
      searchPlaceholder={ui('بحث باسم الباندل…')}
    />
  );

  return (
    <ListPageShell
      title={ui('باندلات الكافيه')}
      description={ui('اعمل عروض متجمّعة: مجموعة أصناف تُباع مع بعض بسعر واحد أو بخصم')}
      actions={
        can('club.cafe.bundles:create') ? (
          <Button onClick={openCreate}>
            <Plus className="me-2 size-4" />
            {ui('باندل جديد')}
          </Button>
        ) : null
      }
      isLoading={isLoading}
      isError={isError}
      error={error}
      onRetry={refetch}
    >
      <Tabs
        value={tab}
        onValueChange={(value) => {
          const next = value as 'active' | 'archived';
          setTab(next);
          setParams({ page: 1, filters: { status: next === 'archived' ? 'inactive' : 'active' } });
        }}
        dir="rtl"
        className="space-y-4"
      >
        <TabsList className="grid h-auto w-full max-w-xl grid-cols-2 gap-2 rounded-2xl bg-muted/60 p-2">
          <TabsTrigger value="active" className="gap-2 rounded-xl py-2.5">
            <PackageCheck className="size-4" />
            {ui('الباندلات النشطة')}
          </TabsTrigger>
          <TabsTrigger value="archived" className="gap-2 rounded-xl py-2.5">
            <Archive className="size-4" />
            {ui('المعطلة / الأرشيف')}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="active" className="mt-0">
          {tab === 'active' ? table : null}
        </TabsContent>
        <TabsContent value="archived" className="mt-0">
          {tab === 'archived' ? table : null}
        </TabsContent>
      </Tabs>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            setEditingId(null);
            setForm(emptyForm());
          }
        }}
      >
        <DialogContent size="xl" className="flex h-[min(90vh,880px)] flex-col overflow-hidden p-0">
          <DialogHeader className="border-b border-border/60 px-6 pt-6 pb-4">
            <DialogTitle className="flex items-center gap-2">
              <Layers className="size-5 text-primary" />
              {editingId ? ui('تعديل الباندل') : ui('باندل جديد')}
            </DialogTitle>
          </DialogHeader>

          {editingId && hydrating ? (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              {ui('جاري تحميل الباندل…')}
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
              <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-5">
                {/* Bundle type: fixed (now) vs dynamic (later) */}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border-2 border-primary bg-primary/5 p-4 ring-2 ring-primary/15">
                    <div className="flex items-center gap-2 font-bold">
                      <PackageCheck className="size-4 text-primary" /> {ui('باندل محدد')}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{ui('أصناف ثابتة تتباع مع بعض بسعر واحد أو بخصم')}</p>
                  </div>
                  <div className="rounded-2xl border-2 border-dashed border-border/60 p-4 opacity-70">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 font-bold text-muted-foreground">
                        <Shuffle className="size-4" /> {ui('باندل داينمك')}
                      </div>
                      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
                        <Lock className="size-3" /> {ui('قريبًا')}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{ui('العميل يختار من مجموعات (مثلاً: أي مشروب + أي أكل)')}</p>
                  </div>
                </div>

                {/* Identity */}
                <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
                  <div className="space-y-2">
                    <div className="grid aspect-square w-full place-items-center overflow-hidden rounded-2xl border border-border/60 bg-muted">
                      {form.imageUrl ? (
                        <img
                          src={resolveProductImageUrl(form.imageUrl)}
                          alt=""
                          className="size-full object-cover"
                          onError={(e) => (e.currentTarget.src = DEFAULT_PRODUCT_IMAGE)}
                        />
                      ) : (
                        <Layers className="size-9 text-muted-foreground" />
                      )}
                    </div>
                    <UploadField
                      category="product-image"
                      value={form.imageUrl}
                      onChange={(path) => setForm((c) => ({ ...c, imageUrl: path ?? '' }))}
                      accept="image/*"
                      label={ui('صورة')}
                    />
                  </div>
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label>{ui('اسم الباندل')}</Label>
                      <Input
                        value={form.name}
                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                        placeholder={ui('مثال: بري-ووركاوت')}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="flex items-center gap-1">
                        {ui('وصف مختصر')}
                        <span className="text-xs font-normal text-muted-foreground">({ui('اختياري')})</span>
                      </Label>
                      <Input
                        value={form.description}
                        onChange={(e) => setForm({ ...form, description: e.target.value })}
                        placeholder={ui('يظهر للكاشير')}
                      />
                    </div>
                    <div className="flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-2">
                      <Switch id="bundleActive" checked={form.isActive} onCheckedChange={(v) => setForm({ ...form, isActive: v })} />
                      <Label htmlFor="bundleActive" className="text-sm">{ui('نشط ومتاح للبيع')}</Label>
                    </div>
                  </div>
                </div>

                {/* Items */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-semibold">{ui('أصناف الباندل')}</Label>
                    <span className="text-xs text-muted-foreground">
                      {ui('مجموع الأصناف')}: <span className="nums font-bold text-foreground" dir="ltr">{money(itemsTotal)} {ui('ج.م')}</span>
                    </span>
                  </div>
                  <div className="space-y-2 rounded-2xl border border-border/60 bg-card p-3">
                    {form.items.map((item, i) => {
                      const product = item.cafeProductId != null ? productMap.get(item.cafeProductId) : undefined;
                      const variants = product?.variants?.filter((v) => v.isActive) ?? [];
                      return (
                        <div key={i} className="flex items-center gap-2">
                          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-xs font-bold text-primary nums">
                            {formatDisplayNumber(i + 1)}
                          </span>
                          <div className="min-w-0 flex-1">
                            <Combobox
                              value={item.cafeProductId != null ? String(item.cafeProductId) : ''}
                              onValueChange={(v) => patchItem(i, { cafeProductId: Number(v), cafeVariantId: null })}
                              options={productOptions}
                              placeholder={ui('اختر صنف من المنيو')}
                              searchPlaceholder={ui('ابحث بالاسم أو الكود…')}
                              emptyText={ui('لا يوجد صنف بهذا الاسم')}
                              className="w-full"
                            />
                          </div>
                          {variants.length ? (
                            <div className="w-28 shrink-0">
                              <Select
                                value={item.cafeVariantId != null ? String(item.cafeVariantId) : 'base'}
                                onValueChange={(v) => patchItem(i, { cafeVariantId: v === 'base' ? null : Number(v) })}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder={ui('الحجم')} />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="base">{ui('الافتراضي')}</SelectItem>
                                  {variants.map((v) => (
                                    <SelectItem key={v.id} value={String(v.id)}>
                                      {v.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          ) : null}
                          <span className="nums w-16 shrink-0 text-end text-xs font-semibold text-muted-foreground" dir="ltr">
                            {product ? money(itemPrice(item)) : '—'}
                          </span>
                          {form.items.length > 1 ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="size-9 shrink-0 text-muted-foreground hover:text-destructive"
                              onClick={() => removeItem(i)}
                              title={ui('حذف الصنف')}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          ) : null}
                        </div>
                      );
                    })}
                    <Button type="button" variant="outline" size="sm" className="border-dashed" onClick={addItem}>
                      <Plus className="me-1 size-3.5" />
                      {ui('إضافة صنف')}
                    </Button>
                  </div>
                </div>

                {/* Pricing */}
                <div className="space-y-3">
                  <Label className="text-sm font-semibold">{ui('سعر الباندل')}</Label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, pricingMode: 'fixed' })}
                      className={`rounded-2xl border p-4 text-start transition ${
                        form.pricingMode === 'fixed' ? 'border-primary bg-primary/5 ring-2 ring-primary/20' : 'border-border/60 hover:border-primary/40'
                      }`}
                    >
                      <div className="flex items-center gap-2 font-semibold">
                        <Wallet className="size-4 text-primary" /> {ui('سعر ثابت')}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{ui('تكتب السعر النهائي للباندل')}</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, pricingMode: 'percent' })}
                      className={`rounded-2xl border p-4 text-start transition ${
                        form.pricingMode === 'percent' ? 'border-primary bg-primary/5 ring-2 ring-primary/20' : 'border-border/60 hover:border-primary/40'
                      }`}
                    >
                      <div className="flex items-center gap-2 font-semibold">
                        <Percent className="size-4 text-emerald-600" /> {ui('خصم بالنسبة')}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{ui('نسبة خصم على مجموع الأصناف')}</p>
                    </button>
                  </div>

                  {form.pricingMode === 'fixed' ? (
                    <div className="space-y-1.5">
                      <Label>{ui('السعر النهائي')}</Label>
                      <div className="flex max-w-xs items-center gap-2">
                        <Input
                          type="number"
                          min={0}
                          className="nums text-lg font-bold"
                          value={form.fixedPrice || ''}
                          placeholder="0"
                          onChange={(e) => setForm({ ...form, fixedPrice: Math.max(0, Number(e.target.value) || 0) })}
                        />
                        <span className="shrink-0 text-sm font-medium text-muted-foreground">{ui('ج.م')}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <Label>{ui('نسبة الخصم')}</Label>
                      <div className="flex max-w-xs items-center gap-2">
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          className="nums text-lg font-bold"
                          value={form.discountPercentage || ''}
                          placeholder="0"
                          onChange={(e) => setForm({ ...form, discountPercentage: Math.min(100, Math.max(0, Number(e.target.value) || 0)) })}
                        />
                        <span className="shrink-0 text-sm font-medium text-muted-foreground">%</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Sticky footer: live price + savings + actions */}
              <DialogFooter className="flex-row items-center justify-between gap-3 border-t border-border/60 bg-muted/20 px-6 py-3">
                <div className="flex items-center gap-3">
                  <div>
                    <div className="text-[11px] text-muted-foreground">{ui('سعر الباندل')}</div>
                    <div className="nums text-lg font-black text-primary" dir="ltr">
                      {money(previewPrice)} <span className="text-xs font-normal text-muted-foreground">{ui('ج.م')}</span>
                    </div>
                  </div>
                  {savings > 0 ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                      <Sparkles className="size-3" />
                      {ui('يوفّر')} {money(savings)} ({formatDisplayNumber(savingsPct)}%)
                    </span>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                    {ui('إلغاء')}
                  </Button>
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? ui('جاري الحفظ…') : editingId ? ui('حفظ التعديلات') : ui('حفظ الباندل')}
                  </Button>
                </div>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </ListPageShell>
  );
}
