import type { ColumnDef } from '@tanstack/react-table';
import { Check, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { DataTable, type PaginatedResponse } from '@/components/common/data-table';
import { FilterBar, type FilterField } from '@/components/common/filter-bar';
import { Badge } from '@/components/ui/badge';
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
import { usePaginatedList } from '@/lib/api-hooks';
import { useListQuery } from '@/lib/use-list-query';
import { toArabicDigits } from '@/lib/utils';
import type { GoodsReceiptRow, PurchaseOrderRow, WarehouseOption } from '@/types/gym-sales';
import { useLocale } from '@/store/locale';
import { GymSalesPageShell } from '../gym-sales/shell';
import { indexColumn } from '../inventory/simple-crud-tab';

interface GrnLineDraft {
  name: string;
  orderedQty: string;
  receivedQty: string;
}

export function ProcurementGoodsReceiptsPage() {
  const { ui } = useLocale();
  const { params, setParams } = useListQuery();
  const { data: branches } = useBranches();
  const { data, isLoading, isError, refetch } = usePaginatedList<GoodsReceiptRow>('goods-receipts', params);

  const { data: purchaseOrders } = useQuery({
    queryKey: ['purchase-orders', 'options'],
    queryFn: async () => {
      const { data: r } = await api.get<PaginatedResponse<PurchaseOrderRow>>('/purchase-orders', {
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
  const [purchaseOrderId, setPurchaseOrderId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [receiverName, setReceiverName] = useState('');
  const [receiptDate, setReceiptDate] = useState('');
  const [branchId, setBranchId] = useState('');
  const [lines, setLines] = useState<GrnLineDraft[]>([]);
  const [saving, setSaving] = useState(false);
  const [confirmingId, setConfirmingId] = useState<number | null>(null);

  const filters: FilterField[] = [
    {
      key: 'branchId',
      label: ui('الفرع'),
      type: 'select',
      options: (branches ?? []).map((b) => ({ value: String(b.id), label: b.name ?? '—' })),
    },
  ];

  const confirmReceipt = async (id: number) => {
    if (confirmingId !== null) return;
    setConfirmingId(id);
    try {
      const ok = await confirmWithPreview(
        { title: ui('تأكيد الاستلام'), confirmLabel: ui('تأكيد وترحيل') },
        async () => {
          const { data } = await api.patch(`/goods-receipts/${id}/status?dryRun=true`, {
            status: 'completed',
          });
          return {
            rows: (data as { rows?: { label: string; before?: string; after?: string }[] }).rows,
            warning: (data as { warning?: string }).warning,
          };
        },
        async () => {
          await api.patch(`/goods-receipts/${id}/status`, { status: 'completed' });
        },
      );
      if (ok) {
        toast.success(ui('تم تأكيد الاستلام وترحيل المخزون'));
        void refetch();
      }
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setConfirmingId(null);
    }
  };

  const loadPoItems = async (poId: string) => {
    setPurchaseOrderId(poId);
    if (!poId) {
      setLines([]);
      return;
    }
    try {
      const { data: po } = await api.get<PurchaseOrderRow>(`/purchase-orders/${poId}`);
      setBranchId(String(po.branchId));
      setLines(
        (po.items ?? []).map((i) => ({
          name: i.name,
          orderedQty: String(i.quantity),
          receivedQty: String(i.quantity),
        })),
      );
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const columns = useMemo<ColumnDef<GoodsReceiptRow>[]>(
    () => [
      indexColumn(params.page, params.pageSize) as ColumnDef<GoodsReceiptRow>,
      { accessorKey: 'grnNumber', header: ui('رقم الاستلام') },
      { accessorKey: 'purchaseOrderId', header: ui('أمر الشراء') },
      { accessorKey: 'receiverName', header: ui('المستلم') },
      { accessorKey: 'status', header: ui('الحالة') },
      {
        id: 'stockPosted',
        header: ui('ترحيل المخزون'),
        cell: ({ row }) =>
          row.original.stockPosted ? (
            <Badge variant="default">{ui('مرحّل')}</Badge>
          ) : (
            <Badge variant="secondary">{ui('غير مرحّل')}</Badge>
          ),
      },
      {
        id: 'actions',
        header: ui('الإجراءات'),
        cell: ({ row }) =>
          row.original.status === 'draft' && !row.original.stockPosted ? (
            <Button
              variant="ghost"
              size="icon"
              disabled={confirmingId !== null}
              onClick={() => void confirmReceipt(row.original.id)}
            >
              <Check className="h-4 w-4 text-success" />
            </Button>
          ) : null,
      },
    ],
    [confirmingId, params.page, params.pageSize, refetch, ui],
  );

  const save = async () => {
    const validLines = lines.filter((l) => l.name.trim() && Number(l.receivedQty) >= 0);
    if (!purchaseOrderId || !receiverName || !branchId || !validLines.length) {
      toast.error(ui('يرجى تعبئة البيانات وإضافة بند واحد على الأقل'));
      return;
    }
    for (const l of validLines) {
      const ordered = Number(l.orderedQty);
      const received = Number(l.receivedQty);
      if (received > ordered) {
        toast.error(ui('الكمية المستلمة لا يمكن أن تتجاوز الكمية المطلوبة'));
        return;
      }
    }
    setSaving(true);
    try {
      await api.post('/goods-receipts', {
        purchaseOrderId: Number(purchaseOrderId),
        warehouseId: warehouseId ? Number(warehouseId) : undefined,
        receiverName,
        receiptDate: receiptDate || undefined,
        branchId: Number(branchId),
        items: validLines.map((l) => ({
          name: l.name,
          orderedQty: Number(l.orderedQty),
          receivedQty: Number(l.receivedQty),
        })),
      });
      toast.success(ui('تم إنشاء إذن الاستلام'));
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
      title={ui('إذن استلام البضاعة')}
      description={ui('استلام البضاعة من أوامر الشراء وترحيلها للمخزون')}
      actions={
        <Button
          onClick={() => {
            setPurchaseOrderId('');
            setWarehouseId(String(warehouses?.[0]?.id ?? ''));
            setReceiverName('');
            setReceiptDate('');
            setBranchId(String(branches?.[0]?.id ?? ''));
            setLines([]);
            setOpen(true);
          }}
        >
          <Plus className="ms-1 h-4 w-4" />
          {ui('استلام جديد')}
        </Button>
      }
    >
      <FilterBar fields={filters} searchPlaceholder={ui('بحث في إذونات الاستلام…')} />
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
            <DialogTitle>{ui('إذن استلام من أمر شراء')}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1">
                <Label>{ui('أمر الشراء')}</Label>
                <select
                  className="rounded-md border bg-background px-3 py-2 text-sm"
                  value={purchaseOrderId}
                  onChange={(e) => void loadPoItems(e.target.value)}
                >
                  <option value="">{ui('—')}</option>
                  {(purchaseOrders ?? []).map((po) => (
                    <option key={po.id} value={po.id}>
                      {po.poNumber}
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
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1">
                <Label>{ui('اسم المستلم')}</Label>
                <Input value={receiverName} onChange={(e) => setReceiverName(e.target.value)} />
              </div>
              <div className="grid gap-1">
                <Label>{ui('تاريخ الاستلام')}</Label>
                <Input type="date" value={receiptDate} onChange={(e) => setReceiptDate(e.target.value)} />
              </div>
            </div>
            {lines.length > 0 && (
              <div className="space-y-2">
                <Label>{ui('البنود')}</Label>
                {lines.map((line, idx) => (
                  <div key={idx} className="grid grid-cols-3 gap-2 text-sm">
                    <span className="col-span-1 truncate py-2">{line.name}</span>
                    <Input
                      type="number"
                      className="nums"
                      placeholder={ui('مطلوب')}
                      value={line.orderedQty}
                      readOnly
                    />
                    <Input
                      type="number"
                      className="nums"
                      placeholder={ui('مستلم')}
                      value={line.receivedQty}
                      onChange={(e) => {
                        setLines((prev) => {
                          const next = [...prev];
                          next[idx] = { ...next[idx], receivedQty: e.target.value };
                          return next;
                        });
                      }}
                    />
                  </div>
                ))}
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
    </GymSalesPageShell>
  );
}
