import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { KeyRound, Pencil, Plus, Trash2, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Combobox } from '@/components/common/combobox';
import { DataTable } from '@/components/common/data-table';
import { ListPageShell } from '@/components/common/list-page-shell';
import { StatusBadge } from '@/components/common/status-badge';
import { AddAdminButton } from '@/components/users/add-admin-button';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useBranches } from '@/hooks/use-branches';
import { usePermission } from '@/hooks/use-permission';
import { api, apiError } from '@/lib/api';
import { clientPaginate, useArrayResource, useMutationWithToast } from '@/lib/api-hooks';
import { confirm } from '@/lib/confirm';
import { downloadExcel } from '@/lib/export';
import { fetchAllReportRows } from '@/lib/report-fetch';
import { useListQuery } from '@/lib/use-list-query';
import { isSystemAdminUser } from '@/lib/user-scope';
import { toArabicDigits } from '@/lib/utils';
import { EditExceptions } from '@/pages/admin/exceptions';
import { useAuth } from '@/store/auth';
import { useLocale } from '@/store/locale';
import type { EmployeeListItem } from '@/types/employees';

interface UserRow {
  user_id: number;
  username: string | null;
  name: string | null;
  email: string | null;
  level: number | null;
  branch_id_fk: number | null;
  emp_code: number | null;
  approved: number | null;
  level_label?: string;
  /** The user's roles (ادمن، مدير فرع، ريسبشن …). */
  roles?: string[];
}

const emptyForm = { username: '', fullname: '', password: '' };
const emptyCreateForm = { username: '', fullname: '', email: '', password: '', level: '2', empCode: '' };

/** Active employees for «الموظف المرتبط» (the backend derives name, branch and role from the employee). */
function useEmployeeOptionsFull() {
  return useQuery({
    queryKey: ['employees', 'user-options'],
    queryFn: async () => fetchAllReportRows<EmployeeListItem>('/employees', { status: 1 }, 200),
    staleTime: 60_000,
  });
}

/**
 * حسابات النظام (MetaFit layout): م، اسم المستخدم، الاسم، الصلاحية، الفرع، الحالة (toggle)،
 * الإجراءات (الصلاحيات، تعديل، حذف). Admins are added with «Add Admin»; staff accounts come
 * from تظبيط الموظفين / the employee file.
 */
