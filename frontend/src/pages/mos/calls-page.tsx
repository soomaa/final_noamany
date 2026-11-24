import { useQuery } from '@tanstack/react-query';
import { CalendarClock, Phone, PhoneOff, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { SelectField } from '@/components/common/select-field';
import { PageHeader } from '@/components/common/page-header';
import { EmptyState, ErrorState } from '@/components/common/states';
import { PermissionButton as Button } from '@/components/club/permission-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api } from '@/lib/api';
import { toDialLink } from '@/lib/contact-links';
import { formatDate, formatNum } from '@/lib/formatters';
import { cn } from '@/lib/utils';
import { useLocale } from '@/store/locale';
import { SELECT_CLS } from '../club/fitness/shared';
import { MaskedPhone } from '@/components/club/masked-phone';

interface CallLogRow {
  id: string;
  source: 'lead' | 'manual';
  leadId: number | null;
  clientName: string;
  phone: string | null;
  calledAt: string;
  salesRepId: number | null;
  salesRepName: string | null;
  /** Who typed the entry — shown under the owner when they are not the same person. */
  loggedByName: string | null;
  answered: boolean | null;
  outcome: string | null;
  notes: string | null;
  nextCallAt: string | null;
  nextFollowUpAt: string | null;
}

interface CallsResponse {
  data: CallLogRow[];
  page: number;
  pageSize: number;
  total: number;
  summary: { total: number; answered: number; unanswered: number };
}

/** `canChoose` is false for a sales rep: the server pins them to their own calls. */
type RepsResponse = { canChoose: boolean; data: Array<{ id: number; name: string | null }> };

const PAGE_SIZE = 25;

function monthStart() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
}

function today() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/** Date and time together — one column, as the call actually happened. */
function callMoment(value: string) {
  return formatDate(value, 'yyyy/MM/dd hh:mm a');
}

