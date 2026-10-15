import type { ColumnDef } from '@tanstack/react-table';
import { Eye, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { DataTable } from '@/components/common/data-table';
import { DateText, Money } from '@/components/common/formatters';
import { FilterBar } from '@/components/common/filter-bar';
import { PageHeader } from '@/components/common/page-header';
import { StatusBadge } from '@/components/common/status-badge';
import { NotImplementedState } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api, apiError } from '@/lib/api';
import { isNotImplemented, useMutationWithToast, usePaginatedList } from '@/lib/api-hooks';
import { confirm } from '@/lib/confirm';
import { useListQuery } from '@/lib/use-list-query';
import { toArabicDigits, formatDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';
import { usePermission } from '@/hooks/use-permission';

interface PayrollRunRow {
  id: number;
  title?: string;
  month?: string;
  year?: number;
  totalAmount?: number;
  status?: string;
  createdAt?: string;
}

export function PayrollRunsPage() {
  const { ui } = useLocale();
  const { can } = usePermission();
  const canCreate = can('payroll.runs:create');
  const canDelete = can('payroll.runs:delete');
  const navigate = useNavigate();
  const now = new Date();
  const [createOpen, setCreateOpen] = useState(false);
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [creating, setCreating] = useState(false);
  const { params, setParams } = useListQuery();
  const { data, isLoading, isError, error, refetch } = usePaginatedList<PayrollRunRow>('payroll/runs', params);

  const deleteMutation = useMutationWithToast(
    (id: number) => api.delete(`/payroll/runs/${id}`),
    { success: ui('تم حذف المرتبات'), invalidate: ['payroll/runs'] },
  );

  const handleDelete = async (row: PayrollRunRow) => {
    if (!canDelete) return;
    const ok = await confirm({
      title: ui('حذف المرتبات الشهرية'),
      description: `${ui('هل تريد حذف مرتبات شهر «')}${row.title ?? row.month ?? ui('هذه المرتبات')}${ui('»؟')}`,
      confirmLabel: ui('حذف'),
      variant: 'destructive',
    });
    if (ok) deleteMutation.mutate(row.id);
  };

  const createRun = async () => {
    if (!canCreate) return;
    setCreating(true);
    try {
      const { data: created } = await api.post<{ id: number }>('/payroll/runs', { month, year });
      toast.success(ui('تم إنشاء المرتبات الشهرية'));
      setCreateOpen(false);
      navigate(`/payroll/runs/${created.id}`);
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setCreating(false);
    }
  };

  const columns: ColumnDef<PayrollRunRow>[] = [
    {
      accessorKey: 'id',
      header: ui('م'),
      cell: ({ row }) => toArabicDigits((params.page - 1) * params.pageSize + row.index + 1),
    },
    {
      accessorKey: 'title',
      header: ui('المرتبات'),
      cell: ({ row }) => (
        <Link to={`/payroll/runs/${row.original.id}`} className="font-medium text-primary hover:underline">
          {row.original.title ?? row.original.month ?? `${ui('مرتبات شهر')} ${formatDigits(row.original.id)}`}
        </Link>
      ),
    },
    {
      accessorKey: 'month',
      header: ui('الشهر'),
      cell: ({ row }) => {
        const m = row.original.month;
        const y = row.original.year;
        if (m && y) return <span className="nums">{m} {toArabicDigits(y)}</span>;
        return m ?? '—';
      },
    },
    {
      accessorKey: 'totalAmount',
      header: ui('الإجمالي'),
      cell: ({ getValue }) => <Money value={getValue() as number | undefined} />,
    },
    {
      accessorKey: 'status',
      header: ui('الحالة'),
      cell: ({ getValue }) => {
        const s = getValue() as string | undefined;
        const key =
          s === 'completed' || s === 'banked' || s === 'posted' || s === 'paid'
            ? 'paid'
            : s === 'approved'
              ? 'approved'
              : s === 'rejected'
                ? 'rejected'
                : 'pending';
        const labels: Record<string, string> = {
          draft: ui('مسودة'),
          computed: ui('محتسبة'),
          reviewing: ui('قيد المراجعة'),
          approved: ui('معتمدة'),
          posted: ui('مرحّلة'),
          banked: ui('ملف البنك'),
          completed: ui('مكتملة'),
        };
        return <StatusBadge status={key} label={s ? labels[s] ?? s : undefined} />;
      },
    },
    {
      accessorKey: 'createdAt',
      header: ui('تاريخ الإنشاء'),
      cell: ({ getValue }) => <DateText value={getValue() as string | undefined} />,
    },
    {
      id: 'actions',
      header: ui('الإجراءات'),
      cell: ({ row }) => (
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" asChild>
            <Link to={`/payroll/runs/${row.original.id}`}>
              <Eye className="size-4" /> {ui('عرض')}
            </Link>
          </Button>
          {canDelete ? <Button variant="ghost" size="icon" aria-label={ui('حذف')} onClick={() => void handleDelete(row.original)}>
            <Trash2 className="size-4 text-destructive" />
          </Button> : null}
        </div>
      ),
    },
  ];

  if (isError && isNotImplemented(error)) {
    return (
      <div>
        <PageHeader title={ui('المرتبات الشهرية')} />
        <NotImplementedState title={ui('المرتبات الشهرية قيد الإعداد على الخادم')} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={ui('المرتبات الشهرية')}
        description={ui('إنشاء ومراجعة المرتبات الشهرية الشهرية')}
        actions={canCreate ? (
          <Button variant="brand" size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" /> {ui('مرتبات شهر جديدة')}
          </Button>
        ) : undefined}
      />
      <FilterBar
        searchPlaceholder={ui('بحث في شهور المرتبات…')}
        fields={[
          {
            key: 'status',
            label: ui('الحالة'),
            type: 'select',
            options: [
              { value: 'draft', label: ui('مسودة') },
              { value: 'computed', label: ui('محتسبة') },
              { value: 'reviewing', label: ui('قيد المراجعة') },
              { value: 'approved', label: ui('معتمدة') },
              { value: 'posted', label: ui('مرحّلة') },
              { value: 'banked', label: ui('ملف البنك') },
              { value: 'completed', label: ui('مكتملة') },
            ],
          },
        ]}
      />
      <DataTable
        exportSource={{ resource: 'payroll/runs', params }}
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
        emptyTitle={ui('لا توجد شهور مرتبات رواتب')}
      />
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent size="sm">
          <DialogHeader><DialogTitle>{ui('مرتبات شهرية جديدة')}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2"><Label>{ui('الشهر')}</Label><Input type="number" min={1} max={12} value={month} onChange={(event) => setMonth(Number(event.target.value))} /></div>
            <div className="grid gap-2"><Label>{ui('السنة')}</Label><Input type="number" min={2000} value={year} onChange={(event) => setYear(Number(event.target.value))} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setCreateOpen(false)}>{ui('إلغاء')}</Button>{canCreate ? <Button variant="brand" disabled={creating || month < 1 || month > 12 || year < 2000} onClick={() => void createRun()}>{creating ? ui('جاري الإنشاء…') : ui('إنشاء')}</Button> : null}</DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
