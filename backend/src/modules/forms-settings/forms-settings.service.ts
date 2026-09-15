import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { paginated } from '../../common/dto/list-result';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { ListQueryDto } from '../../common/dto/list-query.dto';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class FormsSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(q: ListQueryDto) {
    const where: Prisma.hr_forms_settingsWhereInput = {};
    if (q.type != null && q.type !== '') where.type = Number(q.type);
    if (q.search?.trim()) {
      where.title_setting = { contains: q.search.trim() };
    }
    const [rows, total] = await Promise.all([
      this.prisma.hr_forms_settings.findMany({
        where,
        orderBy: [{ type: 'asc' }, { in_order: 'asc' }],
        skip: q.skip,
        take: q.take,
      }),
      this.prisma.hr_forms_settings.count({ where }),
    ]);
    const data = rows.map((r) => ({
      id: r.id_setting,
      title: r.title_setting,
      employeeName: r.type_name,
      createdAt: '',
      type: r.type,
      typeName: r.type_name,
      maxDegree: r.max_degree,
      inOrder: r.in_order,
    }));
    return paginated(data, total, q.page, q.pageSize);
  }

  async create(body: { title: string; type: number; typeName?: string; maxDegree?: string; inOrder?: number }) {
    const row = await this.prisma.hr_forms_settings.create({
      data: {
        title_setting: body.title,
        type: body.type,
        type_name: body.typeName ?? `نوع ${body.type}`,
        max_degree: body.maxDegree ?? '0',
        in_order: body.inOrder ?? 0,
      },
    });
    return { id: row.id_setting };
  }

  async update(id: number, body: { title?: string; maxDegree?: string; inOrder?: number }) {
    await this.findOrThrow(id);
    await this.prisma.hr_forms_settings.update({
      where: { id_setting: id },
      data: {
        ...(body.title != null ? { title_setting: body.title } : {}),
        ...(body.maxDegree != null ? { max_degree: body.maxDegree } : {}),
        ...(body.inOrder != null ? { in_order: body.inOrder } : {}),
      },
    });
    return { id };
  }

  async remove(id: number) {
    await this.findOrThrow(id);
    await this.prisma.hr_forms_settings.delete({ where: { id_setting: id } });
    return { id };
  }

  private async findOrThrow(id: number) {
    const row = await this.prisma.hr_forms_settings.findUnique({ where: { id_setting: id } });
    if (!row) throw new NotFoundException('العنصر غير موجود');
    return row;
  }
}
