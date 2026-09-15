import { GoneException } from '@nestjs/common';
import { ClubMembersController } from './club-members.controller';

describe('legacy singular membership-document mutation', () => {
  it('cannot attach an arbitrary client-supplied public upload path', () => {
    const service = { setMembershipDocument: jest.fn() };
    const controller = new ClubMembersController(service as never);

    expect(() => controller.setMembershipDocument(
      4,
      'club/membership-documents/attacker-controlled.pdf',
      { sub: 1, level: 1 } as never,
    )).toThrow(GoneException);
    expect(service.setMembershipDocument).not.toHaveBeenCalled();
  });
});
