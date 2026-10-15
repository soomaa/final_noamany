import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Power, UsersRound } from 'lucide-react';
import { toast } from 'sonner';
import { CommissionTiersEditor } from '@/components/club/commission-tiers-editor';
import { CommissionCalculationPreview } from '@/components/club/commission-calculation-preview';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { useBranches } from '@/hooks/use-branches';
import { usePermission } from '@/hooks/use-permission';
import { api, apiError } from '@/lib/api';
import { formatMoney } from '@/lib/formatters';
import { defaultCommissionTiers, type SalesRepPerformance, type SalesRepSetting } from '@/lib/sales-commission';
import { toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';
import { TargetPeriodFields } from '@/components/club/target-period-fields';
import { applySalesDefaultsIntent, validateSalesRepDeactivation } from '@/pages/club/sales-team-view-model';
import { uiStatic } from '@/lib/ui-static';

export function SalesRepSettingsDialog({
  open,
  onOpenChange,
  salesRepId,
  performance,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  salesRepId: number | null;
  performance?: SalesRepPerformance;
}) {
  const { ui } = useLocale();
  const { can } = usePermission();
  const qc = useQueryClient();
  const { data: branches } = useBranches();
  const canView = can('club.sales.settings:view');
  const canSave = can('club.sales.settings:configure');
  const [draft, setDraft] = useState<SalesRepSetting | null>(null);
  const [saving, setSaving] = useState(false);
  const [deactivationOpen, setDeactivationOpen] = useState(false);
  const [transferToId, setTransferToId] = useState<number | null>(null);

  const settings = useQuery({
    queryKey: ['club-sales-settings-reps'],
    queryFn: async () => (await api.get<SalesRepSetting[]>('/club-sales-settings/sales-reps')).data,
    enabled: open && canView,
  });
  const preview = useQuery({
    queryKey: ['club-sales-rep-deactivation', salesRepId],
    queryFn: async () => (await api.get<{ leads: number; activeSubscriptions: number; total: number }>(`/club-sales-settings/sales-reps/${salesRepId}/deactivation-preview`)).data,
    enabled: open && salesRepId != null && deactivationOpen,
  });

  useEffect(() => {
    if (!open || salesRepId == null) {
      setDraft(null);
      setDeactivationOpen(false);
      setTransferToId(null);
      return;
    }
    const row = settings.data?.find((item) => item.id === salesRepId);
    if (!row) return;
    setDraft({
      ...row,
      commissionMode: row.commissionMode === 'tiered' ? 'tiered' : 'flat',
      tiers: row.tiers.length ? row.tiers : defaultCommissionTiers(),
    });
  }, [open, salesRepId, settings.data]);

  const save = async () => {
    if (!draft || !canSave) return;
    setSaving(true);
    try {
      await api.put('/club-sales-settings/sales-reps', {
        employeeId: draft.id,
        monthlyTarget: draft.monthlyTarget,
        targetPeriodMode: draft.targetPeriodMode,
        targetStartDate: draft.targetStartDate,
        targetEndDate: draft.targetEndDate,
        targetDays: draft.targetDays,
        commissionMode: draft.commissionMode,
        flatCommissionPercent: draft.flatCommissionPercent,
        tiers: draft.commissionMode === 'tiered' ? draft.tiers : draft.tiers,
        useDefaults: draft.useDefaults,
        isActive: draft.isActive,
        branchIds: draft.branchIds,
      });
      toast.success(ui('تم حفظ إعدادات الأخصائي'));
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['club-sales-settings-reps'] }),
        qc.invalidateQueries({ queryKey: ['club-sales-dashboard'] }),
        qc.invalidateQueries({ queryKey: ['club-sales-reports-reps'] }),
      ]);
      onOpenChange(false);
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setSaving(false);
    }
  };

  const setActive = async (isActive: boolean) => {
    if (!draft || !canSave) return;
    if (!isActive) {
      const error = validateSalesRepDeactivation({
        repId: draft.id,
        ownedWork: preview.data?.total ?? 0,
        transferToId,
        activeTargetIds: (settings.data ?? []).filter((row) => row.isActive && row.id !== draft.id).map((row) => row.id),
      });
      if (error) return void toast.error(ui(error === 'transfer_required' ? uiStatic('اختر أخصائيًا لنقل العمل الحالي إليه') : uiStatic('أخصائي النقل غير صالح')));
    }
    setSaving(true);
    try {
      await api.put(`/club-sales-settings/sales-reps/${draft.id}/active`, { isActive, transferToId: isActive ? undefined : transferToId });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['club-sales-settings-reps'] }),
        qc.invalidateQueries({ queryKey: ['club-sales-dashboard'] }),
        qc.invalidateQueries({ queryKey: ['club-sales-reports-reps'] }),
        qc.invalidateQueries({ queryKey: ['club-leads'] }),
      ]);
      toast.success(ui(isActive ? uiStatic('تم تفعيل الأخصائي') : uiStatic('تم تعطيل الأخصائي ونقل العمل الحالي')));
      onOpenChange(false);
    } catch (error) { toast.error(apiError(error)); } finally { setSaving(false); }
  };

  const name = performance?.name ?? draft?.name ?? ui('أخصائي المبيعات');
  const activePercent = draft
    ? draft.commissionMode === 'flat'
      ? draft.flatCommissionPercent
      : draft.tiers.find((tier) => (performance?.achievementPct ?? 0) >= tier.minAchievementPct
        && (tier.maxAchievementPct == null || (performance?.achievementPct ?? 0) <= tier.maxAchievementPct))?.commissionPercent ?? 0
    : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" dir="rtl" aria-describedby="sales-rep-settings-desc">
        <DialogHeader>
          <DialogTitle>{name}</DialogTitle>
          <DialogDescription id="sales-rep-settings-desc">
            {ui('مدة التارجت ونظام العمولة لهذا الأخصائي')}
          </DialogDescription>
        </DialogHeader>

        {performance ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {performance.receivedLeads != null ? <StatChip label={ui('مستلم')} value={toArabicDigits(performance.receivedLeads)} /> : null}
            {performance.contacted != null ? <StatChip label={ui('تم التواصل')} value={toArabicDigits(performance.contacted)} /> : null}
            {performance.converted != null ? <StatChip label={ui('محوّل')} value={toArabicDigits(performance.converted)} /> : null}
            <StatChip label={ui('التحقيق')} value={`${toArabicDigits(performance.achievementPct)}%`} />
          </div>
        ) : null}

        {!canView ? (
          <p className="rounded-[10px] border border-border/70 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
            {ui('لا توجد صلاحية لعرض أو تعديل أهداف وعمولات هذا الأخصائي.')}
          </p>
        ) : settings.isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-11 w-full" />
            <Skeleton className="h-11 w-full" />
            <Skeleton className="h-28 w-full" />
          </div>
        ) : settings.isError ? (
          <p className="text-sm text-destructive">{ui('تعذّر تحميل إعدادات الأخصائي')}</p>
        ) : draft ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/20 p-4">
              <div><Label htmlFor="sales-use-defaults" className="font-bold">{ui('استخدام إعدادات الفريق الافتراضية')}</Label><p className="mt-1 text-xs text-muted-foreground">{ui('يمكن إيقافه لتخصيص الهدف والعمولة لهذا الأخصائي.')}</p></div>
              <Switch id="sales-use-defaults" checked={draft.useDefaults} disabled={!canSave} onCheckedChange={(checked) => setDraft(applySalesDefaultsIntent(draft, checked))} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="sales-monthly-target">{ui('قيمة التارجت')}</Label>
                <Input
                  id="sales-monthly-target"
                  className="nums"
                  type="number"
                  min={0}
                  disabled={!canSave || draft.useDefaults}
                  value={draft.monthlyTarget}
                  onChange={(e) => setDraft({ ...draft, monthlyTarget: Number(e.target.value) })}
                />
                {performance ? (
                  <p className="text-xs text-muted-foreground">
                    {ui('الفعلي')}: {formatMoney(performance.actual)}
                  </p>
                ) : null}
              </div>
              <div className="space-y-1.5">
                <Label>{ui('نظام العمولة')}</Label>
                <Select
                  value={draft.commissionMode}
                  disabled={!canSave || draft.useDefaults}
                  onValueChange={(value) => setDraft({
                    ...draft,
                    commissionMode: value as 'flat' | 'tiered',
                    tiers: draft.tiers.length ? draft.tiers : defaultCommissionTiers(),
                  })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="flat">{ui('نسبة ثابتة على الاشتراكات')}</SelectItem>
                    <SelectItem value="tiered">{ui('شرائح حسب نسبة التحقيق')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <TargetPeriodFields value={draft} cycle={draft.currentCycle} disabled={!canSave || draft.useDefaults} onChange={(period) => setDraft({ ...draft, ...period })} />
            {draft.commissionMode === 'flat' ? (
              <div className="max-w-xs space-y-1.5">
                <Label htmlFor="sales-flat-commission">{ui('نسبة العمولة %')}</Label>
                <Input
                  id="sales-flat-commission"
                  className="nums"
                  type="number"
                  min={0}
                  max={100}
                  disabled={!canSave || draft.useDefaults}
                  value={draft.flatCommissionPercent}
                  onChange={(e) => setDraft({ ...draft, flatCommissionPercent: Number(e.target.value) })}
                />
              </div>
            ) : (
              <div className="space-y-2">
                <Label>{ui('شرائح العمولة')}</Label>
                <CommissionTiersEditor
                  tiers={draft.tiers}
                  disabled={!canSave || draft.useDefaults}
                  onChange={(tiers) => setDraft({ ...draft, tiers })}
                />
              </div>
            )}
            <CommissionCalculationPreview
              baseAmount={performance?.actual ?? 0}
              percent={activePercent}
              label={ui('العمولة على المبيعات الحالية')}
            />
            <fieldset className="space-y-2 rounded-xl border p-4">
              <legend className="px-1 text-sm font-bold">{ui('الفروع المسموح بها')}</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {(branches ?? []).map((branch) => <label key={branch.id} className="flex min-h-10 items-center gap-2 rounded-lg bg-muted/25 px-3 text-sm"><Checkbox checked={draft.branchIds.includes(branch.id)} disabled={!canSave} onCheckedChange={(checked) => setDraft({ ...draft, branchIds: checked ? [...new Set([...draft.branchIds, branch.id])] : draft.branchIds.filter((id) => id !== branch.id) })} />{branch.name}</label>)}
              </div>
            </fieldset>

            <section className="rounded-xl border p-4" aria-label={ui('حالة أخصائي المبيعات')}>
              <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-sm font-bold">{ui('حالة الأخصائي')}</h3><p className="mt-1 text-xs text-muted-foreground">{ui(draft.isActive ? uiStatic('نشط ويظهر في الإسناد التلقائي واليدوي.') : uiStatic('موقوف ولا يستقبل عملاء جدد.'))}</p></div><span className={draft.isActive ? 'text-success' : 'text-muted-foreground'}>{ui(draft.isActive ? uiStatic('نشط') : uiStatic('موقوف'))}</span></div>
              {draft.isActive ? <div className="mt-3"><Button type="button" variant="outline" disabled={!canSave} onClick={() => setDeactivationOpen((value) => !value)}><Power className="size-4" />{ui('تعطيل ونقل العمل')}</Button></div> : <div className="mt-3"><Button type="button" variant="outline" disabled={!canSave || saving} onClick={() => void setActive(true)}><Power className="size-4" />{ui('إعادة التفعيل')}</Button></div>}
              {deactivationOpen ? <div className="mt-4 space-y-3 rounded-lg bg-destructive/5 p-3"><div className="flex items-start gap-2 text-sm"><UsersRound className="mt-0.5 size-4 shrink-0" /><p>{preview.isLoading ? ui('جارٍ حساب العمل الحالي…') : preview.data ? `${ui('سيتم نقل')} ${toArabicDigits(preview.data.leads)} ${ui('عميل و')} ${toArabicDigits(preview.data.activeSubscriptions)} ${ui('اشتراك نشط.')}` : ui('تعذر حساب العمل الحالي')}</p></div>{(preview.data?.total ?? 0) > 0 ? <Select value={transferToId ? String(transferToId) : ''} onValueChange={(value) => setTransferToId(Number(value))}><SelectTrigger aria-label={ui('أخصائي النقل')}><SelectValue placeholder={ui('اختر الأخصائي البديل')} /></SelectTrigger><SelectContent>{(settings.data ?? []).filter((row) => row.isActive && row.id !== draft.id).map((row) => <SelectItem key={row.id} value={String(row.id)}>{row.name}</SelectItem>)}</SelectContent></Select> : null}<Button type="button" variant="destructive" disabled={preview.isLoading || saving} onClick={() => void setActive(false)}>{ui('تأكيد التعطيل')}</Button></div> : null}
            </section>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{ui('لا توجد إعدادات لهذا الأخصائي بعد.')}</p>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {ui('إغلاق')}
          </Button>
          {canSave ? (
            <Button type="button" variant="brand" permissionAction={null} disabled={saving || !draft} onClick={() => void save()}>
              {ui('حفظ')}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[10px] border border-border/70 bg-muted/20 px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="nums mt-0.5 text-base font-bold tabular-nums">{value}</p>
    </div>
  );
}
