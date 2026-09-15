import { useQuery } from '@tanstack/react-query';
import { FileText, Gift, Mail, Newspaper, Users } from 'lucide-react';
import { Cell, Legend, Pie, PieChart, Tooltip } from 'recharts';
import { StatCard } from '@/components/common/stat-card';
import { ChartCard, CHART_COLORS } from '@/components/common/chart-card';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';

type InvitationStatus = 'pending' | 'accepted' | 'rejected' | 'attended';

async function fetchInvitationCount(status: InvitationStatus) {
  const { data } = await api.get<unknown[]>(`/app/invitations/status/${status}`);
  return data.length;
}

export function AppManagementDashboardBody() {
  const { ui } = useLocale();

  const { data: stats, isLoading } = useQuery({
    queryKey: ['app', 'hub', 'summary'],
    queryFn: async () => {
      const [pending, accepted, attended, rejected, offers, news, trainers] = await Promise.all([
        fetchInvitationCount('pending'),
        fetchInvitationCount('accepted'),
        fetchInvitationCount('attended'),
        fetchInvitationCount('rejected'),
        api.get<{ data: unknown[] }>('/app/offers', { params: { page: 1, pageSize: 500 } }).then((r) => r.data.data?.length ?? 0).catch(() => 0),
        api.get<{ data: unknown[] }>('/app/news', { params: { page: 1, pageSize: 500 } }).then((r) => r.data.data?.length ?? 0).catch(() => 0),
        api.get<{ data: unknown[] }>('/app/trainers', { params: { page: 1, pageSize: 500 } }).then((r) => r.data.data?.length ?? 0).catch(() => 0),
      ]);
      return { pending, accepted, attended, rejected, offers, news, trainers };
    },
  });

  const invitationChart = stats
    ? [
        { name: ui('مرسلة'), value: stats.pending },
        { name: ui('مقبولة'), value: stats.accepted },
        { name: ui('حضور'), value: stats.attended },
        { name: ui('مرفوضة'), value: stats.rejected },
      ].filter((d) => d.value > 0)
    : [];

  const contentChart = stats
    ? [
        { name: ui('العروض'), value: stats.offers },
        { name: ui('الأخبار'), value: stats.news },
        { name: ui('المدربون'), value: stats.trainers },
      ].filter((d) => d.value > 0)
    : [];

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
        <StatCard title={ui('دعوات معلقة')} value={stats?.pending ?? 0} icon={<Mail className="size-5" />} colorIndex={4} />
        <StatCard title={ui('دعوات مقبولة')} value={stats?.accepted ?? 0} icon={<Users className="size-5" />} colorIndex={3} />
        <StatCard title={ui('العروض النشطة')} value={stats?.offers ?? 0} icon={<Gift className="size-5" />} colorIndex={0} />
        <StatCard title={ui('الأخبار')} value={stats?.news ?? 0} icon={<Newspaper className="size-5" />} colorIndex={6} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title={ui('توزيع الدعوات')}
          icon={Mail}
          isEmpty={invitationChart.length === 0}
          emptyText={ui('لا توجد دعوات بعد')}
          height={260}
        >
          <PieChart>
            <Pie data={invitationChart} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3}>
              {invitationChart.map((_, i) => (
                <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip formatter={(v: number) => toArabicDigits(v)} />
            <Legend />
          </PieChart>
        </ChartCard>

        <ChartCard
          title={ui('محتوى التطبيق')}
          icon={FileText}
          isEmpty={contentChart.length === 0}
          emptyText={ui('لا يوجد محتوى بعد')}
          height={260}
        >
          <PieChart>
            <Pie data={contentChart} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3}>
              {contentChart.map((_, i) => (
                <Cell key={i} fill={CHART_COLORS[(i + 2) % CHART_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip formatter={(v: number) => toArabicDigits(v)} />
            <Legend />
          </PieChart>
        </ChartCard>
      </div>
    </div>
  );
}
