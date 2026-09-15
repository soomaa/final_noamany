import { ArrowRight, Loader2, Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/common/page-header';
import { ErrorState, NotImplementedState } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { togglePermissionSet } from '@/lib/user-permissions-editor-model';
import { isNotImplemented, useMutationWithToast, useResource } from '@/lib/api-hooks';
import { useLocale } from '@/store/locale';
import { useBranches } from '@/hooks/use-branches';

interface MenuNodeApi {
  id: number;
  title: string;
  link: string;
  children?: MenuNodeApi[];
}

interface UserPermissions {
  userId: number;
  username?: string;
  fullName?: string;
  tree?: MenuNodeApi[];
  permissions?: string[];
  scope?: { branchId: number | null; gender: 'male' | 'female' | null; editable: boolean };
}

function PermissionTree({
  nodes,
  checked,
  onToggle,
  depth = 0,
}: {
  nodes: MenuNodeApi[];
  checked: Set<string>;
  onToggle: (id: string, value: boolean) => void;
  depth?: number;
}) {
  return (
    <ul className={depth > 0 ? 'me-4 mt-2 space-y-2 border-s border-border ps-4' : 'space-y-3'}>
      {nodes.map((node) => {
        const id = String(node.id);
        const hasChildren = (node.children?.length ?? 0) > 0;
        return (
          <li key={id}>
            <div className="flex items-center gap-2" style={{ paddingInlineStart: depth * 8 }}>
              <Checkbox
                id={`perm-${id}`}
                checked={checked.has(id)}
                onCheckedChange={(v) => onToggle(id, v === true)}
              />
              <Label htmlFor={`perm-${id}`} className={depth === 0 ? 'font-semibold' : ''}>
                {node.title}
              </Label>
            </div>
            {hasChildren && (
              <PermissionTree nodes={node.children!} checked={checked} onToggle={onToggle} depth={depth + 1} />
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function UserPermissionsPage() {
  const { ui } = useLocale();
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, isError, error, refetch } = useResource<UserPermissions>('users', id, 'permissions');
  const { data: branches = [] } = useBranches();
  const [scope, setScope] = useState<{ branchId: string; gender: 'male' | 'female' }>({ branchId: '', gender: 'male' });
  const [checked, setChecked] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    if (data?.scope?.editable) setScope({ branchId: data.scope.branchId ? String(data.scope.branchId) : '', gender: data.scope.gender ?? 'male' });
  }, [data?.scope?.editable, data?.scope?.branchId, data?.scope?.gender]);
  useEffect(() => {
    setChecked(new Set(data?.permissions ?? []));
  }, [data?.permissions]);

  const saveMutation = useMutationWithToast(
    (permissionIds: string[]) => api.put(`/users/${id}/permissions`, {
      permissions: permissionIds,
      ...(data?.scope?.editable ? { scope: { branchId: Number(scope.branchId), gender: scope.gender } } : {}),
    }),
    { success: ui('تم حفظ الصلاحيات'), invalidate: ['users', id ?? '', 'permissions'] },
  );

  const handleToggle = (permId: string, value: boolean) => {
    setChecked((current) => togglePermissionSet(current, permId, value));
  };

  if (isError && isNotImplemented(error)) {
    return (
      <div>
        <PageHeader title={ui('صلاحيات المستخدم')} />
        <NotImplementedState title={ui('صلاحيات المستخدم قيد الإعداد على الخادم')} />
      </div>
    );
  }

  if (isError) {
    return <ErrorState onRetry={() => void refetch()} />;
  }

  const tree = data?.tree ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title={ui('صلاحيات المستخدم')}
        description={
          isLoading
            ? ui('جاري التحميل…')
            : `${data?.fullName ?? data?.username ?? ui('المستخدم')} — ${ui('تحديد الصلاحيات')} (${toArabicCount(checked.size, ui('٠١٢٣٤٥٦٧٨٩'))})`
        }
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link to="/users">
                <ArrowRight className="size-4" /> {ui('العودة للمستخدمين')}
              </Link>
            </Button>
            <Button
              variant="brand"
              size="sm"
              disabled={saveMutation.isPending || isLoading || Boolean(data?.scope?.editable && !scope.branchId)}
              onClick={() => saveMutation.mutate([...checked])}
            >
              {saveMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              {ui('حفظ')}
            </Button>
          </div>
        }
      />

      <Card>
        {data?.scope?.editable ? (
          <CardContent className="border-b bg-muted/20 pt-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <div><Label htmlFor="user-scope-branch">الفرع المسموح</Label><select id="user-scope-branch" className="mt-1.5 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={scope.branchId} onChange={(event) => setScope((current) => ({ ...current, branchId: event.target.value }))}><option value="">اختر الفرع</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></div>
              <div><Label htmlFor="user-scope-gender">القسم المسموح</Label><select id="user-scope-gender" className="mt-1.5 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={scope.gender} onChange={(event) => setScope((current) => ({ ...current, gender: event.target.value as 'male' | 'female' }))}><option value="male">رجالي</option><option value="female">حريمي</option></select></div>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">يُطبّق النطاق بعد الحفظ وتحديث جلسة المستخدم، وأي نطاق ناقص يُمنع تلقائيًا.</p>
          </CardContent>
        ) : null}
        <CardHeader>
          <CardTitle className="text-base">{ui('شجرة الصلاحيات (من النظام القديم)')}</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          ) : tree.length === 0 ? (
            <p className="text-sm text-muted-foreground">{ui('لا توجد صفحات في النظام.')}</p>
          ) : (
            <PermissionTree nodes={tree} checked={checked} onToggle={handleToggle} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function toArabicCount(n: number, digits: string) {
  return String(n).replace(/\d/g, (d) => digits[Number(d)]);
}
