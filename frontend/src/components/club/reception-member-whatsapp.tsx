import { useEffect, useMemo, useState } from 'react';
import { MaskedPhone } from '@/components/club/masked-phone';
import { isMaskedValue } from '@/lib/masked-value';
import { useQuery } from '@tanstack/react-query';
import { Copy, ExternalLink, Loader2, Search } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { formatDate, localToday } from '@/lib/formatters';
import {
  loadMemberSubscriptions,
  searchMemberSubscriptions,
  whatsappPhone,
  type MemberMessageSubscription,
} from '@/lib/member-whatsapp';
import {
  DEFAULT_WHATSAPP_TEMPLATES,
  isCurrentSubscription,
  memberSubscriptionsMessage,
  packageMessage,
  subscriptionStatusLabel,
  type MessageExtras,
} from '@/lib/whatsapp-message';
import { subscriptionTypesForBranch } from '@/lib/club-subscription-branches';
import { formatMoney } from '@/lib/formatters';
import { GYM_NAME, openWhatsAppMessage, useWhatsAppTemplates } from '@/hooks/use-whatsapp-templates';
import { useAuth } from '@/store/auth';
import type { ClubMemberOverviewSubscription, ClubSubscriptionType } from '@/types/club';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { WhatsAppIcon } from './whatsapp-icon';

type Kind = 'current' | 'single' | 'multi';
type Member = { id: number; name: string; memberCode: string; phone: string | null; branchId?: number | null };
type InvitationSummary = { subscriptions: Array<{ subscriptionId: number; remaining: number }> };

/**
 * WhatsApp button on the scanned member at reception («اشتراكاتي الحالية»): send the current
 * subscriptions, one picked subscription, or several in one message — built from «قوالب واتساب»,
 * with every zero value (remaining 0, invitations 0, …) left out.
 */
