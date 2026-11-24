/**
 * Keeps `club_reminders` in step with a lead's `follow_up_at`.
 *
 * Two screens schedule the same follow-up: the Potential Members form and the sales
 * workspace. Both must go through here, otherwise the reminders screen keeps showing
 * a date the lead no longer has.
 */
type ReminderDelegate = {
  findFirst: (args: Record<string, unknown>) => Promise<Record<string, unknown> | null>;
  create: (args: Record<string, unknown>) => Promise<unknown>;
  update: (args: Record<string, unknown>) => Promise<unknown>;
};

export interface LeadReminderSource {
  id: number | string;
  name?: unknown;
  follow_up_at?: unknown;
  branch_id?: unknown;
}

export async function syncLeadReminder(reminders: ReminderDelegate, lead: LeadReminderSource) {
  const leadId = Number(lead.id);
  const name = String(lead.name ?? '').trim();
  const followUpAt = String(lead.follow_up_at ?? '').trim();
  const existing = await reminders.findFirst({ where: { lead_id: leadId } });

  if (!followUpAt) {
    if (existing && existing.is_deleted !== true) {
      await reminders.update({ where: { id: existing.id }, data: { is_deleted: true } });
    }
    return;
  }

  const data = {
    lead_id: leadId,
    member_name: name,
    title: `متابعة العضو: ${name}`,
    reminder_date: followUpAt,
    branch_id: lead.branch_id ?? null,
    is_deleted: false,
  };

  if (existing) {
    await reminders.update({ where: { id: existing.id }, data });
  } else {
    await reminders.create({ data: { ...data, status: 'pending', channel: 'call' } });
  }
}
