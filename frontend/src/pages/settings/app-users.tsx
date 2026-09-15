import type { ColumnDef } from '@tanstack/react-table';
import { Pencil, Plus, Smartphone, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { DataTable } from '@/components/common/data-table';
import { ListPageShell } from '@/components/common/list-page-shell';
import { StatusBadge } from '@/components/common/status-badge';
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
import { api, apiError } from '@/lib/api';
import { useMutationWithToast, usePaginatedList } from '@/lib/api-hooks';
import { confirm } from '@/lib/confirm';
import { useListQuery } from '@/lib/use-list-query';
import { toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';

interface AppUserRow {
  id: number;
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  city?: string | null;
  status: number;
}

export function AppUsersPage() {
  const { ui } = useLocale();
  const { params, setParams } = useListQuery();
  const { data, isLoading, isError, error, refetch } = usePaginatedList<AppUserRow>(
    'app-users',
    params,
  );

  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    city: '',
    password: '',
  });

  const deleteMutation = useMutationWithToast(
    (id: number) => api.delete(`/app-users/${id}`),
    { success: ui('تم حذف المستخدم'), invalidate: ['app-users'] },
  );

  const statusMutation = useMutationWithToast(
    ({ id, status }: { id: number; status: number }) =>
      api.patch(`/app-users/${id}/status`, { status }),
    { success: ui('تم تحديث الحالة'), invalidate: ['app-users'] },
  );

  const stats = useMemo(
    () => [
      {
        title: ui('مستخدمو التطبيق'),
        value: toArabicDigits(data?.total ?? 0),
        icon: <Smartphone className="size-5" />,
      },
    ],
    [data],
  );

  const openCreate = () => {
    setEditId(null);
    setForm({ name: '', phone: '', email: '', city: '', password: '' });
    setFormOpen(true);
  };

  const openEdit = (row: AppUserRow) => {
    setEditId(row.id);
    setForm({
      name: row.name ?? '',
      phone: row.phone ?? '',
      email: row.email ?? '',
      city: row.city ?? '',
      password: '', // blank → keep existing password on save
    });
    setFormOpen(true);
  };

  const save = async () => {
    if (!form.name.trim() || !form.phone.trim() || !form.email.trim()) {
      toast.error(ui('الاسم والجوال والبريد مطلوبة'));
      return;
    }
    if (!editId && !form.password.trim()) {
      toast.error(ui('كلمة المرور مطلوبة'));
      return;
    }
    try {
      if (editId) {
        await api.patch(`/app-users/${editId}`, {
          name: form.name,
          phone: form.phone,
          email: form.email,
          city: form.city || undefined,
          password: form.password.trim() || undefined,
        });
      } else {
        await api.post('/app-users', {
          name: form.name,
          phone: form.phone,
          email: form.email,
          city: form.city || undefined,
          password: form.password,
        });
      }
      toast.success(ui('تم حفظ المستخدم'));
      setFormOpen(false);
      void refetch();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const toggleStatus = async (row: AppUserRow) => {
    const next = row.status === 1 ? 0 : 1;
    const ok = await confirm({
      title: next === 1 ? ui('تنشيط المستخدم') : ui('إلغاء تنشيط المستخدم'),
      description:
        next === 1
          ? ui('هل تريد تنشيط هذا المستخدم؟')
          : ui('هل تريد إلغاء تنشيط هذا المستخدم؟'),
      confirmLabel: next === 1 ? ui('تنشيط') : ui('إلغاء التنشيط'),
    });
    if (ok) statusMutation.mutate({ id: row.id, status: next });
  };

  const columns: ColumnDef<AppUserRow>[] = [
    {
      accessorKey: 'id',
      header: ui('م'),
      cell: ({ row }) =>
        toArabicDigits((params.page - 1) * params.pageSize + row.index + 1),
    },
    { accessorKey: 'name', header: ui('الاسم'), cell: ({ getValue }) => (getValue() as string) || '—' },
    {
      accessorKey: 'phone',
      header: ui('الجوال'),
      cell: ({ getValue }) => {
        const v = getValue() as string | null;
        return v ? <span className="nums">{toArabicDigits(v)}</span> : '—';
      },
    },
    {
      accessorKey: 'email',
      header: ui('البريد الإلكتروني'),
      cell: ({ getValue }) => (getValue() as string) || '—',
    },
    {
      accessorKey: 'status',
      header: ui('الحالة'),
      cell: ({ row }) => (
        <button
          type="button"
          aria-label={row.original.status === 1 ? ui('إلغاء التنشيط') : ui('تنشيط')}
          onClick={() => void toggleStatus(row.original)}
          className="cursor-pointer"
        >
          <StatusBadge
            status={row.original.status === 1 ? 'active' : 'suspended'}
            label={row.original.status === 1 ? ui('نشط') : ui('غير نشط')}
          />
        </button>
      ),
    },
    {
      id: 'actions',
      header: ui('الإجراءات'),
      cell: ({ row }) => (
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label={ui('تعديل')}
            onClick={() => openEdit(row.original)}
          >
            <Pencil className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={ui('حذف')}
            onClick={async () => {
              const ok = await confirm({
                title: ui('حذف المستخدم'),
                description: ui('هل تريد حذف هذا المستخدم؟'),
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
        title={ui('مستخدمو التطبيق')}
        description={ui('حسابات مستخدمي تطبيق الجوال')}
        searchPlaceholder={ui('بحث بالاسم أو الجوال أو البريد…')}
        stats={stats}
        statsLoading={isLoading}
        isError={isError}
        error={error}
        actions={
          <Button variant="brand" size="sm" onClick={openCreate}>
            <Plus className="size-4" /> {ui('مستخدم جديد')}
          </Button>
        }
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
          emptyTitle={ui('لا يوجد مستخدمون')}
        />
      </ListPageShell>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{editId ? ui('تعديل مستخدم') : ui('مستخدم جديد')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="app-user-name">{ui('الاسم')}</Label>
              <Input
                id="app-user-name"
                className="mt-1.5"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="app-user-phone">{ui('الجوال')}</Label>
                <Input
                  id="app-user-phone"
                  className="mt-1.5"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="app-user-city">{ui('المدينة')}</Label>
                <Input
                  id="app-user-city"
                  className="mt-1.5"
                  value={form.city}
                  onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="app-user-email">{ui('البريد الإلكتروني')}</Label>
              <Input
                id="app-user-email"
                type="email"
                className="mt-1.5"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="app-user-pass">
                {editId ? ui('كلمة المرور (اتركها فارغة للإبقاء عليها)') : ui('كلمة المرور')}
              </Label>
              <Input
                id="app-user-pass"
                type="password"
                className="mt-1.5"
                autoComplete="new-password"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>
              {ui('إلغاء')}
            </Button>
            <Button onClick={() => void save()}>{ui('حفظ')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
