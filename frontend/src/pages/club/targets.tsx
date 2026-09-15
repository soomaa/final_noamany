import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, ChevronLeft, ChevronRight, Filter, RefreshCw } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/common/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useBranches } from '@/hooks/use-branches';
import { api, apiError } from '@/lib/api';
import { formatMoney } from '@/lib/formatters';
import { useLocale } from '@/store/locale';
import {
  buildTargetPeopleParams,
  buildTargetReportParams,
  TARGET_REPORT_TABS,
  targetReportTabFromSearch,
  type TargetReportFilters,
  type TargetReportTab,
} from './targets-report-model';

interface TargetRow {
  id: string;
  clientId: number | null;
  clientName: string;
  clientCode: string | null;
  clientPhone: string | null;
  date: string;
  reference: string;
  description: string;
  amount: number;
  classification?: 'protein' | 'bar';
}

interface TargetReportResponse {
  data: TargetRow[];
  total: number;
  page: number;
  pageSize: number;
  summary: {
    count: number;
    totalAmount: number;
    targetAmount: number;
    proteinAmount?: number;
    barAmount?: number;
  };
}

interface TargetPerson {
  id: number;
  name: string;
  code: number | null;
  branchId: number | null;
}

const currentMonth = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};

const initialFilters = (tab: TargetReportTab): TargetReportFilters => ({
  tab,
  month: currentMonth(),
  personId: 'all',
  branchId: 'all',
  gender: 'all',
  page: 1,
  pageSize: 25,
});

