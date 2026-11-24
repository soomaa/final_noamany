import { FEEDBACK_STATUSES, LEAD_FEEDBACK_OPTIONS, feedbackOption } from './lead-feedback';

describe('lead feedback vocabulary', () => {
  it('offers exactly the six the desk asked for', () => {
    expect(LEAD_FEEDBACK_OPTIONS.map((o) => o.key)).toEqual([
      'no_answer',
      'unreachable',
      'follow_up',
      'arrange_visit',
      'not_interested',
      'membership_done',
    ]);
  });

  it('maps every option onto a status, so feedback never contradicts the pipeline', () => {
    for (const o of LEAD_FEEDBACK_OPTIONS) {
      expect(o.status).toMatch(/^[a-z_]+$/);
    }
    expect(new Set(FEEDBACK_STATUSES).size).toBe(LEAD_FEEDBACK_OPTIONS.length);
  });

  it('closes only the two answered outcomes', () => {
    expect(LEAD_FEEDBACK_OPTIONS.filter((o) => o.closesLead).map((o) => o.key)).toEqual([
      'not_interested',
      'membership_done',
    ]);
  });

  it('keeps "not interested" on the existing lost status rather than inventing one', () => {
    // Existing rows already use `lost`; a parallel value would split the same meaning.
    expect(feedbackOption('not_interested')?.status).toBe('lost');
  });

  it('does not let "membership done" mean converted', () => {
    // Converting creates a member and a receipt — reception's job, after the money.
    expect(feedbackOption('membership_done')?.status).toBe('membership_done');
    expect(FEEDBACK_STATUSES).not.toContain('converted');
  });

  it('demands a date only where one is meaningful', () => {
    expect(LEAD_FEEDBACK_OPTIONS.filter((o) => o.requiresDate).map((o) => o.key)).toEqual([
      'no_answer',
      'follow_up',
      'arrange_visit',
    ]);
  });

  it('rejects anything not on the list', () => {
    for (const bad of ['', '  ', null, undefined, 'converted', 'deleted']) {
      expect(feedbackOption(bad)).toBeNull();
    }
  });
});
