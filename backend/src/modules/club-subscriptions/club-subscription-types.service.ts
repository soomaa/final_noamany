import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { JwtUser } from '../../common/types/jwt-user';
import {
  buildDefaultSessionPriceMatrix,
  toNum,
} from './club-subscription.utils';
import {
  isSubscriptionTypeAvailableAtBranch,
  subscriptionTypeBranchWhere,
} from './subscription-type-branch-scope';
import {
  isMissingBranchPricesTableError,
  loadSubscriptionTypeBranchPrices,
} from './club-subscription-branch-prices.loader';
import { parsePackageCategories } from './package-categories';
import { ClubPackageCategoriesService } from './club-package-categories.service';
import { OfferNotificationsService } from './offer-notifications.service';

type SessionPriceRow = { sessions_count: number; price: unknown };

type TypeRow = {
  id: number;
  source_subscription_type_id?: number | null;
  name: string;
  branch_id: number | null;
  apply_to_all_branches: boolean;
  price: unknown;
  days: number;
  is_part_of_target: boolean;
  invitations_count: number | null;
  inbody_count: number | null;
  is_special_offer: boolean;
  is_for_students: boolean;
  show_in_app: boolean;
  notify_customers: boolean;
  notify_on_expiry: boolean;
  wallet_points: number | null;
  offer_validity: string | null;
  is_linked_to_sessions: boolean;
  sessions_count: number | null;
  allow_multiple_daily_entries: boolean;
  is_linked_to_freeze: boolean;
  freeze_days: number | null;
  freeze_total_days: number | null;
  includes_spa: boolean;
  spa_count: number | null;
  is_active: boolean;
  promo_enabled: boolean;
  promo_price: unknown;
  promo_discount_percent: unknown;
  promo_image: string | null;
  promo_ends_at: Date | null;
  promo_marketing_message: string | null;
  app_notes: string | null;
  branches?: { branch_id: number }[];
  class_types?: {
    class_type_id: number;
    class_type: { id: number; name: string; color: string };
  }[];
  session_prices?: SessionPriceRow[];
  branch_prices?: { branch_id: number; price: unknown }[];
  categories?: { category: string }[];
};

