import { hasMemberPhoto, memberPhotoUrl } from './member-photo-policy';

describe('member photo policy', () => {
  it.each([null, '', '  ', '0', 'NULL', 'logo.png', '/uploads/user.png', 'https://host/no-image.png?x=1'])('ignores placeholder %s', (value) => {
    expect(hasMemberPhoto(value)).toBe(false);
    expect(memberPhotoUrl('/uploads', value)).toBeNull();
  });
  it.each(['photo.jpg', 'file:opaque', 'public-file:opaque', 'https://host/member.jpg'])('recognizes real reference %s', (value) => expect(hasMemberPhoto(value)).toBe(true));
  it.each(['/uploads/member.jpg', '/api/uploads/public/opaque'])('does not double-prefix an existing image path %s', (path) => {
    expect(memberPhotoUrl('/uploads', path)).toBe(path);
  });
  it('uses the same public delivery URL for old staff and mobile references', () => {
    expect(memberPhotoUrl('/uploads', 'file:opaque')).toBe('/api/uploads/public/opaque');
    expect(memberPhotoUrl('/uploads', 'public-file:opaque')).toBe('/api/uploads/public/opaque');
  });
});
