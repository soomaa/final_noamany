import { One80FileCategoryAdapter } from './one80-file-category.adapter';

describe('ONE80 public member-app media', () => {
  it.each(['member-profile', 'club-member'])('stores %s photos as public image-only media', (category) => {
    const policy = new One80FileCategoryAdapter().policy(category);
    expect(policy).toEqual(
      expect.objectContaining({
        maxBytes: 5 * 1024 * 1024,
        publicMedia: true,
      }),
    );
    expect(policy?.allowedKinds).toEqual(new Set(['jpeg', 'png', 'webp']));
  });

  it('allows package editors to upload a public promotion image', () => {
    const policy = new One80FileCategoryAdapter().policy('club-package-promo');
    expect(policy).toEqual(
      expect.objectContaining({
        publicMedia: true,
        uploadPermissions: ['club.packages.settings:create', 'club.packages.settings:update'],
        downloadPermissions: ['club.packages.settings:view'],
      }),
    );
    expect(policy?.allowedKinds.has('jpeg')).toBe(true);
    expect(policy?.allowedKinds.has('pdf')).toBe(false);
  });
});

describe('ONE80 member-app trainer and branch media', () => {
  const adapter = new One80FileCategoryAdapter();

  it('stores trainer portraits as public images editable from either trainer screen', () => {
    const policy = adapter.policy('trainers');
    expect(policy).toEqual(expect.objectContaining({ publicMedia: true, maxBytes: 5 * 1024 * 1024 }));
    expect(policy?.uploadPermissions).toEqual(expect.arrayContaining([
      'club.fitness.trainers:update',
      'app-management.trainers:update',
    ]));
    expect(policy?.allowedKinds.has('pdf')).toBe(false);
  });

  it('stores package section icons as small public images owned by package settings', () => {
    const policy = adapter.policy('club-package-category');
    expect(policy).toEqual(expect.objectContaining({
      maxBytes: 3 * 1024 * 1024,
      publicMedia: true,
      uploadPermissions: ['club.packages.settings:create', 'club.packages.settings:update'],
      downloadPermissions: ['club.packages.settings:view'],
    }));
    expect(policy?.allowedKinds).toEqual(new Set(['jpeg', 'png', 'webp']));
  });

  it('stores branch cover and gallery photos as public images owned by the branches page', () => {
    const policy = adapter.policy('branch-photo');
    expect(policy).toEqual(expect.objectContaining({
      publicMedia: true,
      uploadPermissions: ['app-management.branches:update'],
      downloadPermissions: ['app-management.branches:view'],
    }));
    expect(policy?.allowedKinds).toEqual(new Set(['jpeg', 'png', 'webp']));
  });
});
