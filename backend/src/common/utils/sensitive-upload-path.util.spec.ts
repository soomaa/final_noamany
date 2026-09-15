import { sensitiveUploadMounts } from './sensitive-upload-path.util';

describe('sensitiveUploadMounts', () => {
  it('blocks both historical membership-document directories from the public static root', () => {
    expect(sensitiveUploadMounts('/uploads')).toEqual([
      '/uploads/club/membership-documents',
      '/uploads/membership-documents',
    ]);
  });
});
