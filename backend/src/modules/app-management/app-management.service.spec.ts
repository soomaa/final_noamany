import { BadRequestException } from '@nestjs/common';
import { AppManagementService } from './app-management.service';

const news = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  title: 'x',
  content: 'y',
  news_type: 'supplements',
  publish_date: null,
  image_url: null,
  is_published: false,
  created_at: new Date('2026-08-25T00:00:00.000Z'),
  ...overrides,
});

describe('AppManagementService news types', () => {
  const prisma = {
    am_news: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
  };
  const config = { get: jest.fn().mockReturnValue('/uploads') };
  const service = new AppManagementService(prisma as never, config as never);

  beforeEach(() => {
    jest.clearAllMocks();
    config.get.mockReturnValue('/uploads');
    prisma.am_news.create.mockResolvedValue(news());
    prisma.am_news.findUnique.mockResolvedValue(news());
    prisma.am_news.update.mockResolvedValue(news());
  });

  it('rejects news creation without newsType', async () => {
    await expect(service.createNews({ title: 'x', content: 'y' } as never)).rejects.toThrow(BadRequestException);
  });

  it('persists and maps supplements as newsType', async () => {
    await expect(service.createNews({ title: 'x', content: 'y', newsType: 'supplements' } as never)).resolves.toMatchObject({
      newsType: 'supplements',
    });
    expect(prisma.am_news.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ news_type: 'supplements' }),
    }));
  });

  it('persists newsType when updating news', async () => {
    await service.updateNews(1, { newsType: 'exercises' } as never);

    expect(prisma.am_news.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 1 },
      data: expect.objectContaining({ news_type: 'exercises' }),
    }));
  });

  it.each([
    ['mobile_app/app-20260825.png', '/uploads/mobile_app/app-20260825.png'],
    ['/uploads/mobile_app/app-20260825.png', '/uploads/mobile_app/app-20260825.png'],
  ])('maps saved news image path %s to one uploads prefix', async (storedPath, expectedUrl) => {
    prisma.am_news.create.mockResolvedValue(news({ image_url: storedPath }));

    await expect(service.createNews({
      title: 'x',
      content: 'y',
      newsType: 'nutrition',
      imageUrl: storedPath,
    } as never)).resolves.toMatchObject({ imageUrl: expectedUrl });
    expect(prisma.am_news.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ image_url: storedPath }),
    }));
  });
});
