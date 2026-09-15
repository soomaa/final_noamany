import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AmInvitationStatus, AmNewsType, Prisma } from '@prisma/client';
import { paginated } from '../../common/dto/list-result';
import { PrismaService } from '../../common/prisma/prisma.service';
import { assertDateOrder } from '../../common/validators/validation.util';
import { retryOnUniqueViolation } from '../../common/retry-unique';
import {
  CreateInvitationDto,
  CreateMemberNotificationDto,
  ListAppItemsDto,
  ListInvitationsDto,
  ListMemberNotificationsDto,
  UpdateAboutAppDto,
  UpdateInvitationDto,
  UpsertAdDto,
  UpsertExerciseCategoryDto,
  UpsertExerciseDto,
  UpsertNewsDto,
  UpsertOfferDto,
  UpsertTrainerDto,
} from './dto/app-management.dto';

/** Prefix a stored relative upload path with the public /uploads base so the mobile app can load it. */
function uploadUrl(base: string, path: string | null | undefined): string | null {
  if (!path?.trim()) return null;
  const trimmed = path.trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
  const prefix = base.endsWith('/') ? base.slice(0, -1) : base;
  if (trimmed === prefix || trimmed.startsWith(`${prefix}/`)) return trimmed;
  const rel = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return `${prefix}${rel}`;
}

