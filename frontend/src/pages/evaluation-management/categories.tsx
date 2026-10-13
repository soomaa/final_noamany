import type { ColumnDef } from '@tanstack/react-table';
import { Pencil, Trash2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Combobox } from '@/components/common/combobox';
import { DataTable } from '@/components/common/data-table';
import { ListPageShell } from '@/components/common/list-page-shell';
import { api, apiError } from '@/lib/api';
import { confirm } from '@/lib/confirm';
import { useLocale } from '@/store/locale';
import type { EvaluationCategory, EvaluationOption } from '@/types/evaluation-management';

export function EvaluationCategoriesPage() {
  const { ui } = useLocale();
  const [name, setName] = useState('');
  const [jobTitleId, setJobTitleId] = useState('');
  const [rows, setRows] = useState<EvaluationCategory[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const titles = useQuery({
    queryKey: ['evaluation-management', 'job-titles'],
    queryFn: () => api.get<EvaluationOption[]>('/evaluation-management/lookups/job-titles').then((response) => response.data),
  });
  const load = async () => setRows((await api.get<EvaluationCategory[]>('/evaluation-management/categories')).data);

  useEffect(() => {
    void load();
  }, []);

  const resetForm = () => {
    setName('');
    setJobTitleId('');
    setEditingId(null);
  };

  const save = async () => {
    if (!name.trim() || !jobTitleId) return;
    setSaving(true);
    try {
      const payload = { name: name.trim(), jobTitleId: Number(jobTitleId) };
      if (editingId !== null) {
        await api.patch(`/evaluation-management/categories/${editingId}`, payload);
      } else {
        await api.post('/evaluation-management/categories', payload);
      }
      toast.success(editingId !== null ? ui('تم تعديل الفئة') : ui('تم الحفظ'));
      resetForm();
      await load();
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (row: EvaluationCategory) => {
    setEditingId(row.id);
    setName(row.name);
    setJobTitleId(String(row.jobTitleId));
  };

  const handleDelete = async (row: EvaluationCategory) => {
    const ok = await confirm({
      title: ui('حذف فئة التقييم'),
      description: `${ui('هل تريد حذف فئة «')}${row.name}${ui('»؟')}`,
      confirmLabel: ui('حذف'),
      variant: 'destructive',
    });
    if (!ok) return;
    try {
      await api.delete(`/evaluation-management/categories/${row.id}`);
      if (editingId === row.id) resetForm();
      await load();
      toast.success(ui('تم حذف الفئة'));
    } catch (error) {
      toast.error(apiError(error));
    }
  };

  const columns = useMemo<ColumnDef<EvaluationCategory>[]>(
    () => [
      { accessorKey: 'name', header: ui('اسم الفئة') },
      { accessorKey: 'jobTitleName', header: ui('المسمى الوظيفي') },
      {
        id: 'actions',
        header: ui('إجراء'),
        cell: ({ row }) => (
          <div className="flex justify-center gap-1">
            <Button variant="ghost" size="icon" aria-label={ui('تعديل')} onClick={() => openEdit(row.original)}>
              <Pencil className="size-4" />
            </Button>
            <Button variant="ghost" size="icon" aria-label={ui('حذف')} onClick={() => void handleDelete(row.original)}>
              <Trash2 className="size-4 text-destructive" />
            </Button>
          </div>
        ),
      },
    ],
    [ui],
  );

  return (
    <ListPageShell title={ui('فئات التقييم')} description={ui('إدارة الفئات حسب المسمى الوظيفي')}>
      <div className="mb-5 grid gap-3 rounded-xl border p-4 md:grid-cols-4">
        <div>
          <Label>{ui('اسم الفئة')}</Label>
          <Input value={name} onChange={(event) => setName(event.target.value)} />
        </div>
        <div>
          <Label>{ui('المسمى الوظيفي')}</Label>
          <Combobox value={jobTitleId} onValueChange={setJobTitleId} options={(titles.data ?? []).map((title) => ({ value: String(title.id), label: title.name }))} placeholder={ui('اختر المسمى')} />
        </div>
        {editingId !== null && <Button className="self-end" variant="outline" disabled={saving} onClick={resetForm}>{ui('إلغاء')}</Button>}
        <Button className="self-end" disabled={!name.trim() || !jobTitleId || saving} onClick={() => void save()}>
          {editingId !== null ? ui('حفظ التعديل') : ui('حفظ')}
        </Button>
      </div>
      <DataTable columns={columns} data={rows} total={rows.length} page={1} pageSize={50} onPageChange={() => {}} enableExport={false} />
    </ListPageShell>
  );
}
