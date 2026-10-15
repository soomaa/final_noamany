import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { claimEmployeePrivateFile, opaquePrivateFileId } from './private-file-reference.util';

describe('private file references', () => {
  const valid = 'file:123e4567-e89b-42d3-a456-426614174000';

  it('accepts only opaque v4 file references or explicit empty values', () => {
    expect(opaquePrivateFileId(valid)).toBe('123e4567-e89b-42d3-a456-426614174000');
    expect(opaquePrivateFileId('')).toBeNull();
    expect(() => opaquePrivateFileId('https://example.test/document.pdf')).toThrow(BadRequestException);
    expect(() => opaquePrivateFileId('/uploads/document.pdf')).toThrow(BadRequestException);
  });

  it('fails closed when an actor cannot claim the referenced metadata row', async () => {
    const client = { private_file_metadata: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) } };
    await expect(claimEmployeePrivateFile(client as never, valid, 7, 3, ['document']))
      .rejects.toBeInstanceOf(ForbiddenException);
  });
});