@Injectable()
export class ClubSubscriptionTypesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branchScope: BranchScopeService,
    private readonly packageCategories: ClubPackageCategoriesService,
    private readonly offers: OfferNotificationsService,
  ) {}

  private assertBranchSelectionAccess(
    user: JwtUser,
    selection: { applyToAllBranches: boolean; branchIds: number[] } | null,
    legacyBranchId?: unknown,
  ) {
    if (selection?.applyToAllBranches && user.level !== 1) {
      throw new ForbiddenException('إنشاء خطة متاحة لكل الفروع مسموح لمدير النظام فقط');
    }
    const ids = selection
      ? selection.branchIds
      : legacyBranchId != null && legacyBranchId !== ''
        ? [Number(legacyBranchId)]
        : [];
    if (ids.some((id) => !this.branchScope.isBranchAllowed(user, id))) {
      throw new ForbiddenException('لا تملك صلاحية إدارة خطط فرع آخر');
    }
  }

  private map(r: TypeRow) {
    const branchIds = r.branches?.map((b) => b.branch_id) ?? (r.branch_id != null ? [r.branch_id] : []);
    const sessionPrices = (r.session_prices ?? [])
      .slice()
      .sort((a, b) => a.sessions_count - b.sessions_count)
      .map((row) => ({
        sessionsCount: row.sessions_count,
        price: toNum(row.price),
      }));
    const branchPrices = (r.branch_prices ?? []).map((row) => ({
      branchId: row.branch_id,
      price: toNum(row.price),
    }));
    return {
      id: r.id,
      sourceSubscriptionTypeId: r.source_subscription_type_id ?? null,
      name: r.name,
      branchId: r.branch_id,
      applyToAllBranches: r.apply_to_all_branches,
      branchIds,
      price: toNum(r.price),
      branchPrices,
      days: r.days,
      isPartOfTarget: r.is_part_of_target,
      invitationsCount: r.invitations_count,
      inbodyCount: r.inbody_count,
      isSpecialOffer: r.is_special_offer,
      isForStudents: r.is_for_students,
      showInApp: r.show_in_app,
      notifyCustomers: r.notify_customers,
      notifyOnExpiry: r.notify_on_expiry,
      walletPoints: r.wallet_points,
      offerValidity: r.offer_validity,
      isLinkedToSessions: r.is_linked_to_sessions,
      sessionsCount: r.sessions_count,
      sessionPrices: r.is_linked_to_sessions ? sessionPrices : [],
      allowMultipleDailyEntries: r.allow_multiple_daily_entries,
      isLinkedToFreeze: r.is_linked_to_freeze,
      freezeDays: r.freeze_days,
      freezeTotalDays: r.freeze_total_days,
      includesSpa: r.includes_spa,
      spaCount: r.spa_count,
      isActive: r.is_active,
      promoEnabled: r.promo_enabled,
      promoPrice: r.promo_price != null ? toNum(r.promo_price) : null,
      promoDiscountPercent: r.promo_discount_percent != null ? toNum(r.promo_discount_percent) : null,
      promoImage: r.promo_image,
      promoEndsAt: r.promo_ends_at,
      promoMarketingMessage: r.promo_marketing_message,
      appNotes: r.app_notes,
      categories: r.categories?.map((x) => x.category) ?? [],
      classTypeIds: r.class_types?.map((x) => x.class_type_id) ?? [],
      classTypes: r.class_types?.map((x) => x.class_type) ?? [],
    };
  }

  private promoMessage(value: unknown): string | null {
    if (value == null) return null;
    const message = String(value).trim();
    if (!message) return null;
    if (message.length > 160) throw new BadRequestException('رسالة العرض يجب ألا تزيد عن 160 حرفًا');
    return message;
  }

  /** Member-facing package notes; blank is stored as NULL so the app has one "no notes" case. */
  private parseAppNotes(value: unknown): string | null {
    if (value == null) return null;
    const notes = String(value).trim();
    if (!notes) return null;
    if (notes.length > 2000) {
      throw new BadRequestException('ملاحظات الباقة يجب ألا تزيد عن 2000 حرف');
    }
    return notes;
  }

  private async parseCategories(body: Record<string, unknown>): Promise<string[] | null> {
    if (body.categories === undefined) return null;
    return parsePackageCategories(body, await this.packageCategories.validKeys());
  }

  /**
   * Replaces the package's section tags wholesale. `categories == null` means the caller
   * never sent the field, so the existing tagging is left untouched.
   */
  private async syncCategories(typeId: number, categories: string[] | null) {
    if (categories == null) return;
    await this.prisma.club_subscription_type_categories.deleteMany({
      where: { subscription_type_id: typeId },
    });
    if (!categories.length) return;
    await this.prisma.club_subscription_type_categories.createMany({
      data: categories.map((category) => ({ subscription_type_id: typeId, category })),
    });
  }

  /**
   * Per-branch price overrides. `rows == null` means the caller never sent the field.
   * Rows for branches the package is not assigned to are dropped (for a global package every
   * real branch is allowed).
   */
  private async syncBranchPrices(
    typeId: number,
    applyToAllBranches: boolean,
    assignedBranchIds: number[],
    rows: Array<{ branchId: number; price: number }> | null,
  ) {
    if (rows == null) return;
    const allowed = new Set(applyToAllBranches ? rows.map((row) => row.branchId) : assignedBranchIds);
    const filtered = rows.filter((row) => allowed.has(row.branchId));
    if (filtered.length) {
      const count = await this.prisma.tbl_branches.count({
        where: { branch_id: { in: filtered.map((row) => row.branchId) } },
      });
      if (count !== filtered.length) {
        throw new BadRequestException('يوجد فرع غير صالح في أسعار الفروع');
      }
    }
    try {
      await this.prisma.club_subscription_type_branch_prices.deleteMany({
        where: { subscription_type_id: typeId },
      });
      if (filtered.length) {
        await this.prisma.club_subscription_type_branch_prices.createMany({
          data: filtered.map((row) => ({
            subscription_type_id: typeId,
            branch_id: row.branchId,
            price: row.price,
          })),
        });
      }
    } catch (error) {
      if (!isMissingBranchPricesTableError(error)) throw error;
    }
  }

  private parseBranchPrices(body: Record<string, unknown>): Array<{ branchId: number; price: number }> | null {
    if (body.branchPrices === undefined) return null;
    if (!Array.isArray(body.branchPrices)) {
      throw new BadRequestException('أسعار الفروع غير صالحة');
    }
    const rows: Array<{ branchId: number; price: number }> = [];
    const seen = new Set<number>();
    for (const raw of body.branchPrices) {
      if (!raw || typeof raw !== 'object') continue;
      const branchId = Number((raw as { branchId?: unknown }).branchId);
      const price = Number((raw as { price?: unknown }).price);
      if (!Number.isInteger(branchId) || branchId <= 0) continue;
      if (!Number.isFinite(price) || price < 0) {
        throw new BadRequestException('سعر الفرع غير صالح');
      }
      if (seen.has(branchId)) continue;
      seen.add(branchId);
      rows.push({ branchId, price });
    }
    return rows;
  }

  private parseBranchSelection(body: Record<string, unknown>) {
    const applyToAllBranches = Boolean(body.applyToAllBranches);
    const rawIds = Array.isArray(body.branchIds) ? body.branchIds : [];
    const branchIds = [...new Set(rawIds.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0))];
    if (!applyToAllBranches && branchIds.length === 0) {
      throw new BadRequestException('اختر فرعاً واحداً على الأقل أو حدّد كل الفروع');
    }
    return {
      applyToAllBranches,
      branchIds,
      branchId: applyToAllBranches ? null : branchIds[0] ?? null,
    };
  }

  private async syncBranches(typeId: number, applyToAllBranches: boolean, branchIds: number[]) {
    await this.prisma.club_subscription_type_branches.deleteMany({
      where: { subscription_type_id: typeId },
    });
    if (!applyToAllBranches && branchIds.length > 0) {
      await this.prisma.club_subscription_type_branches.createMany({
        data: branchIds.map((branch_id) => ({ subscription_type_id: typeId, branch_id })),
      });
    }
  }

  private parseClassTypeIds(body: Record<string, unknown>): number[] | null {
    if (body.classTypeIds === undefined) return null;
    return [
      ...new Set(
        (Array.isArray(body.classTypeIds) ? body.classTypeIds : [])
          .map(Number)
          .filter((id) => Number.isInteger(id) && id > 0),
      ),
    ];
  }

  private async syncClassTypes(typeId: number, classTypeIds: number[] | null) {
    if (classTypeIds == null) return;
    if (classTypeIds.length) {
      const count = await this.prisma.club_class_types.count({
        where: { id: { in: classTypeIds }, is_deleted: false, is_active: true },
      });
      if (count !== classTypeIds.length) throw new BadRequestException('يوجد نوع حصة غير صالح');
    }
    await this.prisma.club_subscription_type_classes.deleteMany({
      where: { subscription_type_id: typeId },
    });
    if (classTypeIds.length) {
      await this.prisma.club_subscription_type_classes.createMany({
        data: classTypeIds.map((class_type_id) => ({ subscription_type_id: typeId, class_type_id })),
      });
    }
  }

  private parseSessionPrices(
    body: Record<string, unknown>,
    isLinkedToSessions: boolean,
    sessionsCount: number | null,
    packagePrice: number,
  ): Array<{ sessionsCount: number; price: number }> | null {
    if (!isLinkedToSessions) return [];
    if (body.sessionPrices === undefined) return null;
    const max = Math.max(1, sessionsCount ?? 0);
    const raw = Array.isArray(body.sessionPrices) ? body.sessionPrices : [];
    const parsed = raw
      .map((row) => {
        const item = row as { sessionsCount?: unknown; price?: unknown };
        return {
          sessionsCount: Number(item.sessionsCount),
          price: Number(item.price),
        };
      })
      .filter(
        (row) =>
          Number.isInteger(row.sessionsCount) &&
          row.sessionsCount >= 1 &&
          row.sessionsCount <= max &&
          Number.isFinite(row.price) &&
          row.price >= 0,
      );
    const byCount = new Map<number, number>();
    for (const row of parsed) byCount.set(row.sessionsCount, row.price);
    const defaults = buildDefaultSessionPriceMatrix(packagePrice, max);
    return defaults.map((row) => ({
      sessionsCount: row.sessionsCount,
      price: byCount.has(row.sessionsCount) ? byCount.get(row.sessionsCount)! : row.price,
    }));
  }

  private async syncSessionPrices(
    typeId: number,
    rows: Array<{ sessionsCount: number; price: number }> | null,
  ) {
    if (rows == null) return;
    await this.prisma.club_subscription_type_session_prices.deleteMany({
      where: { subscription_type_id: typeId },
    });
    if (!rows.length) return;
    await this.prisma.club_subscription_type_session_prices.createMany({
      data: rows.map((row) => ({
        subscription_type_id: typeId,
        sessions_count: row.sessionsCount,
        price: row.price,
      })),
    });
  }

  private buildData(body: Record<string, unknown>) {
    const branchSelection =
      body.applyToAllBranches !== undefined || body.branchIds !== undefined
        ? this.parseBranchSelection(body)
        : null;

    const isLinkedToSessions = Boolean(body.isLinkedToSessions);
    const sessionsCount = isLinkedToSessions ? Number(body.sessionsCount) : null;
    if (isLinkedToSessions && (!Number.isInteger(sessionsCount) || (sessionsCount ?? 0) < 1)) {
      throw new BadRequestException('عدد الحصص يجب أن يكون رقمًا صحيحًا أكبر من صفر');
    }
    const inbodyCount = body.inbodyCount != null && body.inbodyCount !== ''
      ? Number(body.inbodyCount)
      : null;
    if (inbodyCount != null && (!Number.isInteger(inbodyCount) || inbodyCount < 0)) {
      throw new BadRequestException('عدد خدمات InBody يجب أن يكون رقمًا صحيحًا لا يقل عن صفر');
    }
    const spaCount = body.spaCount != null && body.spaCount !== '' ? Number(body.spaCount) : null;
    if (body.includesSpa === true && (spaCount == null || !Number.isInteger(spaCount) || spaCount < 1)) {
      throw new BadRequestException('عند تضمين SPA يجب إدخال عدد خدمات صحيح أكبر من صفر');
    }
    const freezeTotalDays =
      body.freezeTotalDays != null && body.freezeTotalDays !== '' ? Number(body.freezeTotalDays) : null;
    if (freezeTotalDays != null && (!Number.isInteger(freezeTotalDays) || freezeTotalDays < 0)) {
      throw new BadRequestException('إجمالي أيام التجميد يجب أن يكون رقمًا صحيحًا لا يقل عن صفر');
    }

    const data = {
      ...(body.name != null ? { name: String(body.name) } : {}),
      ...(branchSelection
        ? {
            branch_id: branchSelection.branchId,
            apply_to_all_branches: branchSelection.applyToAllBranches,
          }
        : body.branchId !== undefined
          ? { branch_id: body.branchId != null && body.branchId !== '' ? Number(body.branchId) : null }
          : {}),
      ...(body.price != null ? { price: Number(body.price) } : {}),
      ...(body.days != null ? { days: Number(body.days) } : {}),
      ...(body.isPartOfTarget !== undefined ? { is_part_of_target: Boolean(body.isPartOfTarget) } : {}),
      ...(body.invitationsCount !== undefined
        ? { invitations_count: body.invitationsCount != null && body.invitationsCount !== '' ? Number(body.invitationsCount) : null }
        : {}),
      ...(body.inbodyCount !== undefined
        ? { inbody_count: inbodyCount }
        : {}),
      is_special_offer: false,
      ...(body.isForStudents !== undefined ? { is_for_students: Boolean(body.isForStudents) } : {}),
      ...(body.showInApp !== undefined ? { show_in_app: Boolean(body.showInApp) } : {}),
      ...(body.notifyCustomers !== undefined ? { notify_customers: Boolean(body.notifyCustomers) } : {}),
      ...(body.notifyOnExpiry !== undefined ? { notify_on_expiry: Boolean(body.notifyOnExpiry) } : {}),
      ...(body.walletPoints !== undefined
        ? { wallet_points: body.walletPoints != null && body.walletPoints !== '' ? Number(body.walletPoints) : null }
        : {}),
      ...(body.offerValidity !== undefined ? { offer_validity: body.offerValidity ? String(body.offerValidity) : null } : {}),
      is_linked_to_sessions: isLinkedToSessions,
      sessions_count: sessionsCount,
      ...(body.allowMultipleDailyEntries !== undefined
        ? { allow_multiple_daily_entries: Boolean(body.allowMultipleDailyEntries) }
        : {}),
      ...(body.isLinkedToFreeze !== undefined ? { is_linked_to_freeze: Boolean(body.isLinkedToFreeze) } : {}),
      ...(body.freezeDays !== undefined
        ? { freeze_days: body.freezeDays != null && body.freezeDays !== '' ? Number(body.freezeDays) : null }
        : {}),
      ...(body.freezeTotalDays !== undefined
        ? { freeze_total_days: freezeTotalDays }
        : {}),
      ...(body.includesSpa !== undefined ? { includes_spa: Boolean(body.includesSpa) } : {}),
      ...(body.spaCount !== undefined
        ? { spa_count: spaCount }
        : {}),
      ...(body.isActive !== undefined ? { is_active: Boolean(body.isActive) } : {}),
      ...(body.appNotes !== undefined ? { app_notes: this.parseAppNotes(body.appNotes) } : {}),
    };

    return { data, branchSelection };
  }

  private listInclude() {
    return {
      branches: { select: { branch_id: true } },
      class_types: {
        include: { class_type: { select: { id: true, name: true, color: true } } },
      },
      categories: { select: { category: true } },
      session_prices: {
        select: { sessions_count: true, price: true },
        orderBy: { sessions_count: 'asc' as const },
      },
    } as const;
  }

  async listActive(isSpecialOffer?: string, user?: JwtUser, requestedBranchId?: number) {
    const scopedBranches = this.branchScope.resolveListFilter(user, requestedBranchId ?? null);
    const where: Prisma.club_subscription_typesWhereInput = {
      is_active: true,
      ...subscriptionTypeBranchWhere(scopedBranches),
    };
    if (isSpecialOffer === 'true' || isSpecialOffer === '1') where.is_special_offer = true;
    if (isSpecialOffer === 'false' || isSpecialOffer === '0') where.is_special_offer = false;
    const rows = await this.prisma.club_subscription_types.findMany({
      where,
      orderBy: { name: 'asc' },
      include: this.listInclude(),
    });
    const branchPriceMap = await loadSubscriptionTypeBranchPrices(
      this.prisma,
      rows.map((row) => row.id),
    );
    const visibleRows = scopedBranches?.length === 1
      ? rows.filter((row) => {
          if (row.source_subscription_type_id != null) return true;
          return !rows.some(
            (candidate) =>
              candidate.source_subscription_type_id === row.id &&
              isSubscriptionTypeAvailableAtBranch(candidate, scopedBranches[0]),
          );
        })
      : rows;
    return visibleRows.map((r) =>
      this.map({
        ...r,
        branch_prices: (branchPriceMap.get(r.id) ?? []).map((row) => ({
          branch_id: row.branchId,
          price: row.price,
        })),
      }),
    );
  }

  async findOne(id: number, user?: JwtUser) {
    const row = await this.prisma.club_subscription_types.findUnique({
      where: { id },
      include: this.listInclude(),
    });
    if (!row) throw new NotFoundException('نوع الاشتراك غير موجود');
    const branchPriceMap = await loadSubscriptionTypeBranchPrices(this.prisma, [row.id]);
    const mapped = this.map({
      ...row,
      branch_prices: (branchPriceMap.get(row.id) ?? []).map((priceRow) => ({
        branch_id: priceRow.branchId,
        price: priceRow.price,
      })),
    });
    const allowed = this.branchScope.allowedBranchIds(user);
    if (
      allowed !== null &&
      !allowed.some((branchId) => isSubscriptionTypeAvailableAtBranch(row, branchId))
    ) {
      throw new ForbiddenException('لا تملك صلاحية الوصول لخطة فرع آخر');
    }
    return mapped;
  }

  async create(
    body: Record<string, unknown>,
    user: JwtUser,
    sourceSubscriptionTypeId?: number,
    announce = true,
  ) {
    const { data, branchSelection } = this.buildData(body);
    if (!branchSelection && (body.branchId == null || body.branchId === '')) {
      throw new BadRequestException('يجب تحديد فرع الخطة أو اختيار إتاحتها لكل الفروع');
    }
    this.assertBranchSelectionAccess(user, branchSelection, body.branchId);
    const isLinked = Boolean(body.isLinkedToSessions);
    const sessionsCount = isLinked ? Number(body.sessionsCount) : null;
    const packagePrice = Number(body.price);
    const sessionPrices =
      this.parseSessionPrices(body, isLinked, sessionsCount, packagePrice) ??
      (isLinked ? buildDefaultSessionPriceMatrix(packagePrice, sessionsCount ?? 0) : []);
    // Validated before the insert so an unknown section never leaves a half-created package.
    const categories = await this.parseCategories(body);
    const branchPrices = this.parseBranchPrices(body);

    const row = await this.prisma.club_subscription_types.create({
      data: {
        source_subscription_type_id: sourceSubscriptionTypeId ?? null,
        name: String(body.name),
        branch_id: branchSelection?.branchId ?? (body.branchId != null && body.branchId !== '' ? Number(body.branchId) : null),
        apply_to_all_branches: branchSelection?.applyToAllBranches ?? false,
        price: packagePrice,
        days: Number(body.days),
        is_part_of_target: Boolean(body.isPartOfTarget),
        invitations_count:
          body.invitationsCount != null && body.invitationsCount !== '' ? Number(body.invitationsCount) : null,
        inbody_count: body.inbodyCount != null && body.inbodyCount !== '' ? Number(body.inbodyCount) : null,
        is_special_offer: false,
        is_for_students: Boolean(body.isForStudents),
        // Packages are member-app visible unless the caller explicitly opts out.
        show_in_app: body.showInApp !== undefined ? Boolean(body.showInApp) : true,
        notify_customers: Boolean(body.notifyCustomers),
        notify_on_expiry: Boolean(body.notifyOnExpiry),
        wallet_points: body.walletPoints != null && body.walletPoints !== '' ? Number(body.walletPoints) : null,
        offer_validity: body.offerValidity ? String(body.offerValidity) : null,
        is_linked_to_sessions: isLinked,
        sessions_count: isLinked ? sessionsCount : null,
        allow_multiple_daily_entries: Boolean(body.allowMultipleDailyEntries),
        is_linked_to_freeze: Boolean(body.isLinkedToFreeze),
        freeze_days: body.freezeDays != null && body.freezeDays !== '' ? Number(body.freezeDays) : null,
        freeze_total_days:
          body.freezeTotalDays != null && body.freezeTotalDays !== '' ? Number(body.freezeTotalDays) : null,
        includes_spa: Boolean(body.includesSpa),
        spa_count: body.spaCount != null && body.spaCount !== '' ? Number(body.spaCount) : null,
        is_active: body.isActive !== false,
        app_notes: this.parseAppNotes(body.appNotes),
      },
    });

    if (branchSelection) {
      await this.syncBranches(row.id, branchSelection.applyToAllBranches, branchSelection.branchIds);
    }
    await this.syncClassTypes(row.id, []);
    await this.syncSessionPrices(row.id, sessionPrices);
    await this.syncCategories(row.id, categories ?? []);
    await this.syncBranchPrices(
      row.id,
      branchSelection?.applyToAllBranches ?? false,
      branchSelection?.branchIds ??
        (row.branch_id != null ? [row.branch_id] : []),
      branchPrices,
    );
    if (announce) await this.announceNewPackage(row.id, user?.sub ?? null);

    return this.findOne(row.id, user);
  }

  /**
   * Every new app-visible package is pushed to the member app automatically — staff no longer
   * tick a "notify customers" box. Best effort: a failed announcement never fails the create.
   */
  private async announceNewPackage(typeId: number, createdBy: number | null) {
    try {
      const type = await this.prisma.club_subscription_types.findUnique({
        where: { id: typeId },
        include: { branches: { select: { branch_id: true } } },
      });
      // Package visibility in the member app follows is_active — the app lists every active
      // package for the branch, so an active package is always worth announcing.
      if (!type || !type.is_active) return;
      const branchIds = type.apply_to_all_branches
        ? []
        : [...new Set([
            ...(type.branches?.map((b) => b.branch_id) ?? []),
            ...(type.branch_id != null ? [type.branch_id] : []),
          ])];
      const members = await this.prisma.club_members.findMany({
        where: {
          is_deleted: false,
          is_active: true,
          app_user_id: { not: null },
          ...(branchIds.length ? { branch_id: { in: branchIds } } : {}),
        },
        select: { id: true, branch_id: true },
      });
      if (!members.length) return;
      const price = toNum(type.price);
      await this.prisma.am_member_notifications.createMany({
        data: members.map((m) => ({
          member_id: m.id,
          branch_id: m.branch_id,
          title: 'باقة جديدة متاحة الآن',
          body: `${type.name} — ${price} ج.م لمدة ${type.days} يوم`,
          type: 'subscription',
          data: JSON.stringify({ subscriptionTypeId: type.id }),
          created_by: createdBy,
        })),
      });
    } catch {
      // Announcement is a side effect; never block package creation on it.
    }
  }

  async update(id: number, body: Record<string, unknown>, user: JwtUser) {
    const existing = await this.findOne(id, user);
    if (existing.applyToAllBranches && user.level !== 1) {
      return this.upsertBranchOverride(id, body, user, existing);
    }
    const { data, branchSelection } = this.buildData(body);
    if (!branchSelection && body.branchId !== undefined && (body.branchId == null || body.branchId === '')) {
      throw new BadRequestException('لا يمكن ترك الخطة بدون فرع');
    }
    this.assertBranchSelectionAccess(user, branchSelection, body.branchId);
    const categories = await this.parseCategories(body);
    const branchPrices = this.parseBranchPrices(body);
    await this.prisma.club_subscription_types.update({
      where: { id },
      data: { ...data, is_special_offer: false },
    });

    if (branchSelection) {
      await this.syncBranches(id, branchSelection.applyToAllBranches, branchSelection.branchIds);
    }
    await this.syncClassTypes(id, []);
    await this.syncCategories(id, categories);
    await this.syncBranchPrices(
      id,
      branchSelection?.applyToAllBranches ?? existing.applyToAllBranches,
      branchSelection?.branchIds ?? existing.branchIds ?? [],
      branchPrices,
    );

    const isLinked =
      body.isLinkedToSessions !== undefined
        ? Boolean(body.isLinkedToSessions)
        : existing.isLinkedToSessions;
    const sessionsCount = isLinked
      ? body.sessionsCount !== undefined
        ? Number(body.sessionsCount)
        : existing.sessionsCount
      : null;
    const packagePrice =
      body.price !== undefined ? Number(body.price) : existing.price;
    const sessionPrices = this.parseSessionPrices(
      body,
      !!isLinked,
      sessionsCount,
      packagePrice,
    );
    if (sessionPrices != null) {
      await this.syncSessionPrices(id, sessionPrices);
    } else if (!isLinked) {
      await this.syncSessionPrices(id, []);
    }

    return this.findOne(id, user);
  }

  /**
   * A branch manager editing a global package gets a branch-local package copy. Existing
   * subscriptions keep their original contract, while new sales in this branch use the copy.
   */
  private async upsertBranchOverride(
    sourceId: number,
    body: Record<string, unknown>,
    user: JwtUser,
    source: ReturnType<ClubSubscriptionTypesService['map']>,
  ) {
    const allowed = this.branchScope.allowedBranchIds(user);
    const loginBranch = Number(user.branch ?? 0);
    const branchId = Number.isInteger(loginBranch) && loginBranch > 0 && allowed?.includes(loginBranch)
      ? loginBranch
      : allowed?.length === 1
        ? allowed[0]
        : null;
    if (!branchId) {
      throw new ForbiddenException('حدد فرعًا واحدًا مسموحًا لإنشاء نسخة الباقة الخاصة به');
    }

    const scopedBody: Record<string, unknown> = {
      name: source.name,
      price: source.price,
      days: source.days,
      isPartOfTarget: source.isPartOfTarget,
      invitationsCount: source.invitationsCount,
      inbodyCount: source.inbodyCount,
      isForStudents: source.isForStudents,
      showInApp: source.showInApp,
      notifyCustomers: source.notifyCustomers,
      notifyOnExpiry: source.notifyOnExpiry,
      walletPoints: source.walletPoints,
      offerValidity: source.offerValidity,
      isLinkedToSessions: source.isLinkedToSessions,
      sessionsCount: source.sessionsCount,
      sessionPrices: source.sessionPrices,
      allowMultipleDailyEntries: source.allowMultipleDailyEntries,
      isLinkedToFreeze: source.isLinkedToFreeze,
      freezeDays: source.freezeDays,
      freezeTotalDays: source.freezeTotalDays,
      includesSpa: source.includesSpa,
      spaCount: source.spaCount,
      isActive: source.isActive,
      appNotes: source.appNotes,
      categories: source.categories,
      ...body,
      applyToAllBranches: false,
      branchIds: [branchId],
      branchId,
      branchPrices: [],
    };

    const override = await this.prisma.club_subscription_types.findFirst({
      where: { source_subscription_type_id: sourceId, branch_id: branchId },
      select: { id: true },
    });
    if (override) return this.update(override.id, scopedBody, user);
    // This is an edit from the branch user's point of view, so do not send a
    // misleading "new package" notification when the local copy is created.
    return this.create(scopedBody, user, sourceId, false);
  }

  async remove(id: number) {
    await this.findOne(id);
    await this.prisma.club_subscription_types.delete({ where: { id } });
    return { success: true };
  }

  async updatePromo(id: number, body: Record<string, unknown>, user: JwtUser) {
    const existing = await this.findOne(id, user);
    if (existing.applyToAllBranches && user.level !== 1) {
      const override = await this.upsertBranchOverride(id, {}, user, existing);
      return this.updatePromo(override.id, body, user);
    }
    if (!Boolean(body.enabled)) {
      await this.prisma.club_subscription_types.update({ where: { id }, data: {
        promo_enabled: false, promo_price: null, promo_discount_percent: null,
        promo_image: null, promo_ends_at: null, promo_marketing_message: null,
      } });
      return this.findOne(id, user);
    }
    const promoPrice = Number(body.price);
    if (!Number.isFinite(promoPrice) || promoPrice <= 0) throw new BadRequestException('يجب إدخال سعر عرض صحيح أكبر من صفر');
    if (promoPrice >= existing.price) throw new BadRequestException('سعر العرض يجب أن يكون أقل من السعر الأصلي للباقة');
    const durationDays = Number(body.durationDays);
    if (!Number.isInteger(durationDays) || durationDays <= 0) throw new BadRequestException('يجب إدخال مدة العرض بالأيام كرقم صحيح أكبر من صفر');
    const calculated = Math.round(((existing.price - promoPrice) / existing.price) * 10_000) / 100;
    const discountPercent = body.discountPercent != null && body.discountPercent !== '' ? Number(body.discountPercent) : calculated;
    if (!Number.isFinite(discountPercent) || discountPercent <= 0 || discountPercent >= 100) throw new BadRequestException('نسبة الخصم يجب أن تكون أكبر من صفر وأقل من 100');
    const endsAt = new Date(Date.now() + durationDays * 86_400_000);
    const marketingMessage = body.marketingMessage !== undefined
      ? this.promoMessage(body.marketingMessage)
      : existing.promoMarketingMessage;
    await this.prisma.club_subscription_types.update({ where: { id }, data: {
      promo_enabled: true,
      promo_price: promoPrice,
      promo_discount_percent: discountPercent,
      promo_image: body.image !== undefined ? (body.image ? String(body.image) : null) : existing.promoImage,
      promo_ends_at: endsAt,
      promo_marketing_message: marketingMessage,
    } });
    if (!existing.promoEnabled && body.notify !== false) {
      await this.offers.notifyNewOffer({
        subscriptionTypeId: id,
        packageName: existing.name,
        branchIds: existing.applyToAllBranches ? null : existing.branchIds ?? [],
        promoPrice,
        originalPrice: existing.price,
        endsAt,
        marketingMessage,
        createdBy: user?.sub ?? null,
      });
    }
    return this.findOne(id, user);
  }
}
