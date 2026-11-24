import { nextFollowUpFromDate } from './lead-follow-up-date';

describe('lead follow-up date mirroring', () => {
  it('turns the stored date into the timestamp the reminders panel reads', () => {
    const result = nextFollowUpFromDate('2026-09-20');
    expect(result).toBeInstanceOf(Date);
    expect((result as Date).toISOString().slice(0, 10)).toBe('2026-09-20');
  });

  it('keeps the day it was given rather than shifting across midnight', () => {
    // Parsing a bare date as UTC midnight lands on the 19th in any timezone behind UTC.
    expect((nextFollowUpFromDate('2026-09-20') as Date).getDate()).toBe(20);
  });

  it('clears the reminder when the date is removed', () => {
    expect(nextFollowUpFromDate('')).toBeNull();
    expect(nextFollowUpFromDate(null)).toBeNull();
  });

  it('leaves the column untouched when the field is not part of the write', () => {
    expect(nextFollowUpFromDate(undefined)).toBeUndefined();
  });

  it('ignores an unparsable value instead of writing a bad date', () => {
    expect(nextFollowUpFromDate('not a date')).toBeUndefined();
  });
});