export function ReceptionMemberWhatsApp({ member, subscriptionBranch, overviewSubscriptions }: {
  member: Member;
  subscriptionBranch?: string;
  /** Reception overview rows: they carry the InBody / SPA counters the list rows do not. */
  overviewSubscriptions?: readonly ClubMemberOverviewSubscription[];
}) {
  const actor = useAuth((state) => state.user?.sub);
  const templates = useWhatsAppTemplates();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<Kind>('current');
  // «اشتراك واحد»: any package of the branch (not one of the member's own), to send its details.
  const [single, setSingle] = useState<number | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [search, setSearch] = useState('');
  const today = localToday();

  useEffect(() => {
    if (!open) {
      setSelected([]);
      setSingle(null);
      setSearch('');
      setKind('current');
    }
  }, [open]);

  const subscriptions = useQuery({
    queryKey: ['reception-whatsapp-subscriptions', actor, member.id, subscriptionBranch],
    enabled: open,
    staleTime: 0,
    retry: false,
    queryFn: ({ signal }) =>
      loadMemberSubscriptions(member.id, async (page) =>
        (await api.get<{ data: MemberMessageSubscription[]; total: number }>('/club-subscriptions', {
          params: { memberId: member.id, branch: subscriptionBranch || undefined, page, pageSize: 100 },
          signal,
        })).data),
  });

  const packages = useQuery({
    queryKey: ['reception-whatsapp-packages', subscriptionBranch || member.branchId || 'all'],
    enabled: open && kind === 'single',
    staleTime: 60_000,
    queryFn: async ({ signal }) => (await api.get<ClubSubscriptionType[]>('/club-subscription-types', { signal })).data,
  });
  const branchForPackages = Number(subscriptionBranch) || member.branchId || undefined;
  const packageRows = useMemo(() => {
    // Private-training packages (legacy «عرض خاص» flag) are sold elsewhere; inactive ones can't be sold.
    const sellable = (packages.data ?? []).filter((type) => type.isActive !== false && !type.isSpecialOffer);
    return subscriptionTypesForBranch(sellable, branchForPackages)
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name, 'ar') || a.price - b.price);
  }, [packages.data, branchForPackages]);
  const filteredPackages = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return packageRows;
    return packageRows.filter((type) => `${type.name} ${type.price} ${type.days}`.toLowerCase().includes(needle));
  }, [packageRows, search]);

  // Remaining invitations per current subscription. Optional: without it the line is just left out.
  const invitations = useQuery({
    queryKey: ['club-reception-invitations', 'summary', member.id],
    enabled: open,
    retry: false,
    queryFn: async ({ signal }) =>
      (await api.get<InvitationSummary>('/club-reception-invitations/summary', { params: { memberId: member.id }, signal })).data,
  });

  const extras = useMemo(() => {
    const map: Record<number, MessageExtras> = {};
    for (const row of overviewSubscriptions ?? []) {
      map[row.id] = {
        inbodyLeft: row.inbodyCount != null ? Math.max(0, row.inbodyCount - (row.inbodyUsed ?? 0)) : null,
        spaLeft: row.spaCount != null ? Math.max(0, row.spaCount - (row.spaUsed ?? 0)) : null,
      };
    }
    for (const row of invitations.data?.subscriptions ?? []) {
      map[row.subscriptionId] = { ...map[row.subscriptionId], invitationsLeft: row.remaining };
    }
    return map;
  }, [invitations.data, overviewSubscriptions]);

  const rows = subscriptions.data ?? [];
  const current = useMemo(() => rows.filter((row) => isCurrentSubscription(row, today)), [rows, today]);
  const filtered = useMemo(() => searchMemberSubscriptions(rows, search), [rows, search]);
  const chosen = kind === 'current' ? current : kind === 'multi' ? rows.filter((row) => selected.includes(row.id)) : [];
  const chosenPackage = kind === 'single' ? packageRows.find((type) => type.id === single) : undefined;
  const activeTemplates = templates.data ?? DEFAULT_WHATSAPP_TEMPLATES;
  const message = kind === 'single'
    ? chosenPackage
      ? packageMessage(activeTemplates.package_details, chosenPackage, { today, gymName: GYM_NAME, memberName: member.name })
      : ''
    : memberSubscriptionsMessage(activeTemplates, member, chosen, { today, gymName: GYM_NAME, extras });
  const pending = (kind === 'single' ? packages.isFetching : subscriptions.isFetching) || templates.isPending;
  const failed = kind === 'single' ? packages.isError : subscriptions.isError;
  const ready = !!message && !pending && !failed;
  // A masked number (phone privacy) is resolved through the audited reveal when WhatsApp opens.
  const phone = isMaskedValue(member.phone) ? member.phone : whatsappPhone(member.phone);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      toast.success('تم نسخ الرسالة');
    } catch {
      toast.error('تعذر النسخ؛ حدّد النص وانسخه يدويًا');
    }
  };

  const pickList = (mode: 'single' | 'multi') => (
    <div className="max-h-56 overflow-y-auto rounded-lg border">
      {filtered.map((row) => {
        const checked = mode === 'single' ? single === row.id : selected.includes(row.id);
        const toggle = (value: boolean) => {
          if (mode === 'single') setSingle(value ? row.id : null);
          else setSelected((list) => (value ? [...new Set([...list, row.id])] : list.filter((id) => id !== row.id)));
        };
        return (
          <label
            key={row.id}
            className="flex min-h-14 cursor-pointer items-center gap-3 border-b px-3 py-3 last:border-b-0 hover:bg-muted/40"
          >
            {mode === 'single' ? (
              <input
                type="radio"
                name={`member-whatsapp-single-${member.id}`}
                className="size-4 accent-emerald-600"
                checked={checked}
                onChange={(event) => toggle(event.target.checked)}
              />
            ) : (
              <Checkbox checked={checked} onCheckedChange={(value) => toggle(value === true)} />
            )}
            <span className="min-w-0 flex-1">
              <span className="block break-words text-sm font-medium">{row.subscriptionType ?? '—'}</span>
              <span className="mt-1 block text-xs text-muted-foreground">
                <bdi>{row.subscriptionNumber}</bdi> · {formatDate(row.subscriptionStartDate)} ← {formatDate(row.subscriptionEndDate)} · {subscriptionStatusLabel(row, today)}
              </span>
            </span>
          </label>
        );
      })}
      {!filtered.length && !pending ? <p className="p-5 text-sm text-muted-foreground">لا توجد اشتراكات مطابقة.</p> : null}
    </div>
  );

  const packageList = (
    <div className="max-h-56 overflow-y-auto rounded-lg border">
      {filteredPackages.map((type) => (
        <label key={type.id} className="flex min-h-14 cursor-pointer items-center gap-3 border-b px-3 py-3 last:border-b-0 hover:bg-muted/40">
          <input
            type="radio"
            name={`member-whatsapp-package-${member.id}`}
            className="size-4 accent-emerald-600"
            checked={single === type.id}
            onChange={(event) => setSingle(event.target.checked ? type.id : null)}
          />
          <span className="min-w-0 flex-1">
            <span className="block break-words text-sm font-medium">{type.name}</span>
            <span className="mt-1 block text-xs text-muted-foreground">
              {formatMoney(type.price)} · {type.isLinkedToSessions ? `${type.sessionsCount ?? 0} حصة · ` : ''}{type.days} يوم
              {type.promoLive && type.promoPrice != null ? ` · عرض خاص ${formatMoney(type.promoPrice)}` : ''}
            </span>
          </span>
        </label>
      ))}
      {!filteredPackages.length && !pending ? <p className="p-5 text-sm text-muted-foreground">لا توجد باقات مطابقة.</p> : null}
    </div>
  );

  const searchBox = (
    <div className="space-y-2">
      <Label htmlFor={`member-whatsapp-search-${member.id}`}>ابحث باسم الباقة أو رقم الاشتراك أو التاريخ</Label>
      <div className="relative">
        <Search aria-hidden="true" className="pointer-events-none absolute start-3 top-3 size-4 text-muted-foreground" />
        <Input
          id={`member-whatsapp-search-${member.id}`}
          className="h-10 ps-10"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="اسم الباقة أو رقم الاشتراك"
        />
      </div>
    </div>
  );

  return (
    <>
      <button
        type="button"
        aria-label="واتساب للعضو"
        title="واتساب للعضو"
        className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg text-emerald-600 transition hover:bg-emerald-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-emerald-400"
        onClick={() => setOpen(true)}
      >
        <WhatsAppIcon className="size-6" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="lg" className="max-h-[90vh] gap-5 overflow-y-auto">
          <DialogHeader className="text-start">
            <DialogTitle className="flex items-center gap-2">
              <WhatsAppIcon className="size-5 text-emerald-600 dark:text-emerald-400" />
              واتساب للعضو — {member.name}
            </DialogTitle>
            <DialogDescription className="leading-6">
              اختار اللي هتبعته وراجع المعاينة. الرسالة بتفتح في محادثة العضو، وبتضغط إرسال من واتساب. أي قيمة صفر مش بتظهر في الرسالة.
            </DialogDescription>
          </DialogHeader>

          {!phone ? (
            <p role="alert" className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
              رقم الموبايل <MaskedPhone value={member.phone} memberId={member.id} /> مش رقم واتساب صالح. تقدر تنسخ الرسالة وتبعتها يدويًا.
            </p>
          ) : null}

          <Tabs value={kind} onValueChange={(value) => setKind(value as Kind)} dir="rtl">
            <TabsList className="grid h-auto w-full grid-cols-3 gap-1" aria-label="محتوى رسالة واتساب">
              <TabsTrigger value="current" className="min-h-10 whitespace-normal">الاشتراكات الحالية</TabsTrigger>
              <TabsTrigger value="single" className="min-h-10 whitespace-normal">اشتراك واحد</TabsTrigger>
              <TabsTrigger value="multi" className="min-h-10 whitespace-normal">أكتر من اشتراك</TabsTrigger>
            </TabsList>
            <TabsContent value="current" className="mt-4">
              <p className="text-sm text-muted-foreground">
                كل الاشتراكات السارية والمجمدة واللي لسه هتبدأ: النوع، التسجيل، البداية والانتهاء، الأيام المتبقية، المتبقي عليه، الدعوات والحصص المتبقية.{' '}
                {!subscriptions.isPending && !subscriptions.isError ? `(${current.length})` : ''}
              </p>
            </TabsContent>
            <TabsContent value="single" className="mt-4 space-y-3">
              <p className="text-sm text-muted-foreground">اختاري أي باقة في الفرع وابعتي للعضو تفاصيلها: السعر والعرض والمدة والمميزات.</p>
              {searchBox}
              {packageList}
            </TabsContent>
            <TabsContent value="multi" className="mt-4 space-y-3">
              {searchBox}
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span role="status">المحدد: {selected.length}</span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={!filtered.length || pending}
                  onClick={() => setSelected((list) => [...new Set([...list, ...filtered.map((row) => row.id)])])}
                >
                  تحديد نتائج البحث
                </Button>
                <Button type="button" size="sm" variant="ghost" disabled={!selected.length} onClick={() => setSelected([])}>
                  إلغاء التحديد
                </Button>
              </div>
              {pickList('multi')}
            </TabsContent>
          </Tabs>

          {pending ? (
            <p role="status" className="flex items-center gap-2 py-6 text-sm">
              <Loader2 className="size-4 animate-spin" />
              جارٍ تجهيز الرسالة…
            </p>
          ) : failed ? (
            <div role="alert" className="space-y-3 text-sm">
              <p className="text-destructive">{kind === 'single' ? 'تعذر تحميل الباقات.' : 'تعذر تحميل الاشتراكات كاملة.'} جرّب مرة تانية أو راجع صلاحيات الفرع.</p>
              <Button variant="outline" onClick={() => void (kind === 'single' ? packages.refetch() : subscriptions.refetch())}>إعادة المحاولة</Button>
            </div>
          ) : (
            <section className="min-w-0 space-y-2" aria-label="معاينة الرسالة">
              <Label htmlFor={`member-whatsapp-message-${member.id}`}>معاينة الرسالة</Label>
              <textarea
                id={`member-whatsapp-message-${member.id}`}
                readOnly
                value={message}
                dir="auto"
                className="max-h-80 min-h-52 w-full resize-y rounded-lg border bg-muted/20 p-4 text-sm leading-7 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder={
                  kind === 'current'
                    ? 'العضو ملوش اشتراكات حالية في الفرع ده. جرّب «أكتر من اشتراك» لاشتراك منتهي.'
                    : kind === 'single'
                      ? 'اختاري باقة عشان تظهر الرسالة.'
                      : 'اختار اشتراك أو أكتر عشان تظهر الرسالة.'
                }
              />
            </section>
          )}

          <DialogFooter className="flex-wrap gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>إغلاق</Button>
            <Button type="button" variant="outline" disabled={!ready} onClick={() => void copy()}>
              <Copy className="size-4" />
              نسخ الرسالة
            </Button>
            <Button type="button" variant="brand" disabled={!ready || !phone} onClick={() => void openWhatsAppMessage(member.phone, message, null, { memberId: member.id })}>
              <ExternalLink className="size-4" />
              فتح واتساب
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
