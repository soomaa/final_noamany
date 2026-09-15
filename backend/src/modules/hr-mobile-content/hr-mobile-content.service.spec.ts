import { HrMobileContentService } from './hr-mobile-content.service';

describe('HrMobileContentService', () => {
  const prisma = {
    hr_mobile_app_content: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
  };
  const service = new HrMobileContentService(prisma as never);

  beforeEach(() => jest.clearAllMocks());

  it('creates HR-only defaults and returns separately scoped about and privacy content', async () => {
    prisma.hr_mobile_app_content.findUnique.mockResolvedValue(null);
    prisma.hr_mobile_app_content.upsert.mockResolvedValue({
      id: 1,
      about_title: 'عن تطبيق الموظفين',
      about_body: 'خدمة موارد بشرية',
      privacy_title: 'سياسة خصوصية الموارد البشرية',
      privacy_body: 'لا نشارك البيانات',
      updated_at: new Date('2026-08-24T10:00:00.000Z'),
    });

    await expect(service.about()).resolves.toEqual({
      title: 'عن تطبيق الموظفين', body: 'خدمة موارد بشرية', updatedAt: '2026-08-24T10:00:00.000Z',
    });
    await expect(service.privacy()).resolves.toEqual({
      title: 'سياسة خصوصية الموارد البشرية', body: 'لا نشارك البيانات', updatedAt: '2026-08-24T10:00:00.000Z',
    });
  });

  it('updates HR about and privacy content in one editable record', async () => {
    prisma.hr_mobile_app_content.upsert.mockResolvedValue({
      id: 1, about_title: 'عن HR', about_body: 'تفاصيل', privacy_title: 'الخصوصية', privacy_body: 'النص', updated_at: new Date(),
    });

    await expect(service.update({ aboutTitle: 'عن HR', aboutBody: 'تفاصيل', privacyTitle: 'الخصوصية', privacyBody: 'النص' })).resolves.toEqual(expect.objectContaining({
      about: { title: 'عن HR', body: 'تفاصيل' }, privacy: { title: 'الخصوصية', body: 'النص' },
    }));
  });
});
