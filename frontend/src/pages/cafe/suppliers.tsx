import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Phone, Plus, Star, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api, apiError } from '@/lib/api';
import type { PaginatedResponse } from '@/components/common/data-table';
import type { ProductListItem } from '@/types/inventory';
import { useLocale } from '@/store/locale';
import { GymSalesPageShell } from '@/pages/gym-sales/shell';
import { usePermission } from '@/hooks/use-permission';

interface SupplierPhone { id?: number; phone: string; isPrimary: boolean }
interface Supplier {
  id: number;
  nameAr: string;
  nameEn: string;
  phones: SupplierPhone[];
  primaryPhone?: string | null;
  address?: string;
  notes?: string;
  rating?: number;
  isActive: boolean;
}

interface SupplierForm {
  nameAr: string;
  phones: SupplierPhone[];
  address: string;
  notes: string;
  rating: string;
  isActive: boolean;
  productIds: number[];
}

const emptyPhone = (): SupplierPhone => ({ phone: '', isPrimary: true });
const initial = (): SupplierForm => ({
  nameAr: '',
  phones: [emptyPhone()],
  address: '',
  notes: '',
  rating: '5',
  isActive: true,
  productIds: [],
});
const PHONE_PATTERN = /^\+?[0-9][0-9\s()-]{5,24}$/;

