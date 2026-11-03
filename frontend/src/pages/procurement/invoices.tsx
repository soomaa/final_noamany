import type { ColumnDef } from '@tanstack/react-table';
import { GitCompareArrows, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { DataTable, type PaginatedResponse } from '@/components/common/data-table';
import { PaidAmountField } from '@/components/club/paid-amount-field';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api, apiError } from '@/lib/api';
import { usePaginatedList } from '@/lib/api-hooks';
import { useBranches } from '@/hooks/use-branches';
import { useListQuery } from '@/lib/use-list-query';
import { validateOverpayCap } from '@/lib/validators';
import { toArabicDigits } from '@/lib/utils';
import type { GoodsReceiptRow, PurchaseInvoiceRow, PurchaseOrderRow, SupplierPaymentRow } from '@/types/gym-sales';
import type { NamedEntity, ProductListItem } from '@/types/inventory';
import { useLocale } from '@/store/locale';
import { useAuth } from '@/store/auth';
import { WarehouseSelect } from '@/components/inventory/warehouse-select';
import { localToday, formatMoneyNumber } from '@/lib/formatters';
import { GymSalesPageShell } from '../gym-sales/shell';
import { indexColumn } from '../inventory/simple-crud-tab';
import { uiStatic } from '@/lib/ui-static';

interface InvoiceLineDraft {
  productId: string;
  name: string;
  quantity: string;
  price: string;
}

interface SupplierMaterial {
  id: number;
  nameAr: string;
  size?: string | null;
  unitOfMeasure: string;
  costPrice: number;
  currentStock: number;
}

const emptyInvoiceLine = (): InvoiceLineDraft => ({ productId: '', name: '', quantity: '1', price: '0' });

interface SupplierInvoiceOption {
  id: number;
  invoiceNumber: string;
  remainingAmount: number;
}

