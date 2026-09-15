import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, CheckCircle2, FileUp, Lock, PackagePlus, Pencil, Plus, ReceiptText, Trash2, Truck, WalletCards, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api, apiError } from '@/lib/api';
import { toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';
import { useAuth } from '@/store/auth';
import type { PaginatedResponse } from '@/components/common/data-table';
import type { NamedEntity } from '@/types/inventory';
import { GymSalesPageShell } from '@/pages/gym-sales/shell';
import { InlineRawMaterialDialog } from '@/components/cafe/inline-raw-material-dialog';
import { compatibleCafeUnits, convertCafeUnit } from '@/lib/cafe-units';
import { useBranches } from '@/hooks/use-branches';
import { localToday } from '@/lib/formatters';
import { usePermission } from '@/hooks/use-permission';

interface SupplierMaterial {
  id: number;
  nameAr: string;
  size?: string | null;
  unitOfMeasure: string;
  costPrice: number;
  currentStock: number;
  isPackaged?: boolean;
  packages?: Array<{
    id: number;
    packageSize: number;
    packageUnit: string;
    packageBaseQuantity: number;
    packagePrice: number;
    reorderPoint: number;
    isDefault: boolean;
  }>;
}
interface PurchaseLine { productId: string; packageId: string; quantity: string; unit: string; lineTotal: string }
interface CostChange { productId: number; productName: string; oldCost: number; newCost: number }
interface SupplierInvoiceItem { productId: number | null; packageId: number | null; productName: string | null; quantity: number; unit: string | null; lineTotal: number }
interface SupplierInvoice {
  id: number;
  invoiceNumber: string;
  supplierInvoiceNumber: string | null;
  attachmentUrl: string | null;
  supplierId: number;
  branchId: number | null;
  warehouseId: number | null;
  invoiceDate: string | null;
  dueDate: string | null;
  subtotal: number;
  taxAmount: number;
  discountAmount: number;
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  status: string;
  items: SupplierInvoiceItem[];
}

const emptyLine = (): PurchaseLine => ({ productId: '', packageId: '', quantity: '1', unit: '', lineTotal: '' });
const lineUnitPrice = (line: PurchaseLine) => {
  const quantity = Number(line.quantity) || 0;
  const total = Number(line.lineTotal) || 0;
  return quantity > 0 ? Math.round((total / quantity) * 10000) / 10000 : 0;
};

const purchaseBaseQuantity = (line: PurchaseLine, material: SupplierMaterial) => {
  const selectedPackage = material.packages?.find((pack) => pack.id === Number(line.packageId));
  if (line.unit === 'package' && material.isPackaged && selectedPackage) {
    return (Number(line.quantity) || 0) * selectedPackage.packageBaseQuantity;
  }
  return convertCafeUnit(Number(line.quantity), line.unit, material.unitOfMeasure) ?? 0;
};

const invoiceStatusLabel = (status: string) => ({
  draft: 'مسودة',
  received: 'مستلمة',
  posted: 'مرحّلة',
  partial: 'مدفوعة جزئيًا',
  paid: 'مدفوعة',
  cancelled: 'ملغاة',
}[status] ?? status);

export function CafePurchasesPage() {
  const { ui } = useLocale();
  const qc = useQueryClient();
  const user = useAuth((state) => state.user);
  const { can } = usePermission();
  const { data: branches = [] } = useBranches();
  const [branchId, setBranchId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [supplierInvoiceNumber, setSupplierInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(localToday());
  const [dueDate, setDueDate] = useState('');
  const [taxAmount, setTaxAmount] = useState('0');
  const [discountAmount, setDiscountAmount] = useState('0');
  const [initialPaymentMethod, setInitialPaymentMethod] = useState('cash');
  const [attachmentUrl, setAttachmentUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [paidAmount, setPaidAmount] = useState('0');
  const [lines, setLines] = useState<PurchaseLine[]>([emptyLine()]);
  const [saving, setSaving] = useState(false);
  const [editingInvoiceId, setEditingInvoiceId] = useState<number | null>(null);
  const [inlineMaterials, setInlineMaterials] = useState<SupplierMaterial[]>([]);
  const [costDialogOpen, setCostDialogOpen] = useState(false);
  const [costChanges, setCostChanges] = useState<CostChange[]>([]);
  const effectiveBranchId = user?.branch && user.branch > 0
    ? String(user.branch)
    : branchId || String(branches[0]?.id ?? '');

  const { data: suppliers } = useQuery({
    queryKey: ['suppliers', 'cafe-purchases'],
    queryFn: async () => (await api.get<PaginatedResponse<NamedEntity>>('/suppliers', { params: { page: 1, pageSize: 200, status: 'active' } })).data.data,
  });
  const { data: materials, isLoading: materialsLoading } = useQuery({
    queryKey: ['suppliers', supplierId, 'materials', effectiveBranchId],
    queryFn: async () => (await api.get<SupplierMaterial[]>(`/suppliers/${supplierId}/products`, { params: { branchId: effectiveBranchId } })).data,
    enabled: !!supplierId && !!effectiveBranchId,
  });
  const { data: invoices } = useQuery({
    queryKey: ['supplier-invoices', 'cafe', effectiveBranchId],
    queryFn: async () => (await api.get<PaginatedResponse<SupplierInvoice>>('/supplier-invoices', { params: { page: 1, pageSize: 50, branchId: effectiveBranchId || undefined } })).data.data,
    enabled: !!effectiveBranchId,
  });
  const allMaterials = useMemo(() => {
    const byId = new Map([...(materials ?? []), ...inlineMaterials].map((material) => [material.id, material]));
    return [...byId.values()];
  }, [materials, inlineMaterials]);

  const subtotal = useMemo(() => lines.reduce((sum, line) => sum + (Number(line.lineTotal) || 0), 0), [lines]);
  const total = Math.max(0, subtotal + (Number(taxAmount) || 0) - (Number(discountAmount) || 0));
  const remaining = Math.max(0, total - (Number(paidAmount) || 0));
  const updateLine = (index: number, patch: Partial<PurchaseLine>) => setLines((current) => current.map((line, i) => i === index ? { ...line, ...patch } : line));
  const resetForm = () => {
    setEditingInvoiceId(null);
    setSupplierId('');
    setSupplierInvoiceNumber('');
    setInvoiceDate(localToday());
    setDueDate('');
    setTaxAmount('0');
    setDiscountAmount('0');
    setInitialPaymentMethod('cash');
    setAttachmentUrl('');
    setLines([emptyLine()]);
    setPaidAmount('0');
  };
  const editInvoice = (invoice: SupplierInvoice) => {
    if (!invoice.branchId || !invoice.warehouseId) return toast.error(ui('هذه فاتورة قديمة لا تحتوي على بيانات مخزون مكتملة ولا يمكن تصحيحها من هذه الشاشة'));
    if (invoice.branchId !== Number(effectiveBranchId)) return toast.error(ui('لا يمكن تعديل فاتورة تخص فرعًا آخر'));
    setEditingInvoiceId(invoice.id);
    setSupplierId(String(invoice.supplierId));
    setSupplierInvoiceNumber(invoice.supplierInvoiceNumber ?? '');
    setInvoiceDate(invoice.invoiceDate ?? localToday());
    setDueDate(invoice.dueDate ?? '');
    setTaxAmount(String(invoice.taxAmount));
    setDiscountAmount(String(invoice.discountAmount));
    setAttachmentUrl(invoice.attachmentUrl ?? '');
    setPaidAmount(String(invoice.paidAmount));
    setLines(invoice.items.map((item) => ({
      productId: String(item.productId ?? ''),
      packageId: String(item.packageId ?? ''),
      quantity: String(item.quantity),
      unit: item.unit ?? '',
      lineTotal: String(item.lineTotal),
    })));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const uploadInvoice = async (file?: File) => {
    if (!file) return;
    setUploading(true);
    try {
      const body = new FormData();
      body.append('file', file);
      const { data } = await api.post<{ url: string }>('/uploads/procurement-doc', body, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setAttachmentUrl(data.url);
      toast.success(ui('تم إرفاق صورة أو ملف فاتورة المورد'));
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setUploading(false);
    }
  };

  const save = async (costUpdateMode?: 'replace' | 'keep') => {
    if (!effectiveBranchId) return toast.error(ui('حساب المستخدم غير مرتبط بفرع'));
    if (!supplierId) return toast.error(ui('اختر المورد'));
    if (lines.some((line) => {
      const material = allMaterials.find((item) => item.id === Number(line.productId));
      return !line.productId
        || Number(line.quantity) <= 0
        || Number(line.lineTotal) < 0
        || !line.unit
        || (material?.isPackaged === true && !line.packageId);
    })) return toast.error(ui('راجع بنود الفاتورة واختر حجم العبوة لكل خامة معبأة'));
    if (!costUpdateMode) {
      const changes = lines.flatMap((line): CostChange[] => {
        const material = allMaterials.find((item) => item.id === Number(line.productId));
        if (!material) return [];
        const baseQuantity = purchaseBaseQuantity(line, material);
        if (!baseQuantity || baseQuantity <= 0) return [];
        const newCost = Math.round((Number(line.lineTotal) / baseQuantity) * 10000) / 10000;
        if (Math.abs(newCost - material.costPrice) < 0.0001) return [];
        const selectedPackage = material.packages?.find((pack) => pack.id === Number(line.packageId));
        return [{
          productId: material.id,
          productName: `${material.nameAr}${selectedPackage ? ` — ${selectedPackage.packageSize} ${selectedPackage.packageUnit}` : material.size ? ` — ${material.size}` : ''}`,
          oldCost: material.costPrice,
          newCost,
        }];
      });
      if (changes.length > 0) {
        setCostChanges(changes);
        setCostDialogOpen(true);
        return;
      }
      costUpdateMode = 'keep';
    }
    setSaving(true);
    try {
      const payload = {
        supplierId: Number(supplierId),
        branchId: Number(effectiveBranchId),
        supplierInvoiceNumber: supplierInvoiceNumber.trim() || undefined,
        invoiceDate,
        dueDate: dueDate || undefined,
        taxAmount: Number(taxAmount) || 0,
        discountAmount: Number(discountAmount) || 0,
        initialPaymentMethod,
        attachmentUrl: attachmentUrl || undefined,
        paidAmount: Number(paidAmount) || 0,
        items: lines.map((line) => ({ productId: Number(line.productId), packageId: line.packageId ? Number(line.packageId) : undefined, quantity: Number(line.quantity), unit: line.unit, lineTotal: Number(line.lineTotal), unitPrice: lineUnitPrice(line), costUpdateMode })),
      };
      if (editingInvoiceId) await api.put(`/supplier-invoices/${editingInvoiceId}`, payload);
      else await api.post('/supplier-invoices', payload);
      toast.success(ui(editingInvoiceId ? 'تم تصحيح الفاتورة وتحديث المخزون والمديونية والقيد المالي' : 'تم حفظ الفاتورة وتحديث المخزون والمديونية'));
      resetForm();
      await Promise.all([qc.invalidateQueries({ queryKey: ['supplier-invoices'] }), qc.invalidateQueries({ queryKey: ['products'] }), qc.invalidateQueries({ queryKey: ['stock'] }), qc.invalidateQueries({ queryKey: ['suppliers', supplierId, 'materials'] })]);
    } catch (error) { toast.error(apiError(error)); } finally { setSaving(false); }
  };

  return (
    <GymSalesPageShell section="procurement" title={ui('مشتريات الكافيه')} description={ui('استلام الخامات وتحديث متوسط التكلفة والمخزون والمديونية في عملية واحدة')}>
      <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="overflow-hidden border shadow-lg">
          <CardHeader className="border-b bg-gradient-to-l from-primary/12 via-primary/5 to-card">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="grid size-11 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm"><ReceiptText className="size-5" /></span>
                <div><CardTitle>{ui(editingInvoiceId ? 'تصحيح فاتورة شراء' : 'فاتورة شراء جديدة')}</CardTitle><p className="mt-1 text-xs text-muted-foreground">{ui('بيانات المورد، بنود الاستلام، ثم ملخص الدفع')}</p></div>
              </div>
              {editingInvoiceId ? <Button type="button" variant="outline" size="sm" onClick={resetForm}><X className="size-4" />{ui('إلغاء التعديل')}</Button> : null}
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            {editingInvoiceId ? <div className="rounded-xl border border-amber-400/50 bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-100">{ui('سيتم توثيق التصحيح وعكس أثر المخزون والقيد القديم قبل تطبيق البيانات الجديدة. الدفعات السابقة لا تتغير هنا.')}</div> : null}

            <section className="rounded-2xl border bg-muted/15 p-4">
              <div className="mb-4 flex items-center gap-2"><Truck className="size-5 text-primary" /><h2 className="font-bold">{ui('بيانات المورد والفاتورة')}</h2></div>
              <div className="grid gap-3 md:grid-cols-2">
                <div><Label>{ui('المورد')}</Label><select disabled={!!editingInvoiceId} className="mt-1 h-11 w-full rounded-lg border bg-background px-3 text-sm disabled:opacity-60" value={supplierId} onChange={(event) => { setSupplierId(event.target.value); setLines([emptyLine()]); }}><option value="">{ui('اختر المورد')}</option>{(suppliers ?? []).map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.nameAr}</option>)}</select></div>
                <div><Label>{ui('الفرع')}</Label>{user?.branch && user.branch > 0 ? <div className="mt-1 flex h-11 items-center justify-between rounded-lg border bg-background px-3 text-sm"><span>{user.branch_name || `${ui('فرع رقم')} ${effectiveBranchId}`}</span><Lock className="size-4 text-muted-foreground" /></div> : <select className="mt-1 h-11 w-full rounded-lg border bg-background px-3 text-sm" value={effectiveBranchId} onChange={(event) => setBranchId(event.target.value)}><option value="">{ui('اختر الفرع')}</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select>}</div>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div><Label className="text-xs">{ui('رقم فاتورة المورد')}</Label><Input className="mt-1 h-10" value={supplierInvoiceNumber} onChange={(event) => setSupplierInvoiceNumber(event.target.value)} placeholder={ui('الرقم على الفاتورة')} /></div>
                <div><Label className="text-xs">{ui('تاريخ الفاتورة')}</Label><Input className="mt-1 h-10" type="date" value={invoiceDate} onChange={(event) => setInvoiceDate(event.target.value)} /></div>
                <div><Label className="text-xs">{ui('تاريخ الاستحقاق')}</Label><Input className="mt-1 h-10" type="date" min={invoiceDate} value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></div>
                <div><Label className="text-xs">{ui('مرفق الفاتورة')}</Label><label className={`mt-1 flex h-10 cursor-pointer items-center justify-center gap-2 rounded-lg border px-3 text-sm transition hover:bg-muted ${attachmentUrl ? 'border-emerald-400 bg-emerald-500/10 text-emerald-700' : 'bg-background'}`}><FileUp className="size-4" />{uploading ? ui('جاري الرفع…') : attachmentUrl ? ui('تم الإرفاق — استبدال') : ui('صورة أو PDF')}<input className="hidden" type="file" accept="image/*,application/pdf" disabled={uploading} onChange={(event) => void uploadInvoice(event.target.files?.[0])} /></label></div>
              </div>
            </section>

            {(suppliers ?? []).length === 0 ? <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">{ui('ابدأ بإضافة مورد وربطه بالخامات؛ بعدها ستظهر خاماته هنا فقط.')}</div> : null}
            {supplierId && !materialsLoading && (materials ?? []).length === 0 ? <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">{ui('لا توجد خامات مربوطة بهذا المورد. اربط الخامة من صفحة الموردين أو اختره كمورد أساسي داخل بيانات الخامة.')}</div> : null}

            <section className="rounded-2xl border p-4">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2"><PackagePlus className="size-5 text-primary" /><div><h2 className="font-bold">{ui('بنود الاستلام')}</h2><p className="text-xs text-muted-foreground">{toArabicDigits(lines.length)} {ui('بند في الفاتورة')}</p></div></div>
                <div className="flex flex-wrap gap-2"><Button permissionAction={null} type="button" size="sm" variant="outline" onClick={() => setLines((rows) => [...rows, emptyLine()])}><Plus className="size-4" />{ui('إضافة بند')}</Button>{can('gym-sales.inventory.raw_materials:create') ? <InlineRawMaterialDialog supplierId={supplierId ? Number(supplierId) : undefined} disabled={!supplierId} onCreated={(material) => setInlineMaterials((current) => [...current.filter((item) => item.id !== material.id), { id: material.id, nameAr: material.nameAr, size: material.size, unitOfMeasure: material.unitOfMeasure, costPrice: material.costPrice, currentStock: material.currentStock ?? 0 }])} /> : null}</div>
              </div>
              <div className="space-y-3">{lines.map((line, index) => {
                const selectedMaterial = allMaterials.find((material) => material.id === Number(line.productId));
                const selectedPackage = selectedMaterial?.packages?.find((pack) => pack.id === Number(line.packageId));
                return <article key={index} className="rounded-2xl border bg-muted/[0.12] p-4 shadow-sm">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2"><span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-black text-primary">{index + 1}</span><div className="min-w-0"><p className="truncate font-bold">{selectedMaterial ? `${selectedMaterial.nameAr}${selectedMaterial.size ? ` — ${selectedMaterial.size}` : ''}` : ui('بند شراء جديد')}</p>{selectedMaterial ? <p className="mt-0.5 text-xs text-muted-foreground">{ui('الوحدة الأساسية')}: {selectedMaterial.unitOfMeasure}</p> : null}</div></div>
                    <Button permissionAction={null} type="button" variant="ghost" size="icon" className="size-8 text-destructive" aria-label={ui('حذف البند')} disabled={lines.length === 1} onClick={() => setLines((rows) => rows.filter((_, lineIndex) => lineIndex !== index))}><Trash2 className="size-4" /></Button>
                  </div>
                  <div className={`grid gap-3 md:grid-cols-2 ${selectedMaterial?.isPackaged ? 'xl:grid-cols-[minmax(210px,1.4fr)_170px_105px_100px_145px]' : 'xl:grid-cols-[minmax(230px,1.5fr)_110px_120px_150px]'}`}>
                    <div><Label className="text-xs">{ui('الخامة')}</Label><select className="mt-1 h-10 w-full rounded-lg border bg-background px-3 text-sm" value={line.productId} onChange={(event) => { const material = allMaterials.find((item) => item.id === Number(event.target.value)); const defaultPackage = material?.packages?.find((pack) => pack.isDefault) ?? material?.packages?.[0]; updateLine(index, { productId: event.target.value, packageId: defaultPackage ? String(defaultPackage.id) : '', unit: material?.isPackaged ? 'package' : material?.unitOfMeasure ?? '', lineTotal: defaultPackage ? String(defaultPackage.packagePrice * (Number(line.quantity) || 1)) : '' }); }}><option value="">{ui('اختر الخامة')}</option>{allMaterials.map((material) => <option key={material.id} value={material.id}>{material.nameAr}{material.size ? ` — ${material.size}` : ''}</option>)}</select></div>
                    {selectedMaterial?.isPackaged ? <div><Label className="text-xs">{ui('حجم العبوة')}</Label><select className="mt-1 h-10 w-full rounded-lg border bg-background px-2 text-sm" value={line.packageId} onChange={(event) => { const pack = selectedMaterial.packages?.find((item) => item.id === Number(event.target.value)); updateLine(index, { packageId: event.target.value, unit: 'package', lineTotal: pack ? String(pack.packagePrice * (Number(line.quantity) || 1)) : '' }); }}><option value="">{ui('اختر الحجم')}</option>{selectedMaterial.packages?.map((pack) => <option key={pack.id} value={pack.id}>{toArabicDigits(pack.packageSize)} {pack.packageUnit} — {toArabicDigits(pack.packagePrice)}</option>)}</select></div> : null}
                    <div><Label className="text-xs">{selectedMaterial?.isPackaged ? ui('عدد العبوات') : ui('الكمية')}</Label><Input className="nums mt-1 h-10" type="number" min={selectedMaterial?.isPackaged ? 1 : 0.001} step={selectedMaterial?.isPackaged ? 1 : 0.001} value={line.quantity} onChange={(event) => updateLine(index, { quantity: event.target.value })} /></div>
                    <div><Label className="text-xs">{ui('الوحدة')}</Label><select className="mt-1 h-10 w-full rounded-lg border bg-background px-2 text-sm disabled:opacity-60" value={line.unit} onChange={(event) => updateLine(index, { unit: event.target.value, packageId: event.target.value === 'package' ? line.packageId : '' })} disabled={!selectedMaterial || selectedMaterial.isPackaged}><option value="">{ui('الوحدة')}</option>{selectedMaterial?.isPackaged ? <option value="package">{ui('عبوة')}</option> : compatibleCafeUnits(selectedMaterial?.unitOfMeasure ?? '').map((unit) => <option key={unit} value={unit}>{unit}</option>)}</select></div>
                    <div><Label className="text-xs">{ui('إجمالي تكلفة البند')}</Label><Input className="nums mt-1 h-10 font-bold" type="number" min={0} step="0.01" value={line.lineTotal} onChange={(event) => updateLine(index, { lineTotal: event.target.value })} placeholder="0.00" /></div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    <span className="rounded-full bg-background px-3 py-1.5 text-muted-foreground">{ui('الموجود الآن')}: <b className="nums text-foreground">{selectedMaterial ? `${toArabicDigits(selectedMaterial.currentStock)} ${selectedMaterial.unitOfMeasure}` : '—'}</b></span>
                    <span className="rounded-full bg-background px-3 py-1.5 text-muted-foreground">{ui('سعر الوحدة في الفاتورة')}: <b className="nums text-primary">{toArabicDigits(lineUnitPrice(line).toFixed(4))}</b></span>
                    {selectedPackage ? <span className="rounded-full bg-background px-3 py-1.5 text-muted-foreground">{ui('العبوة تضيف')}: <b className="nums text-foreground">{toArabicDigits(selectedPackage.packageBaseQuantity)} {selectedMaterial?.unitOfMeasure}</b></span> : null}
                    {selectedMaterial ? <span className="rounded-full bg-background px-3 py-1.5 text-muted-foreground">{ui('التكلفة الحالية')}: <b className="nums text-foreground">{toArabicDigits(selectedMaterial.costPrice.toFixed(4))}</b></span> : null}
                  </div>
                </article>;
              })}</div>
            </section>

            <section className="grid gap-4 lg:grid-cols-[1fr_1.05fr]">
              <div className="rounded-2xl border bg-muted/15 p-4">
                <h2 className="font-bold">{ui('ملخص الفاتورة')}</h2>
                <div className="mt-4 grid grid-cols-3 gap-2">
                  <div><Label className="text-[11px]">{ui('إجمالي البنود')}</Label><div className="nums mt-1 grid h-10 place-items-center rounded-lg border bg-background font-bold">{toArabicDigits(subtotal.toFixed(2))}</div></div>
                  <div><Label className="text-[11px]">{ui('الضريبة')}</Label><Input className="nums mt-1 h-10" type="number" min={0} step="0.01" value={taxAmount} onChange={(event) => setTaxAmount(event.target.value)} /></div>
                  <div><Label className="text-[11px]">{ui('الخصم')}</Label><Input className="nums mt-1 h-10" type="number" min={0} max={subtotal + (Number(taxAmount) || 0)} step="0.01" value={discountAmount} onChange={(event) => setDiscountAmount(event.target.value)} /></div>
                </div>
                <div className="mt-3 flex items-center justify-between rounded-xl bg-primary px-4 py-3 text-primary-foreground"><span className="font-bold">{ui('الإجمالي النهائي')}</span><span className="nums text-2xl font-black">{toArabicDigits(total.toFixed(2))}</span></div>
              </div>

              <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.06] p-4">
                <div className="flex items-center gap-2"><WalletCards className="size-5 text-emerald-700" /><h2 className="font-bold text-emerald-900 dark:text-emerald-100">{ui('الدفع للمورد')}</h2></div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div><Label className="text-xs">{ui('المدفوع الآن')}</Label><Input className="nums mt-1 h-11 border-emerald-500/35 bg-background text-lg font-black" type="number" min={0} max={editingInvoiceId ? undefined : total} step="any" value={paidAmount} disabled={!!editingInvoiceId} onChange={(event) => setPaidAmount(event.target.value)} /></div>
                  <div><Label className="text-xs">{ui('طريقة الدفع')}</Label><select disabled={!!editingInvoiceId || Number(paidAmount) <= 0} className="mt-1 h-11 w-full rounded-lg border bg-background px-3 text-sm disabled:opacity-60" value={initialPaymentMethod} onChange={(event) => setInitialPaymentMethod(event.target.value)}><option value="cash">{ui('نقدي')}</option><option value="bank">{ui('تحويل بنكي')}</option><option value="card">{ui('بطاقة')}</option><option value="wallet">{ui('محفظة')}</option></select></div>
                </div>
                <div className="mt-3 flex items-center justify-between rounded-xl border border-emerald-500/25 bg-background px-4 py-3"><span className="text-sm font-bold">{ui('المتبقي للمورد')}</span><span className={`nums text-xl font-black ${remaining > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>{toArabicDigits(remaining.toFixed(2))}</span></div>
                {editingInvoiceId ? <p className="mt-2 text-xs text-emerald-800/75 dark:text-emerald-200/75">{ui('الدفعات المرحّلة تُدار من صفحة سداد الموردين')}</p> : null}
              </div>
            </section>

            <Button permissionAction={editingInvoiceId ? 'update' : 'create'} className="h-12 w-full text-base font-bold shadow-lg shadow-primary/15" disabled={saving || !(editingInvoiceId ? can('gym-sales.procurement.cafe_purchases:update') : can('gym-sales.procurement.cafe_purchases:create'))} onClick={() => void save()}><CheckCircle2 className="size-5" />{saving ? ui('جاري الحفظ…') : ui(editingInvoiceId ? 'حفظ التصحيح' : 'حفظ واستلام الفاتورة')}</Button>
          </CardContent>
        </Card>

        <Card className="h-fit overflow-hidden border shadow-lg 2xl:sticky 2xl:top-4">
          <CardHeader className="border-b bg-muted/20"><div className="flex items-center justify-between gap-2"><div className="flex items-center gap-2"><CalendarDays className="size-5 text-primary" /><CardTitle>{ui('آخر المشتريات')}</CardTitle></div><span className="nums rounded-full bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary">{toArabicDigits((invoices ?? []).length)}</span></div></CardHeader>
          <CardContent className="max-h-[760px] space-y-3 overflow-y-auto">
            {(invoices ?? []).length === 0 ? <div className="grid min-h-40 place-items-center rounded-xl border border-dashed p-6 text-center"><div><ReceiptText className="mx-auto size-9 text-muted-foreground/50" /><p className="mt-2 text-sm font-semibold">{ui('لا توجد فواتير شراء بعد')}</p></div></div> : (invoices ?? []).map((invoice) => {
              const status = invoiceStatusLabel(invoice.status);
              return <article key={invoice.id} className="rounded-2xl border bg-card p-3 text-sm shadow-sm">
                <div className="flex items-start justify-between gap-2"><div><p className="nums font-black">{invoice.invoiceNumber}</p><p className="nums mt-1 text-xs text-muted-foreground">{invoice.invoiceDate ? toArabicDigits(invoice.invoiceDate.slice(0, 10)) : '—'}</p></div><span className="rounded-full bg-primary/10 px-2 py-1 text-[10px] font-bold text-primary">{ui(status)}</span></div>
                <dl className="mt-3 grid grid-cols-2 gap-2"><div className="rounded-lg bg-muted/45 p-2"><dt className="text-[10px] text-muted-foreground">{ui('الإجمالي')}</dt><dd className="nums mt-0.5 font-bold">{toArabicDigits(invoice.totalAmount.toFixed(2))}</dd></div><div className="rounded-lg bg-muted/45 p-2"><dt className="text-[10px] text-muted-foreground">{ui('المتبقي')}</dt><dd className={`nums mt-0.5 font-bold ${invoice.remainingAmount > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>{toArabicDigits(invoice.remainingAmount.toFixed(2))}</dd></div></dl>
                {can('gym-sales.procurement.cafe_purchases:update') ? <Button type="button" variant="outline" size="sm" className="mt-3 w-full" onClick={() => editInvoice(invoice)}><Pencil className="size-4" />{ui('فتح وتصحيح الفاتورة')}</Button> : null}
              </article>;
            })}
          </CardContent>
        </Card>
      </div>
      <Dialog open={costDialogOpen} onOpenChange={setCostDialogOpen}>
        <DialogContent size="md">
          <DialogHeader><DialogTitle>{ui('تأكيد تغيير تكلفة المخزون')}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">{ui('تكلفة الشراء الجديدة مختلفة عن التكلفة المسجلة. اختر هل تريد اعتماد التكلفة الجديدة أم الإبقاء على الحالية.')}</p>
          <div className="max-h-72 space-y-2 overflow-y-auto">
            {costChanges.map((change) => (
              <div key={change.productId} className="rounded-lg border p-3 text-sm">
                <p className="font-medium">{change.productName}</p>
                <div className="nums mt-2 flex items-center justify-between gap-3 text-muted-foreground">
                  <span>{ui('الحالية')}: {toArabicDigits(change.oldCost.toFixed(4))}</span>
                  <span>{ui('الجديدة')}: {toArabicDigits(change.newCost.toFixed(4))}</span>
                </div>
              </div>
            ))}
          </div>
          <DialogFooter className="flex-wrap">
            <Button type="button" variant="outline" onClick={() => setCostDialogOpen(false)}>{ui('إلغاء')}</Button>
            <Button permissionAction={editingInvoiceId ? 'update' : 'create'} type="button" variant="secondary" disabled={saving} onClick={() => { setCostDialogOpen(false); void save('keep'); }}>{ui('سيب التكلفة زي ما هي')}</Button>
            <Button permissionAction={editingInvoiceId ? 'update' : 'create'} type="button" disabled={saving} onClick={() => { setCostDialogOpen(false); void save('replace'); }}>{ui('اعتماد التكلفة الجديدة')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </GymSalesPageShell>
  );
}
