import { formatDisplayNumber } from '@/lib/number-display';
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Settings2 } from 'lucide-react';
import { toast } from 'sonner';
import { CommissionTiersEditor } from '@/components/club/commission-tiers-editor';
import { TargetPeriodFields } from '@/components/club/target-period-fields';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { usePermission } from '@/hooks/use-permission';
import { api, apiError } from '@/lib/api';
import { defaultCommissionTiers, type SalesDefaultSetting } from '@/lib/sales-commission';
import { useLocale } from '@/store/locale';

export function SalesDefaultsCard() {
  const { ui } = useLocale();
  const { can } = usePermission();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<SalesDefaultSetting | null>(null);
  const [saving, setSaving] = useState(false);
  const query = useQuery({
    queryKey: ['club-sales-defaults'],
    queryFn: async () => (await api.get<SalesDefaultSetting>('/club-sales-settings/sales-defaults')).data,
  });
  useEffect(() => {
    if (open && query.data) setDraft({ ...query.data, tiers: query.data.tiers.length ? query.data.tiers : defaultCommissionTiers() });
  }, [open, query.data]);

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      await api.put('/club-sales-settings/sales-defaults', draft);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['club-sales-defaults'] }),
        qc.invalidateQueries({ queryKey: ['club-sales-settings-reps'] }),
        qc.invalidateQueries({ queryKey: ['club-sales-dashboard'] }),
        qc.invalidateQueries({ queryKey: ['club-sales-reports-reps'] }),
      ]);
      toast.success(ui('تم حفظ الإعدادات الافتراضية'));
      setOpen(false);
    } catch (error) { toast.error(apiError(error)); } finally { setSaving(false); }
  };

  return (
    <section className="rounded-xl border bg-primary/5 p-4 sm:p-5" aria-labelledby="sales-defaults-title">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground"><Settings2 className="size-5" /></span>
          <div><h2 id="sales-defaults-title" className="font-bold">{ui('الإعدادات الافتراضية للفريق')}</h2><p className="mt-1 text-sm text-muted-foreground">{ui('يستخدمها أي أخصائي مفعّل له خيار تطبيق إعدادات الفريق.')}</p></div>
        </div>
        {query.isLoading ? <Skeleton className="h-10 w-32" /> : query.isError ? <Button variant="outline" onClick={() => void query.refetch()}>{ui('إعادة المحاولة')}</Button> : <Button variant="outline" disabled={!can('club.sales.settings:configure')} onClick={() => setOpen(true)}>{ui('تعديل الافتراضي')}</Button>}
      </div>
      {query.data ? <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3"><div><dt className="text-xs text-muted-foreground">{ui('التارجت')}</dt><dd className="nums mt-1 font-bold">{formatDisplayNumber(query.data.monthlyTarget)}</dd></div><div><dt className="text-xs text-muted-foreground">{ui('نظام العمولة')}</dt><dd className="mt-1 font-bold">{ui(query.data.commissionMode === 'tiered' ? ui('شرائح') : ui('نسبة ثابتة'))}</dd></div><div><dt className="text-xs text-muted-foreground">{ui('فترة الهدف')}</dt><dd className="mt-1 font-bold">{ui(query.data.targetPeriodMode === 'monthly' ? ui('شهري') : query.data.targetPeriodMode === 'days' ? ui('عدد أيام') : ui('مدة مخصصة'))}</dd></div></dl> : null}

      <Dialog open={open} onOpenChange={setOpen}><DialogContent size="lg" dir="rtl" aria-describedby="sales-defaults-desc"><DialogHeader><DialogTitle>{ui('الإعدادات الافتراضية للفريق')}</DialogTitle><DialogDescription id="sales-defaults-desc">{ui('تُطبّق فقط على الأخصائيين المشتركين في إعدادات الفريق.')}</DialogDescription></DialogHeader>
        {draft ? <div className="space-y-4"><div className="grid gap-3 sm:grid-cols-2"><div className="space-y-1.5"><Label htmlFor="default-sales-target">{ui('قيمة التارجت')}</Label><Input id="default-sales-target" type="number" min={0} value={draft.monthlyTarget} onChange={(event) => setDraft({ ...draft, monthlyTarget: Number(event.target.value) })} /></div><div className="space-y-1.5"><Label>{ui('نظام العمولة')}</Label><Select value={draft.commissionMode} onValueChange={(value) => setDraft({ ...draft, commissionMode: value as 'flat' | 'tiered' })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="flat">{ui('نسبة ثابتة')}</SelectItem><SelectItem value="tiered">{ui('شرائح')}</SelectItem></SelectContent></Select></div></div>
          <TargetPeriodFields value={draft} disabled={false} onChange={(period) => setDraft({ ...draft, ...period })} />
          {draft.commissionMode === 'flat' ? <div className="max-w-xs space-y-1.5"><Label htmlFor="default-sales-percent">{ui('نسبة العمولة %')}</Label><Input id="default-sales-percent" type="number" min={0} max={100} value={draft.flatCommissionPercent} onChange={(event) => setDraft({ ...draft, flatCommissionPercent: Number(event.target.value) })} /></div> : <CommissionTiersEditor tiers={draft.tiers} onChange={(tiers) => setDraft({ ...draft, tiers })} />}
        </div> : <Skeleton className="h-64" />}
        <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>{ui('إلغاء')}</Button><Button variant="brand" disabled={!draft || saving} onClick={() => void save()}>{ui(saving ? ui('جارٍ الحفظ…') : ui('حفظ الافتراضي'))}</Button></DialogFooter>
      </DialogContent></Dialog>
    </section>
  );
}
