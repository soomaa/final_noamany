import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeftRight, Users } from 'lucide-react';
import { toast } from 'sonner';
import { PermissionButton as Button } from '@/components/club/permission-button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api, apiError } from '@/lib/api';
import { toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';

import type { TransferPreview } from './sales-rep-activation';

/**
 * Where a deactivated specialist's open customers go.
 *
 * Switching someone off without this leaves their pipeline assigned to a person who has
 * stopped working it — the customers stay in the system and nobody calls them.
 */
export function SalesRepTransferDialog({
  open,
  onOpenChange,
  fromRepId,
  fromRepName,
  onTransferred,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fromRepId: number | null;
  fromRepName: string;
  onTransferred?: () => void;
}) {
  const { ui } = useLocale();
  const [mode, setMode] = useState<'auto' | 'manual'>('auto');
  const [targetId, setTargetId] = useState('');
  const [saving, setSaving] = useState(false);

  const reps = useQuery({
    queryKey: ['sales-transfer-preview', fromRepId],
    queryFn: async () => (await api.get<TransferPreview>(`/club-leads/reps/${fromRepId}/transfer-preview`)).data,
    enabled: open && fromRepId != null,
    staleTime: 0,
  });
  const options = reps.data?.candidates ?? [];
  useEffect(() => { if (open) { setMode('auto'); setTargetId(''); } }, [open, fromRepId]);

  const submit = async () => {
    if (fromRepId == null) return;
    if (reps.data?.count && mode === 'manual' && !targetId) { toast.error(ui('اختر أخصائي المبيعات المستلم')); return; }
    setSaving(true);
    try {
      const { data } = await api.post<{ moved: number; targets: number[] }>(
        `/club-leads/reps/${fromRepId}/activation`,
        { isActive: false, mode, targetEmployeeId: mode === 'manual' ? Number(targetId) : undefined },
      );
      toast.success(
        data.moved
          ? `${ui('تم نقل')} ${toArabicDigits(data.moved)} ${ui('عميل')}`
          : ui('تم تعطيل الأخصائي؛ لا يوجد عملاء لنقلهم'),
      );
      onTransferred?.();
      onOpenChange(false);
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={value => { if (!saving) onOpenChange(value); }}>
      <DialogContent size="sm" dir="rtl" aria-describedby="rep-transfer-desc">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowLeftRight className="size-5 text-primary" />
            {ui('تعطيل ونقل عملاء')} {fromRepName}
          </DialogTitle>
          <DialogDescription id="rep-transfer-desc">
            {ui('اختر من يستلم المتابعات قبل تعطيل الأخصائي. الإلغاء يترك حالته وعملاءه كما هم.')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <p className="rounded-xl bg-muted p-4 text-lg font-bold" aria-live="polite">{reps.data ? `${toArabicDigits(reps.data.count)} ${ui('عميل قيد المتابعة')}` : ui('جارٍ عد العملاء…')}</p>
          {reps.isError ? <p role="alert" className="text-sm text-destructive">{ui('تعذر تحميل العملاء. أغلق النافذة وأعد المحاولة.')}</p> : null}
          {reps.data && !reps.data.autoAvailable && mode === 'auto' ? <p role="alert" className="text-sm text-destructive">{ui('لا يوجد مستلم نشط لكل فروع العملاء. أضف أخصائيًا مؤهلًا قبل التعطيل.')}</p> : null}
          <button
            type="button"
            onClick={() => setMode('auto')}
            aria-pressed={mode === 'auto'}
            className={`flex w-full items-start gap-3 rounded-xl border p-4 text-start transition-colors ${
              mode === 'auto' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'
            }`}
          >
            <Users className="mt-0.5 size-5 shrink-0 text-primary" />
            <span>
              <span className="block font-semibold">{ui('توزيع تلقائي على الفريق')}</span>
              <span className="mt-1 block text-xs text-muted-foreground">
                {ui('يتوزعوا بالتساوي، وكل عميل يروح لأخصائي بيخدم نفس فرعه.')}
              </span>
            </span>
          </button>

          <button
            type="button"
            onClick={() => setMode('manual')}
            aria-pressed={mode === 'manual'}
            className={`flex w-full items-start gap-3 rounded-xl border p-4 text-start transition-colors ${
              mode === 'manual' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'
            }`}
          >
            <ArrowLeftRight className="mt-0.5 size-5 shrink-0 text-primary" />
            <span>
              <span className="block font-semibold">{ui('أخصائي واحد محدد')}</span>
              <span className="mt-1 block text-xs text-muted-foreground">
                {ui('كل العملاء يروحوا لشخص واحد تختاريه.')}
              </span>
            </span>
          </button>

          {mode === 'manual' ? (
            <div className="space-y-1.5">
              <Label htmlFor="transfer-target">{ui('الأخصائي المستلم')}</Label>
              <Select value={targetId} onValueChange={setTargetId}>
                <SelectTrigger id="transfer-target"><SelectValue placeholder={ui('اختر أخصائي')} /></SelectTrigger>
                <SelectContent>
                  {options.map((rep) => (
                    <SelectItem key={rep.id} value={String(rep.id)}>{rep.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <p className="rounded-lg bg-muted/40 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
            {ui('العملاء اللي اشتركوا فعلًا أو اتقفلوا بيفضلوا باسمه — دي سجل شغله وعمولته.')}
          </p>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>{ui('إلغاء')}</Button>
          <Button type="button" variant="brand" permissionAction={null} disabled={saving || reps.isFetching || reps.isError || !reps.data || (reps.data.count > 0 && (mode === 'auto' ? !reps.data.autoAvailable : !options.some(rep => String(rep.id) === targetId)))} onClick={() => void submit()}>
            {saving ? ui('جارٍ النقل…') : ui('تأكيد التعطيل ونقل العملاء')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
