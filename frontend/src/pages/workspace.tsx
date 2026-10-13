import { ArrowLeft, BriefcaseBusiness, LockKeyhole, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { WorkspaceWidgets } from '@/components/workspace/workspace-widgets';
import { type NavApiNode, useNav, useWorkspace } from '@/hooks/use-permission';
import { useAuth } from '@/store/auth';
import { useLocale } from '@/store/locale';

type WorkAction = Pick<NavApiNode, 'key' | 'nameAr' | 'nameEn' | 'route' | 'icon'> & { route: string };

function collectActions(nodes: NavApiNode[]): WorkAction[] {
  return nodes.flatMap((node) => [
    ...(node.clickable && node.route
      ? [{ key: node.key, nameAr: node.nameAr, nameEn: node.nameEn, route: node.route, icon: node.icon }]
      : []),
    ...collectActions(node.children),
  ]);
}

export function WorkspacePage() {
  const { user } = useAuth();
  const { ui } = useLocale();
  const { data: nav, isLoading: navLoading } = useNav();
  const { data: workspace } = useWorkspace();
  const actions = collectActions(nav ?? []).slice(0, 12);
  const role = user?.job_title?.trim() || workspace?.roleHint || ui('موظف');

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-3xl border bg-gradient-to-br from-brand-600 via-brand-500 to-rose-500 p-6 text-white shadow-lg sm:p-8">
        <div className="pointer-events-none absolute -end-12 -top-16 size-52 rounded-full bg-white/10 blur-2xl" />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-2 flex items-center gap-2 text-sm font-medium text-white/80"><Sparkles className="size-4" />{ui('مساحة العمل الشخصية')}</p>
            <h1 className="text-2xl font-extrabold sm:text-3xl">{ui('أهلاً')}، {user?.name || ui('بك')}</h1>
            <p className="mt-2 text-sm text-white/85">{role}</p>
          </div>
          <div className="rounded-2xl bg-black/15 px-4 py-3 text-sm backdrop-blur-sm">
            <span className="block text-white/70">{ui('الأدوات المتاحة')}</span>
            <strong className="text-lg">{actions.length}</strong>
          </div>
        </div>
      </section>

      <WorkspaceWidgets />

      <section aria-labelledby="workspace-actions-title">
        <div className="mb-3 flex items-center gap-2">
          <BriefcaseBusiness className="size-5 text-primary" />
          <div>
            <h2 id="workspace-actions-title" className="font-bold">{ui('مهامي وأدواتي')}</h2>
            <p className="text-sm text-muted-foreground">{ui('هذه الروابط هي فقط ما تسمح به صلاحياتك الحالية.')}</p>
          </div>
        </div>

        {navLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{[1, 2, 3].map((key) => <div key={key} className="h-24 animate-pulse rounded-2xl bg-muted" />)}</div>
        ) : actions.length ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {actions.map((action) => (
              <Link to={action.route} key={action.key} className="group">
                <Card className="h-full transition-all group-hover:-translate-y-0.5 group-hover:border-primary/45 group-hover:shadow-md">
                  <CardHeader className="flex-row items-center gap-3 space-y-0 pb-2">
                    <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><BriefcaseBusiness className="size-5" /></span>
                    <div className="min-w-0 flex-1">
                      <CardTitle className="truncate text-base">{action.nameAr}</CardTitle>
                      <CardDescription className="truncate">{action.nameEn ?? ui('أداة عمل')}</CardDescription>
                    </div>
                    <ArrowLeft className="size-4 text-muted-foreground transition-transform group-hover:-translate-x-1" />
                  </CardHeader>
                </Card>
              </Link>
            ))}
          </div>
        ) : (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
              <LockKeyhole className="size-7 text-muted-foreground" />
              <p className="font-semibold">{ui('لا توجد أدوات تشغيلية مضافة إلى حسابك حالياً')}</p>
              <p className="text-sm text-muted-foreground">{ui('تواصل مع المسؤول إذا احتجت صلاحية إضافية.')}</p>
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}
