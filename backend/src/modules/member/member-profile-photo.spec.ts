import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { MemberController } from './member.controller';
import { MemberService } from './member.service';

describe('MemberController profile photo route', () => {
  it('exposes the Flutter-compatible POST /member/profile/photo contract', () => {
    const handler = (MemberController.prototype as unknown as Record<string, unknown>).updateProfilePhoto;

    expect(typeof handler).toBe('function');
    expect(Reflect.getMetadata(METHOD_METADATA, handler as object)).toBe(RequestMethod.POST);
    expect(Reflect.getMetadata(PATH_METADATA, handler as object)).toBe('profile/photo');
  });
});

describe('MemberService profile photo', () => {
  const memberRow = {
    id: 46,
    app_user_id: 71,
    branch_id: 2,
    profile_picture: null,
    profile_photo_locked: false,
  };
  const tx = {
    club_members: { updateMany: jest.fn() },
    api_users: { update: jest.fn() },
    business_audit_log: { create: jest.fn() },
  };
  const prisma = {
    club_members: { findFirst: jest.fn() },
    $transaction: jest.fn(async (fn: (database: typeof tx) => unknown) => fn(tx)),
  };
  const uploads = {
    storeMemberProfile: jest.fn(),
    discardMemberProfile: jest.fn().mockResolvedValue(undefined),
  };
  const service = Reflect.construct(MemberService, [prisma, { get: jest.fn() }, {}, {}, uploads]) as MemberService;

  beforeEach(() => {
    jest.clearAllMocks();
    tx.club_members.updateMany.mockResolvedValue({ count: 1 });
    prisma.club_members.findFirst.mockResolvedValue(memberRow);
    uploads.storeMemberProfile.mockResolvedValue({
      id: '9f350787-7246-4632-9e56-5f8393619ee8',
      path: 'public-file:9f350787-7246-4632-9e56-5f8393619ee8',
      url: '/api/uploads/public/9f350787-7246-4632-9e56-5f8393619ee8',
    });
  });

  it('stores the image against only the authenticated member and app account', async () => {
    const file = {
      buffer: Buffer.from('89504e470d0a1a0a0000', 'hex'),
      originalname: 'avatar.png',
      mimetype: 'image/png',
    } as Express.Multer.File;
    const authenticatedMember = {
      sub: 71,
      memberId: 46,
      branchId: 2,
      memberCode: 'B001352',
      phone: '01000000000',
      name: 'عضو فرع ب',
      type: 'member' as const,
    };

    const result = await (
      service as unknown as {
        updateProfilePhoto: (user: typeof authenticatedMember, image: Express.Multer.File) => Promise<unknown>;
      }
    ).updateProfilePhoto(authenticatedMember, file);

    expect(prisma.club_members.findFirst).toHaveBeenCalledWith({
      where: { id: 46, app_user_id: 71, is_deleted: false },
      select: {
        id: true,
        app_user_id: true,
        branch_id: true,
        profile_picture: true,
        profile_photo_locked: true,
      },
    });
    expect(tx.club_members.updateMany).toHaveBeenCalledWith({
      where: { id: 46, app_user_id: 71, is_deleted: false, profile_photo_locked: false, profile_picture: null },
      data: {
        profile_picture: 'public-file:9f350787-7246-4632-9e56-5f8393619ee8',
        profile_photo_locked: true,
      },
    });
    expect(tx.api_users.update).toHaveBeenCalledWith({
      where: { user_id: 71 },
      data: { m_image: 'public-file:9f350787-7246-4632-9e56-5f8393619ee8' },
    });
    expect(result).toEqual({
      message: 'تم حفظ صورتك. يمكنك تغييرها لاحقًا من خلال الاستقبال فقط.',
      memberId: 46,
      profilePhotoLocked: true,
      profilePicture: 'public-file:9f350787-7246-4632-9e56-5f8393619ee8',
      profilePictureUrl: '/api/uploads/public/9f350787-7246-4632-9e56-5f8393619ee8',
    });
  });

  it('does not store a file when the token does not own the member record', async () => {
    prisma.club_members.findFirst.mockResolvedValue(null);
    const user = {
      sub: 71,
      memberId: 999,
      branchId: 2,
      memberCode: 'B009999',
      phone: '01000000000',
      name: 'عضو',
      type: 'member' as const,
    };

    await expect(
      (
        service as unknown as {
          updateProfilePhoto: (member: typeof user, image: Express.Multer.File) => Promise<unknown>;
        }
      ).updateProfilePhoto(user, {} as Express.Multer.File),
    ).rejects.toMatchObject({ status: 404 });
    expect(uploads.storeMemberProfile).not.toHaveBeenCalled();
  });
  const user = { sub: 71, memberId: 46, branchId: 2, name: 'عضو', type: 'member' } as never;
  it.each([
    { profile_picture: 'old.jpg', profile_photo_locked: false },
    { profile_picture: null, profile_photo_locked: true },
    { profile_picture: 'public-file:staff-photo', profile_photo_locked: true },
  ])('refuses an existing or permanently locked photo before storing any file: %j', async (photo) => {
    prisma.club_members.findFirst.mockResolvedValue({ ...memberRow, ...photo });
    await expect(service.updateProfilePhoto(user, {} as never)).rejects.toMatchObject({ status: 409 });
    expect(uploads.storeMemberProfile).not.toHaveBeenCalled();
  });

  it.each(['logo.png', 'user.png', 'no-image.png', '0', ''])('allows a first photo over legacy placeholder %s', async (profile_picture) => {
    prisma.club_members.findFirst.mockResolvedValue({ ...memberRow, profile_picture });
    await expect(service.updateProfilePhoto(user, {} as never)).resolves.toMatchObject({ profilePhotoLocked: true });
    expect(tx.club_members.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ profile_picture, profile_photo_locked: false }),
    }));
  });

  it('discards the losing upload if another request or staff edit claimed the photo', async () => {
    tx.club_members.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.updateProfilePhoto(user, {} as never)).rejects.toMatchObject({ status: 409 });
    expect(tx.api_users.update).not.toHaveBeenCalled();
    expect(tx.business_audit_log.create).not.toHaveBeenCalled();
    expect(uploads.discardMemberProfile).toHaveBeenCalledWith('9f350787-7246-4632-9e56-5f8393619ee8', user);
  });

  it('cleans up the upload when the transactional save fails', async () => {
    tx.api_users.update.mockRejectedValueOnce(new Error('database unavailable'));
    await expect(service.updateProfilePhoto(user, {} as never)).rejects.toThrow('database unavailable');
    expect(uploads.discardMemberProfile).toHaveBeenCalled();
  });

  it('does not claim or lock the member when image validation fails', async () => {
    uploads.storeMemberProfile.mockRejectedValueOnce(new Error('invalid image'));
    await expect(service.updateProfilePhoto(user, {} as never)).rejects.toThrow('invalid image');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

});
