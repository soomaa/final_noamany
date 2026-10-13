import type { ColumnDef } from '@tanstack/react-table';
import { Pencil, Trash2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Combobox } from '@/components/common/combobox';
import { api, apiError } from '@/lib/api';
import { confirm } from '@/lib/confirm';
import { ListPageShell } from '@/components/common/list-page-shell';
import { DataTable } from '@/components/common/data-table';
import { useLocale } from '@/store/locale';
import type { EvaluationCategory, EvaluationItem } from '@/types/evaluation-management';

export function EvaluationItemsPage() {
  const { ui } = useLocale();
  const [rows, setRows] = useState<EvaluationItem[]>([]);
  const [categoryId, setCategoryId] = useState('');
  const [name, setName] = useState('');
  const [maxScore, setMaxScore] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const categories = useQuery({
    queryKey: ['evaluation-categories'],
    queryFn: () => api.get<EvaluationCategory[]>('/evaluation-management/categories').then((response) => response.data),
  });
  const load = async () => setRows((await api.get<EvaluationItem[]>('/evaluation-management/items')).data);

  useEffect(() => {
    void load();
  }, []);

  const resetForm = () => {
    setCategoryId('');
    setName('');
    setMaxScore('');
    setEditingId(null);
  };

  const save = async () => {
    if (!categoryId || !name.trim() || !maxScore || saving) return;
    setSaving(true);
    try {
      const payload = { categoryId: Number(categoryId), name: name.trim(), maxScore };
      if (editingId !== null) {
        await api.patch(`/evaluation-management/items/${editingId}`, payload);
      } else {
        await api.post('/evaluation-management/items', payload);
      }
      toast.success(editingId !== null ? ui('تم تعديل البند') : ui('تم الحفظ'));
      resetForm();
      await load();
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (row: EvaluationItem) => {
    setEditingId(row.id);
    setCategoryId(String(row.categoryId));
    setName(row.name);
    setMaxScore(row.maxScore);
  };

  const handleDelete = async (row: EvaluationItem) => {
    const ok = await confirm({
      title: ui('حذف بند التقييم'),
      description: `${ui('هل تريد حذف بند «')}${row.name}${ui('»؟')}`,
      confirmLabel: ui('حذف'),
      variant: 'destructive',
    });
    if (!ok) return;
    try {
      await api.delete(`/evaluation-management/items/${row.id}`);
      if (editingId === row.id) resetForm();
      await load();
      toast.success(ui('تم حذف البند'));
    } catch (error) {
      toast.error(apiError(error));
    }
  };

  const columns = useMemo<ColumnDef<EvaluationItem>[]>(
    () => [
      { accessorKey: 'categoryName', header: ui('الفئة') },
      { accessorKey: 'name', header: ui('البند') },
      { accessorKey: 'maxScore', header: ui('الدرجة العظمى') },
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
    <ListPageShell title={ui('بنود التقييم')}>
      <div className="mb-4 grid gap-2 md:grid-cols-3">
        <Combobox value={categoryId} onValueChange={setCategoryId} options={(categories.data ?? []).map((category) => ({ value: String(category.id), label: category.name }))} placeholder={ui('الفئة')} />
        <Input value={name} onChange={(event) => setName(event.target.value)} placeholder={ui('اسم البند')} />
        <Input type="number" min="0" value={maxScore} onChange={(event) => setMaxScore(event.target.value)} placeholder={ui('الدرجة العظمى')} />
        {editingId !== null && <Button variant="outline" disabled={saving} onClick={resetForm}>{ui('إلغاء')}</Button>}
        <Button disabled={!categoryId || !name.trim() || !maxScore || saving} onClick={() => void save()}>{editingId !== null ? ui('حفظ التعديل') : ui('حفظ')}</Button>
      </div>
      <DataTable columns={columns} data={rows} total={rows.length} page={1} pageSize={50} onPageChange={() => {}} enableExport={false} />
    </ListPageShell>
  );
}
