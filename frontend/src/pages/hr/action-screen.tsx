import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Monitor, Pencil, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Combobox } from '@/components/common/combobox';
import { DataTable } from '@/components/common/data-table';
import { DateText } from '@/components/common/formatters';
import { ListPageShell } from '@/components/common/list-page-shell';
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
import { useEmployeeOptions } from '@/hooks/use-employee-options';
import { api, apiError } from '@/lib/api';
import { useMutationWithToast, usePaginatedList } from '@/lib/api-hooks';
import { confirm } from '@/lib/confirm';
import { useListQuery } from '@/lib/use-list-query';
import { toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';

interface ActionScreenRow {
  id: number;
  title?: string;
  employeeName?: string;
  personCode?: string;
  jobTitleCode?: number;
  fromDate?: string;
  toDate?: string;
}

interface GradeRow {
  id: number;
  code?: number | null;
  title?: string | null;
}

function parseEmpCode(label: string): string {
  const match = label.match(/\(([^)]+)\)/);
  return match?.[1]?.trim() ?? '';
}

export function HrActionScreenPage() {
  const { ui } = useLocale();
  const { params, setParams } = useListQuery();
  const { data, isLoading, isError, error, refetch } = usePaginatedList<ActionScreenRow>('hr/action-screen', params);
  const { data: employeeOptions = [] } = useEmployeeOptions();

  const { data: grades = [] } = useQuery({
    queryKey: ['hr/action-screen', 'grades'],
    queryFn: async () => {
      const { data: rows } = await api.get<GradeRow[]>('/hr/action-screen/grades');
      return rows;
    },
    staleTime: 60_000,
  });

  const jobTitleOptions = useMemo(
    () =>
      grades
        .filter((g) => g.title)
        .map((g) => ({
          value: String(g.code ?? g.id),
          label: g.title ?? '—',
        })),
    [grades],
  );

  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({
    personName: '',
    jobTitleCodeFk: '',
    personCode: '',
    fromDate: '',
    toDate: '',
  });
  const [saving, setSaving] = useState(false);

  const deleteMutation = useMutationWithToast(
    (id: number) => api.delete(`/hr/action-screen/${id}`),
    { success: ui('تم حذف إعداد الإجراء'), invalidate: ['hr/action-screen'] },
  );

  const openCreate = () => {
    setEditId(null);
    setForm({ personName: '', jobTitleCodeFk: '', personCode: '', fromDate: '', toDate: '' });
    setFormOpen(true);
  };

  const openEdit = (row: ActionScreenRow) => {
    setEditId(row.id);
    setForm({
      personName: row.title ?? '',
      jobTitleCodeFk: row.jobTitleCode != null ? String(row.jobTitleCode) : '',
      personCode: row.personCode ?? '',
      fromDate: row.fromDate ?? '',
      toDate: row.toDate ?? '',
    });
    setFormOpen(true);
  };

  const onEmployeeSelect = (empId: string) => {
    const opt = employeeOptions.find((o) => o.value === empId);
    const name = opt?.label.split(' (')[0]?.trim() ?? '';
    const code = opt ? parseEmpCode(opt.label) : '';
    setForm((f) => ({ ...f, personName: name, personCode: code }));
  };

  const selectedEmpId = useMemo(() => {
    if (!form.personCode) return '';
    const match = employeeOptions.find((o) => parseEmpCode(o.label) === form.personCode);
    return match?.value ?? '';
  }, [employeeOptions, form.personCode]);

  const save = async () => {
    if (!form.personName.trim() || !form.jobTitleCodeFk || !form.fromDate || !form.toDate) {
      toast.error(ui('يرجى تعبئة الاسم والمسمى الوظيفي وتواريخ الفترة'));
      return;
    }
    setSaving(true);
    try {
      const payload = {
        personName: form.personName,
        jobTitleCodeFk: Number(form.jobTitleCodeFk),
        personType: 1,
        personCode: form.personCode || '0',
        fromDate: form.fromDate,
        toDate: form.toDate,
      };
      if (editId) {
        await api.patch(`/hr/action-screen/${editId}`, {
          personName: payload.personName,
          jobTitleCodeFk: payload.jobTitleCodeFk,
          personCode: payload.personCode,
          fromDate: payload.fromDate,
          toDate: payload.toDate,
        });
      } else {
        await api.post('/hr/action-screen', payload);
      }
      toast.success(ui('تم حفظ إعداد الإجراء'));
      setFormOpen(false);
      void refetch();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (row: ActionScreenRow) => {
    const ok = await confirm({
      title: ui('حذف إعداد الإجراء'),
      description: `${ui('هل تريد حذف «')}${row.title ?? ui('هذا الإجراء')}${ui('»؟')}`,
      confirmLabel: ui('حذف'),
      variant: 'destructive',
    });
    if (ok) deleteMutation.mutate(row.id);
  };

  const columns: ColumnDef<ActionScreenRow>[] = [
    {
      accessorKey: 'id',
      header: ui('م'),
      cell: ({ row }) => toArabicDigits((params.page - 1) * params.pageSize + row.index + 1),
    },
    { accessorKey: 'title', header: ui('الاسم'), cell: ({ getValue }) => getValue() ?? '—' },
    { accessorKey: 'employeeName', header: ui('المسمى الوظيفي'), cell: ({ getValue }) => getValue() ?? '—' },
    {
      accessorKey: 'fromDate',
      header: ui('من تاريخ'),
      cell: ({ getValue }) => <DateText value={getValue() as string | undefined} />,
    },
    {
      accessorKey: 'toDate',
      header: ui('إلى تاريخ'),
      cell: ({ getValue }) => <DateText value={getValue() as string | undefined} />,
    },
    {
      id: 'actions',
      header: ui('الإجراءات'),
      cell: ({ row }) => (
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" aria-label={ui('تعديل')} onClick={() => openEdit(row.original)}>
            <Pencil className="size-4" />
          </Button>
          <Button variant="ghost" size="icon" aria-label={ui('حذف')} onClick={() => void handleDelete(row.original)}>
            <Trash2 className="size-4 text-destructive" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <ListPageShell
        title={ui('شاشة الإجراء')}
        description={ui('إعدادات المسؤولين والمسميات الوظيفية للإجراءات')}
        searchPlaceholder={ui('بحث بالاسم أو المسمى…')}
        isError={isError}
        error={error}
        notImplementedTitle={ui('شاشة الإجراء — قيد الإعداد على الخادم')}
        actions={
          <Button variant="brand" size="sm" onClick={openCreate}>
            <Plus className="size-4" /> {ui('إجراء جديد')}
          </Button>
        }
        stats={[
          {
            title: ui('إجمالي الإجراءات'),
            value: data?.total ?? 0,
            subtitle: ui('مسؤولون ومعيّنون نشطون'),
            icon: <Monitor className="size-5" />,
          },
        ]}
        statsLoading={isLoading}
      >
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
          emptyTitle={ui('لا توجد إجراءات مسجّلة')}
        />
      </ListPageShell>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent size="lg" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{editId ? ui('تعديل إجراء') : ui('إجراء جديد')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="as-emp">{ui('الموظف')}</Label>
              <Combobox
                id="as-emp"
                className="mt-1.5"
                value={selectedEmpId}
                onValueChange={onEmployeeSelect}
                options={employeeOptions}
                placeholder={ui('اختر الموظف…')}
                searchPlaceholder={ui('بحث بالاسم أو الكود…')}
              />
            </div>
            <div>
              <Label htmlFor="as-name">{ui('الاسم')}</Label>
              <Input
                id="as-name"
                className="mt-1.5"
                value={form.personName}
                onChange={(e) => setForm((f) => ({ ...f, personName: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="as-job">{ui('المسمى الوظيفي')}</Label>
              <Combobox
                id="as-job"
                className="mt-1.5"
                value={form.jobTitleCodeFk}
                onValueChange={(v) => setForm((f) => ({ ...f, jobTitleCodeFk: v }))}
                options={jobTitleOptions}
                placeholder={ui('اختر المسمى…')}
                searchPlaceholder={ui('بحث في المسميات…')}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="as-from">{ui('من تاريخ')}</Label>
                <Input
                  id="as-from"
                  type="date"
                  className="mt-1.5 nums"
                  value={form.fromDate}
                  onChange={(e) => setForm((f) => ({ ...f, fromDate: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="as-to">{ui('إلى تاريخ')}</Label>
                <Input
                  id="as-to"
                  type="date"
                  className="mt-1.5 nums"
                  value={form.toDate}
                  onChange={(e) => setForm((f) => ({ ...f, toDate: e.target.value }))}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>
              {ui('إلغاء')}
            </Button>
            <Button onClick={() => void save()} disabled={saving}>
              {ui('حفظ')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
