import { formatDisplayNumber } from '@/lib/number-display';
import { MemberCell } from '@/components/club/member-cell';
import { PaidAmountField } from '@/components/club/paid-amount-field';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreHorizontal } from 'lucide-react';
import { apiError } from '@/lib/api';
import { afterMenuClose } from '@/lib/confirm';
import { clubEventsApi } from '@/lib/api/club-events';
import { useLocale } from '@/store/locale';
import { RegisterDialog } from './RegisterDialog';
import { usePermission } from '@/hooks/use-permission';
import { useClubPrintingPolicy } from '@/hooks/use-club-printing-policy';
import { printThermalFinancialReceiptWithFallback } from '@/components/club/thermal-receipt-print';
import { runAutoPrintOnce } from '@/lib/club-printing';
import { useAuth } from '@/store/auth';

const REGISTRANT_BADGE: Record<string, string> = {
  member: 'bg-blue-100 text-blue-700',
  guest: 'bg-purple-100 text-purple-700',
  lead: 'bg-orange-100 text-orange-700',
};

const STATUS_BADGE: Record<string, string> = {
  pending_payment: 'bg-yellow-100 text-yellow-700',
  confirmed: 'bg-green-100 text-green-700',
  waitlisted: 'bg-amber-100 text-amber-700',
  cancelled: 'bg-red-100 text-red-700',
  refunded: 'bg-slate-100 text-slate-700',
};

interface RegistrationRow {
  id: number;
  registrationNumber: string;
  registrantType: string;
  status: string;
  price: number;
  paidAmount: number;
  memberId: number | null;
  memberName?: string | null;
  memberCode?: string | null;
  guestName: string | null;
  tierId: number | null;
}

interface EventDetail {
  id: number;
  title: string;
  allowGuests: boolean;
  requiresGuardianConsent: boolean;
  tiers?: Array<{ id: number; name: string; audience: string; price: number; earlyBirdPrice: number | null; earlyBirdUntil: string | null }>;
}