export function CafeSuppliersPage() {
  const { ui } = useLocale();
  const qc = useQueryClient();
  const { can } = usePermission();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<SupplierForm>(initial);
  const [saving, setSaving] = useState(false);
  const { data: suppliers } = useQuery({
    queryKey: ['suppliers', 'cafe-management'],
    queryFn: async () => (await api.get<PaginatedResponse<Supplier>>('/suppliers', { params: { page: 1, pageSize: 200 } })).data.data,
  });
  const { data: materials } = useQuery({
    queryKey: ['products', 'supplier-stock-options'],
    queryFn: async () => {
      const [rawMaterials, readyProducts] = await Promise.all([
        api.get<PaginatedResponse<ProductListItem>>('/products', { params: { page: 1, pageSize: 200, inventoryKind: 'raw_material', status: 'active' } }),
        api.get<PaginatedResponse<ProductListItem>>('/products', { params: { page: 1, pageSize: 200, inventoryKind: 'ready_product', status: 'active' } }),
      ]);
      return [...rawMaterials.data.data, ...readyProducts.data.data];
    },
  });

  const edit = async (supplier: Supplier) => {
    const [detail, links] = await Promise.all([
      api.get<Supplier>(`/suppliers/${supplier.id}`),
      api.get<Array<{ id: number }>>(`/suppliers/${supplier.id}/products`),
    ]);
    setEditId(supplier.id);
    setForm({
      nameAr: detail.data.nameAr,
      phones: detail.data.phones.length ? detail.data.phones : [emptyPhone()],
      address: detail.data.address ?? '',
      notes: detail.data.notes ?? '',
      rating: String(detail.data.rating ?? 5),
      isActive: detail.data.isActive,
      productIds: links.data.map((link) => link.id),
    });
    setOpen(true);
  };

  const updatePhone = (index: number, phone: string) => {
    setForm((current) => ({
      ...current,
      phones: current.phones.map((row, rowIndex) => rowIndex === index ? { ...row, phone } : row),
    }));
  };

  const makePrimary = (index: number) => {
    setForm((current) => ({
      ...current,
      phones: current.phones.map((row, rowIndex) => ({ ...row, isPrimary: rowIndex === index })),
    }));
  };

  const removePhone = (index: number) => {
    setForm((current) => {
      const next = current.phones.filter((_, rowIndex) => rowIndex !== index);
      if (!next.length) return { ...current, phones: [emptyPhone()] };
      if (!next.some((row) => row.isPrimary)) next[0] = { ...next[0], isPrimary: true };
      return { ...current, phones: next };
    });
  };

  const save = async () => {
    if (!form.nameAr.trim()) return toast.error(ui('اسم المورد مطلوب'));
    const phones = form.phones.filter((row) => row.phone.trim());
    const invalid = phones.find((row) => !PHONE_PATTERN.test(row.phone.trim()));
    if (invalid) return toast.error(ui('أدخل رقم هاتف صالح باستخدام الأرقام ورمز الدولة إن لزم'));
    if (new Set(phones.map((row) => row.phone.replace(/[\s()-]/g, ''))).size !== phones.length) {
      return toast.error(ui('لا يمكن تكرار نفس رقم الهاتف'));
    }
    setSaving(true);
    try {
      const payload = { ...form, phones, nameEn: form.nameAr, rating: Number(form.rating) };
      if (editId) await api.put(`/suppliers/${editId}`, payload);
      else await api.post('/suppliers', payload);
      toast.success(ui('تم حفظ المورد وأرقام الهاتف والخامات'));
      setOpen(false);
      await qc.invalidateQueries({ queryKey: ['suppliers'] });
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <GymSalesPageShell section="procurement" title={ui('موردو الكافيه')} description={ui('بيانات المورد وأرقام التواصل والخامات التي يوفرها')}>
      <div className="mb-4 flex justify-end">
        {can('gym-sales.procurement.suppliers:create') ? <Button onClick={() => { setEditId(null); setForm(initial()); setOpen(true); }}><Plus className="size-4" />{ui('مورد جديد')}</Button> : null}
      </div>
      {(suppliers ?? []).length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">{ui('لا يوجد موردون بعد. أضف المورد ثم اربطه بالخامات التي يوفرها.')}</div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {(suppliers ?? []).map((supplier) => (
            <Card key={supplier.id} className="overflow-hidden transition-shadow hover:shadow-md">
              <CardHeader className="flex-row items-center justify-between border-b bg-muted/30">
                <CardTitle className="text-base">{supplier.nameAr}</CardTitle>
                {can('gym-sales.procurement.suppliers:update') ? <Button aria-label={ui('تعديل المورد')} variant="ghost" size="icon" onClick={() => void edit(supplier)}><Pencil className="size-4" /></Button> : null}
              </CardHeader>
              <CardContent className="space-y-3 pt-4 text-sm">
                <div className="space-y-1.5">
                  {(supplier.phones ?? []).length ? supplier.phones.map((phone) => (
                    <div key={phone.id ?? phone.phone} className="flex items-center gap-2 text-muted-foreground">
                      <Phone className="size-3.5" />
                      <span dir="ltr" className="nums">{phone.phone}</span>
                      {phone.isPrimary && <Badge variant="secondary" className="text-[10px]">{ui('أساسي')}</Badge>}
                    </div>
                  )) : <span className="text-muted-foreground">—</span>}
                </div>
                <p className="text-muted-foreground">{supplier.address || '—'}</p>
                <div className="flex items-center justify-between"><span>{ui('التقييم')}: {supplier.rating ?? '—'}</span><Badge variant={supplier.isActive ? 'default' : 'outline'}>{supplier.isActive ? ui('نشط') : ui('غير نشط')}</Badge></div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="lg">
          <DialogHeader><DialogTitle>{editId ? ui('تعديل المورد') : ui('مورد جديد')}</DialogTitle></DialogHeader>
          <Tabs defaultValue="details">
            <TabsList><TabsTrigger value="details">{ui('بيانات المورد')}</TabsTrigger><TabsTrigger value="materials">{ui('الخامات التي يوفرها')}</TabsTrigger></TabsList>
            <TabsContent value="details" className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div><Label>{ui('الاسم')}</Label><Input value={form.nameAr} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} /></div>
                <div><Label>{ui('العنوان')}</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
              </div>
              <div className="rounded-xl border bg-muted/20 p-3">
                <div className="mb-3 flex items-center justify-between">
                  <div><Label>{ui('أرقام الهاتف')}</Label><p className="text-xs text-muted-foreground">{ui('يمكن إضافة أي عدد من الأرقام وتحديد رقم أساسي واحد')}</p></div>
                  <Button permissionAction={null} type="button" size="sm" variant="outline" onClick={() => setForm((current) => ({ ...current, phones: [...current.phones, { phone: '', isPrimary: false }] }))}><Plus className="size-4" />{ui('إضافة رقم')}</Button>
                </div>
                <div className="space-y-2">
                  {form.phones.map((row, index) => {
                    const invalid = row.phone.length > 0 && !PHONE_PATTERN.test(row.phone.trim());
                    return (
                      <div key={row.id ? `phone-${row.id}` : `new-phone-${index}`} className="flex items-start gap-2">
                        <div className="flex-1">
                          <Input type="tel" inputMode="tel" dir="ltr" placeholder="+20 10 1234 5678" value={row.phone} onChange={(event) => updatePhone(index, event.target.value)} aria-invalid={invalid} className={invalid ? 'border-destructive' : ''} />
                          {invalid && <p className="mt-1 text-xs text-destructive">{ui('رقم الهاتف غير صالح')}</p>}
                        </div>
                        <Button type="button" variant={row.isPrimary ? 'default' : 'outline'} size="icon" aria-label={ui(row.isPrimary ? 'رقم الهاتف الأساسي' : 'تعيين رقم الهاتف كأساسي')} title={ui('تعيين كأساسي')} onClick={() => makePrimary(index)}><Star className={`size-4 ${row.isPrimary ? 'fill-current' : ''}`} /></Button>
                        <Button permissionAction={null} aria-label={ui('حذف رقم الهاتف')} type="button" variant="ghost" size="icon" className="text-destructive" onClick={() => removePhone(index)}><Trash2 className="size-4" /></Button>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div><Label>{ui('التقييم')}</Label><Input type="number" min={0} max={5} step="0.5" value={form.rating} onChange={(e) => setForm({ ...form, rating: e.target.value })} /></div>
                <div className="flex items-center gap-2 pt-6"><Switch id="supplierActive" checked={form.isActive} onCheckedChange={(isActive) => setForm({ ...form, isActive })} /><Label htmlFor="supplierActive">{ui('المورد نشط')}</Label></div>
                <div className="sm:col-span-2"><Label>{ui('ملاحظات')}</Label><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
              </div>
            </TabsContent>
            <TabsContent value="materials">
              <Label>{ui('الخامات التي يوفرها المورد')}</Label>
              <div className="mt-2 grid max-h-64 gap-2 overflow-y-auto rounded-lg border p-3 sm:grid-cols-2">
                {(materials ?? []).length === 0 ? <p className="text-sm text-muted-foreground sm:col-span-2">{ui('أضف الخامات أولًا من صفحة إدارة الخامات.')}</p> : (materials ?? []).map((material) => (
                  <label key={material.id} className="flex items-center gap-2 text-sm"><Checkbox checked={form.productIds.includes(material.id)} onCheckedChange={(checked) => setForm({ ...form, productIds: checked === true ? [...form.productIds, material.id] : form.productIds.filter((id) => id !== material.id) })} />{material.nameAr}{material.size ? ` — ${material.size}` : ''} ({material.unitOfMeasure})</label>
                ))}
              </div>
            </TabsContent>
          </Tabs>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>{ui('إلغاء')}</Button><Button permissionAction={editId ? 'update' : 'create'} disabled={saving || !(editId ? can('gym-sales.procurement.suppliers:update') : can('gym-sales.procurement.suppliers:create'))} onClick={() => void save()}>{saving ? ui('جاري الحفظ…') : ui('حفظ')}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </GymSalesPageShell>
  );
}
