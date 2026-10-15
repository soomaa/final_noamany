import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api, apiError } from '@/lib/api';
import { CAFE_UNIT_OPTIONS } from '@/lib/cafe-units';
import { useLocale } from '@/store/locale';
import type { ProductListItem } from '@/types/inventory';

interface Props {
  supplierId?: number;
  disabled?: boolean;
  onCreated?: (material: ProductListItem) => void;
  createdMessage?: string;
}

export function InlineRawMaterialDialog({ supplierId, disabled, onCreated, createdMessage }: Props) {
  const { ui } = useLocale();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [size, setSize] = useState('');
  const [unit, setUnit] = useState('piece');
  const [alertQuantity, setAlertQuantity] = useState(0);
  const [initialStock, setInitialStock] = useState(0);
  const [initialTotalCost, setInitialTotalCost] = useState(0);

  const save = async () => {
    if (!name.trim()) return toast.error(ui('اسم الخامة مطلوب'));
    setSaving(true);
    try {
      const { data } = await api.post<ProductListItem>('/products', {
        nameAr: name.trim(),
        nameEn: name.trim(),
        size: size.trim() || undefined,
        inventoryKind: 'raw_material',
        inventorySection: 'preparation_ingredients',
        costPrice: 0,
        initialStock: Number(initialStock) || 0,
        initialTotalCost: Number(initialStock) > 0 ? Number(initialTotalCost) || 0 : undefined,
        unitOfMeasure: unit,
        minStock: Number(alertQuantity) || 0,
        reorderPoint: Number(alertQuantity) || 0,
        supplierId,
        status: 'active',
      });
      await queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success(createdMessage ?? ui('تمت إضافة الخامة وأصبحت متاحة في الوصفة والمشتريات'));
      onCreated?.(data);
      setName('');
      setSize('');
      setUnit('piece');
      setAlertQuantity(0);
      setInitialStock(0);
      setInitialTotalCost(0);
      setOpen(false);
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => setOpen(true)}>
        <Plus className="me-1 size-4" />
        {ui('إضافة خامة غير موجودة')}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="md">
          <DialogHeader><DialogTitle>{ui('إضافة خامة جديدة')}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            {ui('ستظهر الخامة فورًا في الوصفات والمشتريات والجرد، ويمكن تسجيل رصيدها وتكلفتها الافتتاحية الآن.')}
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label>{ui('اسم الخامة')}</Label>
              <Input value={name} onChange={(event) => setName(event.target.value)} autoFocus />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="inlineMaterialSize">{ui('المقاس / الحجم (اختياري)')}</Label>
              <Input id="inlineMaterialSize" dir="ltr" value={size} onChange={(event) => setSize(event.target.value)} placeholder="8 oz / 12 oz / 16 oz / Large" />
              <p className="text-xs text-muted-foreground">{ui('مثال: سجّل كل مقاس من الأكواب كخامة مستقلة ليكون له رصيد وتكلفة خاصة.')}</p>
            </div>
            <div className="space-y-2">
              <Label>{ui('وحدة القياس')}</Label>
              <select className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={unit} onChange={(event) => setUnit(event.target.value)}>
                {CAFE_UNIT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{ui(option.label)}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <Label>{ui('تنبيه الكمية')}</Label>
              <Input dir="ltr" inputMode="decimal" className="nums text-end" type="number" min={0} step="0.001" value={alertQuantity} onChange={(event) => setAlertQuantity(Number(event.target.value))} />
            </div>
            <div className="space-y-2">
              <Label>{ui('الموجود حاليًا في المخزن')}</Label>
              <Input dir="ltr" inputMode="decimal" className="nums text-end" type="number" min={0} step="0.001" value={initialStock} onChange={(event) => setInitialStock(Number(event.target.value))} />
            </div>
            <div className="space-y-2">
              <Label>{ui('إجمالي تكلفة الرصيد الافتتاحي')}</Label>
              <Input dir="ltr" inputMode="decimal" className="nums text-end" type="number" min={0} step="0.01" value={initialTotalCost} onChange={(event) => setInitialTotalCost(Number(event.target.value))} />
              <p className="text-xs text-muted-foreground">
                {ui('اكتب سعر الكمية الموجودة كلها، وليس سعر وحدة القياس.')}
                {Number(initialStock) > 0 && Number(initialTotalCost) > 0
                  ? ` ${ui('تكلفة وحدة المخزون')}: ${(Number(initialTotalCost) / Number(initialStock)).toFixed(4)}`
                  : ''}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>{ui('إلغاء')}</Button>
            <Button permissionAction="create" type="button" disabled={saving} onClick={() => void save()}>{saving ? ui('جاري الحفظ…') : ui('حفظ الخامة')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
