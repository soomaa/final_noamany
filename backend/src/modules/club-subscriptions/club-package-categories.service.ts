import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { uploadReferenceUrl } from '../../common/uploads/upload-reference-url';
import { isPromoLive, PackageCategoryRow, withOffersTag } from './package-categories';
import { isSubscriptionTypeAvailableAtBranch } from './subscription-type-branch-scope';

const NAME_MAX = 100;
const ICON_MAX = 500;

/**
 * CRUD for the app home sections ("الفئات"). Packages reference a category by its
 * `key`, so the key never changes after creation; everything the member sees — name,
 * artwork, order, visibility — is editable.
 */
@Injectable()
export class ClubPackageCategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  private map(row: PackageCategoryRow, packageCount?: number) {
    return {
      id: row.id,
      key: row.key,
      name: row.name,
      nameEn: row.name_en,
      icon: row.icon,
      sortOrder: row.sort_order,
      isActive: row.is_active,
      isSystem: row.is_system,
      ...(packageCount !== undefined ? { packageCount } : {}),
    };
  }

  /** Every category, hidden ones included, with how many active packages carry each tag. */
  async list() {
    const [rows, tags] = await Promise.all([
      this.prisma.club_package_categories.findMany({
        orderBy: [{ sort_order: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.club_subscription_type_categories.groupBy({
        by: ['category'],
        where: { subscription_type: { is_active: true } },
        _count: { _all: true },
      }),
    ]);
    const counts = new Map(tags.map((t) => [t.category, t._count._all]));
    return rows.map((row) => this.map(row, counts.get(row.key) ?? 0));
  }

  /** Keys a package may be tagged with — hidden categories included, so hiding never drops tags. */
  async validKeys(): Promise<Set<string>> {
    const rows = await this.prisma.club_package_categories.findMany({ select: { key: true } });
    return new Set(rows.map((r) => r.key));
  }

  /**
   * The member-app home tiles for one branch, in admin order, each with how many packages
   * the branch actually offers under it. Every visible section is returned even when empty,
   * so the grid does not reflow between branches. `iconUrl` null tells the app to use the
   * artwork it bundles for that `key`.
   */
  async listForBranch(branchId: number, publicBase: string) {
    const [categories, types, privateCount, classTypeCount] = await Promise.all([
      this.prisma.club_package_categories.findMany({
        where: { is_active: true },
        orderBy: [{ sort_order: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.club_subscription_types.findMany({
        where: { is_active: true },
        select: {
          id: true,
          branch_id: true,
          apply_to_all_branches: true,
          promo_enabled: true,
          promo_ends_at: true,
          branches: { select: { branch_id: true } },
          categories: { select: { category: true } },
        },
      }),
      this.prisma.club_private_packages.count({
        where: { is_active: true, branches: { some: { branch_id: branchId } } },
      }),
      this.prisma.club_class_types.count({
        where: {
          is_active: true,
          is_deleted: false,
          trainer_schedule_slots: { some: { is_active: true, branch_id: branchId } },
        },
      }),
    ]);
    const counts = new Map<string, number>();
    const bump = (key: string, by = 1) => counts.set(key, (counts.get(key) ?? 0) + by);
    for (const type of types) {
      if (!isSubscriptionTypeAvailableAtBranch(type, branchId)) continue;
      const tags = withOffersTag(
        type.categories.map((c) => c.category),
        isPromoLive(type.promo_enabled, type.promo_ends_at),
      );
      for (const key of tags) bump(key);
    }
    if (privateCount) bump('private', privateCount);
    if (classTypeCount) bump('classes', classTypeCount);
    return categories.map((c) => ({
      id: c.id,
      key: c.key,
      labelAr: c.name,
      labelEn: c.name_en?.trim() || c.name,
      iconUrl: uploadReferenceUrl(publicBase, c.icon),
      isSystem: c.is_system,
      sortOrder: c.sort_order,
      count: counts.get(c.key) ?? 0,
    }));
  }

  /** Section keys per package id (for callers that list packages themselves). */
  async categoriesByType(typeIds: number[]): Promise<Map<number, string[]>> {
    const ids = [...new Set(typeIds.filter((id) => Number.isInteger(id) && id > 0))];
    const map = new Map<number, string[]>();
    if (!ids.length) return map;
    const rows = await this.prisma.club_subscription_type_categories.findMany({
      where: { subscription_type_id: { in: ids } },
      select: { subscription_type_id: true, category: true },
    });
    for (const row of rows) {
      const list = map.get(row.subscription_type_id) ?? [];
      list.push(row.category);
      map.set(row.subscription_type_id, list);
    }
    return map;
  }

  private parseName(value: unknown, required: boolean): string | undefined {
    if (value === undefined && !required) return undefined;
    const name = String(value ?? '').trim();
    if (!name) throw new BadRequestException('اسم الفئة مطلوب');
    if (name.length > NAME_MAX) throw new BadRequestException(`اسم الفئة يجب ألا يزيد عن ${NAME_MAX} حرفًا`);
    return name;
  }

  private parseOptionalText(value: unknown, max: number, label: string): string | null | undefined {
    if (value === undefined) return undefined;
    const text = value == null ? '' : String(value).trim();
    if (!text) return null;
    if (text.length > max) throw new BadRequestException(`${label} طويل جدًا`);
    return text;
  }

  async create(body: Record<string, unknown>) {
    const name = this.parseName(body.name, true)!;
    const last = await this.prisma.club_package_categories.aggregate({ _max: { sort_order: true } });
    const row = await this.prisma.club_package_categories.create({
      data: {
        key: `c_${randomBytes(5).toString('hex')}`,
        name,
        name_en: this.parseOptionalText(body.nameEn, NAME_MAX, 'الاسم الإنجليزي') ?? null,
        icon: this.parseOptionalText(body.icon, ICON_MAX, 'مسار الصورة') ?? null,
        sort_order: (last._max.sort_order ?? 0) + 10,
        is_active: body.isActive !== false,
      },
    });
    return this.map(row, 0);
  }

  async update(id: number, body: Record<string, unknown>) {
    const existing = await this.prisma.club_package_categories.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('الفئة غير موجودة');
    const name = this.parseName(body.name, false);
    const nameEn = this.parseOptionalText(body.nameEn, NAME_MAX, 'الاسم الإنجليزي');
    const icon = this.parseOptionalText(body.icon, ICON_MAX, 'مسار الصورة');
    const row = await this.prisma.club_package_categories.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(nameEn !== undefined ? { name_en: nameEn } : {}),
        ...(icon !== undefined ? { icon } : {}),
        ...(body.isActive !== undefined ? { is_active: Boolean(body.isActive) } : {}),
      },
    });
    return this.map(row);
  }

  /** Rewrites `sort_order` to follow `ids`; categories left out keep their place after them. */
  async reorder(body: Record<string, unknown>) {
    const ids = Array.isArray(body.ids)
      ? [...new Set(body.ids.map(Number).filter((id) => Number.isInteger(id) && id > 0))]
      : [];
    if (!ids.length) throw new BadRequestException('ترتيب الفئات غير صالح');
    const rows = await this.prisma.club_package_categories.findMany({
      select: { id: true },
      orderBy: [{ sort_order: 'asc' }, { id: 'asc' }],
    });
    const known = new Set(rows.map((r) => r.id));
    const ordered = [
      ...ids.filter((id) => known.has(id)),
      ...rows.map((r) => r.id).filter((id) => !ids.includes(id)),
    ];
    await this.prisma.$transaction(
      ordered.map((id, index) =>
        this.prisma.club_package_categories.update({
          where: { id },
          data: { sort_order: (index + 1) * 10 },
        }),
      ),
    );
    return this.list();
  }

  /** Deletes the category and untags every package that carried it. */
  async remove(id: number) {
    const existing = await this.prisma.club_package_categories.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('الفئة غير موجودة');
    if (existing.is_system) {
      throw new BadRequestException('هذه الفئة أساسية ولا يمكن حذفها — يمكنك إخفاؤها بدلًا من ذلك');
    }
    await this.prisma.$transaction([
      this.prisma.club_subscription_type_categories.deleteMany({ where: { category: existing.key } }),
      this.prisma.club_package_categories.delete({ where: { id } }),
    ]);
    return { success: true };
  }
}
