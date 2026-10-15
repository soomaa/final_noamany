import { useMemo } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/common/page-header';
import { QuickAccessGrid } from '@/components/hub/quick-access';
import { SectionDashboard } from '@/components/hub/section-insights';
import { useSectionQuickAccess } from '@/hooks/use-section-quick-access';
import { ACCOUNTING_ROUTES as AC } from '@/lib/accounting-routes';
import { CAFE_ROUTES as CR } from '@/lib/cafe-routes';
import { FINANCE_ROUTES as FR } from '@/lib/finance-routes';
import {
  NAV_SECTIONS,
  navSectionDescKey,
  translateNavRoute,
  navSectionKey,
  sectionRoutePaths,
  type NavSection,
} from '@/lib/nav';
import { usePermission, useHomeRoute } from '@/hooks/use-permission';
import { useLocale } from '@/store/locale';

/** Default shortcuts shown until the user builds visit history. */
const SECTION_FALLBACK: Record<string, string[]> = {
  'gym-sales': [CR.pos, CR.products, CR.reports, CR.dashboard],
  hr: ['/employees', '/employees/new', '/hr/partners'],
  'financial-reports': [FR.dashboard, FR.expenses, FR.revenues, FR.profitLoss],
  accounting: [AC.ledger.journalEntries, AC.ledger.chartOfAccounts, AC.statements.trialBalance, AC.statements.incomeStatement],
  admin: ['/users', '/admin/roles', '/org/branches', '/company'],
  settings: ['/users', '/admin/roles', '/org/branches', '/company'],
};

export function DepartmentHubPage() {
  const { section: sectionId } = useParams<{ section: string }>();
  const { t } = useLocale();
  const { canRoute, isReady } = usePermission();
  const { homeRoute } = useHomeRoute();

  const resolvedId = sectionId === 'settings' ? 'admin' : sectionId;
  const section: NavSection | undefined = NAV_SECTIONS.find((s) => s.id === resolvedId);

  const allowed = useMemo(() => {
    if (!section) return [];
    const paths = sectionRoutePaths(section.id);
    if (!isReady) return paths;
    return paths.filter((to) => canRoute(to));
  }, [section, isReady, canRoute]);

  if (sectionId === 'gym-sales') {
    return <Navigate to={CR.pos} replace />;
  }

  if (sectionId === 'financial-reports') {
    return <Navigate to={FR.dashboard} replace />;
  }

  if (!section) return <Navigate to={homeRoute} replace />;
  const fallback = SECTION_FALLBACK[section.id] ?? [];
  const quickRoutes = useSectionQuickAccess(section.id, allowed, fallback);
  const pinned = quickRoutes.map((to) => ({ to, label: translateNavRoute(t, to) }));

  const desc = t(navSectionDescKey(section.id));

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={t('nav.modules')}
        title={t(navSectionKey(section.id))}
        description={desc !== navSectionDescKey(section.id) ? desc : undefined}
      />

      {pinned.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-bold text-muted-foreground">{t('hub.quickActions')}</h2>
          <QuickAccessGrid items={pinned} />
        </section>
      )}

      <SectionDashboard sectionId={section.id} />
    </div>
  );
}
