import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { UpsertClubEventCategoryDto } from './dto/upsert-club-event-category.dto';

@Injectable()
export class ClubEventCategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  private map(row: {
    id: number;
    name_ar: string;
    name_en: string | null;
    kind: string;
    color: string | null;
    icon: string | null;
    show_in_app: boolean;
    requires_approval: boolean;
    is_active: boolean;
    created_at: Date;
    updated_at: Date;
  }) {
    return {
      id: row.id,
      nameAr: row.name_ar,
      nameEn: row.name_en,
      kind: row.kind,
      color: row.color,
      icon: row.icon,
      showInApp: row.show_in_app,
      requiresApproval: row.requires_approval,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async list(activeOnly?: boolean) {
    const rows = await this.prisma.club_event_categories.findMany({
      where: activeOnly ? { is_active: true } : undefined,
      orderBy: { id: 'asc' },
    });
    return rows.map((r) => this.map(r));
  }

  async findOne(id: number) {
    const row = await this.prisma.club_event_categories.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('التصنيف غير موجود');
    return this.map(row);
  }

  async create(dto: UpsertClubEventCategoryDto) {
    if (!dto.nameAr || !dto.kind) {
      throw new BadRequestException('الحقول المطلوبة: الاسم بالعربية، النوع');
    }
    const row = await this.prisma.club_event_categories.create({
      data: {
        name_ar: dto.nameAr,
        name_en: dto.nameEn ?? null,
        kind: dto.kind as never,
        color: dto.color ?? null,
        icon: dto.icon ?? null,
        show_in_app: dto.showInApp ?? true,
        requires_approval: dto.requiresApproval ?? false,
        is_active: dto.isActive ?? true,
      },
    });
    return this.map(row);
  }

  async update(id: number, dto: Partial<UpsertClubEventCategoryDto>) {
    const existing = await this.prisma.club_event_categories.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('التصنيف غير موجود');

    const row = await this.prisma.club_event_categories.update({
      where: { id },
      data: {
        ...(dto.nameAr != null ? { name_ar: dto.nameAr } : {}),
        ...(dto.nameEn !== undefined ? { name_en: dto.nameEn } : {}),
        ...(dto.kind != null ? { kind: dto.kind as never } : {}),
        ...(dto.color !== undefined ? { color: dto.color } : {}),
        ...(dto.icon !== undefined ? { icon: dto.icon } : {}),
        ...(dto.showInApp !== undefined ? { show_in_app: dto.showInApp } : {}),
        ...(dto.requiresApproval !== undefined ? { requires_approval: dto.requiresApproval } : {}),
        ...(dto.isActive !== undefined ? { is_active: dto.isActive } : {}),
      },
    });
    return this.map(row);
  }

  async remove(id: number) {
    const existing = await this.prisma.club_event_categories.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('التصنيف غير موجود');

    const inUse = await this.prisma.club_events.count({ where: { category_id: id, is_deleted: false } });
    if (inUse > 0) {
      throw new BadRequestException('لا يمكن حذف تصنيف مستخدم في فعاليات — قم بإلغاء تفعيله بدلاً من ذلك');
    }

    await this.prisma.club_event_categories.delete({ where: { id } });
    return { success: true };
  }
}
