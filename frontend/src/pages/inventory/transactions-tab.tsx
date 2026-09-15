import type { ColumnDef } from '@tanstack/react-table';
import { Check, Plus, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { PaginatedResponse } from '@/components/common/data-table';
import { DataTable } from '@/components/common/data-table';
import { ListPageShell } from '@/components/common/list-page-shell';
import { StatusBadge } from '@/components/common/status-badge';
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
import { localToday } from '@/lib/formatters';
import { useListQuery } from '@/lib/use-list-query';
import { toArabicDigits } from '@/lib/utils';
import type { WarehouseOption } from '@/types/gym-sales';
import type { InventoryTransactionRow, ProductListItem } from '@/types/inventory';
import { useLocale } from '@/store/locale';
import { indexColumn } from './simple-crud-tab';

interface LineDraft {
  productId: string;
  itemName: string;
  quantity: string;
  unit: string;
  costPrice: number;
}

const transactionTypeLabel = (type: string) => ({
  issue: 'استهلاك / صرف مباشر',
  damage: 'هالك أو فاقد',
  transfer: 'تحويل بين المخازن',
}[type] ?? type);

const TXN_EMPTY = {
  reference: '',
  txnType: 'damage',
  txnDate: '',
  branchId: '',
  sourceWarehouseId: '',
  targetWarehouseId: '',
  notes: '',
  reason: '',
};

export function TransactionsTab() {
  const { ui } = useLocale();
  const { params, setParams } = useListQuery();
  const { data: branches } = useBranches();
  const { data, isLoading, isError, error, refetch } = usePaginatedList<InventoryTransactionRow>(
    'inventory-transactions',
    params,
  );

  const { data: txnTypes } = useQuery({
    queryKey: ['inventory-transactions', 'types'],
    queryFn: async () => {
      const { data: types } = await api.get<string[]>('/inventory-transactions/types');
      return types;
    },
  });

  const { data: warehouses } = useQuery({
    queryKey: ['warehouses', 'transactions'],
    queryFn: async () => {
      const { data: r } = await api.get<PaginatedResponse<WarehouseOption>>('/warehouses', {
        params: { page: 1, pageSize: 200 },
      });
      return r.data;
    },
  });

  const { data: products } = useQuery({
    queryKey: ['products', 'transactions'],
    queryFn: async () => {
      const { data: r } = await api.get<PaginatedResponse<ProductListItem>>('/products', {
        params: { page: 1, pageSize: 200 },
      });
      return r.data;
    },
  });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(TXN_EMPTY);
  const [lines, setLines] = useState<LineDraft[]>([{ productId: '', itemName: '', quantity: '1', unit: '', costPrice: 0 }]);
  const [saving, setSaving] = useState(false);
  // Tracks the transaction id being approved/rejected so the row action can't be double-clicked.
  const [actingId, setActingId] = useState<number | null>(null);

  const approve = async (id: number) => {
    if (actingId != null) return;
    setActingId(id);
    try {
      const ok = await confirmWithPreview(
        { title: ui('اعتماد الحركة'), confirmLabel: ui('اعتماد') },
        async () => {
          const { data } = await api.post(`/inventory-transactions/${id}/approve?dryRun=true`);
          return { rows: (data as { rows?: { label: string; before?: string; after?: string }[] }).rows };
        },
        async () => {
          await api.post(`/inventory-transactions/${id}/approve`);
        },
      );
      if (ok) {
        toast.success(ui('تم اعتماد الحركة'));
        void refetch();
      }
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setActingId(null);
    }
  };

  const reject = async (id: number) => {
    if (actingId != null) return;
    const reason = window.prompt(ui('سبب الرفض'));
    if (!reason?.trim()) return;
    setActingId(id);
    try {
      await api.post(`/inventory-transactions/${id}/reject`, { reason });
      toast.success(ui('تم رفض الحركة'));
      void refetch();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setActingId(null);
    }
  };

  const columns = useMemo<ColumnDef<InventoryTransactionRow>[]>(
    () => [
      indexColumn(params.page, params.pageSize) as ColumnDef<InventoryTransactionRow>,
      { accessorKey: 'reference', header: ui('المرجع') },
      { accessorKey: 'txnType', header: ui('النوع'), cell: ({ getValue }) => ui(transactionTypeLabel(getValue() as string)) },
      {
        accessorKey: 'status',
        header: ui('الحالة'),
        cell: ({ getValue }) => {
          const s = getValue() as string;
          return (
            <StatusBadge
              status={s === 'approved' ? 'active' : s === 'rejected' ? 'suspended' : 'unset'}
            />
          );
        },
      },
      {
        accessorKey: 'totalAmount',
        header: ui('الإجمالي'),
        cell: ({ getValue }) => <span className="nums">{toArabicDigits(getValue() as number)}</span>,
      },
      {
        id: 'actions',
        header: ui('الإجراءات'),
        cell: ({ row }) =>
          row.original.status === 'draft' ? (
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="icon"
                disabled={actingId === row.original.id}
                onClick={() => void approve(row.original.id)}
              >
                <Check className="h-4 w-4 text-success" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                disabled={actingId === row.original.id}
                onClick={() => void reject(row.original.id)}
              >
                <X className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ) : null,
      },
    ],
    [params.page, params.pageSize, ui, actingId],
  );

  const save = async () => {
    const validLines = lines.filter((l) => l.itemName && Number(l.quantity) > 0);
    if (!form.reference || !form.txnDate || !form.branchId || !validLines.length) {
      toast.error(ui('يرجى تعبئة المرجع والفرع وبند واحد على الأقل'));
      return;
    }
    if ((form.txnType === 'damage' || form.txnType === 'issue') && !form.reason.trim()) {
      toast.error(ui('اكتب سبب الهالك أو الاستهلاك المباشر لتوثيق فرق المخزون'));
      return;
    }
    if (form.txnType === 'transfer') {
      if (!form.sourceWarehouseId || !form.targetWarehouseId) {
        toast.error(ui('يجب اختيار مستودع المصدر والوجهة للتحويل'));
        return;
      }
      if (form.sourceWarehouseId === form.targetWarehouseId) {
        toast.error(ui('مستودع المصدر والوجهة يجب أن يكونا مختلفين'));
        return;
      }
    }
    setSaving(true);
    try {
      await api.post('/inventory-transactions', {
        reference: form.reference,
        txnType: form.txnType,
        txnDate: form.txnDate,
        branchId: Number(form.branchId),
        sourceWarehouseId: form.sourceWarehouseId ? Number(form.sourceWarehouseId) : undefined,
        targetWarehouseId: form.targetWarehouseId ? Number(form.targetWarehouseId) : undefined,
        notes: form.notes || undefined,
        reason: form.reason.trim() || undefined,
        items: validLines.map((l) => ({
          productId: l.productId ? Number(l.productId) : undefined,
          itemName: l.itemName,
          quantity: Number(l.quantity),
          unit: l.unit || undefined,
        })),
      });
      toast.success(ui('تم إنشاء الحركة (مسودة)'));
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
            setForm({
              ...TXN_EMPTY,
              txnDate: localToday(),
              branchId: String(branches?.[0]?.id ?? ''),
              sourceWarehouseId: String(warehouses?.[0]?.id ?? ''),
            });
            setLines([{ productId: '', itemName: '', quantity: '1', unit: '', costPrice: 0 }]);
            setOpen(true);
          }}
        >
          <Plus className="ms-1 h-4 w-4" />
          {ui('حركة جديدة')}
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
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="xl" className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{ui('تسجيل استهلاك أو هالك مخزني')}</DialogTitle>
          </DialogHeader>
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/20 dark:text-amber-100">
            {ui('استخدم «استهلاك مباشر» للخامات التي استُخدمت يدويًا، و«هالك» للفاقد أو التلف. بعد الاعتماد يُخصم الرصيد وتُسجل التكلفة والمصروف تلقائيًا.')}
          </div>
          <div className="grid gap-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1">
                <Label>{ui('المرجع')}</Label>
                <Input value={form.reference} onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value }))} />
              </div>
              <div className="grid gap-1">
                <Label>{ui('التاريخ')}</Label>
                <Input
                  type="date"
                  value={form.txnDate}
                  onChange={(e) => setForm((f) => ({ ...f, txnDate: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1">
                <Label>{ui('نوع الحركة')}</Label>
                <select
                  className="rounded-md border bg-background px-3 py-2 text-sm"
                  value={form.txnType}
                  onChange={(e) => setForm((f) => ({ ...f, txnType: e.target.value }))}
                >
                  {(txnTypes ?? ['issue', 'damage', 'transfer']).map((t) => (
                    <option key={t} value={t}>
                      {ui(transactionTypeLabel(t))}
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
            </div>
            {(form.txnType === 'damage' || form.txnType === 'issue') ? (
              <div className="grid gap-1">
                <Label>{ui('سبب الحركة')}</Label>
                <Input value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} placeholder={ui('مثال: استهلاك يدوي قبل تشغيل ربط المخزون / عبوة تالفة')} />
              </div>
            ) : null}
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1">
                <Label>{ui('مستودع المصدر')}</Label>
                <select
                  className="rounded-md border bg-background px-3 py-2 text-sm"
                  value={form.sourceWarehouseId}
                  onChange={(e) => setForm((f) => ({ ...f, sourceWarehouseId: e.target.value }))}
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
                <Label>{ui('مستودع الوجهة')}</Label>
                <select
                  className="rounded-md border bg-background px-3 py-2 text-sm"
                  value={form.targetWarehouseId}
                  onChange={(e) => setForm((f) => ({ ...f, targetWarehouseId: e.target.value }))}
                >
                  <option value="">{ui('—')}</option>
                  {(warehouses ?? []).map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.nameAr}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>{ui('البنود')}</Label>
              {lines.map((line, idx) => (
                <div key={idx} className="grid gap-2 sm:grid-cols-[minmax(220px,2fr)_120px_110px]">
                  <select
                    className="rounded-md border bg-background px-2 py-2 text-sm"
                    value={line.productId}
                    onChange={(e) => {
                      const p = products?.find((x) => x.id === Number(e.target.value));
                      setLines((prev) => {
                        const next = [...prev];
                        next[idx] = {
                          ...next[idx],
                          productId: e.target.value,
                          itemName: p ? `${p.nameAr}${p.size ? ` — ${p.size}` : ''}` : '',
                          unit: p?.unitOfMeasure ?? '',
                          costPrice: p?.costPrice ?? 0,
                        };
                        return next;
                      });
                    }}
                  >
                    <option value="">{ui('منتج')}</option>
                    {(products ?? []).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nameAr}{p.size ? ` — ${p.size}` : ''}
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
                  <div className="nums flex items-center rounded-md border bg-muted/30 px-3 text-sm text-muted-foreground">
                    {line.unit || ui('الوحدة')} · {toArabicDigits(line.costPrice.toFixed(6))}
                  </div>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setLines((prev) => [...prev, { productId: '', itemName: '', quantity: '1', unit: '', costPrice: 0 }])
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
              {ui('حفظ كمسودة')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ListPageShell>
  );
}
