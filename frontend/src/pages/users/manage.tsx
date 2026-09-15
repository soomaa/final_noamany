import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { KeyRound, Loader2, Pencil, Save, Trash2, Users } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Combobox } from '@/components/common/combobox';
import { DataTable } from '@/components/common/data-table';
import { ListPageShell } from '@/components/common/list-page-shell';
import { StatusBadge } from '@/components/common/status-badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useBranches } from '@/hooks/use-branches';
import { api, apiError } from '@/lib/api';
import { clientPaginate, useArrayResource, useMutationWithToast } from '@/lib/api-hooks';
import { confirm } from '@/lib/confirm';
import { useListQuery } from '@/lib/use-list-query';
import { toArabicDigits } from '@/lib/utils';
import type { EmployeeListItem } from '@/types/employees';
import { useLocale } from '@/store/locale';
import { uiStatic } from '@/lib/ui-static';
import { fetchAllReportRows } from '@/lib/report-fetch';

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
}

const LEVEL_OPTIONS = [
  { value: '1', label: uiStatic('مدير على النظام') },
  { value: '2', label: uiStatic('موظف على النظام') },
  { value: '3', label: uiStatic('مدير فرع-ادارة') },
];

const LEVEL_LABELS: Record<number, string> = {
  1: uiStatic('مدير على النظام'),
  2: uiStatic('موظف على النظام'),
  3: uiStatic('مدير فرع-ادارة'),
};

const emptyForm = {
  username: '',
  fullname: '',
  email: '',
  password: '',
  level: '1',
  empCode: '',
};

interface MenuNodeApi {
  id: number;
  title: string;
  children?: MenuNodeApi[];
}

interface UserPermissions {
  userId: number;
  username?: string;
  fullName?: string;
  tree?: MenuNodeApi[];
  permissions?: string[];
}

