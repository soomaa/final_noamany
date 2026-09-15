import { useMemo } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/common/page-header';
import { QuickAccessGrid } from '@/components/hub/quick-access';
import { SectionDashboard } from '@/components/hub/section-insights';
import { useSectionQuickAccess } from '@/hooks/use-section-quick-access';
import { ACCOUNTING_ROUTES as AC } from '@/lib/accounting-routes';
import { APP_MANAGEMENT_ROUTES as AM } from '@/lib/app-management-routes';
import { PORTAL_ROUTES as PR } from '@/lib/portal-routes';
import { CLUB_ROUTES as CR } from '@/lib/club-routes';
import { FINANCE_ROUTES as FR } from '@/lib/finance-routes';
import { GYM_SALES_ROUTES as GS } from '@/lib/gym-sales-routes';
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
  club: [CR.members.reception, CR.members.management, CR.subscriptions.list, CR.lockers.list],
  'gym-sales': [CR.cafe.pos, GS.inventory.gymIssue, CR.cafe.products, GS.inventory.products],
  'financial-reports': [FR.expenses, FR.revenues, FR.profitLoss, FR.analysis],
  accounting: [AC.ledger.journalEntries, AC.ledger.chartOfAccounts, AC.statements.trialBalance, AC.statements.incomeStatement],
  'app-management': [AM.invitations.sent, AM.offers, AM.news, AM.trainers],
  'portal-management': [PR.company, PR.messages, PR.jobs, PR.orders],
  hr: ['/employees', '/attendance', '/payroll/runs', '/reports'],
  settings: ['/users', '/admin/roles', '/settings/automation', '/settings/gym-policies', '/company'],
};

export function DepartmentHubPage() {
  const { section: sectionId } = useParams<{ section: string }>();
  const { t } = useLocale();
  const { canRoute, isReady } = usePermission();
  const { homeRoute } = useHomeRoute();

  if (sectionId === 'gym-sales') {
    return <Navigate to={CR.cafe.pos} replace />;
  }

  const section: NavSection | undefined = NAV_SECTIONS.find((s) => s.id === sectionId);
  if (!section) return <Navigate to={homeRoute} replace />;

  const allowed = useMemo(() => {
    const paths = sectionRoutePaths(section.id);
    if (!isReady) return paths;
    return paths.filter((to) => canRoute(to));
  }, [section.id, isReady, canRoute]);
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
