import { isMasked, maskPhone, maskSensitive } from './mask';

describe('maskPhone', () => {
  it('keeps the length and the last two digits', () => {
    expect(maskPhone('201012345678')).toBe('**********78');
    expect(maskPhone('201012345678')?.length).toBe('201012345678'.length);
  });

  it('passes null and empty through untouched', () => {
    expect(maskPhone(null)).toBeNull();
    expect(maskPhone(undefined)).toBeNull();
    expect(maskPhone('')).toBe('');
    expect(maskPhone('   ')).toBe('   ');
  });

  it('reveals nothing when the value is shorter than the tail', () => {
    expect(maskPhone('7')).toBe('*');
    expect(maskPhone('75')).toBe('**');
  });
});

describe('maskSensitive', () => {
  it('reveals nothing at all', () => {
    expect(maskSensitive('29001011234567')).toBe('**************');
    expect(maskSensitive('29001011234567')).not.toMatch(/[0-9]/);
  });

  it('passes null and empty through untouched', () => {
    expect(maskSensitive(null)).toBeNull();
    expect(maskSensitive('')).toBe('');
  });
});

describe('isMasked', () => {
  it('recognises values this module produced', () => {
    expect(isMasked(maskPhone('201012345678'))).toBe(true);
    expect(isMasked(maskSensitive('123'))).toBe(true);
    expect(isMasked('201012345678')).toBe(false);
    expect(isMasked(null)).toBe(false);
  });
});
