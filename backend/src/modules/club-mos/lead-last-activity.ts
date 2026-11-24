/**
 * The newest thing that happened on each lead.
 *
 * A lead's activity is written to two tables by two screens: typed sales contacts (calls,
 * meetings) land in `club_lead_follow_ups`, and free-text comments in `club_lead_comments`.
 * The full history view already merges them. The list's "last action" column read only the
 * follow-ups, so a rep who left a comment saw it vanish the moment they closed the lead —
 * the column stayed "—" and the note looked lost. Both sources, one answer.
 */
export type LeadActivity = {
  activityType: string;
  note: string;
  authorName: string | null;
  createdAt: Date;
};

type FollowUpRow = {
  lead_id: number;
  activity_type: string;
  note: string;
  author_name: string | null;
  created_at: Date;
};

type CommentRow = {
  lead_id: number;
  body: string;
  author_name: string | null;
  created_at: Date;
};

/**
 * @returns the latest activity per lead id. Ties break toward the comment, because a
 *   comment written in the same second as a logged call is the thing the rep typed last.
 */
export function newestActivityPerLead(
  followUps: readonly FollowUpRow[],
  comments: readonly CommentRow[],
): Map<number, LeadActivity> {
  const latest = new Map<number, LeadActivity>();
  const consider = (leadId: number, candidate: LeadActivity) => {
    const current = latest.get(leadId);
    if (!current || candidate.createdAt.getTime() >= current.createdAt.getTime()) {
      latest.set(leadId, candidate);
    }
  };

  for (const row of followUps) {
    consider(row.lead_id, {
      activityType: row.activity_type,
      note: row.note,
      authorName: row.author_name,
      createdAt: row.created_at,
    });
  }
  for (const row of comments) {
    consider(row.lead_id, {
      activityType: 'comment',
      note: row.body,
      authorName: row.author_name,
      createdAt: row.created_at,
    });
  }
  return latest;
}
