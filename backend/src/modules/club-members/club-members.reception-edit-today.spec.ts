import { ForbiddenException } from '@nestjs/common';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { ClubMembersService } from './club-members.service';

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
