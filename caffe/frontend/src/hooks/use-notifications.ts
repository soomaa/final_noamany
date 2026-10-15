import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { AlertsGrouped, NotificationItem } from '@/types/notifications';

export type { NotificationItem, AlertsGrouped, AlertEntry } from '@/types/notifications';

export function useNotifications() {
  return useQuery({
    queryKey: ['notifications'],
    queryFn: async () => {
      const { data } = await api.get<NotificationItem[]>('/notifications');
      return data;
    },
    retry: false,
  });
}

export function useNotificationCount() {
  return useQuery({
    queryKey: ['notifications', 'count'],
    queryFn: async () => {
      const { data } = await api.get<number>('/notifications/count');
      return data;
    },
    retry: false,
  });
}

export function useAlerts() {
  return useQuery({
    queryKey: ['notifications', 'alerts'],
    queryFn: async () => {
      const { data } = await api.get<AlertsGrouped>('/notifications/alerts');
      return data;
    },
    retry: false,
  });
}
