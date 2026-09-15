import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Edit2, Trash2, Utensils, Factory, PackageOpen, BadgeDollarSign, ChefHat, ClipboardCheck, CheckCircle2, Archive, PackageCheck } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DataTable, type PaginatedResponse } from '@/components/common/data-table';
import { ListPageShell } from '@/components/common/list-page-shell';
import { RecipeEditor, type RecipeLine } from '@/components/cafe/recipe-editor';
import { ProductVariantsEditor, type CafeVariantForm } from '@/components/cafe/product-variants-editor';
import { useLocale } from '@/store/locale';
import { api, apiError } from '@/lib/api';
import { useListQuery } from '@/lib/use-list-query';
import {
  usePaginatedList,
  useArrayResource,
  useMutationWithToast,
  useResource,
} from '@/lib/api-hooks';
import { confirm } from '@/lib/confirm';
import { toast } from 'sonner';
import type { CafeProductListItem, CafeProductDetail, CafeCategory, CafeProductType, CafeBusinessClassification, RecipeUnit } from '@/types/cafe';
import type { ProductListItem } from '@/types/inventory';
import { UploadField } from '@/components/employees/upload-fields';
import { DEFAULT_PRODUCT_IMAGE, resolveProductImageUrl } from '@/lib/product-image';
import { validateProductImageInput } from '@/lib/product-image-input';
import { CAFE_UNIT_OPTIONS, convertCafeUnit } from '@/lib/cafe-units';
import { useBranches } from '@/hooks/use-branches';
import { useAuth } from '@/store/auth';
import { usePermission } from '@/hooks/use-permission';

interface ProductFormState {
  name: string;
  productType: CafeProductType;
  businessClassification: CafeBusinessClassification | '';
  inventoryProductId: string;
  readyUnit: RecipeUnit;
  readyMinStock: number;
  initialStock: number;
  initialCost: number;
  openingBranchId?: number;
  sellPrice: number;
  categoryId: string;
  imageUrl: string;
  isActive: boolean;
  recipes: RecipeLine[];
  variantsEnabled: boolean;
  variants: CafeVariantForm[];
}

const emptyForm: ProductFormState = {
  name: '',
  productType: 'prepared',
  businessClassification: '',
  inventoryProductId: '',
  readyUnit: 'piece',
  readyMinStock: 0,
  initialStock: 0,
  initialCost: 0,
  openingBranchId: undefined,
  sellPrice: 0,
  categoryId: '',
  imageUrl: '',
  isActive: true,
  recipes: [],
  variantsEnabled: false,
  variants: [],
};

const NO_CATEGORY = '__none__';
type ProductFormTab = 'details' | 'pricing' | 'recipe' | 'review';
const PRODUCT_FORM_TABS: ProductFormTab[] = ['details', 'pricing', 'recipe', 'review'];

