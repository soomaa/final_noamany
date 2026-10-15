import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CommissionTiersEditor } from '@/components/club/commission-tiers-editor';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { usePermission } from '@/hooks/use-permission';
import { api, apiError } from '@/lib/api';
import { defaultCommissionTiers, type TrainerCommissionSetting } from '@/lib/sales-commission';
import { useLocale } from '@/store/locale';
import { TargetPeriodFields } from '@/components/club/target-period-fields';

export function TrainerCommissionDialog({
  open,
  onOpenChange,
  trainerId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trainerId: number | null;
}) {
  const { ui } = useLocale();
  const { can } = usePermission();
  const qc = useQueryClient();
  const canView = can('club.sales.settings:view') || can('club.fitness.trainer_settings:view');
  const canSave = can('club.sales.settings:configure') || can('club.fitness.trainer_settings:configure');
  const [draft, setDraft] = useState<TrainerCommissionSetting | null>(null);
  const [saving, setSaving] = useState(false);
  const trainers = useQuery({
    queryKey: ['club-sales-settings-trainers'],
    queryFn: async () => (await api.get<TrainerCommissionSetting[]>('/club-sales-settings/trainers')).data,
    enabled: open && canView,
  });
  const selected = trainers.data?.find((row) => row.trainerId === trainerId) ?? null;

  useEffect(() => {
    if (!open || !selected) {
      setDraft(null);
      return;
    }
    setDraft({ ...selected, tiers: selected.tiers.length ? selected.tiers : defaultCommissionTiers() });
  }, [open, selected]);

  const save = async () => {
    if (!draft || !canSave) return;
    setSaving(true);
    try {
      await api.put('/club-sales-settings/trainers', {
        employeeId: draft.employeeId,
        trainerId: draft.trainerId,
        targetUnit: draft.targetUnit,
        baseTarget: draft.baseTarget,
        commissionMode: draft.commissionMode,
        targetPeriodMode: draft.targetPeriodMode,
        targetStartDate: draft.targetStartDate,
        targetEndDate: draft.targetEndDate,
        targetDays: draft.targetDays,
        privateCommissionMode: draft.privateCommissionMode,
        privateCommissionPercent: draft.privateCommissionPercent,
        tiers: draft.tiers.length ? draft.tiers : defaultCommissionTiers(),
      });
      toast.success(ui('تم حفظ عمولات المدرب'));
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['club-sales-settings-trainers'] }),
        qc.invalidateQueries({ queryKey: ['club-sales-reports-trainers'] }),
      ]);
      onOpenChange(false);
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" dir="rtl" aria-describedby="trainer-commission-desc">
        <DialogHeader>
          <DialogTitle>{draft?.name ?? selected?.name ?? ui('إعدادات التارجت والعمولة')}</DialogTitle>
          <DialogDescription id="trainer-commission-desc">{ui('وحدة التارجت وشرائح العمولة لهذا المدرب')}</DialogDescription>
        </DialogHeader>
        {!canView ? (
          <p className="rounded-[10px] border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">{ui('لا توجد صلاحية لعرض إعدادات هذا المدرب.')}</p>
        ) : trainers.isLoading ? (
          <Skeleton className="h-48 w-full rounded-xl" />
        ) : trainers.isError ? (
          <p className="text-sm text-destructive">{ui('تعذّر تحميل إعدادات المدرب')}</p>
        ) : draft ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>{ui('وحدة التارجت')}</Label>
                <Select value={draft.targetUnit} disabled={!canSave} onValueChange={(value) => setDraft({ ...draft, targetUnit: value as 'members' | 'money' })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="members">{ui('عدد أعضاء')}</SelectItem><SelectItem value="money">{ui('مبلغ')}</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="trainer-dialog-target">{ui('التارجت الأساسي')} ({draft.targetUnit === 'members' ? ui('عضو') : ui('EGP')})</Label>
                <Input id="trainer-dialog-target" className="nums" type="number" min={0} disabled={!canSave} value={draft.baseTarget} onChange={(event) => setDraft({ ...draft, baseTarget: Number(event.target.value) })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{ui('طريقة احتساب مستحق المدرب')}</Label>
              <Select
                value={draft.commissionMode}
                disabled={!canSave}
                onValueChange={(value) => setDraft({
                  ...draft,
                  commissionMode: value as TrainerCommissionSetting['commissionMode'],
                })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="attendance">{ui('عمولة الحضور والجلسات')}</SelectItem>
                  <SelectItem value="tiered">{ui('شريحة التارجت فقط')}</SelectItem>
                  <SelectItem value="combined">{ui('الحضور + شريحة التارجت')}</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{ui('يُستخدم الاختيار نفسه في شاشة الأداء وعند تسجيل الصرف.')}</p>
            </div>
            <TargetPeriodFields value={draft} disabled={!canSave} onChange={(period) => setDraft({ ...draft, ...period })} />
            <section className="rounded-xl border bg-muted/20 p-4">
              <h3 className="text-sm font-bold">{ui('عمولة جلسات Private')}</h3>
              <p className="mt-1 text-xs text-muted-foreground">{ui('اختر نسبة ثابتة مستقلة أو استخدم نسبة الاشتراكات من سجل راتب المدرب.')}</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5"><Label>{ui('مصدر النسبة')}</Label><Select value={draft.privateCommissionMode} disabled={!canSave} onValueChange={(value) => setDraft({ ...draft, privateCommissionMode: value as 'salary' | 'fixed' })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="salary">{ui('سجل الراتب')}</SelectItem><SelectItem value="fixed">{ui('نسبة ثابتة')}</SelectItem></SelectContent></Select></div>
                <div className="space-y-1.5"><Label htmlFor="trainer-private-percent">{ui('النسبة الثابتة %')}</Label><Input id="trainer-private-percent" type="number" min={0} max={100} disabled={!canSave || draft.privateCommissionMode !== 'fixed'} value={draft.privateCommissionPercent} onChange={(event) => setDraft({ ...draft, privateCommissionPercent: Number(event.target.value) })} /></div>
              </div>
            </section>
            <CommissionTiersEditor tiers={draft.tiers} disabled={!canSave} onChange={(tiers) => setDraft({ ...draft, tiers })} />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{ui('لا توجد إعدادات لهذا المدرب بعد.')}</p>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{ui('إغلاق')}</Button>
          {canSave ? <Button type="button" variant="brand" permissionAction={null} disabled={saving || !draft} onClick={() => void save()}>{ui('حفظ')}</Button> : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
