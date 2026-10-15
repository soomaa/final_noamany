import { Eraser, RotateCcw, Save, Search, ShieldCheck, UserCog } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/common/page-header';
import { EmptyState } from '@/components/common/states';
import { StatCard } from '@/components/common/stat-card';
import { PermissionMatrix } from '@/components/rbac/permission-matrix';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useCatalog,
  useClearExceptions,
  useRbacUsers,
  useSaveExceptions,
  useUserExceptions,
} from '@/hooks/use-rbac';
import { confirm } from '@/lib/confirm';
import { cellId } from '@/lib/rbac-resolve';
import { diffDraft } from '@/lib/rbac-resolve';
import type { Effect, TriState } from '@/types/rbac';
import { useLocale } from '@/store/locale';

export function UserExceptionsPage() {
  const { ui } = useLocale();
  // Deep-link support: /admin/exceptions?user=123 (the Users screen + legacy redirect use this).
  const [params, setParams] = useSearchParams();
  const paramUser = params.get('user');
  const [userId, setUserId] = useState<number | null>(paramUser ? Number(paramUser) : null);
  const [search, setSearch] = useState('');
  const catalog = useCatalog();

  const pick = (id: number | null) => {
    setUserId(id);
    setParams(id ? { user: String(id) } : {}, { replace: true });
  };

  if (userId == null) {
    return (
      <div className="space-y-6">
        <Header />
        <PickUser search={search} setSearch={setSearch} onPick={pick} />
      </div>
    );
  }

  return (
    <EditExceptions
      userId={userId}
      onChangeUser={() => pick(null)}
      catalogLoading={catalog.isLoading}
    />
  );
}

function Header() {
  const { ui } = useLocale();
  return (
    <PageHeader
      eyebrow={ui('إدارة النظام')}
      title={ui('استثناءات المستخدمين')}
      description={ui('امنح أو امنع صلاحيات محددة لمستخدم واحد فوق أدواره. الاستثناء يطبّق على الخانة بالضبط، وله أعلى أولوية، والرفض يغلب دائماً.')}
    />
  );
}

