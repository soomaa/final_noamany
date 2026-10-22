import type { ColumnDef } from '@tanstack/react-table';
import { Pencil, Plus, Printer, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Combobox } from '@/components/common/combobox';
import { DataTable, type PaginatedResponse } from '@/components/common/data-table';
import { FilterBar, type FilterField } from '@/components/common/filter-bar';
import { WarehouseSelect } from '@/components/inventory/warehouse-select';
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
import { usePaginatedList } from '@/lib/api-hooks';
import { useListQuery } from '@/lib/use-list-query';
import { toArabicDigits } from '@/lib/utils';
import type { PurchaseOrderRow } from '@/types/gym-sales';
import type { NamedEntity, ProductListItem } from '@/types/inventory';
import { useLocale } from '@/store/locale';
import { GymSalesPageShell } from '../gym-sales/shell';
import { indexColumn } from '../inventory/simple-crud-tab';

const PO_STATUS_LABELS: Record<string, string> = {
  draft: 'مسودة',
  sent: 'مرسل',
  confirmed: 'مؤكد',
  in_progress: 'جاري الاستلام',
  completed: 'مكتمل',
  cancelled: 'ملغي',
};

const PAYMENT_METHOD_LABELS: Record<string, string> = { cash: 'نقدي', credit: 'آجل' };

type PoProduct = ProductListItem & { barcode?: string | null };

interface CategoryOption {
  id: number;
  nameAr: string;
  isActive?: boolean;
}

interface PoLineDraft {
  productId: string;
  name: string;
  quantity: string;
  /** Total purchase cost of the line (تكلفة الشراء الكلية). */
  lineTotal: string;
  salePrice: string;
  /** Selling price when the product was picked; only a changed price is sent. */
  initialSalePrice: string;
}

const emptyLine = (): PoLineDraft => ({ productId: '', name: '', quantity: '1', lineTotal: '', salePrice: '', initialSalePrice: '' });
const today = () => new Date().toLocaleDateString('en-CA');
const round2 = (n: number) => Math.round(n * 100) / 100;
const money = (n: number) => toArabicDigits(round2(n).toLocaleString('en-US', { maximumFractionDigits: 2 }));

