import type { ColumnDef } from '@tanstack/react-table';
import { Check, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
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
import { useBranches } from '@/hooks/use-branches';
import { api, apiError } from '@/lib/api';
import { confirmWithPreview } from '@/lib/confirm';
import { useMutationWithToast, usePaginatedList } from '@/lib/api-hooks';
import { useListQuery } from '@/lib/use-list-query';
import { toArabicDigits } from '@/lib/utils';
import type { PurchaseReturnRow, WarehouseOption } from '@/types/gym-sales';
import type { NamedEntity, ProductListItem } from '@/types/inventory';
import type { PaginatedResponse } from '@/components/common/data-table';
import { useLocale } from '@/store/locale';
import { GymSalesPageShell } from '../gym-sales/shell';
import { indexColumn } from '../inventory/simple-crud-tab';

interface LineDraft {
  productId: string;
  productName: string;
  quantity: string;
  unitPrice: string;
}

export function ProcurementReturnsPage() {
  const { ui } = useLocale();
  const { params, setParams } = useListQuery();
  const { data, isLoading, isError, refetch } = usePaginatedList<PurchaseReturnRow>(
    'purchase-returns',
    params,
  );
  const { data: branches } = useBranches();

  const { data: suppliers } = useQuery({
    queryKey: ['suppliers', 'options'],
    queryFn: async () => {
      const { data: r } = await api.get<PaginatedResponse<NamedEntity>>('/suppliers', {
        params: { page: 1, pageSize: 200 },
      });
      return r.data;
    },
  });

  const { data: products } = useQuery({
    queryKey: ['products', 'options'],
    queryFn: async () => {
      const { data: r } = await api.get<PaginatedResponse<ProductListItem>>('/products', {
        params: { page: 1, pageSize: 200 },
      });
      return r.data;
    },
  });

  const { data: warehouses } = useQuery({
    queryKey: ['warehouses', 'options'],
    queryFn: async () => {
      const { data: r } = await api.get<PaginatedResponse<WarehouseOption>>('/warehouses', {
        params: { page: 1, pageSize: 200 },
      });
      return r.data;
    },
  });

  const [open, setOpen] = useState(false);
  const [supplierId, setSupplierId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [branchId, setBranchId] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<LineDraft[]>([{ productId: '', productName: '', quantity: '1', unitPrice: '0' }]);
  const [saving, setSaving] = useState(false);
  const [approvingId, setApprovingId] = useState<number | null>(null);

  const deleteMutation = useMutationWithToast(
    (id: number) => api.delete(`/purchase-returns/${id}`),
    { success: ui('تم الحذف'), invalidate: ['purchase-returns'] },
  );

  const approve = async (id: number) => {
    if (approvingId !== null) return;
    setApprovingId(id);
    try {
      const ok = await confirmWithPreview(
        { title: ui('اعتماد المرتجع'), confirmLabel: ui('اعتماد') },
        async () => {
          const { data } = await api.patch(`/purchase-returns/${id}/status?dryRun=true`, {
            status: 'معتمد',
          });
          return {
            rows: (data as { rows?: { label: string; before?: string; after?: string }[] }).rows,
            warning: (data as { warning?: string }).warning,
          };
        },
        async () => {
          await api.patch(`/purchase-returns/${id}/status`, { status: 'معتمد' });
        },
      );
      if (ok) {
        toast.success(ui('تم اعتماد المرتجع وخصم المخزون'));
        void refetch();
      }
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setApprovingId(null);
    }
  };

  const columns = useMemo<ColumnDef<PurchaseReturnRow>[]>(
    () => [
      indexColumn(params.page, params.pageSize) as ColumnDef<PurchaseReturnRow>,
      { accessorKey: 'returnNumber', header: ui('رقم المرتجع') },
      {
        accessorKey: 'totalAmount',
        header: ui('القيمة'),
        cell: ({ getValue }) => <span className="nums">{toArabicDigits(getValue() as number)}</span>,
      },
      {
        accessorKey: 'status',
        header: ui('الحالة'),
        cell: ({ getValue }) => ui(getValue() as string),
      },
      {
        id: 'actions',
        header: ui('الإجراءات'),
        cell: ({ row }) => (
          <div className="flex gap-1">
            {row.original.status === 'مسودة' && (
              <Button
                variant="ghost"
                size="icon"
                disabled={approvingId !== null}
                onClick={() => void approve(row.original.id)}
              >
                <Check className="h-4 w-4 text-success" />
              </Button>
            )}
            {row.original.status === 'مسودة' && (
              <Button variant="ghost" size="icon" onClick={() => void deleteMutation.mutate(row.original.id)}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            )}
          </div>
        ),
      },
    ],
    [approvingId, deleteMutation, params.page, params.pageSize, ui],
  );

  const save = async () => {
    const validLines = lines.filter((l) => l.productId && Number(l.quantity) > 0);
    if (!supplierId || !warehouseId || !branchId || !validLines.length) {
      toast.error(ui('يرجى تعبئة البيانات وإضافة بند واحد على الأقل'));
      return;
    }
    setSaving(true);
    try {
      await api.post('/purchase-returns', {
        supplierId: Number(supplierId),
        warehouseId: Number(warehouseId),
        branchId: Number(branchId),
        notes: notes || undefined,
        items: validLines.map((l) => ({
          productId: Number(l.productId),
          productName: l.productName,
          quantity: Number(l.quantity),
          unitPrice: Number(l.unitPrice) || 0,
        })),
      });
      toast.success(ui('تم إنشاء مرتجع المشتريات'));
      setOpen(false);
      void refetch();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <GymSalesPageShell
      section="procurement"
      title={ui('مرتجع المشتريات')}
      description={ui('إرجاع بضاعة للمورد وخصمها من المخزون عند الاعتماد')}
      actions={
        <Button
          onClick={() => {
            setSupplierId('');
            setWarehouseId(String(warehouses?.[0]?.id ?? ''));
            setBranchId(String(branches?.[0]?.id ?? ''));
            setNotes('');
            setLines([{ productId: '', productName: '', quantity: '1', unitPrice: '0' }]);
            setOpen(true);
          }}
        >
          <Plus className="ms-1 h-4 w-4" />
          {ui('مرتجع جديد')}
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
        search={params.search}
        onSearchChange={(search) => setParams({ search, page: 1 })}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => void refetch()}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="xl" className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{ui('مرتجع مشتريات جديد')}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1">
                <Label>{ui('المورد')}</Label>
                <select
                  className="rounded-md border bg-background px-3 py-2 text-sm"
                  value={supplierId}
                  onChange={(e) => setSupplierId(e.target.value)}
                >
                  <option value="">{ui('—')}</option>
                  {(suppliers ?? []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nameAr}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-1">
                <Label>{ui('المستودع')}</Label>
                <select
                  className="rounded-md border bg-background px-3 py-2 text-sm"
                  value={warehouseId}
                  onChange={(e) => setWarehouseId(e.target.value)}
                >
                  {(warehouses ?? []).map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.nameAr}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid gap-1">
              <Label>{ui('الفرع')}</Label>
              <select
                className="rounded-md border bg-background px-3 py-2 text-sm"
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
              >
                {(branches ?? []).map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>{ui('البنود')}</Label>
              {lines.map((line, idx) => (
                <div key={idx} className="grid grid-cols-4 gap-2">
                  <select
                    className="col-span-2 rounded-md border bg-background px-2 py-2 text-sm"
                    value={line.productId}
                    onChange={(e) => {
                      const p = products?.find((x) => x.id === Number(e.target.value));
                      setLines((prev) => {
                        const next = [...prev];
                        next[idx] = {
                          ...next[idx],
                          productId: e.target.value,
                          productName: p?.nameAr ?? '',
                          unitPrice: String(p?.costPrice ?? 0),
                        };
                        return next;
                      });
                    }}
                  >
                    <option value="">{ui('منتج')}</option>
                    {(products ?? []).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nameAr}
                      </option>
                    ))}
                  </select>
                  <Input
                    type="number"
                    placeholder={ui('كمية')}
                    className="nums"
                    value={line.quantity}
                    onChange={(e) => {
                      setLines((prev) => {
                        const next = [...prev];
                        next[idx] = { ...next[idx], quantity: e.target.value };
                        return next;
                      });
                    }}
                  />
                  <Input
                    type="number"
                    placeholder={ui('سعر')}
                    className="nums"
                    value={line.unitPrice}
                    onChange={(e) => {
                      setLines((prev) => {
                        const next = [...prev];
                        next[idx] = { ...next[idx], unitPrice: e.target.value };
                        return next;
                      });
                    }}
                  />
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setLines((prev) => [...prev, { productId: '', productName: '', quantity: '1', unitPrice: '0' }])
                }
              >
                {ui('إضافة بند')}
              </Button>
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
    </GymSalesPageShell>
  );
}
