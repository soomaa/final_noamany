import { createContext, useContext, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { useLocale } from '@/store/locale';
import { uiStatic } from '@/lib/ui-static';

interface EventLiveContextValue {
  eventId: number;
}

const EventLiveContext = createContext<EventLiveContextValue | null>(null);

export function EventLiveProvider({ children }: { children: ReactNode }) {
  const { ui } = useLocale();
  const { id } = useParams<{ id: string }>();
  const eventId = Number(id);
  if (!eventId || Number.isNaN(eventId)) {
    throw new Error(ui('eventId مطلوب في مسار العرض الحي'));
  }
  return <EventLiveContext.Provider value={{ eventId }}>{children}</EventLiveContext.Provider>;
}

export function useEventLiveContext() {
  const ctx = useContext(EventLiveContext);
  if (!ctx) throw new Error(uiStatic('useEventLiveContext يجب استخدامه داخل EventLiveProvider'));
  return ctx;
}

/** Base path for live screens of the current event. */
export function useEventLiveBasePath() {
  const { eventId } = useEventLiveContext();
  return `/club/events/${eventId}/live`;
}
