import { CommunityMemberController } from './community-member.controller';
import { HttpStatus } from '@nestjs/common';
import { HTTP_CODE_METADATA } from '@nestjs/common/constants';

describe('CommunityMemberController', () => {
  const service = {
    createPost: jest.fn(),
    listMemberPosts: jest.fn(),
    getMemberPost: jest.fn(),
    setReaction: jest.fn(),
  };
  const controller = new CommunityMemberController(service as never);
  const member = { memberId: 34, sub: 19, branchId: 2, phone: '01000000000' } as never;

  beforeEach(() => jest.clearAllMocks());

  it('returns the fixed community categories for the member composer', () => {
    expect(controller.categories()).toEqual({
      data: [
        { value: 'question', label: 'سؤال' },
        { value: 'experience', label: 'تجربة' },
        { value: 'discussion', label: 'نقاش' },
      ],
    });
  });

  it('creates a post for the authenticated member', async () => {
    const dto = { category: 'suggestion', title: 'اقتراح', description: 'تفاصيل الاقتراح' } as never;
    const created = { id: 73 };
    service.createPost.mockResolvedValue(created);

    await expect(controller.createPost(member, dto)).resolves.toEqual(created);
    expect(service.createPost).toHaveBeenCalledWith(member, dto);
  });

  it('lists approved posts in the authenticated member context', async () => {
    const query = { page: 2, pageSize: 20 } as never;
    const result = { items: [], total: 0, page: 2, pageSize: 20 };
    service.listMemberPosts.mockResolvedValue(result);

    await expect(controller.listPosts(member, query)).resolves.toEqual(result);
    expect(service.listMemberPosts).toHaveBeenCalledWith(member, query);
  });

  it('gets a post in the authenticated member context', async () => {
    const post = { id: 73 };
    service.getMemberPost.mockResolvedValue(post);

    await expect(controller.getPost(member, 73)).resolves.toEqual(post);
    expect(service.getMemberPost).toHaveBeenCalledWith(member, 73);
  });

  it('sets a reaction for the authenticated member', async () => {
    const dto = { reactionType: 'like' } as never;
    const reaction = { postId: 73, likesCount: 1, lovedItCount: 0, userReaction: 'like' };
    service.setReaction.mockResolvedValue(reaction);

    await expect(controller.setReaction(member, 73, dto)).resolves.toEqual(reaction);
    expect(service.setReaction).toHaveBeenCalledWith(member, 73, dto);
  });

  it('returns reaction updates with 200 rather than the default POST status', () => {
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, CommunityMemberController.prototype.setReaction)).toBe(HttpStatus.OK);
  });
});
