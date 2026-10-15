import { isCloser, pickNearestSlot, slotProximity, timeToMinutes } from './nearest-class-slot';

const slot = (startTime: string, endTime: string, id = 0) => ({ id, startTime, endTime });

describe('nearest scheduled class slot', () => {
  it('reads times with or without seconds', () => {
    expect(timeToMinutes('17:30')).toBe(1050);
    expect(timeToMinutes('17:30:45')).toBe(1050);
  });

  it('reports a running class as now', () => {
    expect(slotProximity(slot('17:00', '18:00'), '17:20:00')).toEqual({ position: 'now', distance: 0 });
  });

  it('measures the gap before and after a class', () => {
    expect(slotProximity(slot('17:00', '18:00'), '16:45:00')).toEqual({ position: 'upcoming', distance: 15 });
    expect(slotProximity(slot('17:00', '18:00'), '18:25:00')).toEqual({ position: 'past', distance: 25 });
  });

  it('prefers the class running right now over a closer upcoming one', () => {
    const picked = pickNearestSlot([slot('19:00', '20:00', 2), slot('17:00', '18:00', 1)], '17:55:00');
    expect(picked?.id).toBe(1);
    expect(picked?.position).toBe('now');
  });

  it('picks the nearest class when the member arrives between classes', () => {
    const picked = pickNearestSlot([slot('10:00', '11:00', 1), slot('18:00', '19:00', 2)], '17:40:00');
    expect(picked?.id).toBe(2);
    expect(picked).toMatchObject({ position: 'upcoming', distance: 20 });
  });

  it('falls back to the class that just finished when nothing is coming up', () => {
    const picked = pickNearestSlot([slot('10:00', '11:00', 1), slot('18:00', '19:00', 2)], '19:10:00');
    expect(picked?.id).toBe(2);
    expect(picked).toMatchObject({ position: 'past', distance: 10 });
  });

  it('breaks an exact tie in favour of the class still to come', () => {
    // 18:30 is 30 minutes after the 17:00–18:00 class and 30 minutes before the 19:00 one.
    const picked = pickNearestSlot([slot('17:00', '18:00', 1), slot('19:00', '20:00', 2)], '18:30:00');
    expect(picked?.id).toBe(2);
  });

  it('honours a grace window and returns nothing when every class is too far away', () => {
    // The production window is two hours: a 09:00 walk-in is not here for an 18:00 class.
    expect(pickNearestSlot([slot('18:00', '19:00', 2)], '09:00:00', 120)).toBeNull();
    expect(pickNearestSlot([slot('18:00', '19:00', 2)], '17:00:00', 120)?.id).toBe(2);
  });

  it('keeps a class the member is standing in the middle of, however long it runs', () => {
    // A running class is never filtered out by the window.
    expect(pickNearestSlot([slot('08:00', '14:00', 1)], '13:00:00', 120)?.id).toBe(1);
  });

  it('accepts the edges of the two-hour window and rejects just past it', () => {
    expect(pickNearestSlot([slot('18:00', '19:00', 2)], '16:00:00', 120)?.id).toBe(2);
    expect(pickNearestSlot([slot('18:00', '19:00', 2)], '15:59:00', 120)).toBeNull();
    expect(pickNearestSlot([slot('18:00', '19:00', 2)], '21:00:00', 120)?.id).toBe(2);
    expect(pickNearestSlot([slot('18:00', '19:00', 2)], '21:01:00', 120)).toBeNull();
  });

  it('returns null when the day has no slots at all', () => {
    expect(pickNearestSlot([], '17:00:00')).toBeNull();
  });
});

describe('comparing two candidates directly', () => {
  const scored = (startTime: string, endTime: string, position: 'now' | 'upcoming' | 'past', distance: number) =>
    ({ startTime, endTime, position, distance });

  it('an existing class running now beats an un-materialized slot that is closer on paper', () => {
    expect(isCloser(scored('19:00', '20:00', 'upcoming', 5), scored('17:00', '18:00', 'now', 0))).toBe(false);
  });

  it('a nearer slot beats a farther existing class', () => {
    expect(isCloser(scored('18:00', '19:00', 'upcoming', 10), scored('21:00', '22:00', 'upcoming', 190))).toBe(true);
  });
});
