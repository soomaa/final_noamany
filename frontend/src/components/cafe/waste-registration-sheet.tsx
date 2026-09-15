import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, PackageOpen, Plus, Scale, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api, apiError } from '@/lib/api';
import { toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import type { WasteCatalogItem, WastePreview, WasteReason, WasteRecord } from '@/pages/cafe/waste-types';

const NEW_REASON = '__new_reason__';
const money = (value: number) => `${toArabicDigits((value ?? 0).toFixed(2))} ج.م`;

function unitsFor(item: WasteCatalogItem) {
  const base = item.unit.toLowerCase();
  const units = base === 'g' || base === 'kg' || base === 'oz'
    ? ['g', 'kg', 'oz']
    : base === 'ml' || base === 'l' || base === 'fl_oz'
      ? ['ml', 'L', 'fl_oz']
      : ['piece'];
  if (item.packages.length) units.push('package');
  return units;
}

function newRequestId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function WasteRegistrationSheet({
  item,
  branchId,
  open,
  onOpenChange,
  reasons,
  shiftSessionId,
  embedded = false,
  onSaved,
}: {
  item: WasteCatalogItem | null;
  branchId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reasons: WasteReason[];
  shiftSessionId?: number;
  embedded?: boolean;
  onSaved?: (record: WasteRecord) => void;
}) {
  const { ui, isRtl } = useLocale();
  const queryClient = useQueryClient();
  const [quantityText, setQuantityText] = useState('1');
  const [debouncedQuantity, setDebouncedQuantity] = useState(1);
  const [unit, setUnit] = useState('piece');
  const [packageId, setPackageId] = useState('');
  const [variantId, setVariantId] = useState('');
  const [reasonValue, setReasonValue] = useState('');
  const [newReason, setNewReason] = useState('');
  const [notes, setNotes] = useState('');
  const [allowNegative, setAllowNegative] = useState(false);
  const [requestId, setRequestId] = useState(newRequestId);

  useEffect(() => {
    if ((!open && !embedded) || !item) return;
    setQuantityText('1');
    setDebouncedQuantity(1);
    setUnit(item.sourceKind === 'cafe_product' ? 'piece' : item.unit);
    setPackageId(item.packages[0] ? String(item.packages[0].id) : '');
    setVariantId(item.variants[0] ? String(item.variants[0].id) : '');
    setReasonValue(reasons[0] ? String(reasons[0].id) : NEW_REASON);
    setNewReason('');
    setNotes('');
    setAllowNegative(false);
    setRequestId(newRequestId());
  }, [embedded, item, open, reasons]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuantity(Number(quantityText)), 250);
    return () => window.clearTimeout(timer);
  }, [quantityText]);

  const previewPayload = useMemo(() => item ? {
    sourceKind: item.sourceKind,
    sourceId: item.sourceId,
    branchId,
    quantity: debouncedQuantity,
    unit,
    ...(variantId ? { variantId: Number(variantId) } : {}),
    ...(unit === 'package' && packageId ? { packageId: Number(packageId) } : {}),
  } : null, [branchId, debouncedQuantity, item, packageId, unit, variantId]);

  const previewQuery = useQuery({
    queryKey: ['cafe-waste', 'preview', previewPayload],
    queryFn: async () => (await api.post<WastePreview>('/cafe-waste/preview', previewPayload)).data,
    enabled: (open || embedded) && !!previewPayload && branchId > 0 && Number.isFinite(debouncedQuantity) && debouncedQuantity > 0
      && (!item?.variants.length || !!variantId) && (unit !== 'package' || !!packageId),
    retry: false,
    staleTime: 0,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!item) throw new Error(ui('اختر صنف الهالك'));
      const quantity = Number(quantityText);
      const payload = {
        ...previewPayload,
        requestId,
        quantity,
        ...(reasonValue === NEW_REASON ? { newReason: newReason.trim() } : { reasonId: Number(reasonValue) }),
        notes: notes.trim() || undefined,
        allowNegative,
        ...(shiftSessionId ? { shiftSessionId } : {}),
      };
      return (await api.post<WasteRecord>('/cafe-waste/records', payload)).data;
    },
    onSuccess: async (record) => {
      toast.success(ui('تم تسجيل الهالك وخصم المخزون'));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['cafe-waste'] }),
        queryClient.invalidateQueries({ queryKey: ['cafe-reports'] }),
        queryClient.invalidateQueries({ queryKey: ['products'] }),
        queryClient.invalidateQueries({ queryKey: ['stock'] }),
      ]);
      onSaved?.(record);
      if (!embedded) onOpenChange(false);
    },
    onError: (error) => toast.error(apiError(error)),
  });

  if (!item) return null;
  const quantity = Number(quantityText);
  const preview = previewQuery.data;
  const maxAvailable = preview?.components.length
    ? Math.max(0, Math.min(...preview.components.map((component) => component.quantity > 0
      ? component.currentStock * quantity / component.quantity
      : Number.POSITIVE_INFINITY)))
    : 0;
  const canSave = Number.isFinite(quantity) && quantity > 0
    && !!preview
    && !previewQuery.isError
    && !saveMutation.isPending
    && (reasonValue !== NEW_REASON ? !!reasonValue : newReason.trim().length >= 2)
    && (!preview.hasShortage || allowNegative);

  const useAvailable = () => {
    const next = item.unit === 'piece' || item.sourceKind === 'cafe_product'
      ? Math.floor(maxAvailable)
      : Math.floor(maxAvailable * 1000) / 1000;
    if (next <= 0) return toast.error(ui('لا يوجد رصيد متاح لهذا الهالك'));
    setQuantityText(String(next));
    setAllowNegative(false);
  };

  const form = (
        <div className={embedded ? 'space-y-5 pb-2' : 'mt-6 space-y-5 pb-8'}>
          <Card className="border-rose-200 bg-rose-50/40 dark:border-rose-900 dark:bg-rose-950/10">
            <CardContent className="flex items-center justify-between gap-4 p-4">
              <div><p className="font-bold">{item.name}</p><p className="mt-1 text-xs text-muted-foreground">{ui('الرصيد الحالي')}</p></div>
              <Badge variant={item.stock != null && item.stock <= 0 ? 'destructive' : 'secondary'} className="nums text-sm">
                {item.stock == null ? ui('حسب المكونات') : `${toArabicDigits(item.stock)} ${item.unit}`}
              </Badge>
            </CardContent>
          </Card>

          {item.variants.length > 0 && (
            <div className="space-y-2">
              <Label>{ui('الحجم أو النوع')}</Label>
              <Select value={variantId} onValueChange={(value) => { setVariantId(value); setAllowNegative(false); }}>
                <SelectTrigger><SelectValue placeholder={ui('اختر الحجم')} /></SelectTrigger>
                <SelectContent>{item.variants.map((variant) => <SelectItem key={variant.id} value={String(variant.id)}>{variant.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2"><Label htmlFor="waste-quantity">{ui('كمية الهالك')}</Label><Input id="waste-quantity" className="nums" type="number" min="0.001" step="0.001" value={quantityText} onChange={(event) => { setQuantityText(event.target.value); setAllowNegative(false); }} /></div>
            <div className="space-y-2"><Label>{ui('وحدة القياس')}</Label><Select value={unit} onValueChange={(value) => { setUnit(value); setAllowNegative(false); }} disabled={item.sourceKind === 'cafe_product'}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{unitsFor(item).map((value) => <SelectItem key={value} value={value}>{value === 'package' ? ui('عبوة') : value}</SelectItem>)}</SelectContent></Select></div>
          </div>

          {unit === 'package' && (
            <div className="space-y-2"><Label>{ui('حجم العبوة')}</Label><Select value={packageId} onValueChange={(value) => { setPackageId(value); setAllowNegative(false); }}><SelectTrigger><SelectValue placeholder={ui('اختر العبوة')} /></SelectTrigger><SelectContent>{item.packages.map((pack) => <SelectItem key={pack.id} value={String(pack.id)}>{pack.label}</SelectItem>)}</SelectContent></Select></div>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2"><Label>{ui('سبب الهالك')}</Label>{reasonValue === NEW_REASON && <span className="flex items-center gap-1 text-xs text-primary"><Plus className="size-3" />{ui('سيُضاف للأسباب العامة')}</span>}</div>
            <Select value={reasonValue} onValueChange={setReasonValue}><SelectTrigger><SelectValue placeholder={ui('اختر السبب')} /></SelectTrigger><SelectContent>{reasons.map((reason) => <SelectItem key={reason.id} value={String(reason.id)}>{reason.name}</SelectItem>)}<SelectItem value={NEW_REASON}>{ui('إضافة سبب جديد')}</SelectItem></SelectContent></Select>
            {reasonValue === NEW_REASON && <Input value={newReason} onChange={(event) => setNewReason(event.target.value)} placeholder={ui('اكتب سبب الهالك الجديد')} maxLength={120} />}
          </div>

          <div className="space-y-2"><Label htmlFor="waste-notes">{ui('ملاحظات')}</Label><Textarea id="waste-notes" rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder={ui('تفاصيل تساعد في فهم سبب الهالك (اختياري)')} /></div>

          {previewQuery.isFetching && <div className="rounded-xl border border-dashed p-5 text-center text-sm text-muted-foreground">{ui('جاري حساب الخصم والتكلفة…')}</div>}
          {previewQuery.isError && <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{apiError(previewQuery.error)}</div>}
          {preview && (
            <div className="space-y-3 rounded-2xl border bg-muted/20 p-4">
              <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2 font-bold"><Scale className="size-4 text-primary" />{ui('المكونات التي ستُخصم')}</div><Badge variant="outline">{money(preview.totalCost)}</Badge></div>
              {preview.components.map((component) => (
                <div key={component.productId} className="rounded-xl border bg-background p-3">
                  <div className="flex items-center justify-between gap-3"><span className="font-medium">{component.name}</span><span className="nums font-bold">{toArabicDigits(component.quantity)} {component.unit}</span></div>
                  <div className="mt-2 flex flex-wrap justify-between gap-2 text-xs text-muted-foreground"><span>{ui('قبل')}: {toArabicDigits(component.currentStock)}</span><span className={component.shortage ? 'font-bold text-destructive' : 'text-emerald-600'}>{ui('بعد')}: {toArabicDigits(component.afterStock)}</span><span>{money(component.cost)}</span></div>
                </div>
              ))}
            </div>
          )}

          {preview?.hasShortage && !allowNegative && (
            <div className="space-y-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/20">
              <div className="flex gap-2"><AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600" /><div><p className="font-bold text-amber-900 dark:text-amber-200">{ui('الكمية أكبر من الرصيد المتاح')}</p><p className="mt-1 text-sm text-amber-800 dark:text-amber-300">{ui('اختاري تعديل الكمية للمتاح أو الاستمرار وتسجيل العجز.')}</p></div></div>
              <div className="grid gap-2 sm:grid-cols-2"><Button permissionAction={null} type="button" variant="outline" onClick={useAvailable}><PackageOpen className="size-4" />{ui('استخدام المتاح')} ({toArabicDigits(Math.max(0, maxAvailable).toFixed(3))})</Button><Button permissionAction={null} type="button" variant="destructive" onClick={() => setAllowNegative(true)}><AlertTriangle className="size-4" />{ui('الاستمرار برصيد سالب')}</Button></div>
            </div>
          )}

          {preview?.hasShortage && allowNegative && <div className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"><CheckCircle2 className="size-4" />{ui('تم اختيار تسجيل الكمية كاملة مع إظهار العجز')}</div>}

          <Button permissionAction="create" className="h-12 w-full text-base font-bold" disabled={!canSave} onClick={() => saveMutation.mutate()}>
            <Trash2 className="size-5" />{saveMutation.isPending ? ui('جاري التسجيل…') : ui('تسجيل الهالك وخصم المخزون')}
          </Button>
        </div>
  );

  if (embedded) return form;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side={isRtl ? 'start' : 'end'} className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader className="pe-8">
          <SheetTitle className="flex items-center gap-2 text-xl"><Trash2 className="size-5 text-rose-500" />{ui('تسجيل هالك')}</SheetTitle>
          <SheetDescription>{item.name} · {item.code}</SheetDescription>
        </SheetHeader>
        {form}
      </SheetContent>
    </Sheet>
  );
}
