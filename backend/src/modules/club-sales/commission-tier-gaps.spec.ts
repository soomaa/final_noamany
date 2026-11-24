import { pickCommissionTier } from './club-sales.constants';

/**
 * Brackets typed by a real manager, straight off the screen: 80-80, 100-100, 120+.
 * They cover three exact points and leave everything between them uncovered.
 *
 * The picker used to fall back to the LAST bracket whenever nothing matched, so a rep who
 * achieved 50% of target was paid the 120%-and-over rate. Money out the door, silently,
 * while the dialog's own preview said 0%.
 */
const GAPPY_TIERS = [
  { minAchievementPct: 80, maxAchievementPct: 80, commissionPercent: 2, label: 'Low target' },
  { minAchievementPct: 100, maxAchievementPct: 100, commissionPercent: 10, label: 'Target' },
  { minAchievementPct: 120, maxAchievementPct: null, commissionPercent: 15, label: 'Over Target' },
];

const pct = (achievement: number) => pickCommissionTier(GAPPY_TIERS, achievement)?.commissionPercent ?? 0;

describe('commission tier gaps never pay the top rate by accident', () => {
  it('pays nothing below the lowest bracket', () => {
    expect(pct(0)).toBe(0);
    expect(pct(50)).toBe(0);
    expect(pct(79)).toBe(0);
  });

  it('pays the bracket whose floor was actually passed, not the last one defined', () => {
    // 90% sits in a gap between 80-80 and 100-100. It passed 80, so it earns 80's rate.
    expect(pct(90)).toBe(2);
    // 110% passed 100 but not 120.
    expect(pct(110)).toBe(10);
  });

  it('still pays each bracket exactly on its own boundaries', () => {
    expect(pct(80)).toBe(2);
    expect(pct(100)).toBe(10);
    expect(pct(120)).toBe(15);
  });

  it('keeps the open-ended top bracket open', () => {
    expect(pct(150)).toBe(15);
    expect(pct(1000)).toBe(15);
  });

  it('never pays more than the achievement earned', () => {
    // The old behaviour: pct(50) returned 15. Nothing may out-earn its own bracket again.
    for (const achievement of [0, 10, 50, 79, 90, 110]) {
      expect(pct(achievement)).toBeLessThan(15);
    }
  });
});

describe('well-formed contiguous brackets are unaffected', () => {
  const TIERS = [
    { minAchievementPct: 0, maxAchievementPct: 79.99, commissionPercent: 5 },
    { minAchievementPct: 80, maxAchievementPct: 100, commissionPercent: 10 },
    { minAchievementPct: 100.01, maxAchievementPct: null, commissionPercent: 15 },
  ];
  const at = (a: number) => pickCommissionTier(TIERS, a)?.commissionPercent ?? 0;

  it('reads every band the way it always did', () => {
    expect(at(0)).toBe(5);
    expect(at(50)).toBe(5);
    expect(at(80)).toBe(10);
    expect(at(100)).toBe(10);
    expect(at(140)).toBe(15);
  });
});
