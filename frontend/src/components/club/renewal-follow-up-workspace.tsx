import { formatDisplayNumber } from '@/lib/number-display';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Copy, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { DataTable } from '@/components/common/data-table';
import { ErrorState } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { SubscriptionRenewalDialog } from '@/components/club/subscription-renewal-dialog';
import { api, apiError } from '@/lib/api';
import { useBranches } from '@/hooks/use-branches';
import { usePermission } from '@/hooks/use-permission';
import { useAuth } from '@/store/auth';
import { useLocale } from '@/store/locale';
import type { ClubSubscriptionListItem } from '@/types/club';

interface FollowUpRow {
  id: number; memberId: number; memberName: string; memberCode: string; phone: string | null;
  packageName: string; packageKey: string; subscriptionNumber: string;
  startDate: string; endDate: string; effectiveEndDate: string | null; lastRenewalDate: string | null;
  lastAttendance: string | null; daysSince: number | null; reason: 'expired' | 'exhausted' | 'absent';
  contactStatus: string; nextContactOn: string | null; canRenew: boolean;
}
interface Contact { id: number; status: string; note: string | null; next_contact_on: string | null; created_by_name: string | null; created_at: string }
interface History { subscriptions: Array<{ id: number; subscription_number: string; subscription_type: string | null; registration_date: string; subscription_start_date: string; subscription_end_date: string; renewed_from_subscription_id: number | null; sessions_count: number | null; sessions_used: number; follow_ups: Contact[] }> }
const selectClass = 'h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