function PurchaseInvoicesTab() {
  const { ui } = useLocale();
  const { params, setParams } = useListQuery();
  const { data, isLoading, isError, refetch } = usePaginatedList<PurchaseInvoiceRow>('purchase-invoices', params);
  const { data: branches } = useBranches();
  const branchName = (id?: number | null) => (id == null ? '—' : branches?.find((b) => b.id === id)?.name ?? `#${id}`);

  const { data: suppliers } = useQuery({
    queryKey: ['suppliers', 'options'],
    queryFn: async () => {
      const { data: r } = await api.get<PaginatedResponse<NamedEntity>>('/suppliers', {
        params: { page: 1, pageSize: 200 },
      });
      return r.data;
    },
  });

  const { data: purchaseOrders } = useQuery({
    queryKey: ['purchase-orders', 'invoice-options'],
    queryFn: async () => {
      const { data: r } = await api.get<PaginatedResponse<PurchaseOrderRow>>('/purchase-orders', {
        params: { page: 1, pageSize: 200 },
      });
      return r.data;
    },
  });

  const { data: goodsReceipts } = useQuery({
    queryKey: ['goods-receipts', 'invoice-options'],
    queryFn: async () => {
      const { data: r } = await api.get<PaginatedResponse<GoodsReceiptRow>>('/goods-receipts', {
        params: { page: 1, pageSize: 200 },
      });
      return r.data;
    },
  });

  const { data: products } = useQuery({
    queryKey: ['products', 'purchase-invoice-options'],
    queryFn: async () => {
      const { data: r } = await api.get<PaginatedResponse<ProductListItem>>('/products', {
        params: { page: 1, pageSize: 500, status: 'active' },
      });
      return r.data;
    },
  });

  const qc = useQueryClient();
  const navigate = useNavigate();
  const user = useAuth((state) => state.user);
  const [open, setOpen] = useState(false);
  const [supplierId, setSupplierId] = useState('');
  const [linkToPo, setLinkToPo] = useState(false);
  const [purchaseOrderId, setPurchaseOrderId] = useState('');
  const [goodsReceiptId, setGoodsReceiptId] = useState('');
  const [branchId, setBranchId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(localToday());
  const [paidAmount, setPaidAmount] = useState('0');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [lines, setLines] = useState<InvoiceLineDraft[]>([emptyInvoiceLine()]);
  const [saving, setSaving] = useState(false);
  const [matchingId, setMatchingId] = useState<number | null>(null);
  const userBranchLocked = !!user?.branch && user.branch > 0;
  const effectiveBranchId = userBranchLocked ? String(user!.branch) : branchId || String(branches?.[0]?.id ?? '');
  // Without a purchase order the invoice is a direct purchase: it goes through the supplier-invoice
  // engine, which receives stock into the chosen warehouse and records the payment in one step.
  const isDirect = !linkToPo || (!purchaseOrderId && !goodsReceiptId);

  const { data: supplierMaterials } = useQuery({
    queryKey: ['suppliers', supplierId, 'materials', effectiveBranchId],
    queryFn: async () =>
      (await api.get<SupplierMaterial[]>(`/suppliers/${supplierId}/products`, { params: { branchId: effectiveBranchId } })).data,
    enabled: isDirect && !!supplierId && !!effectiveBranchId,
  });
  const lineOptions = isDirect
    ? (supplierMaterials ?? []).map((m) => ({ id: m.id, name: `${m.nameAr}${m.size ? ` — ${m.size}` : ''}`, cost: m.costPrice, stock: m.currentStock as number | null }))
    : (products ?? []).map((p) => ({ id: p.id, name: p.nameAr, cost: p.costPrice ?? 0, stock: null as number | null }));
  const lineTotal = (line: InvoiceLineDraft) => (Number(line.quantity) || 0) * (Number(line.price) || 0);
  const invoiceTotal = lines.reduce((sum, line) => sum + lineTotal(line), 0);
  const updateLine = (idx: number, patch: Partial<InvoiceLineDraft>) =>
    setLines((prev) => prev.map((line, i) => (i === idx ? { ...line, ...patch } : line)));

  const loadPurchaseOrder = async (poId: string) => {
    setPurchaseOrderId(poId);
    if (!poId) return;
    try {
      const { data: po } = await api.get<PurchaseOrderRow>(`/purchase-orders/${poId}`);
      setSupplierId(String(po.supplierId));
      setLines(
        (po.items ?? []).map((i) => ({
          productId: i.productId == null ? '' : String(i.productId),
          name: i.name,
          quantity: String(i.quantity),
          price: String(i.price),
        })),
      );
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const loadGoodsReceipt = async (grnId: string) => {
    setGoodsReceiptId(grnId);
    if (!grnId) return;
    try {
      const { data: grn } = await api.get<GoodsReceiptRow & { items?: Array<{ name: string; orderedQty: number; receivedQty: number }> }>(
        `/goods-receipts/${grnId}`,
      );
      setPurchaseOrderId(String(grn.purchaseOrderId));
      await loadPurchaseOrder(String(grn.purchaseOrderId));
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const matchInvoice = async (id: number) => {
    if (matchingId !== null) return;
    setMatchingId(id);
    try {
      await api.post(`/purchase-invoices/${id}/match`);
      toast.success(uiStatic('تمت المطابقة الثلاثية'));
      void refetch();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setMatchingId(null);
    }
  };

  const columns = useMemo<ColumnDef<PurchaseInvoiceRow>[]>(
    () => [
      indexColumn(params.page, params.pageSize) as ColumnDef<PurchaseInvoiceRow>,
      { accessorKey: 'invoiceNumber', header: uiStatic('رقم الفاتورة') },
      { id: 'supplier', header: uiStatic('المورد'), cell: ({ row }) => row.original.supplierName ?? `#${row.original.supplierId}` },
      { id: 'branch', header: uiStatic('الفرع'), cell: ({ row }) => branchName(row.original.branchId) },
      {
        accessorKey: 'invoiceAmount',
        header: uiStatic('المبلغ'),
        cell: ({ getValue }) => <span className="nums">{toArabicDigits(getValue() as number)}</span>,
      },
      { accessorKey: 'status', header: uiStatic('الحالة') },
      { accessorKey: 'matchingStatus', header: uiStatic('المطابقة'), cell: ({ getValue }) => getValue() ?? '—' },
      {
        id: 'actions',
        header: uiStatic('الإجراءات'),
        cell: ({ row }) => (
          <Button
            variant="ghost"
            size="icon"
            disabled={matchingId !== null}
            onClick={() => void matchInvoice(row.original.id)}
          >
            <GitCompareArrows className="h-4 w-4" />
          </Button>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [matchingId, params.page, params.pageSize, ui, branches],
  );

  const resetForm = () => {
    setSupplierId('');
    setLinkToPo(false);
    setPurchaseOrderId('');
    setGoodsReceiptId('');
    setBranchId('');
    setWarehouseId('');
    setInvoiceNumber('');
    setInvoiceDate(localToday());
    setPaidAmount('0');
    setPaymentMethod('cash');
    setLines([emptyInvoiceLine()]);
  };

  const save = async () => {
    const validLines = lines.filter((l) => l.productId && Number(l.quantity) > 0);
    if (!supplierId || !validLines.length) {
      toast.error(uiStatic('يرجى تعبئة البيانات وإضافة بند واحد على الأقل'));
      return;
    }
    if (isDirect && !effectiveBranchId) {
      toast.error(uiStatic('اختر الفرع'));
      return;
    }
    const paid = Number(paidAmount) || 0;
    if (isDirect && paid > invoiceTotal) {
      toast.error(uiStatic('المدفوع أكبر من إجمالي الفاتورة'));
      return;
    }
    setSaving(true);
    try {
      if (isDirect) {
        const option = (id: string) => supplierMaterials?.find((m) => m.id === Number(id));
        const { data: created } = await api.post<{ id: number }>('/supplier-invoices', {
          supplierId: Number(supplierId),
          branchId: Number(effectiveBranchId),
          warehouseId: warehouseId ? Number(warehouseId) : undefined,
          supplierInvoiceNumber: invoiceNumber.trim() || undefined,
          invoiceDate: invoiceDate || localToday(),
          paidAmount: paid,
          initialPaymentMethod: paymentMethod,
          items: validLines.map((l) => ({
            productId: Number(l.productId),
            quantity: Number(l.quantity),
            unit: option(l.productId)?.unitOfMeasure,
            unitPrice: Number(l.price) || 0,
            lineTotal: lineTotal(l),
            costUpdateMode: 'weighted',
          })),
        });
        toast.success(uiStatic('تم حفظ الفاتورة وإضافة البضاعة للمخزن'), {
          action: {
            label: uiStatic('عمل أمر صرف'),
            onClick: () => navigate(`/inventory/transactions?fromInvoice=${created.id}`),
          },
          duration: 10_000,
        });
        await Promise.all([
          qc.invalidateQueries({ queryKey: ['supplier-invoices'] }),
          qc.invalidateQueries({ queryKey: ['products'] }),
          qc.invalidateQueries({ queryKey: ['stock'] }),
          qc.invalidateQueries({ queryKey: ['suppliers', supplierId, 'materials'] }),
        ]);
      } else {
        await api.post('/purchase-invoices', {
          supplierId: Number(supplierId),
          branchId: effectiveBranchId ? Number(effectiveBranchId) : undefined,
          invoiceNumber: invoiceNumber.trim() || undefined,
          purchaseOrderId: purchaseOrderId ? Number(purchaseOrderId) : undefined,
          goodsReceiptId: goodsReceiptId ? Number(goodsReceiptId) : undefined,
          invoiceDate: invoiceDate || undefined,
          items: validLines.map((l) => ({
            productId: Number(l.productId),
            name: l.name,
            quantity: Number(l.quantity),
            price: Number(l.price) || 0,
          })),
        });
        toast.success(uiStatic('تم إنشاء فاتورة المشتريات'));
        void refetch();
      }
      setOpen(false);
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button
          onClick={() => {
            resetForm();
            setOpen(true);
          }}
        >
          <Plus className="ms-1 h-4 w-4" />
          {uiStatic('فاتورة جديدة')}
        </Button>
      </div>
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
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>{uiStatic('فاتورة مشتريات جديدة')}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1">
                <Label>{uiStatic('المورد')}</Label>
                <select
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={supplierId}
                  disabled={!isDirect && !!purchaseOrderId}
                  onChange={(e) => {
                    setSupplierId(e.target.value);
                    if (isDirect) setLines([emptyInvoiceLine()]);
                  }}
                >
                  <option value="">{uiStatic('اختر المورد')}</option>
                  {(suppliers ?? []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nameAr}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-1">
                <Label>{uiStatic('الفرع')}</Label>
                <select
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={effectiveBranchId}
                  disabled={userBranchLocked}
                  onChange={(e) => {
                    setBranchId(e.target.value);
                    setWarehouseId('');
                    if (isDirect) setLines([emptyInvoiceLine()]);
                  }}
                >
                  {(branches ?? []).map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-1">
                <Label>{uiStatic('رقم فاتورة المورد')}</Label>
                <Input
                  value={invoiceNumber}
                  placeholder={uiStatic('الرقم المكتوب على الفاتورة (اختياري)')}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                />
              </div>
              <div className="grid gap-1">
                <Label>{uiStatic('تاريخ الفاتورة')}</Label>
                <Input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
              </div>
              {isDirect ? (
                <div className="sm:col-span-2">
                  <WarehouseSelect
                    key={effectiveBranchId}
                    branchId={effectiveBranchId}
                    value={warehouseId}
                    onChange={setWarehouseId}
                    label="المخزن اللي هتدخل فيه البضاعة"
                  />
                </div>
              ) : null}
            </div>

            <div className="rounded-lg border bg-muted/30 p-3">
              <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={linkToPo}
                  onChange={(e) => {
                    setLinkToPo(e.target.checked);
                    if (!e.target.checked) {
                      setPurchaseOrderId('');
                      setGoodsReceiptId('');
                    }
                    setLines([emptyInvoiceLine()]);
                  }}
                />
                {uiStatic('ربط الفاتورة بأمر شراء / إذن استلام (اختياري)')}
              </label>
              {linkToPo ? (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div className="grid gap-1">
                    <Label>{uiStatic('أمر الشراء')}</Label>
                    <select
                      className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                      value={purchaseOrderId}
                      onChange={(e) => void loadPurchaseOrder(e.target.value)}
                    >
                      <option value="">{uiStatic('بدون')}</option>
                      {(purchaseOrders ?? []).map((po) => (
                        <option key={po.id} value={po.id}>
                          {po.poNumber}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid gap-1">
                    <Label>{uiStatic('إذن الاستلام')}</Label>
                    <select
                      className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                      value={goodsReceiptId}
                      onChange={(e) => void loadGoodsReceipt(e.target.value)}
                    >
                      <option value="">{uiStatic('بدون')}</option>
                      {(goodsReceipts ?? []).map((grn) => (
                        <option key={grn.id} value={grn.id}>
                          {grn.grnNumber}
                        </option>
                      ))}
                    </select>
                  </div>
                  <p className="text-xs text-muted-foreground sm:col-span-2">
                    {uiStatic('مع أمر الشراء، البضاعة بتدخل المخزن من إذن الاستلام، والفاتورة بتتطابق معاه.')}
                  </p>
                </div>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label>{uiStatic('البنود')}</Label>
              <div className="hidden grid-cols-[minmax(0,2fr)_90px_minmax(0,1fr)_minmax(0,1fr)_100px_36px] gap-2 px-1 text-xs font-semibold text-muted-foreground sm:grid">
                <span>{uiStatic('المنتج')}</span>
                <span>{uiStatic('الرصيد المتاح')}</span>
                <span>{uiStatic('الكمية')}</span>
                <span>{uiStatic('سعر الوحدة')}</span>
                <span>{uiStatic('الإجمالي')}</span>
                <span />
              </div>
              {isDirect && supplierId && supplierMaterials && supplierMaterials.length === 0 ? (
                <p className="rounded-md border border-amber-400/50 bg-amber-500/10 p-2 text-xs">
                  {uiStatic('مفيش منتجات مربوطة بالمورد ده. اربط المنتجات بالمورد من شاشة الموردين الأول.')}
                </p>
              ) : null}
              {lines.map((line, idx) => {
                const opt = lineOptions.find((o) => o.id === Number(line.productId));
                return (
                  <div
                    key={idx}
                    className="grid grid-cols-2 gap-2 rounded-md border p-2 sm:grid-cols-[minmax(0,2fr)_90px_minmax(0,1fr)_minmax(0,1fr)_100px_36px] sm:border-0 sm:p-0"
                  >
                    <select
                      aria-label={uiStatic('المنتج')}
                      className="col-span-2 h-10 rounded-md border bg-background px-2 text-sm sm:col-span-1"
                      value={line.productId}
                      disabled={isDirect && !supplierId}
                      onChange={(e) => {
                        const picked = lineOptions.find((o) => o.id === Number(e.target.value));
                        updateLine(idx, { productId: e.target.value, name: picked?.name ?? '', price: String(picked?.cost ?? 0) });
                      }}
                    >
                      <option value="">{uiStatic(isDirect && !supplierId ? 'اختر المورد الأول' : 'اختر المنتج')}</option>
                      {lineOptions.map((o) => (
                        <option key={o.id} value={o.id}>{o.name}</option>
                      ))}
                    </select>
                    <div className="nums flex h-10 items-center rounded-md border bg-muted/40 px-2 text-sm text-muted-foreground" title={uiStatic('الرصيد المتاح')}>
                      {opt?.stock == null ? '—' : toArabicDigits(opt.stock)}
                    </div>
                    <Input
                      type="number"
                      min={0}
                      aria-label={uiStatic('الكمية')}
                      className="nums"
                      value={line.quantity}
                      onChange={(e) => updateLine(idx, { quantity: e.target.value })}
                    />
                    <Input
                      type="number"
                      min={0}
                      aria-label={uiStatic('سعر الوحدة')}
                      className="nums"
                      value={line.price}
                      onChange={(e) => updateLine(idx, { price: e.target.value })}
                    />
                    <div className="nums flex h-10 items-center rounded-md border bg-muted/40 px-2 text-sm font-semibold">
                      {formatMoneyNumber(lineTotal(line))}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={uiStatic('حذف البند')}
                      disabled={lines.length === 1}
                      onClick={() => setLines((prev) => prev.filter((_, i) => i !== idx))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                );
              })}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setLines((prev) => [...prev, emptyInvoiceLine()])}
              >
                {uiStatic('إضافة بند')}
              </Button>
            </div>

            <div className="grid gap-3 rounded-lg border p-3 sm:grid-cols-3">
              <div className="grid gap-1">
                <Label>{uiStatic('إجمالي الفاتورة')}</Label>
                <div className="nums flex h-10 items-center rounded-md border bg-muted/40 px-3 text-base font-bold">
                  {formatMoneyNumber(invoiceTotal)}
                </div>
              </div>
              {isDirect ? (
                <>
                  <div className="grid gap-1">
                    <Label>{uiStatic('المدفوع الآن')}</Label>
                    <Input
                      type="number"
                      min={0}
                      max={invoiceTotal}
                      className="nums"
                      value={paidAmount}
                      onChange={(e) => setPaidAmount(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-1">
                    <Label>{uiStatic('طريقة الدفع')}</Label>
                    <select
                      className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                      value={paymentMethod}
                      disabled={(Number(paidAmount) || 0) <= 0}
                      onChange={(e) => setPaymentMethod(e.target.value)}
                    >
                      <option value="cash">{uiStatic('نقدي')}</option>
                      <option value="bank">{uiStatic('تحويل بنكي')}</option>
                      <option value="card">{uiStatic('بطاقة')}</option>
                      <option value="wallet">{uiStatic('محفظة')}</option>
                    </select>
                  </div>
                  <p className="text-xs text-muted-foreground sm:col-span-3">
                    {uiStatic('الباقي بيتسجل مديونية على المورد. الفاتورة دي بتظهر كمان في')}{' '}
                    <Link className="underline" to="/club/cafe/purchases">{uiStatic('مشتريات الكافيه')}</Link>.
                  </p>
                </>
              ) : (
                <p className="text-xs text-muted-foreground sm:col-span-2">
                  {uiStatic('الدفع لفواتير أوامر الشراء بيتسجل من تبويب مدفوعات الموردين.')}
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {uiStatic('إلغاء')}
            </Button>
            <Button onClick={() => void save()} disabled={saving}>
              {uiStatic('حفظ')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function SupplierPaymentsTab() {
  const { ui } = useLocale();
  const { params, setParams } = useListQuery();
  const { data, isLoading, isError, refetch } = usePaginatedList<SupplierPaymentRow>('supplier-payments', params);

  const [open, setOpen] = useState(false);
  const [supplierId, setSupplierId] = useState('');
  const [invoiceId, setInvoiceId] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [paymentDate, setPaymentDate] = useState('');
  const [saving, setSaving] = useState(false);

  const { data: suppliers } = useQuery({
    queryKey: ['suppliers', 'options'],
    queryFn: async () => {
      const { data: r } = await api.get<PaginatedResponse<NamedEntity>>('/suppliers', {
        params: { page: 1, pageSize: 200 },
      });
      return r.data;
    },
  });

  const { data: supplierInvoices } = useQuery({
    queryKey: ['supplier-invoices', 'payment-options', supplierId],
    enabled: Boolean(supplierId),
    queryFn: async () => {
      const { data: r } = await api.get<PaginatedResponse<SupplierInvoiceOption>>('/supplier-invoices', {
        params: { page: 1, pageSize: 200, supplierId },
      });
      // Only invoices that still owe something can take a payment.
      return r.data.filter((invoice) => invoice.remainingAmount > 0);
    },
  });

  const columns = useMemo<ColumnDef<SupplierPaymentRow>[]>(
    () => [
      indexColumn(params.page, params.pageSize) as ColumnDef<SupplierPaymentRow>,
      { accessorKey: 'paymentNumber', header: uiStatic('رقم الدفعة') },
      { id: 'supplier', header: uiStatic('المورد'), cell: ({ row }) => row.original.supplierName ?? `#${row.original.supplierId}` },
      {
        accessorKey: 'paymentAmount',
        header: uiStatic('المبلغ'),
        cell: ({ getValue }) => <span className="nums">{toArabicDigits(getValue() as number)}</span>,
      },
      {
        accessorKey: 'paymentMethod',
        header: uiStatic('طريقة الدفع'),
        cell: ({ getValue }) => {
          const method = String(getValue() ?? '');
          const label = ({ cash: 'نقدي', bank: 'تحويل بنكي', card: 'بطاقة', wallet: 'محفظة' } as Record<string, string>)[method];
          return label ? uiStatic(label) : method;
        },
      },
      { accessorKey: 'status', header: uiStatic('الحالة') },
      { accessorKey: 'paymentDate', header: uiStatic('التاريخ'), cell: ({ getValue }) => getValue() ?? '—' },
    ],
    [params.page, params.pageSize, ui],
  );

  const save = async () => {
    if (!supplierId || !paymentMethod) {
      toast.error(uiStatic('يرجى تعبئة الحقول المطلوبة'));
      return;
    }
    if (!invoiceId) {
      toast.error(uiStatic('اختر فاتورة المورد، أو سدد من شاشة سداد مديونية الموردين'));
      return;
    }
    const amount = Number(paymentAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error(uiStatic('المبلغ يجب أن يكون أكبر من صفر'));
      return;
    }
    const selectedInvoice = (supplierInvoices ?? []).find((i) => String(i.id) === invoiceId);
    if (selectedInvoice) {
      const capErr = validateOverpayCap(amount, selectedInvoice.remainingAmount);
      if (capErr) {
        toast.error(uiStatic(capErr));
        return;
      }
    }
    setSaving(true);
    try {
      await api.post('/supplier-payments', {
        supplierId: Number(supplierId),
        invoiceId: invoiceId ? Number(invoiceId) : undefined,
        paymentAmount: amount,
        paymentMethod,
        paymentDate: paymentDate || undefined,
        // Recorded payments are paid: they reduce the invoice and the supplier balance right away.
        status: 'مدفوع',
      });
      toast.success(uiStatic('تم تسجيل الدفعة'));
      setOpen(false);
      void refetch();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button
          onClick={() => {
            setSupplierId('');
            setInvoiceId('');
            setPaymentAmount('');
            setPaymentMethod('cash');
            setPaymentDate('');
            setOpen(true);
          }}
        >
          <Plus className="ms-1 h-4 w-4" />
          {uiStatic('دفعة جديدة')}
        </Button>
      </div>
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
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>{uiStatic('دفعة مورد جديدة')}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-1">
              <Label>{uiStatic('المورد')}</Label>
              <select
                className="rounded-md border bg-background px-3 py-2 text-sm"
                value={supplierId}
                onChange={(e) => {
                  setSupplierId(e.target.value);
                  setInvoiceId('');
                }}
              >
                <option value="">{uiStatic('—')}</option>
                {(suppliers ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nameAr}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1">
              <Label>{uiStatic('فاتورة المورد')}</Label>
              <select
                className="rounded-md border bg-background px-3 py-2 text-sm"
                value={invoiceId}
                onChange={(e) => setInvoiceId(e.target.value)}
                disabled={!supplierId}
              >
                <option value="">{uiStatic('—')}</option>
                {(supplierInvoices ?? []).map((inv) => (
                  <option key={inv.id} value={inv.id}>
                    {inv.invoiceNumber} ({toArabicDigits(inv.remainingAmount)})
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <PaidAmountField
                label={uiStatic('المبلغ المدفوع')}
                value={paymentAmount}
                max={(supplierInvoices ?? []).find((invoice) => String(invoice.id) === invoiceId)?.remainingAmount}
                onChange={setPaymentAmount}
              />
              <div className="grid gap-1">
                <Label>{uiStatic('طريقة الدفع')}</Label>
                <select
                  className="rounded-md border bg-background px-3 py-2 text-sm"
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                >
                  <option value="cash">{uiStatic('نقدي')}</option>
                  <option value="bank">{uiStatic('تحويل بنكي')}</option>
                  <option value="card">{uiStatic('بطاقة')}</option>
                  <option value="wallet">{uiStatic('محفظة')}</option>
                </select>
              </div>
            </div>
            <div className="grid gap-1">
              <Label>{uiStatic('تاريخ الدفع')}</Label>
              <Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {uiStatic('إلغاء')}
            </Button>
            <Button onClick={() => void save()} disabled={saving}>
              {uiStatic('حفظ')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function ProcurementInvoicesPage() {
  const { ui } = useLocale();
  const [tab, setTab] = useState<'invoices' | 'payments'>('invoices');

  return (
    <GymSalesPageShell
      section="procurement"
      title={ui('فواتير المشتريات')}
      description={ui('فواتير الموردين والمطابقة الثلاثية ودفعات الموردين')}
    >
      <Tabs value={tab} onValueChange={(v) => setTab(v as 'invoices' | 'payments')} className="space-y-4">
        <TabsList className="flex h-auto flex-wrap gap-1">
          <TabsTrigger value="invoices">{ui('فواتير المشتريات')}</TabsTrigger>
          <TabsTrigger value="payments">{ui('دفعات الموردين')}</TabsTrigger>
        </TabsList>
        <TabsContent value="invoices">
          <PurchaseInvoicesTab />
        </TabsContent>
        <TabsContent value="payments">
          <SupplierPaymentsTab />
        </TabsContent>
      </Tabs>
    </GymSalesPageShell>
  );
}
