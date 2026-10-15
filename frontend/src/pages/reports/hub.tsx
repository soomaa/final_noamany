import { ClipboardList } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/common/page-header';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getReportKeys } from '@/lib/i18n-constants';
import { getReportShortcutGroups } from '@/ports/report-shortcut-registry';
import { useLocale } from '@/store/locale';

export function ReportsHubPage() {
  const { ui, t } = useLocale();
  const reports = useMemo(() => getReportKeys(t), [t]);
  const groups = useMemo(() => [...new Set(reports.map((report) => report.group))], [reports]);
  const featureGroups = getReportShortcutGroups();

  return (
    <div>
      <PageHeader title={ui('التقارير')} description={ui('تقارير الموارد البشرية وشؤون الموظفين')} />
      <div className="space-y-10">
        {featureGroups.map((group) => (
          <section key={group.group}>
            <h2 className="mb-4 text-lg font-semibold">{ui(group.group)}</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {group.items.map((report) => {
                const Icon = report.icon;
                return (
                  <Link key={`${report.href}:${report.title}`} to={report.href}>
                    <Card className="group h-full rounded-2xl border-border/60 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md">
                      <CardHeader>
                        <div className="mb-2 flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                          <Icon className="size-5" />
                        </div>
                        <CardTitle className="text-base">{ui(report.title)}</CardTitle>
                        <CardDescription>{ui(report.description)}</CardDescription>
                      </CardHeader>
                    </Card>
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
        {groups.map((group) => (
          <section key={group}>
            <h2 className="mb-4 text-lg font-semibold">{group}</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {reports.filter((report) => report.group === group).map((report) => (
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
