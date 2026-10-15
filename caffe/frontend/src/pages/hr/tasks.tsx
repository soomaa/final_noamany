import type { ColumnDef } from '@tanstack/react-table';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, ClipboardList, Pencil, Plus, Trash2, XCircle } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Combobox } from '@/components/common/combobox';
import { DataTable } from '@/components/common/data-table';
import { DateText } from '@/components/common/formatters';
import { ListPageShell } from '@/components/common/list-page-shell';
import { StatusBadge, type StatusKey } from '@/components/common/status-badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { api, apiError } from '@/lib/api';
import { useMutationWithToast, usePaginatedList } from '@/lib/api-hooks';
import { confirm } from '@/lib/confirm';
import { useListQuery } from '@/lib/use-list-query';
import { toArabicDigits } from '@/lib/utils';
import type { EmployeeListItem } from '@/types/employees';
import { fetchAllReportRows } from '@/lib/report-fetch';
import { useLocale } from '@/store/locale';
import { uiStatic } from '@/lib/ui-static';

type Decision = 'wait' | 'accepted' | 'refused';

interface TaskRow {
  id: number;
  rkm?: number | null;
  date?: string | null;
  empName?: string;
  empId?: number | null;
  edara?: string;
  qesm?: string;
  details?: string;
  decision?: Decision;
}

interface MokalfaItem {
  name: string;
  notes: string;
}

interface TaskDetail extends TaskRow {
  mokalfat?: MokalfaItem[];
}

const DECISION_BADGE: Record<Decision, { status: StatusKey; label: string }> = {
  wait: { status: 'pending', label: uiStatic('قيد الانتظار') },
  accepted: { status: 'approved', label: uiStatic('مقبولة') },
  refused: { status: 'rejected', label: uiStatic('مرفوضة') },
};

const STATUS_FILTER = [
  { value: '', label: uiStatic('كل الحالات') },
  { value: 'wait', label: uiStatic('قيد الانتظار') },
  { value: 'accepted', label: uiStatic('مقبولة') },
  { value: 'refused', label: uiStatic('مرفوضة') },
];

const emptyForm = {
  empId: '',
  empName: '',
  edara: '',
  qesm: '',
  details: '',
};

