import { useQuery } from '@tanstack/react-query';
import { Coins, Contact, Dumbbell, LayoutDashboard, Settings2, Target, Wallet } from 'lucide-react';
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { TrainerCommissionPanel } from '@/components/club/trainer-commission-panel';
import {
  SalesLeaderboardPanel,
  TrainerPerformanceCards,
  type TrainerCardPerformance,
} from '@/components/club/sales-team-board';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useBranches } from '@/hooks/use-branches';
import { usePermission } from '@/hooks/use-permission';
import { api } from '@/lib/api';
import { formatMoney, localToday } from '@/lib/formatters';
import { cn, toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';
import type { TrainerPerformanceResponse } from '@/types/fitness';
import { FitnessTrainersPage } from './index';

type AdminSection = 'overview' | 'team' | 'profiles' | 'settings';

function sectionFromSearch(search: string): AdminSection {
  const tab = new URLSearchParams(search).get('tab');
  if (tab === 'team' || tab === 'profiles' || tab === 'settings') return tab;
  return 'overview';
}

export function FitnessTrainersAdminPage() {
  const { ui } = useLocale();
  const { can } = usePermission();
  const navigate = useNavigate();
  const { search } = useLocation();
  const [section, setSection] = useState<AdminSection>(() => sectionFromSearch(search));
  const canViewFinance = can('club.fitness.trainer_payments:view') || can('club.fitness.trainer_settings:view');
  const canViewSettings = canViewFinance || can('club.sales.settings:view') || can('club.sales.settings:configure');
  // ملفات المدربين — photo, specializations and presence days the member app shows.
  const canViewProfiles = can('club.fitness.trainers:view');

  const today = localToday();
  const [dateFrom, setDateFrom] = useState(`${today.slice(0, 7)}-01`);
  const [dateTo, setDateTo] = useState(today);
  const [branchId, setBranchId] = useState('');
  const { data: branches } = useBranches();
  const [quickView, setQuickView] = useState<TrainerCardPerformance | null>(null);

  const statsQuery = useQuery({
    queryKey: ['club-trainers', 'statistics'],
    queryFn: async () => (await api.get<{ total: number; active: number; inactive: number }>('/club-trainers/statistics')).data,
  });

  const performanceQuery = useQuery({
    queryKey: ['club-trainers', 'performance', 'admin', { dateFrom, dateTo, branchId }],
    queryFn: async () => (await api.get<TrainerPerformanceResponse>('/club-trainers/performance', {
      params: { dateFrom, dateTo, branchId: branchId || undefined, page: 1, pageSize: 200 },
    })).data,
    enabled: canViewFinance,
  });

  const cards: TrainerCardPerformance[] = (performanceQuery.data?.data ?? []).map((row) => ({
    trainerId: row.trainerId,
    name: row.name,
    sessions: row.sessions,
    revenue: row.revenue,
    target: row.target,
    targetUnit: row.targetUnit,
    achievementPct: row.achievementPct,
    // The performance row exposes the outstanding balance as `remaining`; there is no
    // `commissionDue` field on the API payload.
    commissionDue: row.remaining,
  }));

  const leaderboardRows = [...cards]
    .sort((a, b) => b.achievementPct - a.achievementPct || a.name.localeCompare(b.name, 'ar'))
    .map((row, index) => ({
      rank: index + 1,
      employeeId: row.trainerId,
      name: row.name,
      achievementPct: row.achievementPct,
      actual: row.revenue,
      commissionDue: row.commissionDue,
    }));

  const selectSection = (next: AdminSection) => {
    setSection(next);
    navigate({ pathname: '/club/fitness/trainers', search: next === 'overview' ? '' : `?tab=${next}` }, { replace: true });
  };

  return (
    <div className="space-y-5 pb-8">
      <PageHeader
        title={ui('إدارة المدربين')}
        description={ui('راقب أداء المدربين، تابع الحصص والإيرادات، واضبط التارجت والعمولة.')}
        actions={canViewFinance ? (
          <>
            <Input aria-label={ui('من تاريخ')} type="date" className="w-40 nums" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
            <Input aria-label={ui('إلى تاريخ')} type="date" className="w-40 nums" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
          </>
        ) : undefined}
      />

      <TrainerAdminTabs value={section} onChange={selectSection} showSettings={canViewSettings} showProfiles={canViewProfiles} />

      {section === 'overview' ? (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard icon={Dumbbell} label={ui('إجمالي المدربين')} value={toArabicDigits(statsQuery.data?.total ?? 0)} />
            <StatCard icon={Dumbbell} label={ui('نشط')} value={toArabicDigits(statsQuery.data?.active ?? 0)} />
            <StatCard icon={Dumbbell} label={ui('غير نشط')} value={toArabicDigits(statsQuery.data?.inactive ?? 0)} />
            {canViewFinance ? (
              <StatCard icon={Coins} label={ui('إجمالي الإيراد')} value={formatMoney(performanceQuery.data?.totals.revenue ?? 0)} />
            ) : null}
          </div>
          {canViewFinance ? (
            <SalesLeaderboardPanel
              rows={leaderboardRows}
              loading={performanceQuery.isLoading}
              showFinancials
              onSelect={(row) => {
                const found = cards.find((card) => card.trainerId === row.employeeId);
                if (found) setQuickView(found);
              }}
            />
          ) : null}
        </div>
      ) : null}

      {section === 'team' ? (
        canViewFinance ? (
          <div className="space-y-3">
            <div className="surface-card flex flex-wrap items-end gap-3 rounded-xl border p-4">
              <div className="grid min-w-48 gap-1">
                <Label>{ui('الفرع')}</Label>
                <select
                  className="h-10 rounded-md border bg-background px-3 text-sm"
                  value={branchId}
                  onChange={(event) => setBranchId(event.target.value)}
                >
                  <option value="">{ui('كل الفروع')}</option>
                  {(branches ?? []).map((branch) => (
                    <option key={branch.id} value={branch.id}>{branch.name || `${ui('فرع')} ${branch.id}`}</option>
                  ))}
                </select>
              </div>
            </div>
            <TrainerPerformanceCards
              rows={cards}
              loading={performanceQuery.isLoading}
              error={performanceQuery.isError}
              onRetry={() => void performanceQuery.refetch()}
              onSelect={setQuickView}
              profileMode="performance"
            />
          </div>
        ) : (
          <FitnessTrainersPage embedded />
        )
      ) : null}

      {section === 'profiles' && canViewProfiles ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {ui('الصورة والتخصصات وأيام التواجد تظهر للأعضاء والزائرين في ملف المدرب داخل التطبيق.')}
          </p>
          <FitnessTrainersPage embedded />
        </div>
      ) : null}

      {section === 'settings' && canViewSettings ? (
        <div className="space-y-5">
          <TrainerCommissionPanel />
        </div>
      ) : null}

      <TrainerQuickDialog
        trainer={quickView}
        onOpenChange={(open) => !open && setQuickView(null)}
        onOpenProfile={(id) => navigate(`/club/fitness/trainers/${id}`)}
      />
    </div>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: typeof Dumbbell; label: string; value: string }) {
  return (
    <div className="surface-card rounded-xl border p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-muted-foreground">{label}</p>
        <Icon className="size-4 text-primary" />
      </div>
      <p className="nums mt-2 text-xl font-bold">{value}</p>
    </div>
  );
}

