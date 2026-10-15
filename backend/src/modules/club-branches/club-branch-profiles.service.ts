import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtUser } from '../../common/types/jwt-user';
import { uploadReferenceUrl } from '../../common/uploads/upload-reference-url';

/** Seven entries, Sunday first — the week as the club's schedules already count it. */
export const WEEKDAYS_AR = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
export const WEEKDAYS_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export interface WorkingHoursDay {
  weekday: number;
  closed: boolean;
  opensAt: string | null;
  closesAt: string | null;
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const GALLERY_LIMIT = 20;

/**
 * Always returns exactly seven days in weekday order, whatever the stored JSON
 * looks like. A branch that has only ever had three days filled in must still
 * render a full week in the app rather than a ragged list, and a row written by
 * an older version of this form must not crash the member's screen.
 */
export function normaliseWorkingHours(raw: unknown): WorkingHoursDay[] {
  const byDay = new Map<number, WorkingHoursDay>();
  if (Array.isArray(raw)) {
    for (const entry of raw) {
      if (!entry || typeof entry !== 'object') continue;
      const row = entry as Record<string, unknown>;
      const weekday = Number(row.weekday);
      if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) continue;
      const opensAt = typeof row.opensAt === 'string' && TIME_RE.test(row.opensAt) ? row.opensAt : null;
      const closesAt = typeof row.closesAt === 'string' && TIME_RE.test(row.closesAt) ? row.closesAt : null;
      // A day with no usable hours is closed, whatever the flag claimed: showing
      // "open" next to two blanks is worse than showing "closed".
      const closed = row.closed === true || opensAt == null || closesAt == null;
      byDay.set(weekday, { weekday, closed, opensAt: closed ? null : opensAt, closesAt: closed ? null : closesAt });
    }
  }
  return Array.from({ length: 7 }, (_, weekday) =>
    byDay.get(weekday) ?? { weekday, closed: true, opensAt: null, closesAt: null },
  );
}

export function parseGallery(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter((value) => value.length > 0)
    .slice(0, GALLERY_LIMIT);
}

/**
 * Cover and gallery images are shown to guests, so they must be public media
 * (`public-file:<id>` from the `branch-photo` category) or absolute URLs. A private
 * `file:` reference would never load in the app, so it is refused at write time.
 */
function assertPublicImage(reference: string, label: string): string {
  if (reference.startsWith('file:')) {
    throw new BadRequestException(`${label} يجب أن تُرفع كصورة عامة للتطبيق`);
  }
  return reference;
}

type ProfileRow = {
  branch_id: number;
  display_name: string | null;
  display_name_en: string | null;
  tagline: string | null;
  about: string | null;
  address: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  map_url: string | null;
  cover_image: string | null;
  gallery: Prisma.JsonValue | null;
  working_hours: Prisma.JsonValue | null;
  facebook_url: string | null;
  instagram_url: string | null;
  is_published: boolean;
  sort_order: number;
};

/**
 * معلومات الفروع — the app-facing profile of each branch (display names, contact, map,
 * photos, working hours). `tbl_branches.branch_name` stays the operational name used by
 * HR, stock and reports; the profile only changes what members and guests see.
 */
