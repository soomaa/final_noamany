import { api } from '@/lib/api';

/**
 * Club Events API client — routes match backend/src/modules/club-events controllers exactly
 * (base path `club-events`, NOT `club/events`). All request/response bodies are camelCase.
 */
export const clubEventsApi = {
  // Events
  listEvents: (params?: Record<string, unknown>) =>
    api.get('/club-events', { params }).then(r => r.data),

  getEvent: (id: number | string) =>
    api.get(`/club-events/${id}`).then(r => r.data),

  getEventStatistics: () =>
    api.get('/club-events/statistics').then(r => r.data),

  createEvent: (data: Record<string, unknown>) =>
    api.post('/club-events', data).then(r => r.data),

  updateEvent: (id: number | string, data: Record<string, unknown>) =>
    api.patch(`/club-events/${id}`, data).then(r => r.data),

  changeEventStatus: (id: number | string, data: { status: string; reason?: string }) =>
    api.post(`/club-events/${id}/status`, data).then(r => r.data),

  duplicateEvent: (id: number | string) =>
    api.post(`/club-events/${id}/duplicate`).then(r => r.data),

  deleteEvent: (id: number | string) =>
    api.delete(`/club-events/${id}`).then(r => r.data),

  // Sessions (nested under an event)
  listSessions: (eventId: number | string, params?: Record<string, unknown>) =>
    api.get(`/club-events/${eventId}/sessions`, { params }).then(r => r.data),

  createSession: (eventId: number | string, data: Record<string, unknown>) =>
    api.post(`/club-events/${eventId}/sessions`, data).then(r => r.data),

  updateSession: (eventId: number | string, id: number | string, data: Record<string, unknown>) =>
    api.patch(`/club-events/${eventId}/sessions/${id}`, data).then(r => r.data),

  deleteSession: (eventId: number | string, id: number | string) =>
    api.delete(`/club-events/${eventId}/sessions/${id}`).then(r => r.data),

  // Categories
  listCategories: (activeOnly?: boolean) =>
    api.get('/club-events/categories', { params: activeOnly ? { activeOnly: 'true' } : undefined }).then(r => r.data),

  createCategory: (data: Record<string, unknown>) =>
    api.post('/club-events/categories', data).then(r => r.data),

  updateCategory: (id: number | string, data: Record<string, unknown>) =>
    api.put(`/club-events/categories/${id}`, data).then(r => r.data),

  deleteCategory: (id: number | string) =>
    api.delete(`/club-events/categories/${id}`).then(r => r.data),

  // Registrations
  listRegistrations: (params?: Record<string, unknown>) =>
    api.get('/club-events/registrations', { params }).then(r => r.data),

  getRegistration: (id: number | string) =>
    api.get(`/club-events/registrations/${id}`).then(r => r.data),

  createRegistration: (data: Record<string, unknown>) =>
    api.post('/club-events/registrations', data).then(r => r.data),

  updateRegistration: (id: number | string, data: Record<string, unknown>) =>
    api.patch(`/club-events/registrations/${id}`, data).then(r => r.data),

  payRegistration: (id: number | string, data: Record<string, unknown>) =>
    api.post(`/club-events/registrations/${id}/pay`, data).then(r => r.data),

  refundRegistration: (id: number | string, data: Record<string, unknown>, cancel?: boolean) =>
    api
      .post(`/club-events/registrations/${id}/refund`, data, { params: cancel ? { cancel: 'true' } : undefined })
      .then(r => r.data),

  cancelRegistration: (id: number | string, reason?: string) =>
    api.post(`/club-events/registrations/${id}/cancel`, { reason }).then(r => r.data),

  promoteRegistration: (id: number | string) =>
    api.post(`/club-events/registrations/${id}/promote`).then(r => r.data),

  // Check-in
  checkinScan: (data: { code: string; eventId: number; sessionId?: number }) =>
    api.post('/club-events/checkin/scan', data).then(r => r.data),

  checkinByMember: (data: { memberCode: string; eventId: number; sessionId?: number }) =>
    api.post('/club-events/checkin/member', data).then(r => r.data),

  checkinManual: (data: { registrationId: number; eventId: number; sessionId?: number }) =>
    api.post('/club-events/checkin/manual', data).then(r => r.data),

  getRoster: (eventId: number | string) =>
    api.get(`/club-events/checkin/event/${eventId}`).then(r => r.data),

  getCheckinStatistics: (eventId: number | string) =>
    api.get(`/club-events/checkin/event/${eventId}/statistics`).then(r => r.data),

  // Settings (single row, not category/key/value)
  getEventSettings: () => api.get('/club-events/settings').then(r => r.data),

  updateEventSettings: (data: {
    refundWindowDays?: number;
    waitlistHoldHours?: number;
    approvalBudgetThreshold?: number;
    reminderHoursBefore?: number;
  }) => api.put('/club-events/settings', data).then(r => r.data),
};