export function CafeProductsPage() {
  const { ui } = useLocale();
  const { can } = usePermission();
  const qc = useQueryClient();
  const user = useAuth((state) => state.user);
  const { data: branches } = useBranches();
  const { params, setParams } = useListQuery({
    pageSize: 25,
    filters: { isActive: 'true' },
  });
  const productsTab = params.filters.isActive === 'false' ? 'archived' : 'active';
  const [searchDraft, setSearchDraft] = useState(params.search);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [formTab, setFormTab] = useState<ProductFormTab>('details');
  const formContentRef = useRef<HTMLDivElement>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [previewProductCode, setPreviewProductCode] = useState('');
  const [form, setForm] = useState<ProductFormState>(emptyForm);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hydratedDetailId, setHydratedDetailId] = useState<number | null>(null);
  const [inlineIngredients, setInlineIngredients] = useState<ProductListItem[]>([]);
  const [productionProduct, setProductionProduct] = useState<CafeProductListItem | null>(null);
  const [productionBranchId, setProductionBranchId] = useState('');
  const [productionQuantity, setProductionQuantity] = useState(1);
  const [producing, setProducing] = useState(false);

  useEffect(() => {
    setSearchDraft(params.search);
  }, [params.search]);

  useEffect(() => {
    if (searchDraft === params.search) return;
    const timer = window.setTimeout(() => {
      setParams({ search: searchDraft, page: 1 });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [params.search, searchDraft, setParams]);

  const { data: listData, isLoading, isError, error, refetch } = usePaginatedList<CafeProductListItem>(
    'cafe-products',
    params,
  );
  const { data: categories } = useArrayResource<CafeCategory>('categories');
  const { data: ingredientsResp } = usePaginatedList<ProductListItem>('products', {
    page: 1,
    pageSize: 200,
    search: '',
    filters: { status: 'active', recipeIngredient: 'true' },
  });

  const effectiveProductionBranchId = productionBranchId || String(branches?.[0]?.id ?? '');
  const imageInputValidation = validateProductImageInput(form.imageUrl);
  const imagePreviewUrl = imageInputValidation.error
    ? DEFAULT_PRODUCT_IMAGE
    : resolveProductImageUrl(imageInputValidation.value);

  const detailQuery = useResource<CafeProductDetail>('cafe-products', editingId ?? undefined);

  const categoryOptions = useMemo(() => {
    const list = categories?.filter((c) => c.isActive) ?? [];
    return list.map((c) => ({ value: String(c.id), label: c.nameAr }));
  }, [categories]);

  const ingredientOptions = useMemo(() => {
    const byId = new Map([...(ingredientsResp?.data ?? []), ...inlineIngredients].map((item) => [item.id, item]));
    return [...byId.values()].map((p) => ({
      id: p.id,
      nameAr: p.nameAr,
      nameEn: p.nameEn,
      size: p.size,
      unitOfMeasure: p.unitOfMeasure,
      costPrice: p.costPrice,
      inventorySection: p.inventorySection,
      inventoryKind: p.inventoryKind,
    }));
  }, [ingredientsResp, inlineIngredients]);

  const recipeCost = useMemo(() => {
    let total = 0;
    for (const r of form.recipes) {
      if (!r.ingredientId || r.quantity <= 0) continue;
      const ing = ingredientOptions.find((p) => p.id === r.ingredientId);
      const converted = ing ? convertCafeUnit(r.quantity, r.unit, ing.unitOfMeasure) : null;
      if (ing && converted != null) total += (ing.costPrice ?? 0) * converted;
    }
    return Math.round(total * 100) / 100;
  }, [form.recipes, ingredientOptions]);

  const defaultVariant = form.variantsEnabled
    ? form.variants.find((variant) => variant.isDefault && variant.isActive)
    : undefined;
  const defaultVariantCost = useMemo(() => {
    if (!defaultVariant) return recipeCost;
    let total = 0;
    for (const recipe of defaultVariant.recipes) {
      const ingredient = ingredientOptions.find((row) => row.id === recipe.ingredientId);
      const converted = ingredient ? convertCafeUnit(recipe.quantity, recipe.unit, ingredient.unitOfMeasure) : null;
      if (ingredient && converted != null) total += (ingredient.costPrice ?? 0) * converted;
    }
    return Math.round(total * 100) / 100;
  }, [defaultVariant, ingredientOptions, recipeCost]);
  const readyOpeningUnitCost = form.initialStock > 0
    ? Math.round((form.initialCost / form.initialStock) * 10000) / 10000
    : 0;
  const effectiveSellPrice = defaultVariant?.sellPrice ?? form.sellPrice;
  const computedCost = form.productType === 'ready'
    ? (editingId ? (detailQuery.data?.cost ?? 0) : readyOpeningUnitCost)
    : defaultVariantCost;
  const computedProfit = Math.round((effectiveSellPrice - computedCost) * 100) / 100;
  const computedMargin = effectiveSellPrice > 0 ? Math.round((computedProfit / effectiveSellPrice) * 10000) / 100 : 0;
  const currentFormTabIndex = PRODUCT_FORM_TABS.indexOf(formTab);
  const selectedCategoryName = categoryOptions.find((category) => category.value === form.categoryId)?.label ?? ui('بدون فئة');
  const productTypeLabel = form.productType === 'ready'
    ? ui('منتج جاهز')
    : form.productType === 'internal'
      ? ui('مصنّع للاستخدام الداخلي')
      : ui('منتج يتم تحضيره');

  const goToNextFormTab = () => {
    if (formTab === 'details') {
      if (!form.name.trim()) {
        toast.error(ui('اكتب اسم المنتج أولاً'));
        return;
      }
      if (form.productType !== 'internal' && !form.businessClassification) {
        toast.error(ui('اختر التصنيف التجاري للمنتج'));
        return;
      }
    }
    if (formTab === 'pricing') {
      if (form.productType !== 'internal' && !form.variantsEnabled && effectiveSellPrice <= 0) {
        toast.error(ui('أدخل سعر البيع قبل المتابعة'));
        return;
      }
      if (!editingId && form.productType === 'ready' && form.sellPrice < readyOpeningUnitCost) {
        toast.error(ui('سعر البيع لا يمكن أن يكون أقل من التكلفة الافتتاحية'));
        return;
      }
      if (!editingId && form.productType === 'ready' && form.initialStock > 0 && !form.openingBranchId) {
        toast.error(ui('اختر فرع الرصيد الافتتاحي'));
        return;
      }
    }
    if (formTab === 'recipe' && form.productType !== 'ready') {
      if (form.variantsEnabled) {
        const activeVariants = form.variants.filter((variant) => variant.isActive);
        if (!activeVariants.length || activeVariants.filter((variant) => variant.isDefault).length !== 1) {
          toast.error(ui('أضف اختيارًا نشطًا وحدد اختيارًا افتراضيًا واحدًا'));
          return;
        }
        if (activeVariants.some((variant) => !variant.name.trim() || variant.sellPrice <= 0 || !variant.recipes.length)) {
          toast.error(ui('أكمل اسم وسعر ووصفة كل حجم أو نوع'));
          return;
        }
      } else if (!form.recipes.length) {
        toast.error(ui('يجب إضافة مكونات الوصفة'));
        return;
      }
    }
    setFormTab(PRODUCT_FORM_TABS[Math.min(currentFormTabIndex + 1, PRODUCT_FORM_TABS.length - 1)]);
  };

  const openCreate = () => {
    setEditingId(null);
    setHydratedDetailId(null);
    setForm({ ...emptyForm, openingBranchId: user?.branch || branches?.[0]?.id });
    setFormTab('details');
    setPreviewProductCode('');
    setDialogOpen(true);
    void api.get<{ productCode: string }>('/cafe-products/next-code').then(({ data }) => {
      setPreviewProductCode(data.productCode);
    }).catch(() => setPreviewProductCode(''));
  };

  const openEdit = (row: CafeProductListItem) => {
    setEditingId(row.id);
    setHydratedDetailId(null);
    setPreviewProductCode(row.productCode);
    setForm({
      name: row.name,
      productType: row.productType,
      businessClassification: row.businessClassification ?? '',
      inventoryProductId: row.inventoryProductId ? String(row.inventoryProductId) : '',
      readyUnit: 'piece',
      readyMinStock: 0,
      initialStock: 0,
      initialCost: row.cost,
      openingBranchId: user?.branch || branches?.[0]?.id,
      sellPrice: row.sellPrice,
      categoryId: row.categoryId ? String(row.categoryId) : '',
      imageUrl: row.imageUrl ?? '',
      isActive: row.isActive,
      recipes: [],
      variantsEnabled: row.variantCount > 0,
      variants: [],
    });
    setFormTab('details');
    setDialogOpen(true);
  };

  const detail = detailQuery.data;
  useEffect(() => {
    formContentRef.current?.scrollTo({ top: 0 });
  }, [formTab]);

  useEffect(() => {
    if (!dialogOpen || !editingId || !detail || hydratedDetailId === editingId) return;
    setForm((f) => ({
      ...f,
      readyUnit: (detail.inventoryProduct?.unitOfMeasure as RecipeUnit | undefined) ?? f.readyUnit,
      readyMinStock: detail.inventoryProduct?.minStock ?? f.readyMinStock,
      recipes: detail.recipes.map((r) => ({
        ingredientId: r.ingredientId,
        quantity: r.quantity,
        unit: r.unit as RecipeUnit,
      })),
      variantsEnabled: detail.variants.some((variant) => variant.isActive),
      variants: detail.variants.filter((variant) => variant.isActive).map((variant) => ({
        id: variant.id,
        name: variant.name,
        variantCode: variant.variantCode ?? '',
        sellPrice: variant.sellPrice,
        isDefault: variant.isDefault,
        isActive: variant.isActive,
        recipes: (variant.recipes ?? []).map((recipe) => ({
          ingredientId: recipe.ingredientId,
          quantity: recipe.quantity,
          unit: recipe.unit,
        })),
      })),
    }));
    setHydratedDetailId(editingId);
  }, [detail, dialogOpen, editingId, hydratedDetailId]);

  const saveMutation = useMutationWithToast(
    async (vars: { id?: number; body: ProductFormState }) => {
      const payload = {
        name: vars.body.name,
        productType: vars.body.productType,
        businessClassification: vars.body.productType === 'internal' ? undefined : vars.body.businessClassification || undefined,
        inventoryProductId: vars.body.productType !== 'prepared' && vars.body.inventoryProductId ? Number(vars.body.inventoryProductId) : undefined,
        readyUnit: vars.body.productType !== 'prepared' ? vars.body.readyUnit : undefined,
        readyMinStock: vars.body.productType !== 'prepared' ? Number(vars.body.readyMinStock) : undefined,
        initialStock: !vars.id && vars.body.productType === 'ready' ? Number(vars.body.initialStock) : undefined,
        initialTotalCost: !vars.id && vars.body.productType === 'ready' && Number(vars.body.initialStock) > 0
          ? Number(vars.body.initialCost)
          : undefined,
        openingBranchId: !vars.id && vars.body.productType === 'ready' ? vars.body.openingBranchId : undefined,
        sellPrice: vars.body.productType === 'internal' ? 0 : Number(vars.body.variantsEnabled
          ? vars.body.variants.find((variant) => variant.isDefault)?.sellPrice ?? vars.body.sellPrice
          : vars.body.sellPrice),
        categoryId: vars.body.categoryId ? Number(vars.body.categoryId) : undefined,
        imageUrl: vars.body.imageUrl || undefined,
        isActive: vars.body.isActive,
        recipes: vars.body.productType !== 'ready' && !vars.body.variantsEnabled ? vars.body.recipes?.map((r) => ({
          ingredientId: r.ingredientId,
          quantity: Number(r.quantity),
          unit: r.unit,
        })) : [],
        variants: vars.body.productType === 'prepared' && vars.body.variantsEnabled
          ? vars.body.variants.map((variant) => ({
              id: variant.id,
              name: variant.name,
              variantCode: variant.variantCode || undefined,
              sellPrice: Number(variant.sellPrice),
              isDefault: variant.isDefault,
              isActive: variant.isActive,
              recipes: variant.recipes.map((recipe) => ({
                ingredientId: recipe.ingredientId,
                quantity: Number(recipe.quantity),
                unit: recipe.unit,
              })),
            }))
          : [],
      };
      if (vars.id) {
        await api.put(`/cafe-products/${vars.id}`, payload);
      } else {
        await api.post('/cafe-products', payload);
      }
    },
    {
      success: editingId ? ui('تم تحديث المنتج') : ui('تم إضافة المنتج'),
      invalidate: ['cafe-products'],
      onSuccess: () => {
        setDialogOpen(false);
        setForm(emptyForm);
        setEditingId(null);
        void qc.invalidateQueries({ queryKey: ['cafe-products'] });
        void qc.invalidateQueries({ queryKey: ['products'] });
      },
    },
  );

  const permanentDeleteMutation = useMutationWithToast(
    async (id: number) => {
      await api.delete(`/cafe-products/${id}`);
    },
    { success: ui('تم حذف المنتج نهائيًا'), invalidate: ['cafe-products', 'products'] },
  );

  const statusMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      const { data } = await api.patch<{ id: number; isActive: boolean }>(
        `/cafe-products/${id}/status`,
        { isActive },
      );
      return data;
    },
    onSuccess: (_, variables) => {
      toast.success(variables.isActive ? ui('تم تنشيط المنتج') : ui('تم نقل المنتج إلى الأرشيف'));
      qc.setQueriesData<PaginatedResponse<CafeProductListItem>>(
        { queryKey: ['cafe-products'] },
        (current) => {
          if (!current?.data.some((product) => product.id === variables.id)) return current;
          return {
            ...current,
            data: current.data.filter((product) => product.id !== variables.id),
            total: Math.max(0, current.total - 1),
          };
        },
      );
      void qc.invalidateQueries({ queryKey: ['cafe-products'] });
      void qc.invalidateQueries({ queryKey: ['products'] });
    },
    onError: (err) => toast.error(apiError(err)),
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formTab !== 'review') {
      goToNextFormTab();
      return;
    }
    if (imageInputValidation.error) {
      setFormTab('details');
      toast.error(ui('أدخل رابط صورة آمن يبدأ بـ https://'));
      return;
    }
    if (!form.name.trim()) {
      toast.error(ui('اسم المنتج مطلوب'));
      return;
    }
    if (form.productType !== 'internal' && effectiveSellPrice <= 0) {
      toast.error(ui('سعر البيع يجب أن يكون موجباً'));
      return;
    }
    if (!editingId && form.productType === 'ready' && form.sellPrice < readyOpeningUnitCost) {
      toast.error(ui('سعر البيع لا يمكن أن يكون أقل من التكلفة الافتتاحية'));
      return;
    }
    if (!editingId && form.productType === 'ready' && form.initialStock > 0 && !form.openingBranchId) {
      toast.error(ui('اختر فرع الرصيد الافتتاحي'));
      return;
    }
    if (form.productType === 'prepared' && form.variantsEnabled) {
      const activeVariants = form.variants.filter((variant) => variant.isActive);
      if (!activeVariants.length || activeVariants.filter((variant) => variant.isDefault).length !== 1) {
        toast.error(ui('أضف اختيارًا نشطًا وحدد اختيارًا افتراضيًا واحدًا'));
        return;
      }
      if (activeVariants.some((variant) => !variant.name.trim() || variant.sellPrice <= 0 || !variant.recipes.length)) {
        toast.error(ui('أكمل اسم وسعر ووصفة كل حجم أو نوع'));
        return;
      }
    }
    if (form.productType !== 'ready' && !form.variantsEnabled && form.recipes.length === 0) {
      toast.error(ui('يجب إضافة مكونات الوصفة'));
      return;
    }
    const recipesToValidate = form.variantsEnabled
      ? form.variants.flatMap((variant) => variant.recipes)
      : form.recipes;
    const invalid = form.productType !== 'ready' && recipesToValidate.some((r) => !r.ingredientId || r.quantity <= 0);
    if (invalid) {
      toast.error(ui('كل مكون يجب أن يكون له عنصر وكمية موجبة'));
      return;
    }
    setIsSubmitting(true);
    try {
      await saveMutation.mutateAsync({
        id: editingId ?? undefined,
        body: { ...form, imageUrl: imageInputValidation.value },
      });
    } catch (err) {
      toast.error(apiError(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePermanentDelete = async (row: CafeProductListItem) => {
    const ok = await confirm({
      title: ui('حذف المنتج نهائيًا'),
      description: `${ui('سيتم حذف')} "${row.name}" ${ui('نهائيًا. لن يُسمح بالحذف إذا كان له سجل مبيعات سابق.')}`,
      variant: 'destructive',
    });
    if (ok) permanentDeleteMutation.mutate(row.id);
  };

  const columns = useMemo(
    () => [
      { header: ui('الكود'), accessorKey: 'productCode' },
      { header: ui('الاسم'), accessorKey: 'name' },
      { header: ui('الفئة'), accessorKey: 'categoryName' },
      {
        header: ui('النوع'),
        accessorKey: 'productType',
        cell: ({ row }: { row: { original: CafeProductListItem } }) =>
          row.original.productType === 'ready'
            ? ui('منتج جاهز')
            : row.original.productType === 'internal'
              ? ui('مصنّع للاستخدام الداخلي')
              : ui('منتج يتم تحضيره'),
      },
      { header: ui('التكلفة'), accessorKey: 'cost' },
      { header: ui('سعر البيع'), accessorKey: 'sellPrice' },
      { header: ui('الربح'), accessorKey: 'profit' },
      { header: ui('هامش الربح %'), accessorKey: 'marginPercentage' },
      {
        header: ui('الأحجام والأنواع'),
        accessorKey: 'variantCount',
        cell: ({ row }: { row: { original: CafeProductListItem } }) => row.original.variantCount > 0
          ? <span className="rounded-full bg-primary/10 px-2 py-1 text-xs font-medium text-primary">{row.original.variantCount} {ui('اختيار')}</span>
          : <span className="text-xs text-muted-foreground">{ui('بدون اختيارات')}</span>,
      },
      {
        header: ui('الوصفات'),
        accessorKey: 'recipeCount',
        cell: ({ row }: { row: { original: CafeProductListItem } }) => (
          <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
            <Utensils className="size-3.5" />
            {row.original.recipeCount}
          </span>
        ),
      },
      {
        header: ui('الحالة'),
        accessorKey: 'isActive',
        cell: ({ row }: { row: { original: CafeProductListItem } }) => {
          const product = row.original;
          const isChanging = statusMutation.isPending && statusMutation.variables?.id === product.id;
          return can('club.cafe.products:update') ? (
            <div className="flex min-w-24 items-center gap-2">
              <Switch
                checked={product.isActive}
                disabled={isChanging}
                onCheckedChange={(isActive) => statusMutation.mutate({ id: product.id, isActive })}
                aria-label={product.isActive ? ui('تعطيل المنتج') : ui('تنشيط المنتج')}
              />
              <span className={product.isActive ? 'text-xs font-semibold text-success' : 'text-xs text-muted-foreground'}>
                {product.isActive ? ui('نشط') : ui('معطل')}
              </span>
            </div>
          ) : (
            <span
              className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                product.isActive ? 'bg-success/12 text-success' : 'bg-muted text-muted-foreground'
              }`}
            >
              {product.isActive ? ui('نشط') : ui('معطل')}
            </span>
          );
        },
      },
      {
        header: ui('إجراءات'),
        id: 'actions',
        cell: ({ row }: { row: { original: CafeProductListItem } }) => (
          <div className="flex items-center gap-1">
            {row.original.isActive && row.original.productType === 'internal' && can('club.cafe.products:update') && (
              <Button variant="ghost" size="icon" title={ui('تصنيع دفعة')} onClick={() => setProductionProduct(row.original)}>
                <Factory className="size-4" />
              </Button>
            )}
            {can('club.cafe.products:update') ? <Button variant="ghost" size="icon" onClick={() => openEdit(row.original)}>
              <Edit2 className="size-4" />
            </Button> : null}
            {!row.original.isActive && can('club.cafe.products:delete') ? <Button
              variant="ghost"
              size="icon"
              className="text-destructive"
              title={ui('حذف نهائي')}
              disabled={permanentDeleteMutation.isPending}
              onClick={() => handlePermanentDelete(row.original)}
            >
              <Trash2 className="size-4" />
            </Button> : null}
          </div>
        ),
      },
    ],
    [can, permanentDeleteMutation.isPending, statusMutation.isPending, statusMutation.variables, ui],
  );

  const productsTable = (
    <DataTable
      columns={columns}
      data={listData?.data ?? []}
      total={listData?.total ?? 0}
      page={params.page}
      pageSize={params.pageSize}
      onPageChange={(page) => setParams({ page })}
      onPageSizeChange={(pageSize) => setParams({ pageSize, page: 1 })}
      isLoading={isLoading}
      isError={isError}
      errorMessage={apiError(error)}
      onRetry={refetch}
      search={searchDraft}
      onSearchChange={setSearchDraft}
      searchPlaceholder={ui('بحث بالاسم أو الكود…')}
      enableExport
    />
  );

  return (
    <ListPageShell
      title={ui('منتجات الكافيه')}
      description={ui('إدارة منتجات الكافيه والوصفات المرتبطة بها')}
      actions={
        can('club.cafe.products:create') ? <Button onClick={openCreate}>
          <Plus className="me-2 size-4" />
          {ui('منتج جديد')}
        </Button> : null
      }
      isLoading={isLoading}
      isError={isError}
      error={error}
      onRetry={refetch}
    >
      <Tabs
        value={productsTab}
        onValueChange={(value) => setParams({
          page: 1,
          filters: { isActive: value === 'archived' ? 'false' : 'true' },
        })}
        dir="rtl"
        className="space-y-4"
      >
        <TabsList className="grid h-auto w-full max-w-xl grid-cols-2 gap-2 rounded-2xl bg-muted/60 p-2">
          <TabsTrigger value="active" className="gap-2 rounded-xl py-2.5">
            <PackageCheck className="size-4" />
            {ui('المنتجات النشطة')}
          </TabsTrigger>
          <TabsTrigger value="archived" className="gap-2 rounded-xl py-2.5">
            <Archive className="size-4" />
            {ui('المنتجات المعطلة / الأرشيف')}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="active" className="mt-0">
          {productsTab === 'active' ? productsTable : null}
        </TabsContent>
        <TabsContent value="archived" className="mt-0">
          {productsTab === 'archived' ? productsTable : null}
        </TabsContent>
      </Tabs>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent size="xl" className="h-[min(90vh,850px)] overflow-hidden">
          <DialogHeader>
            <DialogTitle>{editingId ? ui('تعديل منتج الكافيه') : ui('منتج كافيه جديد')}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col gap-4">
            <Tabs value={formTab} onValueChange={(value) => setFormTab(value as ProductFormTab)} dir="rtl" className="flex min-h-0 flex-1 flex-col">
              <TabsList className="grid h-auto w-full grid-cols-2 gap-2 rounded-2xl bg-muted/60 p-2 lg:grid-cols-4">
                {([
                  ['details', PackageOpen, ui('البيانات الأساسية')],
                  ['pricing', BadgeDollarSign, ui('التسعير والمخزون')],
                  ['recipe', ChefHat, ui('الوصفة والأحجام')],
                  ['review', ClipboardCheck, ui('المراجعة والحفظ')],
                ] as const).map(([value, Icon, label], index) => (
                  <TabsTrigger key={value} value={value} className="group h-12 gap-2 rounded-xl data-[state=active]:shadow-sm">
                    <span className="grid size-7 shrink-0 place-items-center rounded-full bg-background text-xs font-bold text-muted-foreground shadow-sm group-data-[state=active]:bg-primary group-data-[state=active]:text-primary-foreground">{index + 1}</span>
                    <Icon className="hidden size-4 sm:block" />
                    <span className="text-xs sm:text-sm">{label}</span>
                  </TabsTrigger>
                ))}
              </TabsList>

              <div ref={formContentRef} className="mt-4 min-h-0 flex-1 overflow-y-auto px-1 pb-2">
                <TabsContent value="details" className="mt-0 space-y-5">
                  <div className="rounded-2xl border bg-gradient-to-l from-primary/[0.07] to-transparent p-4">
                    <h3 className="font-bold">{ui('عرّف المنتج مرة واحدة')}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{ui('الاسم والصورة والنوع هي البيانات التي سيشاهدها المستخدم في الإدارة ونقطة البيع.')}</p>
                  </div>
                  <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_220px]">
                    <div className="space-y-4">
                      {previewProductCode ? (
                        <div className="space-y-2">
                          <Label>{ui('كود المنتج')}</Label>
                          <Input className="nums bg-muted/60" dir="ltr" value={previewProductCode} readOnly />
                        </div>
                      ) : null}
                      <div className="space-y-2">
                        <Label htmlFor="cafe-product-name">{ui('اسم المنتج')}</Label>
                        <Input id="cafe-product-name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder={ui('مثال: لاتيه أو زجاجة مياه')} autoFocus />
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label>{ui('نوع المنتج')}</Label>
                          <Select value={form.productType} disabled={!!editingId} onValueChange={(value: CafeProductType) => setForm({
                            ...form,
                            productType: value,
                            recipes: value === 'ready' ? [] : form.recipes,
                            variantsEnabled: value === 'prepared' ? form.variantsEnabled : false,
                            variants: value === 'prepared' ? form.variants : [],
                            inventoryProductId: value === 'prepared' ? '' : form.inventoryProductId,
                            sellPrice: value === 'internal' ? 0 : form.sellPrice,
                          })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="prepared">{ui('منتج يتم تحضيره')}</SelectItem>
                              <SelectItem value="internal">{ui('منتج يتم تصنيعه للاستخدام الداخلي')}</SelectItem>
                              <SelectItem value="ready">{ui('منتج جاهز — يُباع مباشرة')}</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>{ui('الفئة')}</Label>
                          <Select value={form.categoryId || NO_CATEGORY} onValueChange={(value) => setForm({ ...form, categoryId: value === NO_CATEGORY ? '' : value })}>
                            <SelectTrigger><SelectValue placeholder={ui('اختر فئة')} /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value={NO_CATEGORY}>{ui('بدون فئة')}</SelectItem>
                              {categoryOptions.map((category) => <SelectItem key={category.value} value={category.value}>{category.label}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        {form.productType !== 'internal' ? <div className="space-y-2 sm:col-span-2">
                          <Label>{ui('التصنيف التجاري')}</Label>
                          <Select value={form.businessClassification || undefined} onValueChange={(value: CafeBusinessClassification) => setForm({ ...form, businessClassification: value })}>
                            <SelectTrigger><SelectValue placeholder={ui('اختر Protein أو Bar')} /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="protein">Protein — {ui('يُحتسب في التارجت')}</SelectItem>
                              <SelectItem value="bar">Bar — {ui('لا يُحتسب في التارجت')}</SelectItem>
                            </SelectContent>
                          </Select>
                          <p className="text-xs text-muted-foreground">{ui('التصنيف حقيقة تشغيلية محفوظة؛ اسم المنتج لا يغيّرها.')}</p>
                        </div> : null}
                      </div>
                      <div className="flex items-center justify-between rounded-xl border bg-card p-4">
                        <div>
                          <Label htmlFor="isActive" className="font-semibold">{ui('متاح للاستخدام')}</Label>
                          <p className="mt-1 text-xs text-muted-foreground">{ui('عند تعطيله لن يظهر المنتج للكاشير.')}</p>
                        </div>
                        <Switch id="isActive" checked={form.isActive} onCheckedChange={(checked) => setForm({ ...form, isActive: checked })} />
                      </div>
                    </div>
                    <div className="space-y-3 rounded-2xl border bg-muted/20 p-3">
                      <img
                        src={imagePreviewUrl}
                        alt={form.name || ui('صورة المنتج')}
                        className="aspect-square w-full rounded-xl border bg-background object-cover"
                        onError={(event) => {
                          event.currentTarget.onerror = null;
                          event.currentTarget.src = DEFAULT_PRODUCT_IMAGE;
                        }}
                      />
                      <UploadField category="product-image" value={form.imageUrl} onChange={(path) => setForm((current) => ({ ...current, imageUrl: path ?? '' }))} accept="image/*" label={ui('اختيار صورة المنتج')} />
                      <div className="space-y-1.5 border-t border-border/60 pt-3">
                        <Label htmlFor="cafe-product-image-url" className="text-xs font-semibold">
                          {ui('أو الصق رابط الصورة')}
                        </Label>
                        <Input
                          id="cafe-product-image-url"
                          dir="ltr"
                          inputMode="url"
                          autoComplete="url"
                          value={form.imageUrl}
                          aria-invalid={imageInputValidation.error === 'invalid'}
                          aria-describedby="cafe-product-image-url-help"
                          className={imageInputValidation.error ? 'border-destructive focus-visible:ring-destructive' : ''}
                          placeholder="https://example.com/product.jpg"
                          onChange={(event) => setForm((current) => ({ ...current, imageUrl: event.target.value }))}
                          onBlur={() => {
                            if (!imageInputValidation.error && imageInputValidation.value !== form.imageUrl) {
                              setForm((current) => ({ ...current, imageUrl: imageInputValidation.value }));
                            }
                          }}
                        />
                        <p
                          id="cafe-product-image-url-help"
                          className={`text-xs ${imageInputValidation.error ? 'text-destructive' : 'text-muted-foreground'}`}
                        >
                          {imageInputValidation.error
                            ? ui('الرابط غير صالح. استخدم رابطًا يبدأ بـ https://')
                            : ui('يمكنك لصق رابط مباشر للصورة بدل رفع ملف.')}
                        </p>
                      </div>
                      <p className="text-center text-xs text-muted-foreground">{ui('تظهر الصورة في شاشة البيع.')}</p>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="pricing" className="mt-0 space-y-5">
                  <div className="rounded-2xl border bg-gradient-to-l from-emerald-500/[0.08] to-transparent p-4">
                    <h3 className="font-bold">{ui('حدد طريقة البيع وحركة المخزون')}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{ui('كل قيمة هنا تؤثر مباشرة على السعر أو الرصيد أو تنبيه الشراء.')}</p>
                  </div>

                  {form.productType === 'prepared' ? (
                    <div className="flex items-center justify-between gap-4 rounded-2xl border bg-card p-4 shadow-sm">
                      <div>
                        <Label htmlFor="variantsEnabled" className="font-bold">{ui('للمنتج أحجام أو أنواع')}</Label>
                        <p className="mt-1 text-sm text-muted-foreground">{ui('فعّله للـ Regular / Large أو Single / Double؛ كل اختيار سيكون له سعر ووصفة خاصة.')}</p>
                      </div>
                      <Switch id="variantsEnabled" checked={form.variantsEnabled} onCheckedChange={(checked) => setForm((current) => {
                        if (checked) return {
                          ...current,
                          variantsEnabled: true,
                          variants: current.variants.length ? current.variants : [{
                            name: ui('Regular'), variantCode: 'REGULAR', sellPrice: current.sellPrice, isDefault: true, isActive: true,
                            recipes: current.recipes.map((recipe) => ({ ...recipe })),
                          }],
                        };
                        const fallback = current.variants.find((variant) => variant.isDefault) ?? current.variants[0];
                        return { ...current, variantsEnabled: false, sellPrice: fallback?.sellPrice ?? current.sellPrice, recipes: fallback?.recipes.map((recipe) => ({ ...recipe })) ?? current.recipes };
                      })} />
                    </div>
                  ) : null}

                  {form.productType !== 'internal' && !form.variantsEnabled ? (
                    <div className="mx-auto max-w-xl space-y-3 rounded-2xl border border-primary/25 bg-primary/[0.04] p-5">
                      <Label htmlFor="cafeProductSellPrice" className="text-base font-bold">{ui('سعر البيع')}</Label>
                      <div className="relative">
                        <Input id="cafeProductSellPrice" dir="ltr" inputMode="decimal" className="nums h-14 pe-16 text-end text-2xl font-black" type="number" min={0.01} step={0.01} value={effectiveSellPrice} onChange={(event) => setForm((current) => ({ ...current, sellPrice: Number(event.target.value) }))} placeholder={ui('أدخل سعر البيع')} required />
                        <span className="absolute end-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">{ui('ج.م')}</span>
                      </div>
                      <p className="text-sm text-muted-foreground">{ui('هذا هو السعر الذي سيظهر للكاشير في نقطة البيع.')}</p>
                    </div>
                  ) : null}

                  {form.productType === 'prepared' && form.variantsEnabled ? (
                    <div className="rounded-2xl border border-primary/25 bg-primary/[0.04] p-5 text-center">
                      <BadgeDollarSign className="mx-auto size-8 text-primary" />
                      <p className="mt-2 font-bold text-primary">{ui('سيُحدد سعر مستقل لكل حجم أو نوع')}</p>
                      <p className="mt-1 text-sm text-muted-foreground">{ui('انتقل إلى «الوصفة والأحجام» لإضافة الخيارات والأسعار والمقادير.')}</p>
                    </div>
                  ) : null}

                  {form.productType !== 'prepared' ? (
                    <div className="grid gap-4 sm:grid-cols-2">
                      {form.productType === 'ready' ? <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 sm:col-span-2 dark:border-emerald-900 dark:bg-emerald-950/20 dark:text-emerald-200">{ui('سيُنشأ تلقائيًا ضمن المنتجات الجاهزة، ويظهر للموردين والمشتريات والمخزون.')}</p> : null}
                      <div className="space-y-2">
                        <Label>{ui(form.productType === 'internal' ? 'وحدة ناتج التصنيع' : 'وحدة المخزون')}</Label>
                        <Select value={form.readyUnit} onValueChange={(value) => setForm({ ...form, readyUnit: value as RecipeUnit })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>{CAFE_UNIT_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{ui(option.label)}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>{ui('تنبيه الكمية')}</Label>
                        <Input className="nums" type="number" min={0} value={form.readyMinStock} onChange={(event) => setForm({ ...form, readyMinStock: Number(event.target.value) })} />
                        <p className="text-xs text-muted-foreground">{ui('يظهر تنبيه شراء عندما يصل الرصيد لهذه الكمية أو أقل.')}</p>
                      </div>
                    </div>
                  ) : null}

                  {form.productType === 'ready' && !editingId ? (
                    <div className="grid gap-4 rounded-2xl border bg-muted/20 p-5 sm:grid-cols-2">
                      <div className="space-y-2"><Label>{ui('الرصيد الافتتاحي')}</Label><Input className="nums" type="number" min={0} step="0.001" value={form.initialStock} onChange={(event) => setForm({ ...form, initialStock: Number(event.target.value) })} /></div>
                      <div className="space-y-2">
                        <Label>{ui('إجمالي تكلفة الرصيد الافتتاحي')}</Label>
                        <Input className="nums" type="number" min={0} step="0.01" value={form.initialCost} onChange={(event) => setForm({ ...form, initialCost: Number(event.target.value) })} />
                        <p className="text-xs text-muted-foreground">
                          {ui('اكتب سعر الكمية الموجودة كلها، وسيحسب النظام تكلفة وحدة المخزون تلقائيًا.')}
                          {form.initialStock > 0 && form.initialCost > 0
                            ? ` ${ui('تكلفة وحدة المخزون')}: ${readyOpeningUnitCost.toFixed(4)}`
                            : ''}
                        </p>
                      </div>
                      <div className="space-y-2 sm:col-span-2">
                        <Label>{ui('فرع الرصيد الافتتاحي')}</Label>
                        <Select value={form.openingBranchId ? String(form.openingBranchId) : undefined} disabled={!!user?.branch && user.level !== 1} onValueChange={(value) => setForm({ ...form, openingBranchId: Number(value) })}>
                          <SelectTrigger><SelectValue placeholder={ui('اختر الفرع')} /></SelectTrigger>
                          <SelectContent>{(branches ?? []).map((branch) => <SelectItem key={branch.id} value={String(branch.id)}>{branch.name}</SelectItem>)}</SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">{ui('يُسجل الرصيد والحركة الافتتاحية على هذا الفرع.')}</p>
                      </div>
                    </div>
                  ) : null}

                  {form.productType === 'internal' ? <div className="rounded-2xl border border-dashed p-5 text-sm text-muted-foreground">{ui('هذا المنتج لا يملك سعر بيع ولا يظهر في نقطة البيع. بعد تصنيع دفعة منه سيُضاف للمخزون ويُستخدم في وصفات أخرى.')}</div> : null}
                </TabsContent>

                <TabsContent value="recipe" className="mt-0 space-y-5">
                  <div className="rounded-2xl border bg-gradient-to-l from-amber-500/[0.09] to-transparent p-4">
                    <h3 className="font-bold">{form.variantsEnabled ? ui('أضف الأحجام وأسعارها ومقاديرها') : ui('كوّن وصفة المنتج')}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{form.variantsEnabled ? ui('كل حجم مستقل في السعر والمقادير، والتكلفة والربح يحسبان تلقائيًا.') : ui('اختر المكونات بالوحدة المناسبة وسيتم حساب التكلفة تلقائيًا.')}</p>
                  </div>
                  {form.productType === 'ready' ? (
                    <div className="grid min-h-56 place-items-center rounded-2xl border border-dashed bg-muted/10 p-8 text-center">
                      <div><CheckCircle2 className="mx-auto size-10 text-emerald-500" /><h3 className="mt-3 font-bold">{ui('لا يحتاج إلى وصفة')}</h3><p className="mt-1 text-sm text-muted-foreground">{ui('المنتج الجاهز يُشترى ويُباع كوحدة مخزنية مباشرة.')}</p></div>
                    </div>
                  ) : form.productType === 'prepared' && form.variantsEnabled ? (
                    <ProductVariantsEditor variants={form.variants} onChange={(variants) => setForm((current) => ({ ...current, variants }))} ingredientOptions={ingredientOptions} disabled={isSubmitting} onIngredientCreated={(material) => setInlineIngredients((current) => [...current.filter((item) => item.id !== material.id), material])} />
                  ) : (
                    <RecipeEditor recipes={form.recipes} onChange={(recipes) => setForm((current) => ({ ...current, recipes }))} ingredientOptions={ingredientOptions} disabled={isSubmitting} onIngredientCreated={(material) => setInlineIngredients((current) => [...current.filter((item) => item.id !== material.id), material])} />
                  )}
                </TabsContent>

                <TabsContent value="review" className="mt-0 space-y-5">
                  <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950/20 dark:text-emerald-100">
                    <span className="grid size-10 shrink-0 place-items-center rounded-full bg-emerald-500 text-white"><ClipboardCheck className="size-5" /></span>
                    <div><h3 className="font-bold">{ui('راجع المنتج قبل الحفظ')}</h3><p className="mt-1 text-sm opacity-75">{ui('هذه هي الصورة النهائية التي ستُحفظ وتظهر في نقطة البيع والمخزون.')}</p></div>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
                    <section className="rounded-2xl border bg-card p-5 shadow-sm">
                      <div className="flex items-center gap-4">
                        <img
                          src={imagePreviewUrl}
                          alt=""
                          className="size-24 rounded-2xl border bg-muted object-cover"
                          onError={(event) => {
                            event.currentTarget.onerror = null;
                            event.currentTarget.src = DEFAULT_PRODUCT_IMAGE;
                          }}
                        />
                        <div className="min-w-0"><p className="text-xs text-muted-foreground nums">{previewProductCode || '—'}</p><h3 className="mt-1 truncate text-xl font-black">{form.name || ui('لم يُكتب اسم المنتج')}</h3><div className="mt-2 flex flex-wrap gap-2"><Badge variant="outline">{productTypeLabel}</Badge><Badge variant="outline">{selectedCategoryName}</Badge>{form.businessClassification ? <Badge variant="outline">{form.businessClassification === 'protein' ? 'Protein' : 'Bar'}</Badge> : null}<Badge variant={form.isActive ? 'success' : 'secondary'}>{form.isActive ? ui('نشط') : ui('معطل')}</Badge></div></div>
                      </div>
                      <dl className="mt-5 grid gap-3 sm:grid-cols-2">
                        <div className="rounded-xl bg-muted/45 p-3"><dt className="text-xs text-muted-foreground">{ui('طريقة التسعير')}</dt><dd className="mt-1 font-semibold">{form.variantsEnabled ? `${form.variants.filter((variant) => variant.isActive).length} ${ui('أحجام/أنواع بأسعار مستقلة')}` : form.productType === 'internal' ? ui('غير مخصص للبيع') : ui('سعر واحد')}</dd></div>
                        <div className="rounded-xl bg-muted/45 p-3"><dt className="text-xs text-muted-foreground">{ui('الوصفة')}</dt><dd className="mt-1 font-semibold">{form.productType === 'ready' ? ui('لا توجد — منتج جاهز') : form.variantsEnabled ? `${form.variants.reduce((sum, variant) => sum + variant.recipes.length, 0)} ${ui('مكوّن عبر الاختيارات')}` : `${form.recipes.length} ${ui('مكوّن')}`}</dd></div>
                        {form.productType !== 'prepared' ? <><div className="rounded-xl bg-muted/45 p-3"><dt className="text-xs text-muted-foreground">{ui('وحدة المخزون')}</dt><dd className="mt-1 font-semibold">{CAFE_UNIT_OPTIONS.find((option) => option.value === form.readyUnit)?.label ?? form.readyUnit}</dd></div><div className="rounded-xl bg-muted/45 p-3"><dt className="text-xs text-muted-foreground">{ui('تنبيه الكمية')}</dt><dd className="nums mt-1 font-semibold">{form.readyMinStock}</dd></div></> : null}
                      </dl>
                    </section>

                    {form.productType !== 'internal' ? (
                      <section className="rounded-2xl border border-primary/20 bg-primary/[0.035] p-5">
                        <h3 className="font-bold">{ui('ملخص السعر والربح')}</h3>
                        <p className="mt-1 text-xs text-muted-foreground">{form.variantsEnabled ? ui('القيم التالية للاختيار الافتراضي.') : ui('محسوبة من السعر والوصفة الحالية.')}</p>
                        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                          <div className="rounded-xl bg-background p-3"><p className="text-xs text-muted-foreground">{ui('التكلفة')}</p><p className="nums mt-1 text-lg font-black">{computedCost.toFixed(2)}</p></div>
                          <div className="rounded-xl bg-background p-3"><p className="text-xs text-muted-foreground">{ui('الربح')}</p><p className={`nums mt-1 text-lg font-black ${computedProfit < 0 ? 'text-destructive' : 'text-emerald-600'}`}>{computedProfit.toFixed(2)}</p></div>
                          <div className="rounded-xl bg-background p-3"><p className="text-xs text-muted-foreground">{ui('الهامش')}</p><p className="nums mt-1 text-lg font-black text-primary">{computedMargin.toFixed(2)}%</p></div>
                        </div>
                        <div className="mt-3 rounded-xl border bg-background p-4 text-center"><p className="text-xs text-muted-foreground">{form.variantsEnabled ? ui('سعر الاختيار الافتراضي') : ui('سعر البيع')}</p><p className="nums mt-1 text-3xl font-black text-primary">{effectiveSellPrice.toFixed(2)} <span className="text-sm">{ui('ج.م')}</span></p></div>
                      </section>
                    ) : null}
                  </div>

                  {form.variantsEnabled ? (
                    <section className="rounded-2xl border p-4">
                      <h3 className="font-bold">{ui('ملخص الأحجام والأنواع')}</h3>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        {form.variants.filter((variant) => variant.isActive).map((variant, index) => {
                          const cost = variant.recipes.reduce((total, recipe) => {
                            const ingredient = ingredientOptions.find((item) => item.id === recipe.ingredientId);
                            const converted = ingredient ? convertCafeUnit(recipe.quantity, recipe.unit, ingredient.unitOfMeasure) : null;
                            return total + (ingredient && converted != null ? converted * ingredient.costPrice : 0);
                          }, 0);
                          const profit = variant.sellPrice - cost;
                          const margin = variant.sellPrice > 0 ? (profit / variant.sellPrice) * 100 : 0;
                          return <article key={variant.id ?? index} className={`rounded-xl border p-3 ${variant.isDefault ? 'border-primary/50 bg-primary/[0.03]' : ''}`}><div className="flex items-center justify-between gap-2"><p className="font-bold">{variant.name || ui('بدون اسم')}</p>{variant.isDefault ? <Badge>{ui('افتراضي')}</Badge> : null}</div><p className="nums mt-3 text-xl font-black text-primary">{variant.sellPrice.toFixed(2)} <span className="text-xs">{ui('ج.م')}</span></p><div className="mt-2 flex justify-between text-xs text-muted-foreground"><span>{ui('التكلفة')}: <b className="nums text-foreground">{cost.toFixed(2)}</b></span><span>{ui('الربح')}: <b className={`nums ${profit < 0 ? 'text-destructive' : 'text-emerald-600'}`}>{profit.toFixed(2)} ({margin.toFixed(1)}%)</b></span></div></article>;
                        })}
                      </div>
                    </section>
                  ) : null}
                </TabsContent>
              </div>
            </Tabs>

            <DialogFooter className="flex-row items-center justify-between gap-2 border-t pt-4 sm:justify-between">
              <Button type="button" variant="ghost" onClick={() => setDialogOpen(false)}>{ui('إلغاء')}</Button>
              <div className="flex items-center gap-2">
                {currentFormTabIndex > 0 ? <Button type="button" variant="outline" onClick={() => setFormTab(PRODUCT_FORM_TABS[currentFormTabIndex - 1])}>{ui('السابق')}</Button> : null}
                {formTab !== 'review' ? <Button type="button" onClick={goToNextFormTab}>{ui('التالي')}</Button> : <Button type="submit" disabled={isSubmitting}>{isSubmitting ? ui('جاري الحفظ…') : editingId ? ui('حفظ التعديلات') : ui('تأكيد وإضافة المنتج')}</Button>}
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={!!productionProduct} onOpenChange={(open) => { if (!open) setProductionProduct(null); }}>
        <DialogContent size="md">
          <DialogHeader><DialogTitle>{ui('تصنيع دفعة')} — {productionProduct?.name}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">{ui('سيتم خصم مكونات الوصفة وإضافة الكمية المصنعة إلى المخزون في حركة واحدة موثقة.')}</p>
          <div className="grid gap-4">
            <div className="space-y-2">
              <Label>{ui('الفرع')}</Label>
              <select className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={effectiveProductionBranchId} onChange={(event) => setProductionBranchId(event.target.value)}>
                <option value="">{ui('اختر الفرع')}</option>
                {(branches ?? []).map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
              </select>
            </div>
            <div className="space-y-2"><Label>{ui('الكمية المصنعة')}</Label><Input type="number" min={0.001} step={0.001} value={productionQuantity} onChange={(event) => setProductionQuantity(Number(event.target.value))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProductionProduct(null)}>{ui('إلغاء')}</Button>
            <Button disabled={producing || !effectiveProductionBranchId || productionQuantity <= 0} onClick={async () => {
              if (!productionProduct) return;
              setProducing(true);
              try {
                await api.post(`/cafe-products/${productionProduct.id}/produce`, { branchId: Number(effectiveProductionBranchId), quantity: productionQuantity });
                toast.success(ui('تم تصنيع الدفعة وتحديث المخزون'));
                setProductionProduct(null);
                await Promise.all([qc.invalidateQueries({ queryKey: ['cafe-products'] }), qc.invalidateQueries({ queryKey: ['products'] }), qc.invalidateQueries({ queryKey: ['stock'] })]);
              } catch (error) { toast.error(apiError(error)); } finally { setProducing(false); }
            }}>{producing ? ui('جاري التصنيع…') : ui('تأكيد التصنيع')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ListPageShell>
  );
}
