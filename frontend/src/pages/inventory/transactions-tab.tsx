import type { ColumnDef } from '@tanstack/react-table';
import { Check, Eye, Plus, X } from 'lucide-react';
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
import { FilterBar } from '@/components/common/filter-bar';
import { downloadExcel } from '@/lib/export';
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
  price: string;
}

const TXN_TYPE_LABELS: Record<string, string> = { transfer: 'تحويل / صرف للبار', issue: 'صرف استهلاك داخلي', damage: 'هالك' };
const STATUS_LABELS: Record<string, string> = { draft: 'بانتظار الاعتماد', approved: 'معتمد', rejected: 'مرفوض' };
const formatTxnDate = (value?: string | null) => (value ? String(value).slice(0, 10) : '—');

const TXN_EMPTY = {
  reference: '',
  txnType: 'transfer',
  txnDate: '',
  branchId: '',
  sourceWarehouseId: '',
  targetWarehouseId: '',
  notes: '',
};

export function TransactionsTab({ drawingsOnly = false }: { drawingsOnly?: boolean } = {}) {
  const { ui } = useLocale();
  const { params, setParams } = useListQuery();
  const { data: branches } = useBranches();
  const {data:categories=[]}=useQuery({queryKey:['categories','drawing-filter'],queryFn:async()=>{const r=(await api.get('/categories',{params:{page:1,pageSize:500}})).data;return (Array.isArray(r)?r:r.data) as Array<{id:number;nameAr:string}>;}});
  const exportRows = async () => {
    const rows: InventoryTransactionRow[]=[];
    for(let page=1;;page++){
      const response=(await api.get<PaginatedResponse<InventoryTransactionRow>>(drawingsOnly?'/inventory-transactions/drawings':'/inventory-transactions',{params:{...params.filters,search:params.search,page,pageSize:500}})).data;
      rows.push(...response.data);if(rows.length>=response.total)break;if(!response.data.length)throw new Error('تعذر تحميل بقية التقرير');
    }
    await downloadExcel(rows.map((i)=>({reference:i.reference,date:i.txnDate,recipient:i.recipientName??'',reason:i.reason??'',value:i.totalAmount,status:i.status})),[{key:'reference',header:'المستند'},{key:'date',header:'التاريخ'},{key:'recipient',header:'المستفيد'},{key:'reason',header:'السبب'},{key:'value',header:'التكلفة'},{key:'status',header:'الحالة'}],'المسحوبات-والحركات');
  };
  const { data, isLoading, isError, error, refetch } = usePaginatedList<InventoryTransactionRow>(
    drawingsOnly ? 'inventory-transactions/drawings' : 'inventory-transactions',
    { ...params, filters: { ...params.filters, ...(drawingsOnly ? {businessClassification: 'management_withdrawal'} : {}) } },
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
  const [lines, setLines] = useState<LineDraft[]>([{ productId: '', itemName: '', quantity: '1', price: '0' }]);
  const [saving, setSaving] = useState(false);
  // Tracks the transaction id being approved/rejected so the row action can't be double-clicked.
  const [actingId, setActingId] = useState<number | null>(null);
  const [details, setDetails] = useState<InventoryTransactionRow | null>(null);
  const warehouseName = (id?: number | null) => (id == null ? '—' : warehouses?.find((w) => w.id === id)?.nameAr ?? `#${id}`);
  const branchName = (id?: number | null) => (id == null ? '—' : branches?.find((b) => b.id === id)?.name ?? `#${id}`);

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
      { accessorKey: 'txnDate', header: ui('التاريخ'), cell: ({ getValue }) => <span className="nums">{formatTxnDate(getValue() as string)}</span> },
      {
        id: 'route',
        header: ui('من مستودع ← إلى مستودع'),
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-sm">
            {warehouseName(row.original.sourceWarehouseId)} <span className="text-muted-foreground">←</span> {warehouseName(row.original.targetWarehouseId)}
          </span>
        ),
      },
      { accessorKey: 'recipientName', header: ui('المسحوب له') },
      { accessorKey: 'reason', header: ui('السبب') },
      { accessorKey: 'txnType', header: ui('النوع'), cell: ({row}) => ui(TXN_TYPE_LABELS[row.original.txnType] ?? row.original.txnType) },
      {
        accessorKey: 'status',
        header: ui('الحالة'),
        cell: ({ getValue }) => {
          const s = getValue() as string;
          return (
            <StatusBadge
              status={s === 'approved' ? 'active' : s === 'rejected' ? 'suspended' : 'pending'}
              label={ui(STATUS_LABELS[s] ?? 'بانتظار الاعتماد')}
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
        cell: ({ row }) => (
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="icon"
                aria-label={ui('التفاصيل')}
                title={ui('التفاصيل')}
                onClick={() => setDetails(row.original)}
              >
                <Eye className="h-4 w-4" />
              </Button>
              {row.original.status === 'draft' && <>
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
              </>}
            </div>
          ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [params.page, params.pageSize, ui, actingId, warehouses],
  );

  const save = async () => {
    const validLines = lines.filter((l) => l.itemName && Number(l.quantity) > 0);
    if (!form.reference || !form.branchId || !validLines.length) {
      toast.error(ui('يرجى تعبئة المرجع والفرع وبند واحد على الأقل'));
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
        items: validLines.map((l) => ({
          productId: l.productId ? Number(l.productId) : undefined,
          itemName: l.itemName,
          quantity: Number(l.quantity),
          price: Number(l.price) || 0,
          // Round to 2 decimals to avoid binary-float artifacts (e.g. 3 * 0.1 = 0.30000000000000004).
          total: Math.round(Number(l.quantity) * (Number(l.price) || 0) * 100) / 100,
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
        <Button className={drawingsOnly ? 'hidden' : ''}
          onClick={() => {
            setForm({
              ...TXN_EMPTY,
              txnDate: localToday(),
              branchId: String(branches?.[0]?.id ?? ''),
              sourceWarehouseId: String(warehouses?.find((w)=>w.branchId===branches?.[0]?.id)?.id ?? ''),
            });
            setLines([{ productId: '', itemName: '', quantity: '1', price: '0' }]);
            setOpen(true);
          }}
        >
          <Plus className="ms-1 h-4 w-4" />
          {ui('حركة جديدة')}
        </Button>
      }
    >
      <FilterBar fields={[
        {key:'dateFrom',label:ui('من تاريخ'),type:'date'},
        {key:'dateTo',label:ui('إلى تاريخ'),type:'date'},
        {key:'branchId',label:ui('الفرع'),type:'select',options:(branches??[]).map((b)=>({value:String(b.id),label:b.name ?? `#${b.id}`}))},
        {key:'warehouseId',label:ui('المخزن / البار'),type:'select',options:(warehouses??[]).map((w)=>({value:String(w.id),label:w.nameAr}))},
        {key:'status',label:ui('الحالة'),type:'select',options:[{value:'draft',label:ui('بانتظار الاعتماد')},{value:'approved',label:ui('معتمد')},{value:'rejected',label:ui('مرفوض')}]},
        ...(drawingsOnly ? [{key:'cafeCategoryId',label:ui('الفئة'),type:'select' as const,options:categories.map((c)=>({value:String(c.id),label:c.nameAr}))}] : []),
      ]} />
      <DataTable
        onExportExcel={exportRows}
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

      <Dialog open={!!details} onOpenChange={(o) => !o && setDetails(null)}>
        <DialogContent size="lg" className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{ui('تفاصيل الحركة')} {details?.reference}</DialogTitle>
          </DialogHeader>
          {details && (
            <div className="space-y-4">
              <dl className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/20 p-3 text-sm">
                <div><dt className="text-muted-foreground">{ui('التاريخ')}</dt><dd className="nums font-medium">{formatTxnDate(details.txnDate)}</dd></div>
                <div><dt className="text-muted-foreground">{ui('النوع')}</dt><dd className="font-medium">{ui(TXN_TYPE_LABELS[details.txnType] ?? details.txnType)}</dd></div>
                <div><dt className="text-muted-foreground">{ui('من مستودع')}</dt><dd className="font-medium">{warehouseName(details.sourceWarehouseId)}</dd></div>
                <div><dt className="text-muted-foreground">{ui('إلى مستودع')}</dt><dd className="font-medium">{warehouseName(details.targetWarehouseId)}</dd></div>
                <div><dt className="text-muted-foreground">{ui('الفرع')}</dt><dd className="font-medium">{branchName(details.branchId)}</dd></div>
                <div><dt className="text-muted-foreground">{ui('الحالة')}</dt><dd className="font-medium">{ui(STATUS_LABELS[details.status] ?? details.status)}</dd></div>
                {details.recipientName && <div><dt className="text-muted-foreground">{ui('المسحوب له')}</dt><dd className="font-medium">{details.recipientName}</dd></div>}
                {details.reason && <div><dt className="text-muted-foreground">{ui('السبب')}</dt><dd className="font-medium">{details.reason}</dd></div>}
                {details.rejectionReason && <div className="col-span-2"><dt className="text-muted-foreground">{ui('سبب الرفض')}</dt><dd className="font-medium text-destructive">{details.rejectionReason}</dd></div>}
                {details.notes && <div className="col-span-2"><dt className="text-muted-foreground">{ui('ملاحظات')}</dt><dd>{details.notes}</dd></div>}
              </dl>
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-muted-foreground">
                    <tr>
                      <th className="p-2 text-start">{ui('الصنف')}</th>
                      <th className="p-2 text-center">{ui('الكمية')}</th>
                      <th className="p-2 text-center">{ui('سعر التكلفة')}</th>
                      <th className="p-2 text-center">{ui('الإجمالي')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(details.items ?? []).map((item) => (
                      <tr key={item.id} className="border-t">
                        <td className="p-2">{item.itemName}</td>
                        <td className="nums p-2 text-center">{item.quantity}{item.unit ? ` ${item.unit}` : ''}</td>
                        <td className="nums p-2 text-center">{item.price}</td>
                        <td className="nums p-2 text-center">{item.total}</td>
                      </tr>
                    ))}
                    {!details.items?.length && <tr><td colSpan={4} className="p-4 text-center text-muted-foreground">{ui('لا توجد بنود')}</td></tr>}
                  </tbody>
                  <tfoot>
                    <tr className="border-t font-semibold">
                      <td className="p-2" colSpan={3}>{ui('الإجمالي')}</td>
                      <td className="nums p-2 text-center">{details.totalAmount}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetails(null)}>{ui('إغلاق')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="xl" className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{ui('حركة مخزنية جديدة')}</DialogTitle>
          </DialogHeader>
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
                      {ui(({transfer: 'تحويل / صرف للبار', issue: 'صرف استهلاك داخلي', damage: 'هالك'} as Record<string,string>)[t] ?? t)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-1">
                <Label>{ui('الفرع')}</Label>
                <select
                  className="rounded-md border bg-background px-3 py-2 text-sm"
                  value={form.branchId}
                  onChange={(e) => setForm((f) => ({ ...f, branchId: e.target.value, sourceWarehouseId:'', targetWarehouseId:'' }))}
                >
                  {(branches ?? []).map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1">
                <Label>{ui('مستودع المصدر')}</Label>
                <select
                  className="rounded-md border bg-background px-3 py-2 text-sm"
                  value={form.sourceWarehouseId}
                  onChange={(e) => setForm((f) => ({ ...f, sourceWarehouseId: e.target.value, branchId:String(warehouses?.find((w)=>w.id===Number(e.target.value))?.branchId ?? f.branchId) }))}
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
                <div key={idx} className="grid grid-cols-1 gap-2 rounded-lg border bg-muted/20 p-3 sm:grid-cols-4">
                  <div className="grid gap-1 sm:col-span-2">
                  <Label className="text-xs">{ui('الصنف')}</Label>
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
                          price: String(p?.costPrice ?? 0),
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
                  </div>
                  <div className="grid gap-1">
                  <Label className="text-xs">{ui('الكمية')}</Label>
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
                  </div>
                  <div className="grid gap-1">
                  <Label className="text-xs">{ui('سعر التكلفة')}</Label>
                  <Input
                    type="number"
                    placeholder={ui('سعر')}
                    className="nums"
                    value={line.price}
                    onChange={(e) => {
                      setLines((prev) => {
                        const next = [...prev];
                        next[idx] = { ...next[idx], price: e.target.value };
                        return next;
                      });
                    }}
                  />
                  </div>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setLines((prev) => [...prev, { productId: '', itemName: '', quantity: '1', price: '0' }])
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
