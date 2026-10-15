import { MemberService } from './member.service';

describe('MemberService mobile integrity', () => {
  const prisma = {
    club_subscriptions: { findMany: jest.fn() },
    club_members: { findFirst: jest.fn() },
    tbl_branches: { findUnique: jest.fn() },
    club_subscription_types: { findMany: jest.fn() },
    club_trainers: { findMany: jest.fn() },
    club_classes: { findMany: jest.fn() },
    club_class_schedule_slots: { findMany: jest.fn() },
    club_trainer_schedule_slots: { findMany: jest.fn() },
    club_trainer_availability: { findMany: jest.fn() },
    employees: { findMany: jest.fn() },
  };
  const about = {
    getAbout: jest.fn().mockResolvedValue({
      termsOfService: 'terms',
      privacyPolicy: 'privacy',
    }),
  };
  const gate = {
    ensureForMember: jest.fn().mockResolvedValue({ credential_no: '7654321', is_active: true }),
  };
  const service = new MemberService(
    prisma as never,
    { get: jest.fn() } as never,
    about as never,
    gate as never,
    {} as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.club_trainer_availability.findMany.mockResolvedValue([]);
  });

  it('returns each member subscription note in active plan and history', async () => {
    prisma.club_subscriptions.findMany.mockResolvedValue([
      { id: 3, status: 'active', subscription_start_date: '2000-01-01', subscription_end_date: '2099-01-01', notes: 'تعليمات العضوية\nالسطر الثاني' },
      { id: 2, status: 'expired', subscription_start_date: '2000-01-01', subscription_end_date: '2001-01-01', notes: 'ملاحظة قديمة' },
      { id: 1, status: 'expired', subscription_start_date: '2000-01-01', subscription_end_date: '2001-01-01', notes: null },
    ]);
    const result = await service.listSubscriptions(46);
    expect(prisma.club_subscriptions.findMany).toHaveBeenCalledWith({
      where: { member_id: 46 }, orderBy: { id: 'desc' },
    });
    expect(result.activePlan).toMatchObject({ id: 3, notes: 'تعليمات العضوية\nالسطر الثاني' });
    expect(result.history.map(row => row.notes)).toEqual(['تعليمات العضوية\nالسطر الثاني', 'ملاحظة قديمة', null]);
  });

  it('uses the numeric gate credential as the barcode and exposes the authoritative branch', async () => {
    prisma.club_members.findFirst.mockResolvedValue({
      id: 46,
      member_code: 'B001352',
      branch_id: 2,
      name: 'عضو فرع ب',
      phone: '01000000000',
      profile_picture: null,
      is_active: true,
    });
    prisma.tbl_branches.findUnique.mockResolvedValue({ branch_name: 'فرع B' });

    await expect(service.getProfile(46)).resolves.toEqual(expect.objectContaining({
      branchId: 2,
      memberCode: 'B001352',
      barcode: '7654321',
      barcodeValue: '7654321',
      gateCode: '7654321',
    }));
    expect(gate.ensureForMember).toHaveBeenCalledWith(46);
  });

  it('clears all mobile gate fields when the credential is revoked', async () => {
    prisma.club_members.findFirst.mockResolvedValue({ id: 46, member_code: 'B001352', branch_id: 2 });
    prisma.tbl_branches.findUnique.mockResolvedValue({ branch_name: 'B' });
    gate.ensureForMember.mockResolvedValueOnce({ credential_no: '7654321', is_active: false });
    await expect(service.getProfile(46)).resolves.toEqual(expect.objectContaining({
      memberCode: 'B001352', barcode: null, barcodeValue: null, gateCode: null,
    }));
  });

  it('returns every active package assigned to the branch regardless of show_in_app', async () => {
    prisma.club_subscription_types.findMany.mockResolvedValue([{
      id: 7,
      name: 'اشتراك 3 أشهر',
      price: 1250,
      days: 90,
      is_active: true,
      show_in_app: false,
      branch_id: 2,
      apply_to_all_branches: false,
      branches: [],
      is_special_offer: false,
      is_for_students: false,
      invitations_count: 0,
      inbody_count: 0,
      includes_spa: false,
      spa_count: 0,
      is_linked_to_sessions: false,
      sessions_count: null,
      session_prices: [],
      freeze_days: 0,
      wallet_points: 0,
      offer_validity: null,
    }]);

    await expect(service.listPackages(2)).resolves.toEqual([
      expect.objectContaining({ id: 7, name: 'اشتراك 3 أشهر', price: 1250 }),
    ]);
    expect(prisma.club_subscription_types.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { is_active: true } }),
    );
  });

  it('uses a branch-local package copy instead of the global source package', async () => {
    const base = {
      name: 'اشتراك عام',
      days: 90,
      is_active: true,
      show_in_app: true,
      branches: [],
      is_special_offer: false,
      is_for_students: false,
      invitations_count: 0,
      inbody_count: 0,
      includes_spa: false,
      spa_count: 0,
      is_linked_to_sessions: false,
      sessions_count: null,
      session_prices: [],
      freeze_days: 0,
      wallet_points: 0,
      offer_validity: null,
      promo_enabled: false,
      promo_ends_at: null,
      categories: [],
    };
    prisma.club_subscription_types.findMany.mockResolvedValue([
      {
        ...base,
        id: 10,
        price: 1000,
        branch_id: null,
        apply_to_all_branches: true,
        source_subscription_type_id: null,
      },
      {
        ...base,
        id: 11,
        name: 'اشتراك الفرع',
        price: 800,
        branch_id: 2,
        apply_to_all_branches: false,
        source_subscription_type_id: 10,
      },
    ]);

    await expect(service.listPackages(2)).resolves.toEqual([
      expect.objectContaining({ id: 11, name: 'اشتراك الفرع', price: 800 }),
    ]);
  });

  it('returns real active trainers that belong to the member branch', async () => {
    prisma.club_trainers.findMany.mockResolvedValue([{
      id: 9,
      employee_id: 55,
      name: 'مدرب فرع B',
      specialization: 'لياقة',
      experience: '5 سنوات',
      bio: null,
      image_url: null,
      rating_avg: 4.5,
    }]);
    prisma.club_classes.findMany.mockResolvedValue([]);
    prisma.club_class_schedule_slots.findMany.mockResolvedValue([]);
    prisma.club_trainer_schedule_slots.findMany.mockResolvedValue([]);
    prisma.employees.findMany.mockResolvedValue([{ id: 55 }]);

    await expect((service as any).listTrainers(2)).resolves.toEqual([
      expect.objectContaining({ id: 9, name: 'مدرب فرع B', branchId: 2 }),
    ]);
  });

  it('returns a flat classes list plus the audience buckets for Flutter', async () => {
    prisma.club_classes.findMany.mockResolvedValue([{
      id: 12,
      class_name: 'لياقة سيدات',
      description: null,
      audience: 'women',
      class_date: '2099-08-26',
      start_time: '18:00',
      end_time: '19:00',
      trainer: { name: 'مدربة حقيقية' },
      hall: { name: 'قاعة B' },
      max_capacity: 20,
      enrollments: [{ member_id: 46 }],
      price: 50,
      status: 'scheduled',
    }]);

    await expect(service.listClasses(2, 46, 'women')).resolves.toEqual(
      expect.objectContaining({
        total: 1,
        appliedAudience: 'women',
        classes: [expect.objectContaining({ id: 12, isEnrolled: true })],
      }),
    );
  });
});
