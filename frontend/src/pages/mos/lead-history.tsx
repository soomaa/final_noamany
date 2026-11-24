import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Send } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import {
  LeadActivityTimeline,
  activityLabel,
  formatActivityWhen,
  type LeadActivityEntry,
} from '@/components/club/lead-activity-timeline';
import { PermissionButton as Button } from '@/components/club/permission-button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { api, apiError } from '@/lib/api';
import { useLocale } from '@/store/locale';
import { shouldSendOnKey } from '@/lib/enter-to-send';

/** The merged log as `/club-leads/:id/history` returns it. */
type LeadHistoryEntry = {
  id: string;
  kind: 'activity' | 'comment';
  activityType: string;
  answered: boolean | null;
  body: string;
  interests: string | null;
  status: string | null;
  nextFollowUpAt: string | null;
  authorName: string | null;
  createdAt: string;
};

/** Re-exported so the leads table's "last action" column speaks the same language. */
export { activityLabel, formatActivityWhen as formatWhen };

/**
 * The client's full activity log — the same timeline the sales workspace shows, plus a
 * composer so the office can add a note without opening the workspace.
 */
export function LeadHistory({ leadId }: { leadId: number }) {
  const { ui, isRtl } = useLocale();
  const qc = useQueryClient();
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  const queryKey = ['lead-history', leadId];
  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data: rows } = await api.get<LeadHistoryEntry[]>(
        `/club-leads/${leadId}/history`,
      );
      return rows;
    },
  });

  const entries: LeadActivityEntry[] | undefined = data?.map((row) => ({
    id: row.id,
    activityType: row.kind === 'comment' ? 'comment' : row.activityType,
    note: row.body,
    answered: row.answered,
    interests: row.interests,
    nextFollowUpAt: row.nextFollowUpAt,
    createdByName: row.authorName,
    createdAt: row.createdAt,
  }));

  const send = async () => {
    const body = draft.trim();
    if (!body) return;
    setSending(true);
    try {
      await api.post(`/club-leads/${leadId}/comments`, { body });
      setDraft('');
      await qc.invalidateQueries({ queryKey });
      // The same note is read by the workspace file, the reminder-card dialog and the
      // list's "last action" column; refresh them so it shows everywhere at once.
      void qc.invalidateQueries({ queryKey: ['club-lead', leadId] });
      void qc.invalidateQueries({ queryKey: ['lead-comments', leadId] });
      void qc.invalidateQueries({ queryKey: ['sales-portal'] });
      void qc.invalidateQueries({ queryKey: ['club-leads'] });
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor={`leadComment-${leadId}`}>{isRtl ? 'إضافة تعليق' : 'Add a comment'}</Label>
        <div className="flex items-start gap-2">
          <Textarea
            id={`leadComment-${leadId}`}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={2}
            placeholder={ui('اكتب تعليق…')}
            // Enter sends on a hardware keyboard (Shift+Enter breaks the line). A touch
            // keyboard has no Shift, so there Enter breaks the line and the button sends.
            onKeyDown={(e) => {
              if (shouldSendOnKey(e)) {
                e.preventDefault();
                void send();
              }
            }}
          />
          <Button
            type="button"
            variant="brand"
            size="icon"
            disabled={sending || !draft.trim()}
            onClick={() => void send()}
            aria-label={ui('إضافة تعليق')}
          >
            <Send className="size-4" />
          </Button>
        </div>
      </div>

      <LeadActivityTimeline entries={entries} loading={isLoading} maxHeightClassName="max-h-96" />
    </div>
  );
}
