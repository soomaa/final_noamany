import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/common/page-header';
import { StatusBadge } from '@/components/common/status-badge';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { useLocale } from '@/store/locale';
import type { AutomationWorkflow, StaffTask } from '@/types/gym-ops';

export function AutomationPage() {
  const { ui } = useLocale();
  const { data: workflows, refetch: refetchWf } = useQuery({
    queryKey: ['automation-workflows'],
    queryFn: async () => {
      const { data } = await api.get<AutomationWorkflow[]>('/club/automation/workflows');
      return data;
    },
  });

  const { data: tasks, refetch: refetchTasks } = useQuery({
    queryKey: ['staff-tasks-open'],
    queryFn: async () => {
      const { data } = await api.get<{ data: StaffTask[] }>('/club/automation/tasks', {
        params: { status: 'open', pageSize: 30 },
      });
      return data.data;
    },
  });

  const toggle = async (id: number, active: boolean) => {
    await api.patch(`/club/automation/workflows/${id}/toggle`, null, { params: { active: String(active) } });
    toast.success(active ? ui('تم التفعيل') : ui('تم الإيقاف'));
    void refetchWf();
  };

  const completeTask = async (id: number) => {
    await api.patch(`/club/automation/tasks/${id}/status`, null, { params: { status: 'completed' } });
    toast.success(ui('تم إغلاق المهمة'));
    void refetchTasks();
  };

  return (
    <div className="space-y-8">
      <PageHeader
        title={ui('أتمتة سير العمل')}
        description={ui('قواعد تلقائية: انتهاء اشتراك → مهمة مبيعات · تجديد → إغلاق مهمة')}
      />

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{ui('سير العمل')}</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {(workflows ?? []).map((wf) => (
            <div key={wf.id} className="rounded-xl border bg-card p-4 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{wf.nameAr}</p>
                  <p className="text-xs text-muted-foreground">{wf.triggerType}</p>
                  <p className="mt-1 text-xs text-muted-foreground nums">{wf.runsCount} {ui('تنفيذ')}</p>
                </div>
                <StatusBadge status={wf.isActive ? 'active' : 'suspended'} />
              </div>
              <Button
                className="mt-3"
                size="sm"
                variant="outline"
                onClick={() => void toggle(wf.id, !wf.isActive)}
              >
                {wf.isActive ? ui('إيقاف') : ui('تفعيل')}
              </Button>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{ui('مهام مفتوحة')}</h2>
        <div className="space-y-2">
          {(tasks ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">{ui('لا توجد مهام مفتوحة')}</p>
          )}
          {(tasks ?? []).map((t) => (
            <div key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
              <div>
                <p className="font-medium">{t.title}</p>
                <p className="text-xs text-muted-foreground">{t.taskType} · {t.priority}</p>
              </div>
              <Button size="sm" variant="outline" onClick={() => void completeTask(t.id)}>
                {ui('إتمام')}
              </Button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
