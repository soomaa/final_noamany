import { useEffect, useId, useState } from 'react';
import { useArrayResource } from '@/lib/api-hooks';
import { Combobox } from '@/components/common/combobox';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { X } from 'lucide-react';

/** Shares the same searchable plan picker across class definitions and one-off sessions. */
export function ClassLinkedSubscriptions({ value, onChange }: { value: number[]; onChange: (ids: number[]) => void }) {
  const id = useId();
  const [enabled, setEnabled] = useState(value.length > 0);
  useEffect(() => { if (value.length) setEnabled(true); }, [value.length]);
  const { data } = useArrayResource<{ id: number; name: string }>('club-subscription-types');
  return <section className="space-y-3 sm:col-span-2">
    <div className="flex items-center justify-between gap-4"><Label htmlFor={id}>ربط باشتراكات معينة</Label><Switch id={id} checked={enabled} onCheckedChange={(checked) => { setEnabled(checked); if (!checked) onChange([]); }} /></div>
    <p className="text-sm text-muted-foreground">اختر الباقات التي يُخصم منها الحضور. قيمة الحصة تُحسب من باقة العضو، وليس سعر الحضور الخارجي.</p>
    {enabled && <Combobox aria-label="إضافة باقة مرتبطة بالحصة" value="" options={(data ?? []).filter((item) => !value.includes(item.id)).map((item) => ({ value: String(item.id), label: item.name }))} placeholder="ابحث واختر باقة لربطها" onValueChange={(selected) => onChange([...value, Number(selected)])} />}
    {!!value.length && <ul className="flex flex-wrap gap-2">{value.map((planId) => <li key={planId} className="flex items-center gap-1 rounded-lg border ps-3 text-sm"><span>{data?.find((item) => item.id === planId)?.name ?? `#${planId}`}</span><Button permissionAction={null} variant="ghost" size="icon" className="size-11" aria-label={`إلغاء ربط ${data?.find((item) => item.id === planId)?.name ?? planId}`} onClick={() => onChange(value.filter((item) => item !== planId))}><X className="size-4" /></Button></li>)}</ul>}
  </section>;
}
