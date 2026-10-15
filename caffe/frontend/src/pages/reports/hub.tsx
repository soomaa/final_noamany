import {
  BarChart3,
  CalendarClock,
  ClipboardList,
  Coins,
  CreditCard,
  DollarSign,
  Dumbbell,
  FileBarChart,
  Landmark,
  LineChart,
  Lock,
  LogIn,
  PiggyBank,
  Receipt,
  Repeat,
  ShieldAlert,
  UserPlus,
  Users,
  Wallet,
} from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/common/page-header';
import { getReportKeys } from '@/lib/i18n-constants';
import { useLocale } from '@/store/locale';

interface QuickReport {
  href: string;
  title: string;
  desc: string;
  icon: typeof FileBarChart;
}

/** Curated shortcut list surfaced above the auto-generated HR grid. */
function useFeatureReports(): { group: string; items: QuickReport[] }[] {
  const { ui } = useLocale();
  return [
    {
      group: ui('تقارير النادي'),
      items: [
        { href: '/reports/club/members-daily', title: ui('الأعضاء خلال فترة'), desc: ui('كل التسجيلات الجديدة'), icon: UserPlus },
        { href: '/reports/club/subscriptions-daily', title: ui('الاشتراكات خلال فترة'), desc: ui('اشتراكات الفترة كاملة'), icon: Receipt },
        { href: '/reports/club/subscriptions-expired', title: ui('الاشتراكات المنتهية'), desc: ui('كل الاشتراكات المنتهية'), icon: ShieldAlert },
        { href: '/reports/club/subscriptions-active', title: ui('الاشتراكات النشطة'), desc: ui('الاشتراكات السارية'), icon: CalendarClock },
        { href: '/reports/club/subscriptions-expiring', title: ui('اشتراكات ستنتهي قريباً'), desc: ui('تنتهي خلال 7 أيام'), icon: CalendarClock },
        { href: '/reports/club/subscription-sessions', title: ui('حصص الاشتراكات'), desc: ui('الاشتراكات المرتبطة بحصص'), icon: Repeat },
        { href: '/club/subscriptions/reports', title: ui('تقارير الاشتراكات'), desc: ui('الاشتراكات والتحصيل والمبيعات والخدمات'), icon: Users },
        { href: '/reports/club/attendance', title: ui('الحضور والانصراف'), desc: ui('سجلات دخول وخروج الأعضاء'), icon: LogIn },
        { href: '/reports/club/trainers', title: ui('المدربين'), desc: ui('قائمة المدربين والتخصصات'), icon: Dumbbell },
        { href: '/reports/club/lockers', title: ui('اللوكر خلال فترة'), desc: ui('حجوزات اللوكرات'), icon: Lock },
      ],
    },
    {
      group: ui('التقارير المالية'),
      items: [
        { href: '/reports/finance/revenue', title: ui('الإيرادات'), desc: ui('إيرادات الفترة حسب المصدر'), icon: DollarSign },
        { href: '/reports/finance/expenses', title: ui('المصروفات'), desc: ui('مصروفات الفترة حسب التصنيف'), icon: Coins },
        { href: '/reports/finance/pnl', title: ui('الأرباح والخسائر'), desc: ui('صافي الربح خلال الفترة'), icon: BarChart3 },
        { href: '/reports/finance/cash-flow', title: ui('التدفقات النقدية'), desc: ui('حركة النقد شهرياً'), icon: LineChart },
        { href: '/reports/finance/treasury', title: ui('الخزينة'), desc: ui('الرصيد النقدي المتاح'), icon: Landmark },
        { href: '/reports/finance/payment-methods', title: ui('طرق الدفع'), desc: ui('كاش · فيزا · تحويل'), icon: CreditCard },
        { href: '/reports/finance/outstanding', title: ui('سداد المتبقي'), desc: ui('اشتراكات لها مبلغ متبقٍ'), icon: PiggyBank },
      ],
    },
  ];
}

export function ReportsHubPage() {
  const { ui, t } = useLocale();
  const reports = useMemo(() => getReportKeys(t), [t]);
  const groups = useMemo(() => [...new Set(reports.map((r) => r.group))], [reports]);
  const featureGroups = useFeatureReports();

  return (
    <div>
      <PageHeader title={ui('التقارير')} description={ui('تقارير النادي والمالية وشؤون الموظفين')} />

      <div className="space-y-10">
        {/* Feature reports (club + finance) — surfaced first */}
        {featureGroups.map((group) => (
          <section key={group.group}>
            <h2 className="mb-4 text-lg font-semibold">{group.group}</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {group.items.map((r) => {
                const Icon = r.icon;
                return (
                  <Link key={r.href} to={r.href}>
                    <Card className="group h-full rounded-2xl border-border/60 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md">
                      <CardHeader>
                        <div className="mb-2 flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                          <Icon className="size-5" />
                        </div>
                        <CardTitle className="text-base">{r.title}</CardTitle>
                        <CardDescription>{r.desc}</CardDescription>
                      </CardHeader>
                    </Card>
                  </Link>
                );
              })}
            </div>
          </section>
        ))}

        {/* Legacy HR reports (unchanged auto-generated grid) */}
        {groups.map((group) => (
          <section key={group}>
            <h2 className="mb-4 text-lg font-semibold">{group}</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {reports.filter((r) => r.group === group).map((report) => (
                <Link key={report.key} to={`/reports/${report.key}`}>
                  <Card className="group h-full rounded-2xl border-border/60 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md">
                    <CardHeader>
                      <div className="mb-2 flex size-10 items-center justify-center rounded-lg bg-muted/60 text-muted-foreground transition-colors group-hover:bg-primary/10 group-hover:text-primary">
                        <ClipboardList className="size-5" />
                      </div>
                      <CardTitle className="text-base">{report.title}</CardTitle>
                      <CardDescription>{ui('تصفية · تصدير · طباعة')}</CardDescription>
                    </CardHeader>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

// keep unused-import lints quiet if some icons are removed later
void Wallet;
