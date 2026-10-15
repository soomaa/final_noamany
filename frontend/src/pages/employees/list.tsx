import type { ColumnDef } from '@tanstack/react-table';
import { MoreHorizontal, Pencil, Plus, Trash2, User } from 'lucide-react';
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
import { PageHeader } from '@/components/common/page-header';
import { StatusBadge } from '@/components/common/status-badge';
import { NotImplementedState } from '@/components/common/states';
import { api } from '@/lib/api';
import { confirm } from '@/lib/confirm';
import { isNotImplemented, usePaginatedList } from '@/lib/api-hooks';
import { useListQuery } from '@/lib/use-list-query';
import type { EmployeeListItem } from '@/types/employees';
import { toArabicDigits, formatDigits } from '@/lib/utils';
import { queryClient } from '@/lib/query';
import { useLocale } from '@/store/locale';
import { uiStatic } from '@/lib/ui-static';
import { usePermission } from '@/hooks/use-permission';

const STATUS_OPTIONS = [
  { value: '1', label: uiStatic('نشط') },
  { value: '2', label: uiStatic('موقوف') },
  { value: '0', label: uiStatic('لم يحدد') },
  { value: 'resigned', label: uiStatic('المستقيلون') },
];

export function EmployeesListPage() {
  const { ui } = useLocale();
  const { can } = usePermission();
  const canCreateEmployees = can('employees.list:create') || can('employees.new:create');
  const canUpdateEmployees = can('employees.list:update');
  const canDeleteEmployees = can('employees.list:delete');
  const { params, setParams } = useListQuery();
  const { data, isLoading, isError, error, refetch } = usePaginatedList<EmployeeListItem>('employees', params);

  const filters: FilterField[] = [
    { key: 'status', label: ui('الحالة'), type: 'select', options: STATUS_OPTIONS },
    { key: 'emp_type', label: ui('النوع'), type: 'select', options: [{ value: '1', label: ui('رجالى') }, { value: '2', label: ui('حريمى') }] },
  ];

  const toggleStatus = async (row: EmployeeListItem) => {
    if (!canUpdateEmployees || row.employee_type === 0) return;
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

  const isResignedList = params.filters.status === 'resigned';

  const restoreEmployee = async (id: number) => {
    if (!canUpdateEmployees) return;
    const ok = await confirm({ title: ui('استعادة الموظف؟'), confirmLabel: ui('استعادة') });
    if (!ok) return;
    try {
      await api.post(`/employees/${id}/restore`);
      toast.success(ui('تم استعادة الموظف'));
      void queryClient.invalidateQueries({ queryKey: ['employees'] });
    } catch {
      toast.error(ui('تعذّر الاستعادة'));
    }
  };

  const deleteEmployee = async (id: number) => {
    if (!canDeleteEmployees) return;
    const ok = await confirm({
      title: ui('إنهاء خدمة الموظف؟'),
      description: ui('سيتم طي القيد (leave_emp) واستبعاد الموظف من المسيرة. يمكن استعادته من قائمة المستقيلين.'),
      variant: 'destructive',
      confirmLabel: ui('إنهاء الخدمة'),
    });
    if (!ok) return;
    try {
      await api.delete(`/employees/${id}`);
      toast.success(ui('تم إنهاء الخدمة'));
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
      { accessorKey: 'emp_code', header: ui('كود الموظف'), cell: ({ getValue }) => <span className="nums">{formatDigits(getValue() as number)}</span> },
      { accessorKey: 'employee', header: ui('إسم الموظف') },
      { accessorKey: 'edara_n', header: ui('الادارة'), cell: ({ getValue }) => getValue() ?? '—' },
      { accessorKey: 'phone', header: ui('رقم الجوال'), cell: ({ getValue }) => <span className="nums">{getValue() ? formatDigits(getValue() as string) : '—'}</span> },
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
          if (!canUpdateEmployees || t === 0) {
            return <StatusBadge status={status} />;
          }
          return (
            <button type="button" onClick={() => void toggleStatus(row.original)} className="disabled:cursor-default">
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
              {canUpdateEmployees ? (
                <DropdownMenuItem asChild>
                  <Link to={`/employees/${row.original.id}/edit`}>
                    <Pencil className="size-4" /> {ui('تعديل')}
                  </Link>
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem asChild>
                <Link to={`/employees/${row.original.id}`}>
                  <User className="size-4" /> {ui('الملف')}
                </Link>
              </DropdownMenuItem>
              {isResignedList && canUpdateEmployees ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => void restoreEmployee(row.original.id)}>
                    <User className="size-4" /> {ui('استعادة')}
                  </DropdownMenuItem>
                </>
              ) : null}
              {!isResignedList && canDeleteEmployees ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-destructive" onSelect={() => void deleteEmployee(row.original.id)}>
                    <Trash2 className="size-4" /> {ui('إنهاء الخدمة')}
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ],
    [params.page, params.pageSize, canUpdateEmployees, canDeleteEmployees, isResignedList, ui],
  );

  if (isError && isNotImplemented(error)) {
    return (
      <div>
        <PageHeader
          title={ui('الموظفين')}
          actions={
            canCreateEmployees ? (
              <Button asChild>
                <Link to="/employees/new">
                  <Plus />
                  {ui('موظف جديد')}
                </Link>
              </Button>
            ) : undefined
          }
        />
        <NotImplementedState title={ui('قائمة الموظفين قيد الإعداد على الخادم')} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={ui('الموظفين')}
        description={isResignedList ? ui('الموظفون المنتهية خدمتهم — يمكن استعادتهم') : ui('إدارة بيانات الموظفين — القائمة النشطة')}
        actions={
          canCreateEmployees ? (
            <Button variant="brand" asChild>
              <Link to="/employees/new">
                <Plus /> {ui('موظف جديد')}
              </Link>
            </Button>
          ) : undefined
        }
      />
      <FilterBar fields={filters} searchPlaceholder={ui('بحث بالاسم، الكود، الجوال، الإدارة…')} />
      <DataTable
        exportSource={{ resource: 'employees', params }}
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
          canCreateEmployees ? (
            <Button asChild>
              <Link to="/employees/new">{ui('إضافة موظف')}</Link>
            </Button>
          ) : undefined
        }
      />
    </div>
  );
}
