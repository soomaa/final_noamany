/**
 * A lead's follow-up date lives in two columns for two different screens:
 *
 *   `follow_up_at`      — VARCHAR the Potential Members form writes, and what the reminders
 *                         list is built from.
 *   `next_follow_up_at` — DateTime the sales workspace writes, and the only thing its
 *                         "Follow-up reminders" panel reads.
 *
 * A date set on the admin screen therefore never reached the rep who had to make the call.
 * This mirrors one into the other so a follow-up scheduled anywhere shows up everywhere.
 */
export function nextFollowUpFromDate(value: unknown): Date | null | undefined {
  if (value === undefined) return undefined; // field not part of this write — leave it alone
  const raw = String(value ?? '').trim();
  if (!raw) return null; // cleared on purpose
  // Stored as YYYY-MM-DD; noon avoids a timezone shift pulling it to the previous day.
  const parsed = new Date(raw.length <= 10 ? `${raw}T12:00:00` : raw);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}
