import { Search, ShieldCheck, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/common/page-header';
import { EmptyState, ErrorState } from '@/components/common/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useDeleteRole, useRoles } from '@/hooks/use-rbac';
import { usePermission } from '@/hooks/use-permission';
import { confirm } from '@/lib/confirm';
import { useLocale } from '@/store/locale';
import type { RbacRole } from '@/types/rbac';

/** Why a role cannot be deleted, or null when it can. Mirrors the server's checks. */
function blockReason(role: RbacRole): string | null {
  if (role.isSuperAdmin) return 'دور المدير العام لا يُحذف';
  if (role.isSystem) return 'دور نظامي لا يُحذف';
  if (role.users > 0) return `عليه ${role.users} مستخدم — انقلهم لدور تاني الأول`;
  if ((role.employees ?? 0) > 0) return `${role.employees} موظف على المسمى الوظيفي — غيّر مسماهم الأول`;
  return null;
}

/** System administration → roles list: see every role, how many use it, and delete the unused ones. */
export function RoleListPage() {
  const { ui } = useLocale();
  const { can } = usePermission();
  const canManage = can('admin.roles:manage');
  const rolesQ = useRoles();
  const remove = useDeleteRole();
  const [search, setSearch] = useState('');
  const [unusedOnly, setUnusedOnly] = useState(false);
  const localizedDigits = ui('٠١٢٣٤٥٦٧٨٩');
  const fmt = (value: number) => String(value).replace(/\d/g, (d) => localizedDigits[Number(d)] ?? d);

  const roles = rolesQ.data?.roles ?? [];
  const unusedCount = roles.filter((r) => blockReason(r) == null).length;
  const visible = useMemo(() => {
    const q = search.trim();
    return roles
      .filter((r) => !q || r.nameAr.includes(q) || (r.nameEn ?? '').toLowerCase().includes(q.toLowerCase()))
      .filter((r) => !unusedOnly || blockReason(r) == null)
      .sort((a, b) => a.nameAr.localeCompare(b.nameAr, 'ar'));
  }, [roles, search, unusedOnly]);

  const onDelete = async (role: RbacRole) => {
    const ok = await confirm({
      title: ui('حذف الدور'),
      description: `${ui('هل تريد حذف دور «')}${role.nameAr}${ui('»؟')}`,
      warning: role.jobTitleExists
        ? ui('هيتحذف معاه المسمى الوظيفي بنفس الاسم وصلاحياته. الحذف مايترجعش.')
        : ui('هتتحذف صلاحيات الدور. الحذف مايترجعش.'),
      confirmLabel: ui('حذف'),
      variant: 'destructive',
    });
    if (ok) remove.mutate(role.id);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={ui('إدارة النظام')}
        title={ui('قائمة الأدوار')}
        description={ui('كل دور مرتبط بمسمى وظيفي. تقدر تحذف الدور اللي مافيش عليه مستخدمين ولا موظفين، وبيتحذف معاه المسمى الوظيفي بتاعه.')}
        actions={
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="secondary">{ui('الأدوار:')} {fmt(roles.length)}</Badge>
            <Badge variant="outline">{ui('غير مستخدمة:')} {fmt(unusedCount)}</Badge>
          </div>
        }
      />

      <Card className="flex flex-wrap items-center gap-3 p-3">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="ps-9" placeholder={ui('ابحث باسم الدور')} value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <Switch checked={unusedOnly} onCheckedChange={setUnusedOnly} />
          {ui('غير المستخدمة بس')}
        </label>
      </Card>

      {rolesQ.isError ? (
        <ErrorState onRetry={() => void rolesQ.refetch()} />
      ) : rolesQ.isLoading ? (
        <Skeleton className="h-[50vh] w-full" />
      ) : visible.length === 0 ? (
        <EmptyState title={ui('مافيش أدوار مطابقة')} description={ui('غيّر البحث أو اقفل فلتر غير المستخدمة.')} />
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{ui('الدور')}</TableHead>
                <TableHead className="text-center">{ui('المستخدمون')}</TableHead>
                <TableHead className="text-center">{ui('الموظفون على المسمى')}</TableHead>
                <TableHead>{ui('الحالة')}</TableHead>
                <TableHead className="text-end">{ui('إجراءات')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((role) => {
                const reason = blockReason(role);
                return (
                  <TableRow key={role.id}>
                    <TableCell className="font-medium">
                      {role.nameAr}
                      {role.jobTitleExists === false && (
                        <Badge variant="outline" className="ms-2 text-[11px] text-amber-600">{ui('المسمى الوظيفي محذوف')}</Badge>
                      )}
                    </TableCell>
                    <TableCell className="nums text-center">{fmt(role.users)}</TableCell>
                    <TableCell className="nums text-center">{fmt(role.employees ?? 0)}</TableCell>
                    <TableCell>
                      {reason ? (
                        <span className="text-xs text-muted-foreground">{ui('مستخدم')}</span>
                      ) : (
                        <Badge variant="secondary" className="text-[11px]">{ui('غير مستخدم')}</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-end">
                      <div className="flex justify-end gap-1.5">
                        <Button size="sm" variant="outline" asChild>
                          <Link to={`/admin/roles?role=${role.id}`}>
                            <ShieldCheck className="size-4" /> {ui('الصلاحيات')}
                          </Link>
                        </Button>
                        {canManage && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-destructive hover:text-destructive"
                            disabled={!!reason || remove.isPending}
                            title={reason ? ui(reason) : ui('حذف الدور')}
                            onClick={() => void onDelete(role)}
                          >
                            <Trash2 className="size-4" /> {ui('حذف')}
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