function TrainerAdminTabs({
  value,
  onChange,
  showSettings,
  showProfiles,
}: {
  value: AdminSection;
  onChange: (value: AdminSection) => void;
  showSettings: boolean;
  showProfiles: boolean;
}) {
  const { ui } = useLocale();
  const options = [
    { value: 'overview' as const, label: ui('نظرة عامة'), icon: LayoutDashboard },
    { value: 'team' as const, label: ui('المدربين'), icon: Dumbbell },
    ...(showProfiles ? [{ value: 'profiles' as const, label: ui('ملفات المدربين'), icon: Contact }] : []),
    ...(showSettings ? [{ value: 'settings' as const, label: ui('التارجت والعمولة'), icon: Settings2 }] : []),
  ];
  const columns = ['grid-cols-2', 'grid-cols-2', 'grid-cols-3', 'grid-cols-4'][Math.min(options.length, 4) - 1];
  return (
    <div className="flex justify-center">
      <div
        role="tablist"
        aria-label={ui('أقسام إدارة المدربين')}
        className={cn('grid w-full max-w-3xl gap-1 rounded-xl bg-muted/55 p-1.5', columns)}
      >
        {options.map((option) => {
          const active = value === option.value;
          const Icon = option.icon;
          return (
            <button
              key={option.value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(option.value)}
              className={cn(
                'flex min-h-11 min-w-0 items-center justify-center gap-1 rounded-[10px] px-1 text-[11px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:gap-2 sm:px-3 sm:text-sm',
                active ? 'bg-card text-foreground shadow-sm ring-1 ring-border/70' : 'text-muted-foreground hover:bg-card/70 hover:text-foreground',
              )}
            >
              <Icon className={cn('size-4', active && 'text-primary')} />
              <span>{option.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TrainerQuickDialog({
  trainer,
  onOpenChange,
  onOpenProfile,
}: {
  trainer: TrainerCardPerformance | null;
  onOpenChange: (open: boolean) => void;
  onOpenProfile: (id: number) => void;
}) {
  const { ui } = useLocale();
  return (
    <Dialog open={!!trainer} onOpenChange={onOpenChange}>
      <DialogContent size="sm" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{trainer?.name}</DialogTitle>
        </DialogHeader>
        {trainer ? (
          <div className="grid grid-cols-3 gap-3 py-2">
            <QuickStat icon={Target} label={ui('حصص')} value={toArabicDigits(trainer.sessions)} />
            <QuickStat icon={Coins} label={ui('إيراد')} value={formatMoney(trainer.revenue)} />
            <QuickStat icon={Wallet} label={ui('عمولة مستحقة')} value={formatMoney(trainer.commissionDue)} />
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="brand" onClick={() => trainer && onOpenProfile(trainer.trainerId)}>{ui('الملف الكامل')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function QuickStat({ icon: Icon, label, value }: { icon: typeof Target; label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-muted/30 p-3 text-center">
      <Icon className="mx-auto size-4 text-primary" />
      <p className="mt-1 text-xs font-semibold text-muted-foreground">{label}</p>
      <p className="nums mt-1 text-sm font-bold">{value}</p>
    </div>
  );
}
