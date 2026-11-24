import {
  invitationLeadPackage,
  parseOptionalGuestAge,
  parseOptionalMemberId,
} from './invitation-package.util';

describe('invitation-package helpers', () => {
  it('treats age as optional and ignores empty or invalid values', () => {
    expect(parseOptionalGuestAge(undefined)).toBeUndefined();
    expect(parseOptionalGuestAge(null)).toBeUndefined();
    expect(parseOptionalGuestAge('')).toBeUndefined();
    expect(parseOptionalGuestAge('abc')).toBeUndefined();
    expect(parseOptionalGuestAge(0)).toBeUndefined();
    expect(parseOptionalGuestAge(24)).toBe(24);
  });

  it('parses memberId only when it is a positive integer', () => {
    expect(parseOptionalMemberId(undefined)).toBeUndefined();
    expect(parseOptionalMemberId('')).toBeUndefined();
    expect(parseOptionalMemberId('all')).toBeUndefined();
    expect(parseOptionalMemberId('12')).toBe(12);
  });

  it('copies the invitation subscription package onto the lead', () => {
    expect(invitationLeadPackage({
      subscription_type_id: 41,
      subscription_type: 'sub - FT-L-9580',
      type: { id: 41, name: 'سنوي ذهبية' },
    })).toEqual({
      subscriptionTypeId: 41,
      interestedProgram: 'سنوي ذهبية',
    });
  });

  it('falls back to the subscription label when the type relation is missing', () => {
    expect(invitationLeadPackage({
      subscription_type_id: null,
      subscription_type: 'sub - FT-L-9580',
      type: null,
    })).toEqual({
      subscriptionTypeId: null,
      interestedProgram: 'sub - FT-L-9580',
    });
  });
});
