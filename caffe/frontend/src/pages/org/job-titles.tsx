import { useQuery } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { ListPageShell } from '@/components/common/list-page-shell';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { api, apiError } from '@/lib/api';
import { isNotImplemented, useMutationWithToast } from '@/lib/api-hooks';
import { confirm } from '@/lib/confirm';
import type { JobTitle } from '@/types/org';
import { toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';
import { uiStatic } from '@/lib/ui-static';

export function OrgJobTitlesPage() {
  const { ui } = useLocale();
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['departments', 'job-titles'],
    queryFn: async () => {
      const { data: jobs } = await api.get<JobTitle[]>('/departments/job-titles');
      return jobs;
    },
    retry: false,
  });

  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [isTrainer, setIsTrainer] = useState(false);

  const deleteMutation = useMutationWithToast(
    (id: number) => api.delete(`/departments/job-titles/${id}`),
    { success: ui('تم حذف المسمى الوظيفي'), invalidate: ['departments'] },
  );

  const openCreate = () => {
    setEditId(null);
    setName('');
    setIsTrainer(false);
    setFormOpen(true);
  };

  const openEdit = (job: JobTitle) => {
    setEditId(job.id);
    setName(job.name ?? '');
    setIsTrainer(job.isTrainer ?? false);
    setFormOpen(true);
  };

  const handleDelete = async (job: JobTitle) => {
    const ok = await confirm({
      title: ui('حذف المسمى الوظيفي'),
      description: `${ui('هل تريد حذف «')}${job.name ?? ui('هذا المسمى')}${ui('»؟')}`,
      confirmLabel: ui('حذف'),
      variant: 'destructive',
    });
    if (ok) deleteMutation.mutate(job.id);
  };

  const save = async () => {
    if (!name.trim()) {
      toast.error(ui('اسم المسمى الوظيفي مطلوب'));
      return;
    }
    try {
      const payload = { name: name.trim(), isTrainer };
      if (editId) await api.patch(`/departments/job-titles/${editId}`, payload);
      else await api.post('/departments/job-titles', payload);
      toast.success(ui('تم حفظ المسمى الوظيفي'));
      setFormOpen(false);
      void refetch();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  if (isError && isNotImplemented(error)) {
    return (
      <ListPageShell title={ui('المسميات الوظيفية')} isError error={error}>
        <div />
      </ListPageShell>
    );
  }

  return (
    <>
      <ListPageShell
        title={ui('المسميات الوظيفية')}
        description={ui('إدارة المسميات الوظيفية (الأدوار) التي تُربط بالموظفين والصلاحيات')}
        stats={[{ title: ui('عدد المسميات'), value: toArabicDigits(data?.length ?? 0) }]}
        statsLoading={isLoading}
        isError={isError}
        error={error}
        actions={
          <Button variant="brand" size="sm" onClick={openCreate}>
            <Plus className="size-4" /> {ui('إضافة مسمى وظيفي')}
          </Button>
        }
      >
        <Card className="p-4">
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : !data?.length ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              {ui('لا توجد مسميات وظيفية — ابدأ بإضافة مسمى جديد.')}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="p-3 text-start">{uiStatic('#')}</th>
                    <th className="p-3 text-start">{ui('المسمى الوظيفي')}</th>
                    <th className="p-3 text-end">{ui('إجراءات')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((job, idx) => (
                    <tr key={job.id} className="border-b border-border/50 even:bg-muted/20">
                      <td className="p-3 nums text-muted-foreground">{toArabicDigits(idx + 1)}</td>
                      <td className="p-3 font-medium">
                        {job.name ?? '—'}
                        {job.isTrainer && (
                          <span className="ms-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                            {ui('مدرب')}
                          </span>
                        )}
                      </td>
                      <td className="p-3">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" className="size-8" aria-label={ui('تعديل')} onClick={() => openEdit(job)}>
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="size-8" aria-label={ui('حذف')} onClick={() => void handleDelete(job)}>
                            <Trash2 className="size-3.5 text-destructive" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </ListPageShell>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{editId ? ui('تعديل مسمى وظيفي') : ui('إضافة مسمى وظيفي')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="job-title-name">{ui('المسمى الوظيفي')}</Label>
              <Input
                id="job-title-name"
                className="mt-1.5"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={ui('مثال: Trainer, Sales, Marketing')}
              />
            </div>
            <label className="flex items-center gap-2 rounded-lg border p-3 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={isTrainer}
                onChange={(e) => setIsTrainer(e.target.checked)}
              />
              <span>
                <span className="font-medium">{ui('مدرب')}</span>
                <span className="block text-xs text-muted-foreground">
                  {ui('الموظفون بهذا المسمى يظهرون تلقائيًا في قائمة المدربين المرتبطة بالحصص.')}
                </span>
              </span>
            </label>
            <p className="text-xs text-muted-foreground">
              {ui('المسمى الوظيفي يمثل الدور الذي سيتم ربط الصلاحيات به لاحقًا.')}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>{ui('إلغاء')}</Button>
            <Button onClick={() => void save()}>{ui('حفظ')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