function PickUser({
  search,
  setSearch,
  onPick,
}: {
  search: string;
  setSearch: (v: string) => void;
  onPick: (id: number) => void;
}) {
  const { ui } = useLocale();
  const usersQ = useRbacUsers(search);
  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="relative">
          <Search className="absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={ui('ابحث عن مستخدم بالاسم أو اسم المستخدم…')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pe-9"
          />
        </div>
        {usersQ.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : (usersQ.data?.length ?? 0) === 0 ? (
          <EmptyState title={ui('لا يوجد مستخدمون')} description={ui('جرّب كلمة بحث أخرى.')} />
        ) : (
          <ul className="divide-y divide-border">
            {usersQ.data!.map((u) => (
              <li key={u.userId}>
                <button
                  type="button"
                  onClick={() => onPick(u.userId)}
                  className="flex w-full items-center justify-between gap-3 px-1 py-2.5 text-start hover:bg-accent/50"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{u.name ?? u.username ?? u.userId}</p>
                    <p className="truncate text-xs text-muted-foreground">{u.username}</p>
                  </div>
                  <div className="flex flex-wrap justify-end gap-1">
                    {u.roles.map((r, i) => (
                      <Badge key={i} variant={r.superAdmin ? 'success' : 'secondary'} className="text-[10px]">
                        {r.name}
                      </Badge>
                    ))}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function EditExceptions({ userId,
  onChangeUser,
  catalogLoading,
}: {
  userId: number;
  onChangeUser: () => void;
  catalogLoading: boolean;
}) {
  const { ui } = useLocale();
  const catalog = useCatalog();
  const exQ = useUserExceptions(userId);
  const save = useSaveExceptions(userId);
  const clear = useClearExceptions(userId);
  const [draft, setDraft] = useState<Map<string, TriState>>(new Map());

  // baseline (role-derived) + server explicit exceptions
  const baseline = useMemo(() => {
    const m = new Map<string, Effect>();
    exQ.data?.cells.forEach((c) => m.set(cellId(c.resourceKey, c.actionKey), c.roleEffective));
    return m;
  }, [exQ.data]);
  const serverExplicit = useMemo(() => {
    const m = new Map<string, TriState>();
    exQ.data?.cells.forEach((c) => { if (c.explicit) m.set(cellId(c.resourceKey, c.actionKey), c.explicit); });
    return m;
  }, [exQ.data]);
  useEffect(() => setDraft(new Map(serverExplicit)), [serverExplicit]);

  const changes = useMemo(() => diffDraft(serverExplicit, draft), [serverExplicit, draft]);
  const dirty = changes.length > 0;

  const onClearAll = async () => {
    const ok = await confirm({
      title: ui('مسح كل الاستثناءات'),
      description: ui('سيتم إرجاع كل الخانات إلى وضع الوراثة من الأدوار.'),
      variant: 'destructive',
      confirmLabel: ui('مسح الكل'),
    });
    if (ok) clear.mutate();
  };

  const user = exQ.data?.user;
  const stats = exQ.data?.stats;

  return (
    <div className="space-y-6">
      <Header />

      {/* user summary bar */}
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-3">
          <div className="flex items-center gap-2">
            <UserCog className="size-5 text-primary" />
            <div>
              <p className="text-sm font-semibold">{user?.name ?? user?.username ?? userId}</p>
              <div className="flex flex-wrap gap-1">
                {exQ.data?.roles.map((r) => (
                  <Badge key={r.id} variant={r.isSuperAdmin ? 'success' : 'secondary'} className="text-[10px]">
                    {r.nameAr}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={onChangeUser}>
            {ui('تغيير المستخدم')}
          </Button>
        </CardContent>
      </Card>

      {exQ.isLoading || catalogLoading || catalog.isLoading ? (
        <Skeleton className="h-[60vh] w-full" />
      ) : exQ.data?.superAdmin ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-12 text-center">
            <ShieldCheck className="size-10 text-emerald-500" />
            <p className="max-w-md text-sm text-muted-foreground">
              {ui('هذا المستخدم لديه دور المدير العام الذي يتجاوز كل الصلاحيات، فلا حاجة لاستثناءات.')}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard title={ui('سماحات إضافية')} value={stats?.additionalAllows ?? 0} colorIndex={3} />
            <StatCard title={ui('منع صريح')} value={stats?.explicitDenies ?? 0} colorIndex={6} />
            <StatCard title={ui('موروثة من الأدوار')} value={stats?.inheritedFromRoles ?? 0} colorIndex={1} />
          </div>

          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/30 px-4 py-2">
              <p className="text-xs text-muted-foreground">
                {ui('الخانة الباهتة = موروثة من الأدوار. انقر للتبديل: وراثة ← سماح ← رفض.')}
                {dirty && <span className="font-semibold text-primary"> ({ar(changes.length)} {ui('تغيير غير محفوظ')})</span>}
              </p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={onClearAll} className="text-destructive">
                  <Eraser className="size-4" /> {ui('مسح الكل')}
                </Button>
                <Button size="sm" variant="outline" disabled={!dirty} onClick={() => setDraft(new Map(serverExplicit))}>
                  <RotateCcw className="size-4" /> {ui('تراجع')}
                </Button>
                <Button size="sm" variant="brand" disabled={!dirty || save.isPending} onClick={() => save.mutate(changes)}>
                  <Save className="size-4" /> {ui('حفظ')}
                </Button>
              </div>
            </div>
            {catalog.data && (
              <PermissionMatrix
                catalog={catalog.data}
                mode="exception"
                draft={draft}
                onChange={setDraft}
                baseline={baseline}
                editable
              />
            )}
          </Card>
        </>
      )}
    </div>
  );
}

function ar(n: number) {
  const { ui } = useLocale();
  return String(n).replace(/\d/g, (d) => ui('٠١٢٣٤٥٦٧٨٩')[Number(d)]);
}
