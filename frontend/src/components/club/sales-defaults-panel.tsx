import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Settings2 } from 'lucide-react';
import { PermissionButton as Button } from '@/components/club/permission-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TargetPeriodFields } from './target-period-fields';
import { CommissionTiersEditor } from './commission-tiers-editor';
import { api, apiError } from '@/lib/api';
import { usePermission } from '@/hooks/use-permission';
import { useLocale } from '@/store/locale';
import type { SalesRepSetting } from '@/lib/sales-commission';
import { localizeCurrency } from '@/lib/gym-locale';

export type SalesDefaults = Omit<SalesRepSetting, 'id' | 'name' | 'isActive' | 'branchId' | 'branchIds'>;
export function SalesDefaultsPanel() {
  const { ui } = useLocale();
  const { can } = usePermission();
  const qc = useQueryClient();
  const canView = can('club.sales.settings:view');
  const canSave = can('club.sales.settings:configure');
  const query = useQuery({ queryKey: ['sales-defaults'], queryFn: async () => (await api.get<SalesDefaults>('/club-sales-settings/sales-defaults')).data, enabled: canView });
  const [draft, setDraft] = useState<SalesDefaults | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (query.data) setDraft(query.data); }, [query.data]);
  if (!canView) return null;
  const save = async () => {
    if (!draft || !canSave) return;
    setSaving(true);
    try {
      await api.put('/club-sales-settings/sales-defaults', draft);
      await qc.invalidateQueries({ predicate: q => ['sales-defaults', 'club-sales-settings-reps', 'club-sales-dashboard', 'club-sales-reports-reps'].includes(String(q.queryKey[0])) });
      toast.success(ui('تم حفظ الإعداد العام للسيلز'));
    } catch (error) { toast.error(apiError(error)); } finally { setSaving(false); }
  };
  return <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
    <div className="flex items-start gap-3 border-b bg-primary/5 p-4 sm:p-5">
      <Settings2 className="mt-1 size-5 shrink-0 text-primary" />
      <div><h2 className="text-lg font-bold">{ui('الإعداد العام للسيلز')}</h2><p className="mt-1 text-sm leading-6 text-muted-foreground">{ui('التارجت والعمولة الافتراضيان لأي سيلز جديد، ولمن يتبع الإعداد العام. التخصيص الفردي يظل محفوظًا.')}</p></div>
    </div>
    {query.isError ? <div className="p-5"><p role="alert">{ui('تعذر تحميل الإعداد العام')}</p><Button variant="outline" onClick={() => void query.refetch()}>{ui('إعادة المحاولة')}</Button></div> : !draft ? <p className="p-5" role="status">{ui('جارٍ التحميل…')}</p> : <div className="space-y-4 p-4 sm:p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2"><Label htmlFor="default-sales-target">{localizeCurrency(ui('التارجت الافتراضي (ج.م)'))}</Label><Input id="default-sales-target" type="number" min={0} className="nums" disabled={!canSave || saving} value={draft.monthlyTarget} onChange={e => setDraft({ ...draft, monthlyTarget: Number(e.target.value) })} /></div>
        <div className="space-y-2"><Label htmlFor="default-sales-mode">{ui('نظام العمولة الافتراضي')}</Label><Select value={draft.commissionMode} disabled={!canSave || saving} onValueChange={v => setDraft({ ...draft, commissionMode: v as 'flat' | 'tiered' })}><SelectTrigger id="default-sales-mode"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="flat">{ui('نسبة ثابتة')}</SelectItem><SelectItem value="tiered">{ui('شرائح حسب التحقيق')}</SelectItem></SelectContent></Select></div>
      </div>
      <TargetPeriodFields value={draft} disabled={!canSave || saving} onChange={value => setDraft({ ...draft, ...value })} />
      {draft.commissionMode === 'flat' ? <div className="max-w-sm space-y-2"><Label htmlFor="default-sales-percent">{ui('نسبة العمولة %')}</Label><Input id="default-sales-percent" type="number" min={0} max={100} className="nums" disabled={!canSave || saving} value={draft.flatCommissionPercent} onChange={e => setDraft({ ...draft, flatCommissionPercent: Number(e.target.value) })} /></div> : <CommissionTiersEditor tiers={draft.tiers} disabled={!canSave || saving} onChange={tiers => setDraft({ ...draft, tiers })} />}
      {canSave ? <Button variant="brand" permissionAction={null} disabled={saving} onClick={() => void save()}>{ui(saving ? ui('جارٍ الحفظ…') : ui('حفظ الإعداد العام'))}</Button> : null}
    </div>}
  </section>;
}
