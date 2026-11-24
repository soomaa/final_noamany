import { handoverStamp, isHandover, isUnseenHandover, leadListOrder, normalizeAssignee } from './lead-assignment';

describe('normalizeAssignee', () => {
  it('treats blank, zero and rubbish as nobody', () => {
    for (const v of [null, undefined, '', 0, '0', -3, 'abc', NaN]) {
      expect(normalizeAssignee(v)).toBeNull();
    }
  });

  it('accepts an id however the form spelled it', () => {
    expect(normalizeAssignee(7)).toBe(7);
    expect(normalizeAssignee('7')).toBe(7);
  });
});

describe('isHandover', () => {
  it('is false when the form did not carry the field', () => {
    // An edit that only changes the notes must not notify anyone.
    expect(isHandover(4, undefined)).toBe(false);
  });

  it('is false when the same rep is submitted back', () => {
    expect(isHandover(4, 4)).toBe(false);
    expect(isHandover(4, '4')).toBe(false);
  });

  it('is true when the lead moves to another rep', () => {
    expect(isHandover(4, 9)).toBe(true);
  });

  it('is true when the lead is taken off a rep entirely', () => {
    expect(isHandover(4, null)).toBe(true);
    expect(isHandover(4, '')).toBe(true);
  });

  it('is true the first time a lead is given to anyone', () => {
    expect(isHandover(null, 9)).toBe(true);
  });
});

describe('handoverStamp', () => {
  it('records when and by whom, and clears the seen mark', () => {
    const at = new Date('2026-09-17T10:00:00.000Z');
    expect(handoverStamp(12, at)).toEqual({
      assigned_at: at,
      assigned_by: 12,
      assignment_seen_at: null,
    });
  });

  it('stores no actor rather than a bogus one when the login is unknown', () => {
    expect(handoverStamp(undefined).assigned_by).toBeNull();
    expect(handoverStamp(0).assigned_by).toBeNull();
  });
});

describe('isUnseenHandover', () => {
  const at = new Date('2026-09-17T10:00:00.000Z');

  it('flags a lead handed to this rep and not yet opened', () => {
    expect(isUnseenHandover({ assigned_to: 4, assigned_at: at, assignment_seen_at: null }, 4)).toBe(true);
  });

  it('stops flagging once the rep has opened it', () => {
    expect(isUnseenHandover({ assigned_to: 4, assigned_at: at, assignment_seen_at: at }, 4)).toBe(false);
  });

  it('does not flag a colleague’s lead for someone else', () => {
    expect(isUnseenHandover({ assigned_to: 9, assigned_at: at, assignment_seen_at: null }, 4)).toBe(false);
  });

  it('does not flag a lead that was never handed over', () => {
    expect(isUnseenHandover({ assigned_to: 4, assigned_at: null, assignment_seen_at: null }, 4)).toBe(false);
  });

  it('shows a supervisor no badge at all', () => {
    expect(isUnseenHandover({ assigned_to: 4, assigned_at: at, assignment_seen_at: null }, null)).toBe(false);
  });
});

describe('leadListOrder', () => {
  it('puts the newest handover first for a rep', () => {
    expect(leadListOrder(true)).toEqual([{ assigned_at: 'desc' }, { id: 'desc' }]);
  });

  it('leaves a supervisor on newest-lead-first', () => {
    expect(leadListOrder(false)).toEqual([{ id: 'desc' }]);
  });
});
