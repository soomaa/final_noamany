import {
  cairoParts,
  cairoToUtc,
  hasVariables,
  inQuietHours,
  nextRun,
  normalizeAudience,
  parseSchedule,
  renderVariables,
  topicTarget,
} from './member-push.util';

describe('member push utils', () => {
  it('converts Cairo wall time both ways (winter UTC+2, summer UTC+3)', () => {
    expect(cairoToUtc('2026-01-10', '09:00').toISOString()).toBe('2026-01-10T07:00:00.000Z');
    expect(cairoToUtc('2026-07-10', '09:00').toISOString()).toBe('2026-07-10T06:00:00.000Z');
    expect(cairoParts(new Date('2026-01-10T07:00:00Z'))).toEqual({ date: '2026-01-10', time: '09:00' });
  });

  it('finds the next daily / weekly / monthly / interval / once slot', () => {
    const after = cairoToUtc('2026-11-25', '10:00'); // Wednesday
    expect(nextRun({ kind: 'daily', time: '09:00' }, after)).toEqual(cairoToUtc('2026-11-26', '09:00'));
    expect(nextRun({ kind: 'daily', time: '11:30' }, after)).toEqual(cairoToUtc('2026-11-25', '11:30'));
    // Sunday (0) and Friday (5)
    expect(nextRun({ kind: 'weekly', time: '09:00', weekdays: [0, 5] }, after)).toEqual(cairoToUtc('2026-11-27', '09:00'));
    // day 31 in a 30-day month runs on the 30th
    expect(nextRun({ kind: 'monthly', time: '09:00', monthDay: 31 }, after)).toEqual(cairoToUtc('2026-11-30', '09:00'));
    expect(nextRun({ kind: 'interval', time: '09:00', intervalDays: 3, startDate: '2026-11-20' }, after)).toEqual(cairoToUtc('2026-11-26', '09:00'));
    expect(nextRun({ kind: 'once', runAt: cairoToUtc('2026-11-25', '09:00') }, after)).toBeNull();
  });

  it('respects the start / end range', () => {
    const after = cairoToUtc('2026-11-25', '10:00');
    expect(nextRun({ kind: 'daily', time: '09:00', startDate: '2026-12-01' }, after)).toEqual(cairoToUtc('2026-12-01', '09:00'));
    expect(nextRun({ kind: 'daily', time: '09:00', endDate: '2026-11-25' }, after)).toBeNull();
  });

  it('validates the schedule form', () => {
    expect(parseSchedule({ kind: 'once', runAt: '2026-12-01T21:15' }).runAt).toEqual(cairoToUtc('2026-12-01', '21:15'));
    expect(() => parseSchedule({ kind: 'weekly', time: '09:00', weekdays: [] })).toThrow();
    expect(() => parseSchedule({ kind: 'daily', time: '9am' })).toThrow();
  });

  it('handles quiet hours across midnight', () => {
    expect(inQuietHours(cairoToUtc('2026-11-25', '23:30'), '23:00', '08:00')).toBe(true);
    expect(inQuietHours(cairoToUtc('2026-11-25', '07:59'), '23:00', '08:00')).toBe(true);
    expect(inQuietHours(cairoToUtc('2026-11-25', '08:00'), '23:00', '08:00')).toBe(false);
  });

  it('renders {name} {first_name} {branch}', () => {
    expect(hasVariables('أهلاً {first_name}')).toBe(true);
    expect(renderVariables('أهلاً {first_name} في {branch} — {name}', { name: 'منى أحمد علي', branch: 'المعادي' }))
      .toBe('أهلاً منى في المعادي — منى أحمد علي');
  });

  it('plans topics only for plain «كل الأعضاء» audiences', () => {
    const all = normalizeAudience({ kind: 'all' });
    expect(topicTarget(all, false)).toEqual({ topic: 'noamany_members' });
    expect(topicTarget(all, true)).toBeNull();
    expect(topicTarget(normalizeAudience({ kind: 'all', branchIds: [3] }), false)).toEqual({ topic: 'noamany_branch_3' });
    expect(topicTarget(normalizeAudience({ kind: 'all', gender: 'female' }), false)).toEqual({ topic: 'noamany_gender_female' });
    expect(topicTarget(normalizeAudience({ kind: 'all', branchIds: [1, 2], gender: 'male' }), false)).toEqual({
      condition: "('noamany_branch_1' in topics || 'noamany_branch_2' in topics) && 'noamany_gender_male' in topics",
    });
    expect(topicTarget(normalizeAudience({ kind: 'all', branchIds: [1, 2, 3, 4, 5], gender: 'male' }), false)).toBeNull();
    expect(topicTarget(normalizeAudience({ kind: 'expiring' }), false)).toBeNull();
    expect(normalizeAudience({ kind: 'expiring' }).days).toBe(3);
  });
});
