import type { ColumnDef } from '@tanstack/react-table';
import { Banknote, CalendarDays, Clock3, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useMemo } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DataTable } from '@/components/common/data-table';
import { FilterBar, type FilterField } from '@/components/common/filter-bar';
import { ListStatusTabs } from '@/components/common/list-status-tabs';
import { PageHeader } from '@/components/common/page-header';
import { StatusBadge } from '@/components/common/status-badge';
import { NotImplementedState } from '@/components/common/states';
import { api } from '@/lib/api';
import { confirm } from '@/lib/confirm';
import { isNotImplemented, usePaginatedList } from '@/lib/api-hooks';
import { useListQuery } from '@/lib/use-list-query';
import type { EmployeeListItem } from '@/types/employees';
import { toArabicDigits } from '@/lib/utils';
import { queryClient } from '@/lib/query';
import { useLocale } from '@/store/locale';
import { uiStatic } from '@/lib/ui-static';

const EMPLOYEE_STATUS_TABS = [
  { value: '', label: uiStatic('كل الموظفين') },
  { value: '1', label: uiStatic('الموظفون النشطون') },
  { value: '2', label: uiStatic('الموظفون غير النشطين') },
];

export function EmployeesListPage() {
  const { ui } = useLocale();
  const { params, setParams } = useListQuery();
  const { data, isLoading, isError, error, refetch } = usePaginatedList<EmployeeListItem>('employees', params);

  const filters: FilterField[] = [
    { key: 'emp_type', label: ui('النوع'), type: 'select', options: [{ value: '1', label: ui('رجالى') }, { value: '2', label: ui('حريمى') }] },
  ];
  const selectedStatus = params.filters.status;
  const pageTitle = ui('قائمة الموظفين');
  const pageDescription = selectedStatus === '1'
    ? ui('عرض وإدارة ملفات الموظفين النشطين')
    : selectedStatus === '2'
      ? ui('عرض وإدارة ملفات الموظفين غير النشطين')
      : ui('عرض وإدارة جميع ملفات الموظفين');

  const toggleStatus = async (row: EmployeeListItem) => {
    if (row.employee_type === 0) return;
    const toSuspended = row.employee_type === 1;
    const ok = await confirm({
      title: toSuspended ? ui('تغيير لموقوف؟') : ui('تغيير لنشط؟'),
      variant: 'destructive',
    });
    if (!ok) return;
    try {
      await api.patch(`/employees/${row.id}/status`, { employee_type: toSuspended ? 2 : 1 });
      toast.success(ui('تم تحديث الحالة'));
      void queryClient.invalidateQueries({ queryKey: ['employees'] });
    } catch {
      toast.error(ui('تعذّر تحديث الحالة'));
    }
  };

  const deleteEmployee = async (id: number) => {
    const ok = await confirm({ title: ui('حذف الموظف؟'), description: ui('لا يمكن التراجع عن هذا الإجراء.'), variant: 'destructive', confirmLabel: ui('حذف') });
    if (!ok) return;
    try {
      await api.delete(`/employees/${id}`);
      toast.success(ui('تم الحذف'));
      void queryClient.invalidateQueries({ queryKey: ['employees'] });
    } catch {
      toast.error(ui('تعذّر الحذف'));
    }
  };

  const columns = useMemo<ColumnDef<EmployeeListItem>[]>(
    () => [
      {
        id: 'index',
        header: ui('م'),
        cell: ({ row }) => toArabicDigits((params.page - 1) * params.pageSize + row.index + 1),
      },
      { accessorKey: 'emp_code', header: ui('كود الموظف'), cell: ({ getValue }) => <span className="nums">{toArabicDigits(getValue() as number)}</span> },
      { accessorKey: 'employee', header: ui('إسم الموظف') },
      { accessorKey: 'edara_n', header: ui('الادارة'), cell: ({ getValue }) => getValue() ?? '—' },
      { accessorKey: 'phone', header: ui('رقم الجوال'), cell: ({ getValue }) => <span className="nums">{getValue() ? toArabicDigits(getValue() as string) : '—'}</span> },
      { accessorKey: 'card_num', header: ui('رقم الهوية'), cell: ({ getValue }) => <span className="nums">{getValue() ? toArabicDigits(getValue() as string) : '—'}</span> },
      {
        accessorKey: 'mosma_wazefy_n',
        header: ui('الوظيفة'),
        cell: ({ getValue }) =>
          getValue() ? (
            <span className="rounded-full bg-success/15 px-2 py-0.5 text-xs text-success">{getValue() as string}</span>
          ) : (
            '—'
          ),
      },
      {
        accessorKey: 'employee_type',
        header: ui('الحالة'),
        cell: ({ row }) => {
          const t = row.original.employee_type;
          const status = t === 1 ? 'active' : t === 2 ? 'suspended' : 'unset';
          return (
            <button type="button" onClick={() => void toggleStatus(row.original)} disabled={t === 0} className="disabled:cursor-default">
              <StatusBadge status={status} />
            </button>
          );
        },
      },
      {
        id: 'actions',
        header: ui('الإجراءات'),
        cell: ({ row }) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label={ui('إجراءات')}>
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link to={`/employees/${row.original.id}/edit`}>
                  <Pencil className="size-4" /> {ui('تعديل')}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to={`/employees/${row.original.id}/finance`}>
                  <Banknote className="size-4" /> {ui('البيانات المالية')}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to={`/employees/${row.original.id}/attendance`}>
                  <Clock3 className="size-4" /> {ui('بيانات الدوام')}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to={`/employees/${row.original.id}/weekly-leave`}>
                  <CalendarDays className="size-4" /> {ui('إجازات الموظف')}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive" onSelect={() => void deleteEmployee(row.original.id)}>
                <Trash2 className="size-4" /> {ui('حذف')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ],
    [params.page, params.pageSize],
  );

  if (isError && isNotImplemented(error)) {
    return (
      <div>
        <PageHeader title={pageTitle} actions={<Button asChild><Link to="/employees/new"><Plus />{ui('موظف جديد')}</Link></Button>} />
        <NotImplementedState title={ui('قائمة الموظفين قيد الإعداد على الخادم')} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={pageTitle}
        description={pageDescription}
        actions={
          <Button variant="brand" asChild>
            <Link to="/employees/new">
              <Plus /> {ui('موظف جديد')}
            </Link>
          </Button>
        }
      />
      <ListStatusTabs tabs={EMPLOYEE_STATUS_TABS} />
      <FilterBar fields={filters} searchPlaceholder={ui('بحث بالاسم، الكود، الجوال، الإدارة…')} />
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
        emptyTitle={ui('لا يوجد موظفون')}
        emptyAction={
          <Button asChild>
            <Link to="/employees/new">{ui('إضافة موظف')}</Link>
          </Button>
        }
      />
    </div>
  );
}
