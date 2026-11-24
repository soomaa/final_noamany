import { effectiveSalesSettings } from './sales-defaults';
import { resolveSalesCommission } from './sales-commission-calculation';

const defaults = { monthly_target: 20000, commission_mode: 'flat', flat_commission_percent: 5, target_period_mode: 'monthly', target_start_date: null, target_end_date: null, target_days: null, tiers: [] };
describe('sales defaults inheritance', () => {
  it('gives a new salesperson the general target and real commission calculation', () => {
    const value = effectiveSalesSettings(null, defaults);
    expect(value.monthly_target).toBe(20000);
    expect(resolveSalesCommission(value, 50, 10000).amount).toBe(500);
  });
  it('preserves existing personal settings until explicitly returned to defaults', () => {
    const personal = { ...defaults, monthly_target: 40000, flat_commission_percent: 8, use_default_settings: false };
    expect(effectiveSalesSettings(personal, defaults).monthly_target).toBe(40000);
    expect(effectiveSalesSettings({ ...personal, use_default_settings: true, is_active: false }, defaults)).toMatchObject({ monthly_target: 20000, flat_commission_percent: 5, is_active: false });
  });
});
