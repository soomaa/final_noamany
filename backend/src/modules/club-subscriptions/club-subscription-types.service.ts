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

type SessionPriceRow = { sessions_count: number; price: unknown };

type TypeRow = {
  id: number;
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
  includes_spa: boolean;
  spa_count: number | null;
  is_active: boolean;
  branches?: { branch_id: number }[];
  class_types?: {
    class_type_id: number;
    class_type: { id: number; name: string; color: string };
  }[];
  session_prices?: SessionPriceRow[];
};

@Injectable()
export class ClubSubscriptionTypesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branchScope: BranchScopeService,
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
    return {
      id: r.id,
      name: r.name,
      branchId: r.branch_id,
      applyToAllBranches: r.apply_to_all_branches,
      branchIds,
      price: toNum(r.price),
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
      includesSpa: r.includes_spa,
      spaCount: r.spa_count,
      isActive: r.is_active,
      classTypeIds: r.class_types?.map((x) => x.class_type_id) ?? [],
      classTypes: r.class_types?.map((x) => x.class_type) ?? [],
    };
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
      ...(body.includesSpa !== undefined ? { includes_spa: Boolean(body.includesSpa) } : {}),
      ...(body.spaCount !== undefined
        ? { spa_count: spaCount }
        : {}),
      ...(body.isActive !== undefined ? { is_active: Boolean(body.isActive) } : {}),
    };

    return { data, branchSelection };
  }

  private listInclude() {
    return {
      branches: { select: { branch_id: true } },
      class_types: {
        include: { class_type: { select: { id: true, name: true, color: true } } },
      },
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
    return rows.map((r) => this.map(r));
  }

  async findOne(id: number, user?: JwtUser) {
    const row = await this.prisma.club_subscription_types.findUnique({
      where: { id },
      include: this.listInclude(),
    });
    if (!row) throw new NotFoundException('نوع الاشتراك غير موجود');
    const allowed = this.branchScope.allowedBranchIds(user);
    if (
      allowed !== null &&
      !allowed.some((branchId) => isSubscriptionTypeAvailableAtBranch(row, branchId))
    ) {
      throw new ForbiddenException('لا تملك صلاحية الوصول لخطة فرع آخر');
    }
    return this.map(row);
  }

  async create(body: Record<string, unknown>, user: JwtUser) {
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

    const row = await this.prisma.club_subscription_types.create({
      data: {
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
        show_in_app: Boolean(body.showInApp),
        notify_customers: Boolean(body.notifyCustomers),
        notify_on_expiry: Boolean(body.notifyOnExpiry),
        wallet_points: body.walletPoints != null && body.walletPoints !== '' ? Number(body.walletPoints) : null,
        offer_validity: body.offerValidity ? String(body.offerValidity) : null,
        is_linked_to_sessions: isLinked,
        sessions_count: isLinked ? sessionsCount : null,
        allow_multiple_daily_entries: Boolean(body.allowMultipleDailyEntries),
        is_linked_to_freeze: Boolean(body.isLinkedToFreeze),
        freeze_days: body.freezeDays != null && body.freezeDays !== '' ? Number(body.freezeDays) : null,
        includes_spa: Boolean(body.includesSpa),
        spa_count: body.spaCount != null && body.spaCount !== '' ? Number(body.spaCount) : null,
        is_active: body.isActive !== false,
      },
    });

    if (branchSelection) {
      await this.syncBranches(row.id, branchSelection.applyToAllBranches, branchSelection.branchIds);
    }
    await this.syncClassTypes(row.id, []);
    await this.syncSessionPrices(row.id, sessionPrices);

    return this.findOne(row.id, user);
  }

  async update(id: number, body: Record<string, unknown>, user: JwtUser) {
    const existing = await this.findOne(id, user);
    if (existing.applyToAllBranches && user.level !== 1) {
      throw new ForbiddenException('تعديل خطة متاحة لكل الفروع مسموح لمدير النظام فقط');
    }
    const { data, branchSelection } = this.buildData(body);
    if (!branchSelection && body.branchId !== undefined && (body.branchId == null || body.branchId === '')) {
      throw new BadRequestException('لا يمكن ترك الخطة بدون فرع');
    }
    this.assertBranchSelectionAccess(user, branchSelection, body.branchId);
    await this.prisma.club_subscription_types.update({
      where: { id },
      data: { ...data, is_special_offer: false },
    });

    if (branchSelection) {
      await this.syncBranches(id, branchSelection.applyToAllBranches, branchSelection.branchIds);
    }
    await this.syncClassTypes(id, []);

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

  async remove(id: number) {
    const type = await this.findOne(id);
    const inUse = await this.prisma.club_subscriptions.count({ where: { subscription_type_id: id } });
    if (inUse > 0) {
      await this.prisma.club_subscription_types.update({ where: { id }, data: { is_active: false } });
      return {
        success: true,
        retired: true,
        affectedSubscriptions: inUse,
        message: `تم إيقاف الباقة "${type.name}" — ${inUse} اشتراك قائم سيكمل مدته، ولن تظهر بعد الآن عند تسجيل اشتراك جديد أو التجديد.`,
      };
    }
    await this.prisma.club_subscription_types.delete({ where: { id } });
    return { success: true, retired: false, affectedSubscriptions: 0 };
  }

  async usage(id: number) {
    const type = await this.findOne(id);
    const subscriptions = await this.prisma.club_subscriptions.count({ where: { subscription_type_id: id } });
    return { id, name: type.name, subscriptions, willRetire: subscriptions > 0 };
  }

  async setActive(id: number, isActive: boolean) {
    await this.findOne(id);
    await this.prisma.club_subscription_types.update({ where: { id }, data: { is_active: isActive } });
    return { success: true, isActive };
  }
}
