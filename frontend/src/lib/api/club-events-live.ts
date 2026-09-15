import { api } from '@/lib/api';

export interface LiveProgramSegment {
  id: number;
  eventId: number;
  title: string;
  description: string | null;
  kind: string;
  mediaUrls: string[];
  videoUrl: string | null;
  durationSeconds: number;
  orderIndex: number;
  enabled: boolean;
  scheduledTime: string | null;
  durationMinutes: number | null;
  showDuration: boolean;
}

export const clubEventsLiveApi = {
  getDisplaySettings: (eventId: number | string) =>
    api.get(`/club-events/${eventId}/live/display-settings`).then((r) => r.data),

  updateDisplaySettings: (eventId: number | string, data: Record<string, unknown>) =>
    api.put(`/club-events/${eventId}/live/display-settings`, data).then((r) => r.data),

  listProgramSegments: (eventId: number | string, onlyEnabled?: boolean) =>
    api
      .get(`/club-events/${eventId}/live/program-segments`, {
        params: onlyEnabled ? { onlyEnabled: 'true' } : undefined,
      })
      .then((r) => r.data),

  createProgramSegment: (eventId: number | string, data: Record<string, unknown>) =>
    api.post(`/club-events/${eventId}/live/program-segments`, data).then((r) => r.data),

  updateProgramSegment: (eventId: number | string, id: number | string, data: Record<string, unknown>) =>
    api.patch(`/club-events/${eventId}/live/program-segments/${id}`, data).then((r) => r.data),

  deleteProgramSegment: (eventId: number | string, id: number | string) =>
    api.delete(`/club-events/${eventId}/live/program-segments/${id}`).then((r) => r.data),

  getAttendeeByPhone: (eventId: number | string, phone: string) =>
    api
      .get(`/club-events/${eventId}/live/attendees/by-phone`, { params: { phone } })
      .then((r) => r.data),

  listRecentAttendees: (eventId: number | string) =>
    api.get(`/club-events/${eventId}/live/attendees/recent`).then((r) => r.data),

  listPrivateRecentAttendees: (eventId: number | string) =>
    api.get(`/club-events/${eventId}/live/attendees/recent-private`).then((r) => r.data),

  guestCheckin: (
    eventId: number | string,
    data: { name: string; phone: string; title?: string | null; source?: string },
  ) => api.post(`/club-events/${eventId}/live/guest-checkin`, data).then((r) => r.data),
};