@Injectable()
export class ClubBranchProfilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly branchScope: BranchScopeService,
  ) {}

  private publicBase(): string {
    return this.config.get<string>('publicUploadBase') ?? '/uploads';
  }

  private text(value: unknown, max: number, label: string): string | null {
    if (value == null) return null;
    const text = String(value).trim();
    if (!text) return null;
    if (text.length > max) {
      throw new BadRequestException(`${label} يجب ألا يزيد عن ${max} حرفًا`);
    }
    return text;
  }

  private buildData(body: Record<string, unknown>) {
    const coverImage = body.coverImage !== undefined ? this.text(body.coverImage, 500, 'صورة الغلاف') : undefined;
    const gallery = body.gallery !== undefined
      ? parseGallery(body.gallery).map((path) => assertPublicImage(path, 'صور الفرع'))
      : undefined;
    return {
      ...(body.displayName !== undefined ? { display_name: this.text(body.displayName, 120, 'اسم الفرع بالعربي') } : {}),
      ...(body.displayNameEn !== undefined ? { display_name_en: this.text(body.displayNameEn, 120, 'اسم الفرع بالإنجليزي') } : {}),
      ...(body.tagline !== undefined ? { tagline: this.text(body.tagline, 160, 'الوصف المختصر') } : {}),
      ...(body.about !== undefined ? { about: this.text(body.about, 4000, 'نبذة عن الفرع') } : {}),
      ...(body.address !== undefined ? { address: this.text(body.address, 255, 'العنوان') } : {}),
      ...(body.phone !== undefined ? { phone: this.text(body.phone, 30, 'رقم التليفون') } : {}),
      ...(body.whatsapp !== undefined ? { whatsapp: this.text(body.whatsapp, 30, 'رقم الواتساب') } : {}),
      ...(body.email !== undefined ? { email: this.text(body.email, 120, 'البريد الإلكتروني') } : {}),
      ...(body.mapUrl !== undefined ? { map_url: this.text(body.mapUrl, 500, 'رابط الخريطة') } : {}),
      ...(coverImage !== undefined
        ? { cover_image: coverImage == null ? null : assertPublicImage(coverImage, 'صورة الغلاف') }
        : {}),
      ...(body.facebookUrl !== undefined ? { facebook_url: this.text(body.facebookUrl, 500, 'رابط فيسبوك') } : {}),
      ...(body.instagramUrl !== undefined ? { instagram_url: this.text(body.instagramUrl, 500, 'رابط إنستجرام') } : {}),
      ...(gallery !== undefined ? { gallery: gallery as unknown as Prisma.InputJsonValue } : {}),
      ...(body.workingHours !== undefined
        ? { working_hours: normaliseWorkingHours(body.workingHours) as unknown as Prisma.InputJsonValue }
        : {}),
      ...(body.isPublished !== undefined ? { is_published: body.isPublished === true || body.isPublished === 'true' } : {}),
      ...(body.sortOrder !== undefined ? { sort_order: Math.trunc(Number(body.sortOrder)) || 0 } : {}),
    };
  }

  private map(branchId: number, branchName: string | null, row: ProfileRow | null) {
    const gallery = parseGallery(row?.gallery);
    return {
      branchId,
      /** The operational name, always shown to admins so they can tell which row they are editing. */
      branchName: branchName ?? `فرع ${branchId}`,
      displayName: row?.display_name ?? null,
      displayNameEn: row?.display_name_en ?? null,
      /** What an Arabic-reading member or guest sees. */
      publicName: row?.display_name?.trim() || branchName || `فرع ${branchId}`,
      /**
       * The English twin. An unset English name falls back to the Arabic one rather than to a
       * generated "Branch 2": a club that named its branch only in Arabic still wants that name.
       */
      publicNameEn: row?.display_name_en?.trim() || row?.display_name?.trim() || branchName || `Branch ${branchId}`,
      tagline: row?.tagline ?? null,
      about: row?.about ?? null,
      address: row?.address ?? null,
      phone: row?.phone ?? null,
      whatsapp: row?.whatsapp ?? null,
      email: row?.email ?? null,
      mapUrl: row?.map_url ?? null,
      // Raw stored references: the admin form posts these straight back.
      coverImage: row?.cover_image ?? null,
      gallery,
      // URL twins for the app, which cannot resolve an opaque file reference.
      coverImageUrl: uploadReferenceUrl(this.publicBase(), row?.cover_image),
      galleryUrls: gallery
        .map((path) => uploadReferenceUrl(this.publicBase(), path))
        .filter((url): url is string => url != null),
      workingHours: normaliseWorkingHours(row?.working_hours),
      facebookUrl: row?.facebook_url ?? null,
      instagramUrl: row?.instagram_url ?? null,
      isPublished: row?.is_published ?? true,
      sortOrder: row?.sort_order ?? 0,
      /** False until an admin saves the form once; the app then falls back to the name alone. */
      hasProfile: row != null,
    };
  }

  /**
   * Every branch with its profile merged in, including branches nobody has filled in yet, so
   * the list is the list of branches rather than the list of rows that happen to exist.
   */
  private async listMerged(branchIds: number[] | null) {
    const where: Prisma.tbl_branchesWhereInput = {
      branch_name: { not: null },
      ...(branchIds ? { branch_id: { in: branchIds } } : {}),
    };
    const [branches, profiles] = await Promise.all([
      this.prisma.tbl_branches.findMany({
        where,
        orderBy: { branch_id: 'asc' },
        select: { branch_id: true, branch_name: true },
      }),
      this.prisma.club_branch_profiles.findMany(branchIds ? { where: { branch_id: { in: branchIds } } } : undefined),
    ]);
    const byBranch = new Map(profiles.map((row) => [row.branch_id, row as ProfileRow]));
    return branches
      .map((b) => this.map(b.branch_id, b.branch_name, byBranch.get(b.branch_id) ?? null))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.branchId - b.branchId);
  }

  /** Admin screen: only the branches this staff account may manage. */
  async listForStaff(user: JwtUser | undefined) {
    return this.listMerged(this.branchScope.allowedBranchIds(user));
  }

  /** The published branches a member or guest may browse. */
  async listPublic() {
    return (await this.listMerged(null)).filter((row) => row.isPublished);
  }

  async findOne(branchId: number) {
    const branch = await this.prisma.tbl_branches.findUnique({
      where: { branch_id: branchId },
      select: { branch_id: true, branch_name: true },
    });
    if (!branch) throw new NotFoundException('الفرع غير موجود');
    const row = await this.prisma.club_branch_profiles.findUnique({ where: { branch_id: branchId } });
    return this.map(branch.branch_id, branch.branch_name, (row as ProfileRow | null) ?? null);
  }

  /** Guest view of one branch: an unpublished branch does not exist for the app. */
  async findPublic(branchId: number) {
    const profile = await this.findOne(branchId);
    if (!profile.isPublished) throw new NotFoundException('الفرع غير موجود');
    return profile;
  }

  async findForStaff(user: JwtUser | undefined, branchId: number) {
    this.assertBranchAccess(user, branchId);
    return this.findOne(branchId);
  }

  /**
   * Upsert rather than update: the row is created the first time an admin fills the form,
   * so no migration has to seed a profile for every existing branch.
   */
  async upsert(user: JwtUser | undefined, branchId: number, body: Record<string, unknown>) {
    this.assertBranchAccess(user, branchId);
    const branch = await this.prisma.tbl_branches.findUnique({
      where: { branch_id: branchId },
      select: { branch_id: true },
    });
    if (!branch) throw new NotFoundException('الفرع غير موجود');

    const data = this.buildData(body ?? {});
    await this.prisma.club_branch_profiles.upsert({
      where: { branch_id: branchId },
      create: { branch_id: branchId, ...data },
      update: data,
    });
    return this.findOne(branchId);
  }

  private assertBranchAccess(user: JwtUser | undefined, branchId: number) {
    if (!this.branchScope.isBranchAllowed(user, branchId)) {
      throw new ForbiddenException('لا تملك صلاحية على هذا الفرع');
    }
  }
}