export function ProcurementPurchaseOrdersPage() {
  const { ui } = useLocale();
  const queryClient = useQueryClient();
  const { params, setParams } = useListQuery();
  const { data: branches } = useBranches();
  const { data, isLoading, isError, refetch } = usePaginatedList<PurchaseOrderRow>('purchase-orders', params);

  const { data: suppliers } = useQuery({
    queryKey: ['suppliers', 'options'],
    queryFn: async () => {
      const { data: r } = await api.get<PaginatedResponse<NamedEntity>>('/suppliers', {
        params: { page: 1, pageSize: 200 },
      });
      return r.data;
    },
  });

  const { data: categories } = useQuery({
    queryKey: ['categories', 'po-options'],
    queryFn: async () => {
      const { data: r } = await api.get<CategoryOption[] | PaginatedResponse<CategoryOption>>('/categories', {
        params: { page: 1, pageSize: 200, status: 'active' },
      });
      return Array.isArray(r) ? r : r.data;
    },
  });

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [barcode, setBarcode] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(today());
  const [invoicePrintDate, setInvoicePrintDate] = useState(today());
  const [supplierId, setSupplierId] = useState('');
  const [supplierInvoiceNumber, setSupplierInvoiceNumber] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'credit'>('cash');
  const [branchId, setBranchId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [lines, setLines] = useState<PoLineDraft[]>([emptyLine()]);
  const [discount, setDiscount] = useState('0');
  const [paid, setPaid] = useState('0');
  /** Cash fills المدفوع with the full total until the user types their own amount. */
  const [paidEdited, setPaidEdited] = useState(false);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // Items follow the chosen category; stock balance follows the chosen branch/warehouse.
  const { data: products } = useQuery({
    queryKey: ['products', 'po-options', categoryId, branchId, warehouseId],
    enabled: open && (!!categoryId || editingId !== null),
    queryFn: async () => {
      const { data: r } = await api.get<PaginatedResponse<PoProduct>>('/products', {
        params: {
          page: 1,
          pageSize: 500,
          status: 'active',
          categoryId: categoryId || undefined,
          branchId: branchId || undefined,
          warehouseId: warehouseId || undefined,
        },
      });
      return r.data;
    },
  });

  const { data: nextNumbers } = useQuery({
    queryKey: ['purchase-orders', 'next-number'],
    enabled: open && editingId === null,
    staleTime: 0,
    refetchOnMount: 'always',
    queryFn: async () => (await api.get<{ poNumber: string; invoiceNumber: string }>('/purchase-orders/next-number')).data,
  });
  const [editingCode, setEditingCode] = useState('');

  const productOptions = useMemo(
    () => (products ?? []).map((p) => ({ value: String(p.id), label: p.nameAr, searchText: `${p.productCode} ${p.barcode ?? ''}` })),
    [products],
  );

  const subtotal = round2(lines.reduce((sum, l) => sum + (Number(l.lineTotal) || 0), 0));
  const discountValue = Number(discount) || 0;
  const afterDiscount = round2(subtotal - discountValue);
  const paidFollowsTotal = paymentMethod === 'cash' && !paidEdited;
  const paidValue = paidFollowsTotal ? Math.max(afterDiscount, 0) : Number(paid) || 0;
  const remaining = round2(afterDiscount - paidValue);

  const filters: FilterField[] = [
    {
      key: 'branchId',
      label: ui('الفرع'),
      type: 'select',
      options: (branches ?? []).map((b) => ({ value: String(b.id), label: b.name ?? '—' })),
    },
  ];

  const branchName = (id: number | null | undefined) => branches?.find((b) => b.id === id)?.name ?? (id ? `#${id}` : '—');
  const categoryName = (id: number | null | undefined) => categories?.find((c) => c.id === id)?.nameAr ?? (id ? `#${id}` : '—');
  const supplierName = (row: PurchaseOrderRow) =>
    row.supplierName ?? suppliers?.find((s) => s.id === row.supplierId)?.nameAr ?? `#${row.supplierId}`;

  const updateLine = (idx: number, patch: Partial<PoLineDraft>) =>
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));

  const lineFromProduct = (p: PoProduct, quantity = 1): PoLineDraft => ({
    productId: String(p.id),
    name: p.nameAr,
    quantity: String(quantity),
    lineTotal: String(round2((p.costPrice ?? 0) * quantity)),
    salePrice: String(p.sellingPrice ?? 0),
    initialSalePrice: String(p.sellingPrice ?? 0),
  });

  const openCreate = () => {
    setEditingId(null);
    setBarcode('');
    setInvoiceDate(today());
    setInvoicePrintDate(today());
    setSupplierId('');
    setSupplierInvoiceNumber('');
    setPaymentMethod('cash');
    setBranchId(String(branches?.[0]?.id ?? ''));
    setWarehouseId('');
    setCategoryId('');
    setLines([emptyLine()]);
    setDiscount('0');
    setPaid('0');
    setPaidEdited(false);
    setNotes('');
    setOpen(true);
  };

  const openEdit = async (row: PurchaseOrderRow) => {
    try {
      const { data: po } = await api.get<PurchaseOrderRow>(`/purchase-orders/${row.id}`);
      setEditingId(po.id);
      setEditingCode(po.supplierInvoiceCode ?? po.poNumber);
      setBarcode('');
      setInvoiceDate(po.invoiceDate ?? today());
      setInvoicePrintDate(po.invoicePrintDate ?? today());
      setSupplierId(String(po.supplierId));
      setSupplierInvoiceNumber(po.supplierInvoiceNumber ?? '');
      setPaymentMethod(po.paymentMethod === 'credit' ? 'credit' : 'cash');
      setBranchId(String(po.branchId ?? ''));
      setWarehouseId(po.warehouseId ? String(po.warehouseId) : '');
      setCategoryId(po.categoryId ? String(po.categoryId) : '');
      setDiscount(String(po.discountAmount ?? 0));
      setPaid(String(po.paidAmount ?? 0));
      setPaidEdited(true);
      setNotes(po.notes ?? '');
      setLines((po.items ?? []).map((i) => ({
        productId: i.productId ? String(i.productId) : '',
        name: i.name,
        quantity: String(i.quantity),
        lineTotal: String(i.total),
        salePrice: '',
        initialSalePrice: '',
      })));
      setOpen(true);
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const printPo = async (row: PurchaseOrderRow) => {
    try {
      const po = (await api.get<PurchaseOrderRow>(`/purchase-orders/${row.id}`)).data;
      const esc = (v: unknown) =>
        String(v ?? '—').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
      const info: Array<[string, unknown]> = [
        ['رقم الأمر', po.poNumber],
        ['كود الفاتورة', po.supplierInvoiceCode],
        ['المورد', supplierName(po)],
        ['رقم فاتورة المورد', po.supplierInvoiceNumber],
        ['تاريخ تسجيل الفاتورة', po.invoiceDate],
        ['تاريخ طباعة الفاتورة', po.invoicePrintDate],
        ['الفرع', branchName(po.branchId)],
        ['النوع - التصنيف', categoryName(po.categoryId)],
        ['طريقة الدفع', PAYMENT_METHOD_LABELS[po.paymentMethod ?? ''] ?? po.paymentTerms],
        ['الحالة', PO_STATUS_LABELS[po.status] ?? po.status],
        ['البيان', po.notes],
      ];
      const totals: Array<[string, number]> = [
        ['قيمة الفاتورة قبل الخصم', po.subtotalAmount ?? po.totalAmount],
        ['قيمة الخصم', po.discountAmount ?? 0],
        ['قيمة الفاتورة بعد الخصم', po.totalAmount],
        ['المدفوع', po.paidAmount ?? 0],
        ['الباقي', po.remainingAmount ?? 0],
      ];
      // Print from a hidden iframe so no popup window (and no popup blocker) is involved.
      document.getElementById('po-print-frame')?.remove();
      const frame = document.createElement('iframe');
      frame.id = 'po-print-frame';
      frame.setAttribute('aria-hidden', 'true');
      Object.assign(frame.style, { position: 'fixed', width: '0', height: '0', border: '0', right: '0', bottom: '0' });
      document.body.appendChild(frame);
      const win = frame.contentWindow!;
      win.document.open();
      win.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${esc(ui('أمر شراء'))} ${esc(po.poNumber)}</title>
<style>
  body{font-family:Tahoma,Arial,sans-serif;margin:24px;color:#111}
  h1{font-size:20px;margin:0 0 4px} .sub{color:#666;font-size:12px;margin-bottom:16px}
  .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:16px}
  .cell{border:1px solid #ddd;border-radius:6px;padding:6px 8px} .cell small{display:block;color:#666;font-size:11px}
  table{width:100%;border-collapse:collapse;margin-bottom:16px;font-size:13px}
  th,td{border:1px solid #ddd;padding:6px 8px;text-align:start} th{background:#f3f3f3}
  .totals{display:grid;grid-template-columns:repeat(5,1fr);gap:8px} .totals .cell b{font-size:15px}
  @media print{body{margin:10mm}}
</style></head><body>
<h1>${esc(ui('أمر شراء'))} ${esc(po.poNumber)}</h1>
<div class="sub">Noamany Fitness Center · ${esc(new Date().toLocaleString('ar-EG'))}</div>
<div class="grid">${info.map(([l, v]) => `<div class="cell"><small>${esc(ui(l))}</small>${esc(v || '—')}</div>`).join('')}</div>
<table><thead><tr><th>${esc(ui('م'))}</th><th>${esc(ui('اسم الصنف'))}</th><th>${esc(ui('العدد الكلي'))}</th><th>${esc(ui('تكلفة شراء الوحدة'))}</th><th>${esc(ui('تكلفة الشراء الكلية'))}</th></tr></thead>
<tbody>${(po.items ?? []).map((it, i) => `<tr><td>${i + 1}</td><td>${esc(it.name)}</td><td>${esc(it.quantity)}</td><td>${esc(round2(it.price))}</td><td>${esc(round2(it.total))}</td></tr>`).join('')}</tbody></table>
<div class="totals">${totals.map(([l, v]) => `<div class="cell"><small>${esc(ui(l))}</small><b>${esc(round2(Number(v)))}</b></div>`).join('')}</div>
</body></html>`);
      win.document.close();
      setTimeout(() => {
        win.focus();
        win.print();
      }, 300);
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const remove = async (row: PurchaseOrderRow) => {
    const message = row.supplierInvoiceId
      ? `حذف أمر الشراء ${row.poNumber}؟\nهيتم سحب الكمية من المخزن وعكس القيود وإلغاء المدفوع (${row.paidAmount ?? 0}) ومديونية المورد.`
      : `حذف أمر الشراء ${row.poNumber}؟`;
    if (!window.confirm(ui(message))) return;
    setDeletingId(row.id);
    try {
      await api.delete(`/purchase-orders/${row.id}`);
      toast.success(ui('تم حذف أمر الشراء'));
      void refetch();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setDeletingId(null);
    }
  };

  const scanBarcode = async () => {
    const code = barcode.trim();
    if (!code) return;
    try {
      const { data: r } = await api.get<PaginatedResponse<PoProduct>>('/products', {
        params: { page: 1, pageSize: 20, status: 'active', search: code, branchId: branchId || undefined, warehouseId: warehouseId || undefined },
      });
      const product = r.data.find((p) => p.barcode === code) ?? r.data.find((p) => p.productCode === code);
      if (!product) {
        toast.error(ui('لا يوجد صنف بهذا الباركود'));
        return;
      }
      if (categoryId && product.categoryId !== Number(categoryId)) {
        toast.error(ui(`الصنف ${product.nameAr} لا يتبع التصنيف المختار`));
        return;
      }
      if (!categoryId && product.categoryId) setCategoryId(String(product.categoryId));
      setLines((prev) => {
        const existing = prev.findIndex((l) => l.productId === String(product.id));
        if (existing >= 0) {
          return prev.map((l, i) => {
            if (i !== existing) return l;
            const qty = Number(l.quantity) || 0;
            const unitCost = qty > 0 ? (Number(l.lineTotal) || 0) / qty : product.costPrice ?? 0;
            return { ...l, quantity: String(qty + 1), lineTotal: String(round2(unitCost * (qty + 1))) };
          });
        }
        const blank = prev.findIndex((l) => !l.productId);
        const line = lineFromProduct(product);
        return blank >= 0 ? prev.map((l, i) => (i === blank ? line : l)) : [...prev, line];
      });
      setBarcode('');
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const columns = useMemo<ColumnDef<PurchaseOrderRow>[]>(
    () => [
      indexColumn(params.page, params.pageSize) as ColumnDef<PurchaseOrderRow>,
      { accessorKey: 'poNumber', header: ui('رقم الأمر') },
      { id: 'supplier', header: ui('المورد'), cell: ({ row }) => supplierName(row.original) },
      { id: 'branch', header: ui('الفرع'), cell: ({ row }) => branchName(row.original.branchId) },
      {
        accessorKey: 'totalAmount',
        header: ui('الإجمالي'),
        cell: ({ getValue }) => <span className="nums">{toArabicDigits(getValue() as number)}</span>,
      },
      {
        accessorKey: 'paidAmount',
        header: ui('المدفوع'),
        cell: ({ getValue }) => <span className="nums">{toArabicDigits((getValue() as number | undefined) ?? 0)}</span>,
      },
      {
        accessorKey: 'remainingAmount',
        header: ui('الباقي'),
        cell: ({ getValue }) => <span className="nums">{toArabicDigits((getValue() as number | undefined) ?? 0)}</span>,
      },
      {
        accessorKey: 'paymentMethod',
        header: ui('طريقة الدفع'),
        cell: ({ getValue }) => ui(PAYMENT_METHOD_LABELS[(getValue() as string) ?? ''] ?? '—'),
      },
      { accessorKey: 'status', header: ui('الحالة'), cell: ({ getValue }) => ui(PO_STATUS_LABELS[getValue() as string] ?? (getValue() as string)) },
      {
        id: 'actions',
        header: ui('الإجراء'),
        cell: ({ row }) => (
          <div className="flex gap-1">
            {(row.original.status === 'draft' || !!row.original.supplierInvoiceId) && (
              <>
                <Button size="icon" variant="outline" className="h-8 w-8" title={ui('تعديل')} aria-label={ui('تعديل')} onClick={() => void openEdit(row.original)}><Pencil className="h-4 w-4" /></Button>
                <Button size="icon" variant="destructive" className="h-8 w-8" title={ui('حذف')} aria-label={ui('حذف')} disabled={deletingId === row.original.id} onClick={() => void remove(row.original)}><Trash2 className="h-4 w-4" /></Button>
              </>
            )}
            <Button size="icon" variant="outline" className="h-8 w-8" title={ui('طباعة')} aria-label={ui('طباعة')} onClick={() => void printPo(row.original)}><Printer className="h-4 w-4" /></Button>
          </div>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [params.page, params.pageSize, ui, branches, suppliers, categories, deletingId],
  );

  const save = async () => {
    const validLines = lines.filter((l) => l.productId && Number(l.quantity) > 0);
    if (!supplierId || !branchId || (!categoryId && !editingId) || !validLines.length) {
      toast.error(ui('اختر المورد والفرع والتصنيف وأضف صنفًا واحدًا على الأقل'));
      return;
    }
    if (validLines.some((l) => l.lineTotal === '' || Number(l.lineTotal) < 0)) {
      toast.error(ui('أدخل تكلفة الشراء الكلية لكل صنف'));
      return;
    }
    if (new Set(validLines.map((l) => l.productId)).size !== validLines.length) {
      toast.error(ui('لا تكرر نفس الصنف في أكثر من بند'));
      return;
    }
    if (discountValue < 0 || discountValue > subtotal) {
      toast.error(ui('قيمة الخصم أكبر من قيمة الفاتورة'));
      return;
    }
    if (paidValue < 0 || paidValue > afterDiscount) {
      toast.error(ui('المدفوع أكبر من قيمة الفاتورة بعد الخصم'));
      return;
    }
    setSaving(true);
    try {
      const items = validLines.map((l) => {
        const quantity = Number(l.quantity);
        const lineTotal = round2(Number(l.lineTotal) || 0);
        const salePriceChanged = l.salePrice !== '' && Number(l.salePrice) !== Number(l.initialSalePrice);
        return {
          productId: Number(l.productId),
          name: l.name,
          quantity,
          price: round2(lineTotal / quantity),
          lineTotal,
          salePrice: salePriceChanged ? Number(l.salePrice) : undefined,
        };
      });
      const body = {
        supplierId: Number(supplierId),
        branchId: Number(branchId),
        warehouseId: warehouseId ? Number(warehouseId) : undefined,
        categoryId: categoryId ? Number(categoryId) : undefined,
        invoiceDate: invoiceDate || undefined,
        invoicePrintDate: invoicePrintDate || undefined,
        supplierInvoiceNumber: supplierInvoiceNumber.trim() || undefined,
        paymentMethod,
        discountAmount: discountValue,
        paidAmount: round2(paidValue),
        notes: notes.trim() || undefined,
        items,
      };
      if (editingId) await api.put(`/purchase-orders/${editingId}`, body);
      else await api.post('/purchase-orders', body);
      void queryClient.invalidateQueries({ queryKey: ['purchase-orders', 'next-number'] });
      toast.success(ui(editingId ? 'تم تعديل أمر الشراء' : 'تم إنشاء أمر الشراء وترحيله للمخزون والحسابات'));
      setOpen(false);
      void refetch();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const selectClass = 'h-10 w-full rounded-md border bg-background px-3 text-sm';

  return (
    <GymSalesPageShell
      section="procurement"
      title={ui('أوامر الشراء')}
      description={ui('إدارة أوامر الشراء الرسمية وربطها بطلبات الشراء')}
      actions={
        <Button onClick={openCreate}>
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
        <DialogContent size="form" className="max-h-[92vh] max-w-6xl overflow-y-auto" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{ui(editingId ? 'تعديل أمر الشراء' : 'أمر شراء جديد')}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <div className="grid gap-1">
                <Label htmlFor="po-barcode">{ui('قارئ الباركود')}</Label>
                <Input
                  id="po-barcode"
                  value={barcode}
                  placeholder={ui('قم بسحب الباركود هنا')}
                  onChange={(e) => setBarcode(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void scanBarcode();
                    }
                  }}
                />
              </div>
              <div className="grid gap-1">
                <Label>{ui('كود الفاتورة')}</Label>
                <Input
                  className="nums"
                  disabled
                  value={editingId ? editingCode : nextNumbers?.invoiceNumber ?? ui('تلقائي')}
                  title={!editingId && nextNumbers ? `${ui('رقم الأمر')}: ${nextNumbers.poNumber}` : undefined}
                />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="po-invoice-date">{ui('تاريخ تسجيل الفاتورة')}</Label>
                <Input id="po-invoice-date" type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="po-print-date">{ui('تاريخ طباعة الفاتورة')}</Label>
                <Input id="po-print-date" type="date" value={invoicePrintDate} onChange={(e) => setInvoicePrintDate(e.target.value)} />
              </div>
              <div className="grid gap-1">
                <Label>{ui('اسم المورد')}</Label>
                <Combobox
                  aria-label={ui('اسم المورد')}
                  value={supplierId}
                  onValueChange={setSupplierId}
                  options={(suppliers ?? []).map((s) => ({ value: String(s.id), label: s.nameAr ?? `#${s.id}` }))}
                  placeholder={ui('إختر')}
                />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="po-supplier-invoice">{ui('رقم فاتورة المورد')}</Label>
                <Input id="po-supplier-invoice" value={supplierInvoiceNumber} onChange={(e) => setSupplierInvoiceNumber(e.target.value)} />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="po-payment-method">{ui('طريقة الدفع')}</Label>
                <select
                  id="po-payment-method"
                  className={selectClass}
                  value={paymentMethod}
                  onChange={(e) => {
                    const next = e.target.value as 'cash' | 'credit';
                    setPaymentMethod(next);
                    setPaidEdited(false);
                    if (next === 'credit') setPaid('0');
                  }}
                >
                  <option value="cash">{ui('نقدي')}</option>
                  <option value="credit">{ui('آجل')}</option>
                </select>
              </div>
              <div className="grid gap-1">
                <Label htmlFor="po-branch">{ui('الفرع')}</Label>
                <select
                  id="po-branch"
                  className={selectClass}
                  value={branchId}
                  onChange={(e) => {
                    setBranchId(e.target.value);
                    setWarehouseId('');
                  }}
                >
                  <option value="">{ui('إختر')}</option>
                  {(branches ?? []).map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
              <WarehouseSelect
                branchId={branchId}
                value={warehouseId}
                onChange={setWarehouseId}
                label="المخازن"
                disabled={!branchId}
              />
              <div className="grid gap-1">
                <Label htmlFor="po-category">{ui('النوع - التصنيف')}</Label>
                <select
                  id="po-category"
                  className={selectClass}
                  value={categoryId}
                  onChange={(e) => {
                    setCategoryId(e.target.value);
                    setLines([emptyLine()]);
                  }}
                >
                  <option value="">{ui('إختر')}</option>
                  {(categories ?? []).filter((c) => c.isActive !== false).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nameAr}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[900px] text-sm">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    <th className="p-2 text-start">{ui('م')}</th>
                    <th className="w-[26%] p-2 text-start">{ui('اسم الصنف')}</th>
                    <th className="p-2 text-start">{ui('الرصيد المتاح')}</th>
                    <th className="p-2 text-start">{ui('تكلفة الشراء الكلية')}</th>
                    <th className="p-2 text-start">{ui('العدد الكلي')}</th>
                    <th className="p-2 text-start">{ui('تكلفة شراء الوحدة')}</th>
                    <th className="p-2 text-start">{ui('سعر بيع الوحدة')}</th>
                    <th className="p-2 text-start">{ui('الإجراء')}</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, idx) => {
                    const product = products?.find((p) => String(p.id) === line.productId);
                    const qty = Number(line.quantity) || 0;
                    const unitCost = qty > 0 ? (Number(line.lineTotal) || 0) / qty : 0;
                    return (
                      <tr key={idx} className="border-t align-middle">
                        <td className="p-2">{toArabicDigits(idx + 1)}</td>
                        <td className="p-2">
                          <Combobox
                            aria-label={ui('اسم الصنف')}
                            value={line.productId}
                            disabled={!categoryId && !editingId}
                            onValueChange={(value) => {
                              const p = products?.find((x) => String(x.id) === value);
                              if (!p) {
                                updateLine(idx, emptyLine());
                                return;
                              }
                              if (lines.some((l, i) => i !== idx && l.productId === value)) {
                                toast.error(ui('هذا الصنف مضاف بالفعل'));
                                return;
                              }
                              updateLine(idx, lineFromProduct(p, qty || 1));
                            }}
                            options={productOptions}
                            placeholder={ui(categoryId || editingId ? 'اختر الصنف' : 'اختر التصنيف أولًا')}
                          />
                        </td>
                        <td className="p-2">
                          <Input className="nums" disabled value={product ? toArabicDigits(product.currentStock ?? 0) : ''} />
                        </td>
                        <td className="p-2">
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            className="nums"
                            aria-label={ui('تكلفة الشراء الكلية')}
                            value={line.lineTotal}
                            onChange={(e) => updateLine(idx, { lineTotal: e.target.value })}
                          />
                        </td>
                        <td className="p-2">
                          <Input
                            type="number"
                            min={0}
                            step="any"
                            className="nums"
                            aria-label={ui('العدد الكلي')}
                            value={line.quantity}
                            onChange={(e) => updateLine(idx, { quantity: e.target.value })}
                          />
                        </td>
                        <td className="p-2">
                          <Input className="nums" disabled value={line.productId ? money(unitCost) : ''} />
                        </td>
                        <td className="p-2">
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            className="nums"
                            aria-label={ui('سعر بيع الوحدة')}
                            disabled={!line.productId}
                            value={line.salePrice}
                            onChange={(e) => updateLine(idx, { salePrice: e.target.value })}
                          />
                        </td>
                        <td className="p-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            aria-label={ui('حذف البند')}
                            disabled={lines.length === 1}
                            onClick={() => setLines((prev) => prev.filter((_, i) => i !== idx))}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="border-t bg-muted/20">
                    <td className="p-2" colSpan={3}>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={!categoryId && !editingId}
                        onClick={() => setLines((prev) => [...prev, emptyLine()])}
                      >
                        <Plus className="h-4 w-4" /> {ui('إضافة بند')}
                      </Button>
                    </td>
                    <td className="p-2">
                      <Input className="nums font-semibold" disabled value={money(subtotal)} />
                    </td>
                    <td className="p-2 font-semibold" colSpan={4}>{ui('الإجمالي')}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <div className="grid gap-1">
                <Label>{ui('قيمة الفاتورة قبل الخصم')}</Label>
                <Input className="nums" disabled value={money(subtotal)} />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="po-discount">{ui('قيمة الخصم')}</Label>
                <Input id="po-discount" type="number" min={0} step="0.01" className="nums" value={discount} onChange={(e) => setDiscount(e.target.value)} />
              </div>
              <div className="grid gap-1">
                <Label>{ui('قيمة الفاتورة بعد الخصم')}</Label>
                <Input className="nums" disabled value={money(afterDiscount)} />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="po-paid">{ui('المدفوع')}</Label>
                <Input
                  id="po-paid"
                  type="number"
                  min={0}
                  step="0.01"
                  className="nums"
                  value={paidFollowsTotal ? String(Math.max(afterDiscount, 0)) : paid}
                  onChange={(e) => {
                    setPaid(e.target.value);
                    setPaidEdited(true);
                  }}
                />
              </div>
              <div className="grid gap-1">
                <Label>{ui('الباقي')}</Label>
                <Input className="nums" disabled value={money(remaining)} />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="po-notes">{ui('البيان')}</Label>
                <Input id="po-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
            </div>
            {!editingId && (
              <p className="text-xs text-muted-foreground">
                {ui('المدفوع يُسجَّل دفعة نقدية من خزنة الفرع بتاريخ تسجيل الفاتورة ويظهر في القيود والتقفيل اليومي، والباقي يُسجَّل مديونية على الفرع للمورد.')}
              </p>
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
