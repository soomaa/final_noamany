import type { ColumnDef } from '@tanstack/react-table';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Coins, Star, Target, Wallet } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { DataTable } from '@/components/common/data-table';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import { useArrayResource } from '@/lib/api-hooks';
import { formatMoney, localToday } from '@/lib/formatters';
import { toArabicDigits } from '@/lib/utils';
import type { TrainerPerformanceResponse, TrainerPerformanceRow } from '@/types/fitness';
import { clampAchievement, profilePath } from './trainer-workspace-model';
import { useLocale } from '@/store/locale';

export function FitnessTrainerPerformancePage() {
  const { ui } = useLocale();
  const today = localToday();
  const [dateFrom, setDateFrom] = useState(`${today.slice(0, 7)}-01`);
  const [dateTo, setDateTo] = useState(today);
  const [branchId, setBranchId] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState('');
  const { data: branches } = useArrayResource<{ id: number; name: string | null }>('branches');
  const query = useQuery({
    queryKey: ['club-trainers', 'performance', { dateFrom, dateTo, branchId, page, pageSize, search }],
    queryFn: async () => (await api.get<TrainerPerformanceResponse>('/club-trainers/performance', { params: { dateFrom, dateTo, branchId: branchId || undefined, page, pageSize, search: search || undefined } })).data,
    retry: false,
  });
  const columns = useMemo<ColumnDef<TrainerPerformanceRow>[]>(() => [
    { accessorKey: 'name', header: ui('المدرب'), cell: ({ row }) => <div><p className="font-semibold">{row.original.name}</p><p className="text-xs text-muted-foreground">{row.original.specialization || '—'}</p></div> },
    { accessorKey: 'sessions', header: ui('الحصص'), cell: ({ getValue }) => <span className="nums">{toArabicDigits(Number(getValue()))}</span> },
    { accessorKey: 'revenue', header: ui('الإيراد'), cell: ({ getValue }) => formatMoney(Number(getValue())) },
    { accessorKey: 'achievementPct', header: ui('تحقيق التارجت'), cell: ({ getValue }) => { const pct = clampAchievement(Number(getValue())); return <div className="min-w-28"><div className="flex justify-between text-xs"><span className="nums">{toArabicDigits(pct.actual)}%</span></div><div className="mt-1 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${pct.bar}%` }} /></div></div>; } },
    { accessorKey: 'earned', header: ui('المستحق'), cell: ({ getValue }) => formatMoney(Number(getValue())) },
    { accessorKey: 'remaining', header: ui('المتبقي'), cell: ({ getValue }) => <b>{formatMoney(Number(getValue()))}</b> },
    { accessorKey: 'ratingAvg', header: ui('التقييم'), cell: ({ getValue }) => <span className="inline-flex items-center gap-1 nums"><Star className="size-4 fill-primary text-primary" />{toArabicDigits(Number(getValue()))}</span> },
    { id: 'profile', header: '', cell: ({ row }) => <Button asChild size="sm" variant="outline"><Link to={profilePath(row.original.trainerId)}><ArrowLeft className="size-4" /> {ui('الملف')}</Link></Button> },
  ], []);

  return <div className="space-y-5"><PageHeader title={ui('الأداء والمستحقات')} description={ui('التارجت، العمولات، الدفعات والتقييمات في مساحة واحدة مرتبطة بملف كل مدرب.')} />
    <div className="surface-card grid gap-3 rounded-xl border p-4 sm:grid-cols-2 xl:grid-cols-4"><div className="grid gap-1"><Label>{ui('من')}</Label><Input type="date" className="nums" value={dateFrom} onChange={(event) => { setDateFrom(event.target.value); setPage(1); }} /></div><div className="grid gap-1"><Label>{ui('إلى')}</Label><Input type="date" className="nums" value={dateTo} onChange={(event) => { setDateTo(event.target.value); setPage(1); }} /></div><div className="grid gap-1"><Label>{ui('الفرع')}</Label><select className="h-10 rounded-md border bg-background px-3" value={branchId} onChange={(event) => { setBranchId(event.target.value); setPage(1); }}><option value="">{ui('كل الفروع')}</option>{(branches ?? []).map((branch) => <option key={branch.id} value={branch.id}>{branch.name || `${ui('فرع ')}${branch.id}`}</option>)}</select></div></div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"><Summary icon={Target} label={ui('الحصص')} value={toArabicDigits(query.data?.totals.sessions ?? 0)} /><Summary icon={Coins} label={ui('الإيراد')} value={formatMoney(query.data?.totals.revenue ?? 0)} /><Summary icon={Wallet} label={ui('المستحق')} value={formatMoney(query.data?.totals.earned ?? 0)} /><Summary icon={Wallet} label={ui('المتبقي')} value={formatMoney(query.data?.totals.remaining ?? 0)} /><Summary icon={Star} label={ui('متوسط التقييم')} value={toArabicDigits(query.data?.totals.ratingAvg ?? 0)} /></div>
    <DataTable columns={columns} data={query.data?.data ?? []} total={query.data?.total ?? 0} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={(value) => { setPageSize(value); setPage(1); }} search={search} onSearchChange={(value) => { setSearch(value); setPage(1); }} searchPlaceholder={ui('ابحث باسم المدرب أو التخصص…')} isLoading={query.isLoading} isError={query.isError} onRetry={() => void query.refetch()} emptyTitle={ui('لا توجد بيانات أداء في الفترة المحددة')} />
  </div>;
}

function Summary({ icon: Icon, label, value }: { icon: typeof Target; label: string; value: string }) { return <div className="surface-card rounded-xl border p-4"><div className="flex items-center justify-between gap-2"><p className="text-sm font-semibold text-muted-foreground">{label}</p><Icon className="size-4 text-primary" /></div><p className="nums mt-2 text-xl font-bold">{value}</p></div>; }
