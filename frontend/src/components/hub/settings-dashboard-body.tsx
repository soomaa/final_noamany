import { BarChart as BarChartIcon, KeyRound, Shield, Users } from 'lucide-react';
import { Bar as RechartsBar, BarChart as RechartsBarChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts';
import { StatCard } from '@/components/common/stat-card';
import { ChartCard } from '@/components/common/chart-card';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useAudit, useRbacUsers, useRoles } from '@/hooks/use-rbac';
import { toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';

export function SettingsDashboardBody() {
  const { ui } = useLocale();
  const { data: roles, isLoading: rolesLoading } = useRoles();
  const { data: users, isLoading: usersLoading } = useRbacUsers('');
  const { data: audit, isLoading: auditLoading } = useAudit(0, 8);

  const roleChart = (roles?.roles ?? []).slice(0, 8).map((r) => ({
    name: r.nameAr.length > 12 ? `${r.nameAr.slice(0, 10)}…` : r.nameAr,
    users: r.users,
  }));

  const isLoading = rolesLoading || usersLoading;

  if (isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title={ui('المستخدمون')} value={users?.length ?? 0} icon={<Users className="size-5" />} colorIndex={0} />
        <StatCard title={ui('الأدوار')} value={roles?.roles?.length ?? 0} icon={<Shield className="size-5" />} colorIndex={3} />
        <StatCard title={ui('فتحات الأدوار')} value={roles?.totalSlots ?? 0} icon={<KeyRound className="size-5" />} colorIndex={6} />
        <StatCard title={ui('سجلات التدقيق')} value={audit?.total ?? 0} icon={<BarChartIcon className="size-5" />} colorIndex={1} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title={ui('المستخدمون حسب الدور')}
          icon={Shield}
          isEmpty={roleChart.length === 0}
          emptyText={ui('لا توجد أدوار بعد')}
          height={260}
        >
          <RechartsBarChart data={roleChart} layout="vertical" margin={{ left: 8, right: 16 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" tickFormatter={(v) => toArabicDigits(v)} />
            <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 11 }} />
            <Tooltip formatter={(v: number) => toArabicDigits(v)} />
            <RechartsBar dataKey="users" name={ui('مستخدمون')} fill="#ED1C24" radius={[0, 4, 4, 0]} />
          </RechartsBarChart>
        </ChartCard>

        <Card className="border-border/70 shadow-sm">
          <CardHeader className="border-b border-border/60 bg-muted/20">
            <CardTitle className="text-base">{ui('آخر نشاطات النظام')}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {auditLoading ? (
              <div className="space-y-2 p-4">
                {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : !audit?.rows?.length ? (
              <p className="p-6 text-center text-sm text-muted-foreground">{ui('لا توجد سجلات بعد')}</p>
            ) : (
              <ul className="divide-y divide-border/60">
                {audit.rows.map((row) => (
                  <li key={row.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                    <span className="min-w-0 truncate font-medium">{row.action}</span>
                    <span className="shrink-0 text-xs text-muted-foreground nums">{row.createdAt?.slice(0, 10) ?? '—'}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