export function TasksPage() {
  const { ui } = useLocale();
  const { params, setParams } = useListQuery();
  const { data, isLoading, isError, error, refetch } = usePaginatedList<TaskRow>('tasks', params);

  // raw employee list → options + a lookup for auto-filling name/edara/qesm
  const { data: employees = [] } = useQuery({
    queryKey: ['employees', 'lookup'],
    queryFn: async () => {
      return fetchAllReportRows<EmployeeListItem>('/employees', { status: 1 }, 200);
    },
    staleTime: 60_000,
  });

  const empOptions = useMemo(
    () => employees.map((e) => ({ value: String(e.id), label: `${e.employee ?? '—'} (${e.emp_code ?? '—'})` })),
    [employees],
  );

  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [mokalfat, setMokalfat] = useState<MokalfaItem[]>([]);
  const [saving, setSaving] = useState(false);

  const [actionOpen, setActionOpen] = useState(false);
  const [actionRow, setActionRow] = useState<TaskRow | null>(null);
  const [actionDecision, setActionDecision] = useState<'accepted' | 'refused'>('accepted');
  const [actionNotes, setActionNotes] = useState('');

  const deleteMutation = useMutationWithToast(
    (id: number) => api.delete(`/tasks/${id}`),
    { success: ui('تم حذف المهمة'), invalidate: ['tasks'] },
  );

  const stats = useMemo(
    () => [{ title: ui('المهام والمراسلات'), value: toArabicDigits(data?.total ?? 0), icon: <ClipboardList className="size-5" /> }],
    [data],
  );

  const onPickEmployee = (empId: string) => {
    const emp = employees.find((e) => String(e.id) === empId);
    setForm((f) => ({
      ...f,
      empId,
      // auto-fill from the directory when available; manual edits stay possible
      empName: emp ? (emp.employee ?? f.empName) : f.empName,
      edara: emp ? (emp.edara_n ?? '') : f.edara,
      qesm: emp ? (emp.qsm_n ?? '') : f.qesm,
    }));
  };

  const openCreate = () => {
    setEditId(null);
    setForm(emptyForm);
    setMokalfat([]);
    setFormOpen(true);
  };

  const openEdit = async (row: TaskRow) => {
    setEditId(row.id);
    setForm({
      empId: row.empId != null ? String(row.empId) : '',
      empName: row.empName ?? '',
      edara: row.edara ?? '',
      qesm: row.qesm ?? '',
      details: row.details ?? '',
    });
    setMokalfat([]);
    setFormOpen(true);
    try {
      const { data: detail } = await api.get<TaskDetail>(`/tasks/${row.id}`);
      setForm({
        empId: detail.empId != null ? String(detail.empId) : '',
        empName: detail.empName ?? '',
        edara: detail.edara ?? '',
        qesm: detail.qesm ?? '',
        details: detail.details ?? '',
      });
      setMokalfat((detail.mokalfat ?? []).map((m) => ({ name: m.name ?? '', notes: m.notes ?? '' })));
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const addMokalfa = () => setMokalfat((m) => [...m, { name: '', notes: '' }]);
  const removeMokalfa = (idx: number) => setMokalfat((m) => m.filter((_, i) => i !== idx));
  const setMokalfaField = (idx: number, key: keyof MokalfaItem, value: string) =>
    setMokalfat((m) => m.map((row, i) => (i === idx ? { ...row, [key]: value } : row)));

  const save = async () => {
    if (!form.empName.trim()) {
      toast.error(ui('اسم الموظف مطلوب'));
      return;
    }
    if (!form.details.trim()) {
      toast.error(ui('تفاصيل المهمة مطلوبة'));
      return;
    }
    setSaving(true);
    try {
      const payload = {
        empId: form.empId ? parseInt(form.empId, 10) : undefined,
        empName: form.empName.trim(),
        edara: form.edara.trim() || undefined,
        qesm: form.qesm.trim() || undefined,
        details: form.details.trim(),
        mokalfat: mokalfat
          .filter((m) => m.name.trim())
          .map((m) => ({ name: m.name.trim(), notes: m.notes.trim() || undefined })),
      };
      if (editId) await api.patch(`/tasks/${editId}`, payload);
      else await api.post('/tasks', payload);
      toast.success(ui('تم حفظ المهمة'));
      setFormOpen(false);
      void refetch();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const openAction = (row: TaskRow, decision: 'accepted' | 'refused') => {
    setActionRow(row);
    setActionDecision(decision);
    setActionNotes('');
    setActionOpen(true);
  };

  const submitAction = async () => {
    if (!actionRow) return;
    try {
      await api.post(`/tasks/${actionRow.id}/action`, {
        decision: actionDecision,
        notes: actionNotes.trim() || undefined,
      });
      toast.success(actionDecision === 'accepted' ? ui('تم قبول المهمة') : ui('تم رفض المهمة'));
      setActionOpen(false);
      void refetch();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const columns: ColumnDef<TaskRow>[] = [
    {
      accessorKey: 'rkm',
      header: ui('الرقم'),
      cell: ({ getValue }) => {
        const v = getValue() as number | null | undefined;
        return <span className="nums">{v != null ? toArabicDigits(v) : '—'}</span>;
      },
    },
    { accessorKey: 'empName', header: ui('الموظف'), cell: ({ getValue }) => (getValue() as string) || '—' },
    {
      accessorKey: 'details',
      header: ui('التفاصيل'),
      cell: ({ getValue }) => {
        const v = (getValue() as string) || '';
        return <span className="line-clamp-2 max-w-[24rem]">{v || '—'}</span>;
      },
    },
    {
      accessorKey: 'date',
      header: ui('التاريخ'),
      cell: ({ getValue }) => <DateText value={getValue() as string | undefined} />,
    },
    {
      accessorKey: 'decision',
      header: ui('القرار'),
      cell: ({ getValue }) => {
        const cfg = DECISION_BADGE[(getValue() as Decision) ?? 'wait'];
        return <StatusBadge status={cfg.status} label={cfg.label} />;
      },
    },
    {
      id: 'actions',
      header: ui('الإجراءات'),
      cell: ({ row }) => {
        const r = row.original;
        const pending = (r.decision ?? 'wait') === 'wait';
        return (
          <div className="flex gap-1">
            {pending && (
              <>
                <Button variant="ghost" size="icon" aria-label={ui('قبول')} onClick={() => openAction(r, 'accepted')}>
                  <CheckCircle2 className="size-4 text-success" />
                </Button>
                <Button variant="ghost" size="icon" aria-label={ui('رفض')} onClick={() => openAction(r, 'refused')}>
                  <XCircle className="size-4 text-destructive" />
                </Button>
              </>
            )}
            <Button variant="ghost" size="icon" aria-label={ui('تعديل')} onClick={() => void openEdit(r)}>
              <Pencil className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={ui('حذف')}
              onClick={async () => {
                const ok = await confirm({
                  title: ui('حذف المهمة'),
                  description: ui('هل تريد حذف هذه المهمة وكل المكلّفين بها؟'),
                  confirmLabel: ui('حذف'),
                  variant: 'destructive',
                });
                if (ok) deleteMutation.mutate(r.id);
              }}
            >
              <Trash2 className="size-4 text-destructive" />
            </Button>
          </div>
        );
      },
    },
  ];

  return (
    <>
      <ListPageShell
        title={ui('المهام والمراسلات')}
        description={ui('مهام ومراسلات الموظفين مع المكلّفين بها')}
        searchPlaceholder={ui('بحث في التفاصيل أو الموظف…')}
        stats={stats}
        statsLoading={isLoading}
        isError={isError}
        error={error}
        actions={
          <Button variant="brand" size="sm" onClick={openCreate}>
            <Plus className="size-4" /> {ui('مهمة جديدة')}
          </Button>
        }
      >
        <div className="mb-4 max-w-xs">
          <Combobox
            value={params.filters.status ?? ''}
            onValueChange={(status) => setParams({ filters: { status }, page: 1 })}
            options={STATUS_FILTER}
            placeholder={ui('تصفية حسب القرار…')}
            aria-label={ui('تصفية حسب القرار')}
          />
        </div>
        <DataTable
          columns={columns}
          data={data?.data ?? []}
          total={data?.total ?? 0}
          page={params.page}
          pageSize={params.pageSize}
          onPageChange={(p) => setParams({ page: p })}
          onPageSizeChange={(s) => setParams({ pageSize: s, page: 1 })}
          isLoading={isLoading}
          isError={isError}
          onRetry={() => void refetch()}
          search={params.search}
          onSearchChange={(s) => setParams({ search: s, page: 1 })}
          emptyTitle={ui('لا توجد مهام')}
        />
      </ListPageShell>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent aria-describedby={undefined} className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editId ? ui('تعديل مهمة') : ui('مهمة جديدة')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{ui('الموظف')}</Label>
              <div className="mt-1.5">
                <Combobox
                  value={form.empId}
                  onValueChange={onPickEmployee}
                  options={empOptions}
                  placeholder={ui('اختر الموظف…')}
                  searchPlaceholder={ui('بحث في الموظفين…')}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="task-emp-name">{ui('اسم الموظف')}</Label>
              <Input
                id="task-emp-name"
                className="mt-1.5"
                value={form.empName}
                onChange={(e) => setForm((f) => ({ ...f, empName: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="task-edara">{ui('الإدارة')}</Label>
                <Input id="task-edara" className="mt-1.5" value={form.edara} onChange={(e) => setForm((f) => ({ ...f, edara: e.target.value }))} />
              </div>
              <div>
                <Label htmlFor="task-qesm">{ui('القسم')}</Label>
                <Input id="task-qesm" className="mt-1.5" value={form.qesm} onChange={(e) => setForm((f) => ({ ...f, qesm: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label htmlFor="task-details">{ui('التفاصيل')}</Label>
              <Textarea
                id="task-details"
                className="mt-1.5"
                value={form.details}
                onChange={(e) => setForm((f) => ({ ...f, details: e.target.value }))}
              />
            </div>
            <div>
              <div className="flex items-center justify-between">
                <Label>{ui('المكلّفون')}</Label>
                <Button type="button" variant="outline" size="sm" onClick={addMokalfa}>
                  <Plus className="size-4" /> {ui('إضافة مكلّف')}
                </Button>
              </div>
              <div className="mt-2 space-y-2">
                {mokalfat.length === 0 && <p className="text-sm text-muted-foreground">{ui('لا يوجد مكلّفون')}</p>}
                {mokalfat.map((m, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <Input
                      placeholder={ui('اسم المكلّف')}
                      value={m.name}
                      onChange={(e) => setMokalfaField(i, 'name', e.target.value)}
                    />
                    <Input
                      placeholder={ui('ملاحظات')}
                      value={m.notes}
                      onChange={(e) => setMokalfaField(i, 'notes', e.target.value)}
                    />
                    <Button type="button" variant="ghost" size="icon" aria-label={ui('حذف المكلّف')} onClick={() => removeMokalfa(i)}>
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>{ui('إلغاء')}</Button>
            <Button disabled={saving} onClick={() => void save()}>{ui('حفظ')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={actionOpen} onOpenChange={setActionOpen}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{actionDecision === 'accepted' ? ui('قبول المهمة') : ui('رفض المهمة')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {actionDecision === 'accepted'
                ? ui('سيتم تسجيل قبول هذه المهمة.')
                : ui('سيتم تسجيل رفض هذه المهمة.')}
            </p>
            <div>
              <Label htmlFor="task-action-notes">{ui('ملاحظات')}</Label>
              <Textarea
                id="task-action-notes"
                className="mt-1.5"
                value={actionNotes}
                onChange={(e) => setActionNotes(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActionOpen(false)}>{ui('إلغاء')}</Button>
            <Button
              variant={actionDecision === 'refused' ? 'destructive' : 'brand'}
              onClick={() => void submitAction()}
            >
              {actionDecision === 'accepted' ? ui('قبول') : ui('رفض')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
