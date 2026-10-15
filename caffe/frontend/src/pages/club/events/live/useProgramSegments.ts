import { useQuery, useQueryClient } from '@tanstack/react-query';
import { clubEventsLiveApi, type LiveProgramSegment } from '@/lib/api/club-events-live';
import { useEventLiveContext } from './event-live-context';
import { uiStatic } from '@/lib/ui-static';

export type SegmentKind = 'text' | 'image' | 'gallery' | 'video';

export interface ProgramSegment {
  id: string;
  title: string;
  description: string | null;
  kind: SegmentKind;
  media_urls: string[];
  video_url: string | null;
  duration_seconds: number;
  order_index: number;
  enabled: boolean;
  scheduled_time?: string | null;
  duration_minutes?: number | null;
  show_duration?: boolean;
}

const fromRow = (r: LiveProgramSegment): ProgramSegment => ({
  id: String(r.id),
  title: r.title,
  description: r.description ?? null,
  kind: (r.kind as SegmentKind) ?? 'text',
  media_urls: Array.isArray(r.mediaUrls) ? r.mediaUrls : [],
  video_url: r.videoUrl ?? null,
  duration_seconds: r.durationSeconds ?? 0,
  order_index: r.orderIndex ?? 0,
  enabled: r.enabled ?? true,
  scheduled_time: r.scheduledTime ?? null,
  duration_minutes: r.durationMinutes ?? null,
  show_duration: r.showDuration ?? true,
});

export const useProgramSegments = (onlyEnabled = false) => {
  const { eventId } = useEventLiveContext();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['club-event-live', eventId, 'segments', onlyEnabled],
    queryFn: async () => (await clubEventsLiveApi.listProgramSegments(eventId, onlyEnabled)).data.map(fromRow),
    refetchInterval: 6000,
    refetchIntervalInBackground: true,
    staleTime: 3000,
    placeholderData: (prev) => prev,
  });

  const reload = async () => {
    await qc.invalidateQueries({ queryKey: ['club-event-live', eventId, 'segments'] });
  };

  return { segments: data ?? [], loading: isLoading, reload };
};

export const getYouTubeId = (url: string): string | null => {
  if (!url) return null;
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([\w-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
};

export const SEGMENT_KIND_LABEL: Record<SegmentKind, string> = {
  text: uiStatic('نص'),
  image: uiStatic('صورة'),
  gallery: uiStatic('معرض صور'),
  video: uiStatic('فيديو'),
};
