import type { ColumnDef } from '@tanstack/react-table';
import { Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { PaginatedResponse } from '@/components/common/data-table';
import { DataTable } from '@/components/common/data-table';
import { FilterBar, type FilterField } from '@/components/common/filter-bar';
import { ListPageShell } from '@/components/common/list-page-shell';
import { StatusBadge } from '@/components/common/status-badge';
import { UploadField } from '@/components/employees/upload-fields';
import { uploadUrl } from '@/components/employees/use-uploads';
import { resolveProductImageUrl } from '@/lib/product-image';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api, apiError } from '@/lib/api';
import { useMutationWithToast, usePaginatedList } from '@/lib/api-hooks';
import { useListQuery } from '@/lib/use-list-query';
import { toArabicDigits } from '@/lib/utils';
import type { InventorySection, NamedEntity, ProductFormData, ProductListItem } from '@/types/inventory';
import { useLocale } from '@/store/locale';
import { indexColumn } from './simple-crud-tab';
import { CAFE_UNIT_OPTIONS, convertCafeUnit, defaultCafeRecipeUnit } from '@/lib/cafe-units';
import { useBranches } from '@/hooks/use-branches';
import { useAuth } from '@/store/auth';
import { usePermission } from '@/hooks/use-permission';
import { RecipeEditor, type RecipeLine } from '@/components/cafe/recipe-editor';
import type { RecipeUnit } from '@/types/cafe';

function useCatalogOptions(resource: string, enabled = true) {
  return useQuery({
    queryKey: [resource, 'options'],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<NamedEntity>>(`/${resource}`, {
        params: { page: 1, pageSize: 200 },
      });
      return data.data;
    },
    enabled,
  });
}

const EMPTY: ProductFormData = {
  nameAr: '',
  nameEn: '',
  productCode: '',
  sellingPrice: 0,
  costPrice: 0,
  imageUrl: '',
  status: 'active',
  barcode: '',
  description: '',
  size: '',
  reorderPoint: 10,
  applyToAllBranches: false,
  unitOfMeasure: 'piece',
  minStock: 0,
  initialStock: 0,
  initialTotalCost: 0,
  openingBranchId: undefined,
  currentStock: 0,
  inventorySection: 'general',
  recipes: [],
};

