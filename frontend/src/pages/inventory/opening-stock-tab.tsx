import type { ColumnDef } from '@tanstack/react-table';
import { Lock, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { PaginatedResponse } from '@/components/common/data-table';
import { DataTable } from '@/components/common/data-table';
import { ListPageShell } from '@/components/common/list-page-shell';
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
import type { ProductListItem } from '@/types/inventory';
import { useLocale } from '@/store/locale';
import { useAuth } from '@/store/auth';
import { useBranches } from '@/hooks/use-branches';
import { indexColumn } from './simple-crud-tab';
import { WarehouseSelect } from '@/components/inventory/warehouse-select';

interface OpeningStockRow {
  id: number;
  itemCode: string;
  quantity: number;
  unitCost: number;
  branchId: number;
  warehouseId: number;
}

const OPENING_EMPTY = {
  itemCode: '',
  productId: '',
  quantity: '1',
  unitCost: '0',
  notes: '',
};

export function OpeningStockTab() {
  const { ui } = useLocale();
  const { params, setParams } = useListQuery();
  const user = useAuth((state) => state.user);
  const { data: branches = [] } = useBranches();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(OPENING_EMPTY);
  const [warehouseId, setWarehouseId] = useState('');
  const [selectedBranchId, setSelectedBranchId] = useState('');
  const [saving, setSaving] = useState(false);
  const effectiveBranchId = selectedBranchId || (user?.branch ? String(user.branch) : '');
  const { data, isLoading, isError, error, refetch } = usePaginatedList<OpeningStockRow>(
    'opening-stocks',
    params,
  );

  const { data: products } = useQuery({
    queryKey: ['products', 'opening', effectiveBranchId],
    queryFn: async () => {
      const { data: r } = await api.get<PaginatedResponse<ProductListItem>>('/products', {
        params: { page: 1, pageSize: 200, branchId: effectiveBranchId || undefined },
      });
      return r.data;
    },
  });

  const columns = useMemo<ColumnDef<OpeningStockRow>[]>(
    () => [
      indexColumn(params.page, params.pageSize) as ColumnDef<OpeningStockRow>,
      { accessorKey: 'itemCode', header: ui('كود الصنف') },
      {
        accessorKey: 'quantity',
        header: ui('الكمية'),
        cell: ({ getValue }) => <span className="nums">{toArabicDigits(getValue() as number)}</span>,
      },
      {
        accessorKey: 'unitCost',
        header: ui('تكلفة الوحدة'),
        cell: ({ getValue }) => <span className="nums">{toArabicDigits(getValue() as number)}</span>,
      },
    ],
    [params.page, params.pageSize, ui],
  );

  const onProductPick = (productId: string) => {
    const p = products?.find((x) => x.id === Number(productId));
    setForm((f) => ({
      ...f,
      productId,
      itemCode: p?.productCode ?? f.itemCode,
      unitCost: String(p?.costPrice ?? f.unitCost),
    }));
  };

  const save = async () => {
    if (!form.itemCode || !effectiveBranchId) {
      toast.error(ui('يرجى تعبئة الحقول المطلوبة'));
      return;
    }
    const quantityNum = Number(form.quantity);
    const unitCostNum = Number(form.unitCost);
    if (!Number.isFinite(quantityNum) || quantityNum < 0 || !Number.isFinite(unitCostNum) || unitCostNum < 0) {
      toast.error(ui('الكمية والتكلفة يجب أن تكون أرقاماً موجبة'));
      return;
    }
    setSaving(true);
    try {
      await api.post('/opening-stocks', {
        branchId: Number(effectiveBranchId),
        warehouseId: warehouseId ? Number(warehouseId) : undefined,
        itemCode: form.itemCode,
        productId: form.productId ? Number(form.productId) : undefined,
        quantity: Number(form.quantity),
        unitCost: Number(form.unitCost),
        notes: form.notes || undefined,
      });
      toast.success(ui('تم تسجيل بضاعة أول المدة'));
      setOpen(false);
      void refetch();
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
      actions={
        <Button
          onClick={() => {
            setForm(OPENING_EMPTY);
            setSelectedBranchId(user?.branch ? String(user.branch) : '');
            setWarehouseId('');
            setOpen(true);
          }}
        >
          <Plus className="ms-1 h-4 w-4" />
          {ui('إضافة رصيد')}
        </Button>
      }
    >
      <DataTable
        columns={columns}
        data={data?.data ?? []}
        total={data?.total ?? 0}
        page={params.page}
        pageSize={params.pageSize}
        onPageChange={(page) => setParams({ page })}
        onPageSizeChange={(pageSize) => setParams({ pageSize, page: 1 })}
        isLoading={isLoading}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>{ui('بضاعة أول المدة')}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-1">
              <Label>{ui('المنتج')}</Label>
              <select
                className="rounded-md border bg-background px-3 py-2 text-sm"
                value={form.productId}
                onChange={(e) => onProductPick(e.target.value)}
              >
                <option value="">{ui('— أو أدخل الكود يدوياً —')}</option>
                {(products ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nameAr}{p.size ? ` — ${p.size}` : ''} ({p.productCode})
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1">
              <WarehouseSelect branchId={effectiveBranchId} value={warehouseId} onChange={setWarehouseId} />
              <Label>{ui('كود الصنف')}</Label>
              <Input value={form.itemCode} onChange={(e) => setForm((f) => ({ ...f, itemCode: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1">
                <Label>{ui('الكمية')}</Label>
                <Input
                  type="number"
                  min={0}
                  className="nums"
                  value={form.quantity}
                  onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
                />
              </div>
              <div className="grid gap-1">
                <Label>{ui('تكلفة الوحدة')}</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  className="nums"
                  value={form.unitCost}
                  onChange={(e) => setForm((f) => ({ ...f, unitCost: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid gap-1">
              <Label>{ui('الفرع')}</Label>
              {user?.branch ? (
                <div className="flex min-h-10 items-center justify-between rounded-md border bg-muted/40 px-3 py-2 text-sm">
                  <span>{user.branch_name || `${ui('فرع رقم')} ${user.branch}`}</span>
                  <Lock className="size-4 text-muted-foreground" />
                </div>
              ) : (
                <select
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={effectiveBranchId}
                  onChange={(e) => {
                    setSelectedBranchId(e.target.value);
                    setWarehouseId('');
                  }}
                >
                  <option value="">{ui('اختر الفرع')}</option>
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>{branch.name}</option>
                  ))}
                </select>
              )}
            </div>
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
