import { leadScopeFor, leadScopeWhere } from './lead-scope';

describe('leadScopeFor', () => {
  it('restricts a sales rep to their own leads', () => {
    expect(leadScopeFor(true, 7)).toEqual({ assignedTo: 7, restricted: true });
  });

  it('leaves a manager unrestricted', () => {
    expect(leadScopeFor(false, 7)).toEqual({ assignedTo: null, restricted: false });
    expect(leadScopeFor(false, null)).toEqual({ assignedTo: null, restricted: false });
  });

  it('keeps a rep restricted even when their employee row cannot be resolved', () => {
    expect(leadScopeFor(true, null)).toEqual({ assignedTo: null, restricted: true });
    expect(leadScopeFor(true, undefined)).toEqual({ assignedTo: null, restricted: true });
  });
});

describe('leadScopeWhere', () => {
  it('filters a rep to their own leads', () => {
    expect(leadScopeWhere({ assignedTo: 7, restricted: true })).toEqual({ assigned_to: 7 });
  });

  it('adds nothing for a manager', () => {
    expect(leadScopeWhere({ assignedTo: null, restricted: false })).toEqual({});
  });

  it('matches nothing — never everything — for an unidentified rep', () => {
    const where = leadScopeWhere({ assignedTo: null, restricted: true });
    expect(where).toEqual({ assigned_to: -1 });
    // The bug this guards: an empty object here would silently list the whole table.
    expect(Object.keys(where)).toHaveLength(1);
  });
});
