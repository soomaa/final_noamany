import { History, RefreshCw, TicketPlus, UserRoundPlus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  DialogFormGrid,
  DialogFormSection,
  DialogFormSummary,
  FORM_DIALOG_CONTENT_CLASS,
  FormDialogBody,
  FormDialogFooter,
  FormDialogHeader,
} from '@/components/common/dialog-form-layout';
import { EmptyState } from '@/components/common/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api, apiError } from '@/lib/api';
import { formatDateTime } from '@/lib/formatters';
import { invitationLeadPresentation } from '@/lib/guest-invitation-model';
import { toArabicDigits } from '@/lib/utils';
import { useLocale } from '@/store/locale';

export interface InvitationSummary {
  memberId: number;
  memberName: string;
  remaining: number;
  allowed: number;
  used: number;
  subscriptions: Array<{
    subscriptionId: number;
    subscriptionNumber: string;
    subscriptionType: string | null;
    remaining: number;
    allowed: number;
    used: number;
    includesInvitations: boolean;
  }>;
  history: Array<{
    id: number;
    guestName: string;
    guestPhone: string;
    guestAge: number | null;
    subscriptionId: number;
    subscriptionNumber: string;
    subscriptionType: string | null;
    leadId: number | null;
    leadStatus: string | null;
    branchId: number;
    createdAt: string;
  }>;
}

export function useInvitationSummary(memberId: number | null | undefined, enabled = true) {
  return useQuery({
    queryKey: ['club-invitations-summary', memberId],
    enabled: enabled && memberId != null && Number(memberId) > 0,
    queryFn: async () => (await api.get<InvitationSummary>(`/club-invitations/summary`, { params: { memberId } })).data,
  });
}

