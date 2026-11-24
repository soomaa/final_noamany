import type { ColumnDef } from '@tanstack/react-table';
import { isMaskedValue } from '@/lib/masked-value';
import { MaskedPhone } from '@/components/club/masked-phone';
import { CalendarClock, CalendarX2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { DataTable } from '@/components/common/data-table';
import { SearchableSelect } from '@/components/common/searchable-select';
import { MemberGenderSelect, useMemberGenderFilter } from '@/components/club/member-gender-filter';
import { WhatsAppIcon } from '@/components/club/whatsapp-icon';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useBranches } from '@/hooks/use-branches';
import { GYM_NAME, openWhatsAppMessage, useWhatsAppTemplates } from '@/hooks/use-whatsapp-templates';
import { api, apiError } from '@/lib/api';
import { useArrayResource, usePaginatedList } from '@/lib/api-hooks';
import { downloadExcel } from '@/lib/export';
import { formatMoney, localToday } from '@/lib/formatters';
import { whatsappPhone } from '@/lib/member-whatsapp';
import type { ListQueryParams } from '@/lib/use-list-query';
import { toArabicDigits } from '@/lib/utils';
import { daysBetween, DEFAULT_WHATSAPP_TEMPLATES, subscriptionMessage } from '@/lib/whatsapp-message';
import type { ClubSubscriptionListItem } from '@/types/club';

export type ExpiryTab = 'expired' | 'expiring';
type Kind = 'all' | 'normal' | 'private' | 'sessions';

const selectCls = 'flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm';
const DEFAULT_EXPIRING_DAYS = 7;

/** Same mapping as the subscriptions list «فئة الاشتراك» filter. */
const KIND_FILTERS: Record<Kind, Record<string, string>> = {
  all: {},
  normal: { isSpecial: 'false', isLinkedToSessions: 'false' },
  private: { isSpecial: 'true' },
  sessions: { isLinkedToSessions: 'true' },
};

/** A typed day count, accepted only as a whole number between `min` and 3650. */
function parseDays(value: string, min: number): number | null {
  const days = Number(value);
  return value.trim() !== '' && Number.isInteger(days) && days >= min && days <= 3650 ? days : null;
}

