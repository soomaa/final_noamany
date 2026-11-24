import { newestActivityPerLead } from './lead-last-activity';

const followUp = (lead_id: number, iso: string, note = 'called') => ({
  lead_id,
  activity_type: 'call',
  note,
  author_name: 'Rep',
  created_at: new Date(iso),
});
const comment = (lead_id: number, iso: string, body = 'typed note') => ({
  lead_id,
  body,
  author_name: 'Rep',
  created_at: new Date(iso),
});

describe('newestActivityPerLead', () => {
  it('shows a comment when the lead has no logged contact at all', () => {
    // This is the reported bug: the column read "—" while the comment sat in the file.
    const out = newestActivityPerLead([], [comment(11, '2026-09-17T10:00:00Z', 'hh')]);
    expect(out.get(11)).toMatchObject({ activityType: 'comment', note: 'hh' });
  });

  it('prefers whichever source is newer', () => {
    const out = newestActivityPerLead(
      [followUp(5, '2026-09-10T10:00:00Z')],
      [comment(5, '2026-09-15T10:00:00Z', 'newer')],
    );
    expect(out.get(5)?.note).toBe('newer');

    const other = newestActivityPerLead(
      [followUp(5, '2026-09-20T10:00:00Z', 'newest call')],
      [comment(5, '2026-09-15T10:00:00Z')],
    );
    expect(other.get(5)?.note).toBe('newest call');
  });

  it('breaks an exact tie toward the comment', () => {
    const t = '2026-09-17T10:00:00Z';
    const out = newestActivityPerLead([followUp(5, t)], [comment(5, t, 'typed last')]);
    expect(out.get(5)?.note).toBe('typed last');
  });

  it('keeps leads separate', () => {
    const out = newestActivityPerLead(
      [followUp(1, '2026-09-01T10:00:00Z')],
      [comment(2, '2026-09-02T10:00:00Z', 'for two')],
    );
    expect(out.get(1)?.activityType).toBe('call');
    expect(out.get(2)?.note).toBe('for two');
    expect(out.has(3)).toBe(false);
  });

  it('returns nothing for a lead with no activity', () => {
    expect(newestActivityPerLead([], []).size).toBe(0);
  });
});
