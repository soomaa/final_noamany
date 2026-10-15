import { projectedFreezeEnd } from './freeze-end-projection';
describe('freeze expiry shown before thaw', () => {
  it('shows 8 November for a week without modifying the original end', () => {
    const freeze = { freeze_start_date: '2026-10-10', freeze_end_date: '2026-10-17', original_end_date: '2026-11-01' };
    expect(projectedFreezeEnd('2026-11-01', freeze)).toBe('2026-11-08');
    expect(freeze.original_end_date).toBe('2026-11-01');
  });
  it('uses the original snapshot even if the stored date already moved', () => {
    expect(projectedFreezeEnd('2026-11-08', {freeze_start_date:'2026-10-10',freeze_end_date:'2026-10-17',original_end_date:'2026-11-01'})).toBe('2026-11-08');
  });
  it('uses calendar days across DST and caps late automatic thaw', () => {
    expect(projectedFreezeEnd('2026-11-01', {freeze_start_date:'2026-10-29',freeze_end_date:'2026-11-05'},'2026-11-10')).toBe('2026-11-08');
  });
  it('uses elapsed days for an indefinite freeze and preserves unlimited subscriptions', () => {
    expect(projectedFreezeEnd('2026-11-01', {freeze_start_date:'2026-10-10',freeze_end_date:null},'2026-10-13')).toBe('2026-11-04');
    expect(projectedFreezeEnd('9999-12-31', {freeze_start_date:'2026-10-10',freeze_end_date:'2026-10-17'})).toBeNull();
    expect(projectedFreezeEnd('2026-11-01')).toBeNull();
  });
});