@Injectable()
export class AppManagementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private publicBase(): string {
    return this.config.get<string>('publicUploadBase') ?? '/uploads';
  }

  /** Build a servable image URL from a stored relative path (bare /uploads paths 404 on the app). */
  private imgUrl(path: string | null | undefined): string | null {
    return uploadUrl(this.publicBase(), path);
  }

  private decimal(v: Prisma.Decimal | null | undefined): number | null {
    if (v == null) return null;
    return Number(v);
  }

  private async branchName(branchId: number | null | undefined) {
    if (branchId == null) return null;
    const b = await this.prisma.tbl_branches.findUnique({ where: { branch_id: branchId } });
    return b?.branch_name ?? null;
  }

  // ── About ──────────────────────────────────────────────────────────────────

  async getAbout() {
    let row = await this.prisma.am_about_app.findFirst();
    if (!row) row = await this.prisma.am_about_app.create({ data: { app_name: 'Swat Gym' } });
    return this.mapAbout(row);
  }

  async updateAbout(dto: UpdateAboutAppDto) {
    let row = await this.prisma.am_about_app.findFirst();
    const data = {
      app_name: dto.appName,
      app_version: dto.appVersion,
      description: dto.description,
      features: dto.features,
      contact_email: dto.contactEmail,
      contact_phone: dto.contactPhone,
      website: dto.website,
      privacy_policy: dto.privacyPolicy,
      terms_of_service: dto.termsOfService,
    };
    if (!row) {
      row = await this.prisma.am_about_app.create({
        data: { ...data, app_name: dto.appName ?? 'Swat Gym' },
      });
    } else {
      row = await this.prisma.am_about_app.update({ where: { id: row.id }, data });
    }
    return this.mapAbout(row);
  }

  private mapAbout(row: {
    id: number;
    app_name: string;
    app_version: string | null;
    description: string | null;
    features: string | null;
    contact_email: string | null;
    contact_phone: string | null;
    website: string | null;
    privacy_policy: string | null;
    terms_of_service: string | null;
    updated_at: Date;
    created_at: Date;
  }) {
    return {
      id: row.id,
      appName: row.app_name,
      appVersion: row.app_version,
      description: row.description,
      features: row.features,
      contactEmail: row.contact_email,
      contactPhone: row.contact_phone,
      website: row.website,
      privacyPolicy: row.privacy_policy,
      termsOfService: row.terms_of_service,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  // ── Invitations ────────────────────────────────────────────────────────────

  async listInvitations(q: ListInvitationsDto) {
    const where: Prisma.am_invitationsWhereInput = {};
    if (q.status) where.status = q.status;
    if (q.branchId != null) where.branch_id = q.branchId;
    if (q.search?.trim()) {
      const s = q.search.trim();
      where.OR = [
        { recipient_name: { contains: s } },
        { recipient_email: { contains: s } },
        { recipient_phone: { contains: s } },
        { invitation_code: { contains: s } },
      ];
    }
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.am_invitations.count({ where }),
      this.prisma.am_invitations.findMany({
        where,
        skip: q.skip,
        take: q.take,
        orderBy: { created_at: 'desc' },
      }),
    ]);
    const data = await Promise.all(rows.map((r) => this.mapInvitation(r)));
    return paginated(data, total, q.page, q.pageSize);
  }

  async listInvitationsByStatus(status: AmInvitationStatus) {
    const rows = await this.prisma.am_invitations.findMany({
      where: { status },
      orderBy: { created_at: 'desc' },
    });
    return Promise.all(rows.map((r) => this.mapInvitation(r)));
  }

  async createInvitation(dto: CreateInvitationDto) {
    if (!dto.recipientEmail?.trim() && !dto.recipientPhone?.trim()) {
      throw new BadRequestException('البريد الإلكتروني أو رقم الجوال مطلوب');
    }
    const manual = dto.invitationCode?.trim();
    // invitation_code is @unique — auto-generated codes retry on collision (recomputing
    // the next code each attempt) so two concurrent invites can't clash.
    const row = await retryOnUniqueViolation(async () => {
      let code = manual;
      if (!code) {
        const last = await this.prisma.am_invitations.findFirst({ orderBy: { id: 'desc' } });
        code = `INV${String((last?.id ?? 0) + 1).padStart(6, '0')}`;
      }
      return this.prisma.am_invitations.create({
        data: {
          invitation_code: code,
          recipient_name: dto.recipientName,
          recipient_email: dto.recipientEmail?.trim() || null,
          recipient_phone: dto.recipientPhone?.trim() || null,
          inviter_member_id: dto.inviterMemberId ?? null,
          status: dto.status ?? 'pending',
          branch_id: dto.branchId ?? null,
        },
      });
    });
    return this.mapInvitation(row);
  }

  async updateInvitation(id: number, dto: UpdateInvitationDto) {
    const existing = await this.prisma.am_invitations.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('الدعوة غير موجودة');

    const data: Prisma.am_invitationsUpdateInput = {
      recipient_name: dto.recipientName,
      recipient_email: dto.recipientEmail,
      recipient_phone: dto.recipientPhone,
      status: dto.status,
      rejection_reason: dto.rejectionReason,
      branch_id: dto.branchId,
    };
    if (dto.status === 'accepted' && existing.status !== 'accepted') {
      data.accepted_date = new Date();
    }
    if (dto.status === 'rejected' && existing.status !== 'rejected') {
      data.rejected_date = new Date();
    }
    if (dto.status === 'attended' && existing.status !== 'attended') {
      data.attendance_date = new Date();
    }

    const row = await this.prisma.am_invitations.update({ where: { id }, data });
    return this.mapInvitation(row);
  }

  private async mapInvitation(row: {
    id: number;
    invitation_code: string;
    recipient_name: string;
    recipient_email: string | null;
    recipient_phone: string | null;
    inviter_member_id: number | null;
    sent_date: Date;
    status: AmInvitationStatus;
    accepted_date: Date | null;
    rejected_date: Date | null;
    rejection_reason: string | null;
    attendance_date: Date | null;
    branch_id: number | null;
    created_at: Date;
  }) {
    return {
      id: row.id,
      invitationCode: row.invitation_code,
      recipientName: row.recipient_name,
      recipientEmail: row.recipient_email,
      recipientPhone: row.recipient_phone,
      inviterMemberId: row.inviter_member_id,
      sentDate: row.sent_date,
      status: row.status,
      acceptedDate: row.accepted_date,
      rejectedDate: row.rejected_date,
      rejectionReason: row.rejection_reason,
      attendanceDate: row.attendance_date,
      branchId: row.branch_id,
      branchName: await this.branchName(row.branch_id),
      createdAt: row.created_at,
    };
  }

  // ── Offers ─────────────────────────────────────────────────────────────────

  async listOffers(q: ListAppItemsDto) {
    const where: Prisma.am_offersWhereInput = {};
    if (q.isActive != null) where.is_active = q.isActive;
    if (q.search?.trim()) {
      const s = q.search.trim();
      where.OR = [{ title: { contains: s } }, { description: { contains: s } }];
    }
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.am_offers.count({ where }),
      this.prisma.am_offers.findMany({ where, skip: q.skip, take: q.take, orderBy: { created_at: 'desc' } }),
    ]);
    return paginated(rows.map((r) => this.mapOffer(r)), total, q.page, q.pageSize);
  }

  async createOffer(dto: UpsertOfferDto) {
    const row = await this.prisma.am_offers.create({ data: this.offerData(dto) });
    return this.mapOffer(row);
  }

  async updateOffer(id: number, dto: Partial<UpsertOfferDto>) {
    await this.requireOffer(id);
    const row = await this.prisma.am_offers.update({
      where: { id },
      data: {
        title: dto.title,
        description: dto.description,
        image_url: dto.imageUrl,
        discount: dto.discount,
        start_date: dto.startDate,
        end_date: dto.endDate,
        is_active: dto.isActive,
      },
    });
    return this.mapOffer(row);
  }

  async deleteOffer(id: number) {
    await this.requireOffer(id);
    await this.prisma.am_offers.delete({ where: { id } });
    return { ok: true };
  }

  private offerData(dto: Partial<UpsertOfferDto>): Prisma.am_offersCreateInput {
    if (dto.startDate && dto.endDate) {
      assertDateOrder(dto.startDate, dto.endDate, 'تاريخ نهاية العرض يجب أن يكون بعد تاريخ البداية');
    }
    return {
      title: dto.title!,
      description: dto.description,
      image_url: dto.imageUrl,
      discount: dto.discount,
      start_date: dto.startDate,
      end_date: dto.endDate,
      is_active: dto.isActive ?? true,
    };
  }

  private mapOffer(row: {
    id: number;
    title: string;
    description: string | null;
    image_url: string | null;
    discount: Prisma.Decimal | null;
    start_date: string | null;
    end_date: string | null;
    is_active: boolean;
    created_at: Date;
  }) {
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      imageUrl: this.imgUrl(row.image_url),
      discount: this.decimal(row.discount),
      startDate: row.start_date,
      endDate: row.end_date,
      isActive: row.is_active,
      createdAt: row.created_at,
    };
  }

  private async requireOffer(id: number) {
    const row = await this.prisma.am_offers.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('العرض غير موجود');
    return row;
  }

  // ── Trainers ───────────────────────────────────────────────────────────────

  async listTrainers(q: ListAppItemsDto) {
    const where: Prisma.am_trainersWhereInput = {};
    if (q.isActive != null) where.is_active = q.isActive;
    if (q.search?.trim()) {
      const s = q.search.trim();
      where.OR = [
        { name: { contains: s } },
        { email: { contains: s } },
        { specialization: { contains: s } },
      ];
    }
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.am_trainers.count({ where }),
      this.prisma.am_trainers.findMany({ where, skip: q.skip, take: q.take, orderBy: { created_at: 'desc' } }),
    ]);
    return paginated(rows.map((r) => this.mapTrainer(r)), total, q.page, q.pageSize);
  }

  async createTrainer(dto: UpsertTrainerDto) {
    const row = await this.prisma.am_trainers.create({ data: this.trainerData(await this.deriveTrainerFromEmployee(dto)) });
    return this.mapTrainer(row);
  }

  /** When a trainer is linked to an employee, pull name/email/phone from the HR record
   * so the two never drift (any field the caller left blank is filled from the employee). */
  private async deriveTrainerFromEmployee<T extends Partial<UpsertTrainerDto>>(dto: T): Promise<T> {
    if (!dto.employeeId) return dto;
    const emp = await this.prisma.employees.findUnique({
      where: { id: dto.employeeId },
      select: { employee: true, email: true, phone: true },
    });
    if (!emp) throw new BadRequestException('الموظف المرتبط غير موجود');
    return {
      ...dto,
      name: dto.name?.trim() || emp.employee || dto.name,
      email: dto.email ?? emp.email ?? undefined,
      phone: dto.phone ?? emp.phone ?? undefined,
    };
  }

  async updateTrainer(id: number, dto: Partial<UpsertTrainerDto>) {
    await this.requireTrainer(id);
    const row = await this.prisma.am_trainers.update({
      where: { id },
      data: {
        name: dto.name,
        employee_id: dto.employeeId,
        email: dto.email,
        phone: dto.phone,
        specialization: dto.specialization,
        experience: dto.experience,
        bio: dto.bio,
        image_url: dto.imageUrl,
        is_active: dto.isActive,
      },
    });
    return this.mapTrainer(row);
  }

  async deleteTrainer(id: number) {
    await this.requireTrainer(id);
    await this.prisma.am_trainers.delete({ where: { id } });
    return { ok: true };
  }

  private trainerData(dto: Partial<UpsertTrainerDto>): Prisma.am_trainersCreateInput {
    if (!dto.name) throw new BadRequestException('الاسم مطلوب');
    return {
      name: dto.name,
      employee_id: dto.employeeId ?? null,
      email: dto.email,
      phone: dto.phone,
      specialization: dto.specialization,
      experience: dto.experience,
      bio: dto.bio,
      image_url: dto.imageUrl,
      is_active: dto.isActive ?? true,
    };
  }

  private mapTrainer(row: {
    id: number;
    employee_id: number | null;
    name: string;
    email: string | null;
    phone: string | null;
    specialization: string | null;
    experience: number | null;
    bio: string | null;
    image_url: string | null;
    is_active: boolean;
    created_at: Date;
  }) {
    return {
      id: row.id,
      employeeId: row.employee_id,
      name: row.name,
      email: row.email,
      phone: row.phone,
      specialization: row.specialization,
      experience: row.experience,
      bio: row.bio,
      imageUrl: this.imgUrl(row.image_url),
      isActive: row.is_active,
      createdAt: row.created_at,
    };
  }

  private async requireTrainer(id: number) {
    const row = await this.prisma.am_trainers.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('المدرب غير موجود');
    return row;
  }

  // ── Exercise categories ────────────────────────────────────────────────────

  async listExerciseCategories(q: ListAppItemsDto) {
    const where: Prisma.am_exercise_categoriesWhereInput = {};
    if (q.isActive != null) where.is_active = q.isActive;
    if (q.search?.trim()) where.name = { contains: q.search.trim() };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.am_exercise_categories.count({ where }),
      this.prisma.am_exercise_categories.findMany({
        where,
        skip: q.skip,
        take: q.take,
        orderBy: { name: 'asc' },
      }),
    ]);
    return paginated(
      rows.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        isActive: r.is_active,
        createdAt: r.created_at,
      })),
      total,
      q.page,
      q.pageSize,
    );
  }

  async createExerciseCategory(dto: UpsertExerciseCategoryDto) {
    const row = await this.prisma.am_exercise_categories.create({
      data: { name: dto.name, description: dto.description, is_active: dto.isActive ?? true },
    });
    return { id: row.id, name: row.name, description: row.description, isActive: row.is_active };
  }

  async updateExerciseCategory(id: number, dto: Partial<UpsertExerciseCategoryDto>) {
    await this.requireCategory(id);
    const row = await this.prisma.am_exercise_categories.update({
      where: { id },
      data: { name: dto.name, description: dto.description, is_active: dto.isActive },
    });
    return { id: row.id, name: row.name, description: row.description, isActive: row.is_active };
  }

  async deleteExerciseCategory(id: number) {
    await this.requireCategory(id);
    const count = await this.prisma.am_exercises.count({ where: { category_id: id } });
    if (count > 0) throw new BadRequestException('لا يمكن حذف تصنيف له تمارين');
    await this.prisma.am_exercise_categories.delete({ where: { id } });
    return { ok: true };
  }

  private async requireCategory(id: number) {
    const row = await this.prisma.am_exercise_categories.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('التصنيف غير موجود');
    return row;
  }

  // ── Exercises ──────────────────────────────────────────────────────────────

  async listExercises(q: ListAppItemsDto) {
    const where: Prisma.am_exercisesWhereInput = {};
    if (q.isActive != null) where.is_active = q.isActive;
    if (q.categoryId != null) where.category_id = q.categoryId;
    if (q.search?.trim()) {
      const s = q.search.trim();
      where.OR = [{ name: { contains: s } }, { description: { contains: s } }];
    }
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.am_exercises.count({ where }),
      this.prisma.am_exercises.findMany({
        where,
        skip: q.skip,
        take: q.take,
        orderBy: { name: 'asc' },
        include: { category: { select: { id: true, name: true } } },
      }),
    ]);
    return paginated(
      rows.map((r) => ({
        id: r.id,
        name: r.name,
        categoryId: r.category_id,
        categoryName: r.category.name,
        description: r.description,
        instructions: r.instructions,
        duration: r.duration,
        difficulty: r.difficulty,
        imageUrl: this.imgUrl(r.image_url),
        isActive: r.is_active,
        createdAt: r.created_at,
      })),
      total,
      q.page,
      q.pageSize,
    );
  }

  async createExercise(dto: UpsertExerciseDto) {
    await this.requireCategory(dto.categoryId);
    const row = await this.prisma.am_exercises.create({
      data: {
        name: dto.name,
        category_id: dto.categoryId,
        description: dto.description,
        instructions: dto.instructions,
        duration: dto.duration,
        difficulty: dto.difficulty,
        image_url: dto.imageUrl,
        is_active: dto.isActive ?? true,
      },
    });
    return this.mapExercise(row);
  }

  async updateExercise(id: number, dto: Partial<UpsertExerciseDto>) {
    await this.requireExercise(id);
    if (dto.categoryId != null) await this.requireCategory(dto.categoryId);
    const row = await this.prisma.am_exercises.update({
      where: { id },
      data: {
        name: dto.name,
        category_id: dto.categoryId,
        description: dto.description,
        instructions: dto.instructions,
        duration: dto.duration,
        difficulty: dto.difficulty,
        image_url: dto.imageUrl,
        is_active: dto.isActive,
      },
    });
    return this.mapExercise(row);
  }

  async deleteExercise(id: number) {
    await this.requireExercise(id);
    await this.prisma.am_exercises.delete({ where: { id } });
    return { ok: true };
  }

  private async mapExercise(row: {
    id: number;
    name: string;
    category_id: number;
    description: string | null;
    instructions: string | null;
    duration: number | null;
    difficulty: string | null;
    image_url: string | null;
    is_active: boolean;
  }) {
    const cat = await this.prisma.am_exercise_categories.findUnique({ where: { id: row.category_id } });
    return {
      id: row.id,
      name: row.name,
      categoryId: row.category_id,
      categoryName: cat?.name ?? null,
      description: row.description,
      instructions: row.instructions,
      duration: row.duration,
      difficulty: row.difficulty,
      imageUrl: this.imgUrl(row.image_url),
      isActive: row.is_active,
    };
  }

  private async requireExercise(id: number) {
    const row = await this.prisma.am_exercises.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('التمرين غير موجود');
    return row;
  }

  // ── News ───────────────────────────────────────────────────────────────────

  async listNews(q: ListAppItemsDto) {
    const where: Prisma.am_newsWhereInput = {};
    if (q.isPublished != null) where.is_published = q.isPublished;
    if (q.search?.trim()) {
      const s = q.search.trim();
      where.OR = [{ title: { contains: s } }, { content: { contains: s } }];
    }
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.am_news.count({ where }),
      this.prisma.am_news.findMany({ where, skip: q.skip, take: q.take, orderBy: { created_at: 'desc' } }),
    ]);
    return paginated(rows.map((r) => this.mapNews(r)), total, q.page, q.pageSize);
  }

  async createNews(dto: UpsertNewsDto) {
    const row = await this.prisma.am_news.create({ data: this.newsData(dto) });
    return this.mapNews(row);
  }

  async updateNews(id: number, dto: Partial<UpsertNewsDto>) {
    await this.requireNews(id);
    const row = await this.prisma.am_news.update({
      where: { id },
      data: {
        title: dto.title,
        content: dto.content,
        news_type: dto.newsType,
        publish_date: dto.publishDate,
        image_url: dto.imageUrl,
        is_published: dto.isPublished,
      },
    });
    return this.mapNews(row);
  }

  async deleteNews(id: number) {
    await this.requireNews(id);
    await this.prisma.am_news.delete({ where: { id } });
    return { ok: true };
  }

  private newsData(dto: Partial<UpsertNewsDto>): Prisma.am_newsCreateInput {
    if (!dto.title || !dto.content || !dto.newsType) throw new BadRequestException('العنوان والمحتوى ونوع الخبر مطلوبان');
    return {
      title: dto.title,
      content: dto.content,
      news_type: dto.newsType,
      publish_date: dto.publishDate,
      image_url: dto.imageUrl,
      is_published: dto.isPublished ?? false,
    };
  }

  private mapNews(row: {
    id: number;
    title: string;
    content: string;
    news_type: AmNewsType;
    publish_date: string | null;
    image_url: string | null;
    is_published: boolean;
    created_at: Date;
  }) {
    return {
      id: row.id,
      title: row.title,
      content: row.content,
      newsType: row.news_type,
      publishDate: row.publish_date,
      imageUrl: this.imgUrl(row.image_url),
      isPublished: row.is_published,
      createdAt: row.created_at,
    };
  }

  private async requireNews(id: number) {
    const row = await this.prisma.am_news.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('الخبر غير موجود');
    return row;
  }

  // ── Ads ────────────────────────────────────────────────────────────────────

  async listAds(q: ListAppItemsDto) {
    const where: Prisma.am_adsWhereInput = {};
    if (q.isActive != null) where.is_active = q.isActive;
    if (q.search?.trim()) {
      const s = q.search.trim();
      where.OR = [{ title: { contains: s } }, { description: { contains: s } }];
    }
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.am_ads.count({ where }),
      this.prisma.am_ads.findMany({ where, skip: q.skip, take: q.take, orderBy: { created_at: 'desc' } }),
    ]);
    return paginated(rows.map((r) => this.mapAd(r)), total, q.page, q.pageSize);
  }

  async createAd(dto: UpsertAdDto) {
    const row = await this.prisma.am_ads.create({ data: this.adData(dto) });
    return this.mapAd(row);
  }

  async updateAd(id: number, dto: Partial<UpsertAdDto>) {
    await this.requireAd(id);
    const row = await this.prisma.am_ads.update({
      where: { id },
      data: {
        title: dto.title,
        description: dto.description,
        image_url: dto.imageUrl,
        link_url: dto.linkUrl,
        start_date: dto.startDate,
        end_date: dto.endDate,
        is_active: dto.isActive,
      },
    });
    return this.mapAd(row);
  }

  async deleteAd(id: number) {
    await this.requireAd(id);
    await this.prisma.am_ads.delete({ where: { id } });
    return { ok: true };
  }

  private adData(dto: Partial<UpsertAdDto>): Prisma.am_adsCreateInput {
    if (!dto.title) throw new BadRequestException('العنوان مطلوب');
    if (dto.startDate && dto.endDate) {
      assertDateOrder(dto.startDate, dto.endDate, 'تاريخ نهاية الإعلان يجب أن يكون بعد تاريخ البداية');
    }
    return {
      title: dto.title,
      description: dto.description,
      image_url: dto.imageUrl,
      link_url: dto.linkUrl,
      start_date: dto.startDate,
      end_date: dto.endDate,
      is_active: dto.isActive ?? false,
    };
  }

  private mapAd(row: {
    id: number;
    title: string;
    description: string | null;
    image_url: string | null;
    link_url: string | null;
    start_date: string | null;
    end_date: string | null;
    is_active: boolean;
    created_at: Date;
  }) {
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      imageUrl: this.imgUrl(row.image_url),
      linkUrl: row.link_url,
      startDate: row.start_date,
      endDate: row.end_date,
      isActive: row.is_active,
      createdAt: row.created_at,
    };
  }

  private async requireAd(id: number) {
    const row = await this.prisma.am_ads.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('الإعلان غير موجود');
    return row;
  }

  // ── Member notifications (اشعارات الأعضاء) ───────────────────────────────────

  async listMemberNotifications(q: ListMemberNotificationsDto) {
    const where: Prisma.am_member_notificationsWhereInput = {};
    if (q.memberId != null) where.member_id = q.memberId;
    if (q.branchId != null) where.branch_id = q.branchId;
    if (q.type?.trim()) where.type = q.type.trim();

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.am_member_notifications.count({ where }),
      this.prisma.am_member_notifications.findMany({
        where,
        skip: q.skip,
        take: q.take,
        orderBy: { created_at: 'desc' },
      }),
    ]);
    return paginated(rows.map((r) => this.mapMemberNotification(r)), total, q.page, q.pageSize);
  }

  /**
   * Push a notification to one member (`memberId`) or broadcast to all active members
   * (`broadcast: true`, optionally scoped to `branchId`). Broadcasts fan out to one row
   * per recipient so read state stays per-member.
   */
  async createMemberNotification(dto: CreateMemberNotificationDto, createdBy?: number) {
    if (!dto.title?.trim() || !dto.body?.trim()) {
      throw new BadRequestException('العنوان والنص مطلوبان');
    }
    const base = {
      title: dto.title.trim(),
      body: dto.body.trim(),
      type: dto.type?.trim() || 'general',
      data: dto.data ?? null,
      image_url: dto.imageUrl ?? null,
      created_by: createdBy ?? null,
    };

    if (dto.memberId != null) {
      const member = await this.prisma.club_members.findFirst({
        where: { id: dto.memberId, is_deleted: false },
        select: { id: true, branch_id: true },
      });
      if (!member) throw new NotFoundException('العضو غير موجود');
      const row = await this.prisma.am_member_notifications.create({
        data: { ...base, member_id: member.id, branch_id: dto.branchId ?? member.branch_id },
      });
      return { sent: 1, notification: this.mapMemberNotification(row) };
    }

    if (dto.broadcast) {
      const members = await this.prisma.club_members.findMany({
        where: {
          is_deleted: false,
          is_active: true,
          ...(dto.branchId != null ? { branch_id: dto.branchId } : {}),
        },
        select: { id: true, branch_id: true },
      });
      if (members.length === 0) return { sent: 0 };
      const res = await this.prisma.am_member_notifications.createMany({
        data: members.map((m) => ({ ...base, member_id: m.id, branch_id: m.branch_id })),
      });
      return { sent: res.count };
    }

    throw new BadRequestException('حدّد memberId لعضو واحد أو broadcast=true للإرسال للجميع');
  }

  async deleteMemberNotification(id: number) {
    const row = await this.prisma.am_member_notifications.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('الإشعار غير موجود');
    await this.prisma.am_member_notifications.delete({ where: { id } });
    return { ok: true };
  }

  private mapMemberNotification(row: {
    id: number;
    member_id: number;
    branch_id: number | null;
    title: string;
    body: string;
    type: string;
    data: string | null;
    image_url: string | null;
    is_read: boolean;
    read_at: Date | null;
    created_at: Date;
  }) {
    return {
      id: row.id,
      memberId: row.member_id,
      branchId: row.branch_id,
      title: row.title,
      body: row.body,
      type: row.type,
      data: row.data,
      imageUrl: this.imgUrl(row.image_url),
      isRead: row.is_read,
      readAt: row.read_at,
      createdAt: row.created_at,
    };
  }
}
