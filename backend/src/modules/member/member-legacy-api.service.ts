import { BadRequestException, HttpException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { MemberJwtUser } from '../../common/types/member-jwt-user';
import { AppManagementService } from '../app-management/app-management.service';
import { PublicPortalService } from '../public-portal/public-portal.service';
import { MemberAuthService } from './member-auth.service';
import { MemberService } from './member.service';

type Input = Record<string, unknown>;

@Injectable()
export class MemberLegacyApiService {
  constructor(
    private readonly auth: MemberAuthService,
    private readonly member: MemberService,
    private readonly app: AppManagementService,
    private readonly prisma: PrismaService,
    private readonly portal: PublicPortalService,
  ) {}

  async legacy<T>(action: () => Promise<T>, message = 'تمت العملية بنجاح') {
    try {
      return { status: 200, message, data: await action() };
    } catch (error) {
      if (error instanceof HttpException) {
        const response = error.getResponse();
        const errorMessage = typeof response === 'string'
          ? response
          : Array.isArray((response as { message?: unknown }).message)
            ? (response as { message: string[] }).message.join(' . ')
            : String((response as { message?: unknown }).message ?? error.message);
        return { status: error.getStatus() === 401 ? 401 : 400, message: errorMessage, data: null };
      }
      throw error;
    }
  }

  async login(input: Input) {
    const phone = this.text(input.phone ?? input.username);
    const password = this.text(input.user_pass ?? input.password);
    if (!phone || !password) return { status: 400, message: 'تأكد من إدخال رقم الجوال وكلمة المرور', logout_option: 0, data: null };
    try {
      const result = await this.auth.login(phone, password);
      return {
        status: 200,
        message: result.message,
        logout_option: 1,
        data: {
          access_token: result.accessToken,
          refresh_token: result.refreshToken,
          member_id: String(result.user.memberId),
          branch_id: String(result.user.branchId),
          account_type: 'member',
          must_change_password: result.mustChangePassword,
        },
      };
    } catch (error) {
      if (error instanceof HttpException) {
        const response = error.getResponse();
        const message = typeof response === 'string' ? response : String((response as { message?: unknown }).message ?? error.message);
        return { status: 400, message, logout_option: 0, data: null };
      }
      throw error;
    }
  }

  async logout() {
    return { status: 200, message: 'تم تسجيل الخروج بنجاح', data: { logged_out: true } };
  }

  dispatch(user: MemberJwtUser, action: string, input: Input, paymentProof?: Express.Multer.File) {
    const operations: Record<string, () => Promise<unknown>> = {
      getProfile: () => this.member.getProfile(user.memberId),
      getAppinfo: () => this.app.getAbout(),
      getAppPolicy: () => this.member.getPrivacyPolicy(),
      update_pass: () => this.auth.changePassword(user.sub, this.requiredText(input.current_password ?? input.currentPassword), this.requiredText(input.new_password ?? input.newPassword ?? input.user_pass)),
      Add_invitation: () => this.member.createInvitation(user, {
        recipientName: this.requiredText(input.recipient_name ?? input.recipientName ?? input.name),
        recipientPhone: this.requiredText(input.recipient_phone ?? input.recipientPhone ?? input.phone),
        recipientEmail: this.optionalText(input.recipient_email ?? input.recipientEmail ?? input.email),
      }),
      All_Inbody: () => this.member.listInbodyHistory(user.memberId),
      All_Captains: () => this.member.listTrainers(user.branchId),
      All_Tmareen: () => this.exercises(this.optionalId(input.category_id ?? input.categoryId)),
      All_Cats: async () => (await this.app.listExerciseCategories({ page: 1, pageSize: 100, isActive: true } as never)).data,
      Exercises_By_Category: () => this.exercises(this.requiredId(input.category_id ?? input.categoryId)),
      All_Offers: async () => (await this.app.listOffers({ page: 1, pageSize: 100, isActive: true } as never)).data,
      Offer_Details: () => this.offerDetail(this.requiredId(input.offer_id ?? input.id)),
      News_Types: () => Promise.resolve(this.newsTypes()),
      All_News: () => this.memberNews(this.optionalText(input.news_type ?? input.newsType ?? input.type)),
      News_Details: () => this.newsDetail(this.requiredId(input.news_id ?? input.id)),
      Subs_List: () => this.catalog(user.branchId),
      get_subscriptions_tabs: () => this.subscriptionTabs(user.branchId),
      Basic_Subscription_Details: () => this.packageDetail(user.branchId, 'basic', this.requiredId(input.subscription_id ?? input.id)),
      Private_Subscription_Details: () => this.packageDetail(user.branchId, 'private', this.requiredId(input.subscription_id ?? input.id)),
      Locker_Subscription_Details: () => this.packageDetail(user.branchId, 'locker', this.requiredId(input.subscription_id ?? input.id)),
      My_subs: () => this.mySubscriptions(user.memberId),
      get_member_stop_details: () => this.member.listFreezes(user.memberId),
      get_member_points_history: () => this.member.listPoints(user.memberId),
      Get_Classes: () => this.member.listClasses(user.branchId, user.memberId, this.optionalText(input.audience) ?? 'all'),
      Captain_Details: () => this.trainerDetail(user.branchId, this.requiredId(input.trainer_id ?? input.id)),
      store: () => this.portal.products(),
      store_products: () => this.portal.products(),
      products: () => this.portal.products(),
      product_detail: () => this.portal.product(this.requiredId(input.product_id ?? input.id)),
      validate_coupon_code: () => this.portal.validateCoupon({
        code: this.requiredText(input.code ?? input.coupon_code), items: this.storeItems(input.items),
      }),
      process_order: () => this.createStoreOrder(user.memberId, input, paymentProof),
      calculate_calories: () => this.calculateCalories(input),
      payment_methods: () => this.paymentMethods(),
    };
    const operation = operations[action];
    if (!operation) return this.legacy(async () => { throw new BadRequestException(`مسار العضو غير مدعوم: ${action}`); });
    return this.legacy(operation, action.startsWith('All_') || action.startsWith('get_') ? 'تم العثور على نتائج' : undefined);
  }

  /**
   * Guest/visitor routes — no member token required.
   * For actions that need branchId, pass ?branch_id=X or defaults to branch 1.
   */
  dispatchPublic(action: string, input: Input, authenticatedMemberBranchId?: number) {
    // A signed-in member can only browse packages for their own branch. A
    // guest has no assigned branch, so their selected branch is used instead.
    const branchId = authenticatedMemberBranchId ?? this.optionalId(input.branch_id ?? input.branchId) ?? 1;
    const operations: Record<string, () => Promise<unknown>> = {
      All_Offers: async () => (await this.app.listOffers({ page: 1, pageSize: 100, isActive: true } as never)).data,
      All_Captains: () => this.member.listTrainers(branchId),
      Subs_List: () => this.catalog(branchId),
      get_subscriptions_tabs: () => this.subscriptionTabs(branchId),
    };
    const operation = operations[action];
    if (!operation) {
      return this.legacy(async () => { throw new BadRequestException(`هذا المسار لا يدعم وضع الزائر: ${action}`); });
    }
    return this.legacy(operation, 'تم العثور على نتائج');
  }

  private async catalog(branchId: number) {
    const [basic, privatePackages, lockers] = await Promise.all([
      this.member.listPackages(branchId),
      this.prisma.club_private_packages.findMany({
        where: { is_active: true, branches: { some: { branch_id: branchId } } },
        include: { branches: { select: { branch_id: true } } }, orderBy: { name: 'asc' },
      }),
      this.prisma.club_locker_subscription_types.findMany({
        // A null branch is a shared locker plan; otherwise the plan belongs
        // only to the selected/member branch.
        where: { is_active: true, OR: [{ branch_id: branchId }, { branch_id: null }] },
        orderBy: { name: 'asc' },
      }),
    ]);
    return {
      basic,
      private: privatePackages.map((row) => ({ id: row.id, name: row.name, kind: row.kind, price: Number(row.price), days: row.duration_days, sessionsCount: row.sessions_count, branchIds: row.branches.map((branch) => branch.branch_id) })),
      locker: lockers.map((row) => ({ id: row.id, name: row.name, price: Number(row.meta_value), days: row.days, hasStop: row.has_stop, stopDays: row.stop_days })),
    };
  }

  private async subscriptionTabs(branchId: number) {
    const catalog = await this.catalog(branchId);
    return [
      { key: 'basic', title: 'الاشتراكات الأساسية', count: catalog.basic.length },
      { key: 'private', title: 'اشتراكات البرايفت', count: catalog.private.length },
      { key: 'locker', title: 'اشتراكات اللوكر', count: catalog.locker.length },
    ];
  }

  private async offerDetail(id: number) {
    const offer = await this.prisma.am_offers.findFirst({ where: { id, is_active: true } });
    if (!offer) throw new NotFoundException('العرض غير موجود أو غير متاح');
    const today = new Date().toISOString().slice(0, 10);
    if ((offer.start_date && offer.start_date > today) || (offer.end_date && offer.end_date < today)) {
      throw new NotFoundException('العرض غير متاح حاليًا');
    }
    return {
      id: offer.id, title: offer.title, description: offer.description, imageUrl: offer.image_url,
      discount: offer.discount == null ? null : Number(offer.discount), startDate: offer.start_date, endDate: offer.end_date,
    };
  }

  private async exercises(categoryId?: number) {
    const result = await this.app.listExercises({ page: 1, pageSize: 100, isActive: true, categoryId } as never);
    return result.data;
  }

  private newsTypes() {
    return [
      { value: 'nutrition', label: 'التغذية' },
      { value: 'championships', label: 'البطولات' },
      { value: 'exercises', label: 'التمارين' },
      { value: 'supplements', label: 'المكملات' },
    ];
  }

  private async memberNews(type?: string) {
    const allowed = new Set(this.newsTypes().map((item) => item.value));
    if (type && !allowed.has(type)) throw new BadRequestException('نوع الخبر غير صحيح');
    const result = await this.app.listNews({ page: 1, pageSize: 100, isPublished: true } as never);
    return type ? result.data.filter((item) => item.newsType === type) : result.data;
  }

  private async newsDetail(id: number) {
    const result = await this.memberNews();
    const news = result.find((item) => item.id === id);
    if (!news) throw new NotFoundException('الخبر غير موجود أو غير منشور');
    return news;
  }

  private async trainerDetail(branchId: number, id: number) {
    const trainer = (await this.member.listTrainers(branchId)).find((item) => item.id === id);
    if (!trainer) throw new NotFoundException('المدرب غير موجود في فرع العضو');
    return trainer;
  }

  private async packageDetail(branchId: number, type: 'basic' | 'private' | 'locker', id: number) {
    const catalog = await this.catalog(branchId);
    const item = catalog[type].find((entry) => entry.id === id);
    if (!item) throw new NotFoundException('الاشتراك غير موجود أو غير متاح لهذا الفرع');
    return { type, ...item };
  }

  private async mySubscriptions(memberId: number) {
    const [subscriptions, lockers] = await Promise.all([
      this.member.listSubscriptions(memberId),
      this.prisma.club_locker_subscriptions.findMany({
        where: { member_id: memberId }, include: { type: { select: { name: true } }, locker: { select: { locker_number: true } } }, orderBy: { id: 'desc' },
      }),
    ]);
    return {
      ...subscriptions,
      lockerSubscriptions: lockers.map((row) => ({ id: row.id, subscriptionNumber: row.subscription_number, type: row.type.name, lockerNumber: row.locker.locker_number, startDate: row.subscription_start_date, endDate: row.subscription_end_date, status: row.status, value: Number(row.subscription_value) })),
    };
  }

  private async createStoreOrder(memberId: number, input: Input, paymentProof?: Express.Multer.File) {
    const profile = await this.member.getProfile(memberId);
    return this.portal.createOrder({
      fullName: profile.fullName,
      phone: profile.phone,
      country: this.optionalText(input.country) ?? 'مصر',
      governorate: this.requiredText(input.governorate),
      cityStreet: this.requiredText(input.city_street ?? input.cityStreet ?? input.address),
      backupPhone: this.optionalText(input.backup_phone ?? input.backupPhone),
      email: this.optionalText(input.email),
      notes: this.optionalText(input.notes),
      couponCode: this.optionalText(input.coupon_code ?? input.couponCode),
      paymentMethod: this.optionalText(input.payment_method ?? input.paymentMethod) ?? 'cod',
      items: this.storeItems(input.items),
    }, undefined, paymentProof);
  }

  private storeItems(value: unknown) {
    let parsed: unknown = value;
    if (typeof value === 'string') {
      try { parsed = JSON.parse(value); } catch { throw new BadRequestException('قائمة منتجات المتجر غير صحيحة'); }
    }
    if (!Array.isArray(parsed) || !parsed.length) throw new BadRequestException('أضف منتجًا واحدًا على الأقل إلى الطلب');
    return parsed.map((item) => {
      if (!item || typeof item !== 'object') throw new BadRequestException('قائمة منتجات المتجر غير صحيحة');
      const entry = item as Input;
      const productId = this.requiredId(entry.product_id ?? entry.productId ?? entry.id);
      const quantity = this.requiredId(entry.quantity ?? 1);
      return { productId, quantity };
    });
  }

  private text(value: unknown) { return value == null ? '' : String(value).trim(); }
  private optionalText(value: unknown) { const result = this.text(value); return result || undefined; }
  private requiredText(value: unknown) { const result = this.text(value); if (!result) throw new BadRequestException('تأكد من إدخال جميع الحقول المطلوبة'); return result; }
  private requiredId(value: unknown) { const id = Number(this.text(value)); if (!Number.isSafeInteger(id) || id < 1) throw new BadRequestException('المعرف غير صحيح'); return id; }
  private optionalId(value: unknown) { return value == null || this.text(value) === '' ? undefined : this.requiredId(value); }

  private async calculateCalories(input: Input) {
    const gender = this.calorieGender(input.gender ?? input.sex);
    const age = this.calorieInteger(input.age, 'العمر');
    if (age < 13 || age > 100) throw new BadRequestException('العمر يجب أن يكون بين 13 و100 سنة');

    const heightCm = this.calorieNumber(input.height_cm ?? input.height ?? input.heightCm, 'الطول');
    if (heightCm < 100 || heightCm > 250) throw new BadRequestException('الطول يجب أن يكون بين 100 و250 سم');
    const currentWeightKg = this.calorieNumber(input.current_weight_kg ?? input.current_weight ?? input.weight ?? input.currentWeightKg, 'الوزن الحالي');
    const targetWeightKg = this.calorieNumber(input.target_weight_kg ?? input.target_weight ?? input.targetWeightKg, 'الوزن المستهدف');
    if (currentWeightKg < 20 || currentWeightKg > 500 || targetWeightKg < 20 || targetWeightKg > 500) {
      throw new BadRequestException('الوزن يجب أن يكون بين 20 و500 كجم');
    }

    const activity = this.calorieActivity(input.activity_level ?? input.activityLevel ?? input.activity);
    const goal = this.calorieGoal(input.goal ?? input.physical_goal ?? input.physicalGoal);

    // Optional workout schedule inputs (shown in the app UI)
    const workoutDaysPerWeek = this.optionalPositiveInt(input.workout_days_per_week ?? input.workoutDaysPerWeek);
    const workoutMinutesPerDay = this.optionalPositiveInt(input.workout_minutes_per_day ?? input.workoutMinutesPerDay);

    const bmrExact = 10 * currentWeightKg + 6.25 * heightCm - 5 * age + (gender === 'male' ? 5 : -161);
    const maintenanceExact = bmrExact * activity.multiplier;
    const minimumCalories = gender === 'male' ? 1500 : 1200;
    const targetExact = goal.adjustment < 0
      ? Math.max(minimumCalories, maintenanceExact + goal.adjustment)
      : maintenanceExact + goal.adjustment;
    const bmr = Math.round(bmrExact);
    const maintenanceCalories = Math.round(maintenanceExact);
    const targetCalories = Math.round(targetExact);

    // General fitness split: preserve lean mass with 2g protein/kg, round fats to whole grams, then allocate remaining calories to carbs.
    const proteinGrams = Math.round(currentWeightKg * 2);
    const proteinCalories = Math.round(proteinGrams * 4);
    const fatGrams = Math.round((targetCalories * 0.25) / 9);
    const fatCalories = fatGrams * 9;
    const carbohydrateCalories = targetCalories - proteinCalories - fatCalories;
    const carbohydrateGrams = Math.round(carbohydrateCalories / 4);
    const macroPercent = (calories: number) => Math.round((calories / targetCalories) * 100);

    // Progress estimates — 7700 kcal ≈ 1 kg of body fat
    const effectiveAdjustment = targetCalories - maintenanceCalories; // actual deficit/surplus after floor clamp
    const weeklyChangeKg = parseFloat(((effectiveAdjustment * 7) / 7700).toFixed(2));
    const weightDelta = Math.abs(targetWeightKg - currentWeightKg);
    const daysToGoal = goal.adjustment === 0 || weightDelta === 0 || weeklyChangeKg === 0
      ? null
      : Math.round((weightDelta / Math.abs(weeklyChangeKg)) * 7);

    return {
      gender,
      age,
      heightCm,
      currentWeightKg,
      targetWeightKg,
      activityLevel: activity.key,
      activityMultiplier: activity.multiplier,
      goal: goal.key,
      bmr,
      maintenanceCalories,
      calorieAdjustment: goal.adjustment,
      targetCalories,
      macros: {
        protein: { grams: proteinGrams, calories: proteinCalories, percent: macroPercent(proteinCalories) },
        fat: { grams: fatGrams, calories: fatCalories, percent: macroPercent(fatCalories) },
        carbohydrates: { grams: carbohydrateGrams, calories: carbohydrateCalories, percent: macroPercent(carbohydrateCalories) },
      },
      progress: {
        weeklyChangeKg,
        daysToGoal,
        ...(workoutDaysPerWeek !== null ? { workoutDaysPerWeek } : {}),
        ...(workoutMinutesPerDay !== null ? { workoutMinutesPerDay } : {}),
      },
      note: 'هذه قيمة تقديرية عامة وليست بديلاً عن خطة غذائية أو متابعة طبية متخصصة.',
    };
  }

  private async paymentMethods() {
    const methods = await this.prisma.settings_payment_methods.findMany({
      where: { is_active: true },
      select: { id: true, name: true, number: true, username: true, image: true, is_active: true },
      orderBy: { id: 'asc' },
    });
    return methods
      .filter((method) => method.is_active)
      .map((method) => ({ id: method.id, name: method.name, number: method.number, username: method.username, image: method.image }));
  }

  private calorieGender(value: unknown): 'male' | 'female' {
    const gender = this.requiredText(value).toLowerCase();
    if (['male', 'man', 'ذكر', 'رجل'].includes(gender)) return 'male';
    if (['female', 'woman', 'أنثى', 'انثى', 'امرأة', 'امراة'].includes(gender)) return 'female';
    throw new BadRequestException('النوع يجب أن يكون male أو female');
  }

  private calorieActivity(value: unknown) {
    const activity = this.requiredText(value).toLowerCase();
    const aliases: Record<string, { key: string; multiplier: number }> = {
      sedentary: { key: 'sedentary', multiplier: 1.2 }, 'قليل النشاط': { key: 'sedentary', multiplier: 1.2 },
      light: { key: 'light', multiplier: 1.375 }, 'نشاط خفيف': { key: 'light', multiplier: 1.375 },
      moderate: { key: 'moderate', multiplier: 1.55 }, 'نشاط متوسط': { key: 'moderate', multiplier: 1.55 },
      active: { key: 'active', multiplier: 1.725 }, 'نشاط عال': { key: 'active', multiplier: 1.725 },
      very_active: { key: 'very_active', multiplier: 1.9 }, 'نشاط عال جدًا': { key: 'very_active', multiplier: 1.9 }, 'نشاط عال جدا': { key: 'very_active', multiplier: 1.9 },
    };
    const result = aliases[activity];
    if (!result) throw new BadRequestException('مستوى النشاط غير صحيح');
    return result;
  }

  private calorieGoal(value: unknown) {
    const goal = this.requiredText(value).toLowerCase();
    const aliases: Record<string, { key: string; adjustment: number }> = {
      lose_weight: { key: 'lose_weight', adjustment: -500 },
      lose_weight_build_muscle: { key: 'lose_weight_build_muscle', adjustment: -500 },
      weight_loss: { key: 'lose_weight', adjustment: -500 },
      'خسارة الوزن': { key: 'lose_weight', adjustment: -500 },
      'خسارة الوزن وبناء العضلات': { key: 'lose_weight_build_muscle', adjustment: -500 },
      maintain_weight: { key: 'maintain_weight', adjustment: 0 },
      maintain: { key: 'maintain_weight', adjustment: 0 },
      'الحفاظ على الوزن': { key: 'maintain_weight', adjustment: 0 },
      gain_weight: { key: 'gain_weight', adjustment: 300 },
      build_muscle: { key: 'gain_weight', adjustment: 300 },
      'زيادة الوزن': { key: 'gain_weight', adjustment: 300 },
      'بناء العضلات': { key: 'gain_weight', adjustment: 300 },
    };
    const result = aliases[goal];
    if (!result) throw new BadRequestException('الهدف البدني غير صحيح');
    return result;
  }

  private calorieNumber(value: unknown, field: string) {
    const number = Number(this.text(value));
    if (!Number.isFinite(number) || number <= 0) throw new BadRequestException(`${field} غير صحيح`);
    return number;
  }

  private calorieInteger(value: unknown, field: string) {
    const number = this.calorieNumber(value, field);
    if (!Number.isInteger(number)) throw new BadRequestException(`${field} غير صحيح`);
    return number;
  }

  /** Returns a positive integer from input or null if the field is absent / falsy. */
  private optionalPositiveInt(value: unknown): number | null {
    if (value == null || value === '' || value === 0 || value === '0') return null;
    const n = Number(value);
    return Number.isInteger(n) && n > 0 ? n : null;
  }
}
