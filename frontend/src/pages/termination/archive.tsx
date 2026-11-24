import type { ColumnDef } from '@tanstack/react-table';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { AlertTriangle, Archive, LogOut, Pencil, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Combobox } from '@/components/common/combobox';
import {
  EXIT_TYPES,
  EXIT_TYPE_LABELS,
  EmployeeExitDialog,
  ExitTypeBadge,
  type EmployeeExit,
} from '@/components/employees/employee-exit-dialog';
import type { PaginatedResponse } from '@/components/common/data-table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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

/** Structured exits (ترك العمل / استقالة / إنهاء خدمة …) with a filter by exit type. */
function ExitsTab({ search, openCreate }: { search: string; openCreate: () => void }) {
  const { ui } = useLocale();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [exitType, setExitType] = useState<string>('all');
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['termination/exits', { page, pageSize, exitType, search }],
    queryFn: async ({ signal }) =>
      (
        await api.get<PaginatedResponse<EmployeeExit>>('/termination/exits', {
          params: { page, pageSize, ...(search ? { search } : {}), ...(exitType !== 'all' ? { exitType } : {}) },
          signal,
        })
      ).data,
    placeholderData: keepPreviousData,
  });

  const columns: ColumnDef<EmployeeExit>[] = [
    { id: 'serial', header: ui('م'), cell: ({ row }) => toArabicDigits((page - 1) * pageSize + row.index + 1) },
    { accessorKey: 'employeeName', header: ui('الموظف') },
    {
      accessorKey: 'exitType',
      header: ui('نوع انتهاء الخدمة'),
      cell: ({ row }) => <ExitTypeBadge type={row.original.exitType} />,
    },
    {
      accessorKey: 'noticeGivenDate',
      header: ui('تاريخ الإخطار'),
      cell: ({ getValue }) => (getValue() ? <DateText value={getValue() as string} /> : ui('بدون إخطار')),
    },
    {
      accessorKey: 'lastWorkingDate',
      header: ui('آخر يوم عمل'),
      cell: ({ getValue }) => <DateText value={getValue() as string} />,
    },
    {
      accessorKey: 'noticeShortfallDays',
      header: ui('أيام الإخطار الناقصة'),
      cell: ({ row }) =>
        row.original.noticeShortfallDays > 0 ? (
          <span className="inline-flex items-center gap-1 text-destructive nums">
            <AlertTriangle className="size-3.5" /> {toArabicDigits(row.original.noticeShortfallDays)}
          </span>
        ) : (
          <span className="nums">{toArabicDigits(0)}</span>
        ),
    },
    { accessorKey: 'reason', header: ui('السبب'), cell: ({ getValue }) => (getValue() as string | null) || '—' },
    {
      accessorKey: 'settlementNotes',
      header: ui('ملاحظات التسوية'),
      cell: ({ getValue }) => (getValue() as string | null) || '—',
    },
    { accessorKey: 'recordedByName', header: ui('سجّلها'), cell: ({ getValue }) => (getValue() as string | null) || '—' },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Select
          value={exitType}
          onValueChange={(v) => {
            setExitType(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="h-10 w-64" aria-label={ui('نوع انتهاء الخدمة')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{ui('كل أنواع انتهاء الخدمة')}</SelectItem>
            {EXIT_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {ui(EXIT_TYPE_LABELS[t])}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="brand" size="sm" onClick={openCreate}>
          <LogOut className="size-4" /> {ui('تسجيل انتهاء خدمة')}
        </Button>
      </div>
      <DataTable
        columns={columns}
        data={data?.data ?? []}
        total={data?.total ?? 0}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(s) => {
          setPageSize(s);
          setPage(1);
        }}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => void refetch()}
        emptyTitle={ui('لا توجد سجلات انتهاء خدمة')}
      />
    </div>
  );
}

interface ArchiveRow {
  id: number;
  title?: string;
  employeeName?: string;
  createdAt?: string;
}

export function ArchivePage() {
  const { ui } = useLocale();
  const { params, setParams } = useListQuery();
  const { data, isLoading, isError, error, refetch } = usePaginatedList<ArchiveRow>('termination/archive', params);
  const { data: empOptions = [] } = useEmployeeOptions();

  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({ empId: '', fromDate: '', toDate: '' });
  const [exitOpen, setExitOpen] = useState(false);

  const deleteMutation = useMutationWithToast(
    (id: number) => api.delete(`/termination/archive/${id}`),
    { success: ui('تم حذف السجل'), invalidate: ['termination/archive'] },
  );

  const stats = useMemo(
    () => [{ title: ui('سجلات طي القيد'), value: toArabicDigits(data?.total ?? 0), icon: <Archive className="size-5" /> }],
    [data],
  );

  const openCreate = () => {
    setEditId(null);
    setForm({ empId: '', fromDate: '', toDate: '' });
    setFormOpen(true);
  };

  const openEdit = async (row: ArchiveRow) => {
    setEditId(row.id);
    setForm({ empId: '', fromDate: row.title ?? '', toDate: row.createdAt ?? '' });
    setFormOpen(true);
    try {
      const { data: detail } = await api.get<{ empId?: number; fromDate?: string; toDate?: string }>(`/termination/archive/${row.id}`);
      setForm({
        empId: detail.empId != null ? String(detail.empId) : '',
        fromDate: detail.fromDate ?? row.title ?? '',
        toDate: detail.toDate ?? row.createdAt ?? '',
      });
    } catch {
      /* keep list row values */
    }
  };

  const save = async () => {
    if (!form.empId || !form.fromDate || !form.toDate) {
      toast.error(ui('يرجى تعبئة جميع الحقول المطلوبة'));
      return;
    }
    try {
      const payload = {
        empId: parseInt(form.empId, 10),
        fromDate: form.fromDate,
        toDate: form.toDate,
      };
      if (editId) await api.patch(`/termination/archive/${editId}`, payload);
      else await api.post('/termination/archive', payload);
      toast.success(editId ? ui('تم تحديث السجل') : ui('تم إضافة السجل'));
      setFormOpen(false);
      void refetch();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const columns: ColumnDef<ArchiveRow>[] = [
    {
      accessorKey: 'id',
      header: ui('م'),
      cell: ({ row }) => toArabicDigits((params.page - 1) * params.pageSize + row.index + 1),
    },
    { accessorKey: 'employeeName', header: ui('الموظف') },
    {
      accessorKey: 'title',
      header: ui('من تاريخ'),
      cell: ({ getValue }) => <DateText value={getValue() as string | undefined} />,
    },
    {
      accessorKey: 'createdAt',
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
          <Button
            variant="ghost"
            size="icon"
            aria-label={ui('حذف')}
            onClick={async () => {
              const ok = await confirm({
                title: ui('حذف سجل طي القيد'),
                description: ui('هل تريد حذف هذا السجل؟'),
                confirmLabel: ui('حذف'),
                variant: 'destructive',
              });
              if (ok) deleteMutation.mutate(row.original.id);
            }}
          >
            <Trash2 className="size-4 text-destructive" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <ListPageShell
        title={ui('طي القيد')}
        description={ui('انتهاء خدمة الموظفين (استقالة، ترك عمل، إنهاء خدمة…) وأرشيف طي القيد')}
        searchPlaceholder={ui('بحث باسم الموظف أو التاريخ…')}
        stats={stats}
        statsLoading={isLoading}
        isError={isError}
        error={error}
      >
        <Tabs defaultValue="exits">
          <TabsList className="mb-4">
            <TabsTrigger value="exits">{ui('انتهاء الخدمة')}</TabsTrigger>
            <TabsTrigger value="archive">{ui('طي القيد')}</TabsTrigger>
          </TabsList>
          <TabsContent value="exits">
            <ExitsTab search={params.search} openCreate={() => setExitOpen(true)} />
          </TabsContent>
          <TabsContent value="archive" className="space-y-3">
            <div className="flex justify-end">
              <Button variant="brand" size="sm" onClick={openCreate}>
                <Plus className="size-4" /> {ui('سجل جديد')}
              </Button>
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
              emptyTitle={ui('لا توجد سجلات')}
            />
          </TabsContent>
        </Tabs>
      </ListPageShell>

      <EmployeeExitDialog open={exitOpen} onOpenChange={setExitOpen} />

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{editId ? ui('تعديل سجل طي القيد') : ui('سجل طي قيد جديد')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{ui('الموظف')}</Label>
              <div className="mt-1.5">
                <Combobox
                  value={form.empId}
                  onValueChange={(empId) => setForm((f) => ({ ...f, empId }))}
                  options={empOptions}
                  placeholder={ui('اختر الموظف…')}
                  searchPlaceholder={ui('بحث في الموظفين…')}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="arch-from">{ui('من تاريخ')}</Label>
              <Input id="arch-from" type="date" className="mt-1.5" value={form.fromDate} onChange={(e) => setForm((f) => ({ ...f, fromDate: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="arch-to">{ui('إلى تاريخ')}</Label>
              <Input id="arch-to" type="date" className="mt-1.5" value={form.toDate} onChange={(e) => setForm((f) => ({ ...f, toDate: e.target.value }))} />
            </div>
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