function DaysBadge({ days, expired }: { days: number | null; expired: boolean }) {
  if (days == null) return <span className="text-muted-foreground">—</span>;
  const label = expired
    ? `منذ ${toArabicDigits(Math.abs(days))} يوم`
    : days === 0
      ? 'ينتهي اليوم'
      : `${toArabicDigits(days)} يوم`;
  const tone = expired
    ? 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300'
    : days <= 3
      ? 'border-amber-500/40 bg-amber-500/15 text-amber-800 dark:text-amber-300'
      : 'border-sky-500/30 bg-sky-500/10 text-sky-800 dark:text-sky-300';
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold ${tone}`}>
      {expired ? <CalendarX2 className="size-3.5" aria-hidden="true" /> : <CalendarClock className="size-3.5" aria-hidden="true" />}
      <span className="nums">{label}</span>
    </span>
  );
}

/**
 * «اشتراكات على وشك الانتهاء» (ported from Meta Fit): two tabs — الاشتراكات المنتهية /
 * اشتراكات تنتهي قريباً — with branch, رجالي/حريمي, package and category filters, search,
 * Excel export and a WhatsApp reminder built from the «قوالب واتساب» templates.
 */
export function SubscriptionExpiryReports({ initialTab = 'expiring' }: { initialTab?: ExpiryTab }) {
  const today = localToday();
  const { data: branches = [] } = useBranches();
  const { data: subTypes = [] } = useArrayResource<{ id: number; name: string }>('club-subscription-types');
  const templates = useWhatsAppTemplates();
  const gender = useMemberGenderFilter();

  const [tab, setTab] = useState<ExpiryTab>(initialTab);
  const [branch, setBranch] = useState('');
  const [subscriptionType, setSubscriptionType] = useState('');
  const [kind, setKind] = useState<Kind>('all');
  const [daysDraft, setDaysDraft] = useState(String(DEFAULT_EXPIRING_DAYS));
  const [days, setDays] = useState(DEFAULT_EXPIRING_DAYS);
  const [expiredDraft, setExpiredDraft] = useState('');
  const [expiredDays, setExpiredDays] = useState<number | null>(null);
  const [notRenewed, setNotRenewed] = useState(true);
  // تاريخ الانتهاء من / إلى: when set, it replaces the day count.
  const [endFromDraft, setEndFromDraft] = useState('');
  const [endToDraft, setEndToDraft] = useState('');
  const [endRange, setEndRange] = useState<{ from: string; to: string } | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState('');
  const [exporting, setExporting] = useState(false);

  const resetPage = () => setPage(1);
  const draftDays = parseDays(daysDraft, 0);
  const draftExpiredDays = expiredDraft.trim() === '' ? null : parseDays(expiredDraft, 1);
  const expiredDraftInvalid = expiredDraft.trim() !== '' && draftExpiredDays == null;
  const applyDays = () => {
    if (draftDays == null) return;
    setDays(draftDays);
    resetPage();
  };
  const endRangeInvalid = !endFromDraft || !endToDraft || endFromDraft > endToDraft;
  const applyEndRange = () => {
    if (endRangeInvalid) return;
    setEndRange({ from: endFromDraft, to: endToDraft });
    resetPage();
  };
  const clearEndRange = () => {
    setEndFromDraft('');
    setEndToDraft('');
    setEndRange(null);
    resetPage();
  };
  const applyExpiredDays = () => {
    if (expiredDraftInvalid) return;
    setExpiredDays(draftExpiredDays);
    resetPage();
  };

  const params = useMemo<ListQueryParams>(() => {
    const shared: Record<string, string> = {
      ...KIND_FILTERS[kind],
      ...(branch ? { branch } : {}),
      ...(subscriptionType ? { subscriptionType } : {}),
      ...(gender.param ? { gender: gender.param } : {}),
    };
    const range = endRange ? { endDateFrom: endRange.from, endDateTo: endRange.to } : null;
    const filters = tab === 'expiring'
      ? { ...shared, status: 'active', ...(range ?? { expiresWithinDays: String(days) }), sort: 'endDateAsc' }
      : {
          ...shared,
          status: 'expired',
          sort: 'endDateDesc',
          ...(range ?? (expiredDays != null ? { expiredWithinDays: String(expiredDays) } : {})),
          ...(notRenewed ? { notRenewed: 'true' } : {}),
        };
    return { page, pageSize, search: search.trim(), filters };
  }, [branch, days, endRange, expiredDays, gender.param, kind, notRenewed, page, pageSize, search, subscriptionType, tab]);

  const list = usePaginatedList<ClubSubscriptionListItem>('club-subscriptions', params);
  const rows = list.data?.data ?? [];
  const total = list.data?.total ?? 0;
  const expired = tab === 'expired';

  const sendWhatsApp = (row: ClubSubscriptionListItem) => {
    const template = (templates.data ?? DEFAULT_WHATSAPP_TEMPLATES)[expired ? 'expired' : 'expiring'];
    const message = subscriptionMessage(template, row, { today, gymName: GYM_NAME });
    void openWhatsAppMessage(row.memberPhone, message, null, { memberId: row.memberId });
  };

  const typeName = (row: ClubSubscriptionListItem) => row.subscriptionTypeName || row.subscriptionType || '—';

  const columns = useMemo<ColumnDef<ClubSubscriptionListItem>[]>(() => [
    {
      id: 'index',
      header: '#',
      cell: ({ row }) => <span className="nums">{toArabicDigits((page - 1) * pageSize + row.index + 1)}</span>,
    },
    {
      id: 'registrationDate',
      header: 'تاريخ التسجيل',
      cell: ({ row }) => <span className="nums whitespace-nowrap">{toArabicDigits(row.original.registrationDate ?? '—')}</span>,
    },
    {
      id: 'memberCode',
      header: 'كود العضو',
      // Latin digits, as typed in the search box (A001169, not A٠٠١١٦٩).
      cell: ({ row }) => row.original.memberCode ? <bdi dir="ltr" className="nums font-mono">{row.original.memberCode}</bdi> : '—',
    },
    { id: 'name', header: 'الاسم', cell: ({ row }) => row.original.customerName ?? '—' },
    {
      id: 'phone',
      header: 'الموبايل',
      cell: ({ row }) => row.original.memberPhone ? <MaskedPhone className="whitespace-nowrap" value={row.original.memberPhone} memberId={row.original.memberId} /> : '—',
    },
    { id: 'type', header: 'نوع الاشتراك', cell: ({ row }) => typeName(row.original) },
    {
      id: 'value',
      header: 'قيمة الاشتراك',
      cell: ({ row }) => <span className="nums whitespace-nowrap">{formatMoney(row.original.subscriptionValue)}</span>,
    },
    {
      id: 'start',
      header: 'البداية',
      cell: ({ row }) => <span className="nums whitespace-nowrap">{toArabicDigits(row.original.subscriptionStartDate)}</span>,
    },
    {
      id: 'end',
      header: 'الانتهاء',
      cell: ({ row }) => <span className="nums whitespace-nowrap">{toArabicDigits(row.original.subscriptionEndDate)}</span>,
    },
    {
      id: 'days',
      header: expired ? 'منذ الانتهاء' : 'عدد الأيام المتبقية',
      cell: ({ row }) => <DaysBadge days={daysBetween(today, row.original.subscriptionEndDate)} expired={expired} />,
    },
    {
      id: 'whatsapp',
      header: 'واتساب',
      cell: ({ row }) => isMaskedValue(row.original.memberPhone) || whatsappPhone(row.original.memberPhone) ? (
        <Button
          type="button"
          size="icon"
          variant="outline"
          className="size-9 border-emerald-500/30 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-300"
          aria-label={`واتساب لـ ${row.original.customerName ?? 'العضو'}`}
          title={expired ? 'رسالة تجديد على واتساب' : 'تذكير بالانتهاء على واتساب'}
          onClick={() => sendWhatsApp(row.original)}
        >
          <WhatsAppIcon className="size-4" />
        </Button>
      ) : <span className="text-xs text-muted-foreground">رقم غير صالح</span>,
    },
    // sendWhatsApp reads the latest templates through closure; columns rebuild with the tab.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [expired, page, pageSize, today, templates.data]);

  const exportExcel = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const size = 100;
      const fetchPage = async (pageNumber: number) => (await api.get<{ data: ClubSubscriptionListItem[]; total: number }>('/club-subscriptions', {
        params: { ...params.filters, ...(params.search ? { search: params.search } : {}), page: pageNumber, pageSize: size },
      })).data;
      const first = await fetchPage(1);
      const all = [...first.data];
      for (let pageNumber = 2; pageNumber <= Math.ceil(first.total / size); pageNumber++) all.push(...(await fetchPage(pageNumber)).data);
      await downloadExcel<Record<string, unknown>>(
        all.map((row, index) => {
          const remaining = daysBetween(today, row.subscriptionEndDate);
          return {
            index: index + 1,
            registrationDate: row.registrationDate ?? '',
            memberCode: row.memberCode ?? '',
            name: row.customerName ?? '',
            // Already masked by the server for anyone without viewPhone; full for those who hold it.
            phone: row.memberPhone ?? '',
            type: typeName(row),
            value: row.subscriptionValue,
            start: row.subscriptionStartDate,
            end: row.subscriptionEndDate,
            days: remaining == null ? '' : Math.abs(remaining),
            branch: row.branchName ?? '',
          };
        }),
        [
          { key: 'index', header: '#' },
          { key: 'registrationDate', header: 'تاريخ التسجيل' },
          { key: 'memberCode', header: 'كود العضو' },
          { key: 'name', header: 'الاسم' },
          { key: 'phone', header: 'الموبايل' },
          { key: 'type', header: 'نوع الاشتراك' },
          { key: 'value', header: 'قيمة الاشتراك' },
          { key: 'start', header: 'البداية' },
          { key: 'end', header: 'الانتهاء' },
          { key: 'days', header: expired ? 'أيام منذ الانتهاء' : 'عدد الأيام المتبقية' },
          { key: 'branch', header: 'الفرع' },
        ],
        expired ? `الاشتراكات-المنتهية-${today}` : `اشتراكات-تنتهي-قريبا-${today}`,
        expired ? 'المنتهية' : 'تنتهي قريباً',
        { rightToLeft: true },
      );
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setExporting(false);
    }
  };

  const table = (
    <DataTable
      columns={columns}
      data={rows}
      total={total}
      page={page}
      pageSize={pageSize}
      onPageChange={setPage}
      onPageSizeChange={(size) => {
        setPageSize(size);
        resetPage();
      }}
      search={search}
      onSearchChange={(value) => {
        setSearch(value);
        resetPage();
      }}
      searchPlaceholder="ابحث بالاسم أو الكود أو الموبايل أو رقم الاشتراك"
      isLoading={list.isLoading}
      isError={list.isError}
      errorMessage={list.isError ? apiError(list.error) : undefined}
      onRetry={() => void list.refetch()}
      emptyTitle={expired ? 'مفيش اشتراكات منتهية بالفلاتر دي' : 'مفيش اشتراكات هتنتهي في المدة دي'}
      onExportExcel={exportExcel}
      toolbar={exporting ? <span className="text-xs text-muted-foreground">جارٍ تصدير كل النتائج…</span> : undefined}
      compact
    />
  );

  return (
    <Tabs value={tab} onValueChange={(value) => { setTab(value as ExpiryTab); resetPage(); }} className="space-y-4" dir="rtl">
      <div className="flex justify-center">
        <TabsList className="flex h-auto max-w-full flex-wrap justify-center gap-1 rounded-xl border bg-muted/40 p-1.5 shadow-sm">
          <TabsTrigger value="expired"><CalendarX2 className="size-4" /> الاشتراكات المنتهية</TabsTrigger>
          <TabsTrigger value="expiring"><CalendarClock className="size-4" /> اشتراكات تنتهي قريباً</TabsTrigger>
        </TabsList>
      </div>

      <section className="grid gap-3 rounded-xl border bg-card p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-4" aria-label="فلاتر الاشتراكات">
        <div className="grid gap-1.5">
          <Label htmlFor="expiry-branch">الفرع</Label>
          <SearchableSelect id="expiry-branch" className={selectCls} value={branch} onChange={(event) => { setBranch(event.target.value); resetPage(); }}>
            <option value="">كل الفروع</option>
            {branches.map((item) => <option key={item.id} value={String(item.id)}>{item.name?.trim() || `فرع رقم ${item.id}`}</option>)}
          </SearchableSelect>
        </div>
        <MemberGenderSelect
          value={gender.value}
          locked={gender.locked}
          onChange={(value) => { gender.setValue(value); resetPage(); }}
        />
        <div className="grid gap-1.5">
          <Label htmlFor="expiry-kind">فئة الاشتراك</Label>
          <select id="expiry-kind" className={selectCls} value={kind} onChange={(event) => { setKind(event.target.value as Kind); resetPage(); }}>
            <option value="all">الكل</option>
            <option value="normal">اشتراك عادي</option>
            <option value="private">برايفت</option>
            <option value="sessions">حصص</option>
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="expiry-type">نوع الاشتراك</Label>
          <SearchableSelect id="expiry-type" className={selectCls} value={subscriptionType} onChange={(event) => { setSubscriptionType(event.target.value); resetPage(); }}>
            <option value="">كل الأنواع</option>
            {[...new Set(subTypes.map((item) => item.name).filter(Boolean))].map((name) => <option key={name} value={name}>{name}</option>)}
          </SearchableSelect>
        </div>

        {tab === 'expiring' ? (
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="expires-within-days">عدد الأيام على انتهاء الاشتراك</Label>
            <div className="flex items-center gap-2">
              <Input
                id="expires-within-days"
                type="number"
                min={0}
                max={3650}
                inputMode="numeric"
                className="h-10 min-w-0 flex-1 nums"
                value={daysDraft}
                aria-invalid={draftDays == null}
                onChange={(event) => setDaysDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    applyDays();
                  }
                }}
              />
              <Button type="button" className="h-10 shrink-0 px-5" onClick={applyDays} disabled={draftDays == null || draftDays === days}>
                تطبيق
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {draftDays == null ? 'اكتب عدد أيام صحيح (٠ = اللي بتنتهي النهارده).' : `بيعرض الاشتراكات النشطة اللي بتنتهي من النهارده لحد ${toArabicDigits(days)} يوم.`}
            </p>
          </div>
        ) : (
          <>
            <div className="grid gap-1.5">
              <Label htmlFor="expired-within-days">انتهى خلال آخر (يوم)</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="expired-within-days"
                  type="number"
                  min={1}
                  max={3650}
                  inputMode="numeric"
                  placeholder="كل المدة"
                  className="h-10 min-w-0 flex-1 nums"
                  value={expiredDraft}
                  aria-invalid={expiredDraftInvalid}
                  onChange={(event) => setExpiredDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      applyExpiredDays();
                    }
                  }}
                />
                <Button type="button" className="h-10 shrink-0 px-5" onClick={applyExpiredDays} disabled={expiredDraftInvalid || draftExpiredDays === expiredDays}>
                  تطبيق
                </Button>
              </div>
            </div>
            <label className="flex min-h-10 items-center gap-2 self-end text-sm">
              <Checkbox checked={notRenewed} onCheckedChange={(checked) => { setNotRenewed(checked === true); resetPage(); }} />
              اللي لسه مجدّدوش بس (ملهمش اشتراك حالي)
            </label>
          </>
        )}
        <div className="grid gap-1.5 sm:col-span-2" role="group" aria-label="تاريخ الانتهاء من / إلى">
          <Label>تاريخ الانتهاء (من / إلى)</Label>
          <div className="flex flex-wrap items-center gap-2">
            <Input aria-label="تاريخ الانتهاء من" type="date" className="h-10 min-w-0 flex-1 nums" value={endFromDraft} onChange={(event) => setEndFromDraft(event.target.value)} />
            <span className="text-sm text-muted-foreground">إلى</span>
            <Input aria-label="تاريخ الانتهاء إلى" type="date" className="h-10 min-w-0 flex-1 nums" value={endToDraft} min={endFromDraft || undefined} onChange={(event) => setEndToDraft(event.target.value)} />
            <Button type="button" className="h-10 shrink-0 px-5" onClick={applyEndRange} disabled={endRangeInvalid}>تطبيق</Button>
            {endRange && <Button type="button" variant="outline" className="h-10 shrink-0" onClick={clearEndRange}>مسح</Button>}
          </div>
          <p className="text-xs text-muted-foreground">
            {endRange
              ? `بيعرض الاشتراكات اللي بتنتهي من ${toArabicDigits(endRange.from)} لحد ${toArabicDigits(endRange.to)} (بدل عدد الأيام).`
              : 'اختياري: حدد فترة لتاريخ الانتهاء بدل عدد الأيام.'}
          </p>
        </div>
      </section>

      <p className="text-sm text-muted-foreground nums" role="status">
        {toArabicDigits(total)} اشتراك
      </p>
      <TabsContent value="expired" className="mt-0">{expired ? table : null}</TabsContent>
      <TabsContent value="expiring" className="mt-0">{expired ? null : table}</TabsContent>
    </Tabs>
  );
}
