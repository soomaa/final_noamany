import { decidePermit, localClock, longPauseDelay, PermitClient, randomDelay, withinHours } from './wa-control.policy';

const client = (over: Partial<PermitClient> = {}): PermitClient => ({
  enabled: true,
  daily_limit: 100,
  monthly_limit: 1000,
  min_delay_sec: 8,
  max_delay_sec: 15,
  pause_every: 0,
  pause_sec: 120,
  send_from: '09:00',
  send_to: '22:00',
  timezone: 'Africa/Cairo',
  lock_holder: null,
  lock_label: null,
  lock_expires_at: null,
  next_allowed_at: null,
  ...over,
});
// 2026-10-21 12:00 in Cairo (UTC+3 in October).
const noon = new Date('2026-10-21T09:00:00Z');
const ask = (c: PermitClient, over: Partial<{ usedToday: number; usedMonth: number; now: Date; senderId: string }> = {}) =>
  decidePermit({ client: c, senderId: 'device-a', usedToday: 0, usedMonth: 0, now: noon, rand: () => 0, ...over });

describe('WhatsApp permit policy', () => {
  it('grants within limits and paces with the configured random delay', () => {
    expect(ask(client())).toEqual({ ok: true, delaySec: 8, lockSec: 128 });
    expect(decidePermit({ client: client(), senderId: 'd', usedToday: 0, usedMonth: 0, now: noon, rand: () => 0.999 })).toMatchObject({ delaySec: 15 });
  });

  it('honours the kill switch before anything else', () => {
    expect(ask(client({ enabled: false }), { usedToday: 999 })).toMatchObject({ ok: false, code: 'disabled' });
  });

  it('enforces daily then monthly limits', () => {
    expect(ask(client(), { usedToday: 100 })).toMatchObject({ ok: false, code: 'daily_limit' });
    expect(ask(client(), { usedToday: 5, usedMonth: 1000 })).toMatchObject({ ok: false, code: 'monthly_limit' });
    expect(ask(client({ daily_limit: 0 }))).toMatchObject({ ok: false, code: 'daily_limit' });
  });

  it('lets only one sender hold the number until its lock expires', () => {
    const locked = client({ lock_holder: 'device-b', lock_label: 'فرع سموحة', lock_expires_at: new Date(noon.getTime() + 60_000) });
    expect(ask(locked)).toMatchObject({ ok: false, code: 'locked', lockedBy: 'فرع سموحة', retryAfterSec: 60 });
    expect(ask(locked, { senderId: 'device-b' })).toMatchObject({ ok: true });
    expect(ask({ ...locked, lock_expires_at: new Date(noon.getTime() - 1) })).toMatchObject({ ok: true });
  });

  it('refuses outside working hours, including windows that cross midnight', () => {
    expect(ask(client({ send_from: '13:00', send_to: '22:00' }))).toMatchObject({ ok: false, code: 'outside_hours', retryAfterSec: 3600 });
    expect(withinHours(23 * 60, '20:00', '02:00')).toBe(true);
    expect(withinHours(60, '20:00', '02:00')).toBe(true);
    expect(withinHours(12 * 60, '20:00', '02:00')).toBe(false);
  });

  it('keeps the pacing gap even when a new sender takes over', () => {
    const c = client({ next_allowed_at: new Date(noon.getTime() + 6_000) });
    expect(ask(c, { senderId: 'other' })).toMatchObject({ ok: false, code: 'too_fast', retryAfterSec: 6 });
    expect(ask(client({ next_allowed_at: new Date(noon.getTime() + 500) }))).toMatchObject({ ok: true });
  });

  it('takes a varied long pause after every N messages', () => {
    const every40 = client({ pause_every: 40, pause_sec: 300, min_delay_sec: 10, max_delay_sec: 20 });
    expect(ask(every40, { usedToday: 39 })).toMatchObject({ ok: true, delaySec: 120 }); // 2 minutes
    const long = decidePermit({ client: every40, senderId: 'd', usedToday: 39, usedMonth: 0, now: noon, rand: () => 1 });
    expect(long).toMatchObject({ ok: true, delaySec: 300 }); // 5 minutes
    expect(ask(every40, { usedToday: 40 })).toMatchObject({ ok: true, delaySec: 10 });
    expect(longPauseDelay(10, 20, () => 0)).toBe(20); // never shorter than a normal gap
  });

  it('leans toward short gaps but still reaches the longest one', () => {
    const gaps = Array.from({ length: 100 }, (_, i) => randomDelay(10, 20, () => i / 100));
    const median = [...gaps].sort((a, b) => a - b)[50];
    expect(median).toBeLessThan(15); // an even spread would put the median at 15
    expect(Math.min(...gaps)).toBe(10);
    expect(Math.max(...gaps)).toBe(20);
    expect(gaps.every((g) => g >= 10 && g <= 20)).toBe(true);
  });

  it('never paces faster than the floor and computes the local day', () => {
    expect(randomDelay(1, 1, () => 0)).toBe(3);
    expect(randomDelay(20, 10, () => 0)).toBe(10);
    expect(randomDelay(8, 15, () => 1)).toBe(15);
    expect(localClock(new Date('2026-10-31T22:30:00Z'), 'Africa/Cairo')).toMatchObject({ day: '2026-11-01', month: '2026-11' });
  });
});
