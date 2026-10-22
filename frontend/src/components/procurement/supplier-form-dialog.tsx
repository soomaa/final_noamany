import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Star, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api, apiError } from '@/lib/api';
import type { PaginatedResponse } from '@/components/common/data-table';
import type { ProductListItem } from '@/types/inventory';
import { useLocale } from '@/store/locale';
import { usePermission } from '@/hooks/use-permission';

export interface SupplierPhone { id?: number; phone: string; isPrimary: boolean }
export interface Supplier {
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
export const PHONE_PATTERN = /^\+?[0-9][0-9\s()-]{5,24}$/;

interface SupplierFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Supplier to edit; null opens an empty form for a new supplier. */
  supplierId: number | null;
  onSaved?: () => void;
}

export function SupplierFormDialog({ open, onOpenChange, supplierId, onSaved }: SupplierFormDialogProps) {
  const { ui } = useLocale();
  const qc = useQueryClient();
  const { can } = usePermission();
  const [form, setForm] = useState<SupplierForm>(initial);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const { data: materials } = useQuery({
    queryKey: ['products', 'supplier-stock-options'],
    enabled: open,
    queryFn: async () => {
      const [rawMaterials, readyProducts] = await Promise.all([
        api.get<PaginatedResponse<ProductListItem>>('/products', { params: { page: 1, pageSize: 200, inventoryKind: 'raw_material', status: 'active' } }),
        api.get<PaginatedResponse<ProductListItem>>('/products', { params: { page: 1, pageSize: 200, inventoryKind: 'ready_product', status: 'active' } }),
      ]);
      return [...rawMaterials.data.data, ...readyProducts.data.data];
    },
  });

  useEffect(() => {
    if (!open) return;
    if (!supplierId) {
      setForm(initial());
      return;
    }
    let cancelled = false;
    setLoading(true);
    Promise.all([
      api.get<Supplier>(`/suppliers/${supplierId}`),
      api.get<Array<{ id: number }>>(`/suppliers/${supplierId}/products`),
    ])
      .then(([detail, links]) => {
        if (cancelled) return;
        setForm({
          nameAr: detail.data.nameAr,
          phones: detail.data.phones.length ? detail.data.phones : [emptyPhone()],
          address: detail.data.address ?? '',
          notes: detail.data.notes ?? '',
          rating: String(detail.data.rating ?? 5),
          isActive: detail.data.isActive,
          productIds: links.data.map((link) => link.id),
        });
      })
      .catch((error) => {
        if (cancelled) return;
        toast.error(apiError(error));
        onOpenChange(false);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, supplierId]);

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
      if (supplierId) await api.put(`/suppliers/${supplierId}`, payload);
      else await api.post('/suppliers', payload);
      toast.success(ui('تم حفظ المورد وأرقام الهاتف والخامات'));
      onOpenChange(false);
      await qc.invalidateQueries({ queryKey: ['suppliers'] });
      onSaved?.();
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader><DialogTitle>{supplierId ? ui('تعديل المورد') : ui('مورد جديد')}</DialogTitle></DialogHeader>
        <Tabs defaultValue="details">
          <TabsList><TabsTrigger value="details">{ui('بيانات المورد')}</TabsTrigger><TabsTrigger value="materials">{ui('الخامات التي يوفرها')}</TabsTrigger></TabsList>
          <TabsContent value="details" className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div><Label>{ui('الاسم')}</Label><Input value={form.nameAr} disabled={loading} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} /></div>
              <div><Label>{ui('العنوان')}</Label><Input value={form.address} disabled={loading} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
            </div>
            <div className="rounded-xl border bg-muted/20 p-3">
              <div className="mb-3 flex items-center justify-between">
                <div><Label>{ui('أرقام الهاتف')}</Label><p className="text-xs text-muted-foreground">{ui('يمكن إضافة أي عدد من الأرقام وتحديد رقم أساسي واحد')}</p></div>
                <Button type="button" size="sm" variant="outline" onClick={() => setForm((current) => ({ ...current, phones: [...current.phones, { phone: '', isPrimary: false }] }))}><Plus className="size-4" />{ui('إضافة رقم')}</Button>
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
                      <Button aria-label={ui('حذف رقم الهاتف')} type="button" variant="ghost" size="icon" className="text-destructive" onClick={() => removePhone(index)}><Trash2 className="size-4" /></Button>
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
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>{ui('إلغاء')}</Button><Button disabled={saving || loading || !(supplierId ? can('gym-sales.procurement.suppliers:update') : can('gym-sales.procurement.suppliers:create'))} onClick={() => void save()}>{saving ? ui('جاري الحفظ…') : ui('حفظ')}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
