import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Loader2, Search, UserPlus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { SearchableSelect } from '@/components/common/searchable-select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useBranches } from '@/hooks/use-branches';
import { usePermission } from '@/hooks/use-permission';
import { api, apiError } from '@/lib/api';
import { cn, toArabicDigits } from '@/lib/utils';
import { useAuth } from '@/store/auth';

export interface StaffCodeLookup {
  codeId: number;
  code: string;
  employeeId: number;
  employeeName: string;
  employeeBranchId: number | null;
  isActive: boolean;
  quota: number;
  usedThisMonth: number;
  remaining: number;
}

interface PhoneCheck {
  phone: string;
  warnings: string[];
  blocking: string | null;
}

interface RecordedInvitation {
  id: number;
  employeeName: string;
  code: string;
  leadId: number;
  reusedLead: boolean;
  assignedToName: string | null;
  /** inviter | round_robin | unassigned | existing_lead, with the sentence to show. */
  assignment: string;
  assignmentMessage: string;
  overQuota: boolean;
  remaining: number;
  warnings: string[];
}

/** Query keys every staff-invitation screen refreshes after a guest is recorded. */
export const STAFF_INVITATIONS_KEY = ['club-staff-invitations'] as const;

export function cairoToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' });
}

/** Same rule as the server: an Egyptian mobile, stored as 01XXXXXXXXX. */
export function egyptianMobile(raw: string): string | null {
  let digits = raw.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660)).replace(/\D/g, '');
  if (digits.startsWith('0020')) digits = `0${digits.slice(4)}`;
  else if (digits.startsWith('20') && digits.length === 12) digits = `0${digits.slice(2)}`;
  else if (digits.length === 10 && digits.startsWith('1')) digits = `0${digits}`;
  return /^01[0125]\d{8}$/.test(digits) ? digits : null;
}

/**
 * «دعوة بكود موظف»: type / scan the employee's code (or pick the employee), then the guest's
 * name and mobile. The guest becomes a sales lead tied to the employee; one invitation is taken
 * from the code's monthly allowance.
 */
