import { formatDisplayNumber } from '@/lib/number-display';
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeftRight, CheckCircle2, LoaderCircle, PackageSearch, WandSparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Combobox } from '@/components/common/combobox';
import type { PaginatedResponse } from '@/components/common/data-table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api, apiError } from '@/lib/api';
import { formatMoney } from '@/lib/formatters';
import {
  canApplyIngredientSwap,
  eligibleIngredientSwapKeys,
  ingredientSwapRowKey,
  targetIngredientCost,
} from '@/lib/ingredient-swap-state';
import { useLocale } from '@/store/locale';
import type { ProductListItem } from '@/types/inventory';

type SwapRow = {
  recipeType: 'product' | 'variant';
  recipeId: number;
  productId: number;
  productName: string;
  variantId: number | null;
  variantName: string | null;
  categoryName: string | null;
  quantity: number;
  unit: string;
  currentCost: number | null;
  targetUnit: string;
  targetUnitCost: number;
  targetCost: number;
  conflict: boolean;
};

type SwapPreview = {
  source: { id: number; name: string; unit: string };
  target: { id: number; name: string; unit: string };
  rows: SwapRow[];
  eligibleCount: number;
};

export function IngredientSwapWorkspace({ initialSourceId }: { initialSourceId?: string } = {}) {
  const { ui } = useLocale();
  const queryClient = useQueryClient();
  const [sourceId, setSourceId] = useState(initialSourceId ?? '');
  const [targetId, setTargetId] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  const ingredientsQuery = useQuery({
    queryKey: ['ingredient-swap', 'ingredients'],
    queryFn: async () => {
      const [current, archived] = await Promise.all([
        api.get<PaginatedResponse<ProductListItem>>('/products', {
          params: { page: 1, pageSize: 200, status: 'all' },
        }),
        api.get<PaginatedResponse<ProductListItem>>('/products', {
          params: { page: 1, pageSize: 200, includeArchived: true },
        }),
      ]);
      return [...current.data.data, ...archived.data.data]
        .filter((item) => item.inventoryKind !== 'ready_product')
        .filter((item, index, rows) => rows.findIndex((candidate) => candidate.id === item.id) === index)
        .sort((a, b) => a.nameAr.localeCompare(b.nameAr, 'ar'));
    },
  });

  const previewQuery = useQuery({
    queryKey: ['ingredient-swap', 'preview', sourceId, targetId],
    queryFn: async () => {
      const { data } = await api.get<SwapPreview>('/cafe-products/ingredient-swap/preview', {
        params: { sourceIngredientId: sourceId, targetIngredientId: targetId },
      });
      return data;
    },
    enabled: Boolean(sourceId && targetId && sourceId !== targetId),
  });

  useEffect(() => {
    const rows = previewQuery.data?.rows ?? [];
    setSelected(new Set(eligibleIngredientSwapKeys(rows)));
    setQuantities(Object.fromEntries(rows.map((row) => [ingredientSwapRowKey(row), row.quantity])));
  }, [previewQuery.data]);

  const sourceOptions = useMemo(() => (ingredientsQuery.data ?? []).map((item) => ({
    value: String(item.id),
    label: item.nameAr,
    description: item.isDeleted
      ? `${item.productCode} · ${item.unitOfMeasure} · ${ui('محذوف — مصدر فقط')}`
      : `${item.productCode} · ${item.unitOfMeasure}`,
    searchText: item.nameEn ?? undefined,
  })), [ingredientsQuery.data, ui]);
  const targetOptions = sourceOptions.filter((option) => {
    const item = (ingredientsQuery.data ?? []).find((row) => String(row.id) === option.value);
    return option.value !== sourceId && !item?.isDeleted && item?.status === 'active';
  });
  const eligibleKeys = eligibleIngredientSwapKeys(previewQuery.data?.rows ?? []);
  const allSelected = eligibleKeys.length > 0 && eligibleKeys.every((key) => selected.has(key));

  const applyMutation = useMutation({
    mutationFn: async () => {
      const rows = (previewQuery.data?.rows ?? [])
        .filter((row) => selected.has(ingredientSwapRowKey(row)))
        .map((row) => ({
          recipeType: row.recipeType,
          recipeId: row.recipeId,
          quantity: quantities[ingredientSwapRowKey(row)] ?? row.quantity,
        }));
      const { data } = await api.post<{ updatedCount: number; productCount: number }>('/cafe-products/ingredient-swap', {
        sourceIngredientId: Number(sourceId),
        targetIngredientId: Number(targetId),
        rows,
      });
      return data;
    },
    onSuccess: async (result) => {
      toast.success(`${ui('تم تبديل الخامة في ')}${formatDisplayNumber(result.updatedCount)}${ui(' وصفة بنجاح')}`);
      setSourceId('');
      setTargetId('');
      setSelected(new Set());
      await queryClient.invalidateQueries({ queryKey: ['cafe-products'] });
      await queryClient.invalidateQueries({ queryKey: ['products'] });
    },
    onError: (error) => toast.error(apiError(error, ui('تعذر تطبيق التبديل'))),
  });

  const toggleRow = (key: string, checked: boolean) => {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden border-primary/15 shadow-sm">
        <div className="bg-gradient-to-l from-primary/[0.09] via-primary/[0.03] to-transparent px-5 py-5 sm:px-6">
          <div className="flex items-start gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <WandSparkles className="size-5" />
            </span>
            <div>
              <h2 className="text-lg font-bold">{ui('تبديل الخامات')}</h2>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
                {ui('استبدل خامة في كل الوصفات المطلوبة من شاشة واحدة، مع إمكانية ضبط الكمية لكل منتج قبل الحفظ.')}
              </p>
            </div>
          </div>
        </div>
        <CardContent className="grid gap-4 p-5 sm:grid-cols-[1fr_auto_1fr] sm:items-end sm:p-6">
          <div className="space-y-2">
            <Label htmlFor="source-ingredient">{ui('الخامة المراد استبدالها')}</Label>
            <Combobox
              id="source-ingredient"
              value={sourceId}
              onValueChange={(value) => {
                setSourceId(value);
                if (value === targetId) setTargetId('');
              }}
              options={sourceOptions}
              placeholder={ingredientsQuery.isLoading ? ui('جاري تحميل الخامات…') : ui('اختر الخامة الحالية')}
              searchPlaceholder={ui('ابحث بالاسم أو الكود…')}
              disabled={ingredientsQuery.isLoading}
            />
          </div>
          <span className="mb-1 hidden size-10 items-center justify-center rounded-full border bg-muted text-muted-foreground sm:flex">
            <ArrowLeftRight className="size-4" />
          </span>
          <div className="space-y-2">
            <Label htmlFor="target-ingredient">{ui('الخامة البديلة')}</Label>
            <Combobox
              id="target-ingredient"
              value={targetId}
              onValueChange={setTargetId}
              options={targetOptions}
              placeholder={ui('اختر الخامة الجديدة')}
              searchPlaceholder={ui('ابحث بالاسم أو الكود…')}
              disabled={!sourceId || ingredientsQuery.isLoading}
            />
          </div>
        </CardContent>
      </Card>

      {previewQuery.isFetching ? (
        <Card><CardContent className="flex min-h-52 items-center justify-center gap-3 text-muted-foreground"><LoaderCircle className="size-5 animate-spin" />{ui('جاري فحص الوصفات المرتبطة…')}</CardContent></Card>
      ) : previewQuery.isError ? (
        <Card className="border-destructive/40"><CardContent className="flex gap-3 p-5 text-destructive"><AlertTriangle className="mt-0.5 size-5 shrink-0" /><div><h3 className="font-bold">{ui('تعذر تحميل المعاينة')}</h3><p className="mt-1 text-sm">{apiError(previewQuery.error)}</p></div></CardContent></Card>
      ) : previewQuery.data && previewQuery.data.rows.length === 0 ? (
        <Card className="border-dashed"><CardContent className="flex min-h-64 flex-col items-center justify-center px-6 text-center"><span className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-muted"><PackageSearch className="size-7 text-muted-foreground" /></span><h3 className="font-bold">{ui('الخامة دي غير مستخدمة في أي وصفة حالياً')}</h3><p className="mt-2 max-w-md text-sm text-muted-foreground">{ui('يمكنك اختيار خامة أخرى، ولن يتم إجراء أي تعديل على المخزون أو الفواتير السابقة.')}</p></CardContent></Card>
      ) : previewQuery.data ? (
        <Card className="overflow-hidden">
          <CardHeader className="gap-3 border-b bg-muted/20 sm:flex-row sm:items-center sm:justify-between">
            <div><CardTitle className="text-base">{ui('الوصفات المتأثرة')}</CardTitle><p className="mt-1 text-sm text-muted-foreground">{`${formatDisplayNumber(selected.size)}${ui(' محدد من ')}${formatDisplayNumber(previewQuery.data.eligibleCount)}${ui(' متاح للتبديل')}`}</p></div>
            <Badge variant="secondary" className="w-fit">{`${formatDisplayNumber(previewQuery.data.rows.length)}${ui(' استخدام')}`}</Badge>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12"><Checkbox aria-label={ui('تحديد كل الوصفات المتاحة')} checked={allSelected ? true : selected.size > 0 ? 'indeterminate' : false} onCheckedChange={(checked) => setSelected(new Set(checked === true ? eligibleKeys : []))} /></TableHead>
                  <TableHead>{ui('المنتج')}</TableHead>
                  <TableHead className="min-w-64">{ui('قبل التبديل')}</TableHead>
                  <TableHead className="min-w-72">{ui('بعد التبديل')}</TableHead>
                  <TableHead>{ui('الحالة')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {previewQuery.data.rows.map((row) => {
                  const key = ingredientSwapRowKey(row);
                  const blocked = row.conflict;
                  const proposedQuantity = quantities[key] ?? row.quantity;
                  const proposedCost = targetIngredientCost(proposedQuantity, row.targetUnitCost);
                  return (
                    <TableRow key={key} data-state={selected.has(key) ? 'selected' : undefined} className={blocked ? 'opacity-65' : undefined}>
                      <TableCell><Checkbox aria-label={`${ui('تحديد ')}${row.productName}`} checked={selected.has(key)} disabled={blocked} onCheckedChange={(checked) => toggleRow(key, checked === true)} /></TableCell>
                      <TableCell><p className="font-semibold">{row.productName}</p><p className="mt-0.5 text-xs text-muted-foreground">{[row.variantName, row.categoryName].filter(Boolean).join(' · ') || ui('الوصفة الأساسية')}</p></TableCell>
                      <TableCell>
                        <div className="space-y-2" dir="rtl">
                          <p className="font-semibold text-foreground">{previewQuery.data.source.name}</p>
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                            <span><span className="text-muted-foreground">{ui('الكمية:')}</span> <bdi dir="ltr" className="font-semibold tabular-nums">{formatDisplayNumber(row.quantity)} {row.unit}</bdi></span>
                            <span><span className="text-muted-foreground">{ui('إجمالي التكلفة:')}</span> <bdi dir="ltr" className="font-semibold tabular-nums">{row.currentCost == null ? '—' : formatMoney(row.currentCost)}</bdi></span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-2" dir="rtl">
                          <p className="font-semibold text-foreground">{previewQuery.data.target.name}</p>
                          <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
                            <div className="space-y-1">
                              <Label htmlFor={`swap-quantity-${key}`} className="text-xs text-muted-foreground">{ui('الكمية الجديدة')}</Label>
                              <div className="flex items-center gap-2">
                                <Input id={`swap-quantity-${key}`} type="number" min="0.001" step="0.001" value={proposedQuantity} disabled={blocked} onChange={(event) => setQuantities((current) => ({ ...current, [key]: Number(event.target.value) }))} className="h-9 w-28 text-left tabular-nums" dir="ltr" aria-label={ui('الكمية الجديدة')} />
                                <span className="text-xs font-medium text-muted-foreground">{row.targetUnit}</span>
                              </div>
                            </div>
                            <p className="pb-2 text-sm"><span className="text-muted-foreground">{ui('إجمالي التكلفة:')}</span> <bdi dir="ltr" className="font-bold tabular-nums text-primary">{formatMoney(proposedCost)}</bdi></p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>{row.conflict ? <Badge variant="destructive">{ui('الخامة البديلة موجودة بالفعل في الوصفة')}</Badge> : <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="size-4" />{ui('جاهز للتبديل')}</span>}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
          <div className="sticky bottom-0 z-10 flex flex-col gap-3 border-t bg-background/95 px-5 py-4 shadow-[0_-8px_24px_rgba(0,0,0,0.05)] backdrop-blur sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">{selected.size ? `${ui('سيتم تحديث ')}${formatDisplayNumber(selected.size)}${ui(' وصفة فقط')}` : ui('حدد وصفة واحدة على الأقل لتطبيق التبديل')}</p>
            <AlertDialog>
              <AlertDialogTrigger asChild><Button disabled={!canApplyIngredientSwap(selected, applyMutation.isPending)} className="min-w-40"><ArrowLeftRight className="me-2 size-4" />{applyMutation.isPending ? ui('جاري التطبيق…') : ui('تطبيق التبديل')}</Button></AlertDialogTrigger>
              <AlertDialogContent dir="rtl">
                <AlertDialogHeader><AlertDialogTitle>{ui('تأكيد تبديل الخامة')}</AlertDialogTitle><AlertDialogDescription>{`${ui('سيتم استبدال «')}${previewQuery.data.source.name}${ui('» بـ «')}${previewQuery.data.target.name}${ui('» في ')}${formatDisplayNumber(selected.size)}${ui(' وصفة. الفواتير وحركات المخزون السابقة لن تتغير.')}`}</AlertDialogDescription></AlertDialogHeader>
                <AlertDialogFooter><AlertDialogCancel>{ui('إلغاء')}</AlertDialogCancel><AlertDialogAction onClick={() => applyMutation.mutate()}>{ui('تأكيد وتطبيق')}</AlertDialogAction></AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </Card>
      ) : (
        <Card className="border-dashed"><CardContent className="flex min-h-52 flex-col items-center justify-center px-6 text-center"><ArrowLeftRight className="mb-3 size-8 text-muted-foreground" /><p className="font-medium">{ui('اختر الخامة الحالية والخامة البديلة لعرض المنتجات المتأثرة')}</p></CardContent></Card>
      )}
    </div>
  );
}