export function UsersManagePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedId = Number(searchParams.get('user'));
  const { ui } = useLocale();
  const currentUser = useAuth((state) => state.user);
  const isSystemAdmin = isSystemAdminUser(currentUser);
  const { can } = usePermission();
  const canUpdate = can('admin.users:update');
  const canDelete = can('admin.users:delete');
  const canPermissions = can('admin.exceptions:view');
  const { params, setParams } = useListQuery();
  const { data: users = [], isLoading, isError, error, refetch } = useArrayResource<UserRow>('users');
  const { data: branches = [] } = useBranches();
  const branchName = (id: number | null) =>
    id != null && id > 0 ? (branches.find((b) => b.id === id)?.name ?? '—') : '—';
  const roleText = (row: UserRow) => (row.roles?.length ? row.roles.join('، ') : row.level_label || '—');
  const isAdminRow = (row: UserRow) => row.level === 1 || (row.roles ?? []).includes('ادمن');

  const filteredUsers = useMemo(
    () => users.filter((user) => {
      const status = params.filters.status;
      return !status || (status === 'active' ? user.approved === 1 : user.approved !== 1);
    }),
    [users, params.filters.status],
  );

  const pageData = useMemo(
    () =>
      clientPaginate(filteredUsers, params, {
        search: (u, q) => `${u.username ?? ''} ${u.name ?? ''} ${u.email ?? ''}`.toLowerCase().includes(q.toLowerCase()),
      }),
    [filteredUsers, params],
  );

  const stats = useMemo(
    () => [
      { title: ui('المستخدمون'), value: toArabicDigits(users.length), icon: <Users className="size-5" /> },
      { title: ui('نشطون'), value: toArabicDigits(users.filter((user) => user.approved === 1).length) },
      { title: ui('غير نشطين'), value: toArabicDigits(users.filter((user) => user.approved !== 1).length) },
    ],
    [users, ui],
  );

  // «إضافة مستخدم جديد»: an admin with a free name, or a dashboard login linked to an employee
  // (receptionist, branch manager …) whose role then follows the employee's job title.
  const canCreate = can('admin.users:create');
  const { data: rawEmployees = [] } = useEmployeeOptionsFull();
  const employeeOptions = useMemo(
    () => rawEmployees.map((e) => ({ value: String(e.emp_code), label: `${e.employee ?? '—'} (${toArabicDigits(e.emp_code ?? '')})` })),
    [rawEmployees],
  );
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState(emptyCreateForm);
  const [creating, setCreating] = useState(false);
  const level = parseInt(createForm.level, 10);

  const openCreate = () => {
    setCreateForm(emptyCreateForm);
    setCreateOpen(true);
  };

  const create = async () => {
    if (createForm.username.trim().length < 5) {
      toast.error(ui('اسم المستخدم مطلوب (٥ أحرف على الأقل)'));
      return;
    }
    if (createForm.password.trim().length < 5) {
      toast.error(ui('كلمة المرور مطلوبة (٥ أحرف على الأقل)'));
      return;
    }
    if (level === 1 && !createForm.fullname.trim()) {
      toast.error(ui('الاسم الكامل مطلوب'));
      return;
    }
    if (level !== 1 && !createForm.empCode) {
      toast.error(ui('اختر الموظف المرتبط بالحساب'));
      return;
    }
    const payload: Record<string, unknown> = {
      username: createForm.username.trim(),
      email: createForm.email.trim() || undefined,
      level,
      password: createForm.password.trim(),
      ...(level === 1 ? { fullname: createForm.fullname.trim() } : { empCode: parseInt(createForm.empCode, 10) }),
    };
    setCreating(true);
    try {
      await api.post('/users', payload);
      toast.success(ui('تم إضافة المستخدم'));
      setCreateOpen(false);
      void refetch();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setCreating(false);
    }
  };

  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const deleteMutation = useMutationWithToast(
    (id: number) => api.delete(`/users/${id}`),
    { success: ui('تم حذف المستخدم'), invalidate: ['users'] },
  );
  const statusMutation = useMutationWithToast(
    (id: number) => api.patch(`/users/${id}/approved`),
    { success: ui('تم تحديث الحالة'), invalidate: ['users'] },
  );

  const openEdit = (row: UserRow) => {
    setEditId(row.user_id);
    setForm({ username: row.username ?? '', fullname: row.name ?? '', password: '' });
    setFormOpen(true);
  };

  const save = async () => {
    if (!canUpdate || !editId) return;
    if (form.username.trim().length < 3) {
      toast.error(ui('اسم المستخدم مطلوب (٣ أحرف على الأقل)'));
      return;
    }
    if (!form.fullname.trim()) {
      toast.error(ui('الاسم مطلوب'));
      return;
    }
    if (form.password && form.password.length < 5) {
      toast.error(ui('كلمة المرور يجب ألا تقل عن ٥ أحرف'));
      return;
    }
    setSaving(true);
    try {
      await api.patch(`/users/${editId}/account`, {
        username: form.username.trim(),
        fullname: form.fullname.trim(),
        ...(form.password ? { password: form.password } : {}),
      });
      toast.success(ui('تم حفظ المستخدم'));
      setFormOpen(false);
      void refetch();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (row: UserRow) => {
    if (!canUpdate) return;
    const next = row.approved === 1 ? 0 : 1;
    const ok = await confirm({
      title: next === 1 ? ui('تفعيل المستخدم') : ui('إيقاف المستخدم'),
      description: next === 1
        ? ui('المستخدم هيقدر يدخل على النظام تاني.')
        : ui('المستخدم مش هيقدر يدخل، وأي جلسة مفتوحة له هتقف فورًا.'),
      confirmLabel: next === 1 ? ui('تفعيل') : ui('إيقاف'),
      variant: next === 1 ? 'default' : 'destructive',
    });
    if (ok) statusMutation.mutate(row.user_id);
  };

  const exportExcel = () =>
    downloadExcel(
      users.map((u, i) => ({
        n: i + 1,
        username: u.username ?? '',
        name: u.name ?? '',
        role: roleText(u),
        branch: branchName(u.branch_id_fk),
        status: u.approved === 1 ? ui('نشط') : ui('غير نشط'),
      })),
      [
        { key: 'n', header: ui('م') },
        { key: 'username', header: ui('اسم المستخدم') },
        { key: 'name', header: ui('الاسم') },
        { key: 'role', header: ui('الصلاحية') },
        { key: 'branch', header: ui('الفرع') },
        { key: 'status', header: ui('الحالة') },
      ],
      'system-accounts',
      ui('حسابات النظام'),
      { rightToLeft: true },
    );

  const permUser = canPermissions && selectedId > 0 && users.some((u) => u.user_id === selectedId) ? selectedId : null;
  const setPermUser = (row: UserRow | null) => {
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      if (row) next.set('user', String(row.user_id));
      else next.delete('user');
      return next;
    });
  };

  const columns: ColumnDef<UserRow>[] = [
    {
      accessorKey: 'user_id',
      header: ui('م'),
      cell: ({ row }) => toArabicDigits((params.page - 1) * params.pageSize + row.index + 1),
    },
    { accessorKey: 'username', header: ui('اسم المستخدم'), cell: ({ getValue }) => (getValue() as string | null) || '—' },
    { accessorKey: 'name', header: ui('الاسم'), cell: ({ getValue }) => (getValue() as string | null) || '—' },
    {
      id: 'roles',
      header: ui('الصلاحية'),
      cell: ({ row }) =>
        row.original.roles?.length ? (
          <div className="flex flex-wrap gap-1">
            {row.original.roles.map((r) => (
              <Badge key={r} variant={r === 'ادمن' ? 'success' : 'secondary'} className="text-[11px]">{r}</Badge>
            ))}
          </div>
        ) : (
          row.original.level_label || '—'
        ),
    },
    {
      accessorKey: 'branch_id_fk',
      header: ui('الفرع'),
      cell: ({ getValue }) => branchName(getValue() as number | null),
    },
    {
      accessorKey: 'approved',
      header: ui('الحالة'),
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <Switch
            checked={row.original.approved === 1}
            disabled={!canUpdate || statusMutation.isPending || row.original.user_id === currentUser?.sub || (isAdminRow(row.original) && !isSystemAdmin)}
            onCheckedChange={() => void toggleStatus(row.original)}
            aria-label={`${ui('تغيير الحالة')} — ${row.original.name || row.original.username}`}
          />
          <StatusBadge status={row.original.approved === 1 ? 'active' : 'suspended'} label={row.original.approved === 1 ? ui('نشط') : ui('غير نشط')} />
        </div>
      ),
    },
    {
      id: 'actions',
      header: ui('الإجراءات'),
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          {canPermissions && (
            <Button variant="outline" size="sm" onClick={() => setPermUser(row.original)}>
              <KeyRound className="size-4" /> {ui('الصلاحيات')}
            </Button>
          )}
          {canUpdate && (!isAdminRow(row.original) || isSystemAdmin) && (
            <Button variant="ghost" size="icon" aria-label={ui('تعديل')} onClick={() => openEdit(row.original)}>
              <Pencil className="size-4" />
            </Button>
          )}
          {canDelete && row.original.user_id !== currentUser?.sub && (!isAdminRow(row.original) || isSystemAdmin) && (
            <Button
              variant="ghost"
              size="icon"
              disabled={deleteMutation.isPending}
              aria-label={ui('حذف')}
              onClick={async () => {
                const ok = await confirm({
                  title: ui('حذف المستخدم'),
                  description: ui('الحساب هيتحذف نهائيًا من قائمة المستخدمين، ومش هيقدر يدخل تاني، وتقدر تعمل حساب جديد بنفس اسم المستخدم. الحذف مش بيمسح ملف الموظف أو عملياته السابقة.'),
                  confirmLabel: ui('حذف'),
                  variant: 'destructive',
                });
                if (ok) deleteMutation.mutate(row.original.user_id);
              }}
            >
              <Trash2 className="size-4 text-destructive" />
            </Button>
          )}
        </div>
      ),
    },
  ];

  if (permUser) {
    return <EditExceptions key={permUser} userId={permUser} onChangeUser={() => setPermUser(null)} catalogLoading={false} />;
  }

  return (
    <>
      <ListPageShell
        actions={
          <div className="flex w-full flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">{ui('حسابات النظام')} · {toArabicDigits(users.length)}</p>
            <div className="flex flex-wrap items-center gap-2">
              {canCreate && <Button variant="outline" onClick={openCreate}><Plus className="size-4" />{ui('إضافة مستخدم جديد')}</Button>}
              <AddAdminButton />
            </div>
          </div>
        }
        stats={stats}
        statsLoading={isLoading}
        isError={isError}
        error={error}
      >
        <DataTable
          searchPlaceholder={ui('بحث بالاسم أو اسم المستخدم…')}
          columns={columns}
          data={pageData.data}
          total={pageData.total}
          page={params.page}
          pageSize={params.pageSize}
          onPageChange={(p) => setParams({ page: p })}
          onPageSizeChange={(s) => setParams({ pageSize: s, page: 1 })}
          isLoading={isLoading}
          isError={isError}
          onRetry={() => void refetch()}
          search={params.search}
          onSearchChange={(s) => setParams({ search: s, page: 1 })}
          onExportExcel={exportExcel}
          toolbar={
            <Select
              value={params.filters.status || 'all'}
              onValueChange={(status) => setParams({ filters: { status: status === 'all' ? '' : status }, page: 1 })}
            >
              <SelectTrigger className="h-9 w-[150px] text-sm">
                <SelectValue placeholder={ui('الحالة')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{ui('كل الحالات')}</SelectItem>
                <SelectItem value="active">{ui('نشط')}</SelectItem>
                <SelectItem value="inactive">{ui('غير نشط')}</SelectItem>
              </SelectContent>
            </Select>
          }
          emptyTitle={ui('لا يوجد مستخدمون')}
        />
      </ListPageShell>

      <Dialog open={createOpen} onOpenChange={(open) => { if (!creating) setCreateOpen(open); }}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{ui('إضافة مستخدم جديد')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="new-user-username">{ui('اسم المستخدم')}</Label>
              <Input id="new-user-username" className="mt-1.5" dir="ltr" autoComplete="off" maxLength={40} value={createForm.username}
                onChange={(e) => setCreateForm((f) => ({ ...f, username: e.target.value }))} />
            </div>
            <div>
              <Label>{ui('المستوى')}</Label>
              <div className="mt-1.5">
                <Select
                  value={createForm.level}
                  onValueChange={(next) => setCreateForm((f) => ({ ...f, level: next, empCode: next === '1' ? '' : f.empCode }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {isSystemAdmin && <SelectItem value="1">{ui('مدير على النظام')}</SelectItem>}
                    <SelectItem value="3">{ui('مدير فرع')}</SelectItem>
                    <SelectItem value="2">{ui('موظف')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {level === 1 ? (
              <div>
                <Label htmlFor="new-user-fullname">{ui('الاسم الكامل')}</Label>
                <Input id="new-user-fullname" className="mt-1.5" maxLength={100} value={createForm.fullname}
                  onChange={(e) => setCreateForm((f) => ({ ...f, fullname: e.target.value }))} />
              </div>
            ) : (
              <div>
                <Label>{ui('الموظف المرتبط')}</Label>
                <div className="mt-1.5">
                  <Combobox
                    value={createForm.empCode}
                    onValueChange={(empCode) => setCreateForm((f) => ({ ...f, empCode }))}
                    options={employeeOptions}
                    placeholder={ui('اختر الموظف…')}
                    searchPlaceholder={ui('بحث بالاسم أو الكود…')}
                  />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {ui('الاسم والفرع والدور (ريسبشن، مدير فرع …) بييجوا من بيانات الموظف ومسماه الوظيفي.')}
                </p>
              </div>
            )}
            <div>
              <Label htmlFor="new-user-email">{ui('البريد الإلكتروني')}</Label>
              <Input id="new-user-email" type="email" className="mt-1.5" value={createForm.email}
                onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="new-user-password">{ui('كلمة المرور')}</Label>
              <Input id="new-user-password" type="password" className="mt-1.5" autoComplete="new-password" maxLength={72} value={createForm.password}
                onChange={(e) => setCreateForm((f) => ({ ...f, password: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>{ui('إلغاء')}</Button>
            <Button onClick={() => void create()} disabled={creating}>
              {creating ? ui('جارٍ الحفظ…') : ui('حفظ')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={formOpen} onOpenChange={(open) => { if (!saving) setFormOpen(open); }}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{ui('تعديل مستخدم')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="user-username">{ui('اسم المستخدم')}</Label>
              <Input id="user-username" className="mt-1.5" dir="ltr" autoComplete="off" maxLength={40} value={form.username}
                onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="user-fullname">{ui('الاسم')}</Label>
              <Input id="user-fullname" className="mt-1.5" maxLength={100} value={form.fullname}
                onChange={(e) => setForm((f) => ({ ...f, fullname: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="user-password">{ui('كلمة مرور جديدة (اختياري)')}</Label>
              <Input id="user-password" type="password" className="mt-1.5" autoComplete="new-password" maxLength={72}
                value={form.password} placeholder={ui('اتركها فارغة للإبقاء عليها')}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>{ui('إلغاء')}</Button>
            {canUpdate && (
              <Button onClick={() => void save()} disabled={saving}>
                {saving ? ui('جارٍ الحفظ…') : ui('حفظ')}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