export function ProductsTab({
  inventoryKind,
  inventorySection,
  createLabel,
}: {
  inventoryKind?: 'raw_material' | 'ready_product';
  inventorySection?: InventorySection;
  createLabel?: string;
} = {}) {
  const { ui } = useLocale();
  const queryClient = useQueryClient();
  const user = useAuth((state) => state.user);
  const { can } = usePermission();
  const { data: branches } = useBranches();
  const isRawMaterial = inventoryKind === 'raw_material';
  const supportsComposite = isRawMaterial && inventorySection === 'preparation_ingredients';
  const defaultOpeningBranchId = user?.branch || branches?.[0]?.id;
  const { params, setParams } = useListQuery({
    filters: {
      ...(inventoryKind ? { inventoryKind } : {}),
      ...(inventorySection ? { inventorySection } : {}),
      branchId: user?.branch && user.branch > 0 ? String(user.branch) : 'all',
    },
  });
  const { data, isLoading, isError, error, refetch } = usePaginatedList<ProductListItem>('products', params);
  const { data: categories } = useCatalogOptions('categories', !isRawMaterial);
  const { data: brands } = useCatalogOptions('brands', !isRawMaterial);
  const { data: suppliers } = useCatalogOptions('suppliers');

  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<ProductFormData>(EMPTY);
  const [saving, setSaving] = useState(false);
  const isComposite = supportsComposite && form.inventoryKind === 'manufactured_internal';
  const usesOpeningTotalCost = !editId && !isComposite && (
    inventoryKind === 'raw_material'
    || inventoryKind === 'ready_product'
    || form.inventoryKind === 'raw_material'
    || form.inventoryKind === 'ready_product'
  );
  const canCreate = can('gym-sales.inventory.raw_materials:create');
  const canUpdate = can('gym-sales.inventory.raw_materials:update');
  const canDelete = can('gym-sales.inventory.raw_materials:delete');

  const [inlineBomIngredients, setInlineBomIngredients] = useState<ProductListItem[]>([]);

  const { data: recipeIngredients, isFetching: bomLoading } = useQuery({
    queryKey: ['products', 'composite-bom-options', 'raw-only'],
    queryFn: async () => {
      // Avoid preparation_ingredients+raw_material combo: backend ORs in manufactured
      // composites and can crowd out base materials. Request raw_material only.
      const { data } = await api.get<PaginatedResponse<ProductListItem>>('/products', {
        params: {
          page: 1,
          pageSize: 200,
          status: 'active',
          inventoryKind: 'raw_material',
        },
      });
      return data.data
        .filter((row) => row.inventoryKind !== 'manufactured_internal')
        .sort((a, b) => a.nameAr.localeCompare(b.nameAr, 'ar'));
    },
    enabled: supportsComposite && open,
  });

  const bomIngredientOptions = useMemo(() => {
    const byId = new Map<number, ProductListItem>();
    const candidates = [
      ...(recipeIngredients ?? []),
      ...inlineBomIngredients,
      // Fallback: raw rows already visible in this tab (in case options API lags).
      ...(data?.data ?? []).filter((row) => row.inventoryKind !== 'manufactured_internal'),
    ];
    for (const row of candidates) {
      if (editId && row.id === editId) continue;
      if (row.inventoryKind === 'manufactured_internal') continue;
      byId.set(row.id, row);
    }
    return [...byId.values()]
      .sort((a, b) => a.nameAr.localeCompare(b.nameAr, 'ar'))
      .map((item) => ({
        id: item.id,
        nameAr: item.nameAr,
        nameEn: item.nameEn,
        size: item.size,
        unitOfMeasure: item.unitOfMeasure,
        costPrice: item.costPrice,
        inventorySection: item.inventorySection,
        inventoryKind: item.inventoryKind,
      }));
  }, [recipeIngredients, inlineBomIngredients, data?.data, editId]);

  const compositeCost = useMemo(() => {
    if (!isComposite) return 0;
    const options = new Map(bomIngredientOptions.map((item) => [item.id, item]));
    return (form.recipes ?? []).reduce((sum, line) => {
      const ingredient = options.get(line.ingredientId);
      if (!ingredient) return sum;
      const qty = convertCafeUnit(line.quantity, line.unit as RecipeUnit, ingredient.unitOfMeasure as RecipeUnit);
      if (qty == null) return sum;
      return sum + qty * Number(ingredient.costPrice ?? 0);
    }, 0);
  }, [form.recipes, isComposite, bomIngredientOptions]);

  const deleteMutation = useMutationWithToast(
    (id: number) => api.delete(`/products/${id}`),
    { success: ui('تم أرشفة الخامة'), invalidate: ['products'] },
  );
  const restoreMutation = useMutationWithToast(
    (id: number) => api.post(`/products/${id}/restore`),
    { success: ui('تم استعادة الخامة'), invalidate: ['products', 'suppliers'] },
  );

  const viewingArchived = params.filters.status === 'archived';

  const statusOptions = useMemo(
    () => [
      { value: 'active', label: ui('نشط') },
      { value: 'inactive', label: ui('غير نشط') },
      { value: 'archived', label: ui('مؤرشفة') },
    ],
    [ui],
  );

  const filters: FilterField[] = [
    ...(branches?.length && branches.length > 1 ? [{ key: 'branchId', label: ui('الفرع'), type: 'select' as const, options: [{ value: 'all', label: ui('كل الفروع') }, ...branches.map((branch) => ({ value: String(branch.id), label: branch.name ?? String(branch.id) }))] }] : []),
    { key: 'status', label: ui('الحالة'), type: 'select', options: statusOptions },
    { key: 'lowStock', label: ui('منخفض المخزون'), type: 'select', options: [{ value: 'true', label: ui('نعم') }] },
  ];

  const categoryOptions = (categories ?? []).map((c) => ({
    value: String(c.id),
    label: c.nameAr ?? c.name ?? '—',
  }));

  const columns = useMemo<ColumnDef<ProductListItem>[]>(
    () => [
      indexColumn(params.page, params.pageSize) as ColumnDef<ProductListItem>,
      ...(!isRawMaterial ? [{
        id: 'image',
        header: ui('الصورة'),
        cell: ({ row }) => (
          <img
            src={resolveProductImageUrl(row.original.imageUrl)}
            alt=""
            className="size-10 rounded-md border object-cover"
          />
        ),
      } as ColumnDef<ProductListItem>] : []),
      { accessorKey: 'productCode', header: ui('كود المنتج') },
      {
        accessorKey: 'nameAr',
        header: ui('الاسم'),
        cell: ({ row }) => (
          <div>
            <span>{row.original.nameAr}</span>
            {row.original.size ? <Badge variant="outline" className="ms-2 nums">{row.original.size}</Badge> : null}
            {row.original.inventoryKind === 'manufactured_internal' ? (
              <Badge variant="secondary" className="ms-2">{ui('مصنعة')}</Badge>
            ) : null}
          </div>
        ),
      },
      { accessorKey: 'unitOfMeasure', header: ui('الوحدة') },
      {
        accessorKey: 'currentStock',
        header: ui('الرصيد الحالي'),
        cell: ({ row, getValue }) => {
          if (row.original.inventoryKind === 'manufactured_internal') {
            return <span className="text-xs text-muted-foreground">{ui('من المكونات')}</span>;
          }
          const currentStock = Number((getValue() as number | undefined) ?? 0);
          const alertQuantity = Number(row.original.reorderPoint ?? row.original.minStock ?? 0);
          const isLowStock = currentStock <= alertQuantity;
          return (
            <div className="flex items-center gap-2">
              <span className={`nums ${isLowStock ? 'font-bold text-destructive' : ''}`}>
                {toArabicDigits(currentStock)}
              </span>
              {isLowStock ? <Badge variant="destructive">{ui('تنبيه شراء')}</Badge> : null}
            </div>
          );
        },
      },
      { accessorKey: 'costPrice', header: ui('متوسط التكلفة'), cell: ({ getValue }) => <span className="nums">{toArabicDigits(getValue() as number)}</span> },
      ...(isRawMaterial ? [
        {
          id: 'reorderPoint',
          header: ui('تنبيه الكمية'),
          cell: ({ row }) => (
            row.original.inventoryKind === 'manufactured_internal'
              ? <span className="text-muted-foreground">—</span>
              : <span className="nums">{toArabicDigits(Number(row.original.reorderPoint ?? 0))}</span>
          ),
        } as ColumnDef<ProductListItem>,
        { accessorKey: 'supplierName', header: ui('المورد الأساسي') } as ColumnDef<ProductListItem>,
      ] : []),
      ...(!isRawMaterial ? [{
        accessorKey: 'sellingPrice',
        header: ui('سعر البيع'),
        cell: ({ getValue }) => <span className="nums">{toArabicDigits(getValue() as number)}</span>,
      } as ColumnDef<ProductListItem>] : []),
      {
        accessorKey: 'status',
        header: ui('الحالة'),
        cell: ({ row, getValue }) => (
          row.original.isDeleted
            ? <Badge variant="secondary">{ui('مؤرشفة')}</Badge>
            : <StatusBadge status={getValue() === 'active' ? 'active' : 'suspended'} />
        ),
      },
      ...(canUpdate || canDelete ? [{
        id: 'actions',
        header: ui('الإجراءات'),
        cell: ({ row }) => {
          const archived = !!row.original.isDeleted || viewingArchived;
          return (
          <div className="flex gap-1">
            {archived && canUpdate ? (
              <Button
                variant="ghost"
                size="icon"
                aria-label={`${ui('استعادة')} ${row.original.nameAr}`}
                title={ui('استعادة الخامة')}
                onClick={() => {
                  if (window.confirm(ui(`استعادة ${row.original.nameAr} إلى القوائم النشطة؟`))) {
                    void restoreMutation.mutate(row.original.id);
                  }
                }}
              >
                <RotateCcw className="h-4 w-4 text-primary" />
              </Button>
            ) : null}
            {!archived && canUpdate ? <Button
              variant="ghost"
              size="icon"
              aria-label={`${ui('تعديل')} ${row.original.nameAr}`}
              title={`${ui('تعديل')} ${row.original.nameAr}`}
              onClick={() => {
                void (async () => {
                  setEditId(row.original.id);
                  let recipes: RecipeLine[] = [];
                  if (row.original.inventoryKind === 'manufactured_internal') {
                    try {
                      const { data } = await api.get<ProductListItem>(`/products/${row.original.id}`);
                      recipes = (data.recipes ?? []).map((line) => ({
                        ingredientId: line.ingredientId,
                        quantity: line.quantity,
                        unit: (line.unit as RecipeUnit) || 'piece',
                      }));
                    } catch {
                      recipes = [];
                    }
                  }
                  setForm({
                  nameAr: row.original.nameAr,
                  nameEn: row.original.nameEn ?? '',
                  productCode: row.original.productCode,
                  sellingPrice: row.original.sellingPrice,
                  costPrice: row.original.costPrice,
                  categoryId: row.original.categoryId ?? undefined,
                  brandId: row.original.brandId ?? undefined,
                  supplierId: row.original.supplierId ?? undefined,
                  imageUrl: row.original.imageUrl ?? '',
                  status: row.original.status,
                  barcode: '',
                  description: '',
                  size: row.original.size ?? '',
                  reorderPoint: row.original.reorderPoint,
                  applyToAllBranches: false,
                  inventoryKind: row.original.inventoryKind ?? inventoryKind ?? 'general',
                  inventorySection: row.original.inventorySection ?? inventorySection ?? 'general',
                  unitOfMeasure: row.original.unitOfMeasure,
                  minStock: row.original.reorderPoint ?? row.original.minStock ?? 0,
                  initialStock: 0,
                  initialTotalCost: 0,
                  openingBranchId: defaultOpeningBranchId,
                  currentStock: row.original.currentStock ?? 0,
                  recipes,
                });
                setOpen(true);
                })();
              }}
            >
              <Pencil className="h-4 w-4" />
            </Button> : null}
            {!archived && canDelete ? <Button
              variant="ghost"
              size="icon"
              aria-label={`${ui('أرشفة')} ${row.original.nameAr}`}
              title={`${ui('أرشفة')} ${row.original.nameAr}`}
              onClick={() => {
                if (window.confirm(ui(`هل تريد أرشفة ${row.original.nameAr}؟ ستختفي من الوصفات والمشتريات وقوائم الاختيار، مع الاحتفاظ بالحركات والفواتير للتدقيق.`))) {
                  void deleteMutation.mutate(row.original.id);
                }
              }}
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button> : null}
          </div>
          );
        },
      } as ColumnDef<ProductListItem>] : []),
    ],
    [canDelete, canUpdate, defaultOpeningBranchId, deleteMutation, isRawMaterial, params.page, params.pageSize, restoreMutation, ui, viewingArchived, inventoryKind, inventorySection],
  );

  const save = async () => {
    if (!form.nameAr.trim()) {
      toast.error(ui('اسم المنتج مطلوب'));
      return;
    }
    if (!isRawMaterial && !form.sellingPrice && form.sellingPrice !== 0) {
      toast.error(ui('سعر البيع مطلوب'));
      return;
    }
    const recipes = (form.recipes ?? []).filter((line) => line.ingredientId > 0 && line.quantity > 0);
    if (isComposite) {
      if (!recipes.length) {
        toast.error(ui('أضف مكونًا واحدًا على الأقل للخامة المصنعة'));
        return;
      }
      if (editId && recipes.some((line) => line.ingredientId === editId)) {
        toast.error(ui('لا يمكن أن تتضمن الخامة المصنعة نفسها كمكون'));
        return;
      }
    }
    const initialStock = Number(form.initialStock) || 0;
    if (!editId && !isComposite && initialStock > 0 && !form.openingBranchId) {
      toast.error(ui('اختر فرع الرصيد الافتتاحي'));
      return;
    }
    setSaving(true);
    try {
      const alertQuantity = isComposite ? 0 : Math.max(0, Number(form.minStock) || 0);
      const kind = isComposite
        ? 'manufactured_internal'
        : (form.inventoryKind ?? inventoryKind ?? 'general');
      const payload = {
        nameAr: form.nameAr,
        nameEn: form.nameEn || form.nameAr,
        productCode: form.productCode || undefined,
        ...(!isRawMaterial || !editId ? { sellingPrice: isRawMaterial || isComposite ? 0 : Number(form.sellingPrice) } : {}),
        costPrice: isComposite ? Number(compositeCost.toFixed(4)) : Number(form.costPrice) || 0,
        ...(!editId && !isComposite ? {
          initialStock,
          initialTotalCost: initialStock > 0 ? Number(form.initialTotalCost) || 0 : undefined,
          openingBranchId: form.openingBranchId || undefined,
        } : {}),
        categoryId: isRawMaterial || isComposite ? undefined : form.categoryId || undefined,
        brandId: isRawMaterial || isComposite ? undefined : form.brandId || undefined,
        supplierId: isComposite ? undefined : (form.supplierId || undefined),
        imageUrl: isRawMaterial || isComposite ? undefined : form.imageUrl || undefined,
        status: form.status,
        barcode: form.barcode || undefined,
        description: form.description || undefined,
        size: form.size?.trim() || undefined,
        reorderPoint: alertQuantity,
        applyToAllBranches: form.applyToAllBranches,
        inventoryKind: kind,
        inventorySection: inventorySection ?? form.inventorySection ?? 'general',
        unitOfMeasure: form.unitOfMeasure || 'piece',
        minStock: alertQuantity,
        ...(isComposite ? { recipes } : {}),
      };
      if (editId) await api.patch(`/products/${editId}`, payload);
      else await api.post('/products', payload);
      toast.success(ui(editId ? 'تم التحديث' : 'تم إنشاء المنتج'));
      setOpen(false);
      await Promise.all([
        refetch(),
        queryClient.invalidateQueries({ queryKey: ['suppliers'] }),
        queryClient.invalidateQueries({ queryKey: ['products'] }),
      ]);
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
      <ListPageShell
      isError={isError}
      error={error}
      isLoading={isLoading}
      onRetry={() => void refetch()}
      actions={canCreate ?
        <Button
          onClick={() => {
            setEditId(null);
            setInlineBomIngredients([]);
            setForm({
              ...EMPTY,
              inventoryKind: inventoryKind ?? 'general',
              inventorySection: inventorySection ?? 'general',
              openingBranchId: defaultOpeningBranchId,
            });
            setOpen(true);
          }}
        >
          <Plus className="ms-1 h-4 w-4" />
          {ui(createLabel ?? (inventoryKind === 'raw_material' ? 'خامة جديدة' : inventoryKind === 'ready_product' ? 'منتج جاهز جديد' : 'منتج جديد'))}
        </Button>
      : null}
    >
      <FilterBar fields={filters} searchPlaceholder={ui('بحث في الأصناف…')} />
      <DataTable
        columns={columns}
        data={data?.data ?? []}
        total={data?.total ?? 0}
        page={params.page}
        pageSize={params.pageSize}
        onPageChange={(page) => setParams({ page })}
        onPageSizeChange={(pageSize) => setParams({ pageSize, page: 1 })}
        search={params.search}
        onSearchChange={(search) => setParams({ search, page: 1 })}
        isLoading={isLoading}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="xl" className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {ui(
                isComposite
                  ? (editId ? 'تعديل خامة مصنعة' : 'خامة مصنعة جديدة')
                  : isRawMaterial
                    ? (editId ? 'تعديل خامة' : 'خامة جديدة')
                    : (editId ? 'تعديل منتج' : 'منتج جديد'),
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2 sm:grid-cols-2">
            <div className="grid gap-2 sm:col-span-2">
              <Label>{ui('الاسم (عربي)')}</Label>
              <Input value={form.nameAr} onChange={(e) => setForm((f) => ({ ...f, nameAr: e.target.value }))} />
            </div>
            {supportsComposite && (
              <div className="grid gap-2 sm:col-span-2">
                <Label>{ui('نوع الخامة')}</Label>
                <div className="grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    disabled={!!editId}
                    className={`rounded-xl border px-4 py-3 text-start transition ${
                      !isComposite ? 'border-primary bg-primary/5 ring-1 ring-primary/30' : 'border-border hover:bg-muted/40'
                    } ${editId ? 'opacity-70' : ''}`}
                    onClick={() => setForm((f) => ({
                      ...f,
                      inventoryKind: 'raw_material',
                      recipes: [],
                      costPrice: f.costPrice,
                    }))}
                  >
                    <div className="font-semibold">{ui('خامة أساسية')}</div>
                    <p className="mt-1 text-xs text-muted-foreground">{ui('مثل اللبن والسكر والبن — تُشترى مباشرة من المورد.')}</p>
                  </button>
                  <button
                    type="button"
                    disabled={!!editId}
                    className={`rounded-xl border px-4 py-3 text-start transition ${
                      isComposite ? 'border-primary bg-primary/5 ring-1 ring-primary/30' : 'border-border hover:bg-muted/40'
                    } ${editId ? 'opacity-70' : ''}`}
                    onClick={() => setForm((f) => ({
                      ...f,
                      inventoryKind: 'manufactured_internal',
                      supplierId: undefined,
                      initialStock: 0,
                      recipes: f.recipes?.length ? f.recipes : [{ ingredientId: 0, quantity: 1, unit: defaultCafeRecipeUnit(f.unitOfMeasure ?? 'piece') }],
                    }))}
                  >
                    <div className="font-semibold">{ui('خامة مصنعة / وصفة فرعية')}</div>
                    <p className="mt-1 text-xs text-muted-foreground">{ui('مثل صوص الإسبانيش — تُحضَّر من خامات أساسية ثم تُستخدم في المنتجات.')}</p>
                  </button>
                </div>
                {editId ? <p className="text-xs text-muted-foreground">{ui('لا يمكن تغيير نوع الخامة بعد الإنشاء حفاظًا على سلامة المخزون والوصفات.')}</p> : null}
              </div>
            )}
            {isRawMaterial && !isComposite && (
              <div className="grid gap-2 sm:col-span-2">
                <Label htmlFor="inventoryProductSize">{ui('المقاس / الحجم (اختياري)')}</Label>
                <Input
                  id="inventoryProductSize"
                  dir="ltr"
                  value={form.size ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, size: e.target.value }))}
                  placeholder="8 oz / 12 oz / 16 oz / Large"
                />
                <p className="text-xs text-muted-foreground">
                  {ui('سجّل كل مقاس كصنف مستقل ليكون له رصيد وتكلفة وتنبيه شراء خاص به؛ مثال: كوب ورقي — 8 oz.')}
                </p>
              </div>
            )}
            {!isRawMaterial && (
              <>
                <div className="grid gap-2">
                  <Label>{ui('الاسم (إنجليزي)')}</Label>
                  <Input value={form.nameEn} onChange={(e) => setForm((f) => ({ ...f, nameEn: e.target.value }))} />
                </div>
                <div className="grid gap-2">
                  <Label>{ui('كود المنتج')}</Label>
                  <Input
                    value={form.productCode}
                    placeholder={ui('يُولَّد تلقائياً إن تُرك فارغاً')}
                    onChange={(e) => setForm((f) => ({ ...f, productCode: e.target.value }))}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>{ui('سعر البيع')}</Label>
                  <Input
                    type="number"
                    className="nums"
                    value={form.sellingPrice}
                    onChange={(e) => setForm((f) => ({ ...f, sellingPrice: Number(e.target.value) }))}
                  />
                </div>
              </>
            )}

            {!isComposite && (
              <div className="grid gap-2">
                <Label>{ui(editId
                  ? 'تكلفة وحدة المخزون الحالية'
                  : usesOpeningTotalCost
                    ? 'إجمالي تكلفة الرصيد الافتتاحي'
                    : 'التكلفة الافتتاحية للوحدة')}</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.0001"
                  className="nums"
                  value={usesOpeningTotalCost ? (form.initialTotalCost ?? 0) : form.costPrice}
                  onChange={(e) => setForm((f) => usesOpeningTotalCost
                    ? ({ ...f, initialTotalCost: Number(e.target.value) })
                    : ({ ...f, costPrice: Number(e.target.value) }))}
                />
                {usesOpeningTotalCost ? (
                  <p className="text-xs text-muted-foreground">
                    {ui('اكتب سعر الكمية الموجودة كلها، وسيحسب النظام تكلفة الوحدة تلقائيًا.')}
                    {Number(form.initialStock) > 0 && Number(form.initialTotalCost) > 0
                      ? ` ${ui('تكلفة وحدة المخزون')}: ${(Number(form.initialTotalCost) / Number(form.initialStock)).toFixed(4)}`
                      : ''}
                  </p>
                ) : isRawMaterial && editId ? (
                  <p className="text-xs text-muted-foreground">{ui('يمكن تعديل التكلفة يدويًا، وستُستخدم في تكلفة الوصفات والتقارير القادمة.')}</p>
                ) : null}
              </div>
            )}

            {(inventoryKind === 'raw_material' || inventoryKind === 'ready_product') && !isComposite && (
              <div className="grid gap-2">
                <Label>{ui(editId ? 'الموجود حاليًا في المخزن' : 'الموجود حاليًا في المخزن (رصيد افتتاحي)')}</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.001"
                  className="nums"
                  value={editId ? (form.currentStock ?? 0) : (form.initialStock ?? 0)}
                  readOnly={!!editId}
                  onChange={(e) => setForm((f) => ({ ...f, initialStock: Number(e.target.value) }))}
                />
                {editId ? <p className="text-xs text-muted-foreground">{ui('الرصيد يتغير من المشتريات والبيع والجرد فقط.')}</p> : null}
              </div>
            )}
            {!editId && (inventoryKind === 'raw_material' || inventoryKind === 'ready_product') && !isComposite && (
              <div className="grid gap-2">
                <Label>{ui('فرع الرصيد الافتتاحي')}</Label>
                <select
                  className="rounded-md border bg-background px-3 py-2 text-sm"
                  value={form.openingBranchId ?? ''}
                  disabled={!!user?.branch && user.level !== 1}
                  onChange={(e) => setForm((f) => ({ ...f, openingBranchId: e.target.value ? Number(e.target.value) : undefined }))}
                >
                  <option value="">{ui('اختر الفرع')}</option>
                  {(branches ?? []).map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
                </select>
                <p className="text-xs text-muted-foreground">{ui('سيتم تسجيل الرصيد الافتتاحي وحركته المخزنية على هذا الفرع.')}</p>
              </div>
            )}

            <div className="grid gap-2">
              <Label>{ui(isComposite ? 'وحدة ناتج الوصفة' : 'وحدة القياس')}</Label>
              <select
                className="rounded-md border bg-background px-3 py-2 text-sm"
                value={form.unitOfMeasure ?? 'piece'}
                onChange={(e) => setForm((f) => ({ ...f, unitOfMeasure: e.target.value }))}
              >
                {CAFE_UNIT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{ui(option.label)}</option>
                ))}
              </select>
              {editId ? (
                <p className="rounded-lg border border-amber-300/60 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
                  {ui('يمكن تصحيح الوحدة الأساسية إذا لم تبدأ حركة الخامة ولم تُستخدم في وصفة. إذا وُجد رصيد أو حركة أو وصفة فسيمنع النظام الحفظ لحماية الكميات والتكلفة.')}
                </p>
              ) : isComposite ? (
                <p className="text-xs text-muted-foreground">{ui('الوصفة أدناه تُعرَّف لإنتاج وحدة واحدة بهذه الوحدة. لا يُحفظ رصيد مستقل لهذه الخامة.')}</p>
              ) : null}
            </div>
            {!isComposite && (
              <div className="grid gap-2">
                <Label>{ui('تنبيه الكمية')}</Label>
                <Input type="number" min={0} step={0.001} value={form.minStock ?? 0} onChange={(e) => setForm((f) => ({ ...f, minStock: Number(e.target.value) }))} />
                <p className="text-xs text-muted-foreground">{ui('سيظهر تنبيه شراء عندما يصبح الرصيد مساويًا لهذه الكمية أو أقل.')}</p>
              </div>
            )}

            {!isRawMaterial && (
              <>
                <div className="grid gap-2">
                  <Label>{ui('التصنيف')}</Label>
                  <select
                    className="rounded-md border bg-background px-3 py-2 text-sm"
                    value={form.categoryId ?? ''}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, categoryId: e.target.value ? Number(e.target.value) : undefined }))
                    }
                  >
                    <option value="">{ui('—')}</option>
                    {categoryOptions.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <div className="grid gap-2">
                  <Label>{ui('العلامة التجارية')}</Label>
                  <select
                    className="rounded-md border bg-background px-3 py-2 text-sm"
                    value={form.brandId ?? ''}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, brandId: e.target.value ? Number(e.target.value) : undefined }))
                    }
                  >
                    <option value="">{ui('—')}</option>
                    {(brands ?? []).map((b) => (
                      <option key={b.id} value={b.id}>{b.nameAr ?? b.name}</option>
                    ))}
                  </select>
                </div>
              </>
            )}

            {!isComposite && (
              <div className="grid gap-2">
                <Label>{ui(isRawMaterial ? 'المورد الأساسي' : 'المورد')}</Label>
                <select
                  className="rounded-md border bg-background px-3 py-2 text-sm"
                  value={form.supplierId ?? ''}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, supplierId: e.target.value ? Number(e.target.value) : undefined }))
                  }
                >
                  <option value="">{ui('—')}</option>
                  {(suppliers ?? []).map((s) => (
                    <option key={s.id} value={s.id}>{s.nameAr}</option>
                  ))}
                </select>
                {isRawMaterial ? (
                  <p className="text-xs text-muted-foreground">
                    {ui('اختيار المورد هنا يجعل الخامة تظهر تلقائيًا في مشتريات هذا المورد.')}
                  </p>
                ) : null}
              </div>
            )}

            {isComposite && (
              <div className="sm:col-span-2 space-y-4 rounded-2xl border bg-muted/10 p-4">
                <div>
                  <h3 className="font-semibold">{ui('مكونات الخامة المصنعة')}</h3>
                  <p className="text-sm text-muted-foreground">
                    {ui('حدد الخامات الأساسية وكمياتها لإنتاج وحدة واحدة من هذه الخامة المصنعة.')}
                  </p>
                </div>
                {bomLoading && !bomIngredientOptions.length ? (
                  <p className="text-sm text-muted-foreground">{ui('جاري تحميل الخامات…')}</p>
                ) : null}
                {!bomLoading && !bomIngredientOptions.length ? (
                  <p className="rounded-xl border border-dashed bg-background px-4 py-3 text-sm text-muted-foreground">
                    {ui('لا توجد خامات أساسية بعد. أضف خامة من الزر أدناه أو من قسم خامات التحضير أولًا.')}
                  </p>
                ) : null}
                <RecipeEditor
                  recipes={(form.recipes ?? []) as RecipeLine[]}
                  onChange={(recipes) => setForm((f) => ({ ...f, recipes }))}
                  ingredientOptions={bomIngredientOptions}
                  onIngredientCreated={(material) => {
                    setInlineBomIngredients((current) => [...current.filter((item) => item.id !== material.id), material]);
                  }}
                />
                <div className="grid gap-2 rounded-xl border bg-background p-4">
                  <Label>{ui('تكلفة الوحدة (محسوبة تلقائيًا)')}</Label>
                  <Input
                    type="number"
                    min={0}
                    step="0.0001"
                    className="nums"
                    value={Number(compositeCost.toFixed(4))}
                    readOnly
                  />
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{ui('من مجموع تكلفة المكونات حسب الكميات والوحدات')}</span>
                    <span className="nums font-bold text-primary">{toArabicDigits(Number(compositeCost.toFixed(4)))}</span>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  {ui('الخامة المصنعة وصفة فرعية فقط — بدون رصيد أو تنبيه كمية. عند بيع منتج يستخدمها يُخصم من الخامات الأساسية مباشرة.')}
                </p>
              </div>
            )}

            {!isRawMaterial && (
              <div className="grid gap-2 sm:col-span-2">
                <Label>{ui('صورة المنتج')}</Label>
                <p className="text-xs text-muted-foreground">
                  {ui('تظهر الصورة في شاشة البيع — اسحب صورة أو انقر للرفع')}
                </p>
                <UploadField
                  category="product-image"
                  value={form.imageUrl}
                  onChange={(path) => setForm((f) => ({ ...f, imageUrl: path ?? '' }))}
                />
                {form.imageUrl && (
                  <img
                    src={uploadUrl(form.imageUrl) ?? resolveProductImageUrl(null)}
                    alt=""
                    className="h-24 w-24 rounded-lg border object-cover"
                  />
                )}
              </div>
            )}
            {isRawMaterial && (
              <div className="grid gap-2">
                <Label>{ui('الحالة')}</Label>
                <select className="rounded-md border bg-background px-3 py-2 text-sm" value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as 'active' | 'inactive' }))}>
                  <option value="active">{ui('نشط')}</option>
                  <option value="inactive">{ui('غير نشط')}</option>
                </select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {ui('إلغاء')}
            </Button>
            <Button onClick={() => void save()} disabled={saving}>
              {ui('حفظ')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ListPageShell>
  );
}
