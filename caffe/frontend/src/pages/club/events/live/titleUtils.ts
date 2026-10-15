import { clubEventsLiveApi } from '@/lib/api/club-events-live';
import { EventSettings, DEFAULT_TITLES } from './useEventSettings';
import { uiStatic } from '@/lib/ui-static';

/** Display a guest name as "اللقب / الاسم"; gracefully falls back to name only. */
export const formatNameWithTitle = (
  title: string | null | undefined,
  name: string,
): string => {
  const t = (title || '').trim();
  const n = (name || '').trim();
  if (!t) return n;
  return `${t} / ${n}`;
};

export const getTitlesList = (settings: EventSettings): string[] => {
  return settings.titles?.length ? settings.titles : DEFAULT_TITLES;
};

export const addTitleToSettings = async (
  eventId: number,
  settings: EventSettings,
  newTitle: string,
): Promise<{ ok: boolean; error?: string }> => {
  const t = newTitle.trim();
  if (!t) return { ok: false, error: uiStatic('اللقب فارغ') };
  const current = getTitlesList(settings);
  if (current.includes(t)) return { ok: true };
  const titles = [...current, t];
  try {
    await clubEventsLiveApi.updateDisplaySettings(eventId, { titles });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : uiStatic('تعذر حفظ اللقب') };
  }
};
