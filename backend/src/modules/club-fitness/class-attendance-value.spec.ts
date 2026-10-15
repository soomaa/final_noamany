import { attendanceCommission, packageSessionValue } from './class-attendance-value';

describe('class attendance attribution', () => {
  it('attributes one net package session, not the whole subscription', () => {
    const value = packageSessionValue({ subscription_value: 1500, discount_enabled: true, discount_value: 300, sessions_count: 12 });
    expect(value).toBe(100);
    expect(attendanceCommission(value!, 50)).toBe(50);
  });
  it('does not deduct an inactive discount', () => {
    expect(packageSessionValue({ subscription_value: 1500, discount_enabled: false, discount_value: 300, sessions_count: 10 })).toBe(150);
  });
  it('marks packages without a session denominator as unresolved', () => {
    expect(packageSessionValue({ subscription_value: 1500, sessions_count: 0 })).toBeNull();
    expect(packageSessionValue(null)).toBeNull();
  });
  it('rejects invalid net amounts and rounds commission to cents', () => {
    expect(packageSessionValue({ subscription_value: -1, sessions_count: 12 })).toBeNull();
    expect(attendanceCommission(33.3333, 50)).toBe(16.67);
  });
});
