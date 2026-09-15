import type { ColumnDef } from '@tanstack/react-table';
import { GitCompareArrows, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
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
import { useListQuery } from '@/lib/use-list-query';
import { validateOverpayCap } from '@/lib/validators';
import { toArabicDigits } from '@/lib/utils';
import type { GoodsReceiptRow, PurchaseInvoiceRow, PurchaseOrderRow, SupplierPaymentRow } from '@/types/gym-sales';
import type { NamedEntity } from '@/types/inventory';
import { useLocale } from '@/store/locale';
import { GymSalesPageShell } from '../gym-sales/shell';
import { indexColumn } from '../inventory/simple-crud-tab';
import { uiStatic } from '@/lib/ui-static';

interface InvoiceLineDraft {
  name: string;
  quantity: string;
  price: string;
}

interface SupplierInvoiceOption {
  id: number;
  invoiceNumber: string;
  remainingAmount: number;
}

function PurchaseInvoicesTab() {
  const { ui } = useLocale();
  const { params, setParams } = useListQuery();
  const { data, isLoading, isError, refetch } = usePaginatedList<PurchaseInvoiceRow>('purchase-invoices', params);

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

  const [open, setOpen] = useState(false);
  const [supplierId, setSupplierId] = useState('');
  const [purchaseOrderId, setPurchaseOrderId] = useState('');
  const [goodsReceiptId, setGoodsReceiptId] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState('');
  const [lines, setLines] = useState<InvoiceLineDraft[]>([{ name: '', quantity: '1', price: '0' }]);
  const [saving, setSaving] = useState(false);
  const [matchingId, setMatchingId] = useState<number | null>(null);

  const loadPurchaseOrder = async (poId: string) => {
    setPurchaseOrderId(poId);
    if (!poId) return;
    try {
      const { data: po } = await api.get<PurchaseOrderRow>(`/purchase-orders/${poId}`);
      setSupplierId(String(po.supplierId));
      setLines(
        (po.items ?? []).map((i) => ({
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
      { accessorKey: 'supplierId', header: uiStatic('المورد') },
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
    [matchingId, params.page, params.pageSize, ui],
  );

  const save = async () => {
    const validLines = lines.filter((l) => l.name.trim() && Number(l.quantity) > 0);
    if (!supplierId || !validLines.length) {
      toast.error(uiStatic('يرجى تعبئة البيانات وإضافة بند واحد على الأقل'));
      return;
    }
    setSaving(true);
    try {
      await api.post('/purchase-invoices', {
        supplierId: Number(supplierId),
        invoiceNumber: invoiceNumber.trim() || undefined,
        purchaseOrderId: purchaseOrderId ? Number(purchaseOrderId) : undefined,
        goodsReceiptId: goodsReceiptId ? Number(goodsReceiptId) : undefined,
        invoiceDate: invoiceDate || undefined,
        items: validLines.map((l) => ({
          name: l.name,
          quantity: Number(l.quantity),
          price: Number(l.price) || 0,
        })),
      });
      toast.success(uiStatic('تم إنشاء فاتورة المشتريات'));
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
            setPurchaseOrderId('');
            setGoodsReceiptId('');
            setInvoiceNumber('');
            setInvoiceDate('');
            setLines([{ name: '', quantity: '1', price: '0' }]);
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
          <div className="grid gap-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1">
                <Label>{uiStatic('أمر الشراء')}</Label>
                <select
                  className="rounded-md border bg-background px-3 py-2 text-sm"
                  value={purchaseOrderId}
                  onChange={(e) => void loadPurchaseOrder(e.target.value)}
                >
                  <option value="">{uiStatic('—')}</option>
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
                  className="rounded-md border bg-background px-3 py-2 text-sm"
                  value={goodsReceiptId}
                  onChange={(e) => void loadGoodsReceipt(e.target.value)}
                >
                  <option value="">{uiStatic('—')}</option>
                  {(goodsReceipts ?? []).map((grn) => (
                    <option key={grn.id} value={grn.id}>
                      {grn.grnNumber}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid gap-1">
              <Label>{uiStatic('المورد')}</Label>
              <select
                className="rounded-md border bg-background px-3 py-2 text-sm"
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
              >
                <option value="">{uiStatic('—')}</option>
                {(suppliers ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nameAr}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1">
                <Label>{uiStatic('رقم فاتورة المورد')}</Label>
                <Input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} />
              </div>
              <div className="grid gap-1">
                <Label>{uiStatic('تاريخ الفاتورة')}</Label>
                <Input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{uiStatic('البنود')}</Label>
              {lines.map((line, idx) => (
                <div key={idx} className="grid grid-cols-3 gap-2">
                  <Input
                    placeholder={uiStatic('البند')}
                    value={line.name}
                    onChange={(e) => {
                      setLines((prev) => {
                        const next = [...prev];
                        next[idx] = { ...next[idx], name: e.target.value };
                        return next;
                      });
                    }}
                  />
                  <Input
                    type="number"
                    className="nums"
                    placeholder={uiStatic('كمية')}
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
                    className="nums"
                    placeholder={uiStatic('سعر')}
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
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setLines((prev) => [...prev, { name: '', quantity: '1', price: '0' }])}
              >
                {uiStatic('إضافة بند')}
              </Button>
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
  const [paymentMethod, setPaymentMethod] = useState(uiStatic('نقدي'));
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
      return r.data;
    },
  });

  const columns = useMemo<ColumnDef<SupplierPaymentRow>[]>(
    () => [
      indexColumn(params.page, params.pageSize) as ColumnDef<SupplierPaymentRow>,
      { accessorKey: 'paymentNumber', header: uiStatic('رقم الدفعة') },
      { accessorKey: 'supplierId', header: uiStatic('المورد') },
      {
        accessorKey: 'paymentAmount',
        header: uiStatic('المبلغ'),
        cell: ({ getValue }) => <span className="nums">{toArabicDigits(getValue() as number)}</span>,
      },
      { accessorKey: 'paymentMethod', header: uiStatic('طريقة الدفع') },
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
            setPaymentMethod(uiStatic('نقدي'));
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
                  <option value="نقدي">{uiStatic('نقدي')}</option>
                  <option value="تحويل">{uiStatic('تحويل')}</option>
                  <option value="شيك">{uiStatic('شيك')}</option>
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
