import { MemberCell } from '@/components/club/member-cell';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CheckCircle2, Circle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { apiError } from '@/lib/api';
import { clubEventsApi } from '@/lib/api/club-events';
import { useLocale } from '@/store/locale';

interface RosterSession {
  id: number;
  title: string | null;
  sessionDate: string;
}

interface RosterEntryCheckin {
  sessionId: number | null;
  checkedIn: boolean;
  checkedInAt: string | null;
}

interface RosterEntry {
  registrationId: number;
  registrationNumber: string;
  registrantType: string;
  memberId: number | null;
  memberName?: string | null;
  memberCode?: string | null;
  guestName: string | null;
  status: string;
  checkins: RosterEntryCheckin[];
}

interface RosterResponse {
  eventId: number;
  sessions: RosterSession[];
  roster: RosterEntry[];
}

interface StatisticsResponse {
  total: number;
  attended: number;
  noShow: number;
}

export function CheckinTab({ eventId }: { eventId: number }) {
  const { ui } = useLocale();
  const qc = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['club-event-roster', eventId],
    queryFn: () => clubEventsApi.getRoster(eventId) as Promise<RosterResponse>,
  });

  const { data: stats } = useQuery({
    queryKey: ['club-event-checkin-stats', eventId],
    queryFn: () => clubEventsApi.getCheckinStatistics(eventId) as Promise<StatisticsResponse>,
  });

  const checkinMutation = useMutation({
    mutationFn: (registrationId: number) =>
      clubEventsApi.checkinManual({ registrationId, eventId }),
    onSuccess: () => {
      toast.success(ui('تم تسجيل الحضور'));
      void qc.invalidateQueries({ queryKey: ['club-event-roster', eventId] });
      void qc.invalidateQueries({ queryKey: ['club-event-checkin-stats', eventId] });
    },
    onError: (err) => toast.error(apiError(err)),
  });

  const roster = data?.roster ?? [];
  const sessions = data?.sessions ?? [];

  return (
    <div className="space-y-4">
      {stats && (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-md border p-3 text-center">
            <div className="text-2xl font-bold">{stats.total}</div>
            <div className="text-xs text-muted-foreground mt-1">{ui('إجمالي المسجلين')}</div>
          </div>
          <div className="rounded-md border p-3 text-center">
            <div className="text-2xl font-bold text-teal-600">{stats.attended}</div>
            <div className="text-xs text-muted-foreground mt-1">{ui('حضر')}</div>
          </div>
          <div className="rounded-md border p-3 text-center">
            <div className="text-2xl font-bold text-slate-500">{stats.noShow}</div>
            <div className="text-xs text-muted-foreground mt-1">{ui('لم يحضر')}</div>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="text-sm text-muted-foreground py-8 text-center">{ui('جاري التحميل...')}</div>
      ) : isError ? (
        <div className="text-sm text-red-500 py-8 text-center">{ui('حدث خطأ أثناء تحميل البيانات')}</div>
      ) : roster.length === 0 ? (
        <div className="text-sm text-muted-foreground py-8 text-center">{ui('لا يوجد مسجلون بعد')}</div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">{ui('رقم التسجيل')}</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">{ui('الاسم')}</th>
                {sessions.length > 0 ? (
                  sessions.map(s => (
                    <th key={s.id} className="px-4 py-3 text-right font-medium text-muted-foreground">
                      {s.title ?? s.sessionDate}
                    </th>
                  ))
                ) : (
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">{ui('الحضور')}</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y">
              {roster.map(entry => (
                <tr key={entry.registrationId} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 text-muted-foreground">{entry.registrationNumber}</td>
                  <td className="px-4 py-3 font-medium">
                    <MemberCell
                      name={entry.memberName}
                      code={entry.memberCode}
                      memberId={entry.memberId}
                      fallback={entry.guestName}
                    />
                  </td>
                  {entry.checkins.map((c, i) => (
                    <td key={c.sessionId ?? i} className="px-4 py-3">
                      {c.checkedIn ? (
                        <span className="inline-flex items-center gap-1 text-teal-600 text-xs">
                          <CheckCircle2 className="h-4 w-4" /> {ui('حضر')}
                        </span>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs text-muted-foreground"
                          disabled={checkinMutation.isPending}
                          onClick={() => checkinMutation.mutate(entry.registrationId)}
                        >
                          <Circle className="h-4 w-4 ms-1" /> {ui('تسجيل حضور')}
                        </Button>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
