import { formatDisplayNumber } from '@/lib/number-display';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { TrainerCommissionDialog } from '@/components/club/trainer-commission-dialog';
import { EmptyState } from '@/components/common/states';
import { Skeleton } from '@/components/ui/skeleton';
import { usePermission } from '@/hooks/use-permission';
import { api } from '@/lib/api';
import type { TrainerCommissionSetting } from '@/lib/sales-commission';
import { useLocale } from '@/store/locale';

export function TrainerCommissionPanel() {
  const { ui } = useLocale();
  const { can } = usePermission();
  const canView = can('club.sales.settings:view') || can('club.fitness.trainer_settings:view');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const trainers = useQuery({
    queryKey: ['club-sales-settings-trainers'],
    queryFn: async () => (await api.get<TrainerCommissionSetting[]>('/club-sales-settings/trainers')).data,
    enabled: canView,
  });

  if (!canView) return null;

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-bold tracking-tight">{ui('أهداف وعمولات المدربين')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{ui('الموظفون بمسمى مدرب — شرائح تحت/على/فوق التارجت قابلة للتعديل.')}</p>
      </div>
      {trainers.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2"><Skeleton className="h-24 rounded-xl" /><Skeleton className="h-24 rounded-xl" /></div>
      ) : !trainers.data?.length ? (
        <EmptyState compact title={ui('لا يوجد مدربون مرتبطون بموظفين.')} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {trainers.data.map((row) => (
            <button
              key={row.trainerId}
              type="button"
              onClick={() => setSelectedId(row.trainerId)}
              className="surface-card rounded-xl border p-5 text-start transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <p className="font-bold">{row.name}</p>
              <p className="mt-1 text-sm text-muted-foreground">{ui('التارجت الأساسي')}: <b className="nums">{formatDisplayNumber(row.baseTarget)}</b> {row.targetUnit === 'members' ? ui('عضو') : ui('EGP')}</p>
            </button>
          ))}
        </div>
      )}
      <TrainerCommissionDialog open={selectedId != null} onOpenChange={(open) => !open && setSelectedId(null)} trainerId={selectedId} />
    </section>
  );
}