export function UsersManagePage() {
  const { ui } = useLocale();
  const { params, setParams } = useListQuery();
  const { data: users = [], isLoading, isError, error, refetch } = useArrayResource<UserRow>('users');
  const { data: branches = [] } = useBranches();
  // Employee directory for level 2/3 (the backend resolves name/branch from emp_code).
  const { data: rawEmployees = [] } = useEmployeeOptionsFull();

  const employeeOptions = useMemo(
    () =>
      rawEmployees.map((e) => ({
        value: String(e.emp_code),
        label: `${e.employee ?? '—'} (${toArabicDigits(e.emp_code ?? '')})`,
      })),
    [rawEmployees],
  );

  const branchName = (id: number | null) =>
    id != null ? (branches.find((b) => b.id === id)?.name ?? '—') : '—';

  const pageData = useMemo(
    () =>
      clientPaginate(users, params, {
        search: (u, q) =>
          (u.username ?? '').toLowerCase().includes(q) ||
          (u.name ?? '').toLowerCase().includes(q) ||
          (u.email ?? '').toLowerCase().includes(q),
      }),
    [users, params],
  );

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

  const stats = useMemo(
    () => [
      { title: ui('المستخدمون'), value: toArabicDigits(users.length), icon: <Users className="size-5" /> },
    ],
    [users],
  );

  const openEdit = (row: UserRow) => {
    // users.emp_code stores employees.id (legacy convention), while the edit API
    // expects the employee business code selected by the form.
    const linkedEmployee = rawEmployees.find((employee) => employee.id === row.emp_code);
    setEditId(row.user_id);
    setForm({
      username: row.username ?? '',
      fullname: row.level === 1 ? (row.name ?? '') : '',
      email: row.email ?? '',
      password: '',
      level: row.level != null ? String(row.level) : '1',
      empCode: linkedEmployee?.emp_code != null ? String(linkedEmployee.emp_code) : '',
    });
    setFormOpen(true);
  };

  const save = async () => {
    const level = parseInt(form.level, 10);
    if (form.username.trim().length < 5) {
      toast.error(ui('اسم المستخدم مطلوب (٥ أحرف على الأقل)'));
      return;
    }
    if (!editId && form.password.trim().length < 5) {
      toast.error(ui('كلمة المرور مطلوبة (٥ أحرف على الأقل)'));
      return;
    }
    if (form.password.trim() && form.password.trim().length < 5) {
      toast.error(ui('كلمة المرور يجب ألا تقل عن ٥ أحرف'));
      return;
    }
    if (level === 1 && !form.fullname.trim()) {
      toast.error(ui('الاسم الكامل مطلوب'));
      return;
    }
    if (level !== 1 && !form.empCode) {
      toast.error(ui('اختر الموظف المرتبط بالحساب'));
      return;
    }

    const payload: Record<string, unknown> = {
      username: form.username.trim(),
      email: form.email.trim() || undefined,
      level,
      ...(level === 1
        ? { fullname: form.fullname.trim() }
        : { empCode: parseInt(form.empCode, 10) }),
      ...(form.password.trim() ? { password: form.password.trim() } : {}),
    };

    setSaving(true);
    try {
      if (!editId) return;
      await api.patch(`/users/${editId}`, payload);
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
    const next = row.approved === 1 ? 0 : 1;
    const ok = await confirm({
      title: next === 1 ? ui('تفعيل المستخدم') : ui('إيقاف المستخدم'),
      description:
        next === 1
          ? ui('هل تريد تفعيل هذا المستخدم؟')
          : ui('هل تريد إيقاف هذا المستخدم عن الدخول؟'),
      confirmLabel: next === 1 ? ui('تفعيل') : ui('إيقاف'),
      variant: next === 1 ? 'default' : 'destructive',
    });
    if (ok) statusMutation.mutate(row.user_id);
  };

  const [permUser, setPermUser] = useState<UserRow | null>(null);

  const columns: ColumnDef<UserRow>[] = [
    {
      accessorKey: 'user_id',
      header: ui('م'),
      cell: ({ row }) => toArabicDigits((params.page - 1) * params.pageSize + row.index + 1),
    },
    { accessorKey: 'username', header: ui('اسم المستخدم') },
    { accessorKey: 'name', header: ui('الاسم'), cell: ({ getValue }) => (getValue() as string | null) || '—' },
    {
      accessorKey: 'email',
      header: ui('البريد'),
      cell: ({ getValue }) => (getValue() as string | null) || '—',
    },
    {
      accessorKey: 'level',
      header: ui('الصلاحية'),
      cell: ({ row }) =>
        row.original.level_label ?? LEVEL_LABELS[row.original.level ?? 0] ?? '—',
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
        <button type="button" onClick={() => void toggleStatus(row.original)} aria-label={ui('تغيير الحالة')}>
          <StatusBadge
            status={row.original.approved === 1 ? 'active' : 'suspended'}
            label={row.original.approved === 1 ? ui('مُفعّل') : ui('موقوف')}
            className="cursor-pointer"
          />
        </button>
      ),
    },
    {
      id: 'actions',
      header: ui('إجراء'),
      cell: ({ row }) => (
        <div className="flex items-center gap-2 whitespace-nowrap">
          <Button variant="outline" size="sm" aria-label={ui('تعديل')} onClick={() => openEdit(row.original)}>
            <Pencil className="size-4" />
            {ui('تعديل')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            aria-label={ui('الصلاحيات')}
            onClick={() => setPermUser(row.original)}
          >
            <KeyRound className="size-4" />
            {ui('الصلاحيات')}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={ui('حذف')}
            onClick={async () => {
              const ok = await confirm({
                title: ui('حذف المستخدم'),
                description: ui('هل تريد حذف هذا المستخدم؟ سيتم حذف صلاحياته أيضاً.'),
                confirmLabel: ui('حذف'),
                variant: 'destructive',
              });
              if (ok) deleteMutation.mutate(row.original.user_id);
            }}
          >
            <Trash2 className="size-4 text-destructive" />
          </Button>
        </div>
      ),
    },
  ];

  const level = parseInt(form.level, 10);

  return (
    <>
      <ListPageShell
        title={ui('إدارة المستخدمين')}
        description={ui('عرض وتعديل مستخدمي النظام — يُنشأ الحساب الجديد من قسم الموارد البشرية عند تفعيل «إضافة إلى النظام» في نموذج الموظف')}
        searchPlaceholder={ui('بحث بالاسم أو اسم المستخدم…')}
        stats={stats}
        statsLoading={isLoading}
        isError={isError}
        error={error}
      >
        <DataTable
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
          emptyTitle={ui('لا يوجد مستخدمون')}
        />
      </ListPageShell>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{ui('تعديل مستخدم')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="user-username">{ui('اسم المستخدم')}</Label>
              <Input
                id="user-username"
                className="mt-1.5"
                value={form.username}
                onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
              />
            </div>
            <div>
              <Label>{ui('الصلاحية')}</Label>
              <div className="mt-1.5">
                <Combobox
                  value={form.level}
                  onValueChange={(v) => setForm((f) => ({ ...f, level: v }))}
                  options={LEVEL_OPTIONS}
                  placeholder={ui('الصلاحية…')}
                />
              </div>
            </div>
            {level === 1 ? (
              <div>
                <Label htmlFor="user-fullname">{ui('الاسم الكامل')}</Label>
                <Input
                  id="user-fullname"
                  className="mt-1.5"
                  value={form.fullname}
                  onChange={(e) => setForm((f) => ({ ...f, fullname: e.target.value }))}
                />
              </div>
            ) : (
              <div>
                <Label>{ui('الموظف المرتبط')}</Label>
                <div className="mt-1.5">
                  <Combobox
                    value={form.empCode}
                    onValueChange={(empCode) => setForm((f) => ({ ...f, empCode }))}
                    options={employeeOptions}
                    placeholder={ui('اختر الموظف…')}
                    searchPlaceholder={ui('بحث بالاسم أو الكود…')}
                  />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {ui('يُشتق الاسم والفرع تلقائياً من بيانات الموظف.')}
                </p>
              </div>
            )}
            <div>
              <Label htmlFor="user-email">{ui('البريد الإلكتروني')}</Label>
              <Input
                id="user-email"
                type="email"
                className="mt-1.5"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="user-password">{editId ? ui('كلمة مرور جديدة (اختياري)') : ui('كلمة المرور')}</Label>
              <Input
                id="user-password"
                type="password"
                className="mt-1.5"
                autoComplete="new-password"
                value={form.password}
                placeholder={editId ? ui('اتركها فارغة للإبقاء عليها') : ''}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>{ui('إلغاء')}</Button>
            <Button onClick={() => void save()} disabled={saving}>
              {saving ? ui('جارٍ الحفظ…') : ui('حفظ')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PermissionsDialog user={permUser} onClose={() => setPermUser(null)} />
    </>
  );
}

/** Like useEmployeeOptions but returns raw items so we can key by emp_code. */
function useEmployeeOptionsFull() {
  return useQuery({
    queryKey: ['employees', 'user-options'],
    queryFn: async () => {
      return fetchAllReportRows<EmployeeListItem>('/employees', { status: 1 }, 200);
    },
    staleTime: 60_000,
  });
}

function flattenIds(nodes: MenuNodeApi[]): string[] {
  const out: string[] = [];
  for (const n of nodes) {
    out.push(String(n.id));
    if (n.children?.length) out.push(...flattenIds(n.children));
  }
  return out;
}

function PermissionsDialog({ user, onClose }: { user: UserRow | null; onClose: () => void }) {
  const { ui } = useLocale();
  const userId = user?.user_id;
  const { data, isLoading, isError, refetch } = useResourcePermissions(userId);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data?.permissions) setChecked(new Set(data.permissions));
  }, [data?.permissions]);

  const tree = data?.tree ?? [];

  const toggle = (id: string, value: boolean) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (value) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const toggleBranch = (node: MenuNodeApi, value: boolean) => {
    const ids = flattenIds([node]);
    setChecked((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (value) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  };

  const save = async () => {
    if (!userId) return;
    setSaving(true);
    try {
      await api.put(`/users/${userId}/permissions`, { permissions: [...checked] });
      toast.success(ui('تم حفظ الصلاحيات'));
      onClose();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!user} onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{ui('صلاحيات المستخدم')}</DialogTitle>
          <DialogDescription>
            {user?.name || user?.username || ui('المستخدم')} — {ui('تحديد الصفحات المسموح بها')} (
            {toArabicDigits(checked.size)})
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto ps-1">
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          ) : isError ? (
            <div className="py-8 text-center text-sm text-destructive">
              {ui('تعذّر تحميل الصلاحيات.')}
              <Button variant="outline" size="sm" className="me-3" onClick={() => void refetch()}>
                {ui('إعادة المحاولة')}
              </Button>
            </div>
          ) : tree.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{ui('لا توجد صفحات في النظام.')}</p>
          ) : (
            <PermissionTree
              nodes={tree}
              checked={checked}
              onToggle={toggle}
              onToggleBranch={toggleBranch}
            />
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{ui('إلغاء')}</Button>
          <Button onClick={() => void save()} disabled={saving || isLoading}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            {ui('حفظ الصلاحيات')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function useResourcePermissions(userId?: number) {
  return useQuery({
    queryKey: ['users', userId, 'permissions'],
    queryFn: async () => {
      const { data } = await api.get<UserPermissions>(`/users/${userId}/permissions`);
      return data;
    },
    enabled: userId != null,
  });
}

function PermissionTree({
  nodes,
  checked,
  onToggle,
  onToggleBranch,
  depth = 0,
}: {
  nodes: MenuNodeApi[];
  checked: Set<string>;
  onToggle: (id: string, value: boolean) => void;
  onToggleBranch: (node: MenuNodeApi, value: boolean) => void;
  depth?: number;
}) {
  return (
    <ul className={depth > 0 ? 'me-4 mt-2 space-y-2 border-s border-border ps-4' : 'space-y-3'}>
      {nodes.map((node) => {
        const id = String(node.id);
        const hasChildren = (node.children?.length ?? 0) > 0;
        return (
          <li key={id}>
            <div className="flex items-center gap-2">
              <Checkbox
                id={`perm-${id}`}
                checked={checked.has(id)}
                onCheckedChange={(v) =>
                  hasChildren ? onToggleBranch(node, v === true) : onToggle(id, v === true)
                }
              />
              <Label htmlFor={`perm-${id}`} className={depth === 0 ? 'font-semibold' : 'font-normal'}>
                {node.title}
              </Label>
            </div>
            {hasChildren && (
              <PermissionTree
                nodes={node.children!}
                checked={checked}
                onToggle={onToggle}
                onToggleBranch={onToggleBranch}
                depth={depth + 1}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}
