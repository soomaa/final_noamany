import { phoneIdentityKey, pickCommissionTier, normalizePhone, summarizeLeadPipeline } from './club-sales.constants';

describe('club-sales helpers', () => {
  it('summarizes the manager funnel using the operational lead stages', () => {
    expect(summarizeLeadPipeline([
      { status: 'new' },
      { status: 'new' },
      { status: 'in_progress' },
      { status: 'qualified' },
      { status: 'converted' },
      { status: 'lost' },
      { status: 'unknown' },
    ])).toEqual({
      new: 2,
      inProgress: 1,
      followLater: 0,
      qualified: 1,
      converted: 1,
      lost: 1,
    });
  });

  it('picks the matching custom commission tier', () => {
    const tiers = [
      { minAchievementPct: 0, maxAchievementPct: 79.99, commissionPercent: 5, label: 'تحت التارجت' },
      { minAchievementPct: 80, maxAchievementPct: 100, commissionPercent: 10, label: 'على التارجت' },
      { minAchievementPct: 100.01, maxAchievementPct: null, commissionPercent: 15, label: 'فوق التارجت' },
    ];
    expect(pickCommissionTier(tiers, 40)?.label).toBe('تحت التارجت');
    expect(pickCommissionTier(tiers, 90)?.label).toBe('على التارجت');
    expect(pickCommissionTier(tiers, 140)?.label).toBe('فوق التارجت');
  });

  it('normalizes guest phone numbers', () => {
    expect(normalizePhone('010 1234-5678')).toBe('01012345678');
    expect(normalizePhone('٠١٠ ١٢٣٤-٥٦٧٨')).toBe('01012345678');
    expect(normalizePhone('۰۰۲۰ ۱۰ ۱۲۳۴ ۵۶۷۸')).toBe('+201012345678');
    expect(phoneIdentityKey('+20 10 1234 5678')).toBe('201012345678');
    expect(phoneIdentityKey('0020 10 1234 5678')).toBe('201012345678');
  });
});