export function RenewalFollowUpWorkspace() {
  const { locale, ui } = useLocale();
  const statuses: Record<string, string> = { not_contacted: ui('لم يتم التواصل'), contacted: ui('تم التواصل'), promised: ui('وعد بالتجديد'), not_interested: ui('غير مهتم') };
  const { can } = usePermission();
  const canUpdate = can('club.subscriptions.list:update');
  const canRenew = canUpdate || can('club.reception:update');
  const user = useAuth(s => s.user);
  const qc = useQueryClient();
  const { data: branches = [] } = useBranches();
  const [mode, setMode] = useState('not_renewed');
  const [filters, setFilters] = useState({ branch: '', packageKey: '', contactStatus: '', expiryFrom: '', expiryTo: '', absenceDays: '14', search: '' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [selected, setSelected] = useState<FollowUpRow | null>(null);
  const [contactStatus, setContactStatus] = useState('contacted');
  const [note, setNote] = useState('');
  const [nextContactOn, setNextContactOn] = useState('');
  const [saving, setSaving] = useState(false);
  const [renewingId, setRenewingId] = useState<number | null>(null);
  const [renewalSource, setRenewalSource] = useState<ClubSubscriptionListItem | null>(null);
  const filterParams = Object.fromEntries(Object.entries({ ...filters, expiryFrom: mode === 'absent' ? '' : filters.expiryFrom, expiryTo: mode === 'absent' ? '' : filters.expiryTo, mode }).filter(([, v]) => v !== ''));
  const invalidRange = mode === 'not_renewed' && !!filters.expiryFrom && !!filters.expiryTo && filters.expiryFrom > filters.expiryTo;
  const rangeError = ui('تاريخ البداية يجب أن يكون قبل تاريخ النهاية أو مساويًا له');
  const query = useQuery({
    enabled: !invalidRange,
    queryKey: ['club-subscriptions', 'follow-ups', user?.sub, user?.branch, filterParams, page, pageSize],
    queryFn: async ({ signal }) => (await api.get<{ data: FollowUpRow[]; total: number; page: number; pageSize: number; packages: Array<{ key: string; name: string }> }>('/club-subscriptions/follow-ups', { params: { ...filterParams, page, pageSize }, signal })).data,
  });
  const history = useQuery({
    queryKey: ['club-subscriptions', 'follow-up-history', user?.sub, selected?.id],
    enabled: !!selected,
    queryFn: async ({ signal }) => (await api.get<History>(`/club-subscriptions/${selected!.id}/follow-ups`, { signal })).data,
  });
  const changeFilter = (key: keyof typeof filters, value: string) => { setFilters(old => ({ ...old, [key]: value })); setPage(1); };
  const openHistory = (row: FollowUpRow) => { setSelected(row); setContactStatus(row.contactStatus === 'not_contacted' ? 'contacted' : row.contactStatus); setNote(''); setNextContactOn(row.nextContactOn ?? ''); };
  const renew = async (row: FollowUpRow) => {
    setRenewingId(row.id);
    try { setRenewalSource((await api.get<ClubSubscriptionListItem>(`/club-subscriptions/${row.id}`)).data); setSelected(null); }
    catch (e) { toast.error(apiError(e)); }
    finally { setRenewingId(null); }
  };
  const saveContact = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selected || saving) return;
    setSaving(true);
    try {
      await api.post(`/club-subscriptions/${selected.id}/follow-ups`, { status: contactStatus, note: note.trim() || undefined, nextContactOn: nextContactOn || undefined });
      toast.success(ui('تم حفظ المتابعة'));
      setNote('');
      await qc.invalidateQueries({ queryKey: ['club-subscriptions'] });
    } catch (e) { toast.error(apiError(e)); }
    finally { setSaving(false); }
  };
  const copyPhone = async (phone: string) => {
    try { await navigator.clipboard.writeText(phone); toast.success(ui('تم نسخ الرقم')); }
    catch { toast.error(ui('تعذر النسخ، حاول مرة أخرى')); }
  };
  const columns: ColumnDef<FollowUpRow, unknown>[] = [
    { accessorKey: 'memberCode', header: ui('كود العضو'), cell: ({ row }) => <span dir="ltr">{row.original.memberCode}</span> },
    { accessorKey: 'memberName', header: ui('العضو'), cell: ({ row }) => <Button variant="link" className="h-auto justify-start whitespace-normal p-0 text-start text-foreground underline decoration-primary underline-offset-4" onClick={() => openHistory(row.original)}>{row.original.memberName}</Button> },
    { accessorKey: 'phone', header: ui('الموبايل'), cell: ({ row }) => row.original.phone ? <Button variant="ghost" size="sm" onClick={() => void copyPhone(row.original.phone!)} aria-label={`${ui('نسخ رقم')} ${row.original.memberName}`}><span dir="ltr">{row.original.phone}</span><Copy className="size-3.5" /></Button> : '—' },
    { accessorKey: 'packageName', header: ui('الباقة') },
    { accessorKey: 'lastRenewalDate', header: ui('آخر تجديد'), cell: ({ getValue }) => String(getValue() ?? '—') },
    { accessorKey: 'effectiveEndDate', header: ui('نهاية الاستحقاق'), cell: ({ row }) => <div className="space-y-1"><span dir="ltr">{row.original.effectiveEndDate ?? '—'}</span>{row.original.reason === 'exhausted' && <div className="text-xs text-muted-foreground">{ui('نفدت الحصص')}</div>}</div> },
    { accessorKey: 'daysSince', header: mode === 'absent' ? ui('أيام الغياب') : ui('أيام التأخر'), cell: ({ getValue }) => <span className="tabular-nums font-medium">{getValue() === null ? ui('غير متاح') : String(getValue())}</span> },
    { accessorKey: 'lastAttendance', header: ui('آخر حضور'), cell: ({ getValue }) => String(getValue() ?? ui('غير متاح')) },
    { accessorKey: 'contactStatus', header: ui('المتابعة'), cell: ({ row }) => <div className="space-y-1"><span>{statuses[row.original.contactStatus]}</span>{row.original.nextContactOn && <div className="text-xs text-muted-foreground">{ui('المتابعة القادمة: ')}<span dir="ltr">{row.original.nextContactOn}</span></div>}</div> },
    { id: 'actions', header: ui('الإجراءات'), cell: ({ row }) => <div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => openHistory(row.original)}>{ui('السجل والمتابعة')}</Button>{canRenew && row.original.canRenew && <Button permissionResource={canUpdate ? 'club.subscriptions.list' : 'club.reception'} permissionAction="update" variant="outline" size="sm" disabled={renewingId !== null} onClick={() => void renew(row.original)}><RefreshCw className="size-3.5" />{ui('تجديد')}</Button>}</div> },
  ];
  const { search: searchFilter = '', ...apiFilters } = filterParams as Record<string, string>;
  const exportSource = {
    resource: 'club-subscriptions/follow-ups',
    params: { page: 1, pageSize: 500, search: searchFilter, filters: apiFilters },
    project: (row: FollowUpRow) => ({ ...row, contactStatus: statuses[row.contactStatus], lastAttendance: row.lastAttendance ?? ui('غير متاح'), reason: row.reason === 'exhausted' ? ui('نفدت الحصص') : row.reason === 'absent' ? ui('غياب') : ui('انتهت المدة') }),
  };
  return <section className="space-y-5" aria-label={ui('متابعة التجديدات')}>
    <div className="space-y-2"><h2 className="text-lg font-semibold">{ui('متابعة التجديدات')}</h2><p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">{ui('تابع كل باقة على حدة، وراجع سجل العضو قبل التواصل. تُستبعد التجديدات المسبقة والاشتراكات المجمدة والتحويلات تلقائيًا.')}</p></div>
    <Tabs dir={locale === 'ar' ? 'rtl' : 'ltr'} value={mode} onValueChange={value => { setMode(value); setPage(1); }}><TabsList className="h-auto flex-wrap"><TabsTrigger value="not_renewed">{ui('لم يجددوا')}</TabsTrigger><TabsTrigger value="absent">{ui('غائبون عن الحضور')}</TabsTrigger></TabsList></Tabs>
    {mode === 'absent' && <p className="max-w-3xl text-sm text-muted-foreground">{ui('اشتراكات سارية بدون زيارة مسجلة خلال المدة المحددة. لا نصنّف الأعضاء بلا سجل حضور كغائبين. يبدأ العد بعد بداية الاشتراك أو آخر استئناف من التجميد، أيهما أحدث.')}</p>}
    <div className={`grid gap-4 rounded-xl border bg-card p-4 sm:grid-cols-2 ${mode === 'absent' ? 'xl:grid-cols-4' : 'xl:grid-cols-5'}`}>
      <div className="space-y-2"><Label htmlFor="follow-up-branch">{ui('الفرع')}</Label><select id="follow-up-branch" className={selectClass} value={filters.branch} onChange={e => { changeFilter('branch', e.target.value); changeFilter('packageKey', ''); }}><option value="">{ui('كل الفروع المتاحة')}</option>{branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
      <div className="space-y-2"><Label htmlFor="follow-up-package">{ui('الباقة')}</Label><select id="follow-up-package" className={selectClass} value={filters.packageKey} onChange={e => changeFilter('packageKey', e.target.value)}><option value="">{ui('كل الباقات')}</option>{query.data?.packages.map(p => <option key={p.key} value={p.key}>{p.name}</option>)}</select></div>
      <div className="space-y-2"><Label htmlFor="follow-up-status">{ui('حالة المتابعة')}</Label><select id="follow-up-status" className={selectClass} value={filters.contactStatus} onChange={e => changeFilter('contactStatus', e.target.value)}><option value="">{ui('كل الحالات')}</option>{Object.entries(statuses).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div>
      {mode === 'absent' ? <div className="space-y-2"><Label htmlFor="follow-up-days">{ui('مدة الغياب')}</Label><select id="follow-up-days" className={selectClass} value={filters.absenceDays} onChange={e => changeFilter('absenceDays', e.target.value)}>{[7, 14, 30, 60, 90].map(d => <option key={d} value={d}>{formatDisplayNumber(d)} {ui('يوم أو أكثر')}</option>)}</select></div> : <fieldset className="min-w-0 space-y-2 sm:col-span-2 xl:col-span-2"><legend className="text-sm font-medium">{ui('تاريخ انتهاء الاشتراك')}</legend><div className="grid gap-3 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="follow-up-from">{ui('من تاريخ')}</Label><Input id="follow-up-from" type="date" value={filters.expiryFrom} max={filters.expiryTo || undefined} aria-invalid={invalidRange} aria-describedby={invalidRange ? 'expiry-range-error' : undefined} onChange={e => changeFilter('expiryFrom', e.target.value)} /></div><div className="space-y-2"><Label htmlFor="follow-up-to">{ui('إلى تاريخ')}</Label><Input id="follow-up-to" type="date" value={filters.expiryTo} min={filters.expiryFrom || undefined} aria-invalid={invalidRange} aria-describedby={invalidRange ? 'expiry-range-error' : undefined} onChange={e => changeFilter('expiryTo', e.target.value)} /></div></div>{invalidRange && <p id="expiry-range-error" role="alert" className="text-sm text-destructive">{rangeError}</p>}<p className="text-xs text-muted-foreground">{ui('تشمل النتائج يومَي البداية والنهاية. امسح التاريخين لعرض كل الفترات.')}</p></fieldset>}
    </div>
    <p className="text-sm text-muted-foreground">{ui('الترتيب حسب آخر حضور: الأحدث أولًا، وبدون سجل حضور في النهاية.')}</p>
    <DataTable columns={columns} data={query.data?.data ?? []} total={query.data?.total ?? 0} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={size => { setPageSize(size); setPage(1); }} search={filters.search} searchPlaceholder={ui('بحث بالاسم أو الكود أو الموبايل…')} onSearchChange={value => changeFilter('search', value)} isLoading={query.isFetching} isError={invalidRange || query.isError} errorMessage={invalidRange ? rangeError : query.error ? apiError(query.error) : undefined} onRetry={() => void query.refetch()} exportSource={exportSource} exportColumns={[...columns.flatMap(c => 'accessorKey' in c ? [{ key: String(c.accessorKey), header: String(c.header) }] : []), { key: 'reason', header: ui('السبب') }, { key: 'nextContactOn', header: ui('المتابعة القادمة') }]} emptyTitle={ui('لا توجد حالات مطابقة')} emptyDescription={ui('جرّب تغيير الفلاتر. تختفي حالة عدم التجديد تلقائيًا عند تسجيل التجديد.')} />
    <Sheet open={!!selected} onOpenChange={open => { if (!open && !saving) setSelected(null); }}><SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
      <SheetHeader className="pe-8"><SheetTitle>{selected?.memberName}</SheetTitle><SheetDescription>{selected?.memberCode} · {selected?.packageName} · {selected?.subscriptionNumber}</SheetDescription></SheetHeader>
      {selected?.phone && <p className="mt-3 text-sm" dir="ltr">{selected.phone}</p>}
      {canUpdate && <form onSubmit={event => void saveContact(event)} className="my-6 space-y-4 border-y py-5"><h3 className="font-semibold">{ui('تسجيل متابعة')}</h3><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="contact-status">{ui('نتيجة التواصل')}</Label><select id="contact-status" className={selectClass} value={contactStatus} disabled={saving} onChange={e => setContactStatus(e.target.value)}>{Object.entries(statuses).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div><div className="space-y-2"><Label htmlFor="contact-date">{ui('موعد المتابعة القادمة (اختياري)')}</Label><Input id="contact-date" type="date" value={nextContactOn} disabled={saving} onChange={e => setNextContactOn(e.target.value)} /></div></div><div className="space-y-2"><Label htmlFor="contact-note">{ui('ملاحظات (اختياري)')}</Label><textarea id="contact-note" className={`${selectClass} min-h-24 py-2`} maxLength={2000} value={note} disabled={saving} onChange={e => setNote(e.target.value)} /></div><Button type="submit" disabled={saving}>{saving ? ui('جارٍ الحفظ…') : ui('حفظ المتابعة')}</Button></form>}
      <div className="mt-6 space-y-4"><h3 className="font-semibold">{ui('سجل الباقات والتجديدات')}</h3>{history.isLoading && <Skeleton className="h-32 w-full" />}{history.isError && <ErrorState message={apiError(history.error)} onRetry={() => void history.refetch()} />}{history.data?.subscriptions.map(sub => <article key={sub.id} className="space-y-3 border-b pb-5"><div className="flex flex-wrap items-start justify-between gap-2"><h4 className="font-medium">{sub.subscription_type ?? '—'}</h4><span className="text-xs text-muted-foreground" dir="ltr">{sub.subscription_number}</span></div><p className="text-sm"><span dir="ltr">{sub.subscription_start_date} — {sub.subscription_end_date}</span></p><p className="text-xs text-muted-foreground">{sub.renewed_from_subscription_id ? ui('تجديد مسجل في ') : ui('اشتراك مسجل في ')}{sub.registration_date}{sub.sessions_count !== null ? ` · ${ui('الحصص المستخدمة')}: ${formatDisplayNumber(sub.sessions_used)}/${formatDisplayNumber(sub.sessions_count)}` : ''}</p>{sub.follow_ups.length === 0 ? <p className="text-sm text-muted-foreground">{ui('لا توجد متابعة مسجلة لهذه الفترة.')}</p> : <ul className="space-y-3">{sub.follow_ups.map(contact => <li key={contact.id} className="space-y-1 rounded-md bg-muted/50 p-3 text-sm"><div className="flex flex-wrap justify-between gap-2"><strong className="font-medium">{statuses[contact.status] ?? contact.status}</strong><time className="text-xs text-muted-foreground">{new Date(contact.created_at).toLocaleString(locale === 'ar' ? 'ar-EG' : 'en-GB')}</time></div>{contact.note && <p className="whitespace-pre-wrap break-words leading-relaxed">{contact.note}</p>}<p className="text-xs text-muted-foreground">{contact.created_by_name ?? '—'}{contact.next_contact_on ? ` · ${ui('المتابعة القادمة')}: ${contact.next_contact_on}` : ''}</p></li>)}</ul>}</article>)}</div>
    </SheetContent></Sheet>
    <SubscriptionRenewalDialog source={renewalSource} open={!!renewalSource} onOpenChange={open => { if (!open) setRenewalSource(null); }} onSuccess={() => { setRenewalSource(null); void qc.invalidateQueries({ queryKey: ['club-subscriptions'] }); }} />
  </section>;
}
