import { PublicPortalService } from './public-portal.service';

describe('PublicPortalService online subscription options', () => {
  it('lists all active assigned plans across branches, including plans without marketing cards', async () => {
    const base = { price: 500, days: 30, is_linked_to_sessions: false, sessions_count: null, invitations_count: null, inbody_count: null, includes_spa: false, spa_count: null, is_for_students: false };
    const prisma = {
      club_subscription_types: { findMany: jest.fn().mockResolvedValue([
        { ...base, id: 1, name: 'عام', branch_id: null, apply_to_all_branches: true, branches: [] },
        { ...base, id: 2, name: 'فرع محدد', branch_id: 3, apply_to_all_branches: false, branches: [] },
        { ...base, id: 3, name: 'عدة فروع', branch_id: null, apply_to_all_branches: false, branches: [{ branch_id: 4 }] },
        { ...base, id: 4, name: 'بدون فرع', branch_id: null, apply_to_all_branches: false, branches: [] },
      ]) },
      tbl_branches: { findMany: jest.fn().mockResolvedValue([{ branch_id: 3, branch_name: 'الجلاء' }, { branch_id: 4, branch_name: 'الاستاد' }]) },
    };
    const service = new PublicPortalService(prisma as never, {} as never, {} as never, {} as never);
    const catalog = await service.subscriptionCatalog();
    expect(catalog.plans.map((plan) => [plan.id, plan.branchIds])).toEqual([[1, [3, 4]], [2, [3]], [3, [4]]]);
    expect(catalog.plans[0]).toMatchObject({ price: 500, allBranches: true });
    expect(catalog.branches).toEqual([{ id: 3, name: 'الجلاء' }, { id: 4, name: 'الاستاد' }]);
    expect(prisma.club_subscription_types.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { is_active: true } }));
  });

  it('returns global and member-branch plans while keeping payment methods global', async () => {
    const prisma = {
      club_members: {
        findFirst: jest.fn().mockResolvedValue({ id: 41, member_code: 'M-41', name: 'أحمد علي', branch_id: 3 }),
      },
      club_subscription_types: {
        findMany: jest.fn().mockResolvedValue([
          { id: 1, name: 'باقة عامة', price: 1000, days: 30, is_linked_to_sessions: false },
          { id: 2, name: 'باقة الجلاء', price: 1200, days: 30, is_linked_to_sessions: false },
        ]),
      },
      settings_payment_methods: {
        findMany: jest.fn().mockResolvedValue([{ id: 2, name: 'أورانج كاش', number: '01258693214', username: null, image: null }]),
      },
      sales_pos_payment_methods: {
        findMany: jest.fn().mockResolvedValue([{ id: 9, name: 'طريقة نقاط بيع مختلفة', icon: null, description: null, base_method: 'card' }]),
      },
    };
    const service = new PublicPortalService(prisma as never, {} as never, {} as never, {} as never);

    await expect(service.onlineSubscriptionOptions({ memberCode: 'M-41', customerName: 'أحمد علي' })).resolves.toEqual({
      branchId: 3,
      plans: [
        { id: 1, name: 'باقة عامة', price: 1000, days: 30, isLinkedToSessions: false },
        { id: 2, name: 'باقة الجلاء', price: 1200, days: 30, isLinkedToSessions: false },
      ],
      paymentMethods: [{ id: 2, name: 'أورانج كاش', number: '01258693214', username: null, image: null, baseMethod: 'transfer' }],
    });

    expect(prisma.club_subscription_types.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        is_active: true,
        OR: [
          { apply_to_all_branches: true },
          { branch_id: { in: [3] } },
          { branches: { some: { branch_id: { in: [3] } } } },
        ],
      },
    }));
    expect(prisma.settings_payment_methods.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { is_active: true },
    }));
  });
});

describe('PublicPortalService online subscription requests', () => {
  it('accepts an active general payment method and records proof-based payment as a transfer', async () => {
    const prisma = {
      club_members: {
        findFirst: jest.fn().mockResolvedValue({ id: 41, member_code: 'M-41', name: 'أحمد علي', branch_id: 3 }),
      },
      club_subscription_types: {
        findFirst: jest.fn().mockResolvedValue({
          id: 12, name: 'باقة الجلاء', price: 1200, days: 30, is_linked_to_sessions: false,
          branch_id: 3, apply_to_all_branches: false, branches: [],
        }),
      },
      settings_payment_methods: {
        findFirst: jest.fn().mockResolvedValue({ id: 2, name: 'أورانج كاش' }),
      },
      sales_pos_payment_methods: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      $executeRawUnsafe: jest.fn().mockResolvedValue(1),
    };
    const uploads = { store: jest.fn().mockReturnValue({ path: 'club/online-subscription-proofs/proof.png' }) };
    const service = new PublicPortalService(prisma as never, {} as never, {} as never, uploads as never);

    await expect(service.createOnlineSubscriptionRequest({
      subscriptionTypeId: 12,
      paymentMethodId: 2,
      memberCode: 'M-41',
      customerName: 'أحمد علي',
      startDate: '2026-09-27',
      notes: 'إثبات دفع أورانج كاش',
    }, { originalname: 'proof.png' } as Express.Multer.File)).resolves.toEqual({
      success: true,
      message: 'تم إرسال طلب الاشتراك بنجاح',
    });

    expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO online_subscription_requests'),
      41, 'M-41', 'أحمد علي', 3, 12, 'باقة الجلاء', 1200, 30,
      '2026-09-27', '2026-10-27', 2, 'أورانج كاش', 'transfer',
      'club/online-subscription-proofs/proof.png', 'إثبات دفع أورانج كاش',
    );
  });
});