function PayDialog({
  registration,
  event,
  open,
  onOpenChange,
}: {
  registration: RegistrationRow | null;
  event: EventDetail;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { ui, dir } = useLocale();
  const qc = useQueryClient();
  const { can } = usePermission();
  const { user } = useAuth();
  const { policy, shouldPrint } = useClubPrintingPolicy();
  const canUpdate = can('club.events.registrations:update');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('cash');

  const mutation = useMutation({
    mutationFn: () => {
      if (!canUpdate) throw new Error(ui('غير مصرح'));
      return clubEventsApi.payRegistration(registration!.id, {
        amount: Number(amount),
        paymentMethod: method,
        idempotencyKey: crypto.randomUUID(),
      });
    },
    onSuccess: (payment: { paymentNumber: string; amount: number; paymentMethod: string | null; branchId: number }) => {
      toast.success(ui('تم تسجيل الدفعة بنجاح'));
      if (shouldPrint('event', payment.amount, payment.paymentNumber)) {
        runAutoPrintOnce('event', payment.paymentNumber, () => printThermalFinancialReceiptWithFallback({
          documentNumber: payment.paymentNumber,
          transactionLabel: 'Event payment',
          itemName: event.title,
          customerName: registration?.memberName || registration?.guestName || 'Event guest',
          memberCode: registration?.memberCode,
          branchName: `Branch #${payment.branchId}`,
          collectedAmount: payment.amount,
          paymentMethod: payment.paymentMethod || method,
          operatorName: user?.name,
          subscriptionNumber: registration?.registrationNumber,
        }, policy));
      }
      void qc.invalidateQueries({ queryKey: ['club-event-registrations'] });
      setAmount('');
      onOpenChange(false);
    },
    onError: (err) => toast.error(apiError(err)),
  });

  return (
    <Dialog open={open && canUpdate} onOpenChange={onOpenChange}>
      <DialogContent size="sm" aria-describedby={undefined} dir={dir}>
        <DialogHeader><DialogTitle>{ui('تسجيل دفعة')}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <PaidAmountField
            label={ui('المبلغ المدفوع')}
            value={amount}
            min={0.01}
            step={0.01}
            onChange={setAmount}
          />
          <div className="space-y-1.5">
            <Label>{ui('طريقة الدفع')}</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">{ui('نقدي')}</SelectItem>
                <SelectItem value="card">{ui('بطاقة')}</SelectItem>
                <SelectItem value="bank">{ui('تحويل بنكي')}</SelectItem>
                <SelectItem value="online">{ui('دفع إلكتروني')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{ui('إلغاء')}</Button>
          <Button permissionResource="club.events.registrations" permissionAction="update" disabled={!amount || mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? ui('جاري الحفظ...') : ui('تأكيد الدفع')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RefundDialog({
  registrationId,
  open,
  onOpenChange,
}: {
  registrationId: number | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { ui, dir } = useLocale();
  const qc = useQueryClient();
  const { can } = usePermission();
  const canUpdate = can('club.events.registrations:update');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('cash');
  const [reason, setReason] = useState('');

  const mutation = useMutation({
    mutationFn: () => {
      if (!canUpdate) throw new Error(ui('غير مصرح'));
      return clubEventsApi.refundRegistration(registrationId!, {
        amount: Number(amount),
        paymentMethod: method,
        reason: reason || undefined,
      });
    },
    onSuccess: () => {
      toast.success(ui('تم رد المبلغ بنجاح'));
      void qc.invalidateQueries({ queryKey: ['club-event-registrations'] });
      setAmount('');
      setReason('');
      onOpenChange(false);
    },
    onError: (err) => toast.error(apiError(err)),
  });

  return (
    <Dialog open={open && canUpdate} onOpenChange={onOpenChange}>
      <DialogContent size="sm" aria-describedby={undefined} dir={dir}>
        <DialogHeader><DialogTitle>{ui('رد مبلغ')}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>{ui('المبلغ')}</Label>
            <Input type="number" min={0.01} step="0.01" value={amount} onChange={e => setAmount(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>{ui('طريقة الرد')}</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">{ui('نقدي')}</SelectItem>
                <SelectItem value="card">{ui('بطاقة')}</SelectItem>
                <SelectItem value="bank">{ui('تحويل بنكي')}</SelectItem>
                <SelectItem value="online">{ui('دفع إلكتروني')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{ui('السبب')}</Label>
            <Input value={reason} onChange={e => setReason(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{ui('إلغاء')}</Button>
          <Button permissionResource="club.events.registrations" permissionAction="update" variant="destructive" disabled={!amount || mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? ui('جاري الحفظ...') : ui('تأكيد الرد')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RegistrationsTab({ event }: { event: EventDetail }) {
  const { ui } = useLocale();
  const qc = useQueryClient();
  const { can } = usePermission();
  const canView = can('club.events.registrations:view');
  const canCreate = can('club.events.registrations:create');
  const canUpdate = can('club.events.registrations:update');
  const [page, setPage] = useState(1);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [payFor, setPayFor] = useState<RegistrationRow | null>(null);
  const [refundFor, setRefundFor] = useState<number | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['club-event-registrations', event.id, page],
    queryFn: () => clubEventsApi.listRegistrations({ eventId: event.id, page, pageSize: 20 }),
    enabled: canView,
  });

  const rows: RegistrationRow[] = data?.data ?? [];
  const total: number = data?.total ?? 0;

  const cancelMutation = useMutation({
    mutationFn: (id: number) => canUpdate ? clubEventsApi.cancelRegistration(id) : Promise.reject(new Error(ui('غير مصرح'))),
    onSuccess: () => {
      toast.success(ui('تم إلغاء التسجيل'));
      void qc.invalidateQueries({ queryKey: ['club-event-registrations', event.id] });
    },
    onError: (err) => toast.error(apiError(err)),
  });

  const promoteMutation = useMutation({
    mutationFn: (id: number) => canUpdate ? clubEventsApi.promoteRegistration(id) : Promise.reject(new Error(ui('غير مصرح'))),
    onSuccess: () => {
      toast.success(ui('تمت ترقية المشارك من قائمة الانتظار'));
      void qc.invalidateQueries({ queryKey: ['club-event-registrations', event.id] });
    },
    onError: (err) => toast.error(apiError(err)),
  });

  const tierName = (tierId: number | null) => event.tiers?.find(t => t.id === tierId)?.name ?? '—';

  if (!canView) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">{ui('المسجلون')} ({formatDisplayNumber(total)})</h3>
        {canCreate ? <Button permissionResource="club.events.registrations" permissionAction="create" size="sm" onClick={() => setRegisterOpen(true)}>
          <Plus className="h-4 w-4 ms-1" /> {ui('تسجيل مشارك')}
        </Button> : null}
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground py-8 text-center">{ui('جاري التحميل...')}</div>
      ) : isError ? (
        <div className="text-sm text-red-500 py-8 text-center">{ui('حدث خطأ أثناء تحميل البيانات')}</div>
      ) : rows.length === 0 ? (
        <div className="text-sm text-muted-foreground py-8 text-center">{ui('لا توجد تسجيلات بعد')}</div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">{ui('رقم التسجيل')}</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">{ui('الاسم')}</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">{ui('النوع')}</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">{ui('الفئة')}</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">{ui('الحالة')}</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">{ui('المدفوع / السعر')}</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">{ui('الإجراءات')}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map(reg => (
                <tr key={reg.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 text-muted-foreground">{reg.registrationNumber}</td>
                  <td className="px-4 py-3 font-medium">
                    <MemberCell
                      name={reg.memberName}
                      code={reg.memberCode}
                      memberId={reg.memberId}
                      fallback={reg.guestName}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <span className={'inline-flex px-2 py-0.5 rounded-full text-xs font-medium ' + (REGISTRANT_BADGE[reg.registrantType] ?? 'bg-gray-100 text-gray-700')}>
                      {reg.registrantType}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{tierName(reg.tierId)}</td>
                  <td className="px-4 py-3">
                    <span className={'inline-flex px-2 py-0.5 rounded-full text-xs font-medium ' + (STATUS_BADGE[reg.status] ?? 'bg-gray-100 text-gray-700')}>
                      {reg.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {formatDisplayNumber(reg.paidAmount)} / {formatDisplayNumber(reg.price)}
                  </td>
                  <td className="px-4 py-3">
                    {canUpdate ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {reg.status !== 'cancelled' && reg.status !== 'refunded' && (
                          <DropdownMenuItem onSelect={() => afterMenuClose(() => setPayFor(reg))}>{ui('تسجيل دفعة')}</DropdownMenuItem>
                        )}
                        {reg.paidAmount > 0 && (
                          <DropdownMenuItem onSelect={() => afterMenuClose(() => setRefundFor(reg.id))}>{ui('رد مبلغ')}</DropdownMenuItem>
                        )}
                        {reg.status === 'waitlisted' && (
                          <DropdownMenuItem onSelect={() => promoteMutation.mutate(reg.id)}>{ui('ترقية من قائمة الانتظار')}</DropdownMenuItem>
                        )}
                        {reg.status !== 'cancelled' && (
                          <DropdownMenuItem
                            className="text-destructive"
                            onSelect={() => cancelMutation.mutate(reg.id)}
                          >
                            {ui('إلغاء التسجيل')}
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {total > 20 && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>{ui('السابق')}</Button>
          <span className="text-sm text-muted-foreground">{ui('صفحة')} {formatDisplayNumber(page)}</span>
          <Button variant="outline" size="sm" disabled={page * 20 >= total} onClick={() => setPage(p => p + 1)}>{ui('التالي')}</Button>
        </div>
      )}

      <RegisterDialog open={registerOpen} onOpenChange={setRegisterOpen} event={event} />
      <PayDialog registration={payFor} event={event} open={payFor != null} onOpenChange={(v) => !v && setPayFor(null)} />
      <RefundDialog registrationId={refundFor} open={refundFor != null} onOpenChange={(v) => !v && setRefundFor(null)} />
    </div>
  );
}