export default function ClubTargetsPage() {
  const { locale, ui } = useLocale();
  const [searchParams, setSearchParams] = useSearchParams();
  const routeTab = targetReportTabFromSearch(searchParams.get('tab'));
  const [draft, setDraft] = useState<TargetReportFilters>(() => initialFilters(routeTab));
  const [applied, setApplied] = useState<TargetReportFilters>(() => initialFilters(routeTab));
  const { data: branches = [] } = useBranches();

  useEffect(() => {
    setDraft((current) => current.tab === routeTab ? current : { ...current, tab: routeTab, page: 1 });
    setApplied((current) => current.tab === routeTab ? current : { ...current, tab: routeTab, page: 1 });
  }, [routeTab]);

  const peopleQuery = useQuery({
    queryKey: ['target-report-people', draft.branchId, draft.gender],
    queryFn: async () => {
      const { data } = await api.get<TargetPerson[]>('/targets/people', {
        params: buildTargetPeopleParams(draft),
      });
      return data;
    },
  });

  const reportQuery = useQuery({
    queryKey: ['target-report', applied],
    queryFn: async () => {
      const { data } = await api.get<TargetReportResponse>('/targets/report', {
        params: buildTargetReportParams(applied),
      });
      return data;
    },
  });

  const pageCount = Math.max(1, Math.ceil((reportQuery.data?.total ?? 0) / applied.pageSize));
  const activeLabel = useMemo(
    () => TARGET_REPORT_TABS.find((tab) => tab.value === applied.tab)?.label ?? '',
    [applied.tab],
  );

  const selectTab = (tab: string) => {
    const value = tab as TargetReportTab;
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set('tab', value);
      return next;
    }, { replace: true });
    setDraft((current) => ({ ...current, tab: value, page: 1 }));
    setApplied((current) => ({ ...current, tab: value, page: 1 }));
  };

  const changePage = (page: number) => {
    const next = Math.min(pageCount, Math.max(1, page));
    setDraft((current) => ({ ...current, page: next }));
    setApplied((current) => ({ ...current, page: next }));
  };

  return (
    <main className="space-y-6 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:p-6">
      <PageHeader
        title={ui('تقرير التارجت الموحد')}
        description={ui('مصدر واحد للاشتراكات والبرايفت والمبيعات والحصص، مع بيانات العميل كاملة.')}
      />

      <Tabs value={applied.tab} onValueChange={selectTab} dir="rtl">
        <div className="overflow-x-auto pb-1">
          <TabsList aria-label={ui('أقسام تقرير التارجت')} className="h-auto min-w-max gap-1">
            {TARGET_REPORT_TABS.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value} className="min-h-11 px-4">
                {ui(tab.label)}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
      </Tabs>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2"><Filter aria-hidden="true" />{ui('مرشحات التقرير')}</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5"
            onSubmit={(event) => {
              event.preventDefault();
              setApplied({ ...draft, page: 1 });
              setDraft((current) => ({ ...current, page: 1 }));
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="target-month">{ui('الشهر')}</Label>
              <Input id="target-month" type="month" value={draft.month} className="h-11" required
                onChange={(event) => setDraft((current) => ({ ...current, month: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="target-branch">{ui('الفرع')}</Label>
              <Select value={draft.branchId} onValueChange={(branchId) => setDraft((current) => ({ ...current, branchId, personId: 'all' }))}>
                <SelectTrigger id="target-branch" className="h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{ui('كل الفروع')}</SelectItem>
                  {branches.map((branch) => <SelectItem key={branch.id} value={String(branch.id)}>{branch.name || `#${branch.id}`}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="target-person">{ui('الموظف / المدرب')}</Label>
              <Select value={draft.personId} onValueChange={(personId) => setDraft((current) => ({ ...current, personId }))}>
                <SelectTrigger id="target-person" className="h-11" disabled={peopleQuery.isPending}><SelectValue placeholder={ui('جار تحميل الأشخاص')} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{ui('كل الأشخاص')}</SelectItem>
                  {(peopleQuery.data ?? []).map((person) => (
                    <SelectItem key={person.id} value={String(person.id)}>{person.name}{person.code ? ` · ${person.code}` : ''}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {peopleQuery.isError ? (
                <p role="alert" className="text-xs text-destructive">{ui('تعذر تحميل قائمة الأشخاص. غيّر الفرع أو النوع للمحاولة مرة أخرى.')}</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="target-gender">{ui('النوع')}</Label>
              <Select value={draft.gender} onValueChange={(gender) => setDraft((current) => ({ ...current, gender: gender as TargetReportFilters['gender'], personId: 'all' }))}>
                <SelectTrigger id="target-gender" className="h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{ui('رجال ونساء')}</SelectItem>
                  <SelectItem value="male">{ui('رجال')}</SelectItem>
                  <SelectItem value="female">{ui('نساء')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button type="submit" size="lg" className="w-full">{ui('تطبيق المرشحات')}</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {reportQuery.isPending ? (
        <section aria-label={ui('جار تحميل التقرير')} className="grid gap-4 sm:grid-cols-3">
          {[0, 1, 2].map((item) => <Skeleton key={item} className="h-28" />)}
        </section>
      ) : reportQuery.isError ? (
        <Card role="alert" className="border-destructive/40">
          <CardContent className="flex flex-col items-start gap-4 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <div><p className="font-semibold">{ui('تعذر تحميل التقرير')}</p><p className="mt-1 text-sm text-muted-foreground">{apiError(reportQuery.error)}</p></div>
            <Button type="button" variant="outline" size="lg" onClick={() => reportQuery.refetch()}><RefreshCw />{ui('إعادة المحاولة')}</Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <section aria-label={ui('ملخص التقرير')} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard label={ui('عدد السجلات')} value={String(reportQuery.data?.summary.count ?? 0)} />
            <SummaryCard label={ui('الإجمالي')} value={formatMoney(reportQuery.data?.summary.totalAmount ?? 0, undefined, locale)} />
            <SummaryCard label={ui('المحتسب في التارجت')} value={formatMoney(reportQuery.data?.summary.targetAmount ?? 0, undefined, locale)} accent />
            {applied.tab === 'sales' ? (
              <SummaryCard
                label={ui('Protein / Bar')}
                value={`${formatMoney(reportQuery.data?.summary.proteinAmount ?? 0, undefined, locale)} / ${formatMoney(reportQuery.data?.summary.barAmount ?? 0, undefined, locale)}`}
              />
            ) : <SummaryCard label={ui('القسم')} value={ui(activeLabel)} />}
          </section>

          <Card>
            <CardHeader className="border-b"><CardTitle>{ui(activeLabel)}</CardTitle></CardHeader>
            <CardContent className="p-0">
              {!reportQuery.data?.data.length ? (
                <div className="flex min-h-56 flex-col items-center justify-center px-5 text-center">
                  <BarChart3 className="mb-3 size-10 text-muted-foreground" aria-hidden="true" />
                  <p className="font-semibold">{ui('لا توجد نتائج لهذه المرشحات')}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{ui('جرّب شهرًا أو فرعًا أو شخصًا مختلفًا.')}</p>
                </div>
              ) : (
                <>
                  <div className="hidden md:block">
                    <Table>
                      <TableHeader><TableRow>
                        <TableHead>{ui('العميل')}</TableHead><TableHead>{ui('الكود')}</TableHead><TableHead>{ui('الهاتف')}</TableHead>
                        <TableHead>{ui('التفاصيل')}</TableHead><TableHead>{ui('المرجع')}</TableHead><TableHead>{ui('التاريخ')}</TableHead><TableHead>{ui('القيمة')}</TableHead>
                      </TableRow></TableHeader>
                      <TableBody>{reportQuery.data.data.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell className="font-semibold">{row.clientName}</TableCell><TableCell className="nums">{row.clientCode || '—'}</TableCell>
                          <TableCell className="nums" dir="ltr">{row.clientPhone || '—'}</TableCell>
                          <TableCell>{row.description}{row.classification ? <Badge variant="outline" className="ms-2">{row.classification === 'protein' ? 'Protein' : 'Bar'}</Badge> : null}</TableCell>
                          <TableCell className="nums">{row.reference}</TableCell><TableCell className="nums">{row.date}</TableCell>
                          <TableCell className="nums font-semibold">{formatMoney(row.amount, undefined, locale)}</TableCell>
                        </TableRow>
                      ))}</TableBody>
                    </Table>
                  </div>
                  <div className="divide-y md:hidden">
                    {reportQuery.data.data.map((row) => (
                      <article key={row.id} className="space-y-3 p-4">
                        <div className="flex items-start justify-between gap-3"><div><h3 className="font-bold">{row.clientName}</h3><p className="mt-1 text-xs text-muted-foreground nums">{row.clientCode || '—'} · <span dir="ltr">{row.clientPhone || '—'}</span></p></div><strong className="nums text-primary">{formatMoney(row.amount, undefined, locale)}</strong></div>
                        <p className="text-sm">{row.description} {row.classification ? <Badge variant="outline">{row.classification === 'protein' ? 'Protein' : 'Bar'}</Badge> : null}</p>
                        <p className="text-xs text-muted-foreground nums">{row.reference} · {row.date}</p>
                      </article>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {pageCount > 1 ? (
            <nav aria-label={ui('صفحات التقرير')} className="flex items-center justify-center gap-3">
              <Button type="button" variant="outline" size="icon" className="size-11" aria-label={ui('الصفحة السابقة')} disabled={applied.page <= 1} onClick={() => changePage(applied.page - 1)}><ChevronRight /></Button>
              <span className="min-w-24 text-center text-sm nums">{applied.page} / {pageCount}</span>
              <Button type="button" variant="outline" size="icon" className="size-11" aria-label={ui('الصفحة التالية')} disabled={applied.page >= pageCount} onClick={() => changePage(applied.page + 1)}><ChevronLeft /></Button>
            </nav>
          ) : null}
        </>
      )}
    </main>
  );
}

function SummaryCard({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return <Card><CardContent className="pt-5"><p className="text-sm text-muted-foreground">{label}</p><p className={`nums mt-2 text-xl font-black ${accent ? 'text-primary' : ''}`}>{value}</p></CardContent></Card>;
}
