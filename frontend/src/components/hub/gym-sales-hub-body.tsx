import { useQuery } from '@tanstack/react-query';
import { BarChart as BarChartIcon, Package, Receipt, ShoppingCart, Truck, Wallet } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, Tooltip, XAxis, YAxis } from 'recharts';
import { StatCard } from '@/components/common/stat-card';
import { ChartCard, CHART_COLORS } from '@/components/common/chart-card';
import { DashboardTab } from '@/pages/inventory/dashboard-tab';
import { api } from '@/lib/api';
import { toArabicDigits } from '@/lib/utils';
import type { SupplierDashboardStats } from '@/types/gym-sales';
import { useLocale } from '@/store/locale';

interface QuickSaleSummary {
  totalSales?: number;
  totalRevenue?: number;
  todaySales?: number;
  todayRevenue?: number;
}

export function GymSalesHubBody() {
  const { ui } = useLocale();

  const { data: procurement, isLoading: procLoading } = useQuery({
    queryKey: ['supplier-dashboard', 'stats', 'hub'],
    queryFn: async () => (await api.get<SupplierDashboardStats>('/supplier-dashboard/stats')).data,
  });

  const { data: sales, isLoading: salesLoading } = useQuery({
    queryKey: ['quick-sales', 'stats', 'hub'],
    queryFn: async () => (await api.get<QuickSaleSummary>('/quick-sales/stats/summary')).data,
  });

  const procurementChart = procurement
    ? [
        { name: ui('أوامر الشراء'), value: procurement.totalPurchaseOrders },
        { name: ui('الفواتير'), value: procurement.totalInvoices },
        { name: ui('الموردون'), value: procurement.totalSuppliers },
      ].filter((d) => d.value > 0)
    : [];

  return (
    <div className="space-y-8">
      <DashboardTab />

      <section className="space-y-4">
        <h2 className="text-sm font-bold text-muted-foreground">{ui('المشتريات والمبيعات')}</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            title={ui('أوامر الشراء')}
            value={procLoading ? '…' : toArabicDigits(procurement?.totalPurchaseOrders ?? 0)}
            icon={<ShoppingCart className="size-5" />}
            colorIndex={0}
            loading={procLoading}
          />
          <StatCard
            title={ui('قيمة المشتريات')}
            value={procLoading ? '…' : toArabicDigits(Math.round(procurement?.totalPurchaseValue ?? 0))}
            icon={<Truck className="size-5" />}
            colorIndex={1}
            loading={procLoading}
          />
          <StatCard
            title={ui('مبيعات اليوم')}
            value={salesLoading ? '…' : toArabicDigits(sales?.todaySales ?? 0)}
            icon={<Receipt className="size-5" />}
            colorIndex={2}
            loading={salesLoading}
          />
          <StatCard
            title={ui('إيراد اليوم')}
            value={salesLoading ? '…' : toArabicDigits(Math.round(sales?.todayRevenue ?? 0))}
            icon={<Wallet className="size-5" />}
            colorIndex={3}
            loading={salesLoading}
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard
            title={ui('نشاط المشتريات')}
            icon={Package}
            loading={procLoading}
            isEmpty={!procLoading && procurementChart.length === 0}
            emptyText={ui('لا توجد بيانات')}
            height={240}
          >
            <PieChart>
              <Pie data={procurementChart} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3}>
                {procurementChart.map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(v: number) => toArabicDigits(v)} />
              <Legend />
            </PieChart>
          </ChartCard>

          <ChartCard
            title={ui('إجمالي المبيعات')}
            icon={BarChartIcon}
            loading={salesLoading}
            isEmpty={!salesLoading && !sales?.totalSales}
            emptyText={ui('لا توجد بيانات')}
            height={240}
          >
            <BarChart
              data={[
                { name: ui('الفواتير'), value: sales?.totalSales ?? 0 },
                { name: ui('الإيراد'), value: Math.round(sales?.totalRevenue ?? 0) },
              ]}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={(v) => toArabicDigits(v)} />
              <Tooltip formatter={(v: number) => toArabicDigits(v)} />
              <Bar dataKey="value" fill="#ED1C24" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ChartCard>
        </div>
      </section>
    </div>
  );
}
