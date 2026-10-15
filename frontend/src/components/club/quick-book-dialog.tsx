import axios from 'axios';
import { CalendarClock, Clock3, MapPin, UserPlus, Users } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Time12Input } from '@/components/common/time-12-input';
import { MemberSearchCombobox } from '@/components/club/member-search-combobox';
import { api, apiError } from '@/lib/api';
import { formatTime } from '@/lib/formatters';
import { uiStatic } from '@/lib/ui-static';
import { cn, toArabicDigits } from '@/lib/utils';
import type { ClubMemberListItem } from '@/types/club';
import type { BookingBoardTarget, ClubClassType, ClubHallRow } from '@/types/fitness';

const SELECT_CLS = 'h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring';

function minutesBetween(start: string, end: string) {
  const toMinutes = (value: string) => {
    const [hours, mins] = value.split(':').map(Number);
    return (hours ?? 0) * 60 + (mins ?? 0);
  };
  return Math.max(0, toMinutes(end) - toMinutes(start));
}

function addMinutes(start: string, minutes: number) {
  const [hours, mins] = start.split(':').map(Number);
  const total = Math.max(0, Math.min(24 * 60 - 1, (hours ?? 0) * 60 + (mins ?? 0) + minutes));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * The one-click booking from a board cell.
 *
 * Three shapes of target, one dialog: an existing session (just enroll), an open weekly slot
 * (create the session from the slot, then enroll), and a bare empty time (pick what the session
 * is, then the same). The session fields are only asked for when the target cannot supply them.
 */
export function QuickBookDialog({
  target,
  classTypes,
  halls,
  onClose,
  onBooked,
}: {
  target: BookingBoardTarget | null;
  classTypes: ClubClassType[];
  halls: ClubHallRow[];
  onClose: () => void;
  onBooked: () => void | Promise<void>;
}) {
  const entry = target?.entry;
  const mode: 'session' | 'slot' | 'blank' = entry?.kind === 'booked' ? 'session' : entry?.kind === 'free' ? 'slot' : 'blank';

  const [member, setMember] = useState<ClubMemberListItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [offerWaitlist, setOfferWaitlist] = useState(false);
  const [form, setForm] = useState({
    classTypeId: '',
    className: '',
    startTime: '08:00',
    endTime: '09:00',
    hallId: '',
    maxCapacity: '10',
    price: '0',
  });

  useEffect(() => {
    if (!target) return;
    setMember(null);
    setOfferWaitlist(false);
    setForm({
      classTypeId: entry?.classTypeId != null ? String(entry.classTypeId) : '',
      className: entry?.className ?? '',
      startTime: target.startTime,
      endTime: target.endTime,
      hallId: entry?.hallId != null ? String(entry.hallId) : '',
      maxCapacity: String(entry?.maxCapacity ?? 10),
      price: String(entry?.price ?? 0),
    });
  }, [target, entry]);

  const branchHalls = useMemo(
    () => halls.filter((hall) => !target || hall.branchId === target.branchId),
    [halls, target],
  );

  const applyClassType = (value: string) => {
    const type = classTypes.find((item) => item.id === Number(value));
    setForm((current) => ({
      ...current,
      classTypeId: value,
      className: type?.name ?? current.className,
      endTime: type ? addMinutes(current.startTime, type.defaultDurationMinutes) : current.endTime,
      price: type ? String(type.singleSessionPrice) : current.price,
    }));
  };

  const submit = async (waitlistIfFull: boolean) => {
    if (!target || !member) {
      toast.error(uiStatic('اختر العميل أولًا'));
      return;
    }
    if (mode !== 'session' && !form.classTypeId && !form.className.trim()) {
      toast.error(uiStatic('اختر نوع الحصة أو اكتب اسمها'));
      return;
    }
    if (mode !== 'session' && minutesBetween(form.startTime, form.endTime) <= 0) {
      toast.error(uiStatic('وقت النهاية يجب أن يكون بعد وقت البداية'));
      return;
    }
    setSaving(true);
    try {
      await api.post('/club/booking-board/book', {
        memberId: member.id,
        waitlistIfFull,
        ...(mode === 'session'
          ? { classId: entry!.classId }
          : {
            slot: {
              trainerId: target.trainerId,
              branchId: target.branchId,
              date: target.date,
              startTime: form.startTime,
              endTime: form.endTime,
              classTypeId: form.classTypeId ? Number(form.classTypeId) : null,
              className: form.className.trim() || null,
              hallId: form.hallId ? Number(form.hallId) : null,
              templateSlotId: entry?.templateSlotId ?? null,
              maxCapacity: Number(form.maxCapacity) || 10,
              price: Number(form.price) || 0,
            },
          }),
      });
      toast.success(waitlistIfFull
        ? uiStatic('تمت إضافة العميل لقائمة الانتظار')
        : `${uiStatic('تم حجز ')}${member.name}${uiStatic(' مع ')}${target.trainerName}`);
      await onBooked();
      onClose();
    } catch (error) {
      // A full session is a routine answer, not a failure — offer the waitlist in place.
      // Nest flattens an object thrown from BadRequestException, so `code` lands at the top
      // level; older handlers nest it under `message`, so read both.
      const data = axios.isAxiosError(error)
        ? (error.response?.data as { code?: string; message?: { code?: string } } | undefined)
        : undefined;
      const code = data?.code ?? data?.message?.code;
      if (code === 'CLASS_FULL') {
        setOfferWaitlist(true);
        toast.warning(uiStatic('الحصة ممتلئة — تقدر تضيفه لقائمة الانتظار'));
      } else {
        toast.error(apiError(error));
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={target != null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent size="lg" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="size-5 text-primary" />
            {mode === 'session' ? uiStatic('إضافة عميل للميعاد') : uiStatic('حجز ميعاد جديد')}
          </DialogTitle>
        </DialogHeader>

        {target ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border bg-muted/30 p-3 text-sm">
              <span className="font-semibold">{target.trainerName}</span>
              <span className="nums flex items-center gap-1 text-muted-foreground" dir="ltr">
                <Clock3 className="size-3.5" />
                {formatTime(form.startTime)} – {formatTime(form.endTime)}
              </span>
              <span className="nums flex items-center gap-1 text-muted-foreground">
                <CalendarClock className="size-3.5" />
                {toArabicDigits(target.date)}
              </span>
              {entry?.hallName ? (
                <span className="flex items-center gap-1 text-muted-foreground"><MapPin className="size-3.5" />{entry.hallName}</span>
              ) : null}
              {mode === 'session' ? (
                <span className="nums ms-auto flex items-center gap-1 rounded-full bg-background px-2 py-0.5 text-xs">
                  <Users className="size-3.5" />
                  {toArabicDigits(entry!.enrollmentCount)} / {toArabicDigits(entry!.maxCapacity)}
                </span>
              ) : null}
            </div>

            {mode === 'session' && entry?.members?.length ? (
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">{uiStatic('المحجوزين حاليًا')}</Label>
                <div className="flex flex-wrap gap-1.5">
                  {entry.members.map((booked) => (
                    <span key={booked.memberId} className="rounded-full border bg-card px-2.5 py-1 text-xs">
                      {booked.memberName ?? `#${booked.memberId}`}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="space-y-2">
              <Label>{uiStatic('العميل *')}</Label>
              {/* Keyed on the cell: the combobox keeps its own typed text, so without a
                  remount the previous client's name is still in the box on the next cell. */}
              <MemberSearchCombobox
                key={`${target.trainerId}-${target.startTime}-${entry?.classId ?? entry?.templateSlotId ?? 'blank'}`}
                selectedMember={member}
                onSelect={setMember}
                onClear={() => setMember(null)}
              />
            </div>

            {mode !== 'session' ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>{uiStatic('نوع الحصة')}</Label>
                  <select
                    className={SELECT_CLS}
                    value={form.classTypeId}
                    onChange={(event) => applyClassType(event.target.value)}
                    disabled={mode === 'slot'}
                  >
                    <option value="">{uiStatic('بدون نوع (حصة خاصة)')}</option>
                    {classTypes.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>{uiStatic('اسم الحصة')}</Label>
                  <Input
                    value={form.className}
                    disabled={Boolean(form.classTypeId)}
                    onChange={(event) => setForm((current) => ({ ...current, className: event.target.value }))}
                    placeholder={uiStatic('مثال: تدريب شخصي')}
                  />
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>{uiStatic('من')}</Label>
                    <Time12Input
                      value={form.startTime}
                      onValueChange={(value) => setForm((current) => ({
                        ...current,
                        startTime: value,
                        endTime: addMinutes(value, minutesBetween(current.startTime, current.endTime) || 60),
                      }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{uiStatic('إلى')}</Label>
                    <Time12Input
                      value={form.endTime}
                      onValueChange={(value) => setForm((current) => ({ ...current, endTime: value }))}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>{uiStatic('القاعة')}</Label>
                  <select
                    className={SELECT_CLS}
                    value={form.hallId}
                    onChange={(event) => setForm((current) => ({ ...current, hallId: event.target.value }))}
                  >
                    <option value="">{uiStatic('بدون قاعة')}</option>
                    {branchHalls.map((hall) => <option key={hall.id} value={hall.id}>{hall.name}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>{uiStatic('عدد الأماكن')}</Label>
                  <Input
                    type="number"
                    min={1}
                    className="nums"
                    value={form.maxCapacity}
                    onChange={(event) => setForm((current) => ({ ...current, maxCapacity: event.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{uiStatic('السعر')}</Label>
                  <Input
                    type="number"
                    min={0}
                    className="nums"
                    value={form.price}
                    onChange={(event) => setForm((current) => ({ ...current, price: event.target.value }))}
                  />
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        <DialogFooter className={cn(offerWaitlist && 'flex-wrap gap-2')}>
          <Button variant="outline" onClick={onClose}>{uiStatic('إلغاء')}</Button>
          {offerWaitlist ? (
            <Button variant="secondary" disabled={saving} onClick={() => void submit(true)}>
              {uiStatic('أضفه لقائمة الانتظار')}
            </Button>
          ) : null}
          <Button permissionAction="create" variant="brand" disabled={saving || !member} onClick={() => void submit(false)}>
            {uiStatic('تأكيد الحجز')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
