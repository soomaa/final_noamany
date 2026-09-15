import { CommunityAdminController } from './community-admin.controller';
import { HttpStatus } from '@nestjs/common';
import { HTTP_CODE_METADATA } from '@nestjs/common/constants';

describe('CommunityAdminController', () => {
  const service = {
    listAdminPosts: jest.fn(),
    getAdminPost: jest.fn(),
    approvePost: jest.fn(),
    rejectPost: jest.fn(),
  };
  const controller = new CommunityAdminController(service as never);

  beforeEach(() => jest.clearAllMocks());

  it('lists posts for staff moderation', async () => {
    const query = { page: 1, pageSize: 50, status: 'pending' } as never;
    const result = { data: [], total: 0, page: 1, pageSize: 50 };
    service.listAdminPosts.mockResolvedValue(result);

    await expect(controller.listPosts(query)).resolves.toEqual(result);
    expect(service.listAdminPosts).toHaveBeenCalledWith(query);
  });

  it('gets a post for staff moderation', async () => {
    const post = { id: 73 };
    service.getAdminPost.mockResolvedValue(post);

    await expect(controller.getPost(73)).resolves.toEqual(post);
    expect(service.getAdminPost).toHaveBeenCalledWith(73);
  });

  it('approves a post with the authenticated staff member identity', async () => {
    const dto = { adminReply: 'تمت الموافقة' } as never;
    const approved = { id: 73, status: 'approved' };
    service.approvePost.mockResolvedValue(approved);

    await expect(controller.approvePost(73, 41, dto)).resolves.toEqual(approved);
    expect(service.approvePost).toHaveBeenCalledWith(73, 41, dto);
  });

  it('rejects a post with the authenticated staff member identity', async () => {
    const dto = { rejectionReason: 'يحتاج مزيداً من التفاصيل' } as never;
    const rejected = { id: 73, status: 'rejected' };
    service.rejectPost.mockResolvedValue(rejected);

    await expect(controller.rejectPost(73, 41, dto)).resolves.toEqual(rejected);
    expect(service.rejectPost).toHaveBeenCalledWith(73, 41, dto);
  });

  it('returns moderation updates with 200 rather than the default POST status', () => {
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, CommunityAdminController.prototype.approvePost)).toBe(HttpStatus.OK);
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, CommunityAdminController.prototype.rejectPost)).toBe(HttpStatus.OK);
  });
});
