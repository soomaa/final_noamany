import { CalendarClock, Check, MapPin, Settings2, Trash2, UserPlus, Users, X } from 'lucide-react';
import type { ComponentProps } from 'react';
import { toast } from 'sonner';
import { StatusBadge } from '@/components/common/status-badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { api, apiError } from '@/lib/api';
import { confirm } from '@/lib/confirm';
import { formatTime } from '@/lib/formatters';
import { uiStatic } from '@/lib/ui-static';
import { toArabicDigits } from '@/lib/utils';
import type { BookingBoardEntry } from '@/types/fitness';
import { MaskedPhone } from '@/components/club/masked-phone';

type BadgeStatus = ComponentProps<typeof StatusBadge>['status'];

const ATTENDANCE_LABEL: Record<string, { label: string; status: BadgeStatus }> = {
  attended: { label: uiStatic('حضر'), status: 'active' },
  absent: { label: uiStatic('لم يحضر'), status: 'absent' },
  registered: { label: uiStatic('محجوز'), status: 'pending' },
};

/**
 * What a filled cell opens into: who is in this slot, and the three things reception does next —
 * add another client, mark someone in or out, or take a booking off the board.
 */
export function BookingCellDialog({
  entry,
  trainerName,
  date,
  canBook,
  canUpdate,
  canDelete,
  onClose,
  onChanged,
  onAddMember,
  onOpenSession,
}: {
  entry: BookingBoardEntry | null;
  trainerName: string;
  date: string;
  canBook: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  onClose: () => void;
  onChanged: () => void | Promise<void>;
  onAddMember: () => void;
  onOpenSession: (classId: number) => void;
}) {
  const members = entry?.members ?? [];

  const setAttendance = async (memberId: number, attendanceStatus: 'attended' | 'absent') => {
    if (!entry?.classId) return;
    try {
      await api.patch(`/club-classes/${entry.classId}/attendance/${memberId}`, {
        attendanceStatus,
        attendanceTime: attendanceStatus === 'attended' ? new Date().toTimeString().slice(0, 5) : null,
      });
      await onChanged();
    } catch (error) {
      toast.error(apiError(error));
    }
  };

  const removeMember = async (memberId: number, memberName: string | null) => {
    if (!entry?.classId) return;
    const ok = await confirm({
      title: uiStatic('إلغاء حجز العميل؟'),
      description: `${memberName ?? uiStatic('العميل')}${uiStatic(' هيتشال من الميعاد ده. الميعاد نفسه هيفضل موجود.')}`,
      variant: 'destructive',
    });
    if (!ok) return;
    try {
      await api.delete(`/club/booking-board/book/${entry.classId}/${memberId}`);
      toast.success(uiStatic('تم إلغاء الحجز'));
      await onChanged();
    } catch (error) {
      toast.error(apiError(error));
    }
  };

  return (
    <Dialog open={entry != null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent size="lg" className="max-h-[90vh] overflow-y-auto" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="size-3 rounded-full" style={{ backgroundColor: entry?.color ?? '#2563EB' }} />
            {entry?.className ?? uiStatic('تفاصيل الميعاد')}
          </DialogTitle>
        </DialogHeader>

        {entry ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border bg-muted/30 p-3 text-sm">
              <span className="font-semibold">{trainerName}</span>
              <span className="nums flex items-center gap-1 text-muted-foreground" dir="ltr">
                <CalendarClock className="size-3.5" />
                {formatTime(entry.startTime)} – {formatTime(entry.endTime)}
              </span>
              <span className="nums text-muted-foreground">{toArabicDigits(date)}</span>
              {entry.hallName ? (
                <span className="flex items-center gap-1 text-muted-foreground"><MapPin className="size-3.5" />{entry.hallName}</span>
              ) : null}
              <span className="nums ms-auto flex items-center gap-1 rounded-full bg-background px-2 py-0.5 text-xs">
                <Users className="size-3.5" />
                {toArabicDigits(entry.enrollmentCount)} / {toArabicDigits(entry.maxCapacity)}
              </span>
            </div>

            <section className="overflow-hidden rounded-xl border">
              <div className="flex items-center justify-between border-b bg-muted/30 px-4 py-2.5">
                <p className="text-sm font-medium">{uiStatic('العملاء في هذا الميعاد')}</p>
                <span className="nums text-xs text-muted-foreground">
                  {toArabicDigits(entry.remainingSeats)} {uiStatic('مكان متبقي')}
                </span>
              </div>
              <div className="divide-y">
                {members.map((member) => {
                  const badge = ATTENDANCE_LABEL[member.attendanceStatus] ?? ATTENDANCE_LABEL.registered!;
                  return (
                    <div key={member.memberId} className="grid items-center gap-2 px-4 py-2.5 sm:grid-cols-[1fr_auto_auto]">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{member.memberName ?? `#${member.memberId}`}</p>
                        <p className="nums truncate text-xs text-muted-foreground">
                          {member.memberCode ?? '—'}{member.memberPhone ? <> · <MaskedPhone value={member.memberPhone} memberId={member.memberId} /></> : null}
                        </p>
                      </div>
                      <StatusBadge status={badge.status} label={badge.label} />
                      <div className="flex gap-1">
                        {canUpdate ? (
                          <>
                            <Button variant="ghost" size="sm" title={uiStatic('حضر')} onClick={() => void setAttendance(member.memberId, 'attended')}>
                              <Check className="size-4 text-emerald-600" />
                            </Button>
                            <Button variant="ghost" size="sm" title={uiStatic('لم يحضر')} onClick={() => void setAttendance(member.memberId, 'absent')}>
                              <X className="size-4 text-amber-600" />
                            </Button>
                          </>
                        ) : null}
                        {canDelete ? (
                          <Button
                            permissionAction="delete"
                            variant="ghost"
                            size="sm"
                            title={uiStatic('إلغاء الحجز')}
                            onClick={() => void removeMember(member.memberId, member.memberName)}
                          >
                            <Trash2 className="size-4 text-destructive" />
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
                {!members.length ? (
                  <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                    {uiStatic('الميعاد محجوز في الجدول لكن لا يوجد عملاء مسجلين بعد.')}
                  </p>
                ) : null}
              </div>
            </section>
          </div>
        ) : null}

        <DialogFooter className="justify-between gap-2 sm:justify-between">
          <Button variant="outline" onClick={() => entry?.classId && onOpenSession(entry.classId)}>
            <Settings2 className="size-4" /> {uiStatic('تفاصيل وتعديل الحصة')}
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>{uiStatic('إغلاق')}</Button>
            {canBook ? (
              <Button
                permissionAction="create"
                variant="brand"
                disabled={!entry?.bookable}
                title={entry && !entry.bookable ? uiStatic('الميعاد ممتلئ أو انتهى') : undefined}
                onClick={onAddMember}
              >
                <UserPlus className="size-4" /> {uiStatic('إضافة عميل')}
              </Button>
            ) : null}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
