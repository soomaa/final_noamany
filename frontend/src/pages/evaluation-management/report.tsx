import { useQuery } from '@tanstack/react-query';
import { Eye, Pencil, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Combobox } from '@/components/common/combobox';
import { DataTable } from '@/components/common/data-table';
import { DateText, TimeText } from '@/components/common/formatters';
import { ListPageShell } from '@/components/common/list-page-shell';
import { usePermission } from '@/hooks/use-permission';
import { api, apiError } from '@/lib/api';
import { confirm } from '@/lib/confirm';
import type { EvaluationCategory, EvaluationDetails, EvaluationOption, EvaluationReportRow } from '@/types/evaluation-management';

type FilterState = { categoryId: string; employeeId: string; branchId: string; dateFrom: string; dateTo: string };

export function EvaluationReportPage() {
  const { can } = usePermission();
  const canUpdate = can('evaluation-management.report:update');
  const canDelete = can('evaluation-management.report:delete');
  const [filter, setFilter] = useState<FilterState>({ categoryId: '', employeeId: '', branchId: '', dateFrom: '', dateTo: '' });
  const [detailId, setDetailId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [evaluationDate, setEvaluationDate] = useState('');
  const [evaluationMonth, setEvaluationMonth] = useState('');
  const [scores, setScores] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState(false);

  const categories = useQuery({
    queryKey: ['evaluation-categories'],
    queryFn: () => api.get<EvaluationCategory[]>('/evaluation-management/categories').then((response) => response.data),
  });
  const employees = useQuery({
    queryKey: ['evaluation-report-employees', filter.categoryId],
    enabled: !!filter.categoryId,
    queryFn: () => api.get<EvaluationOption[]>(`/evaluation-management/categories/${filter.categoryId}/employees`).then((response) => response.data),
  });
  const branches = useQuery({
    queryKey: ['evaluation-branches'],
    queryFn: () => api.get<EvaluationOption[]>('/evaluation-management/lookups/branches').then((response) => response.data),
  });
  const report = useQuery({
    queryKey: ['evaluation-report', filter],
    queryFn: () => api.get<{ data: EvaluationReportRow[]; total: number }>('/evaluation-management/evaluations', {
      params: {
        ...filter,
        categoryId: filter.categoryId || undefined,
        employeeId: filter.employeeId || undefined,
        branchId: filter.branchId || undefined,
        dateFrom: filter.dateFrom || undefined,
        dateTo: filter.dateTo || undefined,
        page: 1,
        pageSize: 100,
      },
    }).then((response) => response.data),
  });
  const detail = useQuery({
    queryKey: ['evaluation-detail', detailId],
    enabled: detailId !== null,
    queryFn: () => api.get<EvaluationDetails>(`/evaluation-management/evaluations/${detailId}`).then((response) => response.data),
  });
  const editDetail = useQuery({
    queryKey: ['evaluation-edit', editingId],
    enabled: editingId !== null,
    queryFn: () => api.get<EvaluationDetails>(`/evaluation-management/evaluations/${editingId}`).then((response) => response.data),
  });

  useEffect(() => {
    if (!editDetail.data) return;
    setEvaluationDate(String(editDetail.data.evaluationDate).slice(0, 10));
    setEvaluationMonth(editDetail.data.evaluationMonth);
    setScores(Object.fromEntries(editDetail.data.details.map((item) => [item.itemId, item.awardedScore])));
  }, [editDetail.data]);

  const closeEdit = () => {
    setEditingId(null);
    setScores({});
  };

  const saveEdit = async () => {
    if (!editingId || !editDetail.data) return;
    if (!evaluationDate || !evaluationMonth) {
      toast.error('أدخل التاريخ والشهر');
      return;
    }
    const invalidScore = editDetail.data.details.some((item) => {
      const score = Number(scores[item.itemId]);
      return !Number.isFinite(score) || score < 0 || score > Number(item.maxScore);
    });
    if (invalidScore) {
      toast.error('تأكد من أن الدرجات ضمن الحدود المسموحة');
      return;
    }
    setSaving(true);
    try {
      await api.patch(`/evaluation-management/evaluations/${editingId}`, {
        evaluationDate,
        evaluationMonth,
        details: editDetail.data.details.map((item) => ({ itemId: item.itemId, awardedScore: scores[item.itemId] })),
      });
      toast.success('تم تعديل التقييم');
      closeEdit();
      void report.refetch();
      if (detailId === editingId) void detail.refetch();
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setSaving(false);
    }
  };

  const deleteEvaluation = async (row: EvaluationReportRow) => {
    const approved = await confirm({
      title: 'حذف التقييم',
      description: `سيتم حذف تقييم ${row.employeeName} وجميع درجاته نهائياً.`,
      confirmLabel: 'حذف التقييم',
      variant: 'destructive',
    });
    if (!approved) return;
    try {
      await api.delete(`/evaluation-management/evaluations/${row.id}`);
      toast.success('تم حذف التقييم');
      if (detailId === row.id) setDetailId(null);
      void report.refetch();
    } catch (error) {
      toast.error(apiError(error));
    }
  };

  const columns = [
    {
      accessorKey: 'evaluationDate',
      header: 'التاريخ والوقت',
      cell: ({ row }: any) => <div className="space-y-0.5"><DateText value={row.original.evaluationDate} /><div className="text-xs text-muted-foreground"><TimeText value={row.original.createdAt} /></div></div>,
    },
    { accessorKey: 'evaluationMonth', header: 'الشهر' },
    { accessorKey: 'categoryName', header: 'الفئة' },
    { accessorKey: 'employeeName', header: 'الموظف' },
    { accessorKey: 'createdByName', header: 'أُضيف بواسطة', cell: ({ row }: any) => row.original.createdByName || '—' },
    {
      id: 'actions',
      header: 'الإجراءات',
      cell: ({ row }: any) => <div className="flex items-center gap-1">
        <Button size="icon" variant="outline" title="تفاصيل" onClick={() => setDetailId(row.original.id)}><Eye className="size-4" /></Button>
        {canUpdate && <Button size="icon" variant="outline" title="تعديل" onClick={() => setEditingId(row.original.id)}><Pencil className="size-4" /></Button>}
        {canDelete && <Button size="icon" variant="destructive" title="حذف" onClick={() => void deleteEvaluation(row.original)}><Trash2 className="size-4" /></Button>}
      </div>,
    },
  ];

  return <>
    <ListPageShell title="تقرير التقييمات" description="بحث وعرض وإدارة التقييمات من مكان واحد">
      <div className="mb-4 grid gap-3 rounded-xl border p-4 md:grid-cols-4">
        <div><Label>الفئة</Label><Combobox value={filter.categoryId} onValueChange={(value) => setFilter((current) => ({ ...current, categoryId: value, employeeId: '' }))} options={(categories.data ?? []).map((item) => ({ value: String(item.id), label: item.name }))} placeholder="كل الفئات" /></div>
        <div><Label>الفرع</Label><Combobox value={filter.branchId} onValueChange={(value) => setFilter((current) => ({ ...current, branchId: value }))} options={(branches.data ?? []).map((item) => ({ value: String(item.id), label: item.name }))} placeholder="كل الفروع" /></div>
        <div><Label>الموظف</Label><Combobox value={filter.employeeId} onValueChange={(value) => setFilter((current) => ({ ...current, employeeId: value }))} options={(employees.data ?? []).map((item) => ({ value: String(item.id), label: item.name }))} placeholder="كل الموظفين" /></div>
        <div><Label>من تاريخ</Label><Input type="date" value={filter.dateFrom} onChange={(event) => setFilter((current) => ({ ...current, dateFrom: event.target.value }))} /></div>
        <div><Label>إلى تاريخ</Label><Input type="date" value={filter.dateTo} onChange={(event) => setFilter((current) => ({ ...current, dateTo: event.target.value }))} /></div>
      </div>
      <DataTable columns={columns} data={report.data?.data ?? []} total={report.data?.total ?? 0} page={1} pageSize={100} onPageChange={() => {}} enableExport={false} />
    </ListPageShell>

    <Dialog open={detailId !== null} onOpenChange={(open) => !open && setDetailId(null)}>
      <DialogContent>
        <DialogHeader><DialogTitle>تفاصيل تقييم {detail.data?.employeeName ?? ''}</DialogTitle></DialogHeader>
        <div className="space-y-1 text-sm"><p><DateText value={detail.data?.evaluationDate} /> — {detail.data?.categoryName}</p><p className="text-muted-foreground">أُضيف بواسطة: {detail.data?.createdByName ?? '—'}</p></div>
        <table className="w-full text-sm"><thead><tr><th className="text-start">البند</th><th>العظمى</th><th>الممنوحة</th></tr></thead><tbody>{detail.data?.details.map((item) => <tr key={item.id} className="border-t"><td className="py-2">{item.itemName}</td><td className="text-center">{item.maxScore}</td><td className="text-center">{item.awardedScore}</td></tr>)}</tbody></table>
      </DialogContent>
    </Dialog>

    <Dialog open={editingId !== null} onOpenChange={(open) => !open && closeEdit()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>تعديل التقييم</DialogTitle></DialogHeader>
        {editDetail.isLoading ? <p className="text-sm text-muted-foreground">جارٍ تحميل التقييم…</p> : editDetail.data && <div className="space-y-4">
          <p className="rounded-lg bg-muted p-3 text-sm">{editDetail.data.employeeName} — {editDetail.data.categoryName}<span className="mt-1 block text-muted-foreground">الموظف والفئة ثابتان للحفاظ على سجل التقييم.</span></p>
          <div className="grid gap-3 sm:grid-cols-2"><div><Label>تاريخ التقييم</Label><Input type="date" value={evaluationDate} onChange={(event) => setEvaluationDate(event.target.value)} /></div><div><Label>الشهر</Label><Input type="month" value={evaluationMonth} onChange={(event) => setEvaluationMonth(event.target.value)} /></div></div>
          <div className="overflow-hidden rounded-lg border"><table className="w-full text-sm"><thead><tr className="border-b bg-muted"><th className="p-2 text-start">البند</th><th className="p-2">العظمى</th><th className="p-2">الممنوحة</th></tr></thead><tbody>{editDetail.data.details.map((item) => <tr key={item.id} className="border-b last:border-0"><td className="p-2">{item.itemName}</td><td className="p-2 text-center">{item.maxScore}</td><td className="p-2"><Input className="mx-auto max-w-28 text-center" type="number" min="0" max={item.maxScore} step="0.01" value={scores[item.itemId] ?? ''} onChange={(event) => setScores((current) => ({ ...current, [item.itemId]: event.target.value }))} /></td></tr>)}</tbody></table></div>
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={closeEdit} disabled={saving}>إلغاء</Button><Button onClick={() => void saveEdit()} disabled={saving}>{saving ? 'جارٍ الحفظ…' : 'حفظ التعديل'}</Button></div>
        </div>}
      </DialogContent>
    </Dialog>
  </>;
}
