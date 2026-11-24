import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CommissionTiersEditor } from '@/components/club/commission-tiers-editor';
import { CommissionCalculationPreview } from '@/components/club/commission-calculation-preview';
import { PermissionButton as Button } from '@/components/club/permission-button';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { SalesRepActivation } from './sales-rep-activation';
import type { SalesDefaults } from './sales-defaults-panel';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { usePermission } from '@/hooks/use-permission';
import { useBranches } from '@/hooks/use-branches';
import { api, apiError } from '@/lib/api';
import { formatMoney } from '@/lib/formatters';
import { defaultCommissionTiers, selectCommissionTier, type SalesRepPerformance, type SalesRepSetting } from '@/lib/sales-commission';
import { cn, toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';
import { TargetPeriodFields } from '@/components/club/target-period-fields';

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
  const canView = can('club.sales.settings:view');
  const canSave = can('club.sales.settings:configure');
  const { data: branches = [], isLoading: branchesLoading } = useBranches();
  const [draft, setDraft] = useState<SalesRepSetting | null>(null);
  const [saving, setSaving] = useState(false);


  const settings = useQuery({
    queryKey: ['club-sales-settings-reps'],
    queryFn: async () => (await api.get<SalesRepSetting[]>('/club-sales-settings/sales-reps')).data,
    enabled: open && canView,
  });

  useEffect(() => {
    if (!open || salesRepId == null) {
      setDraft(null);
      return;
    }
    const row = settings.data?.find((item) => item.id === salesRepId);
    if (!row) return;
    setDraft({
      ...row,
      branchIds: [...new Set([...(row.branchId ? [row.branchId] : []), ...(row.branchIds ?? [])])],
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
        useDefaultSettings: draft.useDefaultSettings ?? false,
        branchIds: draft.branchIds,
        monthlyTarget: draft.monthlyTarget,
        targetPeriodMode: draft.targetPeriodMode,
        targetStartDate: draft.targetStartDate,
        targetEndDate: draft.targetEndDate,
        targetDays: draft.targetDays,
        commissionMode: draft.commissionMode,
        flatCommissionPercent: draft.flatCommissionPercent,
        // Tiers travel with every save, flat mode included, so switching back to the
        // tiered mode restores the manager's own tiers instead of the built-in defaults.
        tiers: draft.tiers,
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

  const name = performance?.name ?? draft?.name ?? ui('أخصائي المبيعات');
  const toggleBranch = (branchId: number, checked: boolean) => {
    if (!draft || branchId === draft.branchId) return;
    const branchIds = checked
      ? [...new Set([...draft.branchIds, branchId])]
      : draft.branchIds.filter((id) => id !== branchId);
    setDraft({ ...draft, branchIds });
  };
  // Preview with the same rule the server pays by, so the two can never disagree.
  const activePercent = draft
    ? draft.commissionMode === 'flat'
      ? draft.flatCommissionPercent
      : selectCommissionTier(draft.tiers, performance?.achievementPct ?? 0)?.commissionPercent ?? 0
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
            <div className="space-y-2">
              <div>
                <Label>{ui('فروع العمل')}</Label>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {ui('الفرع الأساسي ثابت من ملف الموظف، ويمكنك إضافة فروع عمل أخرى.')}
                </p>
              </div>
              <div
                role="group"
                aria-label={ui('فروع عمل أخصائي المبيعات')}
                className="grid max-h-52 gap-2 overflow-y-auto rounded-[12px] border border-border/70 bg-muted/20 p-3 sm:grid-cols-2"
              >
                {branchesLoading ? (
                  <>
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                  </>
                ) : branches.length ? branches.map((branch) => {
                  const primary = branch.id === draft.branchId;
                  const checked = primary || draft.branchIds.includes(branch.id);
                  return (
                    <label
                      key={branch.id}
                      htmlFor={`sales-rep-branch-${branch.id}`}
                      className={cn(
                        'flex min-w-0 items-center gap-3 rounded-[10px] border px-3 py-2.5 transition-colors',
                        checked
                          ? 'border-primary/45 bg-background text-foreground'
                          : 'border-border/60 bg-background/60 text-muted-foreground hover:border-primary/30 hover:text-foreground',
                        !canSave && 'cursor-default',
                      )}
                    >
                      <Checkbox
                        id={`sales-rep-branch-${branch.id}`}
                        checked={checked}
                        disabled={!canSave || primary}
                        onCheckedChange={(value) => toggleBranch(branch.id, value === true)}
                      />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">
                        {branch.name?.trim() || `#${branch.id}`}
                      </span>
                      {primary ? (
                        <span className="shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-bold text-foreground">
                          {ui('أساسي')}
                        </span>
                      ) : null}
                    </label>
                  );
                }) : (
                  <p className="sm:col-span-2 text-sm text-muted-foreground">
                    {ui('لا توجد فروع متاحة.')}
                  </p>
                )}
              </div>
            </div>
            <SalesRepActivation repId={draft.id} name={name} />
            <div className="flex items-center justify-between gap-4 rounded-xl border bg-primary/5 p-4">
              <div><Label htmlFor="rep-defaults">{ui('يتبع الإعداد العام')}</Label><p className="mt-1 text-xs text-muted-foreground">{ui('تفعيله يستبدل إعداد هذا الشخص بالإعداد العام. أوقفه لتخصيص القيم المعروضة.')}</p></div>
              <Switch id="rep-defaults" checked={draft.useDefaultSettings ?? false} disabled={!canSave || saving} onCheckedChange={async checked => {
                if (!checked) { setDraft({ ...draft, useDefaultSettings: false }); return; }
                try { const { data } = await api.get<SalesDefaults>('/club-sales-settings/sales-defaults'); setDraft({ ...draft, ...data, useDefaultSettings: true }); }
                catch (error) { toast.error(apiError(error)); }
              }} />
            </div>
            <fieldset disabled={draft.useDefaultSettings || !canSave || saving} className="space-y-4 disabled:opacity-70">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="sales-monthly-target">{ui('قيمة التارجت')}</Label>
                <Input
                  id="sales-monthly-target"
                  className="nums"
                  type="number"
                  min={0}
                  disabled={!canSave || draft.useDefaultSettings}
                  value={draft.monthlyTarget}
                  onChange={(e) => setDraft({ ...draft, monthlyTarget: Number(e.target.value) })}
                />
                {performance ? (
                  <p className="text-xs text-muted-foreground">
                    {ui('الفعلي')}: {formatMoney(performance.actual)}
                  </p>
                ) : null}
                {!draft.monthlyTarget ? (
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    {ui('لم يُحدَّد تارجت بعد — نسبة التحقيق تظل صفر حتى تكتب قيمة التارجت.')}
                  </p>
                ) : null}
              </div>
              <div className="space-y-1.5">
                <Label>{ui('نظام العمولة')}</Label>
                <Select
                  value={draft.commissionMode}
                  disabled={!canSave || draft.useDefaultSettings}
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
            <TargetPeriodFields value={draft} cycle={draft.currentCycle} disabled={!canSave || draft.useDefaultSettings} onChange={(period) => setDraft({ ...draft, ...period })} />
            {draft.commissionMode === 'flat' ? (
              <div className="max-w-xs space-y-1.5">
                <Label htmlFor="sales-flat-commission">{ui('نسبة العمولة %')}</Label>
                <Input
                  id="sales-flat-commission"
                  className="nums"
                  type="number"
                  min={0}
                  max={100}
                  disabled={!canSave || draft.useDefaultSettings}
                  value={draft.flatCommissionPercent}
                  onChange={(e) => setDraft({ ...draft, flatCommissionPercent: Number(e.target.value) })}
                />
              </div>
            ) : (
              <div className="space-y-2">
                <Label>{ui('شرائح العمولة')}</Label>
                <CommissionTiersEditor
                  tiers={draft.tiers}
                  disabled={!canSave || draft.useDefaultSettings}
                  onChange={(tiers) => setDraft({ ...draft, tiers })}
                />
              </div>
            )}
            <CommissionCalculationPreview
              baseAmount={performance?.actual ?? 0}
              percent={activePercent}
              label={ui('العمولة على المبيعات الحالية')}
            />
            </fieldset>
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
