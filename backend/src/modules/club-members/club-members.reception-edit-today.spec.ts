import { ForbiddenException } from '@nestjs/common';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { ClubMembersService, isPhotoOnlyMemberUpdate } from './club-members.service';

const TODAY_ONLY = 'موظف الاستقبال يمكنه تعديل أو حذف الأعضاء المضافين اليوم فقط';
const receptionist = { sub: 4, level: 2, branch: 3, man_women_type: 3, job_title: 'موظف استقبال' } as never;

function makeService(createdAt: Date) {
  const update = jest.fn();
  const member = { id: 14, branch_id: 3, gender: 'male', created_at: createdAt, card_number: null, is_deleted: false };
  const prisma = { club_members: { findFirst: jest.fn().mockResolvedValue(member), update } };
  const service = new ClubMembersService(prisma as never, {} as never, new BranchScopeService(), {} as never, {} as never);
  return { service, update };
}

describe('ClubMembersService reception edit/delete window', () => {
  const yesterday = new Date(Date.now() - 36 * 60 * 60 * 1000);

  it('rejects a receptionist editing a member registered before today', async () => {
    const { service, update } = makeService(yesterday);
    await expect(service.update(14, { name: 'x' }, receptionist)).rejects.toThrow(new ForbiddenException(TODAY_ONLY));
    expect(update).not.toHaveBeenCalled();
  });

  it('rejects a receptionist deleting a member registered before today', async () => {
    const { service } = makeService(yesterday);
    await expect(service.remove(14, receptionist)).rejects.toThrow(TODAY_ONLY);
  });

  it('does not apply the window to reception managers', async () => {
    const { service } = makeService(yesterday);
    const manager = { sub: 4, level: 2, branch: 3, man_women_type: 3, job_title: 'مدير استقبال' } as never;
    await expect((service as any).assertReceptionCanModify(manager, { created_at: yesterday })).toBeUndefined();
    await expect((service as any).assertReceptionCanModify({ level: 1 }, { created_at: yesterday })).toBeUndefined();
  });

  it('accepts a member registered today for a receptionist', () => {
    const { service } = makeService(new Date());
    expect(() => (service as any).assertReceptionCanModify(receptionist, { created_at: new Date() })).not.toThrow();
  });
});

describe('reception photo / attachments on older members (client, 24 Nov)', () => {
  const lastMonth = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  it('isPhotoOnlyMemberUpdate is true only for a lone profilePicture string', () => {
    expect(isPhotoOnlyMemberUpdate({ profilePicture: '/uploads/club-member/a.jpg' })).toBe(true);
    expect(isPhotoOnlyMemberUpdate({ profilePicture: '/uploads/club-member/a.jpg', name: undefined })).toBe(true);
    expect(isPhotoOnlyMemberUpdate({ profilePicture: '/uploads/x.jpg', name: 'x' })).toBe(false);
    expect(isPhotoOnlyMemberUpdate({ name: 'x' })).toBe(false);
    expect(isPhotoOnlyMemberUpdate({})).toBe(false);
    expect(isPhotoOnlyMemberUpdate(undefined)).toBe(false);
  });

  it('lets a receptionist past the "added today" rules for a photo-only change', async () => {
    const { service } = makeService(lastMonth);
    // The photo-only path must not hit either reception day rule (it may fail later on unrelated mocks).
    await expect(service.update(14, { profilePicture: '/uploads/club-member/a.jpg' }, receptionist)).rejects.not.toThrow(
      /اليوم فقط/,
    );
  });

  it('still blocks other edits of an older member', async () => {
    const { service, update } = makeService(lastMonth);
    await expect(service.update(14, { profilePicture: '/uploads/a.jpg', name: 'x' }, receptionist)).rejects.toThrow(TODAY_ONLY);
    expect(update).not.toHaveBeenCalled();
  });

  it('member access: attachments (anyDay) open for older members, other access keeps the today rule', () => {
    const { service } = makeService(lastMonth);
    const member = { branch_id: 3, gender: 'male', created_at: lastMonth };
    expect(() => (service as any).assertMemberAccess(receptionist, member, { anyDay: true })).not.toThrow();
    expect(() => (service as any).assertMemberAccess(receptionist, member)).toThrow('موظف الاستقبال يمكنه الوصول إلى أعضاء اليوم فقط');
  });

  it('reception supervisors are not limited to today', () => {
    const { service } = makeService(lastMonth);
    const supervisor = { sub: 5, level: 2, branch: 3, man_women_type: 3, job_title: 'مشرف استقبال' } as never;
    expect(() => (service as any).assertMemberAccess(supervisor, { branch_id: 3, gender: 'male', created_at: lastMonth })).not.toThrow();
  });
});
