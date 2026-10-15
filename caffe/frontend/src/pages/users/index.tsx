import type { ColumnDef } from '@tanstack/react-table';
import { KeyRound, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useMemo } from 'react';
import { DataTable } from '@/components/common/data-table';
import { ListPageShell } from '@/components/common/list-page-shell';
import { StatusBadge } from '@/components/common/status-badge';
import { Button } from '@/components/ui/button';
import { clientPaginate, useArrayResource } from '@/lib/api-hooks';
import { useListQuery } from '@/lib/use-list-query';
import { toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';

interface UserApiRow {
  user_id: number;
  username: string | null;
  name: string | null;
  level: number | null;
  level_label: string;
  approved: number | null;
}

interface UserRow {
  id: number;
  username: string;
  fullName: string;
  role: string;
  isActive: boolean;
}

function mapUser(row: UserApiRow): UserRow {
  return {
    id: row.user_id,
    username: row.username ?? '—',
    fullName: row.name ?? '—',
    role: row.level_label || '—',
    isActive: row.approved === 1,
  };
}

export function UsersPage() {
  const { ui } = useLocale();
  const { params, setParams } = useListQuery();
  const { data: rawUsers, isLoading, isError, error, refetch } = useArrayResource<UserApiRow>('users');

  const users = useMemo(() => (rawUsers ?? []).map(mapUser), [rawUsers]);

  const paged = useMemo(
    () =>
      clientPaginate(users, params, {
        search: (row, q) =>
          row.username.toLowerCase().includes(q) || row.fullName.toLowerCase().includes(q),
      }),
    [users, params],
  );

  const columns: ColumnDef<UserRow>[] = [
    {
      accessorKey: 'id',
      header: ui('م'),
      cell: ({ row }) => toArabicDigits((params.page - 1) * params.pageSize + row.index + 1),
    },
    { accessorKey: 'username', header: ui('اسم المستخدم') },
    { accessorKey: 'fullName', header: ui('الاسم الكامل') },
    { accessorKey: 'role', header: ui('الدور') },
    {
      accessorKey: 'isActive',
      header: ui('الحالة'),
      cell: ({ getValue }) => <StatusBadge status={getValue() ? 'active' : 'blocked'} />,
    },
    {
      id: 'actions',
      header: ui('الإجراءات'),
      cell: ({ row }) => (
        <div className="flex gap-1">
          <Button variant="outline" size="sm" asChild>
            <Link to={`/admin/exceptions?user=${row.original.id}`}>
              <KeyRound className="size-4" /> {ui('الصلاحيات')}
            </Link>
          </Button>
        </div>
      ),
    },
  ];

  const activeCount = useMemo(() => users.filter((u) => u.isActive).length, [users]);

  return (
    <ListPageShell
      eyebrow={ui('الإعدادات')}
      title={ui('المستخدمون')}
      description={ui('حسابات الدخول وصلاحيات الوصول للنظام — يُنشأ الحساب من الموارد البشرية عند تفعيل «إضافة إلى النظام» في نموذج الموظف')}
      isError={isError}
      error={error}
      notImplementedTitle={ui('المستخدمون قيد الإعداد على الخادم')}
      stats={[
        { title: ui('إجمالي المستخدمين'), value: users.length, icon: <Users className="size-5" />, colorIndex: 0 },
        { title: ui('نشطون'), value: activeCount, subtitle: ui('معتمدون للدخول'), colorIndex: 3 },
      ]}
      statsLoading={isLoading}
      searchPlaceholder={ui('بحث بالاسم أو اسم المستخدم…')}
    >
      <DataTable
        columns={columns}
        data={paged.data}
        total={paged.total}
        page={params.page}
        pageSize={params.pageSize}
        onPageChange={(p) => setParams({ page: p })}
        onPageSizeChange={(s) => setParams({ pageSize: s, page: 1 })}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => void refetch()}
        search={params.search}
        onSearchChange={(s) => setParams({ search: s, page: 1 })}
        emptyTitle={ui('لا يوجد مستخدمون')}
      />
    </ListPageShell>
  );
}
