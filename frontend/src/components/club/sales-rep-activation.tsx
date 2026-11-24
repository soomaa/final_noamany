import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { PermissionButton as Button } from '@/components/club/permission-button';
import { usePermission } from '@/hooks/use-permission';
import { useLocale } from '@/store/locale';
import { api, apiError } from '@/lib/api';
import { toArabicDigits } from '@/lib/utils';
import { SalesRepTransferDialog } from './sales-rep-transfer-dialog';
export interface TransferPreview { isActive: boolean; count: number; candidates: Array<{id: number; name: string}>; autoAvailable: boolean; blockedBranches: number[] }
export function SalesRepActivation({ repId, name }: { repId: number; name: string }) {
  const { can } = usePermission();
  const { ui } = useLocale();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const allowed = can('club.sales.settings:configure');
  const preview = useQuery({ queryKey: ['sales-transfer-preview', repId], queryFn: async () => (await api.get<TransferPreview>(`/club-leads/reps/${repId}/transfer-preview`)).data, enabled: allowed, staleTime: 0 });
  const invalidate = () => qc.invalidateQueries({ predicate: q => ['sales-transfer-preview', 'club-sales-settings-reps', 'club-sales-dashboard', 'club-sales-reports-reps', 'club-leads', 'team-performance'].includes(String(q.queryKey[0])) });
  if (!allowed) return null;
  const activate = async () => {
    setBusy(true);
    try { await api.post(`/club-leads/reps/${repId}/activation`, { isActive: true }); await invalidate(); toast.success(ui('تم تفعيل الأخصائي')); }
    catch (error) { toast.error(apiError(error)); } finally { setBusy(false); }
  };
  return <>
    <div className="flex items-center justify-between gap-4 rounded-xl border bg-muted/20 p-4">
      <div><Label htmlFor={`rep-active-${repId}`} className="font-bold">{ui(preview.data?.isActive === false ? ui('غير نشط') : ui('نشاط أخصائي المبيعات'))}</Label>
        <p className="mt-1 text-sm text-muted-foreground">{preview.data ? `${ui('عملاء قيد المتابعة')}: ${toArabicDigits(preview.data.count)}` : ui('جارٍ تحميل حالة الأخصائي…')}</p>
        {preview.isError ? <Button variant="outline" size="sm" onClick={() => void preview.refetch()}>{ui('إعادة تحميل الحالة')}</Button> : null}
      </div>
      <Switch id={`rep-active-${repId}`} checked={preview.data?.isActive ?? false} disabled={!preview.data || busy || preview.isError} onCheckedChange={checked => checked ? void activate() : setOpen(true)} />
    </div>
    <SalesRepTransferDialog open={open} onOpenChange={setOpen} fromRepId={repId} fromRepName={name} onTransferred={() => void invalidate()} />
  </>;
}
