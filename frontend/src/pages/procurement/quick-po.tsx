import type { ColumnDef } from '@tanstack/react-table';
import { Check, Pencil, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { DataTable } from '@/components/common/data-table';
import { FilterBar, type FilterField } from '@/components/common/filter-bar';
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
import { useMutationWithToast, usePaginatedList } from '@/lib/api-hooks';
import { useListQuery } from '@/lib/use-list-query';
import { toArabicDigits } from '@/lib/utils';
import type { QuickPurchaseOrderRow, WarehouseOption } from '@/types/gym-sales';
import type { NamedEntity, ProductListItem } from '@/types/inventory';
import type { PaginatedResponse } from '@/components/common/data-table';
import { useLocale } from '@/store/locale';
import { GymSalesPageShell } from '../gym-sales/shell';
import { indexColumn } from '../inventory/simple-crud-tab';

const EMPTY = {
  supplierId: '',
  productId: '',
  productName: '',
  quantity: '1',
  unitPrice: '0',
  warehouseId: '',
  branchId: '',
  notes: '',
};

export function ProcurementQuickPoPage() {
  const { ui } = useLocale();
  const { params, setParams } = useListQuery();
  const { data, isLoading, isError, refetch } = usePaginatedList<QuickPurchaseOrderRow>(
    'quick-purchase-orders',
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
        params: { page: 1, pageSize: 200, status: 'active' },
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
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [confirmingId, setConfirmingId] = useState<number | null>(null);

  const deleteMutation = useMutationWithToast(
    (id: number) => api.delete(`/quick-purchase-orders/${id}`),
    { success: ui('تم الحذف'), invalidate: ['quick-purchase-orders'] },
  );

  const statusOptions = useMemo(
    // value = RAW canonical status the backend filters on; label = localized for display.
    () => [
      { value: 'مسودة', label: ui('مسودة') },
      { value: 'مؤكد', label: ui('مؤكد') },
      { value: 'ملغي', label: ui('ملغي') },
    ],
    [ui],
  );

  const filters: FilterField[] = [
    { key: 'status', label: ui('الحالة'), type: 'select', options: statusOptions },
    {
      key: 'branchId',
      label: ui('الفرع'),
      type: 'select',
      options: (branches ?? []).map((b) => ({ value: String(b.id), label: b.name ?? '—' })),
    },
  ];

  const confirmOrder = async (id: number) => {
    if (confirmingId !== null) return;
    setConfirmingId(id);
    try {
      // Send the RAW canonical status the backend stores/compares (see quick-purchase-orders.service.ts).
      await api.patch(`/quick-purchase-orders/${id}/status`, { status: 'مؤكد' });
      toast.success(ui('تم تأكيد الأمر وإضافة المخزون'));
      void refetch();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setConfirmingId(null);
    }
  };

  const columns = useMemo<ColumnDef<QuickPurchaseOrderRow>[]>(
    () => [
      indexColumn(params.page, params.pageSize) as ColumnDef<QuickPurchaseOrderRow>,
      { accessorKey: 'orderNumber', header: ui('رقم الأمر') },
      { accessorKey: 'productName', header: ui('المنتج') },
      {
        accessorKey: 'quantity',
        header: ui('الكمية'),
        cell: ({ getValue }) => <span className="nums">{toArabicDigits(getValue() as number)}</span>,
      },
      {
        accessorKey: 'totalAmount',
        header: ui('الإجمالي'),
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
                disabled={confirmingId !== null}
                onClick={() => void confirmOrder(row.original.id)}
              >
                <Check className="h-4 w-4 text-success" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              disabled={row.original.status !== 'مسودة'}
              onClick={() => {
                setEditId(row.original.id);
                setForm({
                  supplierId: String(row.original.supplierId),
                  productId: String(row.original.productId),
                  productName: row.original.productName,
                  quantity: String(row.original.quantity),
                  unitPrice: String(row.original.unitPrice),
                  warehouseId: String(row.original.warehouseId),
                  branchId: String(row.original.branchId),
                  notes: row.original.notes ?? '',
                });
                setOpen(true);
              }}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              disabled={row.original.status !== 'مسودة'}
              onClick={() => void deleteMutation.mutate(row.original.id)}
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        ),
      },
    ],
    [confirmingId, deleteMutation, params.page, params.pageSize, ui],
  );

  const onProductPick = (productId: string) => {
    const p = products?.find((x) => x.id === Number(productId));
    if (p) {
      setForm((f) => ({
        ...f,
        productId,
        productName: p.nameAr,
        unitPrice: String(p.costPrice || p.sellingPrice),
      }));
    } else {
      setForm((f) => ({ ...f, productId }));
    }
  };

  const save = async () => {
    if (!form.supplierId || !form.productId || !form.warehouseId || !form.branchId) {
      toast.error(ui('يرجى تعبئة الحقول المطلوبة'));
      return;
    }
    const quantity = Number(form.quantity);
    const unitPrice = Number(form.unitPrice);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      toast.error(ui('الكمية يجب أن تكون أكبر من صفر'));
      return;
    }
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      toast.error(ui('سعر الوحدة يجب ألا يكون سالباً'));
      return;
    }
    setSaving(true);
    try {
      const payload = {
        supplierId: Number(form.supplierId),
        productId: Number(form.productId),
        productName: form.productName,
        quantity,
        unitPrice,
        warehouseId: Number(form.warehouseId),
        branchId: Number(form.branchId),
        notes: form.notes || undefined,
      };
      if (editId) await api.put(`/quick-purchase-orders/${editId}`, payload);
      else await api.post('/quick-purchase-orders', payload);
      toast.success(ui(editId ? 'تم التحديث' : ui('تم إنشاء أمر الشراء')));
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
      title={ui('أمر شراء سريع')}
      description={ui('إنشاء أمر شراء واستلام البضاعة في المخزون عند التأكيد')}
      actions={
        <Button
          onClick={() => {
            setEditId(null);
            setForm({
              ...EMPTY,
              branchId: String(branches?.[0]?.id ?? ''),
              warehouseId: String(warehouses?.[0]?.id ?? ''),
            });
            setOpen(true);
          }}
        >
          <Plus className="ms-1 h-4 w-4" />
          {ui('أمر جديد')}
        </Button>
      }
    >
      <FilterBar fields={filters} searchPlaceholder={ui('بحث في أوامر الشراء…')} />
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
        <DialogContent size="lg" className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{ui(editId ? 'تعديل أمر شراء' : 'أمر شراء سريع')}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-1">
              <Label>{ui('المورد')}</Label>
              <select
                className="rounded-md border bg-background px-3 py-2 text-sm"
                value={form.supplierId}
                onChange={(e) => setForm((f) => ({ ...f, supplierId: e.target.value }))}
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
              <Label>{ui('المنتج')}</Label>
              <select
                className="rounded-md border bg-background px-3 py-2 text-sm"
                value={form.productId}
                onChange={(e) => onProductPick(e.target.value)}
              >
                <option value="">{ui('—')}</option>
                {(products ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nameAr} ({p.productCode})
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1">
                <Label>{ui('الكمية')}</Label>
                <Input
                  type="number"
                  className="nums"
                  value={form.quantity}
                  onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
                />
              </div>
              <div className="grid gap-1">
                <Label>{ui('سعر الوحدة')}</Label>
                <Input
                  type="number"
                  className="nums"
                  value={form.unitPrice}
                  onChange={(e) => setForm((f) => ({ ...f, unitPrice: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid gap-1">
              <Label>{ui('المستودع')}</Label>
              <select
                className="rounded-md border bg-background px-3 py-2 text-sm"
                value={form.warehouseId}
                onChange={(e) => setForm((f) => ({ ...f, warehouseId: e.target.value }))}
              >
                <option value="">{ui('—')}</option>
                {(warehouses ?? []).map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.nameAr}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1">
              <Label>{ui('الفرع')}</Label>
              <select
                className="rounded-md border bg-background px-3 py-2 text-sm"
                value={form.branchId}
                onChange={(e) => setForm((f) => ({ ...f, branchId: e.target.value }))}
              >
                {(branches ?? []).map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1">
              <Label>{ui('ملاحظات')}</Label>
              <Input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
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
