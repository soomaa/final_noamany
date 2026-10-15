import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, Loader2, Phone, Search, UserRoundPlus, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { api, apiError } from '@/lib/api';
import { isMemberSearchReady, searchClubMembers } from '@/lib/club-member-search';
import { formatMoney } from '@/lib/formatters';
import { useLocale } from '@/store/locale';
import { usePermission } from '@/hooks/use-permission';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ErrorState } from '@/components/common/states';
import { Skeleton } from '@/components/ui/skeleton';
import { Combobox } from '@/components/common/combobox';
import type { ClubSearchHit } from '@/types/gym-ops';
import { ClubPaymentSplitFields, singlePaymentRow, splitRowsTotal } from './club-payment-split-fields';

type DayClass = { id: number; class_name: string; class_type_id: number | null; trainer: { name: string }; start_time: string; end_time: string; audience: string; price: string | number; allow_external: boolean; branch_id: number };

export function ReceptionClassDesk({ branchId }: { branchId?: string }) {
  const { ui, locale } = useLocale();
  const { can } = usePermission();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('scheduled');
  const [selected, setSelected] = useState<DayClass | null>(null);
  const [identifier, setIdentifier] = useState('');
  const [name, setName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [gender, setGender] = useState('male');
  const [resolved, setResolved] = useState<'member' | 'guest' | null>(null);
  const [memberHits, setMemberHits] = useState<ClubSearchHit[]>([]);
  const [memberSearchOpen, setMemberSearchOpen] = useState(false);
  const [memberSearching, setMemberSearching] = useState(false);
  const [busy, setBusy] = useState(false);
  const [payments, setPayments] = useState(singlePaymentRow());
  useEffect(() => { setSelected(null); setResolved(null); setMemberHits([]); }, [branchId]);
  const query = useQuery({ queryKey: ['club-classes', 'reception-day', branchId], enabled: open, queryFn: async () => (await api.get<DayClass[]>('/club-classes/reception-day', { params: { branchId } })).data });
  const rows = (query.data ?? []).filter((row) => tab === 'scheduled' ? row.class_type_id != null : row.class_type_id == null);

  const chooseMember = (hit: ClubSearchHit) => {
    setIdentifier(hit.memberCode);
    setName(hit.name);
    setResolved('member');
    setMemberHits([]);
    setMemberSearchOpen(false);
  };

  useEffect(() => {
    if (!selected || resolved || !isMemberSearchReady(identifier)) {
      setMemberHits([]);
      setMemberSearchOpen(false);
      setMemberSearching(false);
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setMemberSearching(true);
      void searchClubMembers(identifier, { branchId: selected.branch_id, signal: controller.signal })
        .then((result) => {
          if (cancelled) return;
          setMemberHits(result.hits);
          setMemberSearchOpen(result.hits.length > 0);
        })
        .catch(() => {
          if (cancelled) return;
          setMemberHits([]);
          setMemberSearchOpen(false);
        })
        .finally(() => {
          if (!cancelled) setMemberSearching(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [identifier, resolved, selected]);

  const lookup = async () => {
    if (!selected || !identifier.trim()) return;
    setBusy(true);
    try {
      const result = await searchClubMembers(identifier, { branchId: selected.branch_id });
      const exact = result.hits.filter((hit) => hit.memberCode === identifier.trim() || hit.phone?.replace(/\s/g, '') === identifier.replace(/\s/g, ''));
      if (exact.length > 1) throw new Error(ui('الموبايل مرتبط بأكثر من عضو؛ استخدم كود العضو'));
      if (exact.length) chooseMember(exact[0]);
      else {
        if (!selected.allow_external) throw new Error(ui('الحصة لا تسمح بالحضور الخارجي'));
        if (!/^\+?\d{8,15}$/.test(identifier.replace(/\s/g, ''))) throw new Error(ui('لم نجد العضو؛ اكتب موبايل صحيح لتسجيل ضيف'));
        setGuestPhone(identifier.replace(/\s/g, '')); setName(''); setGender(selected.audience === 'women' ? 'female' : 'male'); setResolved('guest'); setPayments(singlePaymentRow('cash', Number(selected.price)));
      }
    } catch (error) { toast.error(error instanceof Error && !('response' in error) ? error.message : apiError(error)); }
    finally { setBusy(false); }
  };
  const attend = async () => {
    if (!selected || !resolved) return;
    const attendanceIdentifier = resolved === 'guest' ? guestPhone.trim().replace(/\s/g, '') : identifier;
    if (resolved === 'guest' && (!name.trim() || !/^\+?\d{8,15}$/.test(attendanceIdentifier) || splitRowsTotal(payments) !== Number(selected.price))) { toast.error(ui('اكتب اسم الضيف ورقم موبايل صحيح وسجل سعر الحصة بالكامل')); return; }
    setBusy(true);
    try {
      await api.post(`/club-classes/${selected.id}/reception-attendance`, { identifier: attendanceIdentifier, name, gender, payments: payments.map((row) => ({ method: row.method, amount: Number(row.amount) })) });
      toast.success(ui('تم تسجيل الحضور')); setSelected(null); setResolved(null); setMemberHits([]); await qc.invalidateQueries({ queryKey: ['club-classes'] });
    } catch (error) { toast.error(apiError(error)); } finally { setBusy(false); }
  };
  return <>
    <Button permissionAction={null} variant="brand" className="fixed left-0 top-1/2 z-30 h-auto min-h-32 rounded-l-none px-2 py-4 [writing-mode:vertical-rl]" onClick={() => setOpen(true)} aria-label={ui('فتح حصص اليوم')}><CalendarDays className="size-5" aria-hidden="true" />{ui('حصص اليوم')}</Button>
    <Dialog open={open} onOpenChange={(value) => { setOpen(value); if (!value) { setSelected(null); setResolved(null); } }}>
      <DialogContent size="form" aria-describedby="reception-classes-description">
        <DialogHeader><DialogTitle>{ui('حصص اليوم')}</DialogTitle></DialogHeader>
        <p id="reception-classes-description" className="text-sm text-muted-foreground">{ui('اختر الحصة ثم سجل حضور العضو بكوده أو الموبايل. الخارجي يدفع سعر الحصة عند الحضور.')}</p>
        <Tabs value={tab} onValueChange={(value) => { setTab(value); setSelected(null); setResolved(null); }}><div className="flex justify-center"><TabsList><TabsTrigger value="scheduled">{ui('حصص مجدولة')}</TabsTrigger><TabsTrigger value="private">{ui('برايفت')}</TabsTrigger></TabsList></div></Tabs>
        {query.isError ? <ErrorState onRetry={() => void query.refetch()} /> : query.isLoading ? <Skeleton className="h-32 w-full" /> : <div className="divide-y rounded-xl border">
          {rows.map((row) => <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 p-4"><div className="min-w-0"><p className="font-semibold">{row.class_name}</p><p className="mt-1 text-sm text-muted-foreground">{row.trainer.name} · <span dir="ltr" className="nums">{row.start_time} — {row.end_time}</span> · {ui(row.audience === 'women' ? 'حريمي' : row.audience === 'men' ? 'رجالي' : 'فئة قديمة')}</p></div><Button permissionAction={null} variant="outline" className="size-11 p-0" disabled={!can('club.reception:create') || busy} aria-label={`${ui('إضافة حضور')} ${row.class_name}`} onClick={() => { setSelected(row); setIdentifier(''); setName(''); setGuestPhone(''); setMemberHits([]); setResolved(null); }}><UserRoundPlus className="size-5" /></Button></div>)}
          {!rows.length && <p className="p-8 text-center text-muted-foreground">{ui('لا توجد حصص في هذا القسم اليوم.')}</p>}
        </div>}
        {selected && <section className="space-y-4 border-t pt-5" aria-label={ui('تسجيل الحضور')}>
          <h3 className="font-semibold">{ui('إضافة حضور')}: {selected.class_name}</h3>
          {resolved !== 'guest' ? <div className="grid gap-2"><Label htmlFor="class-desk-identifier">{ui('ابحث بالاسم أو كود العضو أو الموبايل')}</Label><div className="flex flex-wrap gap-2"><div className="relative min-w-64 flex-1"><Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input id="class-desk-identifier" className="ps-9 pe-9" value={identifier} disabled={busy} autoComplete="off" placeholder={ui('اسم العضو · الكود · رقم الموبايل')} onChange={(event) => { setIdentifier(event.target.value); setName(''); setResolved(null); }} onFocus={() => { if (memberHits.length) setMemberSearchOpen(true); }} onKeyDown={(event) => { if (event.key === 'Enter') void lookup(); if (event.key === 'Escape') setMemberSearchOpen(false); }} />{memberSearching ? <Loader2 className="absolute end-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" /> : resolved === 'member' ? <button type="button" className="absolute end-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-muted" aria-label={ui('مسح العضو')} onClick={() => { setIdentifier(''); setName(''); setResolved(null); }}><X className="size-4" /></button> : null}{memberSearchOpen && memberHits.length ? <div role="listbox" className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border bg-popover p-1 shadow-lg">{memberHits.map((hit) => <button key={hit.id} type="button" role="option" className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-start hover:bg-muted focus-visible:bg-muted focus-visible:outline-none" onClick={() => chooseMember(hit)}><span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><UserRoundPlus className="size-4" /></span><span className="min-w-0 flex-1"><b className="block truncate text-sm">{hit.name}</b><span className="mt-0.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground"><span className="nums">{ui('الكود')}: {hit.memberCode}</span>{hit.phone ? <span className="nums inline-flex items-center gap-1"><Phone className="size-3" />{hit.phone}</span> : null}</span></span></button>)}</div> : null}</div><Button permissionAction={null} disabled={busy || !identifier.trim()} onClick={() => void lookup()}>{ui('بحث')}</Button>{selected.allow_external ? <Button permissionAction={null} variant="outline" disabled={busy} onClick={() => { const possiblePhone = identifier.trim().replace(/\s/g, ''); setGuestPhone(/^\+?\d{8,15}$/.test(possiblePhone) ? possiblePhone : ''); setIdentifier(''); setName(''); setGender(selected.audience === 'women' ? 'female' : 'male'); setResolved('guest'); setMemberHits([]); setMemberSearchOpen(false); setPayments(singlePaymentRow('cash', Number(selected.price))); }}>{ui('عضو خارجي')}</Button> : null}</div></div> : null}
          {resolved === 'member' && <div role="status" className="rounded-xl border bg-primary/[0.04] p-3"><p className="font-semibold">{name}</p><p className="mt-1 text-sm text-muted-foreground"><span className="nums">{ui('كود العضو')}: {identifier}</span> · {ui('سيتم خصم الحصة من الاشتراك المؤهل وتسجيلها مع الكابتن.')}</p></div>}
          {resolved === 'guest' && <><div className="flex items-center justify-between gap-3"><p className="font-semibold">{ui('بيانات العضو الخارجي')}</p><Button permissionAction={null} variant="ghost" size="sm" onClick={() => { setResolved(null); setName(''); setGuestPhone(''); }}>{ui('العودة لبحث الأعضاء')}</Button></div><div className="grid gap-4 sm:grid-cols-3"><div className="grid gap-2"><Label htmlFor="class-desk-name">{ui('اسم العضو الخارجي')}</Label><Input id="class-desk-name" maxLength={200} value={name} onChange={(e) => setName(e.target.value)} /></div><div className="grid gap-2"><Label htmlFor="class-desk-phone">{ui('رقم الموبايل')}</Label><Input id="class-desk-phone" inputMode="tel" dir="ltr" className="nums text-start" maxLength={16} value={guestPhone} onChange={(e) => setGuestPhone(e.target.value)} /></div><div className="grid gap-2"><Label htmlFor="class-desk-gender">{ui('الفئة')}</Label><Combobox id="class-desk-gender" value={gender} onValueChange={setGender} options={[{ value: 'male', label: ui('رجالي') }, { value: 'female', label: ui('حريمي') }]} /></div></div><p className="nums font-semibold">{ui('سعر الحصة')}: {formatMoney(Number(selected.price), undefined, locale)}</p><ClubPaymentSplitFields total={Number(selected.price)} rows={payments} onChange={setPayments} disabled={busy} /></>}
          {resolved && <Button permissionAction={null} variant="brand" disabled={busy || !can('club.reception:create')} onClick={() => void attend()}>{ui(resolved === 'guest' ? 'تحصيل وتسجيل الحضور' : 'تأكيد الحضور')}</Button>}
        </section>}
      </DialogContent>
    </Dialog>
  </>;
}
