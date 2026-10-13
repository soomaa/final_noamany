import { ArrowRight, Loader2, Save } from 'lucide-react';
import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/common/page-header';
import { ErrorState, NotImplementedState } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { isNotImplemented, useMutationWithToast, useResource } from '@/lib/api-hooks';
import { useLocale } from '@/store/locale';

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

  const saveMutation = useMutationWithToast(
    (permissionIds: string[]) => api.put(`/users/${id}/permissions`, { permissions: permissionIds }),
    { success: ui('تم حفظ الصلاحيات'), invalidate: ['users', id ?? '', 'permissions'] },
  );

  const checked = useMemo(() => new Set(data?.permissions ?? []), [data?.permissions]);

  const handleToggle = (permId: string, value: boolean) => {
    const next = new Set(checked);
    if (value) next.add(permId);
    else next.delete(permId);
    saveMutation.mutate([...next]);
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
            : `${data?.fullName ?? data?.username ?? ui('المستخدم')} — ${ui('تحديد الصلاحيات')} (${toArabicCount(checked.size)})`
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
              disabled={saveMutation.isPending || isLoading}
              onClick={() => saveMutation.mutate([...checked])}
            >
              {saveMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              {ui('حفظ')}
            </Button>
          </div>
        }
      />

      <Card>
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

function toArabicCount(n: number) {
  const { ui } = useLocale();
  return String(n).replace(/\d/g, (d) => ui('٠١٢٣٤٥٦٧٨٩')[Number(d)]);
}