export function GuestInvitationDialog({
  open,
  onOpenChange,
  memberId,
  preferredSubscriptionId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  memberId: number | null;
  preferredSubscriptionId?: number | null;
}) {
  const { ui, locale } = useLocale();
  const qc = useQueryClient();
  const summary = useInvitationSummary(memberId, open);
  const eligible = useMemo(
    () => (summary.data?.subscriptions ?? []).filter((row) => row.includesInvitations && row.remaining > 0),
    [summary.data],
  );
  const [subscriptionId, setSubscriptionId] = useState('');
  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [guestAge, setGuestAge] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const preferred = preferredSubscriptionId && eligible.some((row) => row.subscriptionId === preferredSubscriptionId)
      ? String(preferredSubscriptionId)
      : eligible[0]
        ? String(eligible[0].subscriptionId)
        : '';
    setSubscriptionId(preferred);
  }, [open, eligible, preferredSubscriptionId]);

  const selected = eligible.find((row) => row.subscriptionId === Number(subscriptionId));

  const save = async () => {
    if (!subscriptionId || guestName.trim().length < 2 || guestPhone.trim().length < 6) {
      toast.error(ui('أدخل اسم الضيف ورقم الهاتف واختر الاشتراك'));
      return;
    }
    const age = Number(guestAge);
    setSaving(true);
    try {
      const response = await api.post<{ summary: InvitationSummary }>('/club-invitations', {
        subscriptionId: Number(subscriptionId),
        guestName: guestName.trim(),
        guestPhone: guestPhone.trim(),
        ...(Number.isInteger(age) && age >= 1 ? { guestAge: age } : {}),
      });
      qc.setQueryData(['club-invitations-summary', memberId], response.data.summary);
      toast.success(ui('تم إضافة الدعوة وإنشاء عميل محتمل'));
      setGuestName('');
      setGuestPhone('');
      setGuestAge('');
      void qc.invalidateQueries({ queryKey: ['club-invitations-summary', memberId] });
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="form"
        className={`${FORM_DIALOG_CONTENT_CLASS} min-w-0 w-[calc(100vw-2rem)] sm:max-w-[calc(100vw-3rem)] xl:max-w-[72rem]`}
        aria-describedby="guest-invitation-description"
      >
        <FormDialogHeader>
          <div className="flex items-start gap-3 pe-10">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary shadow-sm">
              <TicketPlus className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <DialogTitle>{ui('إضافة دعوة للعضو')}</DialogTitle>
              <DialogDescription id="guest-invitation-description" className="mt-1">
                {summary.data?.memberName
                  ? `${ui('إدارة الدعوات وسجل الضيوف الخاص بالعضو')} ${summary.data.memberName}`
                  : ui('إدارة الدعوات وسجل الضيوف الخاص بالعضو')}
              </DialogDescription>
            </div>
          </div>
        </FormDialogHeader>

        <FormDialogBody className="space-y-6">
          {summary.isLoading ? (
            <div className="grid gap-3 sm:grid-cols-3">
              {Array.from({ length: 3 }, (_, index) => <Skeleton key={index} className="h-20 rounded-xl" />)}
            </div>
          ) : summary.isError ? (
            <div className="flex flex-col gap-3 rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
              <p className="text-destructive">{ui('تعذّر تحميل الدعوات. تحقق من الاتصال ثم أعد المحاولة.')}</p>
              <Button type="button" size="sm" variant="outline" onClick={() => void summary.refetch()}>
                <RefreshCw className="size-4" /> {ui('إعادة المحاولة')}
              </Button>
            </div>
          ) : (
            <DialogFormSummary
              items={[
                { label: ui('إجمالي الدعوات'), value: toArabicDigits(summary.data?.allowed ?? 0) },
                { label: ui('الدعوات المستخدمة'), value: toArabicDigits(summary.data?.used ?? 0) },
                {
                  label: ui('الدعوات المتبقية'),
                  value: toArabicDigits(summary.data?.remaining ?? 0),
                  accent: (summary.data?.remaining ?? 0) > 0 ? 'success' : 'warning',
                },
              ]}
            />
          )}

          <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(19rem,0.8fr)_minmax(0,1.45fr)]">
            <DialogFormSection
              title={ui('دعوة جديدة')}
              description={ui('اختر الاشتراك ثم أدخل بيانات الضيف لإصدار الدعوة وإنشاء متابعة للمبيعات.')}
              icon={UserRoundPlus}
            >
              <div className="space-y-2">
                <Label htmlFor="invitation-subscription">{ui('الاشتراك')}</Label>
                <select
                  id="invitation-subscription"
                  className="flex h-11 w-full rounded-[10px] border border-input bg-background px-3 text-sm outline-none transition-shadow focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-50"
                  value={subscriptionId}
                  disabled={summary.isLoading || !eligible.length}
                  onChange={(e) => setSubscriptionId(e.target.value)}
                >
                  <option value="">{eligible.length ? ui('اختر اشتراكًا') : ui('لا توجد دعوات متاحة')}</option>
                  {eligible.map((row) => (
                    <option key={row.subscriptionId} value={row.subscriptionId}>
                      {row.subscriptionNumber} — {row.subscriptionType} ({ui('متبقي')} {toArabicDigits(row.remaining)})
                    </option>
                  ))}
                </select>
              </div>

              <DialogFormGrid>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="invitation-guest-name">{ui('اسم الضيف')} *</Label>
                  <Input
                    id="invitation-guest-name"
                    autoComplete="name"
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="invitation-guest-phone">{ui('رقم الهاتف')} *</Label>
                  <Input
                    id="invitation-guest-phone"
                    className="nums"
                    dir="ltr"
                    inputMode="tel"
                    autoComplete="tel"
                    value={guestPhone}
                    onChange={(e) => setGuestPhone(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="invitation-guest-age">{ui('العمر')} ({ui('اختياري')})</Label>
                  <Input
                    id="invitation-guest-age"
                    className="nums"
                    type="number"
                    min={1}
                    max={120}
                    value={guestAge}
                    onChange={(e) => setGuestAge(e.target.value)}
                  />
                </div>
              </DialogFormGrid>

              <div className="rounded-[10px] bg-muted/35 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
                {selected
                  ? `${ui('سيتم إنشاء عميل محتمل بمصدر دعوة صديق تلقائيًا. المتبقي بعد الحفظ')}: ${toArabicDigits(Math.max(0, selected.remaining - 1))}`
                  : ui('اختر اشتراكًا يتضمن دعوات للمتابعة.')}
              </div>
            </DialogFormSection>

            <DialogFormSection
              title={ui('سجل دعوات العضو')}
              description={ui('كل الدعوات الصادرة من اشتراكات هذا العضو، مرتبة من الأحدث إلى الأقدم.')}
              icon={History}
              className="min-w-0"
            >
              {summary.isLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-12 w-full rounded-[10px]" />)}
                </div>
              ) : summary.isError ? (
                <div className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
                  {ui('تعذّر تحميل سجل الدعوات.')}
                </div>
              ) : !(summary.data?.history ?? []).length ? (
                <EmptyState
                  icon={History}
                  compact
                  title={ui('لا توجد دعوات سابقة')}
                  description={ui('ستظهر الدعوات هنا فور حفظ أول دعوة لهذا العضو.')}
                  className="py-8"
                />
              ) : (
                <div className="max-h-[23rem] overflow-y-auto rounded-xl border border-border/70 bg-background [scrollbar-gutter:stable]">
                  <Table>
                    <TableHeader className="sticky top-0 z-10 bg-muted/95 backdrop-blur-sm">
                      <TableRow className="hover:bg-transparent">
                        <TableHead>{ui('الضيف')}</TableHead>
                        <TableHead>{ui('الهاتف')}</TableHead>
                        <TableHead>{ui('الاشتراك')}</TableHead>
                        <TableHead>{ui('تاريخ الدعوة')}</TableHead>
                        <TableHead>{ui('حالة المتابعة')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(summary.data?.history ?? []).map((row) => {
                        const lead = invitationLeadPresentation(row.leadStatus);
                        return (
                          <TableRow key={row.id}>
                            <TableCell>
                              <p className="max-w-44 truncate font-semibold" title={row.guestName}>{row.guestName}</p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {row.guestAge ? `${ui('العمر')}: ${toArabicDigits(row.guestAge)}` : ui('العمر غير مسجل')}
                              </p>
                            </TableCell>
                            <TableCell><span className="nums whitespace-nowrap" dir="ltr">{row.guestPhone}</span></TableCell>
                            <TableCell>
                              <p className="nums whitespace-nowrap font-medium" dir="ltr">{row.subscriptionNumber}</p>
                              <p className="mt-1 max-w-40 truncate text-xs text-muted-foreground" title={row.subscriptionType ?? undefined}>
                                {row.subscriptionType ?? '—'}
                              </p>
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-muted-foreground">
                              {formatDateTime(row.createdAt, locale)}
                            </TableCell>
                            <TableCell>
                              <Badge variant={lead.tone}>{ui(lead.label)}</Badge>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </DialogFormSection>
          </div>
        </FormDialogBody>

        <FormDialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{ui('إغلاق')}</Button>
          <Button
            type="button"
            variant="brand"
            permissionAction={null}
            disabled={saving || summary.isLoading || !eligible.length}
            onClick={() => void save()}
          >
            {saving ? ui('جارٍ الحفظ…') : ui('حفظ الدعوة')}
          </Button>
        </FormDialogFooter>
      </DialogContent>
    </Dialog>
  );
}
