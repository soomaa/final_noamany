import type { ColumnDef } from '@tanstack/react-table';
import { Check, Eye, Pencil, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
import { confirm, confirmWithPreview } from '@/lib/confirm';
import { useMutationWithToast, usePaginatedList } from '@/lib/api-hooks';
import { useListQuery } from '@/lib/use-list-query';
import { toArabicDigits } from '@/lib/utils';
import type { PurchaseReturnRow, WarehouseOption } from '@/types/gym-sales';
import type { NamedEntity } from '@/types/inventory';
import type { PaginatedResponse } from '@/components/common/data-table';
import { useLocale } from '@/store/locale';
import { GymSalesPageShell } from '../gym-sales/shell';
import { indexColumn } from '../inventory/simple-crud-tab';

interface LineDraft {
  productId: string;
  productName: string;
  purchasedQty: number;
  purchaseTotal: number;
  unitPrice: number;
}

interface SourceInvoice {
  id: number;
  invoiceNumber: string;
  supplierInvoiceNumber?: string | null;
  supplierId: number;
  warehouseId: number;
  branchId: number;
  invoiceDate?: string | null;
  subtotal: number;
  taxAmount: number;
  discountAmount: number;
  totalAmount: number;
  items: Array<{ productId: number | null; productName: string; quantity: number; baseQuantity?: number | null; totalAmount: number }>;
}

function InfoCell({ label, value }: { label: string; value: ReactNode }) {
  return (
    <>
      <div className="border-b bg-muted/60 px-3 py-2 text-sm font-semibold">{label}</div>
      <div className="border-b px-3 py-2 text-sm">{value || '—'}</div>
    </>
  );
}

export function ProcurementReturnsPage() {
  const queryClient=useQueryClient();
  const [searchParams] = useSearchParams();
  const [sourceInvoiceId, setSourceInvoiceId] = useState(searchParams.get('invoiceId') ?? '');
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

  const { data: warehouses } = useQuery({
    queryKey: ['warehouses', 'options'],
    queryFn: async () => {
      const { data: r } = await api.get<PaginatedResponse<WarehouseOption>>('/warehouses', {
        params: { page: 1, pageSize: 200 },
      });
      return r.data;
    },
  });

  const [open, setOpen] = useState(!!searchParams.get('invoiceId'));
  const [mode, setMode] = useState<'create' | 'edit' | 'view'>('create');
  const [current, setCurrent] = useState<PurchaseReturnRow | null>(null);
  const [notes, setNotes] = useState('');
  const [returnQty, setReturnQty] = useState<Record<string, string>>({});
  const [removed, setRemoved] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [approvingId, setApprovingId] = useState<number | null>(null);
  const {data: sourceInvoices = []} = useQuery({queryKey:['supplier-invoices','return-options'],queryFn:async () => (await api.get<PaginatedResponse<{id:number;invoiceNumber:string;isOpeningBalance?:boolean}>>('/supplier-invoices',{params:{page:1,pageSize:200}})).data.data});
  const {data: sourceInvoice, isFetching: loadingInvoice} = useQuery({queryKey:['supplier-invoices','return-source',sourceInvoiceId],enabled:!!sourceInvoiceId,queryFn:async () => (await api.get<SourceInvoice>(`/supplier-invoices/${sourceInvoiceId}`)).data});

  // Mirrors the server: one line per product, quantity in base unit, unit value includes invoice discount/tax.
  const lines = useMemo<LineDraft[]>(() => {
    if (!sourceInvoice) return [];
    const factor = sourceInvoice.subtotal > 0 ? sourceInvoice.totalAmount / sourceInvoice.subtotal : 1;
    const byProduct = new Map<number, LineDraft>();
    for (const item of sourceInvoice.items) {
      if (!item.productId) continue;
      const row = byProduct.get(item.productId) ?? { productId: String(item.productId), productName: item.productName, purchasedQty: 0, purchaseTotal: 0, unitPrice: 0 };
      row.purchasedQty += Number(item.baseQuantity ?? item.quantity);
      row.purchaseTotal += Number(item.totalAmount);
      byProduct.set(item.productId, row);
    }
    return [...byProduct.values()].map((row) => ({
      ...row,
      unitPrice: row.purchasedQty > 0 ? Math.round((row.purchaseTotal / row.purchasedQty) * factor * 100) / 100 : 0,
    }));
  }, [sourceInvoice]);
  const visibleLines = lines.filter((l) => !removed.includes(l.productId));
  const lineReturnTotal = (l: LineDraft) => Math.round((Number(returnQty[l.productId]) || 0) * l.unitPrice * 100) / 100;

  const pickInvoice = (id: string) => {
    setSourceInvoiceId(id);
    setReturnQty({});
    setRemoved([]);
  };

  /** Opens an existing return for editing (draft only) or read-only details. */
  const openExisting = (row: PurchaseReturnRow, nextMode: 'edit' | 'view') => {
    setMode(nextMode);
    setCurrent(row);
    setSourceInvoiceId(row.supplierInvoiceId ? String(row.supplierInvoiceId) : '');
    setReturnQty(Object.fromEntries((row.items ?? []).map((i) => [String(i.productId), String(i.quantity)])));
    setRemoved([]);
    setNotes(row.notes ?? '');
    setOpen(true);
  };
  const readOnly = mode === 'view';
  // In details mode show only what was returned; legacy returns without a source invoice fall back to their own items.
  const shownLines: LineDraft[] = readOnly
    ? sourceInvoice
      ? visibleLines.filter((l) => Number(returnQty[l.productId]) > 0)
      : (current?.items ?? []).map((i) => ({ productId: String(i.productId), productName: i.productName, purchasedQty: 0, purchaseTotal: 0, unitPrice: i.unitPrice }))
    : visibleLines;
  const shownTotal = shownLines.reduce((sum, l) => sum + lineReturnTotal(l), 0);

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
        await Promise.all(['supplier-invoices','supplier-debts','supplier-statement','products','cafe-products','inventory-balances-report'].map((key)=>queryClient.invalidateQueries({queryKey:[key]})));
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
      { accessorKey: 'returnNumber', header: ui('رقم الفاتورة') },
      {
        accessorKey: 'returnDate',
        header: ui('تاريخ فاتورة المرتجع'),
        cell: ({ getValue }) => <span className="nums">{(getValue() as string) ?? '—'}</span>,
      },
      {
        accessorKey: 'supplierInvoiceNumber',
        header: ui('رقم فاتورة المشتريات'),
        cell: ({ getValue }) => (getValue() as string) || '—',
      },
      {
        id: 'warehouse',
        header: ui('المخزن'),
        cell: ({ row }) => warehouses?.find((w) => w.id === row.original.warehouseId)?.nameAr ?? '—',
      },
      {
        id: 'branch',
        header: ui('الفرع'),
        cell: ({ row }) => branches?.find((b) => b.id === row.original.branchId)?.name ?? '—',
      },
      {
        id: 'supplier',
        header: ui('المورد'),
        cell: ({ row }) => suppliers?.find((s) => s.id === row.original.supplierId)?.nameAr ?? '—',
      },
      {
        accessorKey: 'createdByName',
        header: ui('الموظف'),
        cell: ({ getValue }) => (getValue() as string) || '—',
      },
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
            <Button variant="ghost" size="icon" title={ui('تفاصيل')} onClick={() => openExisting(row.original, 'view')}>
              <Eye className="h-4 w-4" />
            </Button>
            {row.original.status === 'مسودة' && row.original.supplierInvoiceId && (
              <Button variant="ghost" size="icon" title={ui('تعديل')} onClick={() => openExisting(row.original, 'edit')}>
                <Pencil className="h-4 w-4 text-primary" />
              </Button>
            )}
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
              <Button
                variant="ghost"
                size="icon"
                title={ui('حذف')}
                onClick={async () => {
                  if (await confirm({ title: ui('حذف المرتجع'), description: row.original.returnNumber, confirmLabel: ui('حذف'), variant: 'destructive' })) deleteMutation.mutate(row.original.id);
                }}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            )}
          </div>
        ),
      },
    ],
    [approvingId, deleteMutation, params.page, params.pageSize, ui, warehouses, branches, suppliers],
  );

  const save = async () => {
    if (!sourceInvoiceId || !sourceInvoice) return toast.error(ui('اختر فاتورة الشراء الأصلية'));
    const validLines = visibleLines.filter((l) => Number(returnQty[l.productId]) > 0);
    if (!validLines.length) {
      toast.error(ui('أدخل الكمية المرتجعة لصنف واحد على الأقل'));
      return;
    }
    const over = validLines.find((l) => Number(returnQty[l.productId]) > l.purchasedQty);
    if (over) {
      toast.error(`${ui('الكمية المرتجعة أكبر من الكمية المشتراة')}: ${over.productName}`);
      return;
    }
    setSaving(true);
    try {
      const body = {
        supplierInvoiceId: Number(sourceInvoiceId),
        supplierId: sourceInvoice.supplierId,
        warehouseId: sourceInvoice.warehouseId,
        branchId: sourceInvoice.branchId,
        notes: notes || undefined,
        items: validLines.map((l) => ({
          productId: Number(l.productId),
          productName: l.productName,
          quantity: Number(returnQty[l.productId]),
          unitPrice: l.unitPrice,
        })),
      };
      if (mode === 'edit' && current) {
        await api.put(`/purchase-returns/${current.id}`, body);
        toast.success(ui('تم تعديل مرتجع المشتريات'));
      } else {
        await api.post('/purchase-returns', body);
        toast.success(ui('تم إنشاء مرتجع المشتريات'));
      }
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
            setMode('create');
            setCurrent(null);
            pickInvoice('');
            setNotes('');
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
            <DialogTitle>{ui(mode === 'view' ? 'تفاصيل مرتجع المشتريات' : mode === 'edit' ? 'تعديل مرتجع المشتريات' : 'مرتجع مشتريات جديد')}</DialogTitle>
            {current && <p className="text-sm text-muted-foreground">{ui('رقم الفاتورة')}: {current.returnNumber} · {ui('تاريخ فاتورة المرتجع')}: <span className="nums">{current.returnDate}</span> · {ui('الموظف')}: {current.createdByName ?? '—'} · {ui('الحالة')}: {ui(current.status)}</p>}
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-1">
              <Label>{ui('فاتورة الشراء الأصلية')}</Label>
              <select className="h-10 w-full rounded-md border bg-background px-3" value={sourceInvoiceId} disabled={mode !== 'create'} onChange={(e) => pickInvoice(e.target.value)}>
                <option value="">{ui('اختر الفاتورة')}</option>
                {sourceInvoices.filter((i) => !i.isOpeningBalance).map((i) => <option key={i.id} value={i.id}>{i.invoiceNumber}</option>)}
              </select>
              <p className="text-xs text-muted-foreground">{ui('أدخل كمية المرتجع بوحدة المخزون الأساسية؛ السعر والمورد والمكان تُراجع من الفاتورة الأصلية.')}</p>
            </div>

            {!sourceInvoiceId && !readOnly && (
              <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                {ui('اختر فاتورة الشراء لعرض بياناتها وأصنافها')}
              </div>
            )}
            {sourceInvoiceId && loadingInvoice && !sourceInvoice && (
              <div className="p-6 text-center text-sm text-muted-foreground">{ui('جاري التحميل...')}</div>
            )}

            {(sourceInvoice || (readOnly && current)) && (
              <>
                {sourceInvoice && <div className="grid grid-cols-2 overflow-hidden rounded-md border md:grid-cols-4">
                  <InfoCell label={ui('كود الفاتورة')} value={sourceInvoice.invoiceNumber} />
                  <InfoCell label={ui('تاريخ تسجيل الفاتورة')} value={<span className="nums">{sourceInvoice.invoiceDate ?? ''}</span>} />
                  <InfoCell label={ui('اسم المورد')} value={suppliers?.find((s) => s.id === sourceInvoice.supplierId)?.nameAr} />
                  <InfoCell label={ui('رقم فاتورة المورد')} value={sourceInvoice.supplierInvoiceNumber} />
                  <InfoCell label={ui('الفرع')} value={branches?.find((b) => b.id === sourceInvoice.branchId)?.name} />
                  <InfoCell label={ui('المخزن')} value={warehouses?.find((w) => w.id === sourceInvoice.warehouseId)?.nameAr} />
                  <InfoCell label={ui('قيمة الفاتورة قبل الخصم')} value={<span className="nums">{toArabicDigits(sourceInvoice.subtotal)}</span>} />
                  <InfoCell label={ui('الخصم')} value={<span className="nums">{toArabicDigits(sourceInvoice.discountAmount)}</span>} />
                  <InfoCell label={ui('الضريبة')} value={<span className="nums">{toArabicDigits(sourceInvoice.taxAmount)}</span>} />
                  <InfoCell label={ui('قيمة الفاتورة بعد الخصم')} value={<span className="nums">{toArabicDigits(sourceInvoice.totalAmount)}</span>} />
                </div>}

                <div className="overflow-x-auto rounded-md border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/60">
                      <tr className="text-center">
                        <th className="p-2">{ui('م')}</th>
                        <th className="p-2">{ui('اسم الصنف')}</th>
                        <th className="p-2">{ui('الكمية')}</th>
                        <th className="p-2">{ui('إجمالي تكلفة الشراء')}</th>
                        <th className="p-2">{ui('سعر شراء الوحدة')}</th>
                        <th className="p-2">{ui('الكمية المرتجعة')}</th>
                        <th className="p-2">{ui('إجمالي تكلفة المرتجع')}</th>
                        <th className="p-2">{!readOnly && ui('الإجراء')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shownLines.map((line, idx) => (
                        <tr key={line.productId} className="border-t text-center">
                          <td className="p-2 nums">{toArabicDigits(idx + 1)}</td>
                          <td className="p-2"><Input readOnly value={line.productName} className="bg-muted/40 text-center" /></td>
                          <td className="p-2"><Input readOnly value={line.purchasedQty} className="nums bg-muted/40 text-center" /></td>
                          <td className="p-2"><Input readOnly value={line.purchaseTotal} className="nums bg-muted/40 text-center" /></td>
                          <td className="p-2"><Input readOnly value={line.unitPrice} className="nums bg-muted/40 text-center" /></td>
                          <td className="p-2">
                            <Input
                              type="number"
                              min={0}
                              max={line.purchasedQty}
                              readOnly={readOnly}
                              className="nums text-center"
                              value={returnQty[line.productId] ?? ''}
                              onChange={(e) => setReturnQty((prev) => ({ ...prev, [line.productId]: e.target.value }))}
                            />
                          </td>
                          <td className="p-2"><Input readOnly value={lineReturnTotal(line).toFixed(2)} className="nums bg-muted/40 text-center" /></td>
                          <td className="p-2">
                            {!readOnly && (
                              <Button type="button" variant="destructive" size="icon" onClick={() => setRemoved((prev) => [...prev, line.productId])}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))}
                      {!shownLines.length && (
                        <tr><td colSpan={8} className="p-4 text-center text-muted-foreground">{ui('لا توجد أصناف')}</td></tr>
                      )}
                    </tbody>
                    <tfoot>
                      <tr className="border-t">
                        <td colSpan={4} className="p-2 text-center font-semibold">{ui('إجمالي المرتجع')}</td>
                        <td colSpan={4} className="p-2"><Input readOnly value={shownTotal.toFixed(2)} className="nums bg-muted/40 text-center font-semibold" /></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                <div className="grid gap-1">
                  <Label>{ui('ملاحظات')}</Label>
                  <Input value={notes} readOnly={readOnly} onChange={(e) => setNotes(e.target.value)} />
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {ui(readOnly ? 'إغلاق' : 'إلغاء')}
            </Button>
            {!readOnly && (
              <Button onClick={() => void save()} disabled={saving}>
                {ui('حفظ')}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </GymSalesPageShell>
  );
}