export function StaffInvitationDialog({
  open,
  onOpenChange,
  defaultEmployeeId,
  defaultBranchId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultEmployeeId?: number | null;
  defaultBranchId?: number | null;
}) {
  const qc = useQueryClient();
  const { can } = usePermission();
  const user = useAuth((state) => state.user);
  const { data: branches = [] } = useBranches();
  const canOverride = can('club.staff_invitations:approve');
  // An employee tied to one branch records visits for that branch only; the admin picks one.
  const branchLocked = user?.level !== 1 && !!user?.branch && user.branch > 0;

  const [codeInput, setCodeInput] = useState('');
  const [card, setCard] = useState<StaffCodeLookup | null>(null);
  const [looking, setLooking] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [phoneCheck, setPhoneCheck] = useState<PhoneCheck | null>(null);
  const [visitDate, setVisitDate] = useState(cairoToday());
  const [branchId, setBranchId] = useState('');
  const [notes, setNotes] = useState('');
  const [overrideReason, setOverrideReason] = useState('');
  const [saving, setSaving] = useState(false);

  const activeCodes = useQuery({
    queryKey: [...STAFF_INVITATIONS_KEY, 'active-codes'],
    queryFn: async () => (await api.get<Array<{ codeId: number; code: string; employeeId: number; employeeName: string }>>('/club-staff-invitations/active-codes')).data,
    enabled: open,
    staleTime: 60_000,
  });

  const reset = () => {
    setCodeInput('');
    setCard(null);
    setLookupError(null);
    setGuestName('');
    setGuestPhone('');
    setPhoneCheck(null);
    setVisitDate(cairoToday());
    setNotes('');
    setOverrideReason('');
  };

  const lookup = async (params: { code?: string; employeeId?: number }) => {
    setLooking(true);
    setLookupError(null);
    try {
      const { data } = await api.get<StaffCodeLookup>('/club-staff-invitations/lookup', { params });
      setCard(data);
      setCodeInput(data.code);
    } catch (error) {
      setCard(null);
      setLookupError(apiError(error));
    } finally {
      setLooking(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    const ownBranch = user?.branch && user.branch > 0 ? user.branch : null;
    const fallbackBranch = (user?.level !== 1 ? ownBranch : null) ?? defaultBranchId ?? ownBranch;
    setBranchId(fallbackBranch ? String(fallbackBranch) : '');
    if (defaultEmployeeId) void lookup({ employeeId: defaultEmployeeId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultEmployeeId, defaultBranchId]);

  const checkPhone = async () => {
    const phone = egyptianMobile(guestPhone);
    if (!phone) {
      setPhoneCheck(null);
      return;
    }
    try {
      const { data } = await api.get<PhoneCheck>('/club-staff-invitations/check-phone', { params: { phone } });
      setPhoneCheck(data);
    } catch {
      setPhoneCheck(null);
    }
  };

  const close = () => {
    if (saving) return;
    onOpenChange(false);
    reset();
  };

  const exhausted = !!card && card.remaining < 1;
  const needsOverride = exhausted || !!phoneCheck?.blocking;
  const phoneValid = !!egyptianMobile(guestPhone);

  const submit = async () => {
    if (!card) return toast.error('اكتب كود الموظف واضغط بحث، أو اختار الموظف');
    if (!card.isActive) return toast.error('الكود ده موقوف');
    if (guestName.trim().length < 2) return toast.error('اكتب اسم الضيف');
    if (!phoneValid) return toast.error('رقم الموبايل لازم يكون موبايل مصري صحيح (11 رقم يبدأ بـ 01)');
    if (!branchId) return toast.error('اختار الفرع');
    if (needsOverride && (!canOverride || overrideReason.trim().length < 3)) {
      return toast.error(canOverride ? 'اكتب سبب التجاوز' : exhausted ? 'الكود خلّص دعواته الشهر ده' : phoneCheck?.blocking ?? '');
    }
    setSaving(true);
    try {
      const { data } = await api.post<RecordedInvitation>('/club-staff-invitations', {
        employeeId: card.employeeId,
        guestName: guestName.trim(),
        guestPhone: egyptianMobile(guestPhone),
        visitDate,
        branchId: Number(branchId),
        notes: notes.trim() || undefined,
        overrideReason: needsOverride ? overrideReason.trim() : undefined,
      });
      toast.success(
        `اتسجلت دعوة ${guestName.trim()} من ${data.employeeName} — المتبقي للكود: ${toArabicDigits(data.remaining)}`,
        { description: data.assignmentMessage },
      );
      if (data.assignment === 'unassigned') toast.warning(data.assignmentMessage);
      void qc.invalidateQueries({ queryKey: STAFF_INVITATIONS_KEY });
      onOpenChange(false);
      reset();
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(value) => { if (!value) close(); }}>
      <DialogContent size="md" className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>دعوة بكود موظف</DialogTitle>
          <DialogDescription>
            الضيف بيتسجل عميل محتمل عند السيلز ومربوط بالموظف صاحب الكود، وبتتخصم دعوة من رصيد الكود الشهري.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="staff-code">كود الموظف</Label>
              <div className="flex gap-2">
                <Input
                  id="staff-code"
                  dir="ltr"
                  autoFocus
                  placeholder="NM1001"
                  value={codeInput}
                  onChange={(event) => { setCodeInput(event.target.value.toUpperCase()); setCard(null); setLookupError(null); }}
                  onKeyDown={(event) => { if (event.key === 'Enter' && codeInput.trim()) { event.preventDefault(); void lookup({ code: codeInput.trim() }); } }}
                />
                <Button type="button" variant="outline" size="icon" disabled={!codeInput.trim() || looking} onClick={() => void lookup({ code: codeInput.trim() })} aria-label="بحث بالكود">
                  {looking ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
                </Button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>أو اختار الموظف</Label>
              <SearchableSelect
                className="h-10 w-full rounded-md border bg-background px-3"
                value={card ? String(card.employeeId) : ''}
                onChange={(event) => { if (event.target.value) void lookup({ employeeId: Number(event.target.value) }); }}
              >
                <option value="">اختار…</option>
                {(activeCodes.data ?? []).map((row) => (
                  <option key={row.codeId} value={row.employeeId}>{`${row.employeeName} — ${row.code}`}</option>
                ))}
              </SearchableSelect>
            </div>
          </div>

          {lookupError ? <p className="text-sm text-destructive">{lookupError}</p> : null}
          {card ? (
            <div className={cn('flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3', exhausted || !card.isActive ? 'border-destructive/40 bg-destructive/5' : 'border-primary/30 bg-primary/5')}>
              <div>
                <p className="font-semibold">{card.employeeName}</p>
                <p className="text-xs text-muted-foreground" dir="ltr">{card.code}</p>
              </div>
              <div className="flex items-center gap-2 text-sm">
                {!card.isActive ? <Badge variant="destructive">الكود موقوف</Badge> : null}
                <span className="nums">
                  المتبقي الشهر ده: <b className={cn(exhausted ? 'text-destructive' : 'text-foreground')}>{toArabicDigits(card.remaining)}</b> من {toArabicDigits(card.quota)}
                </span>
              </div>
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="guest-name-staff">اسم الضيف</Label>
              <Input id="guest-name-staff" value={guestName} onChange={(event) => setGuestName(event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="guest-phone-staff">موبايل الضيف</Label>
              <Input
                id="guest-phone-staff"
                dir="ltr"
                inputMode="tel"
                placeholder="01XXXXXXXXX"
                value={guestPhone}
                aria-invalid={guestPhone.trim() !== '' && !phoneValid}
                onChange={(event) => { setGuestPhone(event.target.value); setPhoneCheck(null); }}
                onBlur={() => void checkPhone()}
              />
              {guestPhone.trim() !== '' && !phoneValid ? <p className="text-xs text-destructive">موبايل مصري 11 رقم يبدأ بـ 01</p> : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="visit-date-staff">تاريخ الزيارة</Label>
              <Input id="visit-date-staff" type="date" value={visitDate} onChange={(event) => setVisitDate(event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>الفرع</Label>
              <SearchableSelect className="h-10 w-full rounded-md border bg-background px-3 disabled:opacity-70" value={branchId} disabled={branchLocked} onChange={(event) => setBranchId(event.target.value)}>
                <option value="">اختار الفرع</option>
                {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name ?? `#${branch.id}`}</option>)}
              </SearchableSelect>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="guest-notes-staff">ملاحظات (بتظهر عند السيلز)</Label>
            <Textarea id="guest-notes-staff" rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} />
          </div>

          {phoneCheck && (phoneCheck.warnings.length || phoneCheck.blocking) ? (
            <div className="space-y-1 rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm">
              {[...(phoneCheck.blocking ? [phoneCheck.blocking] : []), ...phoneCheck.warnings].map((line) => (
                <p key={line} className="flex items-start gap-2"><AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />{line}</p>
              ))}
            </div>
          ) : null}

          {needsOverride ? (
            canOverride ? (
              <div className="space-y-1.5 rounded-xl border border-destructive/30 p-3">
                <Label htmlFor="override-reason">{exhausted ? 'الكود خلّص دعواته — سبب التجاوز' : 'سبب تسجيل الرقم تاني'}</Label>
                <Input id="override-reason" value={overrideReason} onChange={(event) => setOverrideReason(event.target.value)} placeholder="مثلاً: موافقة المدير" />
                <p className="text-xs text-muted-foreground">التجاوز بيتسجل في سجل الكود باسمك.</p>
              </div>
            ) : (
              <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                {exhausted ? 'الكود ده خلّص دعواته الشهر ده. الرصيد بيتجدد أول الشهر، أو اطلب من الإدارة تزود له.' : phoneCheck?.blocking}
              </p>
            )
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" disabled={saving} onClick={close}>إلغاء</Button>
          <Button
            variant="brand"
            disabled={saving || !card || !card.isActive || (needsOverride && !canOverride)}
            onClick={() => void submit()}
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
            تسجيل الدعوة
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** The «دعوة بكود موظف» button + its dialog, for reception and the codes page. */
export function StaffInvitationButton({
  className,
  variant = 'outline',
  defaultEmployeeId,
  defaultBranchId,
  iconOnly = false,
}: {
  className?: string;
  variant?: 'outline' | 'brand';
  defaultEmployeeId?: number | null;
  defaultBranchId?: number | null;
  /** Reception's quick search row: the icon alone (title says what it does). */
  iconOnly?: boolean;
}) {
  const { can } = usePermission();
  const [open, setOpen] = useState(false);
  if (!can('club.staff_invitations:create') && !can('club.reception:create')) return null;
  return (
    <>
      <Button
        type="button"
        variant={variant}
        className={className}
        onClick={() => setOpen(true)}
        title="إضافة زيارة بكود موظف"
        aria-label="إضافة زيارة بكود موظف"
      >
        <UserPlus className={iconOnly ? 'size-5' : 'size-4'} />
        {iconOnly ? null : 'دعوة بكود موظف'}
      </Button>
      <StaffInvitationDialog open={open} onOpenChange={setOpen} defaultEmployeeId={defaultEmployeeId} defaultBranchId={defaultBranchId} />
    </>
  );
}
