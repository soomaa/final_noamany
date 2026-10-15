import {
  detectFileKind,
  isKindAllowedForCategory,
  isPublicMediaCategory,
  requiresEmployeeOwner,
  safeOriginalName,
} from './private-file.policy';

describe('private file policy', () => {
  it('separates explicit public media from employee-owned HR files', () => {
    expect(isPublicMediaCategory('activity')).toBe(true);
    expect(isPublicMediaCategory('document')).toBe(false);
    expect(requiresEmployeeOwner('emp-bank')).toBe(true);
    expect(requiresEmployeeOwner('legal')).toBe(false);
  });

  it.each([
    [Buffer.from([0xff, 0xd8, 0xff, 0x00]), 'jpeg'],
    [Buffer.from('89504e470d0a1a0a', 'hex'), 'png'],
    [Buffer.from('GIF89a'), 'gif'],
    [Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP')]), 'webp'],
    [Buffer.from('%PDF-1.7'), 'pdf'],
    [Buffer.from('d0cf11e0a1b11ae1', 'hex'), 'office'],
    [Buffer.concat([Buffer.from('504b0304', 'hex'), Buffer.from('[Content_Types].xml word/')]), 'office-zip'],
  ])('detects content signature independently of client MIME', (buffer, kind) => {
    expect(detectFileKind(buffer)).toBe(kind);
  });

  it('rejects executable or unknown bytes even when the extension says PDF', () => {
    expect(detectFileKind(Buffer.from('MZ executable'))).toBeNull();
    expect(isKindAllowedForCategory('document', null)).toBe(false);
  });

  it('does not allow office documents in image-only categories', () => {
    expect(isKindAllowedForCategory('emp-photo', 'office-zip')).toBe(false);
    expect(isKindAllowedForCategory('emp-photo', 'png')).toBe(true);
    expect(isKindAllowedForCategory('document', 'office-zip')).toBe(true);
  });

  it('normalizes an original name without preserving path traversal', () => {
    expect(safeOriginalName('../../salary\u0000.pdf')).toBe('salary.pdf');
  });
});
