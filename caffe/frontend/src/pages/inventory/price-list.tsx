import type { ColumnDef } from '@tanstack/react-table';
import { Pencil } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { DataTable } from '@/components/common/data-table';
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
import { api, apiError } from '@/lib/api';
import { usePaginatedList } from '@/lib/api-hooks';
import { useListQuery } from '@/lib/use-list-query';
import { toArabicDigits } from '@/lib/utils';
import type { CafeProductListItem } from '@/types/cafe';
import { useLocale } from '@/store/locale';
import { InventoryPageShell } from './inventory-shell';
import { indexColumn } from './simple-crud-tab';
import { usePermission } from '@/hooks/use-permission';

export function InventoryPriceListPage() {
  const { ui } = useLocale();
  const { can } = usePermission();
  const { params, setParams } = useListQuery({ filters: { sellableOnly: 'true' } });
  const { data, isLoading, isError, error, refetch } = usePaginatedList<CafeProductListItem>('cafe-products', params);
  const [edit, setEdit] = useState<CafeProductListItem | null>(null);
  const [sellingPrice, setSellingPrice] = useState(0);
  const [saving, setSaving] = useState(false);

  const columns = useMemo<ColumnDef<CafeProductListItem>[]>(
    () => [
      indexColumn(params.page, params.pageSize) as ColumnDef<CafeProductListItem>,
      { accessorKey: 'productCode', header: ui('الكود') },
      { accessorKey: 'name', header: ui('الاسم') },
      {
        accessorKey: 'productType',
        header: ui('النوع'),
        cell: ({ row }) => row.original.productType === 'ready' ? ui('جاهز') : ui('يتم تحضيره'),
      },
      {
        accessorKey: 'cost',
        header: ui('التكلفة'),
        cell: ({ getValue }) => <span className="nums">{toArabicDigits(getValue() as number)}</span>,
      },
      {
        accessorKey: 'sellPrice',
        header: ui('سعر البيع'),
        cell: ({ getValue }) => <span className="nums">{toArabicDigits(getValue() as number)}</span>,
      },
      {
        id: 'actions',
        header: ui('تعديل'),
        cell: ({ row }) => can('club.cafe.price_list:update') ? (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              setEdit(row.original);
              setSellingPrice(row.original.sellPrice);
            }}
          >
            <Pencil className="h-4 w-4" />
          </Button>
        ) : null,
      },
    ],
    [can, params.page, params.pageSize, ui],
  );

  const save = async () => {
    if (!edit) return;
    if (sellingPrice <= 0) {
      toast.error(ui('سعر البيع يجب أن يكون أكبر من صفر'));
      return;
    }
    if (sellingPrice < edit.cost) {
      toast.error(ui('سعر البيع لا يمكن أن يكون أقل من التكلفة المحسوبة'));
      return;
    }
    setSaving(true);
    try {
      await api.patch(`/cafe-products/${edit.id}/price`, { sellPrice: sellingPrice });
      toast.success(ui('تم تحديث الأسعار'));
      setEdit(null);
      void refetch();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <InventoryPageShell
      title={ui('قائمة الأسعار')}
      description={ui('كل منتج يتم بيعه في الكافيه يظهر هنا، وأي تعديل ينعكس فوراً في نقطة البيع')}
    >
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
        isError={isError}
        onRetry={() => void refetch()}
      />

      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{ui('تعديل سعر')} {edit?.name}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="rounded-lg border bg-muted/30 p-3 text-sm">
              <div className="flex justify-between gap-3">
                <span>{ui('التكلفة المحسوبة')}</span>
                <span className="nums font-semibold">{toArabicDigits(edit?.cost ?? 0)}</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {ui('التكلفة تُحسب تلقائياً من متوسط تكلفة المخزون أو خامات الوصفة ولا يتم تعديلها من هنا')}
              </p>
            </div>
            <div className="grid gap-1">
              <Label>{ui('سعر البيع')}</Label>
              <Input
                type="number"
                dir="ltr"
                inputMode="decimal"
                min={0}
                step="0.01"
                className="nums text-end"
                value={sellingPrice}
                onChange={(e) => setSellingPrice(Number(e.target.value))}
              />
              {edit?.variantCount ? (
                <p className="text-xs text-muted-foreground">
                  {ui('هذا هو سعر الحجم أو النوع الافتراضي. يمكن تعديل أسعار باقي الاختيارات من صفحة منتجات الكافيه.')}
                </p>
              ) : null}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEdit(null)}>
              {ui('إلغاء')}
            </Button>
            <Button onClick={() => void save()} disabled={saving || sellingPrice <= 0 || sellingPrice < (edit?.cost ?? 0)}>
              {ui('حفظ')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </InventoryPageShell>
  );
}
