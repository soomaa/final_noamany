import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { PATH_METADATA, GUARDS_METADATA } from '@nestjs/common/constants';
import { MemberLegacyApiController } from './member-legacy-api.controller';
import { MemberJwtAuthGuard } from './guards/member-jwt-auth.guard';
import { MemberLegacyApiService } from './member-legacy-api.service';

describe('MemberLegacyApiService', () => {
  const auth = { login: jest.fn(), changePassword: jest.fn() };
  const member = {
    getProfile: jest.fn(), getPrivacyPolicy: jest.fn(), createInvitation: jest.fn(),
    listInbodyHistory: jest.fn(), listSubscriptions: jest.fn(), listFreezes: jest.fn(),
    listPoints: jest.fn(), listPackages: jest.fn(), listTrainers: jest.fn(), listClasses: jest.fn(),
  };
  const app = { getAbout: jest.fn(), listOffers: jest.fn(), listExerciseCategories: jest.fn(), listExercises: jest.fn(), listNews: jest.fn() };
  const prisma = {
    club_members: { findFirst: jest.fn() },
    club_private_packages: { findMany: jest.fn() },
    club_locker_subscription_types: { findMany: jest.fn() },
    club_locker_subscriptions: { findMany: jest.fn() },
    am_offers: { findFirst: jest.fn() },
    settings_payment_methods: { findMany: jest.fn() },
  };
  const portal = { products: jest.fn(), product: jest.fn(), validateCoupon: jest.fn(), createOrder: jest.fn() };
  const service = new MemberLegacyApiService(auth as never, member as never, app as never, prisma as never, portal as never);

  beforeEach(() => jest.clearAllMocks());

  it('logs a member in from phone and user_pass with the legacy token names', async () => {
    auth.login.mockResolvedValue({
      accessToken: 'member-token', refreshToken: 'member-refresh',
      user: { memberId: 9, branchId: 2, type: 'member' }, message: 'تم تسجيل الدخول بنجاح', mustChangePassword: false,
    });

    await expect(service.login({ phone: '01000000000', user_pass: 'secret' })).resolves.toEqual({
      status: 200, message: 'تم تسجيل الدخول بنجاح', logout_option: 1,
      data: { access_token: 'member-token', refresh_token: 'member-refresh', member_id: '9', branch_id: '2', account_type: 'member', must_change_password: false },
    });
  });

  it('uses the JWT member instead of posted member_id for InBody', async () => {
    member.listInbodyHistory.mockResolvedValue([]);
    await service.dispatch({ sub: 1, memberId: 9, branchId: 2, type: 'member', phone: '', name: null }, 'All_Inbody', { member_id: 88 });
    expect(member.listInbodyHistory).toHaveBeenCalledWith(9);
  });

  it('uses the authenticated member identity when creating a store order', async () => {
    member.getProfile.mockResolvedValue({ fullName: 'عضو اختبار', phone: '01000000000' });
    portal.createOrder.mockResolvedValue({ success: true, orderId: 44 });

    await service.dispatch(
      { sub: 1, memberId: 9, branchId: 2, type: 'member', phone: '', name: null },
      'process_order',
      { governorate: 'القاهرة', city_street: 'مدينة نصر', items: JSON.stringify([{ product_id: 5, quantity: 2 }]) },
    );

    expect(portal.createOrder).toHaveBeenCalledWith(expect.objectContaining({
      fullName: 'عضو اختبار', phone: '01000000000',
      items: [{ productId: 5, quantity: 2 }],
    }), undefined, undefined);
  });

  it('returns only published news of the requested member-news type', async () => {
    app.listNews.mockResolvedValue({ data: [
      { id: 1, newsType: 'nutrition', title: 'تغذية' },
      { id: 2, newsType: 'exercises', title: 'تمارين' },
    ] });

    const result = await service.dispatch(
      { sub: 1, memberId: 9, branchId: 2, type: 'member', phone: '', name: null },
      'All_News', { news_type: 'exercises' },
    );

    expect(result).toMatchObject({ status: 200, data: [{ id: 2, newsType: 'exercises' }] });
    expect(app.listNews).toHaveBeenCalledWith(expect.objectContaining({ isPublished: true }));
  });

  it('passes a requested exercise category to the active exercise listing', async () => {
    app.listExercises.mockResolvedValue({ data: [] });
    await service.dispatch(
      { sub: 1, memberId: 9, branchId: 2, type: 'member', phone: '', name: null },
      'Exercises_By_Category', { category_id: 7 },
    );
    expect(app.listExercises).toHaveBeenCalledWith(expect.objectContaining({ categoryId: 7, isActive: true }));
  });

  it('calculates a moderate weight-loss calorie target from the member app form', async () => {
    const result = await service.dispatch(
      { sub: 1, memberId: 9, branchId: 2, type: 'member', phone: '', name: null },
      'calculate_calories',
      {
        gender: 'male', age: 25, height_cm: 175, current_weight_kg: 80,
        target_weight_kg: 75, activity_level: 'moderate', goal: 'lose_weight_build_muscle',
      },
    );

    expect(result).toMatchObject({
      status: 200,
      data: {
        bmr: 1774,
        maintenanceCalories: 2749,
        targetCalories: 2249,
        goal: 'lose_weight_build_muscle',
        macros: {
          protein: { grams: 160, calories: 640, percent: 28 },
          fat: { grams: 62, calories: 558, percent: 25 },
          carbohydrates: { grams: 263, calories: 1051, percent: 47 },
        },
      },
    });
  });

  it('rejects a calorie calculation when age is outside the supported range', async () => {
    const result = await service.dispatch(
      { sub: 1, memberId: 9, branchId: 2, type: 'member', phone: '', name: null },
      'calculate_calories',
      {
        gender: 'female', age: 12, height_cm: 165, current_weight_kg: 60,
        target_weight_kg: 58, activity_level: 'light', goal: 'lose_weight',
      },
    );

    expect(result).toMatchObject({ status: 400, message: 'العمر يجب أن يكون بين 13 و100 سنة', data: null });
  });

  it('returns only active payment methods to the member app', async () => {
    prisma.settings_payment_methods.findMany.mockResolvedValue([
      { id: 1, name: 'فودافون كاش', number: '01000000000', username: 'wallet', image: '/wallet.png', is_active: true },
      { id: 2, name: 'طريقة متوقفة', number: '01100000000', username: null, image: null, is_active: false },
    ]);

    const result = await service.dispatch(
      { sub: 1, memberId: 9, branchId: 2, type: 'member', phone: '', name: null },
      'payment_methods',
      {},
    );

    expect(result).toMatchObject({
      status: 200,
      data: [{ id: 1, name: 'فودافون كاش', number: '01000000000', username: 'wallet', image: '/wallet.png' }],
    });
  });

  it('returns all three package categories only for the selected guest branch', async () => {
    member.listPackages.mockResolvedValue([{ id: 11, name: 'أساسي الفرع' }]);
    prisma.club_private_packages.findMany.mockResolvedValue([
      { id: 21, name: 'برايفت الفرع', kind: 'subscription', price: 500, duration_days: 30, sessions_count: 8, branches: [{ branch_id: 7 }] },
    ]);
    prisma.club_locker_subscription_types.findMany.mockResolvedValue([
      { id: 31, name: 'لوكر الفرع', meta_value: 150, days: 30, has_stop: false, stop_days: null },
    ]);

    const result = await service.dispatchPublic('Subs_List', { branch_id: '7' });

    expect(member.listPackages).toHaveBeenCalledWith(7);
    expect(prisma.club_private_packages.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ branches: { some: { branch_id: 7 } } }),
    }));
    expect(prisma.club_locker_subscription_types.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { is_active: true, OR: [{ branch_id: 7 }, { branch_id: null }] },
    }));
    expect(result).toMatchObject({ status: 200, data: { basic: [{ id: 11 }], private: [{ id: 21 }], locker: [{ id: 31 }] } });
  });

  it('returns guest subscription tab counts for the selected branch', async () => {
    member.listPackages.mockResolvedValue([{ id: 11 }]);
    prisma.club_private_packages.findMany.mockResolvedValue([{ id: 21, branches: [] }]);
    prisma.club_locker_subscription_types.findMany.mockResolvedValue([{ id: 31 }]);

    const result = await service.dispatchPublic('get_subscriptions_tabs', { branch_id: '7' });

    expect(result).toMatchObject({
      status: 200,
      data: [
        { key: 'basic', count: 1 },
        { key: 'private', count: 1 },
        { key: 'locker', count: 1 },
      ],
    });
  });

  it('always uses the signed-in member branch instead of a posted branch', async () => {
    member.listPackages.mockResolvedValue([]);
    prisma.club_private_packages.findMany.mockResolvedValue([]);
    prisma.club_locker_subscription_types.findMany.mockResolvedValue([]);

    await service.dispatchPublic('Subs_List', { branch_id: '99' }, 7);

    expect(member.listPackages).toHaveBeenCalledWith(7);
    expect(prisma.club_locker_subscription_types.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { is_active: true, OR: [{ branch_id: 7 }, { branch_id: null }] },
    }));
  });

  it.each([
    'getProfile', 'getAppinfo', 'getAppPolicy', 'update_pass', 'Add_invitation',
    'All_Inbody', 'All_Captains', 'All_Tmareen', 'All_Cats', 'Exercises_By_Category',
    'All_Offers', 'Offer_Details', 'News_Types', 'All_News', 'News_Details',
    'Subs_List', 'get_subscriptions_tabs', 'Basic_Subscription_Details',
    'Private_Subscription_Details', 'Locker_Subscription_Details', 'My_subs',
    'get_member_stop_details', 'get_member_points_history', 'Get_Classes',
    'Captain_Details', 'store', 'store_products', 'products', 'product_detail',
    'validate_coupon_code', 'process_order',
  ])('dispatches %s successfully with isolated dependencies', async (action) => {
    member.getProfile.mockResolvedValue({ fullName: 'Test member', phone: '01000000000' });
    member.listPackages.mockResolvedValue([{ id: 1 }]);
    member.listTrainers.mockResolvedValue([{ id: 1 }]);
    member.listSubscriptions.mockResolvedValue({ subscriptions: [] });
    app.listExercises.mockResolvedValue({ data: [] });
    app.listExerciseCategories.mockResolvedValue({ data: [] });
    app.listOffers.mockResolvedValue({ data: [] });
    app.listNews.mockResolvedValue({ data: [{ id: 1, newsType: 'nutrition' }] });
    prisma.club_private_packages.findMany.mockResolvedValue([{ id: 1, branches: [] }]);
    prisma.club_locker_subscription_types.findMany.mockResolvedValue([{ id: 1 }]);
    prisma.club_locker_subscriptions.findMany.mockResolvedValue([]);
    prisma.am_offers.findFirst.mockResolvedValue({ id: 1 });
    const result = await service.dispatch(
      { sub: 1, memberId: 9, branchId: 2, type: 'member', phone: '', name: null },
      action,
      { id: 1, category_id: 1, recipient_name: 'Guest', phone: '01000000001',
        current_password: 'old-password', new_password: 'new-password',
        governorate: 'Cairo', city_street: 'Test address', coupon_code: 'TEST',
        items: [{ product_id: 1, quantity: 1 }] },
    );
    expect(result.status).toBe(200);
  });

  it('keeps the exact root route and member guards', () => {
    expect(Reflect.getMetadata(PATH_METADATA, MemberLegacyApiController)).toBe('Api/members');
    for (const handler of ['dispatch', 'logout'] as const) {
      expect(Reflect.getMetadata(GUARDS_METADATA, MemberLegacyApiController.prototype[handler])).toContain(MemberJwtAuthGuard);
    }
  });

  it('rejects missing login fields without calling authentication', async () => {
    expect(await service.login({})).toMatchObject({ status: 400, logout_option: 0 });
    expect(auth.login).not.toHaveBeenCalled();
  });

  it('preserves the error envelope', async () => {
    expect(await service.legacy(async () => { throw new UnauthorizedException(); })).toMatchObject({ status: 401, data: null });
    expect(await service.legacy(async () => { throw new BadRequestException(); })).toMatchObject({ status: 400, data: null });
  });

  it('returns the logout envelope', async () => {
    expect(await service.logout()).toMatchObject({ status: 200, data: { logged_out: true } });
  });
});
