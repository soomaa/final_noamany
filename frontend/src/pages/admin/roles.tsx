import { RotateCcw, Save, ShieldCheck, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/common/page-header';
import { EmptyState, ErrorState } from '@/components/common/states';
import { StatCard } from '@/components/common/stat-card';
import { PermissionMatrix } from '@/components/rbac/permission-matrix';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useCatalog,
  useRoleMatrix,
  useRoleUsers,
  useRoles,
  useSaveRoleMatrix,
} from '@/hooks/use-rbac';
import { confirm } from '@/lib/confirm';
import { diffDraft, draftFromCells } from '@/lib/rbac-resolve';
import type { TriState } from '@/types/rbac';
import { useLocale } from '@/store/locale';

export function RolesPage() {
  const { ui } = useLocale();
  const localizedDigits = ui('٠١٢٣٤٥٦٧٨٩');
  const formatNumber = (value: number) =>
    String(value).replace(/\d/g, (digit) => localizedDigits[Number(digit)] ?? digit);
  const catalog = useCatalog();
  const rolesQ = useRoles();
  const [roleId, setRoleId] = useState<number | null>(null);
  const [draft, setDraft] = useState<Map<string, TriState>>(new Map());
  const [showUsers, setShowUsers] = useState(false);

  const roles = rolesQ.data?.roles ?? [];
  useEffect(() => {
    if (roleId == null && roles.length) setRoleId(roles[0].id);
  }, [roles, roleId]);

  const matrixQ = useRoleMatrix(roleId);
  const usersQ = useRoleUsers(showUsers ? roleId : null);
  const save = useSaveRoleMatrix(roleId ?? 0);

  const role = matrixQ.data?.role;
  const serverExplicit = useMemo(
    () => (matrixQ.data ? draftFromCells(matrixQ.data.cells) : new Map<string, TriState>()),
    [matrixQ.data],
  );
  // reset working draft whenever the loaded role changes
  useEffect(() => {
    setDraft(new Map(serverExplicit));
  }, [serverExplicit]);

  const changes = useMemo(() => diffDraft(serverExplicit, draft), [serverExplicit, draft]);
  const dirty = changes.length > 0;

  const liveStats = useMemo(() => {
    // recompute granted live from the draft via the matrix's own resolver is heavy; use server stats
    // and only adjust the dirty hint. Server stats refresh after save.
    return matrixQ.data?.stats ?? { granted: 0, notGranted: 0, users: 0 };
  }, [matrixQ.data]);

  const onSave = () => {
    if (roleId == null || !dirty) return;
    save.mutate(changes);
  };
  const onRevert = () => setDraft(new Map(serverExplicit));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={ui('إدارة النظام')}
        title={ui('الأدوار والصلاحيات')}
        description={ui('الأدوار مرتبطة بالمسميات الوظيفية — اختر مسمىً لضبط صلاحياته. لإضافة مسمى جديد انتقل إلى المسميات الوظيفية.')}
        actions={
          <Badge variant="secondary" className="text-xs">
            {ui('إجمالي خانات الصلاحيات:')} {formatNumber(rolesQ.data?.totalSlots ?? 0)}
          </Badge>
        }
      />

      {/* Role selector + actions */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 p-3">
          <select
            value={roleId ?? ''}
            onChange={(e) => setRoleId(Number(e.target.value))}
            className="h-9 min-w-56 rounded-md border border-input bg-card px-3 text-sm"
          >
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nameAr} ({formatNumber(r.users)})
              </option>
            ))}
          </select>
          <div className="flex flex-wrap items-center gap-1.5">
            <Button size="sm" variant="outline" asChild>
              <Link to="/org/job-titles">{ui('إدارة المسميات الوظيفية')}</Link>
            </Button>
            <Button size="sm" variant="outline" disabled={!role} onClick={() => setShowUsers((s) => !s)}>
              <Users className="size-4" /> {ui('المستخدمون')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {showUsers && role && (
        <Card>
          <CardContent className="p-4">
            <p className="mb-2 text-sm font-semibold">{ui('المستخدمون على الدور')} «{role.nameAr}»</p>
            {usersQ.isLoading ? (
              <Skeleton className="h-6 w-40" />
            ) : (usersQ.data?.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground">{ui('لا يوجد مستخدمون.')}</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {usersQ.data!.map((u) => (
                  <Badge key={u.userId} variant="outline">
                    {u.name ?? u.username ?? u.userId}
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Body */}
      {rolesQ.isError || catalog.isError ? (
        <ErrorState onRetry={() => void rolesQ.refetch()} />
      ) : roleId == null || roles.length === 0 ? (
        <EmptyState
          title={ui('لا توجد مسميات وظيفية')}
          description={ui('أضف مسميات وظيفية أولاً لتظهر هنا كأدوار يمكن ضبط صلاحياتها.')}
          action={
            <Button variant="brand" asChild>
              <Link to="/org/job-titles">{ui('المسميات الوظيفية')}</Link>
            </Button>
          }
        />
      ) : matrixQ.isLoading || catalog.isLoading ? (
        <Skeleton className="h-[60vh] w-full" />
      ) : matrixQ.data?.superAdmin ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-12 text-center">
            <ShieldCheck className="size-10 text-emerald-500" />
            <p className="text-lg font-semibold">{role?.nameAr}</p>
            <p className="max-w-md text-sm text-muted-foreground">
              {ui('هذا الدور يتجاوز كل عمليات التحقق من الصلاحيات ولا يحتاج إلى مصفوفة. كل الموارد متاحة لحامليه.')}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard title={ui('صلاحيات فعّالة (بعد الوراثة)')} value={liveStats.granted} colorIndex={3} icon={<ShieldCheck className="size-5" />} />
            <StatCard title={ui('غير ممنوحة')} value={liveStats.notGranted} colorIndex={4} />
            <StatCard title={ui('عدد المستخدمين')} value={liveStats.users} colorIndex={1} icon={<Users className="size-5" />} />
          </div>

          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/30 px-4 py-2">
              <p className="text-xs text-muted-foreground">
                {ui('انقر الخانة لتبديل الوصول مباشرة: الأخضر سماح، الأحمر رفض، والمتقطع موروث.')} {dirty && <span className="font-semibold text-primary">({formatNumber(changes.length)} {ui('تغيير غير محفوظ')})</span>}
              </p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={!dirty || save.isPending} onClick={onRevert}>
                  <RotateCcw className="size-4" /> {ui('تراجع')}
                </Button>
                <Button size="sm" variant="brand" disabled={!dirty || save.isPending} onClick={onSave}>
                  <Save className="size-4" /> {ui('حفظ التغييرات')}
                </Button>
              </div>
            </div>
            {catalog.data && (
              <PermissionMatrix catalog={catalog.data} mode="role" draft={draft} onChange={setDraft} editable />
            )}
          </Card>
        </>
      )}
    </div>
  );
}
