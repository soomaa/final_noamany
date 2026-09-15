import { useMemo } from 'react';
import { clubEventsLiveApi } from '@/lib/api/club-events-live';
import { useEventLiveContext } from './event-live-context';

/** Event-scoped API facade — mirrors abnaa graduation API shape for ported components. */
export function useClubEventsLiveApi() {
  const { eventId } = useEventLiveContext();
  return useMemo(
    () => ({
      get: () => clubEventsLiveApi.getDisplaySettings(eventId),
      update: (
        dataOrId: Record<string, unknown> | string | number,
        data?: Record<string, unknown>,
      ) => {
        if (data === undefined && typeof dataOrId === 'object' && dataOrId !== null && !Array.isArray(dataOrId)) {
          return clubEventsLiveApi.updateDisplaySettings(eventId, dataOrId as Record<string, unknown>);
        }
        return clubEventsLiveApi.updateProgramSegment(eventId, dataOrId as string | number, data ?? {});
      },
      list: (onlyEnabled?: boolean) => clubEventsLiveApi.listProgramSegments(eventId, onlyEnabled),
      create: (payload: Record<string, unknown>) => clubEventsLiveApi.createProgramSegment(eventId, payload),
      remove: (id: number | string) => clubEventsLiveApi.deleteProgramSegment(eventId, id),
      getByPhone: (phone: string) => clubEventsLiveApi.getAttendeeByPhone(eventId, phone),
      listAttendees: () => clubEventsLiveApi.listRecentAttendees(eventId),
      listPrivateAttendees: () => clubEventsLiveApi.listPrivateRecentAttendees(eventId),
      guestCheckin: (data: { name: string; phone: string; title?: string | null; source?: string }) =>
        clubEventsLiveApi.guestCheckin(eventId, data),
    }),
    [eventId],
  );
}