export function MosCallsPage() {
  const { ui } = useLocale();
  const [salesId, setSalesId] = useState<string>('');
  const [answered, setAnswered] = useState<'' | 'yes' | 'no'>('');
  const [dateFrom, setDateFrom] = useState(monthStart);
  const [dateTo, setDateTo] = useState(today);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [search]);
  useEffect(() => setPage(1), [salesId, answered, dateFrom, dateTo, debouncedSearch]);

  const reps = useQuery({
    queryKey: ['mos-calls', 'reps'],
    staleTime: 5 * 60_000,
    queryFn: async () => (await api.get<RepsResponse>('/club-mos/calls-log/reps')).data,
  });

  const calls = useQuery({
    queryKey: ['mos-calls', salesId, answered, dateFrom, dateTo, debouncedSearch, page],
    placeholderData: (previous) => previous,
    queryFn: async () =>
      (
        await api.get<CallsResponse>('/club-mos/calls-log', {
          params: {
            page,
            pageSize: PAGE_SIZE,
            salesId: salesId || undefined,
            answered: answered || undefined,
            dateFrom: dateFrom || undefined,
            dateTo: dateTo || undefined,
            search: debouncedSearch || undefined,
          },
        })
      ).data,
  });

  const rows = calls.data?.data ?? [];
  const pages = Math.max(1, Math.ceil((calls.data?.total ?? 0) / PAGE_SIZE));

  return (
    <main className="space-y-5 pb-8">
      <PageHeader
        title={ui('المكالمات')}
        description={ui('كل مكالمات فريق المبيعات من سجل العملاء، والمكالمات المسجلة يدويًا، في قائمة واحدة.')}
      />

      <section className="surface-card space-y-4 rounded-xl border bg-card p-4 sm:p-5">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {reps.data?.canChoose !== false && (
            <div className="space-y-1.5">
              <Label htmlFor="callsSalesRep">{ui('موظف المبيعات')}</Label>
              <SelectField
                id="callsSalesRep"
                className={cn(SELECT_CLS, 'h-10 w-full')}
                value={salesId}
                onChange={(value) => setSalesId(value)}
              >
                <option value="">{ui('كل موظفي المبيعات')}</option>
                {reps.data?.data.map((rep) => (
                  <option key={rep.id} value={rep.id}>{rep.name ?? `#${rep.id}`}</option>
                ))}
              </SelectField>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="callsAnswered">{ui('نتيجة المكالمة')}</Label>
            <SelectField
              id="callsAnswered"
              className={cn(SELECT_CLS, 'h-10 w-full')}
              value={answered}
              onChange={(value) => setAnswered(value as '' | 'yes' | 'no')}
            >
              <option value="">{ui('الكل')}</option>
              <option value="yes">{ui('تم الرد')}</option>
              <option value="no">{ui('لم يتم الرد')}</option>
            </SelectField>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="callsFrom">{ui('من تاريخ')}</Label>
            <Input id="callsFrom" type="date" className="nums h-10" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="callsTo">{ui('إلى تاريخ')}</Label>
            <Input id="callsTo" type="date" className="nums h-10" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
        </div>

        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="relative w-full sm:max-w-sm">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="ps-10"
              placeholder={ui('بحث بالاسم أو الموبايل…')}
              aria-label={ui('بحث في المكالمات')}
            />
          </div>
          {calls.data ? (
            <div className="nums flex flex-wrap gap-2 text-sm" aria-live="polite">
              <span className="rounded-lg border bg-background px-3 py-2">
                {formatNum(calls.data.summary.total)} {ui('مكالمة')}
              </span>
              <span className="rounded-lg border border-success/25 bg-success/5 px-3 py-2 text-success">
                {formatNum(calls.data.summary.answered)} {ui('تم الرد')}
              </span>
              <span className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-destructive">
                {formatNum(calls.data.summary.unanswered)} {ui('لم يتم الرد')}
              </span>
            </div>
          ) : null}
        </div>
      </section>

      <section className="surface-card overflow-hidden rounded-xl border bg-card">
        {calls.isLoading ? (
          <div className="space-y-2 p-5">
            {[0, 1, 2, 3].map((item) => <Skeleton key={item} className="h-14" />)}
          </div>
        ) : calls.isError ? (
          <ErrorState inline onRetry={() => void calls.refetch()} />
        ) : !rows.length ? (
          <EmptyState
            title={ui('لا توجد مكالمات ضمن هذا الفلتر')}
            description={ui('غيّر الفترة أو موظف المبيعات، أو سجّل مكالمة من ملف العميل.')}
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/25">
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>{ui('العميل')}</TableHead>
                    <TableHead>{ui('الموبايل')}</TableHead>
                    <TableHead>{ui('تاريخ ووقت المكالمة')}</TableHead>
                    <TableHead>{ui('موظف المبيعات')}</TableHead>
                    <TableHead>{ui('النتيجة')}</TableHead>
                    <TableHead>{ui('الملاحظات')}</TableHead>
                    <TableHead>{ui('المتابعة القادمة')}</TableHead>
                    <TableHead className="text-center">{ui('إجراءات')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row, index) => {
                    const dialHref = toDialLink(row.phone);
                    const next = row.nextCallAt ?? row.nextFollowUpAt;
                    return (
                      <TableRow key={row.id}>
                        <TableCell className="nums font-bold">
                          {formatNum((page - 1) * PAGE_SIZE + index + 1)}
                        </TableCell>
                        <TableCell>
                          <div className="max-w-52">
                            <p className="truncate font-bold">{row.clientName || '—'}</p>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {ui(row.source === 'lead' ? 'عميل محتمل' : 'تسجيل يدوي')}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell><MaskedPhone value={row.phone} leadId={row.leadId} /></TableCell>
                        <TableCell><span className="nums whitespace-nowrap">{callMoment(row.calledAt)}</span></TableCell>
                        <TableCell>
                          {/* The owner on top, whoever logged it underneath when they
                              differ. These used to be collapsed into one name, so a call
                              on one rep's client could be read as another rep's work. */}
                          <span className="block max-w-40 truncate">{row.salesRepName || '—'}</span>
                          {row.loggedByName && row.loggedByName !== row.salesRepName ? (
                            <span className="block max-w-40 truncate text-[11px] text-muted-foreground">
                              {ui('سجّلها')}: {row.loggedByName}
                            </span>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          {row.answered == null ? (
                            <span className="text-sm text-muted-foreground">{row.outcome || '—'}</span>
                          ) : (
                            <span
                              className={cn(
                                'inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold',
                                row.answered ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground',
                              )}
                            >
                              {ui(row.answered ? 'تم الرد' : 'لم يتم الرد')}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <p className="line-clamp-2 max-w-72 whitespace-pre-wrap text-sm leading-5" title={row.notes ?? undefined}>
                            {row.notes || '—'}
                          </p>
                        </TableCell>
                        <TableCell>
                          {next ? (
                            <span className="nums inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-semibold">
                              <CalendarClock className="size-3.5 text-muted-foreground" />
                              {callMoment(next)}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">{ui('لا يوجد')}</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-center gap-1.5">
                            {dialHref ? (
                              <Button asChild size="icon" variant="ghost" aria-label={`${ui('اتصال')} ${row.clientName}`}>
                                <a href={dialHref}><Phone className="size-4" /></a>
                              </Button>
                            ) : (
                              <span className="grid size-9 place-items-center text-muted-foreground/50" aria-hidden="true">
                                <PhoneOff className="size-4" />
                              </span>
                            )}
                            {row.leadId ? (
                              <Button asChild size="sm" variant="outline">
                                <Link to={`/mos/potential-members?leadId=${row.leadId}`}>{ui('السجل')}</Link>
                              </Button>
                            ) : null}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 sm:px-5">
              <p className="nums text-xs text-muted-foreground">
                {ui('صفحة')} {formatNum(page)} {ui('من')} {formatNum(pages)}
              </p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={page <= 1 || calls.isFetching} onClick={() => setPage((v) => Math.max(1, v - 1))}>
                  {ui('السابق')}
                </Button>
                <Button size="sm" variant="outline" disabled={page >= pages || calls.isFetching} onClick={() => setPage((v) => v + 1)}>
                  {ui('التالي')}
                </Button>
              </div>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
