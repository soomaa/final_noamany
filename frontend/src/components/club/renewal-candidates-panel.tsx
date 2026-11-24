import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarClock, FileSpreadsheet, RefreshCcw, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { DataTable } from '@/components/common/data-table';
import { PermissionButton as Button } from '@/components/club/permission-button';
import { Input } from '@/components/ui/input';
import { api, apiError } from '@/lib/api';
import { formatMoney } from '@/lib/formatters';
import { usePermission } from '@/hooks/use-permission';
import { toArabicDigits, formatDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';
import type { ColumnDef } from '@tanstack/react-table';
import { uiStatic } from '@/lib/ui-static';
import { MaskedPhone } from '@/components/club/masked-phone';

interface RenewalCandidate {
  subscriptionId: number;
  subscriptionNumber: string;
  memberId: number | null;
  fullName: string;
  phone: string;
  memberCode: string;
  subscriptionType: string;
  paidAmount: number;
  startDate: string;
  endDate: string;
  branchId: number;
  state: 'expired' | 'due_soon';
  hasOpenLead: boolean;
}

interface RenewalCandidatesResponse {
  data: RenewalCandidate[];
  total: number;
  page: number;
  pageSize: number;
  summary: { total: number; alreadyInPipeline: number; convertible: number; missingPhone: number };
}

/**
 * Members whose subscription has lapsed, or is about to, ready to be worked as renewals.
 *
 * These are not leads yet, which is why they sit behind their own tab rather than inside
 * the pipeline's status filters. The manager either hands the Excel to the team, or turns
 * the whole list into distributed leads in one step — the download-then-upload-the-same-file
 * round trip this replaces went through the system only to come back into it.
 */
export function RenewalCandidatesPanel({ onConverted }: { onConverted?: () => void }) {
  const { ui } = useLocale();
  const { can } = usePermission();
  const canConvert = can('club.leads:create');
  const canExport = can('club.leads:export');
  const [state, setState] = useState<'expired' | 'due_soon'>('expired');
  const [days, setDays] = useState(30);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [converting, setConverting] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const params = { state, days, search: search.trim() || undefined, page, pageSize };
  const list = useQuery({
    queryKey: ['club-renewal-candidates', state, days, search.trim(), page, pageSize],
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    queryFn: async () => (await api.get<RenewalCandidatesResponse>('/club-leads/renewal-candidates', { params })).data,
  });

  const download = async () => {
    setDownloading(true);
    try {
      const response = await api.get('/club-leads/renewal-handoff', {
        params: { state, days, search: search.trim() || undefined },
        responseType: 'blob',
      });
      const url = URL.createObjectURL(response.data as Blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `crm-renewals-${state}.xlsx`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setDownloading(false);
    }
  };

  const convert = async () => {
    setConverting(true);
    try {
      const { data } = await api.post<{
        created: number; skipped: number; remaining: number; batchLimit: number; errorCount: number;
      }>(
        '/club-leads/renewal-candidates/convert',
        { state, days, search: search.trim() || undefined },
      );
      toast.success(
        `${ui('تم تحويل')} ${toArabicDigits(data.created)} ${ui('عميل وتوزيعهم على الفريق')}`
        + (data.skipped ? ` — ${ui('تم تخطي')} ${toArabicDigits(data.skipped)}` : ''),
      );
      // Thousands of lapsed contracts convert a batch at a time, so say what is left rather
      // than looking like it silently stopped.
      if (data.remaining) {
        toast.info(`${ui('باقي')} ${toArabicDigits(data.remaining)} ${ui('— اضغطي «تحويلهم» تاني لإكمالهم')}`);
      }
      if (data.errorCount) toast.error(`${ui('تعذّر تحويل')} ${toArabicDigits(data.errorCount)}`);
      await list.refetch();
      onConverted?.();
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setConverting(false);
    }
  };

  const columns: ColumnDef<RenewalCandidate>[] = [
    {
      accessorKey: 'fullName',
      header: ui('العضو'),
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="font-semibold">{row.original.fullName || '—'}</p>
          <p className="nums text-xs text-muted-foreground">
            {row.original.memberCode ? formatDigits(row.original.memberCode) : '—'}
          </p>
        </div>
      ),
    },
    {
      accessorKey: 'phone',
      header: ui('الهاتف'),
      cell: ({ row }) => (
        row.original.phone
          ? <MaskedPhone value={row.original.phone} memberId={row.original.memberId} />
          : <span className="text-xs text-destructive">{ui('بدون رقم')}</span>
      ),
    },
    { accessorKey: 'subscriptionType', header: ui('نوع الاشتراك'), cell: ({ row }) => row.original.subscriptionType || '—' },
    { accessorKey: 'paidAmount', header: ui('المدفوع'), cell: ({ row }) => <span className="nums">{formatMoney(row.original.paidAmount)}</span> },
    {
      accessorKey: 'endDate',
      header: ui('المدة'),
      cell: ({ row }) => (
        <span className="nums text-xs">
          {toArabicDigits(row.original.startDate)} ← {toArabicDigits(row.original.endDate)}
        </span>
      ),
    },
    {
      id: 'pipeline',
      header: ui('الحالة'),
      cell: ({ row }) => (
        row.original.hasOpenLead
          ? <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">{ui('في المتابعة بالفعل')}</span>
          : <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs text-primary">{ui('جاهز للتحويل')}</span>
      ),
    },
  ];

  const summary = list.data?.summary;

  return (
    <div className="space-y-4">
      <div className="surface-card flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3">
        <div className="flex rounded-lg bg-muted/50 p-1" role="tablist" aria-label={ui('حالة الاشتراك')}>
          {([
            { value: 'expired' as const, label: uiStatic('اشتراكات منتهية') },
            { value: 'due_soon' as const, label: uiStatic('قرب انتهاؤها') },
          ]).map((option) => (
            <button
              key={option.value}
              type="button"
              role="tab"
              aria-selected={state === option.value}
              onClick={() => { setState(option.value); setPage(1); }}
              className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                state === option.value ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {ui(option.label)}
            </button>
          ))}
        </div>

        {state === 'due_soon' ? (
          <label className="flex items-center gap-2 text-sm">
            <CalendarClock className="size-4 text-primary" />
            {ui('خلال')}
            <Input
              type="number"
              min={1}
              max={365}
              className="nums h-10 w-20"
              value={days}
              onChange={(event) => { setDays(Number(event.target.value) || 30); setPage(1); }}
            />
            {ui('يوم')}
          </label>
        ) : null}

        <Input
          className="min-w-[14rem] flex-1"
          placeholder={ui('بحث بالاسم أو الهاتف أو الكود')}
          value={search}
          onChange={(event) => { setSearch(event.target.value); setPage(1); }}
        />

        {canExport ? (
          <Button variant="outline" disabled={downloading} onClick={() => void download()}>
            <FileSpreadsheet className="size-4" />
            {downloading ? ui('جارٍ التنزيل…') : ui('تنزيل Excel')}
          </Button>
        ) : null}
        {canConvert ? (
          <Button
            variant="brand"
            disabled={converting || !summary?.convertible}
            onClick={() => void convert()}
          >
            <UserPlus className="size-4" />
            {converting ? ui('جارٍ التحويل…') : ui('تحويلهم لعملاء محتملين')}
          </Button>
        ) : null}
      </div>

      {summary ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Chip label={ui('الإجمالي')} value={summary.total} />
          <Chip label={ui('جاهز للتحويل')} value={summary.convertible} tone="primary" />
          <Chip label={ui('في المتابعة بالفعل')} value={summary.alreadyInPipeline} />
          {summary.missingPhone ? <Chip label={ui('بدون رقم هاتف')} value={summary.missingPhone} tone="warning" /> : null}
          <Button variant="ghost" size="sm" onClick={() => void list.refetch()}>
            <RefreshCcw className="size-4" /> {ui('تحديث')}
          </Button>
        </div>
      ) : null}

      <p className="text-xs leading-relaxed text-muted-foreground">
        {ui('«تحويلهم» بيضيفهم كعملاء محتملين ويوزّعهم على الفريق تلقائيًا، ومن كان في المتابعة بالفعل بيتخطّى — فتكرار الضغط ما بيكرّرش حد. و«تنزيل Excel» بينزّل نفس القائمة بقالب الاستيراد نفسه لو حابة تبعتيها يدويًا.')}
      </p>

      <DataTable
        columns={columns}
        data={list.data?.data ?? []}
        total={list.data?.total ?? 0}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
        isLoading={list.isLoading}
      />
    </div>
  );
}

function Chip({ label, value, tone }: { label: string; value: number; tone?: 'primary' | 'warning' }) {
  const toneClass = tone === 'primary'
    ? 'border-primary/40 bg-primary/10 text-primary'
    : tone === 'warning'
      ? 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300'
      : 'border-border bg-muted/40 text-muted-foreground';
  return (
    <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 ${toneClass}`}>
      {label}
      <b className="nums">{toArabicDigits(value)}</b>
    </span>
  );
}
