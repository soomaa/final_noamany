import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { paginated } from '../../common/dto/list-result';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class SiteVisitsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(q: PaginationDto) {
    const where: Prisma.tbl_sitesWhereInput = {};
    if (q.search?.trim()) {
      const s = q.search.trim();
      where.OR = [{ name: { contains: s } }, { site_name: { contains: s } }];
    }
    const [rows, total] = await Promise.all([
      this.prisma.tbl_sites.findMany({ where, orderBy: { id: 'asc' }, skip: q.skip, take: q.take }),
      this.prisma.tbl_sites.count({ where }),
    ]);
    const data = rows.map((r) => ({
      id: r.id,
      title: r.name,
      employeeName: r.site_name ?? '',
      createdAt: r.date_ar,
      lat: r.s_lat,
      long: r.s_long,
      radius: r.radius,
    }));
    return paginated(data, total, q.page, q.pageSize);
  }

  async listRecords(siteId: number) {
    await this.findOrThrow(siteId);
    return this.prisma.tbl_mohmat_3mal.findMany({
      where: { site_id: siteId },
      orderBy: { id: 'desc' },
    });
  }

  async create(body: { name: string; lat: number; long: number; radius?: number; siteName?: string }, publisherId?: number) {
    const row = await this.prisma.tbl_sites.create({
      data: {
        name: body.name,
        s_lat: body.lat,
        s_long: body.long,
        radius: body.radius ?? 100,
        site_name: body.siteName ?? null,
        date_ar: new Date().toISOString().slice(0, 10),
        publisher: publisherId ?? 0,
      },
    });
    return { id: row.id };
  }

  async update(
    id: number,
    body: { name?: string; lat?: number; long?: number; radius?: number; siteName?: string },
    publisherId?: number,
  ) {
    await this.findOrThrow(id);
    await this.prisma.tbl_sites.update({
      where: { id },
      data: {
        ...(body.name != null ? { name: body.name } : {}),
        ...(body.lat != null ? { s_lat: body.lat } : {}),
        ...(body.long != null ? { s_long: body.long } : {}),
        ...(body.radius != null ? { radius: body.radius } : {}),
        ...(body.siteName != null ? { site_name: body.siteName } : {}),
        date_ar: new Date().toISOString().slice(0, 10),
        ...(publisherId != null ? { publisher: publisherId } : {}),
      },
    });
    return { id };
  }

  async remove(id: number) {
    await this.findOrThrow(id);
    const visitCount = await this.prisma.tbl_mohmat_3mal.count({ where: { site_id: id } });
    if (visitCount > 0) {
      throw new BadRequestException(
        `لا يمكن حذف الموقع — يوجد ${visitCount} سجل(ات) مهمة ميدانية مرتبطة`,
      );
    }
    await this.prisma.tbl_sites.delete({ where: { id } });
    return { id };
  }

  private async findOrThrow(id: number) {
    const row = await this.prisma.tbl_sites.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('الموقع غير موجود');
    return row;
  }
}
