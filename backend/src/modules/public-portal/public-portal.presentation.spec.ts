import { cairoCalendarDay, PublicPortalService } from './public-portal.service';

describe('Public portal presentation contracts', () => {
  it('uses one injectable Africa/Cairo calendar day at the UTC midnight boundary', async () => {
    expect(cairoCalendarDay(new Date('2026-09-09T22:30:00.000Z'))).toBe('2026-09-10');
    const { service, prisma } = serviceWith(() => []);
    await service.home(new Date('2026-09-09T22:30:00.000Z'));
    const offerCall = prisma.$queryRawUnsafe.mock.calls.find(([sql]) => String(sql).includes('FROM tbl_offers'));
    expect(offerCall?.[0]).not.toMatch(/CURDATE\(\)/);
    expect(offerCall?.slice(1)).toEqual(['2026-09-10', '2026-09-10']);
  });
  function serviceWith(query: (sql: string) => unknown[]) {
    const prisma = { $queryRawUnsafe: jest.fn(async (sql: string) => query(sql)) };
    return { service: new PublicPortalService(prisma as any, {} as any, {} as any, {} as any), prisma };
  }

  it('publishes homepage-enabled hero videos separately from ordinary videos and tolerates null presentation fields', async () => {
    const { service, prisma } = serviceWith((sql) => {
      if (sql.includes('design_web_slider_videos')) return [{ id: '17', title: 'جولة', branchId: null, branch: null, date: null, videoLink: null, image: null, mainPageVideo: 1 }];
      if (sql.includes('design_web_videos')) return [{ id: '3', title: 'فيديو عادي', date: null, mainPageVideo: 1 }];
      return [];
    });
    const home = await service.home();
    expect(home.videos).toEqual([{ id: 3, title: 'فيديو عادي', date: null, mainPageVideo: true }]);
    expect(home.heroVideos).toEqual([{ id: 17, title: 'جولة', branchId: null, branch: '', date: '', videoLink: '', image: null, mainPageVideo: true }]);
    expect(prisma.$queryRawUnsafe.mock.calls.find(([sql]) => String(sql).includes('design_web_slider_videos'))?.[0]).toMatch(/main_page_video=1[\s\S]*ORDER BY v\.id DESC/);
  });

  it('publishes the editable date and metadata fields consumed by the home renderers', async () => {
    const { service, prisma } = serviceWith((sql) => {
      if (sql.includes('design_web_projects')) return [{ id: 4, title: 'مدرب', jobTitle: 'قوة', image: 'coach.webp', gender: 1, branchId: 2, branch: 'الفرع', date: '2026-09-10' }];
      if (sql.includes('design_web_photos')) return [{ id: 5, title: 'ألبوم', details: 'تفاصيل', image: 'main.webp', branchId: 2, branch: 'الفرع', date: '2026-09-09', albumImages: 'a.webp||b.webp' }];
      if (sql.includes('design_web_classes')) return [{ id: 6, title: 'كلاس', classType: 1, day: 'الأحد', time: '18:00', branchId: 2, branch: 'الفرع', date: '2026-09-08' }];
      if (sql.includes('design_web_videos')) return [{ id: 7, title: 'فيديو', subtitle: 'مختصر', videoLink: '/watch', image: 'poster.webp', date: '2026-09-07', mainPageVideo: 1 }];
      return [];
    });
    const home = await service.home();
    expect((home.trainers[0] as any).date).toBe('2026-09-10');
    expect((home.photos[0] as any).date).toBe('2026-09-09');
    expect((home.classes[0] as any).date).toBe('2026-09-08');
    expect(home.videos[0]).toMatchObject({ date: '2026-09-07', mainPageVideo: true });
    for (const table of ['design_web_projects', 'design_web_photos', 'design_web_classes', 'design_web_videos']) {
      expect(prisma.$queryRawUnsafe.mock.calls.find(([sql]) => String(sql).includes(table))?.[0]).toMatch(/\bdate\b/);
    }
  });

  it('publishes the complete active badge identity on list products', async () => {
    const { service, prisma } = serviceWith((sql) => sql.includes('FROM products') ? [{
      id: 4, category_id: 2, name: 'منتج', current_stock: 2, stock_status: 'in_stock', images: '',
      badge_id: '8', badge_name: 'الأقوى', badge_name_en: 'Strongest', badge_type: 'featured', background_color: '#111111', text_color: '#ffffff',
    }] : sql.includes('FROM categories') ? [{ id: 2, name: 'مكملات', image: 'cat.webp', iconClass: 'dumbbell', displayOrder: 3 }] : []);
    const result = await service.products();
    expect(result.items[0].badge).toEqual({ id: 8, name: 'الأقوى', nameEn: 'Strongest', type: 'featured', backgroundColor: '#111111', textColor: '#ffffff' });
    expect(result.categories[0]).toMatchObject({ image: 'cat.webp', iconClass: 'dumbbell', displayOrder: 3 });
    expect(prisma.$queryRawUnsafe.mock.calls.find(([sql]) => String(sql).includes('FROM categories'))?.[0]).toMatch(/icon_class AS iconClass/);
  });

  it('keeps inactive, missing, and partially migrated badges null', async () => {
    let joined = true;
    const prisma = { $queryRawUnsafe: jest.fn(async (sql: string) => {
      if (sql.includes('LEFT JOIN tbl_badge_settings') && joined) { joined = false; throw { code: 'P2010' }; }
      if (sql.includes('FROM products')) return [{ id: 5, category_id: 0, name: 'قديم', current_stock: 1, stock_status: 'in_stock', images: '' }];
      return [];
    }) };
    const service = new PublicPortalService(prisma as any, {} as any, {} as any, {} as any);
    const result = await service.products();
    expect(result.items[0].badge).toBeNull();
    expect(prisma.$queryRawUnsafe.mock.calls.some(([sql]) => /NULL AS badge_id[\s\S]*NULL AS badge_type/.test(String(sql)))).toBe(true);
  });
});
